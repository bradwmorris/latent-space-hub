export function shortModelName(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return "unknown-model";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

export function modelBadge(model: string): string {
  return `🤖 ${shortModelName(model)}`;
}

export function agenticToolsFooter(toolsUsed: string[]): string {
  if (!toolsUsed.length) return "🛠️ none";
  const counts = new Map<string, number>();
  for (const name of toolsUsed) {
    const short = name.replace(/^ls_/, "");
    counts.set(short, (counts.get(short) || 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of counts) {
    parts.push(count > 1 ? `${name}(x${count})` : name);
  }
  return `🛠️ ${parts.join(" | ")}`;
}

export function splitForDiscord(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  const limit = 1800;

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < 400) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}
