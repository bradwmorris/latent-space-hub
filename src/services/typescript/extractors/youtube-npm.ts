/**
 * YouTube content extraction for Latent Space Hub
 * Uses youtube-transcript npm package - more similar to Python youtube-transcript-api
 */

import { YoutubeTranscript } from 'youtube-transcript';

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
  chunk: string;  // Same as content, but tool expects this field name
  metadata: YouTubeMetadata;
  error?: string;
}

export class YouTubeExtractor {
  /**
   * Extract video ID from YouTube URL
   */
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

  /**
   * Get video metadata from YouTube oEmbed API
   */
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
    
    // Fallback metadata
    const videoId = this.extractVideoId(url);
    return {
      title: `YouTube Video ${videoId || 'Unknown'}`,
      author_name: 'Unknown Channel',
      author_url: '',
      thumbnail_url: ''
    };
  }

  /**
   * Get transcript using youtube-transcript npm package (like Python approach)
   */
  private async getTranscript(url: string): Promise<{ transcript: string; segments: TranscriptSegment[]; language?: string }> {
    try {
      // Get transcript using npm package (more similar to Python approach)
      const transcriptData = await YoutubeTranscript.fetchTranscript(url);
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript segments found');
      }
      
      // Convert to our format
      const segments: TranscriptSegment[] = transcriptData.map(item => ({
        text: item.text,
        start: item.offset / 1000, // Convert ms to seconds
        duration: item.duration ? item.duration / 1000 : 0 // Convert ms to seconds
      }));
      
      // Format with timestamps like Python version
      const formattedSegments: string[] = [];
      for (const segment of segments) {
        formattedSegments.push(`[${segment.start.toFixed(1)}s] ${segment.text}`);
      }
      
      const fullTranscript = formattedSegments.join('\n');
      
      return {
        transcript: fullTranscript,
        segments,
        language: 'en'
      };
      
    } catch (error: any) {
      throw new Error(`Failed to extract YouTube transcript: ${error.message}`);
    }
  }

  /**
   * Main extraction method - uses youtube-transcript npm package like Python script uses youtube-transcript-api
   */
  async extract(url: string): Promise<ExtractionResult> {
    try {
      // Validate URL
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        throw new Error('Invalid YouTube URL');
      }
      
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }
      
      // Get video metadata
      const videoMetadata = await this.getVideoMetadata(url);
      
      // Get transcript using npm package (similar to Python approach)
      const { transcript, segments, language } = await this.getTranscript(url);
      
      // Create metadata matching Python version exactly
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
        extraction_method: 'typescript_npm_youtube_transcript'
      };
      
      return {
        success: true,
        content: transcript,
        chunk: transcript,  // Tool expects this field
        metadata
      };
      
    } catch (error: any) {
      return {
        success: false,
        content: '',
        chunk: '',  // Tool expects this field
        metadata: {} as YouTubeMetadata,
        error: error.message
      };
    }
  }
}

/**
 * Main function for command line usage (matching Python interface)
 */
export async function main(url: string): Promise<ExtractionResult> {
  const extractor = new YouTubeExtractor();
  return extractor.extract(url);
}

/**
 * Standalone extraction function for direct use
 */
export async function extractYouTube(url: string): Promise<ExtractionResult> {
  const extractor = new YouTubeExtractor();
  return extractor.extract(url);
}

/**
 * CLI interface for direct execution (matching Python interface)
 */
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

// Run if called directly (for testing)
if (require.main === module) {
  runCLI().catch(error => {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  });
}