import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { bufferToDataUrl } from "~/lib/data-url";
import { prisma } from "~/lib/db";
import { renderArticleContent } from "~/lib/render-article";

const getArticle = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await prisma.article.findUnique({
      where: { slug },
      include: {
        categories: { include: { category: true } },
      },
    });
    if (!article) return null;
    const html = await renderArticleContent(article.contentHtml);
    const pictureDataUrl =
      article.pictureData && article.pictureMimeType
        ? bufferToDataUrl(Buffer.from(article.pictureData), article.pictureMimeType)
        : null;
    return { ...article, html, pictureDataUrl };
  });

export const Route = createFileRoute("/article/$slug")({
  component: ArticlePage,
  loader: async ({ params }) => {
    const article = await getArticle({ data: params.slug });
    if (!article) throw notFound();
    return article;
  },
  notFoundComponent: NotFoundArticle,
});

function ArticlePage() {
  const article = Route.useLoaderData();
  return (
    <>
      <h1>{article.title}</h1>
      {article.summary && (
        <p className="text-[--color-wiki-muted] italic">{article.summary}</p>
      )}
      {article.pictureDataUrl && (
        <img
          src={article.pictureDataUrl}
          alt={article.title}
          className="float-right ml-4 mb-4 w-72 border border-[--color-wiki-border]"
        />
      )}
      <div dangerouslySetInnerHTML={{ __html: article.html }} />
      <div className="mt-6 pt-3 border-t border-[--color-wiki-border] text-xs text-[--color-wiki-muted] flex flex-wrap gap-3 items-center">
        {article.categories.length > 0 && (
          <span>
            Categorías:{" "}
            {article.categories.map((c: (typeof article.categories)[number], i: number) => (
              <span key={c.categoryId}>
                {i > 0 && ", "}
                <Link
                  to="/category/$slug"
                  params={{ slug: c.category.slug }}
                  className="text-[--color-wiki-link] hover:underline"
                >
                  {c.category.name}
                </Link>
              </span>
            ))}
          </span>
        )}
        <span className="ml-auto">
          Última edición:{" "}
          {new Date(article.updatedAt).toLocaleDateString("es-AR")}
        </span>
        {article.sourceUrl && (
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[--color-wiki-link] hover:underline"
          >
            Fuente original
          </a>
        )}
      </div>
    </>
  );
}

function NotFoundArticle() {
  const { slug } = Route.useParams();
  return (
    <>
      <h1>Artículo no encontrado</h1>
      <p>
        No existe un artículo con el identificador <code>{slug}</code>.{" "}
        <Link
          to="/admin/new"
          search={{ slug }}
          className="text-[--color-wiki-link-red] hover:underline"
        >
          Crear este artículo
        </Link>
        .
      </p>
    </>
  );
}

