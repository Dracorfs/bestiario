import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";
import { dataUrlToBuffer } from "~/lib/data-url";
import { archiveTweetsInContent } from "~/lib/tweet-archive";
import { optimizeImage } from "~/lib/tweet-media";

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
    await prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
        pictureData,
        pictureMimeType,
      },
    });
    await archiveTweetsInContent(data.contentHtml);
    return { ok: true };
  });

export const Route = createFileRoute("/admin_/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    slug: typeof search.slug === "string" ? search.slug : "",
  }),
  beforeLoad: async ({ location }) => ({
    auth: await requireAdmin(location.href),
  }),
  component: AdminNewPage,
});

function AdminNewPage() {
  const { auth } = Route.useRouteContext();
  const { slug } = Route.useSearch();
  const router = useRouter();
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  return (
    <>
      <h1>Nuevo artículo</h1>
      <ArticleForm
        initial={{
          slug,
          title: "",
          summary: "",
          contentHtml: "",
          published: true,
          pictureBase64: null,
        }}
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
