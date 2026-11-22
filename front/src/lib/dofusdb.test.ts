import { describe, expect, it } from "vitest";
import { findMarketOcrItems, misreadOePattern } from "@/lib/dofusdb";

describe("findMarketOcrItems", () => {
  it("matches a fuel whose name was truncated mid-phrase", async () => {
    const items = await findMarketOcrItems("Gigantesque Philtre d'Expérience de");
    expect(items.map((item) => item.id)).toEqual([33404]);
  });

  it("prefers the exact fuel over longer names sharing its prefix", async () => {
    const items = await findMarketOcrItems("Gigantesque Philtre d'Amour");
    expect(items.map((item) => item.id)).toEqual([33401]);
  });

  it("lists every fuel sharing an ambiguous prefix", async () => {
    const items = await findMarketOcrItems("Gigantesque Philtre de");
    expect(items.map((item) => item.id).sort()).toEqual([33399, 33400, 33403]);
  });

  it("reads a word-initial C or G as the Œ that Windows OCR misses", () => {
    const name = new RegExp(`^${misreadOePattern("Cil de verre")}$`);
    expect(name.test("oeil-de-verre")).toBe(true);
    expect(name.test("œil de verre")).toBe(true);
    expect(new RegExp(`^${misreadOePattern("Gil")}$`).test("oeil")).toBe(true);
    expect(new RegExp(`^${misreadOePattern("Cape de verre")}$`).test("cape-de-verre")).toBe(true);
  });
});
