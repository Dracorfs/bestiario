import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";

const getCategory = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    return prisma.category.findUnique({
      where: { slug },
      include: {
        articles: {
          include: {
            article: {
              select: { slug: true, title: true, summary: true },
            },
          },
          orderBy: { article: { title: "asc" } },
        },
      },
    });
  });

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ params }) => {
    const cat = await getCategory({ data: params.slug });
    if (!cat) throw notFound();
    return cat;
  },
  component: CategoryPage,
});

function CategoryPage() {
  const cat = Route.useLoaderData();
  return (
    <>
      <h1>Categoría: {cat.name}</h1>
      {cat.description && (
        <p className="text-(--color-wiki-muted)">{cat.description}</p>
      )}
      <h2>Artículos ({cat.articles.length})</h2>
      <ul>
        {cat.articles.map((entry: (typeof cat.articles)[number]) => {
          const article = entry.article;
          return (
          <li key={article.slug}>
            <Link
              to="/article/$slug"
              params={{ slug: article.slug }}
              className="text-(--color-wiki-link) hover:underline"
            >
              {article.title}
            </Link>
            {article.summary && <> — {article.summary}</>}
          </li>
          );
        })}
      </ul>
    </>
  );
}
