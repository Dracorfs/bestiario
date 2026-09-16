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
import { parseKeyFacts } from "~/lib/key-facts";
import { Prisma } from "@prisma/client";
import { RELATION_LABELS, isRelationLabel, outgoingHeading } from "~/lib/relations";
import { KindBadge } from "~/components/KindBadge";

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
        infoboxJson: true,
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
        facts: [] as ReturnType<typeof parseKeyFacts>,
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
      facts: parseKeyFacts(a.infoboxJson),
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
        infoboxJson:
        data.facts.length > 0
          ? // KeyFact[] is structurally JSON, but a named interface has no index
            // signature, so Prisma's InputJsonValue does not accept it directly.
            (data.facts as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        pictureData,
        pictureMimeType,
      },
      update: {
        title: data.title,
        kind: data.kind,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
        infoboxJson:
        data.facts.length > 0
          ? // KeyFact[] is structurally JSON, but a named interface has no index
            // signature, so Prisma's InputJsonValue does not accept it directly.
            (data.facts as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
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

const loadRelations = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await prisma.article.findUnique({
      where: { slug },
      select: {
        id: true,
        relationsFrom: {
          select: {
            id: true,
            label: true,
            to: { select: { slug: true, title: true, kind: true } },
          },
        },
      },
    });
    const targets = await prisma.article.findMany({
      where: article ? { NOT: { id: article.id } } : {},
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
    });
    return { relations: article?.relationsFrom ?? [], targets };
  });

const addRelation = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: { fromSlug: string; toSlug: string; label: string }) => input)
  .handler(async ({ data }) => {
    if (!isRelationLabel(data.label)) throw new Error("etiqueta desconocida");
    const [from, to] = await Promise.all([
      prisma.article.findUnique({ where: { slug: data.fromSlug }, select: { id: true } }),
      prisma.article.findUnique({ where: { slug: data.toSlug }, select: { id: true } }),
    ]);
    // A self-link would render as an entry related to itself on both sides.
    if (!from || !to || from.id === to.id) throw new Error("relación inválida");
    await prisma.articleRelation.create({
      data: { fromId: from.id, toId: to.id, label: data.label },
    });
    return { ok: true };
  });

const removeRelation = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await prisma.articleRelation.delete({ where: { id } });
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
    const [article, availableCategories, relationData] = await Promise.all([
      loadArticle({ data: params.slug }),
      listCategories(),
      loadRelations({ data: params.slug }),
    ]);
    return { article, availableCategories, ...relationData };
  },
  component: AdminEditPage,
});

function AdminEditPage() {
  const { auth } = Route.useRouteContext();
  const { article: initial, availableCategories, relations, targets } =
    Route.useLoaderData()!;
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
          facts: initial.facts,
        }}
        availableCategories={availableCategories}
        slugEditable={false}
        submitLabel="Guardar"
        onSubmit={async (values) => {
          await saveArticle({ data: values });
          router.navigate({ to: "/article/$slug", params: { slug: values.slug } });
        }}
      />
      <RelationsEditor
        fromSlug={initial.slug}
        relations={relations}
        targets={targets}
      />
      <div className="mt-6 pt-3 border-t border-(--color-border)">
        <button
          type="button"
          disabled={deleting}
          className="border border-(--color-link-red) text-(--color-link-red) px-4 py-1 hover:bg-(--color-link-red) hover:text-white disabled:opacity-50"
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

function RelationsEditor({
  fromSlug,
  relations,
  targets,
}: {
  fromSlug: string;
  relations: Array<{
    id: string;
    label: string;
    to: { slug: string; title: string; kind: ArticleKind };
  }>;
  targets: Array<{ slug: string; title: string }>;
}) {
  const router = useRouter();
  const [label, setLabel] = useState<string>(RELATION_LABELS[0]);
  const [toSlug, setToSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
    } catch {
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 pt-3 border-t border-(--color-border)">
      <h2>Relaciones</h2>
      {relations.length === 0 ? (
        <p className="text-sm text-(--color-muted)">
          Esta entrada todavía no está relacionada con ninguna otra.
        </p>
      ) : (
        <ul className="space-y-1">
          {relations.map((r) => (
            <li key={r.id} className="list-none flex items-center gap-2 text-sm">
              <span className="text-(--color-muted)">
                {outgoingHeading(r.label as (typeof RELATION_LABELS)[number])}:
              </span>
              <KindBadge kind={r.to.kind} />
              <span>{r.to.title}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => removeRelation({ data: r.id }),
                    "No se pudo quitar la relación.",
                  )
                }
                aria-label={`Quitar relación con ${r.to.title}`}
                className="border border-(--color-link-red) text-(--color-link-red) px-2 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border border-(--color-border) p-1 bg-(--color-surface) text-sm"
        >
          {RELATION_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={toSlug}
          onChange={(e) => setToSlug(e.target.value)}
          className="border border-(--color-border) p-1 bg-(--color-surface) text-sm"
        >
          <option value="">Elegí una entrada…</option>
          {targets.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !toSlug}
          onClick={() =>
            run(async () => {
              await addRelation({ data: { fromSlug, toSlug, label } });
              setToSlug("");
            }, "No se pudo agregar la relación. Puede que ya exista.")
          }
          className="border border-(--color-border) px-3 py-1 text-sm bg-(--color-surface-alt) hover:bg-(--color-surface) disabled:opacity-50"
        >
          Agregar relación
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </section>
  );
}
