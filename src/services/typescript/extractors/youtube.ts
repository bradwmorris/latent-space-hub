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

const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

/**
 * Direct innertube transcript fetcher — bypasses watch page entirely.
 * Tries multiple client contexts (WEB, ANDROID, IOS) with known API keys
 * to maximize success from cloud/serverless environments.
 */
async function fetchTranscriptDirect(videoId: string, lang?: string): Promise<{
  segments: Array<{ text: string; start: number; duration: number }>;
  language: string;
}> {
  const clients = [
    {
      key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      name: 'WEB',
      version: '2.20241120.01.00',
      ua: BROWSER_USER_AGENT,
    },
    {
      key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      name: 'ANDROID',
      version: '20.10.38',
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    },
    {
      key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj7m9Y18',
      name: 'IOS',
      version: '20.10.4',
      ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X)',
    },
  ];

  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const playerRes = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${client.key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': client.ua,
          },
          body: JSON.stringify({
            context: {
              client: { clientName: client.name, clientVersion: client.version },
            },
            videoId,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!playerRes.ok) continue;

      const playerJson = await playerRes.json();
      const tracklist =
        playerJson?.captions?.playerCaptionsTracklistRenderer ??
        playerJson?.playerCaptionsTracklistRenderer;
      const tracks = tracklist?.captionTracks;

      if (!Array.isArray(tracks) || tracks.length === 0) continue;

      const selectedTrack = lang
        ? tracks.find((t: { languageCode: string }) => t.languageCode === lang) ?? tracks[0]
        : tracks[0];

      const transcriptUrl: string = selectedTrack.baseUrl || selectedTrack.url;
      if (!transcriptUrl) continue;

      const transcriptRes = await fetch(transcriptUrl, {
        headers: { 'User-Agent': client.ua },
        signal: AbortSignal.timeout(15000),
      });

      if (!transcriptRes.ok) continue;

      const xml = await transcriptRes.text();
      const segments: Array<{ text: string; start: number; duration: number }> = [];
      let match: RegExpExecArray | null;
      const re = new RegExp(RE_XML_TRANSCRIPT.source, 'g');
      while ((match = re.exec(xml)) !== null) {
        segments.push({
          text: match[3],
          start: parseFloat(match[1]),
          duration: parseFloat(match[2]),
        });
      }

      if (segments.length > 0) {
        console.log(`[youtube] Direct innertube succeeded with ${client.name} client`);
        return { segments, language: selectedTrack.languageCode || lang || 'en' };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[youtube] Direct innertube ${client.name} client failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error('All innertube client contexts failed');
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
    } catch (primaryError: unknown) {
      console.warn('[youtube] Primary extraction failed:', this.formatErrorMessage(primaryError));

      // Fallback 1: legacy npm package
      try {
        const fallback = await extractYouTubeNpm(url);
        if (fallback.success) return fallback as ExtractionResult;
      } catch (npmError: unknown) {
        console.warn('[youtube] npm fallback failed:', this.formatErrorMessage(npmError));
      }

      // Fallback 2: direct innertube call (bypasses watch page, works from cloud IPs)
      try {
        console.warn('[youtube] Attempting direct innertube fallback');
        const videoId = this.extractVideoId(url);
        if (videoId) {
          const { segments: rawSegments, language } = await fetchTranscriptDirect(videoId, 'en');
          const segments = rawSegments
            .map((s) => ({
              text: this.decodeHtmlEntities(s.text).trim(),
              start: s.start,
              duration: s.duration,
            }))
            .filter((s) => s.text.length > 0);

          if (segments.length > 0) {
            const transcript = this.formatSegments(segments);
            const videoMetadata = await this.getVideoMetadata(url);
            return {
              success: true,
              content: transcript,
              chunk: transcript,
              metadata: {
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
                language,
                provider: 'YouTube',
                extraction_method: 'typescript_innertube_direct',
              },
            };
          }
        }
      } catch (directError: unknown) {
        console.warn('[youtube] Direct innertube fallback failed:', this.formatErrorMessage(directError));
      }

      return {
        success: false,
        content: '',
        chunk: '',
        metadata: {} as YouTubeMetadata,
        error: `All extraction methods failed. Primary: ${this.formatErrorMessage(primaryError)}`,
      };
    }
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