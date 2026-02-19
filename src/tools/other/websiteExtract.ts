import { tool } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { extractWebsite } from '@/services/typescript/extractors/website';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';

// AI-powered content analysis
async function analyzeContentWithAI(title: string, description: string, contentType: string) {
  try {
    const prompt = `Analyze this ${contentType} content and provide classification:

Title: "${title}"
Description: "${description}"

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "enhancedDescription": "A comprehensive summary of what this content is about (can be several paragraphs, up to ~1500 characters)",
  "tags": ["relevant", "semantic", "tags", "like", "ai", "economics", "research"],
  "reasoning": "Brief explanation of why you chose these categories"
}

Guidelines:
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

    return {
      enhancedDescription: result.enhancedDescription || description,
      tags: Array.isArray(result.tags) ? result.tags : [],
      reasoning: result.reasoning || 'AI analysis completed'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn('Website analysis fallback (using default description):', message);
    return {
      enhancedDescription: description,
      tags: [],
      reasoning: 'Fallback description used'
    };
  }
}

export const websiteExtractTool = tool({
  description: 'Extract website content and metadata into a node with summary, tags, and raw chunk',
  inputSchema: z.object({
    url: z.string().describe('The website URL to add to knowledge base'),
    title: z.string().optional().describe('Custom title (auto-generated if not provided)'),
    dimensions: z.array(z.string()).min(1).max(5).optional().describe('Dimension tags to apply to the created node (locked dimensions first)')
  }),
  execute: async ({ url, title, dimensions }) => {
    try {
      // Validate URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          success: false,
          error: 'Invalid URL format - must start with http:// or https://',
          data: null
        };
      }

      let result: { success: boolean; content?: string; chunk?: string; metadata?: any; error?: string };
      
      try {
        const extractionResult = await extractWebsite(url);
        result = {
          success: true,
          content: extractionResult.content,
          chunk: extractionResult.chunk,
          metadata: {
            title: extractionResult.metadata.title,
            author: extractionResult.metadata.author,
            date: extractionResult.metadata.date,
            description: extractionResult.metadata.description,
            og_image: extractionResult.metadata.og_image,
            site_name: extractionResult.metadata.site_name,
            extraction_method: 'typescript'
          }
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
          error: result.error || 'Failed to extract website content',
          data: null
        };
      }

      console.log('🎯 Website extraction successful, analyzing with AI...');

      // Step 2: AI Analysis for enhanced metadata
      const aiAnalysis = await analyzeContentWithAI(
        result.metadata?.title || `Website: ${new URL(url).hostname}`, 
        result.content?.substring(0, 2000) || 'Website content', 
        'website'
      );

      // Step 3: Create node with extracted content and AI analysis
      const nodeTitle = title || result.metadata?.title || `Website: ${new URL(url).hostname}`;
      const enhancedDescription = aiAnalysis?.enhancedDescription || `Website content from ${new URL(url).hostname}`;
      
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
          content: enhancedDescription,
          link: url,
          dimensions: trimmedDimensions,
          chunk: result.chunk || result.content,
          metadata: {
            source: 'website',
            hostname: new URL(url).hostname,
            author: result.metadata?.author,
            published_date: result.metadata?.published_date || result.metadata?.date,
            content_length: (result.chunk || result.content)?.length,
            extraction_method: result.metadata?.extraction_method || 'python_beautifulsoup',
            ai_analysis: aiAnalysis?.reasoning,
            enhanced_description: enhancedDescription,
            refined_at: new Date().toISOString()
          }
        })
      });

      const createResult = await createResponse.json();

      if (!createResponse.ok) {
        return {
          success: false,
          error: createResult.error || 'Failed to create node',
          data: null
        };
      }

      console.log('🎯 WebsiteExtract completed successfully');

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
        error: error instanceof Error ? error.message : 'Failed to extract website content',
        data: null
      };
    }
  }
});
