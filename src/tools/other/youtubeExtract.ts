import { tool } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { extractYouTube } from '@/services/typescript/extractors/youtube';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';

// Available segments for categorization - match database constraint
const AVAILABLE_SEGMENTS = [
  'inbox', 'parking', 'in progress', 'archive'
];

// AI-powered content analysis
async function analyzeContentWithAI(title: string, description: string, contentType: string) {
  try {
    const prompt = `Analyze this ${contentType} content and provide classification:

Title: "${title}"
Description: "${description}"

Available types: ${AVAILABLE_SEGMENTS.join(', ')}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "enhancedDescription": "A comprehensive summary of what this content is about (can be several paragraphs, up to ~1500 characters)",
  "tags": ["relevant", "semantic", "tags", "like", "ai", "economics", "research"],
  "segments": ["research"],
  "reasoning": "Brief explanation of why you chose these categories"
}

Guidelines:
- Choose 1 segment that best fits the content type
- enhancedDescription should be thorough - cover key points, arguments, and takeaways
- Aim for 3-6 paragraphs or 800-1500 characters - don't artificially truncate
- Include 3-8 relevant semantic tags (not just generic ones)
- For AI/ML content, include tags like: ai, machine-learning, artificial-intelligence, deep-learning
- For economics content, include: economics, finance, markets, policy
- Be specific and insightful
- Return ONLY the JSON object, no other text`;

    const response = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxOutputTokens: 800
    });

    let content = response.text || '{}';
    
    // Clean up the response - remove markdown code blocks if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const result = JSON.parse(content);
    
    // Validate segments are from available list
    const validSegments = result.segments?.filter((seg: string) => 
      AVAILABLE_SEGMENTS.includes(seg)
    ) || [];

    return {
      enhancedDescription: result.enhancedDescription || description,
      tags: Array.isArray(result.tags) ? result.tags : [],
      segments: validSegments,
      reasoning: result.reasoning || 'AI analysis completed'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn('YouTube analysis fallback (using default description):', message);
    return {
      enhancedDescription: description,
      tags: [],
      segments: [],
      reasoning: 'Fallback description used'
    };
  }
}

async function summariseTranscript(title: string, transcript: string): Promise<string | null> {
  if (!transcript || transcript.trim().length === 0) {
    return null;
  }

  // Limit transcript length to keep token costs manageable (approx ≤4k tokens for gpt-4o-mini)
  const MAX_CHARS = 16000;
  let excerpt = transcript.trim();
  if (excerpt.length > MAX_CHARS) {
    const head = excerpt.slice(0, MAX_CHARS / 2);
    const tail = excerpt.slice(-MAX_CHARS / 2);
    excerpt = `${head}\n[...]\n${tail}`;
  }

  const prompt = `You are summarising a long-form recording for a knowledge graph entry. Title: "${title}".

Using the transcript excerpt below, write a concise 3-4 sentence summary covering the main themes, notable claims, and outcomes. If specific terms, frameworks, or memorable lines appear, mention them. Keep the tone factual (no marketing language). If the excerpt appears truncated, note that the summary is based on the portion provided.

Transcript excerpt:
"""
${excerpt}
"""
`;

  try {
    const response = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxOutputTokens: 400
    });
    return response.text?.trim() || null;
  } catch (error) {
    console.warn('Transcript summarisation failed, falling back to AI analysis description:', error);
    return null;
  }
}

export const youtubeExtractTool = tool({
  description: 'Extract a YouTube transcript and metadata, create a node, and return summary details',
  inputSchema: z.object({
    url: z.string().describe('The YouTube video URL to add to knowledge base'),
    title: z.string().optional().describe('Custom title (auto-generated if not provided)'),
    dimensions: z.array(z.string()).min(1).max(5).optional().describe('Dimension tags to apply to the created node (locked dimensions first)')
  }),
  execute: async ({ url, title, dimensions }) => {
    console.log('🎯 YouTubeExtract tool called with URL:', url);
    try {
      // Validate YouTube URL
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        return {
          success: false,
          error: 'Invalid YouTube URL format',
          data: null
        };
      }

      let result: { success: boolean; content?: string; chunk?: string; metadata?: any; error?: string };
      
      console.log('📝 Using TypeScript yt-dlp extractor');
      try {
        const extractionResult = await extractYouTube(url);
        result = {
          success: extractionResult.success,
          content: extractionResult.content,
          chunk: extractionResult.chunk,
          metadata: {
            video_title: extractionResult.metadata.video_title,
            channel_name: extractionResult.metadata.channel_name,
            channel_url: extractionResult.metadata.channel_url,
            thumbnail_url: extractionResult.metadata.thumbnail_url,
            video_id: extractionResult.metadata.video_id,
            transcript_length: extractionResult.metadata.transcript_length,
            total_segments: extractionResult.metadata.total_segments,
            language: extractionResult.metadata.language,
            extraction_method: extractionResult.metadata.extraction_method
          },
          error: extractionResult.error
        };
      } catch (error: any) {
        result = { 
          success: false, 
          error: error.message || 'TypeScript extraction failed' 
        };
      }

      if (!result.success || (!result.content && !result.chunk)) {
        return {
          success: false,
          error: result.error || 'Failed to extract YouTube content',
          data: null
        };
      }

      console.log('🎯 YouTube extraction successful, analyzing with AI...');

      // Step 2: AI Analysis for enhanced metadata
      const aiAnalysis = await analyzeContentWithAI(
        result.metadata?.video_title || 'YouTube Video', 
        `Video by ${result.metadata?.channel_name || 'Unknown Channel'}`, 
        'youtube'
      );

      // Step 3: Create node with extracted content and AI analysis
      const nodeTitle = title || result.metadata?.video_title || `YouTube Video ${url.split('/').pop()?.split('?')[0]}`;
      const transcriptSummary = await summariseTranscript(nodeTitle, result.chunk || result.content || '');
      const content = transcriptSummary || aiAnalysis?.enhancedDescription || `YouTube video by ${result.metadata?.channel_name || 'Unknown Channel'}`;
      
      const suppliedDimensions = Array.isArray(dimensions) ? dimensions : [];
      let trimmedDimensions = suppliedDimensions
        .map(dim => (typeof dim === 'string' ? dim.trim() : ''))
        .filter(Boolean);

      trimmedDimensions = trimmedDimensions.slice(0, 5);

      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nodeTitle,
          notes: content,
          link: url,
          dimensions: trimmedDimensions,
          chunk: result.chunk || result.content,
          metadata: {
            source: 'youtube',
            video_id: result.metadata?.video_id,
            channel_name: result.metadata?.channel_name,
            channel_url: result.metadata?.channel_url,
            thumbnail_url: result.metadata?.thumbnail_url,
            transcript_length: result.metadata?.transcript_length,
            total_segments: result.metadata?.total_segments,
            language: result.metadata?.language,
            extraction_method: result.metadata?.extraction_method,
            ai_analysis: aiAnalysis?.reasoning,
            summary_origin: transcriptSummary ? 'transcript_summary' : 'metadata_description',
            refined_at: new Date().toISOString()
          }
        })
      });

      const createResult = await createResponse.json();

      if (!createResponse.ok) {
        return {
          success: false,
          error: createResult.error || 'Failed to create item',
          data: null
        };
      }

      console.log('🎯 YouTubeExtract completed successfully');

      // Use actual assigned dimensions from API response (includes auto-assigned locked + keywords)
      const actualDimensions: string[] = createResult.data?.dimensions || trimmedDimensions || [];
      const formattedNode = createResult.data?.id
        ? formatNodeForChat({ id: createResult.data.id, title: nodeTitle, dimensions: actualDimensions })
        : nodeTitle;
      const dimsDisplay = actualDimensions.length > 0 ? actualDimensions.join(', ') : 'none';

      return {
        success: true,
        message: `Added ${formattedNode} with dimensions: ${dimsDisplay}`,
        data: {
          nodeId: createResult.data?.id,
          title: nodeTitle,
          contentLength: (result.chunk || result.content || '').length,
          url: url,
          dimensions: actualDimensions
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract YouTube content',
        data: null
      };
    }
  }
});
