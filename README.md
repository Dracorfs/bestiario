# Bestiario.

Enciclopedia colaborativa centrada en la **política argentina**.

Stack: TanStack Start (React 19 + Vite) · Tailwind v4 · Prisma · Neon Postgres.

## Setup

```bash
npm install
cp .env.example .env   # then paste your Neon DATABASE_URL + DIRECT_URL
npm run db:push        # create tables on Neon
npm run seed           # import ~10 seed articles from es.wikipedia
npm run dev            # http://localhost:3000
```

## Scripts

| Script | What |
|---|---|
| `dev` | Vite dev server |
| `build` | Production build |
| `db:push` | Sync Prisma schema to Neon (no migration files) |
| `db:migrate` | Create + apply a migration |
| `db:studio` | Prisma Studio GUI |
| `seed` | Scrape seed pages from es.wikipedia |

## Layout

```
src/
  routes/         file-based TanStack routes
  lib/            db client, html rewriter
  styles.css      tailwind + wiki theme
prisma/
  schema.prisma   Article / Revision / Category / ArticleCategory
scripts/
  scrape.ts       seeder
```

## Content & licensing

Seed content imported from Wikipedia in Spanish under **CC BY-SA 4.0**.
Every imported article keeps a `sourceUrl` linking back to the original.
