import { Link } from "@tanstack/react-router";
import { KindBadge } from "~/components/KindBadge";
import type { ArticleKind } from "~/lib/kind";

export interface RelatedGroup {
  heading: string;
  entries: Array<{ slug: string; title: string; kind: ArticleKind }>;
}

export function RelatedEntries({ groups }: { groups: RelatedGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <section className="mt-8 pt-4 border-t border-(--color-border)">
      <h2>Relacionados</h2>
      {groups.map((group) => (
        <div key={group.heading} className="mt-3">
          <h3 className="text-sm font-semibold text-(--color-muted)">
            {group.heading}
          </h3>
          <ul className="mt-1 space-y-1">
            {group.entries.map((entry) => (
              <li key={entry.slug} className="list-none flex items-center gap-2">
                <KindBadge kind={entry.kind} />
                <Link
                  to="/article/$slug"
                  params={{ slug: entry.slug }}
                  className="text-(--color-link) hover:underline"
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
