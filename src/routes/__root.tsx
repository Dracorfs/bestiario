import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
  Link,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import appCss from "~/styles.css?url";
import { prisma } from "~/lib/db";
import { ARTICLE_KINDS, kindPathSegment, kindPlural, type ArticleKind } from "~/lib/kind";

const SIDEBAR_CATEGORY_LIMIT = 8;

const getNav = createServerFn({ method: "GET" }).handler(async () => {
  const [byKind, categories] = await Promise.all([
    prisma.article.groupBy({
      by: ["kind"],
      where: { published: true },
      _count: { _all: true },
    }),
    prisma.category.findMany({
      select: {
        slug: true,
        name: true,
        _count: { select: { articles: true } },
      },
      orderBy: [{ articles: { _count: "desc" } }, { name: "asc" }],
      take: SIDEBAR_CATEGORY_LIMIT,
    }),
  ]);
  const counts = Object.fromEntries(
    byKind.map((row) => [row.kind, row._count._all]),
  ) as Record<ArticleKind, number | undefined>;
  return {
    kindCounts: ARTICLE_KINDS.map((kind) => ({ kind, count: counts[kind] ?? 0 })),
    categories,
  };
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bestiario. — Carpetazos argentinos" },
      {
        name: "description",
        content:
          "Bestiario. la pokedex de la política argentina.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  loader: () => getNav(),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        <main className="max-w-[1100px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
          <article className="prose-wiki min-w-0">{children}</article>
          <Sidebar />
        </main>
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="border-b border-(--color-wiki-border) bg-(--color-wiki-sidebar)">
      <div className="max-w-[1100px] mx-auto px-4 py-3 flex items-center gap-6">
        <Link to="/" className="flex items-baseline gap-2 no-underline">
          <span className="text-2xl font-serif font-bold tracking-tight">
            Bestiario<span className="text-(--color-bestiario-accent)">.</span>
          </span>
          <span className="text-xs text-(--color-wiki-muted)">
            la pokedex de la política argentina
          </span>
        </Link>
        <form action="/search" method="get" className="ml-auto flex gap-2">
          <input
            type="search"
            name="q"
            placeholder="Buscar en Bestiario."
            className="border border-(--color-wiki-border) px-2 py-1 text-sm w-72 bg-white"
          />
          <button
            type="submit"
            className="border border-(--color-wiki-border) px-3 py-1 text-sm bg-white hover:bg-(--color-wiki-sidebar)"
          >
            Buscar
          </button>
        </form>
      </div>
    </header>
  );
}

function Sidebar() {
  const { kindCounts, categories } = Route.useLoaderData();
  return (
    <aside className="text-sm space-y-4">
      <nav className="border border-(--color-wiki-border) p-3 bg-(--color-wiki-sidebar)">
        <h3 className="font-serif text-base mb-2 border-b border-(--color-wiki-border) pb-1">
          Navegación
        </h3>
        <ul className="space-y-1">
          <li>
            <Link to="/" className="text-(--color-wiki-link) hover:underline">
              Portada
            </Link>
          </li>
          {kindCounts.map(({ kind, count }: { kind: ArticleKind; count: number }) => (
            <li key={kind}>
              <Link
                to="/$kind"
                params={{ kind: kindPathSegment(kind) }}
                search={{ orden: "az" as const }}
                className="text-(--color-wiki-link) hover:underline"
              >
                {kindPlural(kind)}
              </Link>{" "}
              <span className="text-(--color-wiki-muted)">({count})</span>
            </li>
          ))}
        </ul>
      </nav>
      {categories.length > 0 && (
        <nav className="border border-(--color-wiki-border) p-3 bg-(--color-wiki-sidebar)">
          <h3 className="font-serif text-base mb-2 border-b border-(--color-wiki-border) pb-1">
            Categorías
          </h3>
          <ul className="space-y-1">
            {categories.map((c: (typeof categories)[number]) => (
              <li key={c.slug}>
                <Link
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="text-(--color-wiki-link) hover:underline"
                >
                  {c.name}
                </Link>{" "}
                <span className="text-(--color-wiki-muted)">({c._count.articles})</span>
              </li>
            ))}
            <li className="pt-1">
              <Link to="/categorias" className="text-(--color-wiki-link) hover:underline">
                Todas las categorías
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </aside>
  );
}
