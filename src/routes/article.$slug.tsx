import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { renderWikiHtml } from "~/lib/wiki-html";

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
    return article;
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
  const html = renderWikiHtml(article.contentHtml);
  return (
    <>
      <h1>{article.title}</h1>
      {article.summary && (
        <p className="text-[--color-wiki-muted] italic">{article.summary}</p>
      )}
      {article.infoboxJson ? <Infobox data={article.infoboxJson} /> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
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
          to="/edit/$slug"
          params={{ slug }}
          className="text-[--color-wiki-link-red] hover:underline"
        >
          Crear este artículo
        </Link>
        .
      </p>
    </>
  );
}

function Infobox({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data as Record<string, string>);
  if (entries.length === 0) return null;
  return (
    <aside className="float-right ml-4 mb-4 w-72 border border-[--color-wiki-border] bg-[--color-wiki-sidebar] text-xs">
      <div className="bg-[--color-bestiario-accent] text-white text-center font-bold py-1">
        Ficha
      </div>
      <table className="w-full">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-[--color-wiki-border] last:border-0">
              <th className="text-left p-1.5 align-top w-1/3 font-semibold">
                {k}
              </th>
              <td className="p-1.5 align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
