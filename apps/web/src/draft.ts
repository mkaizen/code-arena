// Persist in-progress editor source per problem + language so it survives a
// page refresh. Keyed by slug + language; values are plain source strings.
function key(slug: string, lang: string): string {
  return `arena_src:${slug}:${lang}`;
}

export function loadDraft(slug: string, lang: string): string | null {
  try {
    return localStorage.getItem(key(slug, lang));
  } catch {
    return null;
  }
}

export function saveDraft(slug: string, lang: string, source: string): void {
  try {
    localStorage.setItem(key(slug, lang), source);
  } catch {
    // storage full / unavailable — drafts are best-effort
  }
}
