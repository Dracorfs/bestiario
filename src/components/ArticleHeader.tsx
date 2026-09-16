import { Link } from "@tanstack/react-router";
import { KindBadge } from "~/components/KindBadge";
import { kindAccentClass, type ArticleKind } from "~/lib/kind";
import type { KeyFact } from "~/lib/key-facts";

export interface ArticleHeaderProps {
  slug: string;
  title: string;
  kind: ArticleKind;
  summary: string | null;
  hasPicture: boolean;
  facts: KeyFact[];
  categories: Array<{ slug: string; name: string }>;
  updatedAt: string;
}

export function ArticleHeader({
  slug,
  title,
  kind,
  summary,
  hasPicture,
  facts,
  categories,
  updatedAt,
}: ArticleHeaderProps) {
  return (
    <header
      className={`mb-6 rounded-lg border border-t-2 border-(--color-border) bg-(--color-surface) p-4 ${kindAccentClass(kind)}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
        {hasPicture && (
          <img
            src={`/picture/${slug}`}
            alt={title}
            className="w-full sm:w-64 shrink-0 rounded-md border border-(--color-border) object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <KindBadge kind={kind} />
          <h1 className="mt-1">{title}</h1>
          {summary && (
            <p className="text-(--color-muted) italic">{summary}</p>
          )}

          {facts.length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {facts.map((fact) => (
                <div key={fact.key} className="contents">
                  <dt className="font-semibold text-(--color-muted)">{fact.key}</dt>
                  <dd className="min-w-0">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-3 text-xs text-(--color-muted) flex flex-wrap items-center gap-x-3 gap-y-1">
            {categories.length > 0 && (
              <span>
                Categorías:{" "}
                {categories.map((c, i) => (
                  <span key={c.slug}>
                    {i > 0 && ", "}
                    <Link
                      to="/category/$slug"
                      params={{ slug: c.slug }}
                      className="text-(--color-link) hover:underline"
                    >
                      {c.name}
                    </Link>
                  </span>
                ))}
              </span>
            )}
            <span className="meta-caps">
              Última edición: {new Date(updatedAt).toLocaleDateString("es-AR")}
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
