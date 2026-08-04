import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";

const loadArticle = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const a = await prisma.article.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        summary: true,
        contentHtml: true,
        published: true,
      },
    });
    return a ?? { slug, title: "", summary: "", contentHtml: "", published: true };
  });

const saveArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    await prisma.article.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
      },
      update: {
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
      },
    });
    return { ok: true };
  });

const deleteArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    await prisma.article.delete({ where: { slug } });
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
  const initial = Route.useLoaderData()!;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  return (
    <>
      <h1>Editando: {initial.slug}</h1>
      <ArticleForm
        key={initial.slug}
        initial={{
          slug: initial.slug,
          title: initial.title,
          summary: initial.summary ?? "",
          contentHtml: initial.contentHtml,
          published: initial.published,
        }}
        slugEditable={false}
        submitLabel="Guardar"
        onSubmit={async (values) => {
          await saveArticle({ data: values });
          router.navigate({ to: "/article/$slug", params: { slug: values.slug } });
        }}
      />
      <div className="mt-6 pt-3 border-t border-[--color-wiki-border]">
        <button
          type="button"
          disabled={deleting}
          className="border border-[--color-wiki-link-red] text-[--color-wiki-link-red] px-4 py-1 hover:bg-[--color-wiki-link-red] hover:text-white disabled:opacity-50"
          onClick={async () => {
            if (!confirm(`¿Borrar el artículo "${initial.slug}"? Esta acción no se puede deshacer.`)) return;
            setDeleting(true);
            setDeleteError(null);
            try {
              await deleteArticle({ data: initial.slug });
              router.navigate({ to: "/admin" });
            } catch {
              setDeleteError("No se pudo borrar el artículo. Intentá de nuevo.");
              setDeleting(false);
            }
          }}
        >
          {deleting ? "Borrando…" : "Borrar artículo"}
        </button>
        {deleteError && <p className="text-red-600 text-sm mt-2">{deleteError}</p>}
      </div>
    </>
  );
}
