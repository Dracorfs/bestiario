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
- [ ] Schema synced; client regenerated; existing rows have a kind
**Verification:** typecheck; `db:studio`
**Dependencies:** Checkpoint A
**Files likely touched:** `prisma/schema.prisma`
**Estimated scope:** XS

## Task 6: Admin can set the type
**Description:** Add `kind` to `ArticleFormValues`; required segmented control "Persona · Organización · Víctima" in `ArticleForm`; persist in create/edit; "Tipo" column + filter in `/admin`.
**Acceptance criteria:**
- [ ] New and edited entries save the chosen type
- [ ] Admin list shows and filters by type
**Verification:** typecheck + build; manual create one of each, change one
**Dependencies:** Task 5
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`, `src/routes/admin.tsx`
**Estimated scope:** Medium

## Task 7: `KindBadge` + type-specific article styling
**Description:** `src/lib/kind.ts` (labels, plurals, paths, color tokens) and `src/components/KindBadge.tsx` (tinted pill). Type tokens in `styles.css` (Persona red, Organización ochre, Víctima slate blue). Article page: badge above title, thin top accent in type color; Víctima uses a calm memorial header with no red.
**Acceptance criteria:**
- [ ] Badge on article page for all three types
- [ ] Labels/colors defined once in `kind.ts`
**Verification:** unit test `kind.test.ts`; manual on three types
**Dependencies:** Task 5
**Files likely touched:** `src/lib/kind.ts`, `src/lib/kind.test.ts`, `src/components/KindBadge.tsx`, `src/styles.css`, `src/routes/article.$slug.tsx`
**Estimated scope:** Medium

## Task 8: Type shown in listings
**Description:** Select `kind` in home, search, category loaders; render `KindBadge` per row. Search gets `tipo` filter (`/search?q=…&tipo=persona`).
**Acceptance criteria:**
- [ ] Every listing row shows its type
- [ ] Type filter works and persists in URL
**Verification:** build; manual
**Dependencies:** Task 7
**Files likely touched:** `src/routes/index.tsx`, `src/routes/search.tsx`, `src/routes/category.$slug.tsx`
**Estimated scope:** Small

## Checkpoint B
- [ ] One entry of each type created in admin and shown correctly everywhere
- [ ] Review with Francisco

---

## Phase 3: Organization

## Task 9: Type index pages
**Description:** `/personas`, `/organizaciones`, `/victimas` (one dynamic route) with a card grid (thumbnail, title, summary), sort A–Z / recent. Serve thumbnails via an image route (`/picture/$slug`) instead of base64 in lists; never serialize raw `pictureData`.
**Acceptance criteria:**
- [ ] Each page lists only its type; unknown type → 404
- [ ] Thumbnails load from the image route
**Verification:** build; manual all three
**Dependencies:** Task 7
**Files likely touched:** `src/routes/tipo.$kind.tsx`, `src/routes/picture.$slug.ts`, `src/components/EntryCard.tsx`, `src/lib/kind.ts`
**Estimated scope:** Medium

## Task 10: Admin can assign / create categories
**Description:** Category multi-select in `ArticleForm` with inline "nueva categoría"; save `ArticleCategory` on create/edit (replace set on edit).
**Acceptance criteria:**
- [ ] Selected categories show on the article page
- [ ] New category creatable without leaving the form
**Verification:** typecheck + build; manual
**Dependencies:** Task 6
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`, `src/lib/categories.ts`
**Estimated scope:** Medium

## Task 11: Data-driven sidebar
**Description:** Sidebar: Portada · Personas (n) · Organizaciones (n) · Víctimas (n) · top categories · "Todas las categorías". Loaded in root loader; hardcoded seed slugs removed.
**Acceptance criteria:**
- [ ] No hardcoded category slugs in `__root.tsx`
- [ ] Counts match published entries
**Verification:** build; manual
**Dependencies:** Tasks 9, 10
**Files likely touched:** `src/routes/__root.tsx`, `src/components/Sidebar.tsx`
**Estimated scope:** Small

## Task 12: Home page redesign
**Description:** Hero ("Internet no olvida. Vos no olvides." + counts per type), "Últimos carpetazos" card grid, one short section per type with "ver todos"; friendly empty state.
**Acceptance criteria:**
- [ ] Sections per type linking to index pages
- [ ] Looks right with 0, 1 and many entries
**Verification:** build; manual desktop + mobile
**Dependencies:** Tasks 9, 11
**Files likely touched:** `src/routes/index.tsx`, `src/components/EntryCard.tsx`
**Estimated scope:** Small

## Task 13: Categories index page
**Description:** `/categorias` with descriptions and counts; category page groups entries by type.
**Acceptance criteria:**
- [ ] All categories listed with counts
- [ ] Category page grouped by Personas / Organizaciones / Víctimas
**Verification:** build; manual
**Dependencies:** Task 10
**Files likely touched:** `src/routes/categorias.tsx`, `src/routes/category.$slug.tsx`
**Estimated scope:** Small

## Checkpoint C
- [ ] Every published entry reachable from a type page and (if tagged) a category page
- [ ] Review with Francisco

---

## Phase 4: Reading experience

## Task 14: Soft-encyclopedia theme
**Description:** Apply the visual direction in `plan.md`: neutral token names (`--color-border`, `--color-link`, …) replacing `--color-wiki-*`, `.prose-entry` replacing `.prose-wiki`, rename `wiki-html.ts` → `render-markdown.ts`; warm palette, serif headings (Google Fonts) + 16–17px sans body, ~68ch column, softer heading rules, tinted blockquotes, rounded embeds/cards, image captions; header search collapses on mobile.
**Acceptance criteria:**
- [ ] No `wiki` names left in `src`
- [ ] No horizontal scroll at 375px; article lines ≤ ~75 chars on desktop
**Verification:** tests + build; manual at 375px / 1280px
**Dependencies:** Checkpoint C
**Files likely touched:** `src/styles.css`, `src/routes/__root.tsx`, `src/lib/wiki-html.ts`, `src/lib/render-article.ts` (+ class-name updates across routes via find/replace)
**Estimated scope:** Medium–Large (mostly mechanical renames; split if it grows)

## Task 15: Article header "ficha"
**Description:** Header card replacing the floated picture: picture, type badge, title, summary, key facts (`infoboxJson`), categories, last edit. Stacks on mobile.
**Acceptance criteria:**
- [ ] Renders with/without picture and facts
**Verification:** build; manual on 3 types
**Dependencies:** Task 14
**Files likely touched:** `src/routes/article.$slug.tsx`, `src/components/ArticleHeader.tsx`
**Estimated scope:** Small

## Task 16: Auto table of contents
**Description:** Add unique slug `id`s to `h2`/`h3` during rendering and return a heading list; TOC sticky on desktop, collapsible on mobile, shown when ≥3 headings.
**Acceptance criteria:**
- [ ] `/article/x#seccion` anchors work; duplicates get unique ids
**Verification:** unit tests in `render-article.test.ts`; manual
**Dependencies:** Task 14
**Files likely touched:** `src/lib/render-markdown.ts`, `src/lib/render-article.ts`, `src/lib/render-article.test.ts`, `src/routes/article.$slug.tsx`
**Estimated scope:** Medium

## Task 17: Admin editor for key facts
**Description:** Key/value row editor in `ArticleForm` saved to `infoboxJson`, with suggested keys per type.
**Acceptance criteria:**
- [ ] Facts saved, reloaded on edit, shown in the ficha
**Verification:** typecheck + build; manual
**Dependencies:** Tasks 6, 15
**Files likely touched:** `src/lib/article-form.tsx`, `src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`
**Estimated scope:** Medium

## Checkpoint D
- [ ] A long real report reads well on desktop and mobile
- [ ] Review with Francisco before Phase 5

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
