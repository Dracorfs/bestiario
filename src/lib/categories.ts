/**
 * Categories are free-form topical tags the admin types by hand, so two
 * spellings of the same tag must land on one row. The slug is the identity.
 */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Trims, drops blanks and anything that slugifies to nothing, and collapses
 * names sharing a slug down to the first spelling given.
 */
export function normalizeCategoryNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = categorySlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(name);
  }
  return out;
}
