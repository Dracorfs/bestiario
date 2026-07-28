import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";

const createArticle = createServerFn({ method: "POST" })
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    await prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: true,
      },
    });
    return { ok: true };
  });

export const Route = createFileRoute("/admin/new")({
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
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  const { slug } = Route.useSearch();
  const router = useRouter();

  return (
    <>
      <h1>Nuevo artículo</h1>
      <ArticleForm
        initial={{ slug, title: "", summary: "", contentHtml: "" }}
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
