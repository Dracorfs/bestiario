# Article presentation picture — design

Date: 2026-08-05

## Problem

Articles have no featured/presentation picture. The admin create/edit form
(`src/lib/article-form.tsx`) has no way to attach one, and the public
article page (`src/routes/article.$slug.tsx`) has nothing to render even if
one existed. We want admins to upload a picture per article from the
create/edit form, and have it appear on the public article page.

## Goals

- Admin create/edit form gets a file-upload control to add, replace, or
  remove an article's presentation picture, with a live preview.
- Uploaded pictures are optimized (resized/re-encoded) before storage,
  reusing the existing `optimizeImage()` helper from `src/lib/tweet-media.ts`
  — the same sharp-based pipeline already used for tweet media.
- The public article page renders the picture, right-aligned, in the same
  visual slot the old Wikipedia-style infobox card used to occupy (removed
  earlier from this codebase) — floated right of the article text.

## Non-goals

- No thumbnails on the admin article list, category pages, or search
  results — none of those currently render any imagery, and none were
  requested. Out of scope; would need its own design pass if wanted later.
- No image cropping/editing UI — upload as-is, server-side resize only
  (fit-inside, no manual crop).
- No dedicated upload error messaging — a bad/corrupt file surfaces through
  the form's existing generic save-error message
  ("No se pudo guardar el artículo...").
- No multipart/`FormData` server-fn plumbing — the picture travels as a
  base64 `data:` URL inside the existing JSON `ArticleFormValues` payload,
  matching how every other field in this form already works.

## Architecture

**Data model** — two new nullable columns directly on `Article` (not a
separate table: one picture per article, unlike `Tweet`'s one-to-many
`TweetMedia`):

```prisma
model Article {
  // ...existing fields...
  pictureData     Bytes?
  pictureMimeType String?
}
```

**Upload/save flow:**

- `src/lib/article-form.tsx`: add an `<input type="file" accept="image/*">`
  to `ArticleForm`. On selection, read the file client-side via
  `FileReader.readAsDataURL`, store the result (a base64 `data:` URL) in
  component state, and show a live `<img>` preview. A "Quitar imagen"
  button clears the state (sets it to `null`) and removes the preview.
- `ArticleFormValues` (currently `{ slug, title, summary, contentHtml,
  published }`) gains one field: `pictureBase64: string | null`. The form
  submits this value on every save, same as every other field — no
  partial-update tri-state ("unchanged" is just "resubmit the same value
  the form loaded with").
- `createArticle` (`src/routes/admin_.new.tsx`) and `saveArticle`
  (`src/routes/admin_.edit.$slug.tsx`) handlers: if `pictureBase64` is
  non-null, strip the `data:...;base64,` prefix, decode to a `Buffer`, run
  it through `optimizeImage()`, and store the result's `data`/`mimeType` as
  `pictureData`/`pictureMimeType`. If `pictureBase64` is `null`, set both
  columns to `null` (clears any existing picture). A thrown error here
  (e.g. `optimizeImage` rejects non-image bytes) propagates through the
  handler's existing try/catch on the client (`ArticleForm`'s `onSubmit`
  already catches and shows the generic error message — no new error
  handling needed).
- `loadArticle` (`src/routes/admin_.edit.$slug.tsx`): select
  `pictureData`/`pictureMimeType` alongside the other fields, and convert
  to a `data:` URL (`data:${mimeType};base64,${data.toString("base64")}`)
  when present, so the edit form loads with the existing picture already
  shown in the preview.

**Render:**

- `getArticle` (`src/routes/article.$slug.tsx`): select
  `pictureData`/`pictureMimeType` alongside the existing fields.
- `ArticlePage` component: when present, render a right-floated `<img>`
  (reusing the `float-right` styling the removed `Infobox` component used
  to occupy) with the picture as a `data:` URI — no new asset-serving route,
  consistent with how tweet media is already inlined.

## Error handling

- Non-image or corrupt upload: `optimizeImage()` (via `sharp`) throws,
  the save fails, the form shows its existing generic error message.
  No new error-handling code needed — this reuses the try/catch already
  in `ArticleForm`'s `onSubmit`.
- No picture ever uploaded, or explicitly removed: `pictureData` is
  `null`, `ArticlePage` renders nothing extra (existing article layout
  unchanged).

## Testing

- No new automated test infrastructure needed for this feature specifically
  — `optimizeImage()` is already covered by `tweet-media.test.ts`.
- Manual: upload a picture on a new article, confirm it appears on the
  public page (right-floated); edit an existing article's picture (replace
  and remove), confirm both save correctly and the preview reflects the
  loaded state; attempt to upload a non-image file, confirm the generic
  save-error message appears and no partial data is written.
