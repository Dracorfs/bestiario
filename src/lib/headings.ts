export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// marked only ever emits the first five, but hand-written HTML in an article
// body can carry the Spanish accents, so those are covered too.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
  Uuml: "Ü",
};

/**
 * The heading text goes into React as a plain string, so entities left in it
 * would be shown literally ("&quot;") instead of the character they stand for.
 * `&amp;` is decoded last so "&amp;quot;" does not turn into a quote.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      if (name.toLowerCase() === "amp") return match;
      return NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? match;
    })
    .replace(/&amp;/g, "&");
}

function textContent(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Adds an anchor id to every h2/h3 in rendered article HTML and returns the
 * headings in document order, for the table of contents.
 *
 * Ids must be unique within the page or `#anchor` links jump to the wrong
 * section, so a repeat gets a numeric suffix. A heading that already has an
 * id keeps it — a hand-written anchor is someone's deliberate permalink.
 */
export function extractHeadings(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const out = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (match, levelStr: string, attrs: string, inner: string) => {
      const level = Number(levelStr) as 2 | 3;
      const text = textContent(inner);

      const existing = /\bid="([^"]*)"/.exec(attrs);
      if (existing) {
        const id = existing[1]!;
        used.add(id);
        headings.push({ id, text, level });
        return match;
      }

      const base = slugifyHeading(text) || `seccion-${headings.length + 1}`;
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      headings.push({ id, text, level });

      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    },
  );

  return { html: out, headings };
}
