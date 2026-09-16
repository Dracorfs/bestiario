import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { KindBadge } from "~/components/KindBadge";
import { ARTICLE_KINDS, kindPlural, type ArticleKind } from "~/lib/kind";

const getCategory = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    return prisma.category.findUnique({
      where: { slug },
      include: {
        articles: {
          include: {
            article: {
              select: { slug: true, title: true, kind: true, summary: true },
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
        <p className="text-(--color-muted)">{cat.description}</p>
      )}
      <p className="text-(--color-muted) text-sm">
        {cat.articles.length} entrada{cat.articles.length === 1 ? "" : "s"}.
      </p>
      {ARTICLE_KINDS.map((kind: ArticleKind) => {
        const group = cat.articles.filter(
          (entry: (typeof cat.articles)[number]) => entry.article.kind === kind,
        );
        if (group.length === 0) return null;
        return (
          <section key={kind}>
            <h2>{kindPlural(kind)}</h2>
            <ul>
              {group.map((entry: (typeof cat.articles)[number]) => {
                const article = entry.article;
                return (
                  <li key={article.slug}>
                    <KindBadge kind={article.kind} />{" "}
                    <Link
                      to="/article/$slug"
                      params={{ slug: article.slug }}
                      className="text-(--color-link) hover:underline"
                    >
                      {article.title}
                    </Link>
                    {article.summary && <> — {article.summary}</>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {cat.articles.length === 0 && <p>Todavía no hay entradas en esta categoría.</p>}
    </>
  );
}
