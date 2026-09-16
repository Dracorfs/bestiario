import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { EntryCard } from "~/components/EntryCard";
import { kindFromPathSegment, kindPathSegment, kindPlural } from "~/lib/kind";

const ORDERS = ["az", "recientes"] as const;
type Order = (typeof ORDERS)[number];

const listByKind = createServerFn({ method: "GET" })
  .inputValidator((input: { segment: string; orden: Order }) => input)
  .handler(async ({ data: { segment, orden } }) => {
    const kind = kindFromPathSegment(segment);
    if (!kind) return null;
    const articles = await prisma.article.findMany({
      where: { published: true, kind },
      orderBy: orden === "az" ? { title: "asc" } : { updatedAt: "desc" },
      // pictureData is deliberately not selected: the cards link to
      // /picture/$slug instead of carrying image bytes in this payload.
      select: {
        slug: true,
        title: true,
        kind: true,
        summary: true,
        pictureMimeType: true,
      },
    });
    return {
      kind,
      entries: articles.map(({ pictureMimeType, ...rest }) => ({
        ...rest,
        hasPicture: pictureMimeType !== null,
      })),
    };
  });

export const Route = createFileRoute("/$kind")({
  validateSearch: (s: Record<string, unknown>) => ({
    orden: (ORDERS as readonly string[]).includes(s.orden as string)
      ? (s.orden as Order)
      : ("az" as Order),
  }),
  loaderDeps: ({ search: { orden } }) => ({ orden }),
  loader: async ({ params, deps: { orden } }) => {
    const result = await listByKind({ data: { segment: params.kind, orden } });
    if (!result) throw notFound();
    return result;
  },
  component: KindIndexPage,
});

function KindIndexPage() {
  const { kind, entries } = Route.useLoaderData();
  const { orden } = Route.useSearch();
  const segment = kindPathSegment(kind);

  return (
    <>
      <h1>{kindPlural(kind)}</h1>
      <p className="text-(--color-muted) text-sm">
        {entries.length} entrada{entries.length === 1 ? "" : "s"}.{" "}
        <span className="ml-2">
          Ordenar:{" "}
          <Link
            to="/$kind"
            params={{ kind: segment }}
            search={{ orden: "az" as Order }}
            className={
              orden === "az" ? "font-semibold" : "text-(--color-link) hover:underline"
            }
          >
            A–Z
          </Link>
          {" · "}
          <Link
            to="/$kind"
            params={{ kind: segment }}
            search={{ orden: "recientes" as Order }}
            className={
              orden === "recientes"
                ? "font-semibold"
                : "text-(--color-link) hover:underline"
            }
          >
            Recientes
          </Link>
        </span>
      </p>
      {entries.length === 0 ? (
        <p>Todavía no hay entradas de este tipo.</p>
      ) : (
        <ul className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 list-none pl-0">
          {entries.map((entry: (typeof entries)[number]) => (
            <EntryCard key={entry.slug} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}
