import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";
import type { ArticleKind } from "~/lib/kind";
import { bufferToDataUrl, dataUrlToBuffer } from "~/lib/data-url";
import { archiveTweetsInContent } from "~/lib/tweet-archive";
import { archiveBookmarksInContent } from "~/lib/bookmark-archive";
import { optimizeImage } from "~/lib/tweet-media";
import { setArticleCategories } from "~/lib/category-sync";

const loadArticle = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const a = await prisma.article.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        kind: true,
        summary: true,
        contentHtml: true,
        published: true,
        pictureData: true,
        pictureMimeType: true,
        categories: { select: { category: { select: { name: true } } } },
      },
    });
    if (!a) {
      return {
        slug,
        title: "",
        kind: "PERSONA" as ArticleKind,
        summary: "",
        contentHtml: "",
        published: true,
        pictureBase64: null,
        categories: [] as string[],
      };
    }
    return {
      slug: a.slug,
      title: a.title,
      kind: a.kind,
      summary: a.summary,
      contentHtml: a.contentHtml,
      published: a.published,
      pictureBase64:
        a.pictureData && a.pictureMimeType
          ? bufferToDataUrl(Buffer.from(a.pictureData), a.pictureMimeType)
          : null,
      categories: a.categories.map((c) => c.category.name),
    };
  });

const saveArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    let pictureData: Buffer<ArrayBuffer> | null = null;
    let pictureMimeType: string | null = null;
    if (data.pictureBase64) {
      const { data: raw } = dataUrlToBuffer(data.pictureBase64);
      const existing = await prisma.article.findUnique({
        where: { slug: data.slug },
        select: { pictureData: true, pictureMimeType: true },
      });
      if (existing?.pictureData && Buffer.from(existing.pictureData).equals(raw)) {
        // Submitted bytes are byte-identical to what's already stored (the
        // form resubmits the unchanged picture on every save) — skip
        // re-optimization to avoid cumulative quality loss from re-encoding.
        pictureData = Buffer.from(existing.pictureData) as Buffer<ArrayBuffer>;
        pictureMimeType = existing.pictureMimeType;
      } else {
        const optimized = await optimizeImage(raw);
        pictureData = optimized.data as Buffer<ArrayBuffer>;
        pictureMimeType = optimized.mimeType;
      }
    }
    const saved = await prisma.article.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        kind: data.kind,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
        pictureData,
        pictureMimeType,
      },
      update: {
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
    await setArticleCategories(saved.id, data.categories);
    await archiveTweetsInContent(data.contentHtml);
    await archiveBookmarksInContent(data.contentHtml);
    return { ok: true };
  });

const listCategories = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async () =>
    prisma.category.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  );

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
    const [article, availableCategories] = await Promise.all([
      loadArticle({ data: params.slug }),
      listCategories(),
    ]);
    return { article, availableCategories };
  },
  component: AdminEditPage,
});

function AdminEditPage() {
  const { auth } = Route.useRouteContext();
  const { article: initial, availableCategories } = Route.useLoaderData()!;
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
          kind: initial.kind,
          summary: initial.summary ?? "",
          contentHtml: initial.contentHtml,
          published: initial.published,
          pictureBase64: initial.pictureBase64,
          categories: initial.categories,
        }}
        availableCategories={availableCategories}
        slugEditable={false}
        submitLabel="Guardar"
        onSubmit={async (values) => {
          await saveArticle({ data: values });
          router.navigate({ to: "/article/$slug", params: { slug: values.slug } });
        }}
      />
      <div className="mt-6 pt-3 border-t border-(--color-wiki-border)">
        <button
          type="button"
          disabled={deleting}
          className="border border-(--color-wiki-link-red) text-(--color-wiki-link-red) px-4 py-1 hover:bg-(--color-wiki-link-red) hover:text-white disabled:opacity-50"
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
