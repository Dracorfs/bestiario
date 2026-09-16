import { prisma } from "~/lib/db";
import { categorySlug, normalizeCategoryNames } from "~/lib/categories";

/**
 * Makes the article's category links exactly match `names`, creating any
 * category that doesn't exist yet. An existing category keeps its stored name:
 * typing a different spelling tags the article, it doesn't rename the tag.
 */
export async function setArticleCategories(articleId: string, names: string[]) {
  const wanted = normalizeCategoryNames(names);
  const slugs = wanted.map(categorySlug);

  const categories = await Promise.all(
    wanted.map((name, i) =>
      prisma.category.upsert({
        where: { slug: slugs[i]! },
        create: { slug: slugs[i]!, name },
        update: {},
        select: { id: true },
      }),
    ),
  );
  const wantedIds = categories.map((c) => c.id);

  await prisma.articleCategory.deleteMany({
    where: { articleId, categoryId: { notIn: wantedIds } },
  });
  if (wantedIds.length > 0) {
    await prisma.articleCategory.createMany({
      data: wantedIds.map((categoryId) => ({ articleId, categoryId })),
      skipDuplicates: true,
    });
  }
}
