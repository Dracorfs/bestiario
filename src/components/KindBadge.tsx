import { kindBadgeClass, kindLabel, type ArticleKind } from "~/lib/kind";

export function KindBadge({ kind }: { kind: ArticleKind }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${kindBadgeClass(kind)}`}
    >
      {kindLabel(kind)}
    </span>
  );
}
