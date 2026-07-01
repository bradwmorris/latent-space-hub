import { db } from "../../config";
import * as dbOps from "../../db";
import { splitForDiscord } from "../../discord/format";
import type {
  RuntimeCommandEvent,
  RuntimeCommandTransport,
} from "../runtime/types";

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

export async function handlePapersCommandEvent(
  _event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  const papers = await dbOps.getRecentPaperMentions(db, { limit: 10 });
  if (!papers.length) {
    await transport.editReply("No papers have been added yet.");
    return;
  }

  const lines = papers.map((paper, index) => {
    const suggestedBy = paper.suggested_by_handle ? ` by @${paper.suggested_by_handle}` : "";
    const summary = truncate(paper.summary, 180);
    return `**${index + 1}. [${paper.title}](${paper.paper_url})**${suggestedBy}\n${summary}`;
  });

  const chunks = splitForDiscord(`**Recent papers**\n\n${lines.join("\n\n")}`);
  const [firstChunk, ...remainingChunks] = chunks;

  await transport.editReply(firstChunk);
  for (const chunk of remainingChunks) {
    await transport.followUp(chunk);
  }
}
