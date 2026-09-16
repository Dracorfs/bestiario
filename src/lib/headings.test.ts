import { describe, expect, it } from "vitest";
import { extractHeadings } from "~/lib/headings";

describe("extractHeadings", () => {
  it("gives h2 and h3 an id and reports level and text", () => {
    const { html, headings } = extractHeadings("<h2>La causa</h2><h3>Detalle</h3>");
    expect(html).toBe('<h2 id="la-causa">La causa</h2><h3 id="detalle">Detalle</h3>');
    expect(headings).toEqual([
      { id: "la-causa", text: "La causa", level: 2 },
      { id: "detalle", text: "Detalle", level: 3 },
    ]);
  });

  it("leaves h1 and h4 alone", () => {
    const { html, headings } = extractHeadings("<h1>Título</h1><h4>Nota</h4>");
    expect(html).toBe("<h1>Título</h1><h4>Nota</h4>");
    expect(headings).toEqual([]);
  });

  it("strips accents when building the id", () => {
    const { headings } = extractHeadings("<h2>Investigación</h2>");
    expect(headings[0]!.id).toBe("investigacion");
  });

  it("makes repeated headings unique so anchors never collide", () => {
    const { headings } = extractHeadings("<h2>Causa</h2><h2>Causa</h2><h3>Causa</h3>");
    expect(headings.map((h) => h.id)).toEqual(["causa", "causa-2", "causa-3"]);
  });

  it("uses the text content when the heading contains markup", () => {
    const { headings } = extractHeadings('<h2>La <em>otra</em> causa</h2>');
    expect(headings[0]).toEqual({ id: "la-otra-causa", text: "La otra causa", level: 2 });
  });

  it("decodes HTML entities, so a quoted nickname is not rendered as &quot;", () => {
    const { headings } = extractHeadings(
      "<h2>Fernando &quot;El Loco&quot; C&aacute;rdenas &amp; otros</h2>",
    );
    expect(headings[0]!.text).toBe('Fernando "El Loco" Cárdenas & otros');
    expect(headings[0]!.id).toBe("fernando-el-loco-cardenas-otros");
  });

  it("keeps an id the heading already carries", () => {
    const { html, headings } = extractHeadings('<h2 id="fijo">Causa</h2>');
    expect(html).toBe('<h2 id="fijo">Causa</h2>');
    expect(headings[0]!.id).toBe("fijo");
  });

  it("falls back to a positional id when the text has no usable characters", () => {
    const { headings } = extractHeadings("<h2>¿?</h2>");
    expect(headings[0]!.id).toBe("seccion-1");
  });

  it("preserves other attributes on the heading", () => {
    const { html } = extractHeadings('<h2 class="x">Causa</h2>');
    expect(html).toBe('<h2 class="x" id="causa">Causa</h2>');
  });
});
