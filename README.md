# Bestiario.

Enciclopedia colaborativa centrada en la **política argentina**.

Stack: TanStack Start (React 19 + Vite) · Tailwind v4 · Prisma · Neon Postgres.

## Setup

```bash
npm install
cp .env.example .env   # then paste your Neon DATABASE_URL + DIRECT_URL
npm run db:generate    # generate Prisma client from schema
npm run db:push        # create tables on Neon
npm run dev            # http://localhost:3000
```

### Prisma workflow

- Edit `prisma/schema.prisma`, then run one of:
  - `npm run db:push` — dev-fast, sync schema straight to Neon, no migration file
  - `npm run db:migrate` — create + apply a versioned migration (use before commit if schema shared)
- After any schema change (push or migrate), client stale until `npm run db:generate` reruns
- `npm run db:studio` — browse/edit rows in Prisma Studio GUI
- `DATABASE_URL` = pooled connection (runtime), `DIRECT_URL` = direct connection (migrations) — both required in `.env`

## Scripts

| Script | What |
|---|---|
| `dev` | Vite dev server |
| `build` | Production build |
| `db:push` | Sync Prisma schema to Neon (no migration files) |
| `db:migrate` | Create + apply a migration |
| `db:studio` | Prisma Studio GUI |

## Layout

```
src/
  routes/         file-based TanStack routes
  lib/            db client, markdown renderer
  styles.css      tailwind + theme
prisma/
  schema.prisma   Article / Revision / Category / ArticleCategory
```
