/**
 * YouTube content extraction for RA-H knowledge management system
 * Uses innertube-based transcript extraction via youtube-transcript-plus
 * Falls back to the legacy npm extractor if captions cannot be retrieved
 */
import {
  fetchTranscript as fetchTranscriptPlus,
  YoutubeTranscriptNotAvailableLanguageError,
} from 'youtube-transcript-plus';
import { extractYouTube as extractYouTubeNpm } from './youtube-npm';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function browserFetch(params: { url: string; method?: string; body?: string; headers?: Record<string, string> }): Promise<Response> {
  return fetch(params.url, {
    method: params.method || 'GET',
    body: params.body,
    headers: {
      ...params.headers,
      'User-Agent': BROWSER_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });
}

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface YouTubeMetadata {
  video_id: string;
  video_url: string;
  video_title: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url: string;
  source_type: string;
  transcript_length: number;
  total_segments: number;
  content_format: string;
  language?: string;
  provider: string;
  extraction_method: string;
}

interface ExtractionResult {
  success: boolean;
  content: string;
  chunk: string;
  metadata: YouTubeMetadata;
  error?: string;
}

export class YouTubeExtractor {
  private decodeHtmlEntities(input: string): string {
    if (!input) {
      return '';
    }

    let result = input.replace(/&amp;/g, '&');
    result = result.replace(/&#(\d+);/g, (_match, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isNaN(code) ? _match : String.fromCharCode(code);
    });
    result = result
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    return result;
  }

  private formatSegments(segments: TranscriptSegment[]): string {
    return segments
      .map((segment) => {
        const startTime = Number.isFinite(segment.start) ? segment.start : 0;
        return `[${startTime.toFixed(1)}s] ${segment.text}`;
      })
      .join('\n');
  }

  private extractVideoId(url: string): string | null {
    if (!url) return null;

    if (url.includes('youtu.be')) {
      return url.split('/').pop()?.split('?')[0] || null;
    } else if (url.includes('youtube.com/watch')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      return urlParams.get('v');
    } else if (url.includes('youtube.com/live')) {
      return url.split('/live/')[1]?.split('?')[0] || null;
    } else if (url.includes('youtube.com/embed')) {
      return url.split('/embed/')[1]?.split('?')[0] || null;
    } else if (url.includes('youtube.com/v')) {
      return url.split('/v/')[1]?.split('?')[0] || null;
    }

    return null;
  }

  private async getVideoMetadata(url: string): Promise<{ title: string; author_name: string; author_url: string; thumbnail_url: string }> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oembedUrl, {
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const data = await response.json();
        return {
          title: data.title || 'YouTube Video',
          author_name: data.author_name || 'Unknown Channel',
          author_url: data.author_url || '',
          thumbnail_url: data.thumbnail_url || ''
        };
      }
    } catch (error) {
      console.error('oEmbed extraction failed:', error);
    }

    const videoId = this.extractVideoId(url);
    return {
      title: `YouTube Video ${videoId || 'Unknown'}`,
      author_name: 'Unknown Channel',
      author_url: '',
      thumbnail_url: ''
    };
  }

  private async fetchPrimaryTranscript(url: string): Promise<{
    transcript: string;
    segments: TranscriptSegment[];
    language?: string;
    extractionMethod: string;
  }> {
    const attempts: Array<{ lang?: string; label: string }> = [
      { lang: 'en', label: 'typescript_youtube_transcript_plus_en' },
      { label: 'typescript_youtube_transcript_plus' },
    ];

    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const config = {
          ...(attempt.lang ? { lang: attempt.lang } : {}),
          userAgent: BROWSER_USER_AGENT,
          videoFetch: browserFetch,
          playerFetch: browserFetch,
          transcriptFetch: browserFetch,
        };
        const entries = await fetchTranscriptPlus(url, config);
        const language = entries.find((entry) => entry.lang)?.lang;

        const segments = entries
          .map((entry) => ({
            text: this.decodeHtmlEntities(entry.text ?? '').trim(),
            start: Number(entry.offset ?? 0),
            duration: Number(entry.duration ?? 0),
          }))
          .filter((segment) => segment.text.length > 0);

        if (segments.length === 0) {
          throw new Error('Transcript returned no segments');
        }

        const transcript = this.formatSegments(segments);

        return {
          transcript,
          segments,
          language,
          extractionMethod: attempt.label,
        };
      } catch (error) {
        lastError = error;
        if (attempt.lang && error instanceof YoutubeTranscriptNotAvailableLanguageError) {
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to fetch transcript');
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  async extract(url: string): Promise<ExtractionResult> {
    try {
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        throw new Error('Invalid YouTube URL');
      }

      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }

      const { transcript, segments, language, extractionMethod } = await this.fetchPrimaryTranscript(url);
      const videoMetadata = await this.getVideoMetadata(url);

      const metadata: YouTubeMetadata = {
        video_id: videoId,
        video_url: url,
        video_title: videoMetadata.title,
        channel_name: videoMetadata.author_name,
        channel_url: videoMetadata.author_url,
        thumbnail_url: videoMetadata.thumbnail_url,
        source_type: 'youtube_transcript',
        transcript_length: transcript.length,
        total_segments: segments.length,
        content_format: 'timestamped_transcript',
        language: language || 'unknown',
        provider: 'YouTube',
        extraction_method: extractionMethod,
      };

      return {
        success: true,
        content: transcript,
        chunk: transcript,
        metadata,
      };
    } catch (error: unknown) {
      try {
        return await this.runNpmFallback(url);
      } catch (fallbackError: unknown) {
        return {
          success: false,
          content: '',
          chunk: '',
          metadata: {} as YouTubeMetadata,
          error: `${this.formatErrorMessage(error)}; fallback error: ${this.formatErrorMessage(fallbackError)}`,
        };
      }
    }
  }

  private async runNpmFallback(url: string): Promise<ExtractionResult> {
    console.warn('Primary transcript extraction failed; falling back to legacy youtube-transcript package');
    const fallback = await extractYouTubeNpm(url);
    return {
      success: fallback.success,
      content: fallback.content,
      chunk: fallback.chunk,
      metadata: fallback.metadata as YouTubeMetadata,
      error: fallback.error,
    };
  }
}

export async function main(url: string): Promise<ExtractionResult> {
  const extractor = new YouTubeExtractor();
  return extractor.extract(url);
}

export async function extractYouTube(url: string): Promise<ExtractionResult> {
  const extractor = new YouTubeExtractor();
  return extractor.extract(url);
}

export async function runCLI(): Promise<void> {
  if (process.argv.length !== 3) {
    console.log(JSON.stringify({
      success: false,
      error: "Usage: node youtube.js <youtube_url>"
    }));
    process.exit(1);
  }

  const url = process.argv[2];
  const result = await main(url);
  console.log(JSON.stringify(result));

  if (!result.success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCLI().catch(error => {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  });
}