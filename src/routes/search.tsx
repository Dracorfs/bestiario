import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { KindBadge } from "~/components/KindBadge";
import {
  ARTICLE_KINDS,
  kindFromQueryValue,
  kindLabel,
  kindQueryValue,
} from "~/lib/kind";

const search = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string; tipo: string }) => input)
  .handler(async ({ data: { q, tipo } }) => {
    if (!q.trim()) return [];
    const kind = kindFromQueryValue(tipo);
    return prisma.article.findMany({
      where: {
        published: true,
        ...(kind ? { kind } : {}),
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { contentHtml: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 50,
      select: { slug: true, title: true, kind: true, summary: true },
    });
  });

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
    // Normalised here so an unknown ?tipo= drops out of the URL instead of
    // silently returning zero results.
    tipo:
      typeof s.tipo === "string" && kindFromQueryValue(s.tipo) ? s.tipo : "",
  }),
  loaderDeps: ({ search: { q, tipo } }) => ({ q, tipo }),
  loader: ({ deps: { q, tipo } }) => search({ data: { q, tipo } }),
  component: SearchPage,
});

function SearchPage() {
  const results = Route.useLoaderData();
  const { q, tipo } = Route.useSearch();
  return (
    <>
      <h1>Buscar</h1>
      <form action="/search" method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          className="border border-(--color-wiki-border) px-2 py-1 text-sm flex-1 bg-white"
          placeholder="Escribí tu búsqueda…"
        />
        <select
          name="tipo"
          defaultValue={tipo}
          className="border border-(--color-wiki-border) px-2 py-1 text-sm bg-white"
        >
          <option value="">Todos los tipos</option>
          {ARTICLE_KINDS.map((k) => (
            <option key={k} value={kindQueryValue(k)}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border border-(--color-wiki-border) px-3 py-1 text-sm bg-white hover:bg-(--color-wiki-sidebar)"
        >
          Buscar
        </button>
      </form>
      {q && (
        <p className="text-(--color-wiki-muted) text-sm">
          {results.length} resultado{results.length === 1 ? "" : "s"} para{" "}
          <strong>{q}</strong>.
        </p>
      )}
      <ul>
        {results.map((r: (typeof results)[number]) => (
          <li key={r.slug}>
            <KindBadge kind={r.kind} />{" "}
            <Link
              to="/article/$slug"
              params={{ slug: r.slug }}
              className="text-(--color-wiki-link) hover:underline"
            >
              {r.title}
            </Link>
            {r.summary && (
              <span className="text-(--color-wiki-muted)"> — {r.summary}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
