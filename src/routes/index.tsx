import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { EntryCard, type EntrySummary } from "~/components/EntryCard";
import {
  ARTICLE_KINDS,
  kindPathSegment,
  kindPlural,
  type ArticleKind,
} from "~/lib/kind";

const CARD_FIELDS = {
  slug: true,
  title: true,
  kind: true,
  summary: true,
  // Only whether a picture exists — the cards fetch the bytes from /picture/$slug.
  pictureMimeType: true,
} as const;

type CardRow = {
  slug: string;
  title: string;
  kind: ArticleKind;
  summary: string | null;
  pictureMimeType: string | null;
};

function toEntry({ pictureMimeType, ...rest }: CardRow): EntrySummary {
  return { ...rest, hasPicture: pictureMimeType !== null };
}

const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const [latest, byKind, sections] = await Promise.all([
    prisma.article.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: CARD_FIELDS,
    }),
    prisma.article.groupBy({
      by: ["kind"],
      where: { published: true },
      _count: { _all: true },
    }),
    Promise.all(
      ARTICLE_KINDS.map(async (kind) => ({
        kind,
        entries: await prisma.article.findMany({
          where: { published: true, kind },
          orderBy: { updatedAt: "desc" },
          take: 3,
          select: CARD_FIELDS,
        }),
      })),
    ),
  ]);
  const counts = Object.fromEntries(
    byKind.map((row) => [row.kind, row._count._all]),
  ) as Record<ArticleKind, number | undefined>;
  return {
    total: byKind.reduce((sum, row) => sum + row._count._all, 0),
    latest: latest.map(toEntry),
    kindCounts: ARTICLE_KINDS.map((kind) => ({ kind, count: counts[kind] ?? 0 })),
    sections: sections.map((s) => ({ kind: s.kind, entries: s.entries.map(toEntry) })),
  };
});

export const Route = createFileRoute("/")({
  component: HomePage,
  loader: () => getHome(),
});

function HomePage() {
  const { total, latest, kindCounts, sections } = Route.useLoaderData();

  if (total === 0) {
    return (
      <>
        <h1>
          Internet no olvida. <strong>Vos no olvides.</strong>
        </h1>
        <p>Todavía no hay carpetazos publicados. Volvé pronto.</p>
      </>
    );
  }

  return (
    <>
      <h1>
        Internet no olvida. <strong>Vos no olvides.</strong>
      </h1>
      <p>
        Albergamos {total} carpetazo{total === 1 ? "" : "s"}:{" "}
        {kindCounts.map(
          ({ kind, count }: { kind: ArticleKind; count: number }, i: number) => (
            <span key={kind}>
              {i > 0 && " · "}
              <Link
                to="/$kind"
                params={{ kind: kindPathSegment(kind) }}
                search={{ orden: "az" as const }}
                className="text-(--color-link) hover:underline"
              >
                {count} {kindPlural(kind).toLowerCase()}
              </Link>
            </span>
          ),
        )}
        .
      </p>

      <h2>Últimos carpetazos</h2>
      <ul className="mt-2 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pl-0">
        {latest.map((entry: EntrySummary) => (
          <EntryCard key={entry.slug} entry={entry} />
        ))}
      </ul>

      {sections.map(
        ({ kind, entries }: { kind: ArticleKind; entries: EntrySummary[] }) =>
          entries.length === 0 ? null : (
            <section key={kind}>
              <h2>{kindPlural(kind)}</h2>
              <ul className="grid gap-3 grid-cols-1 sm:grid-cols-3 pl-0">
                {entries.map((entry: EntrySummary) => (
                  <EntryCard key={entry.slug} entry={entry} />
                ))}
              </ul>
              <p className="mt-2">
                <Link
                  to="/$kind"
                  params={{ kind: kindPathSegment(kind) }}
                  search={{ orden: "az" as const }}
                  className="text-(--color-link) hover:underline"
                >
                  Ver todos ({kindCounts.find((k: { kind: ArticleKind }) => k.kind === kind)?.count})
                </Link>
              </p>
            </section>
          ),
      )}
    </>
  );
}
