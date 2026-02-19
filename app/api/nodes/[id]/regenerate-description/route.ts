import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { generateDescription } from '@/services/database/descriptionService';

export const runtime = 'nodejs';

type NodeMetadata = { source?: string; channel_name?: string; author?: string; site_name?: string; type?: string } & Record<string, unknown>;

function parseMetadata(raw: unknown): NodeMetadata | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as NodeMetadata;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object') {
    return raw as NodeMetadata;
  }
  return undefined;
}

async function enrichYoutubeMetadataIfMissing(link: string, metadata: NodeMetadata | undefined): Promise<NodeMetadata | undefined> {
  const url = link.trim();
  if (!url) return metadata;
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) return metadata;

  const existing = metadata || {};
  const hasCreatorHint = Boolean(
    (typeof existing.author === 'string' && existing.author.trim()) ||
    (typeof existing.channel_name === 'string' && existing.channel_name.trim())
  );
  if (hasCreatorHint) return existing;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return existing;
    const data = await response.json();
    const authorName = typeof data.author_name === 'string' ? data.author_name.trim() : '';
    const providerName = typeof data.provider_name === 'string' ? data.provider_name.trim() : '';
    if (!authorName) return existing;

    return {
      ...existing,
      source: typeof existing.source === 'string' && existing.source.trim().length > 0 ? existing.source : 'youtube',
      channel_name: typeof existing.channel_name === 'string' && existing.channel_name.trim().length > 0 ? existing.channel_name : authorName,
      site_name: typeof existing.site_name === 'string' && existing.site_name.trim().length > 0 ? existing.site_name : (providerName || 'YouTube'),
    };
  } catch {
    return existing;
  }
}

export async function POST(
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

    const parsedMetadata = parseMetadata(node.metadata);
    const enrichedMetadata = node.link
      ? await enrichYoutubeMetadataIfMissing(node.link, parsedMetadata)
      : parsedMetadata;

    // Generate new description using the description service
    const newDescription = await generateDescription({
      title: node.title,
      notes: node.notes || undefined,
      link: node.link || undefined,
      metadata: enrichedMetadata,
      node_type: node.node_type || enrichedMetadata?.type,
      dimensions: node.dimensions || []
    });

    // Update the node with the new description
    const updatedNode = await nodeService.updateNode(nodeId, {
      description: newDescription,
      metadata: enrichedMetadata ?? parsedMetadata ?? node.metadata
    });

    return NextResponse.json({
      success: true,
      node: updatedNode,
      description: newDescription,
      message: 'Description regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating description:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate description'
    }, { status: 500 });
  }
}
