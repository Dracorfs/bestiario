import { describe, expect, it } from "vitest";
import { parseKeyFacts, suggestedKeys } from "~/lib/key-facts";

describe("parseKeyFacts", () => {
  it("reads the stored array form, keeping order", () => {
    expect(
      parseKeyFacts([
        { key: "Cargo", value: "Ministro" },
        { key: "Partido", value: "PJ" },
      ]),
    ).toEqual([
      { key: "Cargo", value: "Ministro" },
      { key: "Partido", value: "PJ" },
    ]);
  });

  it("returns nothing for null, which is what an untouched entry stores", () => {
    expect(parseKeyFacts(null)).toEqual([]);
  });

  it("drops rows with a blank key or value instead of rendering empty cells", () => {
    expect(
      parseKeyFacts([
        { key: "Cargo", value: "" },
        { key: "   ", value: "PJ" },
        { key: "Período", value: "2003-2007" },
      ]),
    ).toEqual([{ key: "Período", value: "2003-2007" }]);
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(parseKeyFacts(["nope", 42, null, { key: "Sede", value: "CABA" }])).toEqual([
      { key: "Sede", value: "CABA" },
    ]);
  });

  it("accepts a plain object, so hand-written JSON still renders", () => {
    expect(parseKeyFacts({ Cargo: "Fiscal", Caso: "AMIA" })).toEqual([
      { key: "Cargo", value: "Fiscal" },
      { key: "Caso", value: "AMIA" },
    ]);
  });

  it("coerces non-string values to text", () => {
    expect(parseKeyFacts({ Año: 2001 })).toEqual([{ key: "Año", value: "2001" }]);
  });
});

describe("suggestedKeys", () => {
  it("suggests different fields per type", () => {
    expect(suggestedKeys("PERSONA")).toContain("Cargo");
    expect(suggestedKeys("ORGANIZACION")).toContain("Fundación");
    expect(suggestedKeys("VICTIMA")).toContain("Caso");
  });

  it("never suggests the same key twice", () => {
    for (const kind of ["PERSONA", "ORGANIZACION", "VICTIMA"] as const) {
      const keys = suggestedKeys(kind);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
