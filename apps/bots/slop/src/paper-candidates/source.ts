import type { PaperCandidateDetection } from "./detect";
import { OPENROUTER_API_KEY, SLOP_MODEL, TAVILY_API_KEY } from "../config";
import type { OpenRouterChatResponse } from "../types";

export type PaperCandidateSummary = {
  title: string;
  tldr: string[];
  sources: string[];
  description?: string;
};

const FETCH_TIMEOUT_MS = 8000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, " "));
}

function truncate(text: string, max = 260): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.{40,240}?[.!?])\s/);
  return truncate(match ? match[1] : clean);
}

function textBetween(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : null;
}

function allTextBetween(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
}

function arxivIdFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)arxiv\.org$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "LatentSpaceSlop/1.0 paper-club-candidate",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!/text|html|xml|json/i.test(contentType)) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeArxiv(candidate: PaperCandidateDetection): Promise<PaperCandidateSummary | null> {
  const id = arxivIdFromUrl(candidate.paperUrl);
  if (!id) return null;
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  const xml = await fetchText(apiUrl);
  if (!xml) return null;
  const entry = xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/i)?.[1] || xml;

  const title = textBetween(entry, "title") || candidate.titleHint || candidate.paperUrl;
  const summary = textBetween(entry, "summary");
  const authors = allTextBetween(entry, "name").slice(0, 4);
  const published = textBetween(entry, "published");
  const bullets: string[] = [];
  if (authors.length) {
    bullets.push(`Authors include ${authors.join(", ")}${authors.length === 4 ? ", et al." : ""}.`);
  }
  if (published) {
    bullets.push(`arXiv source was published ${published.slice(0, 10)}.`);
  }
  if (summary) {
    bullets.push(`Abstract: ${firstSentence(summary)}`);
  }

  return {
    title: truncate(title, 180),
    tldr: bullets.length ? bullets.slice(0, 3) : ["Slop found the arXiv record but could not extract enough metadata to summarize safely."],
    sources: [candidate.paperUrl, apiUrl],
    description: summary ? truncate(summary, 500) : undefined,
  };
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return decodeEntities(match[1]);
    }
  }
  return null;
}

function htmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : null;
}

async function summarizeHtml(candidate: PaperCandidateDetection): Promise<PaperCandidateSummary | null> {
  const html = await fetchText(candidate.paperUrl);
  if (!html) return null;
  const title =
    metaContent(html, ["og:title", "twitter:title", "citation_title"]) ||
    htmlTitle(html) ||
    candidate.titleHint ||
    candidate.paperUrl;
  const description =
    metaContent(html, [
      "citation_abstract",
      "description",
      "og:description",
      "twitter:description",
    ]) || "";

  const bullets = description
    ? [`Source description: ${firstSentence(description)}`]
    : ["Slop found the source page but could not verify enough detail to summarize safely."];

  return {
    title: truncate(title, 180),
    tldr: bullets,
    sources: [candidate.paperUrl],
    description: description ? truncate(description, 500) : undefined,
  };
}

type TavilyResult = {
  title: string;
  snippet: string;
  url: string;
};

async function tavilySearch(candidate: PaperCandidateDetection): Promise<TavilyResult[]> {
  if (!TAVILY_API_KEY) return [];
  const query = candidate.titleHint
    ? `${candidate.titleHint} paper ${candidate.paperUrl}`
    : `${candidate.paperUrl} paper summary authors abstract`;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: 5,
      }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: Array<Record<string, unknown>> };
    return (data.results || [])
      .map((result) => ({
        title: String(result.title || "Untitled"),
        snippet: String(result.content || ""),
        url: String(result.url || ""),
      }))
      .filter((result) => result.url || result.snippet)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function parseSummaryLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

async function summarizeWithLlm(
  candidate: PaperCandidateDetection,
  contextSummary: PaperCandidateSummary,
  searchResults: TavilyResult[]
): Promise<PaperCandidateSummary | null> {
  if (!OPENROUTER_API_KEY) return null;
  const searchContext = searchResults
    .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`)
    .join("\n\n");
  const sourceContext = [
    `Candidate URL: ${candidate.paperUrl}`,
    candidate.titleHint ? `Title hint: ${candidate.titleHint}` : "",
    `Extracted title: ${contextSummary.title}`,
    contextSummary.description ? `Extracted description: ${contextSummary.description}` : "",
    contextSummary.tldr.length ? `Extracted facts:\n${contextSummary.tldr.map((line) => `- ${line}`).join("\n")}` : "",
    searchContext ? `Search results:\n${searchContext}` : "",
  ].filter(Boolean).join("\n\n");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SLOP_MODEL,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        {
          role: "system",
          content:
            "You summarize papers for a Discord Paper Club queue. Be concise, factual, and cautious. Use only the supplied context. Return JSON with keys title, summary, bullets. bullets must be 2-4 short strings.",
        },
        {
          role: "user",
          content: sourceContext,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as OpenRouterChatResponse;
  const content = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(content) as { title?: unknown; summary?: unknown; bullets?: unknown };
    const title = typeof parsed.title === "string" && parsed.title.trim()
      ? truncate(parsed.title, 180)
      : contextSummary.title;
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((line) => String(line).trim()).filter(Boolean)
      : parseSummaryLines(summary);
    const tldr = bullets.length ? bullets.slice(0, 4) : contextSummary.tldr;
    return {
      title,
      tldr,
      sources: [...new Set([candidate.paperUrl, ...contextSummary.sources, ...searchResults.map((r) => r.url).filter(Boolean)])].slice(0, 5),
      description: summary ? truncate(summary, 600) : contextSummary.description,
    };
  } catch {
    const lines = parseSummaryLines(content);
    if (!lines.length) return null;
    return {
      title: contextSummary.title,
      tldr: lines,
      sources: [...new Set([candidate.paperUrl, ...contextSummary.sources, ...searchResults.map((r) => r.url).filter(Boolean)])].slice(0, 5),
      description: truncate(content, 600),
    };
  }
}

export async function summarizePaperCandidate(
  candidate: PaperCandidateDetection
): Promise<PaperCandidateSummary> {
  const extracted =
    (await summarizeArxiv(candidate)) ||
    (await summarizeHtml(candidate)) ||
    {
      title: candidate.titleHint || candidate.paperUrl,
      tldr: [
        "Slop could not verify enough from the linked source to summarize safely.",
      ],
      sources: [candidate.sourceUrl],
    };

  const searchResults = await tavilySearch(candidate);
  const llm = await summarizeWithLlm(candidate, extracted, searchResults).catch(() => null);
  if (llm) return llm;

  return extracted;
}
