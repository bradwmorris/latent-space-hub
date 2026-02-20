import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { Node, NodeFilters } from '@/types/database';
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';
import { hasSufficientContent } from '@/services/embedding/constants';
import { DimensionService } from '@/services/database/dimensionService';
import { generateDescription } from '@/services/database/descriptionService';
import { scheduleAutoEdgeCreation } from '@/services/agents/autoEdge';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: NodeFilters = {
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    };

    // Handle dimensions parameter (comma-separated)
    const dimensionsParam = searchParams.get('dimensions');
    if (dimensionsParam) {
      filters.dimensions = dimensionsParam.split(',').map(dim => dim.trim()).filter(Boolean);
    }

    // Handle node_type parameter (accept both 'node_type' and 'type' alias)
    const nodeTypeParam = searchParams.get('node_type') || searchParams.get('type');
    if (nodeTypeParam) {
      filters.node_type = nodeTypeParam as any;
    }

    // Handle sortBy parameter
    const sortByParam = searchParams.get('sortBy');
    if (sortByParam === 'edges' || sortByParam === 'updated') {
      filters.sortBy = sortByParam;
    }

    const nodes = await nodeService.getNodes(filters);

    return NextResponse.json({
      success: true,
      data: nodes,
      count: nodes.length
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch nodes'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.title) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: title is required'
      }, { status: 400 });
    }

    // Accept both "notes" and "content" (backward compat) from request body
    const rawNotes = typeof body.notes === 'string' ? body.notes
                   : typeof body.content === 'string' ? body.content
                   : null;

    // Process provided dimensions first (needed for description generation)
    const providedDimensions = Array.isArray(body.dimensions) ? body.dimensions : [];
    const trimmedProvidedDimensions = providedDimensions
      .map((dim: unknown) => typeof dim === 'string' ? dim.trim() : '')
      .filter(Boolean)
      .slice(0, 8);

    // Generate description with all available context
    let nodeDescription: string | undefined;
    try {
      nodeDescription = await generateDescription({
        title: body.title,
        notes: rawNotes || undefined,
        link: body.link || undefined,
        metadata: body.metadata,
        node_type: body.node_type,
        dimensions: trimmedProvidedDimensions
      });
    } catch (error) {
      console.error('Error generating description:', error);
    }

    // Auto-assign locked dimensions + keyword dimensions for all new nodes
    const { locked, keywords } = await DimensionService.assignDimensions({
      title: body.title,
      notes: rawNotes || undefined,
      link: body.link,
      description: nodeDescription
    });

    // Ensure keyword dimensions exist in the database (create if new)
    for (const keyword of keywords) {
      await DimensionService.ensureKeywordDimension(keyword);
    }

    // Combine provided, locked, and keyword dimensions, remove duplicates
    const finalDimensions = [...new Set([...trimmedProvidedDimensions, ...locked, ...keywords])]
      .slice(0, 8);
    const rawChunk = typeof body.chunk === 'string' ? body.chunk : null;
    let chunkToStore = rawChunk;
    let chunkStatus: Node['chunk_status'];

    if (chunkToStore && chunkToStore.trim().length > 0) {
      chunkStatus = 'not_chunked';
    } else if (!chunkToStore && hasSufficientContent(rawNotes)) {
      chunkToStore = rawNotes;
      chunkStatus = 'not_chunked';
    }

    const node = await nodeService.createNode({
      title: body.title,
      description: nodeDescription,
      notes: rawNotes ?? undefined,
      link: body.link,
      node_type: body.node_type,
      event_date: body.event_date,
      dimensions: finalDimensions,
      chunk: chunkToStore ?? undefined,
      chunk_status: chunkStatus,
      metadata: body.metadata || {}
    });

    if (chunkStatus === 'not_chunked' && node.id && process.env.DISABLE_EMBEDDINGS !== 'true') {
      autoEmbedQueue.enqueue(node.id, { reason: 'node_created' });
    }

    // Schedule auto-edge creation (fire-and-forget, non-blocking)
    if (node.id) {
      scheduleAutoEdgeCreation(node.id);
    }

    return NextResponse.json({
      success: true,
      data: node,
      message: `Node created successfully with dimensions: ${finalDimensions.join(', ')}`
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating node:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create node'
    }, { status: 500 });
  }
}
