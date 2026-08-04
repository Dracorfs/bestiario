import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";
import { archiveTweetsInContent } from "~/lib/tweet-archive";

const createArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    await prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
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
        initial={{ slug, title: "", summary: "", contentHtml: "", published: true }}
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
