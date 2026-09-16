/**
 * The three kinds of entry, in display order. Mirrors the `ArticleKind` enum in
 * `prisma/schema.prisma`; kept as a plain union so client components can import
 * labels without pulling in the Prisma client.
 */
export const ARTICLE_KINDS = ["PERSONA", "ORGANIZACION", "VICTIMA"] as const;

export type ArticleKind = (typeof ARTICLE_KINDS)[number];

const LABELS: Record<ArticleKind, string> = {
  PERSONA: "Persona",
  ORGANIZACION: "Organización",
  VICTIMA: "Víctima",
};

export function kindLabel(kind: ArticleKind): string {
  return LABELS[kind];
}

export function isArticleKind(value: string): value is ArticleKind {
  return (ARTICLE_KINDS as readonly string[]).includes(value);
}

/** The `?tipo=` value for a kind: singular and lowercase (`VICTIMA` → `victima`). */
export function kindQueryValue(kind: ArticleKind): string {
  return kind.toLowerCase();
}

export function kindFromQueryValue(value: string): ArticleKind | null {
  const upper = value.toUpperCase();
  return isArticleKind(upper) ? upper : null;
}

const PLURALS: Record<ArticleKind, string> = {
  PERSONA: "Personas",
  ORGANIZACION: "Organizaciones",
  VICTIMA: "Víctimas",
};

export function kindPlural(kind: ArticleKind): string {
  return PLURALS[kind];
}

const PATH_SEGMENTS: Record<ArticleKind, string> = {
  PERSONA: "personas",
  ORGANIZACION: "organizaciones",
  VICTIMA: "victimas",
};

export function kindPathSegment(kind: ArticleKind): string {
  return PATH_SEGMENTS[kind];
}

export function kindFromPathSegment(segment: string): ArticleKind | null {
  return (
    ARTICLE_KINDS.find((kind) => PATH_SEGMENTS[kind] === segment) ?? null
  );
}

/**
 * Tinted pill colours, from the `--color-kind-*` tokens in `styles.css`.
 * Written out literally rather than built by interpolation: Tailwind generates
 * utilities by scanning source text for complete class names, so a class
 * assembled at runtime would never make it into the stylesheet.
 */
const BADGE_CLASSES: Record<ArticleKind, string> = {
  PERSONA: "text-(--color-kind-persona-fg) bg-(--color-kind-persona-bg)",
  ORGANIZACION: "text-(--color-kind-organizacion-fg) bg-(--color-kind-organizacion-bg)",
  VICTIMA: "text-(--color-kind-victima-fg) bg-(--color-kind-victima-bg)",
};

export function kindBadgeClass(kind: ArticleKind): string {
  return BADGE_CLASSES[kind];
}

/** Thin rule above an entry's header, in that kind's colour. Literal for the same reason. */
const ACCENT_CLASSES: Record<ArticleKind, string> = {
  PERSONA: "border-(--color-kind-persona-fg)",
  ORGANIZACION: "border-(--color-kind-organizacion-fg)",
  VICTIMA: "border-(--color-kind-victima-fg)",
};

export function kindAccentClass(kind: ArticleKind): string {
  return ACCENT_CLASSES[kind];
}
