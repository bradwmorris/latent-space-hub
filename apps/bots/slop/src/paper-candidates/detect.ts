type EmbedLike = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
};

export type PaperCandidateDetection = {
  paperUrl: string;
  sourceUrl: string;
  titleHint?: string;
  sourceKind: "paper" | "social" | "web";
};

const SOCIAL_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "bsky.app",
  "www.x.com",
  "www.twitter.com",
  "www.bsky.app",
]);

const PAPER_HOST_PATTERNS = [
  /(^|\.)arxiv\.org$/i,
  /(^|\.)openreview\.net$/i,
  /(^|\.)aclanthology\.org$/i,
  /(^|\.)paperswithcode\.com$/i,
  /(^|\.)semanticscholar\.org$/i,
];

const PAPER_CONTEXT_RE =
  /\b(arxiv|openreview|paper|preprint|technical report|tech report|pdf|abstract|authors?|we introduce|we present|benchmark|eval)\b/i;

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>)\]]+/g) || [];
  return [...new Set(matches.map(cleanUrl).filter(Boolean))];
}

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/g, "");
}

function safeParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isPaperUrl(rawUrl: string): boolean {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;
  if (parsed.pathname.toLowerCase().endsWith(".pdf")) return true;
  if (PAPER_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) return true;
  return false;
}

function isSocialUrl(rawUrl: string): boolean {
  const parsed = safeParseUrl(rawUrl);
  return Boolean(parsed && SOCIAL_HOSTS.has(parsed.hostname.toLowerCase()));
}

function isLikelyTechnicalPage(rawUrl: string, context: string): boolean {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;
  if (!PAPER_CONTEXT_RE.test(context)) return false;
  if (isSocialUrl(rawUrl)) return false;
  return true;
}

export function detectPaperCandidate(input: {
  content: string;
  embeds?: EmbedLike[];
}): PaperCandidateDetection | null {
  const embedText = (input.embeds || [])
    .map((embed) => [embed.title, embed.description, embed.url].filter(Boolean).join(" "))
    .join(" ");
  const combinedText = `${input.content}\n${embedText}`.trim();
  const urls = [
    ...extractUrls(input.content),
    ...(input.embeds || []).flatMap((embed) => extractUrls([embed.url, embed.description].filter(Boolean).join(" "))),
  ];

  const directPaperUrl = urls.find(isPaperUrl);
  if (directPaperUrl) {
    const sourceUrl = urls.find((url) => url !== directPaperUrl && isSocialUrl(url)) || directPaperUrl;
    return {
      paperUrl: directPaperUrl,
      sourceUrl,
      titleHint: (input.embeds || []).find((embed) => embed.url === directPaperUrl)?.title || undefined,
      sourceKind: "paper",
    };
  }

  const socialUrl = urls.find(isSocialUrl);
  if (socialUrl && PAPER_CONTEXT_RE.test(combinedText)) {
    return {
      paperUrl: socialUrl,
      sourceUrl: socialUrl,
      titleHint: (input.embeds || []).find((embed) => embed.url === socialUrl)?.title || undefined,
      sourceKind: "social",
    };
  }

  const technicalUrl = urls.find((url) => isLikelyTechnicalPage(url, combinedText));
  if (technicalUrl) {
    return {
      paperUrl: technicalUrl,
      sourceUrl: technicalUrl,
      titleHint: (input.embeds || []).find((embed) => embed.url === technicalUrl)?.title || undefined,
      sourceKind: "web",
    };
  }

  return null;
}
