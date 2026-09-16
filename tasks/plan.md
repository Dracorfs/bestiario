# Implementation Plan: Reading experience, entity types & content organization

## Overview
Bestiario. currently looks and reads like a plain Wikipedia clone: one generic "article"
type, a flat "recent articles" list on the home page, a hardcoded sidebar, and a footer
that only carries a license line. This plan (1) removes the deprecated Wikipedia import
and its data, (2) fixes a styling bug that silently disables most of the theme,
(3) lets the admin classify each entry as **Persona**, **Organización** or **Víctima**
and shows that everywhere, (4) organizes content with type pages, admin-assignable
categories and a data-driven sidebar, (5) gives reports a softer encyclopedia look
that is easier to read, and (6) removes the footer.

## Decisions (confirmed by Francisco, 2026-09-16)
- Everything related to the Wikipedia import is deprecated and gets deleted: code, script,
  docs, imported rows, and the `Article.sourceUrl` column.
- Exception (2026-09-16, during Task 1): `cristina-fernandez-de-kirchner` is kept. Its body was
  rewritten as original content (bookmark embeds only, no Wikipedia text), so no CC BY-SA
  attribution is owed and the footer/licensing removal stands.
- Victims are full entries with their own page.
- Each entry has exactly one type.
- Keep the encyclopedia look, but softer (see Visual direction).
- Seed categories `presidentes`, `partidos-politicos`, `instituciones` are deleted.
- No DB backup required, on the condition that Francisco's own uploaded articles are never deleted:
  only rows whose `sourceUrl` contains `wikipedia.org` are removed (the admin form never sets `sourceUrl`).

## Current state (findings)
- **Theme colors are broken.** ~50 classes use Tailwind v3 syntax `border-[--color-wiki-border]`.
  Tailwind v4 (installed) doesn't wrap these in `var()`; the built CSS contains
  `border-color:--color-wiki-border` (invalid, ignored). Correct v4 syntax: `border-(--color-wiki-border)`.
  Also affects tweet/bookmark card HTML in `render-article.ts`.
- **Wikipedia import leftovers:** `scripts/scrape.ts`, `npm run seed`, README sections,
  home empty-state ("ejecutá pnpm seed"), `data-internal` link rewriting and comment in
  `wiki-html.ts`, `Article.sourceUrl` + "Fuente original" link, footer license line,
  hardcoded sidebar links to seed categories (`presidentes`, `partidos-politicos`, `instituciones`),
  and the imported rows/categories in the database.
  - Keep: `cheerio` (used by `bookmark-archive.ts` at runtime — should move from
    devDependencies to dependencies), `Tweet.sourceUrl` (unrelated).
- **Only one kind of entry.** `Article` has no type.
- **Admin can't assign categories.** Only the (deprecated) seed script filled them.
- **Home page** = heading + count + 12 latest titles as bullets.
- **Article page**: title, italic summary, floated picture, body, small meta line. No TOC,
  no key-facts card, no related entries. `infoboxJson` and `Revision` are unused.
- **Typography**: 14px body, no max line length, hard grey rules under every heading.

## Architecture Decisions
- **`kind` enum column on `Article`** (`PERSONA | ORGANIZACION | VICTIMA`, default `PERSONA`).
  No backfill script: after the import cleanup, remaining entries are few and the admin
  sets their type by hand from the admin list.
- **Categories are free-form topical tags**, orthogonal to `kind`, assignable in the admin form.
- **Drop `Article.sourceUrl`.** Sources for reports live in the Markdown body (bookmark embeds
  already archive them).
- **Imported data removal is a script with `--dry-run` default**, identifying rows by
  `sourceUrl` containing `wikipedia.org`; it must run *before* the column is dropped.
- **Rename `wiki-*` tokens/classes to neutral names** (`--color-border`, `.prose-entry`, `render-markdown.ts`)
  as part of the visual refresh, so the codebase no longer implies Wikipedia.
- **TOC generated server-side** from `h2/h3` in the rendered HTML.
- **Relations between entries** (`ArticleRelation`) are an optional later phase.

## Visual direction: "soft encyclopedia"
Recommendations (to be validated at Checkpoint A/D):
- **Palette:** warm off-white page `#faf9f6`, white content surface, soft borders `#e4e0d8`,
  text `#1f2328`, muted `#5f6368`, links a deeper, calmer blue `#1f4e8c` (no underline until hover).
- **Type colors (muted, tinted-pill badges, never loud):**
  Persona `#9b2c2c` on `#fbeaea` · Organización `#8a5a00` on `#fbf1dc` · Víctima `#3b5b7a` on `#e8eff6`.
  Víctima pages use no accusatory red anywhere — a quiet "in memoriam"-style header.
- **Typography:** serif for headings (e.g. Source Serif 4 from Google Fonts, Georgia fallback),
  system sans for body at 16–17px, line-height 1.7, article column max ~68ch.
  Headings keep a thin light rule (h2 only), not the heavy grey Wikipedia underline.
- **Shape:** 6–8px radius on cards/badges/embeds, subtle shadow on hover only, generous spacing.
- **Pieces that make it read like an encyclopedia but gentler:** key-facts "ficha" card,
  sticky table of contents on desktop, pull-quote styled blockquotes (tinted background,
  colored left bar), captions under images, dates in small caps.
- **Optional:** dark mode via `prefers-color-scheme`, defined with the same tokens.

## Task List (details in `tasks/todo.md`)

### Phase 1: Cleanup & foundation
- [x] Task 1: Delete Wikipedia-imported rows (script, dry-run first)
- [x] Task 2: Remove Wikipedia import code, docs and `Article.sourceUrl`
- [x] Task 3: Remove footer
- [x] Task 4: Fix Tailwind v4 CSS-variable class syntax

### Checkpoint A
- [x] typecheck, tests, build pass; no "wikipedia/seed/scrape" references left; colors render

### Phase 2: Entity types
- [x] Task 5: Add `kind` enum to schema
- [x] Task 6: Admin can set the type (form + list column/filter)
- [x] Task 7: `KindBadge` + type-specific styling on the article page
- [x] Task 8: Show type on home, search and category listings

### Checkpoint B
- [ ] One entry of each type created end-to-end, badge shown everywhere

### Phase 3: Organization
- [x] Task 9: Type index pages `/personas`, `/organizaciones`, `/victimas`
- [x] Task 10: Admin can assign / create categories
- [x] Task 11: Data-driven sidebar
- [x] Task 12: Home page redesign
- [x] Task 13: Categories index page `/categorias`

### Checkpoint C
- [ ] Every entry reachable via type page and category page; no hardcoded slugs

### Phase 4: Reading experience
- [x] Task 14: Soft-encyclopedia theme (tokens, fonts, renames)
- [x] Task 15: Article header "ficha" card
- [x] Task 16: Auto table of contents
- [x] Task 17: Admin editor for key facts (`infoboxJson`)

### Checkpoint D
- [ ] Long report reads well on desktop and 375px mobile

### Phase 5: Connections (optional)
- [ ] Task 18: `ArticleRelation` model + admin linking
- [ ] Task 19: "Relacionados" block

### Checkpoint E
- [ ] Victim page links to responsible people/orgs and back

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Deleting one of Francisco's own articles | High | Delete strictly by Wikipedia `sourceUrl`; dry-run lists rows and flags any imported row edited after import; count of non-imported articles printed before and after must match |
| Dropping `sourceUrl` before identifying imported rows | High | Task 1 strictly before Task 2 |
| Task 4 turns on colors/borders never seen before | Med | Visual review at Checkpoint A, before theme work |
| `db:push` with enum / dropped column on Neon | Med | Neon branch first; `db:push` shows data-loss warning to confirm |
| Victim pages framed like "bestias" | High (tone) | Separate calm styling for VICTIMA (Task 7, Task 14) |
| Scope creep in redesign | Med | Phase 4 separate; Phase 5 gated on review |

## Open Questions
- Which key facts matter per type? Proposed: Persona — cargo, partido, período; Organización — tipo, fundación, sede; Víctima — fecha, lugar, caso.
- Dark mode now or later?
- Should edit history (`Revision`, unused today) be written on save and shown publicly as proof of changes?
