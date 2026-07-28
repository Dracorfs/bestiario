import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
  Link,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bestiario. — Enciclopedia política argentina" },
      {
        name: "description",
        content:
          "Bestiario. es una enciclopedia colaborativa centrada en la política argentina.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
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
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="border-b border-[--color-wiki-border] bg-[--color-wiki-sidebar]">
      <div className="max-w-[1100px] mx-auto px-4 py-3 flex items-center gap-6">
        <Link to="/" className="flex items-baseline gap-2 no-underline">
          <span className="text-2xl font-serif font-bold tracking-tight">
            Bestiario<span className="text-[--color-bestiario-accent]">.</span>
          </span>
          <span className="text-xs text-[--color-wiki-muted]">
            la enciclopedia política argentina
          </span>
        </Link>
        <form action="/search" method="get" className="ml-auto flex gap-2">
          <input
            type="search"
            name="q"
            placeholder="Buscar en Bestiario."
            className="border border-[--color-wiki-border] px-2 py-1 text-sm w-72 bg-white"
          />
          <button
            type="submit"
            className="border border-[--color-wiki-border] px-3 py-1 text-sm bg-white hover:bg-[--color-wiki-sidebar]"
          >
            Buscar
          </button>
        </form>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="text-sm space-y-4">
      <nav className="border border-[--color-wiki-border] p-3 bg-[--color-wiki-sidebar]">
        <h3 className="font-serif text-base mb-2 border-b border-[--color-wiki-border] pb-1">
          Navegación
        </h3>
        <ul className="space-y-1">
          <li>
            <Link to="/" className="text-[--color-wiki-link] hover:underline">
              Portada
            </Link>
          </li>
          <li>
            <Link
              to="/category/$slug"
              params={{ slug: "presidentes" }}
              className="text-[--color-wiki-link] hover:underline"
            >
              Presidentes
            </Link>
          </li>
          <li>
            <Link
              to="/category/$slug"
              params={{ slug: "partidos-politicos" }}
              className="text-[--color-wiki-link] hover:underline"
            >
              Partidos políticos
            </Link>
          </li>
          <li>
            <Link
              to="/category/$slug"
              params={{ slug: "instituciones" }}
              className="text-[--color-wiki-link] hover:underline"
            >
              Instituciones
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[--color-wiki-border] mt-12 py-4 text-center text-xs text-[--color-wiki-muted]">
      Bestiario. — contenido bajo licencia CC BY-SA. Datos seed importados de
      Wikipedia en español.
    </footer>
  );
}
