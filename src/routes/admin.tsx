import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";
import { ARTICLE_KINDS, kindLabel, type ArticleKind } from "~/lib/kind";

const listArticles = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async () => {
    return prisma.article.findMany({
      select: { slug: true, title: true, kind: true, updatedAt: true, published: true },
      orderBy: { updatedAt: "desc" },
    });
  });

// No <Outlet /> is rendered below: any sibling `src/routes/admin.*.tsx` file
// (without the `admin_.` escape prefix) would nest under this route and its
// component would never render. Future admin routes must use `admin_.`.
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => ({
    auth: await requireAdmin(location.href),
  }),
  loader: async ({ context }) => {
    if (context.auth.status !== "ok") return [];
    return listArticles();
  },
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const { auth } = Route.useRouteContext();
  const articles = Route.useLoaderData();
  const [kindFilter, setKindFilter] = useState<ArticleKind | "">("");
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  const visible = kindFilter
    ? articles.filter((a: (typeof articles)[number]) => a.kind === kindFilter)
    : articles;

  return (
    <>
      <h1>Administrar artículos</h1>
      <p className="flex gap-4">
        <Link
          to="/admin/new"
          search={{ slug: "" }}
          className="text-(--color-link) hover:underline"
        >
          Nuevo artículo
        </Link>
        <a
          href="/admin/logout"
          className="text-(--color-link) hover:underline"
        >
          Cerrar sesión
        </a>
      </p>
      <label className="block mb-3 text-sm">
        <span className="font-semibold">Filtrar por tipo: </span>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as ArticleKind | "")}
          className="border border-(--color-border) p-1 bg-(--color-surface)"
        >
          <option value="">Todos ({articles.length})</option>
          {ARTICLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)} (
              {articles.filter((a: (typeof articles)[number]) => a.kind === k).length})
            </option>
          ))}
        </select>
      </label>
      <table className="w-full text-sm border border-(--color-border)">
        <thead>
          <tr className="bg-(--color-surface-alt) text-left">
            <th className="p-2">Slug</th>
            <th className="p-2">Título</th>
            <th className="p-2">Tipo</th>
            <th className="p-2">Actualizado</th>
            <th className="p-2">Publicado</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((a: (typeof articles)[number]) => (
            <tr key={a.slug} className="border-t border-(--color-border)">
              <td className="p-2 font-mono">
                <Link
                  to="/admin/edit/$slug"
                  params={{ slug: a.slug }}
                  className="text-(--color-link) hover:underline"
                >
                  {a.slug}
                </Link>
              </td>
              <td className="p-2">{a.title}</td>
              <td className="p-2">{kindLabel(a.kind)}</td>
              <td className="p-2">
                {new Date(a.updatedAt).toLocaleDateString("es-AR")}
              </td>
              <td className="p-2">{a.published ? "Sí" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
