import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";
import { dataUrlToBuffer } from "~/lib/data-url";
import { archiveTweetsInContent } from "~/lib/tweet-archive";
import { archiveBookmarksInContent } from "~/lib/bookmark-archive";
import { optimizeImage } from "~/lib/tweet-media";
import { setArticleCategories } from "~/lib/category-sync";

const listCategories = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async () =>
    prisma.category.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  );

const createArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    let pictureData: Buffer<ArrayBuffer> | null = null;
    let pictureMimeType: string | null = null;
    if (data.pictureBase64) {
      const { data: raw } = dataUrlToBuffer(data.pictureBase64);
      const optimized = await optimizeImage(raw);
      pictureData = optimized.data as Buffer<ArrayBuffer>;
      pictureMimeType = optimized.mimeType;
    }
    const created = await prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        kind: data.kind,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
        pictureData,
        pictureMimeType,
      },
      select: { id: true },
    });
    await setArticleCategories(created.id, data.categories);
    await archiveTweetsInContent(data.contentHtml);
    await archiveBookmarksInContent(data.contentHtml);
    return { ok: true };
  });

export const Route = createFileRoute("/admin_/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    slug: typeof search.slug === "string" ? search.slug : "",
  }),
  beforeLoad: async ({ location }) => ({
    auth: await requireAdmin(location.href),
  }),
  loader: async ({ context }) => {
    if (context.auth.status !== "ok") return [];
    return listCategories();
  },
  component: AdminNewPage,
});

function AdminNewPage() {
  const { auth } = Route.useRouteContext();
  const { slug } = Route.useSearch();
  const availableCategories = Route.useLoaderData();
  const router = useRouter();
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  return (
    <>
      <h1>Nuevo artículo</h1>
      <ArticleForm
        initial={{
          slug,
          title: "",
          kind: "PERSONA",
          summary: "",
          contentHtml: "",
          published: true,
          pictureBase64: null,
          categories: [],
        }}
        availableCategories={availableCategories}
        slugEditable
        submitLabel="Crear"
        onSubmit={async (values) => {
          await createArticle({ data: values });
          router.navigate({ to: "/article/$slug", params: { slug: values.slug } });
        }}
      />
    </>
  );
}
