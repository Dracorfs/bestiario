import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "~/lib/db";

/**
 * Serves an entry's presentation picture as raw bytes.
 *
 * Listings link to this URL instead of embedding data URLs: a grid of cards
 * would otherwise ship every image inline in the loader payload, and the
 * browser could never cache them separately from the page.
 */
export const Route = createFileRoute("/picture/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const article = await prisma.article.findUnique({
          where: { slug: params.slug },
          select: { pictureData: true, pictureMimeType: true, updatedAt: true },
        });
        if (!article?.pictureData || !article.pictureMimeType) {
          return new Response("Not found", { status: 404 });
        }
        const body = Buffer.from(article.pictureData);
        const etag = `W/"${article.updatedAt.getTime()}-${body.byteLength}"`;
        return new Response(body, {
          headers: {
            "Content-Type": article.pictureMimeType,
            "Content-Length": String(body.byteLength),
            "Cache-Control": "public, max-age=300, must-revalidate",
            ETag: etag,
          },
        });
      },
    },
  },
});
