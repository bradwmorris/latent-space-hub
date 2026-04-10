/**
 * Debug script: prints the exact system message Slop would receive.
 * Run: npx tsx scripts/debug-system-message.ts
 */
import fs from "fs";
import path from "path";

// 1. Load soul file (profile.systemPrompt)
const soulPath = path.join(__dirname, "..", "personas", "slop.soul.md");
const systemPrompt = fs.readFileSync(soulPath, "utf-8").trim();

// 2. Hardcoded lines from generateAgenticResponse
const groundingLine =
  "Use your tools to search the knowledge base BEFORE answering factual questions. Include a short 'Sources' list with direct links in your final response. Never fabricate content — if tools return nothing relevant, say so.";
const profileStyleLine =
  "Style: opinionated, sharp, slightly unhinged tone. Keep it concise but punchy. Still ground factual claims in tool results. IMPORTANT: When referencing specific content (episodes, articles, AINews), always include the direct link. Format: [Title](url). Never reference content without linking to it.";

// 3. Load skills index (loadSkillsContext)
const SKILLS_DIR = path.join(__dirname, "..", "skills");
const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
const skills = files.map((f) => {
  const raw = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      fm[key] = val;
    }
  }
  return {
    name: fm.name || f.replace(".md", ""),
    description: fm.description || "",
    when_to_use: fm.when_to_use || "",
  };
}).filter(Boolean);

const skillLines = skills
  .map((s) => `- **${s!.name}**: ${s!.description}${s!.when_to_use ? ` | When: ${s!.when_to_use}` : ""}`)
  .join("\n");

const skillsContext = `[SKILLS] You have the following operational skills. Read the full skill with ls_read_skill(name) when you need detailed instructions.\n${skillLines}`;

// 4. Example member context
const memberContext = `[MEMBER CONTEXT]
Name: brad w morris
Role: founder and systems eng
Location: Byron Bay, Australia / SF
Interests: details, local-first architecture, knowledge graphs, RAG
Last active: 2026-03-07T10:40:42.646Z
Recent interactions: is there a skill to add events
Use this to personalize your response naturally.`;

// 5. Assemble exactly as line 653 does
const additionalSystemContext = [skillsContext, memberContext].filter(Boolean).join("\n\n");
const fullSystemMessage = `${systemPrompt}\n\n${groundingLine}\n${profileStyleLine}\n\n${additionalSystemContext}`;

// Output
console.log("=".repeat(80));
console.log("FULL SYSTEM MESSAGE (what Slop sees)");
console.log("=".repeat(80));
console.log(fullSystemMessage);
console.log("=".repeat(80));
console.log(`\nTotal chars: ${fullSystemMessage.length}`);
console.log(`\nBreakdown:`);
console.log(`  Soul file:      ${systemPrompt.length} chars`);
console.log(`  Grounding line: ${groundingLine.length} chars`);
console.log(`  Style line:     ${profileStyleLine.length} chars`);
console.log(`  Skills index:   ${skillsContext.length} chars`);
console.log(`  Member context: ${memberContext.length} chars`);
