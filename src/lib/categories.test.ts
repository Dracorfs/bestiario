import { describe, expect, it } from "vitest";
import { categorySlug, normalizeCategoryNames } from "~/lib/categories";

describe("categorySlug", () => {
  it("lowercases and strips accents", () => {
    expect(categorySlug("Partidos Políticos")).toBe("partidos-politicos");
  });

  it("collapses punctuation and spaces into single hyphens", () => {
    expect(categorySlug("Jueces  &  fiscales")).toBe("jueces-fiscales");
  });

  it("trims leading and trailing hyphens", () => {
    expect(categorySlug("  ¡Corrupción!  ")).toBe("corrupcion");
  });

  it("folds ñ to n, so 'Año' and 'Ano' collapse to one slug", () => {
    expect(categorySlug("Año 2001")).toBe("ano-2001");
    expect(categorySlug("Ano 2001")).toBe("ano-2001");
  });
});

describe("normalizeCategoryNames", () => {
  it("drops blank entries", () => {
    expect(normalizeCategoryNames(["Jueces", "   ", ""])).toEqual(["Jueces"]);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCategoryNames(["  Jueces  "])).toEqual(["Jueces"]);
  });

  it("removes duplicates that share a slug, keeping the first spelling", () => {
    expect(normalizeCategoryNames(["Jueces", "JUECES", "jueces"])).toEqual(["Jueces"]);
  });

  it("rejects a name that slugifies to nothing", () => {
    expect(normalizeCategoryNames(["!!!", "Jueces"])).toEqual(["Jueces"]);
  });
});
