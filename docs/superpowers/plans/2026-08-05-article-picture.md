# Article Presentation Picture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can upload, replace, and remove a presentation picture per article from the create/edit form; the public article page renders it, right-floated, in the visual slot the old (removed) infobox card used to occupy.

**Architecture:** Two new nullable `Bytes`/`String` columns on `Article` (`pictureData`, `pictureMimeType`) hold the optimized image, reusing the existing `optimizeImage()` from `tweet-media.ts`. The picture travels the wire as a base64 `data:` URL inside the existing JSON `ArticleFormValues` payload (`FileReader.readAsDataURL` on the client) — no multipart/`FormData` plumbing. Two small pure helpers (`dataUrlToBuffer`/`bufferToDataUrl`) handle the encode/decode at the server boundary, shared by both admin routes and the public article page.

**Tech Stack:** TanStack Start (server fns), Prisma/Postgres, existing `sharp`-backed `optimizeImage()` (no new dependencies).

## Global Constraints

- No new dependencies — reuses `optimizeImage()` from `src/lib/tweet-media.ts` verbatim.
- No multipart/`FormData` server-fn plumbing — picture data is a `pictureBase64: string | null` field inside the existing `ArticleFormValues` JSON payload.
- No thumbnails on admin list, category pages, or search — article page only.
- No new error-handling UI — a bad/corrupt upload surfaces through `ArticleForm`'s existing generic save-error message.
- This codebase has no React component or route test infrastructure (only pure `src/lib/*` functions have vitest suites) — tasks touching `ArticleForm` or route files are verified manually via the dev server, matching how prior UI/route-wiring tasks in this codebase were verified.

---

### Task 1: Prisma schema — `pictureData` / `pictureMimeType` on `Article`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Article.pictureData: Bytes | null`, `Article.pictureMimeType: String | null`, available via `@prisma/client` after `prisma generate`.

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, add two fields to the `Article` model (after `published`):

```prisma
model Article {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  summary     String?
  contentHtml String   @db.Text
  infoboxJson Json?
  sourceUrl   String?
  published   Boolean  @default(true)
  pictureData     Bytes?
  pictureMimeType String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  categories ArticleCategory[]
  revisions  Revision[]

  @@index([title])
}
```

(Only `pictureData`/`pictureMimeType` are new — every other field/line in that block already exists in the file today; don't reformat or reorder the rest.)

- [ ] **Step 2: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 3: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Verify the new fields are on the generated client**

Run: `node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); console.log('pictureData' in p.article.fields)"` — if that specific check doesn't work cleanly against your Prisma version, it's fine to instead just confirm no errors from `npx prisma generate`/`db push` above; either is sufficient evidence for this task.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add pictureData and pictureMimeType columns to Article"
```

---

### Task 2: `dataUrlToBuffer` / `bufferToDataUrl`

**Files:**
- Create: `src/lib/data-url.ts`
- Test: `src/lib/data-url.test.ts`

**Interfaces:**
- Produces: `dataUrlToBuffer(dataUrl: string): { data: Buffer; mimeType: string }` — parses a `data:<mime>;base64,<payload>` string; throws if the string isn't in that shape. `bufferToDataUrl(data: Buffer, mimeType: string): string` — inverse, builds the `data:` URL string.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bufferToDataUrl, dataUrlToBuffer } from "./data-url";

describe("dataUrlToBuffer", () => {
  it("parses a base64 data URL into its buffer and mime type", () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("hello").toString("base64")}`;
    const result = dataUrlToBuffer(dataUrl);
    expect(result.mimeType).toBe("image/png");
    expect(result.data.toString()).toBe("hello");
  });

  it("throws on a string that isn't a base64 data URL", () => {
    expect(() => dataUrlToBuffer("not a data url")).toThrow();
  });
});

describe("bufferToDataUrl", () => {
  it("encodes a buffer and mime type into a base64 data URL", () => {
    const result = bufferToDataUrl(Buffer.from("hello"), "image/png");
    expect(result).toBe(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);
  });
});

describe("round-trip", () => {
  it("bufferToDataUrl then dataUrlToBuffer returns the original bytes and mime type", () => {
    const original = Buffer.from([1, 2, 3, 255, 0]);
    const dataUrl = bufferToDataUrl(original, "image/webp");
    const result = dataUrlToBuffer(dataUrl);
    expect(result.data.equals(original)).toBe(true);
    expect(result.mimeType).toBe("image/webp");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data-url.test.ts`
Expected: FAIL — `Failed to resolve import "./data-url"` (file doesn't exist yet).

- [ ] **Step 3: Implement `data-url.ts`**

Create `src/lib/data-url.ts`:

```ts
export function dataUrlToBuffer(dataUrl: string): { data: Buffer; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  const mimeType = match?.[1];
  const base64 = match?.[2];
  if (!mimeType || !base64) throw new Error("invalid data URL");
  return { data: Buffer.from(base64, "base64"), mimeType };
}

export function bufferToDataUrl(data: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${data.toString("base64")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data-url.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data-url.ts src/lib/data-url.test.ts
git commit -m "feat: add dataUrlToBuffer/bufferToDataUrl helpers"
```

---

### Task 3: `ArticleForm` — file upload, preview, remove

**Files:**
- Modify: `src/lib/article-form.tsx` (full-file replacement — the diff touches enough scattered lines that a full rewrite is clearer than a patch)

**Interfaces:**
- Consumes: nothing new (no new imports beyond React's existing `useState`).
- Produces: `ArticleFormValues` gains `pictureBase64: string | null`. `ArticleForm`'s `onSubmit` callback now receives that field alongside the existing five.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/lib/article-form.tsx` with:

```tsx
import { useState } from "react";

export interface ArticleFormValues {
  slug: string;
  title: string;
  summary: string;
  contentHtml: string;
  published: boolean;
  pictureBase64: string | null;
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ArticleForm({
  initial,
  slugEditable,
  onSubmit,
  submitLabel,
}: {
  initial: ArticleFormValues;
  slugEditable: boolean;
  onSubmit: (values: ArticleFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!slugEditable || initial.slug !== "");
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [contentHtml, setContentHtml] = useState(initial.contentHtml);
  const [published, setPublished] = useState(initial.published);
  const [pictureBase64, setPictureBase64] = useState<string | null>(initial.pictureBase64);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSubmit({ slug, title, summary, contentHtml, published, pictureBase64 });
        } catch {
          setError(
            "No se pudo guardar el artículo. Puede que el slug ya exista o haya un problema de conexión. Intentá de nuevo.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      {slugEditable && (
        <label className="block">
          <span className="text-sm font-semibold">Slug</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            required
            className="block w-full border border-[--color-wiki-border] p-1 bg-white font-mono text-sm"
          />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-semibold">Título</span>
        <input
          value={title}
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            if (slugEditable && !slugTouched) setSlug(slugify(value));
          }}
          required
          className="block w-full border border-[--color-wiki-border] p-1 bg-white"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Resumen</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="block w-full border border-[--color-wiki-border] p-1 bg-white"
        />
      </label>
      <div className="block">
        <span className="text-sm font-semibold">Imagen de presentación</span>
        {pictureBase64 && (
          <div className="mt-1">
            <img
              src={pictureBase64}
              alt="Vista previa"
              className="max-w-xs border border-[--color-wiki-border]"
            />
          </div>
        )}
        <div className="mt-1 flex items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setPictureBase64(reader.result as string);
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
            className="text-sm"
          />
          {pictureBase64 && (
            <button
              type="button"
              onClick={() => setPictureBase64(null)}
              className="text-sm text-[--color-wiki-link-red] hover:underline"
            >
              Quitar imagen
            </button>
          )}
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-semibold">Contenido (Markdown)</span>
        <textarea
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          rows={20}
          className="block w-full border border-[--color-wiki-border] p-2 font-mono text-sm bg-white"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        <span className="text-sm font-semibold">Publicado</span>
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="border border-[--color-wiki-border] px-4 py-1 bg-[--color-wiki-sidebar] hover:bg-white disabled:opacity-50"
      >
        {saving ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: errors in `src/routes/admin_.new.tsx` and `src/routes/admin_.edit.$slug.tsx` (they construct `ArticleFormValues`-shaped objects missing the new `pictureBase64` field — Tasks 4 and 5 fix those). No errors should point at `src/lib/article-form.tsx` itself.

- [ ] **Step 3: Manual verification (no component test infra in this repo)**

Run: `npm run dev`. This form is used from two routes that Tasks 4/5 haven't updated yet, so it will not compile/run cleanly until those land — skip live manual verification for this task specifically, and instead do a visual/logic read-through: confirm the file picker, preview `<img>`, and "Quitar imagen" button only appear/behave as described (preview shows only when `pictureBase64` is set; picking a new file replaces it; the remove button clears it and disappears with it). Full manual click-through happens at the end of Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/lib/article-form.tsx
git commit -m "feat: add picture upload/preview/remove to ArticleForm"
```

---

### Task 4: `admin_.new.tsx` — save picture on create

**Files:**
- Modify: `src/routes/admin_.new.tsx`

**Interfaces:**
- Consumes: `ArticleFormValues` (now includes `pictureBase64: string | null`, Task 3). `dataUrlToBuffer(dataUrl: string): { data: Buffer; mimeType: string }` (`~/lib/data-url`, Task 2). `optimizeImage(input: Buffer): Promise<{ data: Buffer; mimeType: string }>` (`~/lib/tweet-media`, existing).

- [ ] **Step 1: Update the handler and initial form value**

Replace the entire contents of `src/routes/admin_.new.tsx` with:

```tsx
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
    let pictureData: Buffer | null = null;
    let pictureMimeType: string | null = null;
    if (data.pictureBase64) {
      const { data: raw } = dataUrlToBuffer(data.pictureBase64);
      const optimized = await optimizeImage(raw);
      pictureData = optimized.data;
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors pointing at `src/routes/admin_.new.tsx`. (`admin_.edit.$slug.tsx` still has errors until Task 5 — expected.)

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Log into `/admin`, go to "Nuevo artículo", fill in the required fields, upload a picture via the new file input, confirm the preview appears, submit. Then check the DB directly: `npx prisma studio`, open the `Article` table, confirm the new row's `pictureData` is non-null and `pictureMimeType` is `image/webp` (proving `optimizeImage` ran, since it always outputs webp regardless of the uploaded format).

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin_.new.tsx
git commit -m "feat: save optimized picture when creating an article"
```

---

### Task 5: `admin_.edit.$slug.tsx` — load, replace, and remove picture

**Files:**
- Modify: `src/routes/admin_.edit.$slug.tsx`

**Interfaces:**
- Consumes: `dataUrlToBuffer`, `bufferToDataUrl` (`~/lib/data-url`, Task 2). `optimizeImage` (`~/lib/tweet-media`, existing). `ArticleFormValues` (Task 3).

- [ ] **Step 1: Update the handlers and component**

Replace the entire contents of `src/routes/admin_.edit.$slug.tsx` with:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ArticleForm, type ArticleFormValues } from "~/lib/article-form";
import { bufferToDataUrl, dataUrlToBuffer } from "~/lib/data-url";
import { archiveTweetsInContent } from "~/lib/tweet-archive";
import { optimizeImage } from "~/lib/tweet-media";

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
        pictureData: true,
        pictureMimeType: true,
      },
    });
    if (!a) {
      return {
        slug,
        title: "",
        summary: "",
        contentHtml: "",
        published: true,
        pictureBase64: null,
      };
    }
    return {
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      contentHtml: a.contentHtml,
      published: a.published,
      pictureBase64:
        a.pictureData && a.pictureMimeType
          ? bufferToDataUrl(Buffer.from(a.pictureData), a.pictureMimeType)
          : null,
    };
  });

const saveArticle = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator((input: ArticleFormValues) => input)
  .handler(async ({ data }) => {
    let pictureData: Buffer | null = null;
    let pictureMimeType: string | null = null;
    if (data.pictureBase64) {
      const { data: raw } = dataUrlToBuffer(data.pictureBase64);
      const optimized = await optimizeImage(raw);
      pictureData = optimized.data;
      pictureMimeType = optimized.mimeType;
    }
    await prisma.article.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
        pictureData,
        pictureMimeType,
      },
      update: {
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
          pictureBase64: initial.pictureBase64,
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: zero errors anywhere (this was the last file with a dangling `ArticleFormValues` mismatch).

- [ ] **Step 3: Manual verification — full picture lifecycle**

Run: `npm run dev`.
1. Open the article created in Task 4's manual test at `/admin/edit/<slug>`. Confirm the existing picture preview appears already loaded (proves `loadArticle` → `bufferToDataUrl` round-trips correctly).
2. Upload a different picture, save. Reload the edit page — confirm the new picture (not the old one) is what preloads.
3. Click "Quitar imagen", save. Reload the edit page — confirm no preview appears, and check `npx prisma studio` to confirm `pictureData`/`pictureMimeType` are both `null` on that row now.
4. Try uploading a non-image file (e.g. rename a `.txt` file to have an image-like name, or just pick any `.txt`/`.pdf` — the `accept="image/*"` hint doesn't hard-block a determined user from bypassing the file picker filter). Confirm the save fails with the form's existing generic error message, and that `npx prisma studio` shows the row's picture fields unchanged (no partial/corrupt write).

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin_.edit.\$slug.tsx
git commit -m "feat: load, replace, and remove article picture on edit"
```

---

### Task 6: Render the picture on the public article page

**Files:**
- Modify: `src/routes/article.$slug.tsx`

**Interfaces:**
- Consumes: `bufferToDataUrl` (`~/lib/data-url`, Task 2).

- [ ] **Step 1: Update the loader and component**

In `src/routes/article.$slug.tsx`, add the import:

```ts
import { bufferToDataUrl } from "~/lib/data-url";
```

Replace the `getArticle` handler body:

```ts
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
    const html = await renderArticleContent(article.contentHtml);
    const pictureDataUrl =
      article.pictureData && article.pictureMimeType
        ? bufferToDataUrl(Buffer.from(article.pictureData), article.pictureMimeType)
        : null;
    return { ...article, html, pictureDataUrl };
  });
```

In the `ArticlePage` component, insert the picture right after the summary paragraph and before the content `<div>`:

```tsx
      {article.summary && (
        <p className="text-[--color-wiki-muted] italic">{article.summary}</p>
      )}
      {article.pictureDataUrl && (
        <img
          src={article.pictureDataUrl}
          alt={article.title}
          className="float-right ml-4 mb-4 w-72 border border-[--color-wiki-border]"
        />
      )}
      <div dangerouslySetInnerHTML={{ __html: article.html }} />
```

(Only the new `pictureDataUrl` block is new — everything else in that snippet already exists in the file, shown for placement context. Every other part of `article.$slug.tsx` — `NotFoundArticle`, the categories/date/source-link footer, the route config — is unchanged.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: zero errors.

- [ ] **Step 3: Full suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this task adds no new automated tests — `bufferToDataUrl` is already covered by Task 2's suite).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Open `/article/<slug>` for the article with a picture from Tasks 4/5 — confirm the picture renders right-floated near the top. Open a different article that has no picture — confirm the layout is unchanged (no broken image, no empty space).

- [ ] **Step 5: Commit**

```bash
git add src/routes/article.\$slug.tsx
git commit -m "feat: render article presentation picture, right-floated"
```
