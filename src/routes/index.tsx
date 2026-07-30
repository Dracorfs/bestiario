import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";

const getFeatured = createServerFn({ method: "GET" }).handler(async () => {
  const articles = await prisma.article.findMany({
    where: { published: true },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: { slug: true, title: true, summary: true, updatedAt: true },
  });
  const total = await prisma.article.count({ where: { published: true } });
  return { articles, total };
});

export const Route = createFileRoute("/")({
  component: HomePage,
  loader: () => getFeatured(),
});

function HomePage() {
  const { articles, total } = Route.useLoaderData();
  return (
    <>
      <h1>Internet no olvida. {" "}<strong> Vos no olvides.</strong></h1>
      <p>
        Albergamos{" "} {total} carpetazos de personajes e instituciones.
      </p>
      <h2>Artículos recientes</h2>
      {articles.length === 0 ? (
        <p>
          No hay artículos aún. Ejecutá <code>pnpm seed</code> (o{" "}
          <code>npm run seed</code>) para importar contenido inicial desde
          Wikipedia.
        </p>
      ) : (
        <ul>
          {articles.map((a: (typeof articles)[number]) => (
            <li key={a.slug}>
              <Link
                to="/article/$slug"
                params={{ slug: a.slug }}
                className="text-[--color-wiki-link] hover:underline"
              >
                {a.title}
              </Link>
              {a.summary ? <> — {a.summary}</> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
