import fs from "node:fs";
import path from "node:path";
import type { SkillMeta } from "../types";

export const REQUIRED_SLOP_SKILLS = [
  "Start Here",
  "Member Profiles",
  "DB Operations",
  "Event Scheduling"
];

const REQUIRED_SLOP_SKILL_SET = new Set(REQUIRED_SLOP_SKILLS.map((name) => normalizeSkillName(name)));
const REQUIRED_SLOP_SKILL_ORDER = new Map(
  REQUIRED_SLOP_SKILLS.map((name, index) => [normalizeSkillName(name), index] as const)
);
const SKILLS_DIR = path.join(__dirname, "..", "..", "skills");

let cachedSkillsContext = "";

export function normalizeSkillName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function validateRequiredSlopSkills(skills: SkillMeta[]): void {
  const slopSet = new Set(skills.map((s) => normalizeSkillName(s.name)));

  const missing = REQUIRED_SLOP_SKILLS.filter((name) => !slopSet.has(normalizeSkillName(name)));
  const extras = [...slopSet].filter((name) => !REQUIRED_SLOP_SKILL_SET.has(name));

  if (missing.length || extras.length) {
    const missingText = missing.length ? ` missing=[${missing.join(", ")}]` : "";
    const extrasText = extras.length ? ` extras=[${extras.join(", ")}]` : "";
    throw new Error(
      `Hub Slop skill set mismatch.${missingText}${extrasText} Expected exactly: ${REQUIRED_SLOP_SKILLS.join(", ")}`
    );
  }
}

export function loadSkillIndexFromLocal(): SkillMeta[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    throw new Error(`Skills directory not found: ${SKILLS_DIR}`);
  }
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
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
      };
    })
    .filter((s): s is SkillMeta => s !== null);
}

export function loadSkillsContextFromLocalStrict(): string {
  const skills = loadSkillIndexFromLocal();
  validateRequiredSlopSkills(skills);

  const ordered = skills
    .slice()
    .sort((a, b) => {
      const ai = REQUIRED_SLOP_SKILL_ORDER.get(normalizeSkillName(a.name)) ?? Number.MAX_SAFE_INTEGER;
      const bi = REQUIRED_SLOP_SKILL_ORDER.get(normalizeSkillName(b.name)) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });

  const lines = ordered
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join("\n");

  cachedSkillsContext = [
    "[SKILLS] Available skills. Use slop_read_skill(name) for full instructions.",
    lines,
  ].join("\n");
  return cachedSkillsContext;
}

export function readLocalSkillStrict(name: string): string {
  const slug = normalizeSkillName(name);
  const filepath = path.join(SKILLS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Local skill not found: ${name}`);
  }
  const raw = fs.readFileSync(filepath, "utf-8");
  const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const content = bodyMatch ? bodyMatch[1].trim() : raw.trim();
  if (!content) throw new Error(`Local skill is empty: ${name}`);
  return content;
}

export function getSkillsContextOrThrow(): string {
  if (!cachedSkillsContext) {
    throw new Error("Skills context not loaded. Local skills must be loaded at startup.");
  }
  return cachedSkillsContext;
}
