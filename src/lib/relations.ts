/**
 * Relations are directed: A "responsable de" B. Each page shows both
 * directions, so every label needs a second phrasing for the target's side —
 * B's page lists A under "Responsables", not under "Responsable de".
 */
export const RELATION_LABELS = [
  "miembro de",
  "responsable de",
  "víctima de",
] as const;

export type RelationLabel = (typeof RELATION_LABELS)[number];

export function isRelationLabel(value: string): value is RelationLabel {
  return (RELATION_LABELS as readonly string[]).includes(value);
}

const OUTGOING: Record<RelationLabel, string> = {
  "miembro de": "Miembro de",
  "responsable de": "Responsable de",
  "víctima de": "Víctima de",
};

const INCOMING: Record<RelationLabel, string> = {
  "miembro de": "Miembros",
  "responsable de": "Responsables",
  "víctima de": "Víctimas",
};

/** Heading on the page the relation points *from*. */
export function outgoingHeading(label: RelationLabel): string {
  return OUTGOING[label];
}

/** Heading on the page the relation points *to*. */
export function incomingHeading(label: RelationLabel): string {
  return INCOMING[label];
}
