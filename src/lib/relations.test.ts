import { describe, expect, it } from "vitest";
import {
  RELATION_LABELS,
  incomingHeading,
  isRelationLabel,
  outgoingHeading,
} from "~/lib/relations";

describe("RELATION_LABELS", () => {
  it("offers the three labels from the plan", () => {
    expect(RELATION_LABELS).toEqual(["miembro de", "responsable de", "víctima de"]);
  });
});

describe("isRelationLabel", () => {
  it("accepts a known label and rejects anything else", () => {
    expect(isRelationLabel("responsable de")).toBe(true);
    expect(isRelationLabel("amigo de")).toBe(false);
    expect(isRelationLabel("")).toBe(false);
  });
});

describe("outgoingHeading", () => {
  it("reads as the subject's own relation", () => {
    expect(outgoingHeading("miembro de")).toBe("Miembro de");
    expect(outgoingHeading("responsable de")).toBe("Responsable de");
    expect(outgoingHeading("víctima de")).toBe("Víctima de");
  });
});

describe("incomingHeading", () => {
  it("flips the relation, so the target page reads correctly", () => {
    expect(incomingHeading("miembro de")).toBe("Miembros");
    expect(incomingHeading("responsable de")).toBe("Responsables");
    expect(incomingHeading("víctima de")).toBe("Víctimas");
  });

  it("never reuses an outgoing heading, which would make direction ambiguous", () => {
    for (const label of RELATION_LABELS) {
      expect(incomingHeading(label)).not.toBe(outgoingHeading(label));
    }
  });
});
