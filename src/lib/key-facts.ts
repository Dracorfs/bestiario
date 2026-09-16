import type { ArticleKind } from "~/lib/kind";

export interface KeyFact {
  key: string;
  value: string;
}

/**
 * `Article.infoboxJson` is untyped JSON that predates this feature and can be
 * edited by hand, so parsing stays permissive: anything unusable is dropped
 * rather than thrown, and a plain object is read as ordered key/value pairs.
 */
export function parseKeyFacts(raw: unknown): KeyFact[] {
  if (raw === null || raw === undefined) return [];

  const pairs: Array<[unknown, unknown]> = Array.isArray(raw)
    ? raw.map((row) =>
        row && typeof row === "object"
          ? [(row as Record<string, unknown>).key, (row as Record<string, unknown>).value]
          : [undefined, undefined],
      )
    : typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
      : [];

  const facts: KeyFact[] = [];
  for (const [rawKey, rawValue] of pairs) {
    if (typeof rawKey !== "string") continue;
    if (rawValue === null || rawValue === undefined || typeof rawValue === "object") continue;
    const key = rawKey.trim();
    const value = String(rawValue).trim();
    if (!key || !value) continue;
    facts.push({ key, value });
  }
  return facts;
}

const SUGGESTED: Record<ArticleKind, string[]> = {
  PERSONA: ["Cargo", "Partido", "Período", "Nacimiento"],
  ORGANIZACION: ["Tipo", "Fundación", "Sede", "Responsables"],
  VICTIMA: ["Fecha", "Lugar", "Caso", "Estado de la causa"],
};

export function suggestedKeys(kind: ArticleKind): string[] {
  return SUGGESTED[kind];
}
