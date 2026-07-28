# Admin auth + article editor — design

Date: 2026-07-27

## Problem

Article creation/editing currently lives at public, unauthenticated `/edit/$slug`
(`src/routes/edit.$slug.tsx`). Anyone who finds the URL can create or overwrite
any article. We need a gated `/admin` area, restricted to specific people, for
creating new articles (initially: person entries) and editing existing ones.

## Goals

- `/admin` area requires login via WorkOS AuthKit (Google as the identity
  provider).
- Only emails on an explicit allowlist may use the admin area — logging in
  with WorkOS is not sufficient by itself.
- Reuse the existing raw-HTML article form (title / summary / contentHtml /
  published) rather than building a structured "person" schema. No Prisma
  schema changes.
- Remove the old public `/edit/$slug` route entirely — all editing moves
  behind `/admin`.

## Non-goals

- No structured person fields (birth date, party, role, etc.) — out of
  scope, would need its own design pass.
- No delete-article flow — not requested, skip (YAGNI).
- No DB-backed session table — sessions are a stateless sealed cookie.
- No self-service signup / user management UI — allowlist is an env var,
  edited by redeploying.

## Architecture

**Auth: WorkOS AuthKit (Google connection), sealed cookie session**

- New dependency: `@workos-inc/node`.
- `/admin/login` — page with a "Continuar con Google" button. Submitting
  calls a server fn that builds the WorkOS authorization URL
  (`workos.userManagement.getAuthorizationUrl`, provider `GoogleOAuth`) and
  redirects the browser to it.
- `/admin/callback` — GET route WorkOS redirects back to with a `code` query
  param. Server-side: exchange the code for a WorkOS user
  (`authenticateWithCode`), then seal `{ userId, email }` into an httpOnly,
  secure, signed cookie encrypted with `WORKOS_COOKIE_PASSWORD` (32+ char
  secret). Redirect to `/admin`.
- `/admin/logout` — clears the cookie, redirects to `/admin/login`.
- Session is stateless: no DB table. The cookie is the source of truth,
  verified (unsealed) on each request.

**Access control**

- Every route under `/admin/*` runs a `beforeLoad` guard:
  1. No cookie, or cookie fails to unseal → redirect to `/admin/login`.
  2. Cookie valid but `email` not present in `ADMIN_EMAILS` (comma-separated
     env var) → render a "No autorizado" page with the logged-in email and a
     logout link. Do not redirect back to login (would loop, since WorkOS
     login itself succeeded).
- The guard lives in one shared helper (e.g. `src/lib/admin-auth.ts`) used by
  every admin route's `beforeLoad`, so the allowlist check only exists in one
  place.

## Routes

| Route | Purpose |
|---|---|
| `/admin` | List all articles (slug, title, updatedAt, published). "Nuevo artículo" button. Logout link. |
| `/admin/new` | Blank article form. Accepts optional `?slug=` search param to prefill slug (used by the 404 "crear artículo" link). Title auto-derives a kebab-case slug as the user types; once the user edits the slug field directly, auto-derivation stops overwriting it. |
| `/admin/edit/$slug` | Same form, prefilled from the existing article. Replaces old `/edit/$slug`. |
| `/admin/login` | WorkOS login kickoff. |
| `/admin/callback` | OAuth callback, sets session cookie. |
| `/admin/logout` | Clears session cookie. |

- `src/routes/edit.$slug.tsx` is deleted.
- `src/routes/article.$slug.tsx` — the `NotFoundArticle` "Crear este
  artículo" link changes from `/edit/$slug` to `/admin/new?slug=<slug>`.
  Since `/admin/*` is gated, an unauthenticated visitor clicking it lands on
  `/admin/login` first, then continues to `/admin/new?slug=...` after login
  (standard post-login redirect back to the originally requested URL).

## Data flow

- Article read/write logic is unchanged: reuse/extend the existing
  `loadDraft` / `saveDraft`-shaped server functions from
  `edit.$slug.tsx`, moved into the new `/admin/edit/$slug` and `/admin/new`
  routes (or a shared `src/lib/articles.ts` if that avoids duplication
  between new/edit forms).
- `saveDraft` gains a `published: boolean` field in its input and upsert
  (currently hardcoded `true`).
- No new Prisma models. `Article.published` already exists.

## Env additions (`.env.example`)

```
WORKOS_CLIENT_ID=          # already present
WORKOS_API_KEY=            # already present
WORKOS_REDIRECT_URI="http://localhost:3000/admin/callback"
WORKOS_COOKIE_PASSWORD=    # 32+ char random secret, used to encrypt the session cookie
ADMIN_EMAILS=              # comma-separated allowlist, e.g. "you@example.com"
```

## Error handling

- WorkOS auth exchange fails (bad/expired code) → `/admin/callback` renders
  an error state with a link back to `/admin/login`, does not set a cookie.
- Cookie present but unseal fails (tampered, wrong secret, expired) →
  treated same as "no cookie": redirect to `/admin/login`.
- Valid session, non-allowlisted email → "No autorizado" page (see Access
  control above), not a redirect loop.
- Save fails (DB error) on `/admin/new` or `/admin/edit/$slug` → surface
  inline error in the form, keep entered data, do not navigate away.

## Testing

No automated test suite in this project (manual QA only, consistent with
existing routes). Manual checks before calling this done:

- Visiting `/admin` while logged out redirects to `/admin/login`.
- Logging in with a Google account not on `ADMIN_EMAILS` shows "No
  autorizado", not access.
- Logging in with an allowlisted account reaches `/admin` and lists
  articles.
- `/admin/new`: typing a title auto-fills the slug; editing the slug field
  stops auto-derivation; saving creates the article and it's reachable at
  `/article/$slug`.
- `/admin/edit/$slug` on an existing article loads current values, saving
  updates them.
- The old `/edit/$slug` path no longer exists (404 or route-not-found).
- 404 page's "Crear este artículo" link goes through login (if logged out)
  and lands on `/admin/new` with the slug prefilled.
- Logout clears the session; `/admin` afterward redirects to login again.
