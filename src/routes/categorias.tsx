import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db";

const listCategories = createServerFn({ method: "GET" }).handler(async () =>
  prisma.category.findMany({
    select: {
      slug: true,
      name: true,
      description: true,
      _count: { select: { articles: true } },
    },
    orderBy: { name: "asc" },
  }),
);

export const Route = createFileRoute("/categorias")({
  loader: () => listCategories(),
  component: CategoriesIndexPage,
});

function CategoriesIndexPage() {
  const categories = Route.useLoaderData();
  return (
    <>
      <h1>Categorías</h1>
      {categories.length === 0 ? (
        <p>Todavía no hay categorías.</p>
      ) : (
        <ul>
          {categories.map((c: (typeof categories)[number]) => (
            <li key={c.slug}>
              <Link
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="text-(--color-link) hover:underline"
              >
                {c.name}
              </Link>{" "}
              <span className="text-(--color-muted)">
                ({c._count.articles})
              </span>
              {c.description && <> — {c.description}</>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
