import { openai as openaiProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface DescriptionInput {
  title: string;
  notes?: string;
  content?: string;
  link?: string;
  metadata?: {
    source?: string;
    channel_name?: string;
    author?: string;
    site_name?: string;
  };
  node_type?: string;
  dimensions?: string[];
}

const MAX_DESCRIPTION_CHARS = 280;
const FORBIDDEN_PHRASES = [
  'discusses',
  'explores',
  'examines',
  'talks about',
  'is about',
  'delves into',
  'emphasizing the need for',
] as const;

const TRANSCRIPT_OPENING_PATTERNS: RegExp[] = [
  /^\[?\d{1,3}(?:\.\d+)?s\]?\s*/i,
  /^\d{1,2}:\d{2}\s*/,
  /^hey everyone\b/i,
  /^welcome (?:back\s+)?to\b/i,
  /^\s*(uh|um)\b/i,
];

const SOURCE_TYPE_LABELS: Record<string, string> = {
  podcast: 'Podcast episode',
  article: 'Article',
  ainews: 'AINews digest',
  workshop: 'Workshop talk',
  'paper-club': 'Paper Club session',
  'builders-club': 'Builders Club session',
  event: 'Event listing',
  entity: 'Entity profile',
  guest: 'Guest profile',
  member: 'Member profile',
};

const FORMAT_OPENERS: Record<string, string> = {
  podcast: 'Podcast episode where',
  article: 'Article arguing',
  ainews: 'AINews digest covering',
  workshop: 'Workshop talk showing',
  'paper-club': 'Paper Club session where',
  'builders-club': 'Builders Club session where',
  event: 'Event listing for',
};

const EXPLICIT_PREFIX_BY_TYPE: Record<string, string> = {
  podcast: 'Podcast episode',
  article: 'Article',
  ainews: 'AINews digest',
  workshop: 'Workshop talk',
  'paper-club': 'Paper Club session',
  'builders-club': 'Builders Club session',
};

const descriptionModel = process.env.OPENAI_DESCRIPTION_MODEL || 'gpt-4.1-mini';

/**
 * Generate a strict 280-character description for a node.
 * Node-level embeddings use title + description, so quality here impacts retrieval quality directly.
 */
export async function generateDescription(input: DescriptionInput): Promise<string> {
  const normalizedTitle = (input.title || '').trim();
  if (!normalizedTitle) {
    return 'Untitled node';
  }

  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackDescription(input);
  }

  try {
    console.log(`[DescriptionService] Generating description for: "${normalizedTitle}"`);

    const firstAttempt = await runGenerationAttempt(input, false);
    if (firstAttempt.reasons.length === 0) {
      console.log(`[DescriptionService] Generated: "${firstAttempt.description}"`);
      return firstAttempt.description;
    }

    console.warn(
      `[DescriptionService] Weak description detected for "${normalizedTitle}"; retrying with stricter prompt. Reasons: ${firstAttempt.reasons.join(', ')}`
    );

    const retryAttempt = await runGenerationAttempt(input, true);
    if (retryAttempt.reasons.length === 0) {
      console.log(`[DescriptionService] Generated after retry: "${retryAttempt.description}"`);
      return retryAttempt.description;
    }

    console.warn(
      `[DescriptionService] Retry still weak for "${normalizedTitle}". Reasons: ${retryAttempt.reasons.join(', ')}. Using deterministic fallback.`
    );

    return buildFallbackDescription(input);
  } catch (error) {
    console.error('[DescriptionService] Error generating description:', error);
    return buildFallbackDescription(input);
  }
}

interface GenerationAttemptResult {
  description: string;
  reasons: string[];
}

async function runGenerationAttempt(input: DescriptionInput, strictRetry: boolean): Promise<GenerationAttemptResult> {
  const prompt = buildDescriptionPrompt(input, strictRetry);

  const response = await generateText({
    model: openaiProvider(descriptionModel),
    prompt,
    maxOutputTokens: 140,
    temperature: 0,
  });

  const description = sanitizeDescription(response.text, input);
  const reasons = getWeakDescriptionReasons(description, input);

  return { description, reasons };
}

function buildDescriptionPrompt(input: DescriptionInput, strictRetry: boolean): string {
  const normalizedSource = (input.metadata?.source || '').toLowerCase();
  const url = typeof input.link === 'string' ? input.link.trim() : '';
  const nodeType = (input.node_type || '').toLowerCase();

  const creatorHint =
    input.metadata?.author?.trim() ||
    input.metadata?.channel_name?.trim() ||
    '';

  const publisherHint = input.metadata?.site_name?.trim() || '';

  const likelyExternal =
    Boolean(url) ||
    normalizedSource.includes('youtube') ||
    normalizedSource.includes('extract') ||
    normalizedSource.includes('paper') ||
    normalizedSource.includes('pdf') ||
    normalizedSource.includes('website');

  const likelyUserAuthored =
    !likelyExternal &&
    (normalizedSource.includes('quick-add-note') ||
      normalizedSource.includes('quick-add-chat') ||
      normalizedSource.includes('note'));

  const lines: string[] = [`Title: ${input.title}`];

  if (nodeType) lines.push(`Node type: ${nodeType}`);
  if (input.link) lines.push(`URL: ${input.link}`);
  if (input.dimensions?.length) lines.push(`Dimensions: ${input.dimensions.join(', ')}`);
  if (input.metadata?.channel_name) lines.push(`Channel: ${input.metadata.channel_name}`);
  if (input.metadata?.author) lines.push(`Author: ${input.metadata.author}`);
  if (input.metadata?.site_name) lines.push(`Site: ${input.metadata.site_name}`);
  if (creatorHint) lines.push(`Creator hint: ${creatorHint}`);
  if (publisherHint) lines.push(`Publisher hint: ${publisherHint}`);
  lines.push(`Likely user-authored: ${likelyUserAuthored ? 'yes' : 'no'}`);

  const contentPreview = (input.content || input.notes || '').slice(0, 1600);
  if (contentPreview) {
    lines.push(`Content preview: ${contentPreview}${(input.content || input.notes || '').length > 1600 ? '...' : ''}`);
  }

  const formatOpeners = selectFormatOpeners(nodeType, likelyUserAuthored);
  const extraRetryBlock = strictRetry
    ? `
RETRY OVERRIDES (MANDATORY):
- If you output any forbidden phrase, the response is invalid.
- If the line equals the title or starts with transcript words/timestamps, the response is invalid.
- Rewrite to concrete claim + why it matters, then stop.
`
    : '';

  return `Write exactly one line (max ${MAX_DESCRIPTION_CHARS} chars) answering: what is this artifact and why does it matter?

FORMAT (must follow):
- Start with one of these openers: ${formatOpeners.join(' | ')}
- State concrete claim/finding/detail, not a generic topic summary.
- End with why it matters in one direct phrase.

FORBIDDEN PHRASES (hard reject): ${FORBIDDEN_PHRASES.join(', ')}

ADDITIONAL RULES:
- Do not start with "Your note" or "This note".
- Do not copy transcript text or timestamps.
- Do not return markdown, bullets, quotes, or labels.
- Return only the description line.${extraRetryBlock}

${lines.join('\n')}`;
}

function selectFormatOpeners(nodeType: string, likelyUserAuthored: boolean): string[] {
  if (likelyUserAuthored) {
    return ['Personal note capturing', 'Idea that', 'Draft outlining'];
  }

  const specific = FORMAT_OPENERS[nodeType];
  if (specific) {
    return [specific, 'Article arguing', 'Podcast episode where'];
  }

  return ['Artifact where', 'Research note showing', 'Analysis arguing'];
}

function sanitizeDescription(rawText: string, input: DescriptionInput): string {
  const collapsed = rawText
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/^[\-•*]\s*/, '');

  if (!collapsed) {
    return buildFallbackDescription(input);
  }

  const noGenericPrefix = collapsed.replace(
    /^(your note|this note)\s*[—:-]\s*/i,
    'Personal note capturing '
  );

  const explicitArtifact = enforceExplicitArtifact(noGenericPrefix, input);
  return truncateDescription(explicitArtifact);
}

function enforceExplicitArtifact(description: string, input: DescriptionInput): string {
  const nodeType = (input.node_type || '').toLowerCase();
  const requiredPrefix = EXPLICIT_PREFIX_BY_TYPE[nodeType];
  if (!requiredPrefix) {
    return description;
  }

  const normalized = description.trim();
  const hasExplicitPrefix = new RegExp(`^${requiredPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(normalized);
  if (hasExplicitPrefix) {
    return normalized;
  }

  const withoutLeadingConnector = normalized
    .replace(/^(idea that|analysis that|artifact where|research note showing|draft outlining)\s+/i, '')
    .replace(/^(this|it)\s+/i, '')
    .trim();

  if (!withoutLeadingConnector) {
    return `${requiredPrefix} covering ${input.title.trim()}`;
  }

  const body = withoutLeadingConnector.charAt(0).toLowerCase() + withoutLeadingConnector.slice(1);
  return `${requiredPrefix} covering ${body}`;
}

function truncateDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_CHARS) {
    return description;
  }

  const trimmed = description.slice(0, MAX_DESCRIPTION_CHARS);
  const lastBoundary = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('; '), trimmed.lastIndexOf(', '));
  if (lastBoundary >= 140) {
    return trimmed.slice(0, lastBoundary + 1).trim();
  }
  return trimmed.trim();
}

export function getWeakDescriptionReasons(description: string, input: DescriptionInput): string[] {
  const reasons: string[] = [];
  const normalized = description.toLowerCase();
  const normalizedTitle = normalizeComparison(input.title);

  for (const phrase of FORBIDDEN_PHRASES) {
    if (normalized.includes(phrase.toLowerCase())) {
      reasons.push(`contains forbidden phrase \"${phrase}\"`);
    }
  }

  if (normalizeComparison(description) === normalizedTitle) {
    reasons.push('matches title');
  }

  if (/^(your note|this note)\b/i.test(description)) {
    reasons.push('generic opener');
  }

  if (TRANSCRIPT_OPENING_PATTERNS.some((pattern) => pattern.test(description))) {
    reasons.push('looks like transcript opener');
  }

  if (description.length > MAX_DESCRIPTION_CHARS) {
    reasons.push(`exceeds ${MAX_DESCRIPTION_CHARS} chars`);
  }

  return reasons;
}

function normalizeComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildFallbackDescription(input: DescriptionInput): string {
  const title = input.title.trim();
  const nodeType = (input.node_type || '').toLowerCase();
  const sourceLabel = SOURCE_TYPE_LABELS[nodeType] || 'Knowledge item';

  return truncateDescription(`${sourceLabel} on "${title.slice(0, 180)}" with key context for the LS Wiki-Base.`);
}

export const descriptionService = {
  generateDescription,
  getWeakDescriptionReasons,
};
