import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { renderArticleContent } from "~/lib/render-article";
import { parseKeyFacts } from "~/lib/key-facts";
import { extractHeadings } from "~/lib/headings";
import { ArticleHeader } from "~/components/ArticleHeader";
import { TableOfContents } from "~/components/TableOfContents";

/** Below this, a table of contents is more clutter than help. */
const MIN_HEADINGS_FOR_TOC = 3;

const getArticle = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    // pictureData is deliberately not selected. The header loads the image
    // from /picture/$slug, so no bytes belong in this payload — and Prisma's
    // small Bytes values are carved out of Node's shared Buffer pool, so
    // serializing one would leak unrelated process memory to the client.
    const article = await prisma.article.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        kind: true,
        summary: true,
        contentHtml: true,
        infoboxJson: true,
        pictureMimeType: true,
        updatedAt: true,
        categories: { select: { category: { select: { slug: true, name: true } } } },
      },
    });
    if (!article) return null;
    const rendered = await renderArticleContent(article.contentHtml);
    const { html, headings } = extractHeadings(rendered);
    return {
      headings,
      slug: article.slug,
      title: article.title,
      kind: article.kind,
      summary: article.summary,
      html,
      facts: parseKeyFacts(article.infoboxJson),
      hasPicture: article.pictureMimeType !== null,
      updatedAt: article.updatedAt.toISOString(),
      categories: article.categories.map((c) => c.category),
    };
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
      <ArticleHeader
        slug={article.slug}
        title={article.title}
        kind={article.kind}
        summary={article.summary}
        hasPicture={article.hasPicture}
        facts={article.facts}
        categories={article.categories}
        updatedAt={article.updatedAt}
      />
      {article.headings.length >= MIN_HEADINGS_FOR_TOC ? (
        <div className="lg:flex lg:gap-6 lg:items-start">
          <div
            className="reading-column min-w-0 flex-1"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
          <aside className="order-first mb-4 lg:order-last lg:mb-0 lg:w-52 lg:shrink-0">
            <TableOfContents headings={article.headings} />
          </aside>
        </div>
      ) : (
        <div
          className="reading-column"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />
      )}
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
          className="text-(--color-link-red) hover:underline"
        >
          Crear este artículo
        </Link>
        .
      </p>
    </>
  );
}

