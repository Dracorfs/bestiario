import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render stored article content (Markdown, with raw HTML passed through
 * verbatim per CommonMark) and rewrite internal links so `<a data-internal="slug">`
 * becomes a real link to /article/<slug>.
 *
 * Scraped Wikipedia bodies are already HTML — marked leaves embedded HTML
 * untouched, so this also works unchanged for that legacy content.
 */
export function renderWikiHtml(source: string): string {
  const html = marked.parse(source, { async: false });
  return html.replace(
    /<a\b([^>]*?)\sdata-internal="([^"]+)"([^>]*)>/g,
    (_m, pre, slug, post) =>
      `<a${pre} href="/article/${slug}"${post}>`,
  );
}
