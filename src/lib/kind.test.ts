import { describe, expect, it } from "vitest";
import {
  ARTICLE_KINDS,
  isArticleKind,
  kindAccentClass,
  kindBadgeClass,
  kindFromPathSegment,
  kindFromQueryValue,
  kindLabel,
  kindPathSegment,
  kindQueryValue,
  kindPlural,
} from "~/lib/kind";

describe("ARTICLE_KINDS", () => {
  it("lists the three types in display order", () => {
    expect(ARTICLE_KINDS).toEqual(["PERSONA", "ORGANIZACION", "VICTIMA"]);
  });
});

describe("kindLabel", () => {
  it("labels each type in Spanish, with accents", () => {
    expect(kindLabel("PERSONA")).toBe("Persona");
    expect(kindLabel("ORGANIZACION")).toBe("Organización");
    expect(kindLabel("VICTIMA")).toBe("Víctima");
  });
});

describe("isArticleKind", () => {
  it("accepts a known type", () => {
    expect(isArticleKind("VICTIMA")).toBe(true);
  });

  it("rejects an unknown or lowercase value", () => {
    expect(isArticleKind("EMPRESA")).toBe(false);
    expect(isArticleKind("persona")).toBe(false);
  });
});

describe("kindPlural", () => {
  it("pluralizes each label for index pages and listings", () => {
    expect(kindPlural("PERSONA")).toBe("Personas");
    expect(kindPlural("ORGANIZACION")).toBe("Organizaciones");
    expect(kindPlural("VICTIMA")).toBe("Víctimas");
  });
});

describe("kindPathSegment", () => {
  it("uses accent-free, lowercase URL segments", () => {
    expect(kindPathSegment("PERSONA")).toBe("personas");
    expect(kindPathSegment("ORGANIZACION")).toBe("organizaciones");
    expect(kindPathSegment("VICTIMA")).toBe("victimas");
  });
});

describe("kindFromPathSegment", () => {
  it("round-trips every kind through its path segment", () => {
    for (const kind of ARTICLE_KINDS) {
      expect(kindFromPathSegment(kindPathSegment(kind))).toBe(kind);
    }
  });

  it("returns null for an unknown segment", () => {
    expect(kindFromPathSegment("empresas")).toBeNull();
    expect(kindFromPathSegment("Personas")).toBeNull();
  });
});

describe("kindBadgeClass", () => {
  it("gives each kind its own colour token pair", () => {
    const classes = ARTICLE_KINDS.map(kindBadgeClass);
    expect(new Set(classes).size).toBe(ARTICLE_KINDS.length);
  });

  it("references the kind colour tokens in Tailwind v4 syntax", () => {
    expect(kindBadgeClass("PERSONA")).toContain("text-(--color-kind-persona-fg)");
    expect(kindBadgeClass("PERSONA")).toContain("bg-(--color-kind-persona-bg)");
    expect(kindBadgeClass("ORGANIZACION")).toContain("text-(--color-kind-organizacion-fg)");
    expect(kindBadgeClass("ORGANIZACION")).toContain("bg-(--color-kind-organizacion-bg)");
    expect(kindBadgeClass("VICTIMA")).toContain("text-(--color-kind-victima-fg)");
    expect(kindBadgeClass("VICTIMA")).toContain("bg-(--color-kind-victima-bg)");
  });
});

describe("kindAccentClass", () => {
  it("borders in each kind's own foreground token", () => {
    expect(kindAccentClass("PERSONA")).toBe("border-(--color-kind-persona-fg)");
    expect(kindAccentClass("ORGANIZACION")).toBe("border-(--color-kind-organizacion-fg)");
    expect(kindAccentClass("VICTIMA")).toBe("border-(--color-kind-victima-fg)");
  });
});

describe("kindQueryValue", () => {
  it("uses the singular, lowercase form in URLs", () => {
    expect(kindQueryValue("PERSONA")).toBe("persona");
    expect(kindQueryValue("ORGANIZACION")).toBe("organizacion");
    expect(kindQueryValue("VICTIMA")).toBe("victima");
  });
});

describe("kindFromQueryValue", () => {
  it("round-trips every kind through its query value", () => {
    for (const kind of ARTICLE_KINDS) {
      expect(kindFromQueryValue(kindQueryValue(kind))).toBe(kind);
    }
  });

  it("returns null for an empty or unknown value", () => {
    expect(kindFromQueryValue("")).toBeNull();
    expect(kindFromQueryValue("empresa")).toBeNull();
  });
});
