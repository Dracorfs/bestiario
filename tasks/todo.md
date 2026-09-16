# Tasks — Cleanup, entity types, organization & reading experience

Common verification commands: `npm run typecheck` · `npm test` · `npm run build` · `npm run dev`

---

## Phase 1: Cleanup & foundation

## Task 1: Delete Wikipedia-imported rows
**Description:** Add a one-off script `scripts/remove-wikipedia-imports.ts` that finds articles whose `sourceUrl` contains `wikipedia.org`, prints slug/title/updatedAt, and only deletes them (revisions/category links cascade) when run with `--apply`. Also deletes the categories `presidentes`, `partidos-politicos`, `instituciones` (only their tag links cascade; articles are untouched). Prints the count of non-imported articles before and after; they must match. Flags imported rows whose `updatedAt` differs from `createdAt` (possibly edited by hand). Script is deleted again in Task 2 after it has run.
**Acceptance criteria:**
- [x] Dry-run output reviewed and approved by Francisco
- [x] After `--apply`, no article has a Wikipedia `sourceUrl` (column dropped in Task 2;
      `cristina-fernandez-de-kirchner` kept by request — content is original, not imported)
**Verification:**
- [x] Non-imported article count identical before/after `--apply` (17 → 17; total 18)
- [x] Site still loads; imported rows gone
**Dependencies:** None
**Files likely touched:** `scripts/remove-wikipedia-imports.ts`
**Estimated scope:** Small

## Task 2: Remove Wikipedia import code, docs and `Article.sourceUrl`
**Description:** Delete `scripts/scrape.ts` (and the Task 1 script), the `seed` npm script, the README seed/licensing sections and layout entry, the `data-internal` rewrite + Wikipedia comment in `wiki-html.ts`, the home empty-state that mentions seeding (replace with a neutral visitor message), the "Fuente original" link, and the `sourceUrl` column on `Article` (`db:push` + `db:generate`). Move `cheerio` from devDependencies to dependencies (runtime use in `bookmark-archive.ts`). Keep `Tweet.sourceUrl`.
**Acceptance criteria:**
- [x] `grep -rin "wikipedia\|scrape\|seed" src README.md package.json prisma` returns nothing
      (`scripts/` deleted entirely)
- [x] `Article` has no `sourceUrl`; `Tweet.sourceUrl` intact
- [x] cheerio moved to `dependencies` — it stays external in the server bundle, so the prod
      install must provide it
**Verification:**
- [x] `npm run typecheck`, `npm test` (293 passing), `npm run build`
- [x] Manual: home and article pages render
**Dependencies:** Task 1
**Files likely touched:** `scripts/scrape.ts`, `package.json`, `README.md`, `prisma/schema.prisma`, `src/lib/wiki-html.ts`, `src/routes/index.tsx`, `src/routes/article.$slug.tsx`
**Estimated scope:** Medium (mostly deletions)

## Task 3: Remove footer
**Description:** Delete the `Footer` component and its usage in `__root.tsx`. No attribution is needed once imported content is gone.
**Acceptance criteria:**
- [x] No footer on any page
**Verification:** build; manual — confirmed in browser
**Dependencies:** Task 1 (imported CC BY-SA content must be gone first)
**Files likely touched:** `src/routes/__root.tsx`
**Estimated scope:** XS

## Task 4: Fix Tailwind v4 CSS-variable class syntax
**Description:** Replace every `x-[--var]` class with `x-(--var)`, including HTML strings in `render-article.ts`.
**Acceptance criteria:**
- [x] `grep -rn "\[--" src` returns nothing (62 replacements across 13 files)
- [x] Built CSS uses `var(--color-wiki-border)`; zero unresolved `:--color-` rules left
      (needed `@import "tailwindcss" source("../src")` — Tailwind v4 was also scanning the
      Markdown plans in `docs/`, which still contain the old v3 classes)
- [x] Header, sidebar and bookmark cards show borders and colors (admin table not re-checked:
      requires login)
**Verification:** `npm test`, build, manual
**Dependencies:** None
**Files likely touched:** `src/routes/*.tsx`, `src/lib/article-form.tsx`, `src/lib/render-article.ts`, `src/lib/render-article.test.ts`, `src/lib/admin-auth.tsx`
**Estimated scope:** Medium (mechanical)

## Checkpoint A
- [x] typecheck, tests, build clean
- [ ] Visual review with Francisco before design work
- Also done here (listed under Phase 1 in `plan.md`, not in any task): removed the three
  hardcoded seed-category links from the sidebar — the categories were deleted in Task 1, so
  they were dead links. Sidebar now shows only "Portada" until Task 11 makes it data-driven.
- Uncommitted: all Phase 1 work is in the working tree on `main`.

---

## Phase 2: Entity types

## Task 5: Add `kind` enum
**Description:** `enum ArticleKind { PERSONA ORGANIZACION VICTIMA }`, `kind ArticleKind @default(PERSONA)`, `@@index([kind])` on `Article`. `db:push` + `db:generate`. Remaining entries get their type set by hand in Task 6.
**Acceptance criteria:**
- [x] Schema synced; client regenerated; all 18 existing rows defaulted to PERSONA
**Verification:** typecheck; groupBy count
Note: a running dev server keeps the old generated client in memory — restart it after
`db:generate` or every query with the new column fails at runtime.
**Dependencies:** Checkpoint A
**Files likely touched:** `prisma/schema.prisma`
**Estimated scope:** XS

## Task 6: Admin can set the type
**Description:** Add `kind` to `ArticleFormValues`; required segmented control "Persona · Organización · Víctima" in `ArticleForm`; persist in create/edit; "Tipo" column + filter in `/admin`.
**Acceptance criteria:**
- [x] `kind` added to `ArticleFormValues`, segmented control in the form, persisted in
      create + both branches of the edit upsert
- [x] Admin list shows a "Tipo" column and filters by type (counts per type in the dropdown)
**Verification:** typecheck + build pass. Manual create/edit NOT run — the admin area needs a
WorkOS login, and the dev server is on port 5180 (3000 is taken by another app), so the
OAuth redirect URI does not match. Francisco verifies this at Checkpoint B.
**Dependencies:** Task 5
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`, `src/routes/admin.tsx`
**Estimated scope:** Medium

## Task 7: `KindBadge` + type-specific article styling
**Description:** `src/lib/kind.ts` (labels, plurals, paths, color tokens) and `src/components/KindBadge.tsx` (tinted pill). Type tokens in `styles.css` (Persona red, Organización ochre, Víctima slate blue). Article page: badge above title, thin top accent in type color; Víctima uses a calm memorial header with no red.
**Acceptance criteria:**
- [x] Badge + coloured top rule on the article page
- [x] Labels, plurals, URL segments and colour tokens defined once in `kind.ts`
**Verification:** `kind.test.ts` (14 cases). Manual check done with PERSONA only — every entry
is currently PERSONA. The other two are covered indirectly: the tests pin each token name and
all six `--color-kind-*` rules are present in the built CSS.
Note: badge/accent classes are written out literally per kind. Tailwind generates utilities by
scanning source text, so a class built by string interpolation is never emitted.
**Dependencies:** Task 5
**Files likely touched:** `src/lib/kind.ts`, `src/lib/kind.test.ts`, `src/components/KindBadge.tsx`, `src/styles.css`, `src/routes/article.$slug.tsx`
**Estimated scope:** Medium

## Task 8: Type shown in listings
**Description:** Select `kind` in home, search, category loaders; render `KindBadge` per row. Search gets `tipo` filter (`/search?q=…&tipo=persona`).
**Acceptance criteria:**
- [x] Home, search and category rows all render a `KindBadge`
- [x] `/search?q=…&tipo=persona` filters and persists; an unknown `tipo` is normalised away in
      `validateSearch` rather than silently returning no results
**Verification:** build; manual — verified in browser
**Dependencies:** Task 7
**Files likely touched:** `src/routes/index.tsx`, `src/routes/search.tsx`, `src/routes/category.$slug.tsx`
**Estimated scope:** Small

## Checkpoint B
- [ ] One entry of each type created in admin and shown correctly everywhere — FRANCISCO:
      needs the admin login, so it cannot be done from here. Assigning types to the existing
      18 entries is also an editorial call, not a migration.
- [ ] Review with Francisco

---

## Phase 3: Organization

## Task 9: Type index pages
**Description:** `/personas`, `/organizaciones`, `/victimas` (one dynamic route) with a card grid (thumbnail, title, summary), sort A–Z / recent. Serve thumbnails via an image route (`/picture/$slug`) instead of base64 in lists; never serialize raw `pictureData`.
**Acceptance criteria:**
- [x] Each page lists only its type; `/empresas` → 404
- [x] Thumbnails load from `/picture/$slug`; the listing payload carries no image bytes
**Verification:** build; manual all three, plus curl on the image route (200 + webp bytes +
ETag, 404 when the entry has no picture)
Decisions taken here (the plan was ambiguous):
- URLs are `/personas` etc. per the acceptance criteria, so the route is a root-level
  `$kind.tsx`, not the `tipo.$kind.tsx` the plan listed. Static routes still win over it.
- `/picture/$slug` is a `server.handlers.GET` on a normal file route. This version of
  TanStack Start has no separate server-route files — no upgrade was needed.
- `list-none` sits on the card `<li>`: `.prose-wiki ul { list-style: disc }` outranks a
  utility on the `<ul>`, but a declaration on the item beats what it would inherit.
**Dependencies:** Task 7
**Files likely touched:** `src/routes/tipo.$kind.tsx`, `src/routes/picture.$slug.ts`, `src/components/EntryCard.tsx`, `src/lib/kind.ts`
**Estimated scope:** Medium

## Task 10: Admin can assign / create categories
**Description:** Category multi-select in `ArticleForm` with inline "nueva categoría"; save `ArticleCategory` on create/edit (replace set on edit).
**Acceptance criteria:**
- [x] Category checkboxes + inline "nueva categoría" in the form; the edit upsert replaces
      the whole set
- [x] Names are matched by slug, so "JUECES" and "Jueces" cannot create two rows; an existing
      category keeps its stored name rather than being renamed by a new spelling
**Verification:** typecheck + build; `categories.test.ts` (8 cases). Manual NOT run — admin
login, same blocker as Task 6.
**Dependencies:** Task 6
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`, `src/lib/categories.ts`
**Estimated scope:** Medium

## Task 11: Data-driven sidebar
**Description:** Sidebar: Portada · Personas (n) · Organizaciones (n) · Víctimas (n) · top categories · "Todas las categorías". Loaded in root loader; hardcoded seed slugs removed.
**Acceptance criteria:**
- [x] No hardcoded category slugs in `__root.tsx`; the root loader supplies everything
- [x] Counts match published entries (Personas 18, Organizaciones 0, Víctimas 0)
**Verification:** build; manual
Note: the Categorías block, and with it "Todas las categorías", is hidden while no category
exists. `/categorias` is reachable by URL and appears in the sidebar as soon as one is created.
**Dependencies:** Tasks 9, 10
**Files likely touched:** `src/routes/__root.tsx`, `src/components/Sidebar.tsx`
**Estimated scope:** Small

## Task 12: Home page redesign
**Description:** Hero ("Internet no olvida. Vos no olvides." + counts per type), "Últimos carpetazos" card grid, one short section per type with "ver todos"; friendly empty state.
**Acceptance criteria:**
- [x] Hero with per-type counts, "Últimos carpetazos" card grid, one section per type with
      "Ver todos"
- [x] Empty state verified (`/victimas`, `/categorias`); the 0-entry home state is a separate
      early return
**Verification:** build; manual desktop + mobile
Note: at 375px the header's search box overflows. Pre-existing, and Task 14 covers it.
**Dependencies:** Tasks 9, 11
**Files likely touched:** `src/routes/index.tsx`, `src/components/EntryCard.tsx`
**Estimated scope:** Small

## Task 13: Categories index page
**Description:** `/categorias` with descriptions and counts; category page groups entries by type.
**Acceptance criteria:**
- [x] All categories listed with counts and descriptions
- [x] Category page grouped by Personas / Organizaciones / Víctimas, empty groups omitted
**Verification:** build; manual — only the empty state could be seen, since nothing is tagged
yet.
**Dependencies:** Task 10
**Files likely touched:** `src/routes/categorias.tsx`, `src/routes/category.$slug.tsx`
**Estimated scope:** Small

## Checkpoint C
- [x] Every published entry is reachable from a type page (all 18 via /personas)
- [ ] Category paths unverified end-to-end: no entry is tagged yet, and tagging needs the
      admin login — same blocker as Checkpoint B
- [ ] Review with Francisco

---

## Phase 4: Reading experience

## Task 14: Soft-encyclopedia theme
**Description:** Apply the visual direction in `plan.md`: neutral token names (`--color-border`, `--color-link`, …) replacing `--color-wiki-*`, `.prose-entry` replacing `.prose-wiki`, rename `wiki-html.ts` → `render-markdown.ts`; warm palette, serif headings (Google Fonts) + 16–17px sans body, ~68ch column, softer heading rules, tinted blockquotes, rounded embeds/cards, image captions; header search collapses on mobile.
**Acceptance criteria:**
- [x] No `wiki` names left in `src` (tokens, `.prose-entry`, `render-markdown.ts`)
- [x] No horizontal scroll at 375px (measured: scrollWidth == innerWidth, no element past the
      viewport); article lines measured at 73 characters
**Verification:** tests + build; manual at 375px / desktop
Deviation: the measure is `58ch`, not the plan's `68ch`. `ch` is the width of "0", wider than
the average letter, so 68ch rendered ~86 characters per line. It lives on a `.reading-column`
class applied to running text, not on the article wrapper, so card grids keep full width.
**Dependencies:** Checkpoint C
**Files likely touched:** `src/styles.css`, `src/routes/__root.tsx`, `src/lib/wiki-html.ts`, `src/lib/render-article.ts` (+ class-name updates across routes via find/replace)
**Estimated scope:** Medium–Large (mostly mechanical renames; split if it grows)

## Task 15: Article header "ficha"
**Description:** Header card replacing the floated picture: picture, type badge, title, summary, key facts (`infoboxJson`), categories, last edit. Stacks on mobile.
**Acceptance criteria:**
- [x] Renders with and without a picture, with and without facts
**Verification:** build; manual (CFK has facts, others don't; Aníbal Fernández has no picture)
The header loads its image from `/picture/$slug`, so the article payload no longer carries a
base64 copy either. `infoboxJson` had no defined shape; `key-facts.ts` pins one and parses
permissively (array form, plain-object form, junk dropped) — 8 tests.
**Dependencies:** Task 14
**Files likely touched:** `src/routes/article.$slug.tsx`, `src/components/ArticleHeader.tsx`
**Estimated scope:** Small

## Task 16: Auto table of contents
**Description:** Add unique slug `id`s to `h2`/`h3` during rendering and return a heading list; TOC sticky on desktop, collapsible on mobile, shown when ≥3 headings.
**Acceptance criteria:**
- [x] Anchors work; repeated headings get `-2`, `-3` suffixes; a hand-written id is kept
**Verification:** `headings.test.ts` (9 cases); manual
Put in a new `headings.ts` rather than `render-markdown.ts`, so `renderArticleContent` keeps
its signature and its existing tests. Shown at >= 3 headings, `<details open>` so it folds on a
phone and sticks beside the text on desktop.
Bug found in review: heading text went to React as a raw string, so `&quot;` showed literally
in the TOC. Entities are now decoded.
**Dependencies:** Task 14
**Files likely touched:** `src/lib/render-markdown.ts`, `src/lib/render-article.ts`, `src/lib/render-article.test.ts`, `src/routes/article.$slug.tsx`
**Estimated scope:** Medium

## Task 17: Admin editor for key facts
**Description:** Key/value row editor in `ArticleForm` saved to `infoboxJson`, with suggested keys per type.
**Acceptance criteria:**
- [x] Key/value row editor with per-type suggested keys via `<datalist>`; blank rows are
      dropped on save; empty set stores `Prisma.JsonNull`
**Verification:** typecheck + build. Manual NOT run — admin login, same blocker as Task 6.
**Dependencies:** Tasks 6, 15
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`
**Estimated scope:** Medium

## Checkpoint D
- [x] Long report checked on desktop and at 375px (`marcelo-nieto-di-biase`, 7 headings)
- [ ] Review with Francisco before Phase 5
- OPEN, for Francisco: `cristina-fernandez-de-kirchner` still carries the Wikipedia infobox in
  `infoboxJson` — 35 fields, with footnote markers ([b], [4]) and run-together values like
  "Máximo KirchnerFlorencia Kirchner". It was invisible until Task 15 started rendering it, and
  it is the last imported Wikipedia data in the database. Trim it in the new editor, or say the
  word and it gets cleared.
- Still unanswered from the plan's Open Questions: dark mode (deferred), and whether `Revision`
  should be written on save.

---

## Phase 5: Connections (optional)

## Task 18: `ArticleRelation` model + admin linking
**Description:** `ArticleRelation { fromId, toId, label }` ("miembro de", "responsable de", "víctima de"); admin picker to add/remove links.
**Acceptance criteria:**
- [ ] Admin can add/remove relations; deleting an entry cascades
**Verification:** db:push, typecheck, manual
**Dependencies:** Checkpoint D
**Files likely touched:** `prisma/schema.prisma`, `src/lib/article-form.tsx`, `src/routes/admin_.edit.$slug.tsx`
**Estimated scope:** Medium

## Task 19: "Relacionados" block
**Description:** Article page lists related entries in both directions, grouped by type with badges.
**Acceptance criteria:**
- [ ] A victim page lists linked people/orgs, and those pages link back
**Verification:** build; manual
**Dependencies:** Task 18
**Files likely touched:** `src/routes/article.$slug.tsx`, `src/components/RelatedEntries.tsx`
**Estimated scope:** Small

## Checkpoint E
- [ ] All acceptance criteria met; ready for review
