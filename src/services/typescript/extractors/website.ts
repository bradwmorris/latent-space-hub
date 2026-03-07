/**
 * Website content extraction for Latent Space Hub
 * Extracts text content from web pages and returns formatted content
 */

import * as cheerio from 'cheerio';

interface WebsiteMetadata {
  title: string;
  author?: string;
  date?: string;
  description?: string;
  og_image?: string;
  site_name?: string;
  extraction_method?: string;
}

interface ExtractionResult {
  content: string;
  chunk: string;
  metadata: WebsiteMetadata;
  url: string;
}

export class WebsiteExtractor {
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  /**
   * Extract content using Jina.ai Reader API
   * Used as fallback when cheerio fails (JS-rendered sites, Twitter, SPAs)
   * Free tier: 20 requests/minute per IP (no API key needed)
   */
  private async extractWithJina(url: string): Promise<ExtractionResult> {
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: { 'User-Agent': 'LatentSpaceHub/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Jina extraction failed: ${response.status}`);
    }

    const markdown = await response.text();

    // Parse title from first markdown heading or first line
    const titleMatch = markdown.match(/^#\s+(.+)$/m) || markdown.match(/^(.+)$/m);
    const title = titleMatch?.[1]?.trim() || 'Extracted Content';

    // Build metadata
    const metadata: WebsiteMetadata = {
      title,
      extraction_method: 'jina',
    };

    // Format content consistently with cheerio output
    const content = this.formatContent(metadata, markdown);

    return {
      content,
      chunk: markdown,
      metadata,
      url,
    };
  }

  /**
   * Clean extracted content for better readability
   */
  private cleanContent(content: string): string {
    // Remove excessive whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // Remove cookie/privacy policy mentions
    content = content.replace(/cookie\s+policy|privacy\s+policy|terms\s+of\s+service/gi, '');
    
    // Split into paragraphs and clean
    const paragraphs = content
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 20); // Remove very short paragraphs (likely nav/UI)
    
    return paragraphs.join('\n\n');
  }

  /**
   * Extract metadata from HTML
   */
  private extractMetadata($: cheerio.CheerioAPI): WebsiteMetadata {
    const metadata: WebsiteMetadata = {
      title: '',
    };
    
    // Title extraction (priority order)
    metadata.title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      $('h1').first().text() ||
      'Untitled';
    
    // Author extraction
    metadata.author = 
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('.author').first().text() ||
      $('[rel="author"]').first().text() ||
      undefined;
    
    // Date extraction
    metadata.date = 
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publish_date"]').attr('content') ||
      $('time').first().attr('datetime') ||
      $('.date').first().text() ||
      undefined;
    
    // Description
    metadata.description = 
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined;
    
    // Image
    metadata.og_image = 
      $('meta[property="og:image"]').attr('content') ||
      undefined;
    
    // Site name
    metadata.site_name = 
      $('meta[property="og:site_name"]').attr('content') ||
      undefined;
    
    return metadata;
  }

  /**
   * Extract main content from HTML
   */
  private extractMainContent($: cheerio.CheerioAPI): string {
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Remove common navigation and footer elements
    $('nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu, .advertisement').remove();
    
    // Try to find main content areas (in priority order)
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.post',
      '.article-body',
      '.entry-content',
      '#content',
      '.container',
      'body',
    ];
    
    let mainContent = '';
    
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        // Extract text from paragraphs, headings, lists
        const textElements = element.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th');
        
        if (textElements.length > 0) {
          const texts: string[] = [];
          textElements.each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 0) {
              texts.push(text);
            }
          });
          
          if (texts.length > 0) {
            mainContent = texts.join('\n\n');
            break;
          }
        }
      }
    }
    
    // Fallback to all text if no main content found
    if (!mainContent) {
      mainContent = $('body').text();
    }
    
    return this.cleanContent(mainContent);
  }

  /**
   * Format content for node creation
   */
  private formatContent(metadata: WebsiteMetadata, mainContent: string): string {
    const sections: string[] = [];
    
    // Add metadata section
    sections.push('## Article Information');
    sections.push(`**Title:** ${metadata.title}`);
    
    if (metadata.author) {
      sections.push(`**Author:** ${metadata.author}`);
    }
    
    if (metadata.date) {
      sections.push(`**Date:** ${metadata.date}`);
    }
    
    if (metadata.site_name) {
      sections.push(`**Source:** ${metadata.site_name}`);
    }
    
    if (metadata.description) {
      sections.push(`**Description:** ${metadata.description}`);
    }
    
    sections.push('');
    
    // Add main content
    sections.push('## Content');
    sections.push(mainContent);
    
    return sections.join('\n');
  }

  /**
   * Extract content using cheerio (static HTML parser)
   * Fast, free, no external calls - but fails on JS-rendered sites
   */
  private async extractWithCheerio(url: string): Promise<ExtractionResult> {
    const response = await fetch(url, {
      headers: this.headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const metadata = this.extractMetadata($);
    metadata.extraction_method = 'cheerio';
    const mainContent = this.extractMainContent($);

    const content = this.formatContent(metadata, mainContent);

    return {
      content,
      chunk: mainContent,
      metadata,
      url,
    };
  }

  /**
   * Main extraction method
   * Strategy: Try cheerio first (fast, free), fall back to Jina for JS-rendered sites
   */
  async extract(url: string): Promise<ExtractionResult> {
    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Invalid URL format - must start with http:// or https://');
    }

    // Try cheerio first (fast, no external call)
    try {
      const result = await this.extractWithCheerio(url);

      // If content is substantial, cheerio worked
      if (result.chunk.length > 200) {
        return result;
      }

      console.log('[WebsiteExtractor] Cheerio extraction too short, trying Jina...');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - website took too long to respond');
      }
      console.log('[WebsiteExtractor] Cheerio failed, trying Jina...', error.message);
    }

    // Fallback to Jina for JS-rendered sites
    try {
      return await this.extractWithJina(url);
    } catch (jinaError: any) {
      throw new Error(`Extraction failed: ${jinaError.message}`);
    }
  }
}

/**
 * Standalone extraction function for direct use
 */
export async function extractWebsite(url: string): Promise<ExtractionResult> {
  const extractor = new WebsiteExtractor();
  return extractor.extract(url);
}

/**
 * CLI interface for direct execution
 */
export async function runCLI(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error('Usage: website-extract <url>');
    process.exit(1);
  }
  
  const url = args[0];
  
  try {
    const result = await extractWebsite(url);
    // Output as JSON for compatibility with existing tools
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly (for testing)
if (require.main === module) {
  runCLI(process.argv.slice(2)).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
