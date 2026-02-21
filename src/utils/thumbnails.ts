/**
 * Extract YouTube video ID from a URL.
 * Handles youtube.com/watch?v=, youtu.be/, youtube.com/embed/, etc.
 */
export function extractYouTubeId(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') || u.pathname.split('/').pop() || null;
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/**
 * Get a YouTube thumbnail URL for a node link.
 * Returns mqdefault (320x180) — good for small card thumbnails.
 */
export function getYouTubeThumbnail(link: string | undefined | null): string | null {
  const id = extractYouTubeId(link);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}
