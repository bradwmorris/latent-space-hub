import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';
import { hasSufficientContent } from '@/services/embedding/constants';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = parseInt(id, 10);

    if (isNaN(nodeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid node ID'
      }, { status: 400 });
    }

    const node = await nodeService.getNodeById(nodeId);

    if (!node) {
      return NextResponse.json({
        success: false,
        error: 'Node not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      node: node
    });
  } catch (error) {
    console.error('Error fetching node:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch node'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = parseInt(id, 10);

    if (isNaN(nodeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid node ID'
      }, { status: 400 });
    }

    const body = await request.json();

    const existingNode = await nodeService.getNodeById(nodeId);
    if (!existingNode) {
      return NextResponse.json({
        success: false,
        error: 'Node not found'
      }, { status: 404 });
    }

    // Strip legacy fields
    if (body && Object.prototype.hasOwnProperty.call(body, 'is_pinned')) {
      console.warn(`[nodes/${nodeId}] Ignoring legacy is_pinned payload`);
      delete body.is_pinned;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, 'type')) {
      console.warn(`[nodes/${nodeId}] Ignoring legacy type payload`);
      delete body.type;
    }

    // Backward compat: accept "content" and map to "notes"
    if (body && Object.prototype.hasOwnProperty.call(body, 'content') && !Object.prototype.hasOwnProperty.call(body, 'notes')) {
      body.notes = body.content;
      delete body.content;
    }

    const updates: Record<string, unknown> = { ...body };
    let shouldQueueEmbed = false;

    const incomingChunk = typeof body.chunk === 'string' ? body.chunk : undefined;
    const incomingNotes = typeof body.notes === 'string' ? body.notes : undefined;
    const existingChunk = existingNode.chunk ?? '';

    if (incomingChunk !== undefined) {
      const trimmedIncoming = incomingChunk.trim();
      const trimmedExisting = existingChunk.trim();

      if (!trimmedIncoming) {
        updates.chunk_status = null;
      } else if (trimmedIncoming !== trimmedExisting) {
        updates.chunk_status = 'not_chunked';
        shouldQueueEmbed = hasSufficientContent(trimmedIncoming);
      } else {
        delete updates.chunk_status;
      }
    } else if (!existingChunk.trim() && hasSufficientContent(incomingNotes)) {
      updates.chunk = incomingNotes;
      updates.chunk_status = 'not_chunked';
      shouldQueueEmbed = true;
    }

    const node = await nodeService.updateNode(nodeId, updates);

    if (shouldQueueEmbed) {
      autoEmbedQueue.enqueue(nodeId, { reason: 'node_updated' });
    }

    return NextResponse.json({
      success: true,
      node: node,
      message: `Node updated successfully`
    });
  } catch (error) {
    console.error('Error updating node:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update node'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = parseInt(id, 10);

    if (isNaN(nodeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid node ID'
      }, { status: 400 });
    }

    await nodeService.deleteNode(nodeId);

    return NextResponse.json({
      success: true,
      message: `Node ${nodeId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting node:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete node'
    }, { status: 500 });
  }
}
