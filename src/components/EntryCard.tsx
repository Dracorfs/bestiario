import { Link } from "@tanstack/react-router";
import { KindBadge } from "~/components/KindBadge";
import type { ArticleKind } from "~/lib/kind";

export interface EntrySummary {
  slug: string;
  title: string;
  kind: ArticleKind;
  summary: string | null;
  hasPicture: boolean;
}

export function EntryCard({ entry }: { entry: EntrySummary }) {
  return (
    // list-none sits on the <li>, not the <ul>: `.prose-entry ul { list-style: disc }`
    // is more specific than a utility class on the parent, but a declaration on
    // the item itself beats the value it would otherwise inherit.
    <li className="list-none rounded-lg border border-(--color-border) bg-(--color-surface) overflow-hidden hover:shadow-sm">
      <Link
        to="/article/$slug"
        params={{ slug: entry.slug }}
        className="block h-full p-3 no-underline hover:bg-(--color-surface-alt)"
      >
        {entry.hasPicture && (
          <img
            src={`/picture/${entry.slug}`}
            alt=""
            loading="lazy"
            className="mb-2 h-36 w-full rounded-md object-cover border border-(--color-border)"
          />
        )}
        <KindBadge kind={entry.kind} />
        <h3 className="mt-1 font-serif text-base text-(--color-link)">
          {entry.title}
        </h3>
        {entry.summary && (
          <p className="mt-1 text-sm text-(--color-muted)">{entry.summary}</p>
        )}
      </Link>
    </li>
  );
}
