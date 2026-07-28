import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";

const loadArticle = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const a = await prisma.article.findUnique({
      where: { slug },
      select: { slug: true, title: true, summary: true, contentHtml: true },
    });
    return a ?? { slug, title: "", summary: "", contentHtml: "" };
  });

const saveArticle = createServerFn({ method: "POST" })
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    await prisma.article.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: true,
      },
      update: {
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
      },
    });
    return { ok: true };
  });

export const Route = createFileRoute("/admin_/edit/$slug")({
  beforeLoad: async ({ location }) => ({
    auth: await requireAdmin(location.href),
  }),
  loader: async ({ params, context }) => {
    if (context.auth.status !== "ok") return null;
    return loadArticle({ data: params.slug });
  },
  component: AdminEditPage,
});

function AdminEditPage() {
  const { auth } = Route.useRouteContext();
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  const initial = Route.useLoaderData()!;
  const router = useRouter();

  return (
    <>
      <h1>Editando: {initial.slug}</h1>
      <ArticleForm
        initial={{
          slug: initial.slug,
          title: initial.title,
          summary: initial.summary ?? "",
          contentHtml: initial.contentHtml,
        }}
        slugEditable={false}
        submitLabel="Guardar"
        onSubmit={async (values) => {
          await saveArticle({ data: values });
          router.navigate({ to: "/article/$slug", params: { slug: values.slug } });
        }}
      />
    </>
  );
}
