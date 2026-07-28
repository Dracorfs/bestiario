import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";
import { adminOnly, NotAuthorized, requireAdmin } from "~/lib/admin-auth";

const listArticles = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async () => {
    return prisma.article.findMany({
      select: { slug: true, title: true, updatedAt: true, published: true },
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
  if (auth.status === "unauthorized") return <NotAuthorized email={auth.email} />;

  return (
    <>
      <h1>Administrar artículos</h1>
      <p className="flex gap-4">
        <Link
          to="/admin/new"
          search={{ slug: "" }}
          className="text-[--color-wiki-link] hover:underline"
        >
          Nuevo artículo
        </Link>
        <a
          href="/admin/logout"
          className="text-[--color-wiki-link] hover:underline"
        >
          Cerrar sesión
        </a>
      </p>
      <table className="w-full text-sm border border-[--color-wiki-border]">
        <thead>
          <tr className="bg-[--color-wiki-sidebar] text-left">
            <th className="p-2">Slug</th>
            <th className="p-2">Título</th>
            <th className="p-2">Actualizado</th>
            <th className="p-2">Publicado</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a: (typeof articles)[number]) => (
            <tr key={a.slug} className="border-t border-[--color-wiki-border]">
              <td className="p-2 font-mono">
                <Link
                  to="/admin/edit/$slug"
                  params={{ slug: a.slug }}
                  className="text-[--color-wiki-link] hover:underline"
                >
                  {a.slug}
                </Link>
              </td>
              <td className="p-2">{a.title}</td>
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
