import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";

const search = createServerFn({ method: "GET" })
  .inputValidator((q: string) => q)
  .handler(async ({ data: q }) => {
    if (!q.trim()) return [];
    return prisma.article.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { contentHtml: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 50,
      select: { slug: true, title: true, summary: true },
    });
  });

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
  }),
  loaderDeps: ({ search: { q } }) => ({ q }),
  loader: ({ deps: { q } }) => search({ data: q }),
  component: SearchPage,
});

function SearchPage() {
  const results = Route.useLoaderData();
  const { q } = Route.useSearch();
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
