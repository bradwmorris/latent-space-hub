const MAX_URL_LENGTH = 2048;
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

function stripTrackingParams(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export function validatePaperUrl(url: string): { valid: boolean; url: string; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, url: "", error: "Paper URL cannot be empty." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, url: trimmed, error: "Paper URL is too long." };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, url: trimmed, error: "Paper URL must start with http:// or https://." };
    }
    return { valid: true, url: stripTrackingParams(trimmed) };
  } catch {
    return { valid: false, url: trimmed, error: "Paper URL is not valid." };
  }
}

export function validateEventTitle(title: string): { valid: boolean; title: string; error?: string } {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length < 3) {
    return { valid: false, title: clean, error: "Title is too short (min 3 characters)." };
  }
  if (clean.length > 200) {
    return { valid: false, title: clean, error: "Title is too long (max 200 characters)." };
  }
  if (/[\u0000-\u001F\u007F]/.test(clean)) {
    return { valid: false, title: clean, error: "Title contains unsupported control characters." };
  }
  return { valid: true, title: clean };
}

function parseDateStrict(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function validateEventDate(
  date: string,
  eventType: "paper-club" | "builders-club"
): { valid: boolean; error?: string } {
  const parsed = parseDateStrict(date);
  if (!parsed) return { valid: false, error: "Date must be YYYY-MM-DD." };

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  if (parsed.getTime() <= now.getTime()) {
    return { valid: false, error: "Date must be in the future." };
  }

  const expectedDay = eventType === "paper-club" ? 3 : 5; // Wed / Fri (UTC day)
  if (parsed.getUTCDay() !== expectedDay) {
    const expectedLabel = eventType === "paper-club" ? "Wednesday" : "Friday";
    return { valid: false, error: `Please choose a ${expectedLabel} slot.` };
  }

  return { valid: true };
}
