import { describe, expect, test } from "vitest";
import { chancesFromDifficulty, exoChances, fmItem, fmRune, matchEffect, runeOdds, runesFor, trackReading, type FmReading } from "@/lib/smithmagic";

const row = (value: number, label: string, min: number | null, max: number | null, percent = false) => ({ value, label, min, max, percent, text: `${value} ${label}` });

const padgref: FmReading = {
  item: "ANNEAU DE PADGREF",
  reliquat: 3.2,
  rows: [
    row(43, "Vitalité", 71, 100),
    row(34, "Intelligence", 41, 60),
    row(43, "Agilité", 41, 60),
    row(35, "Sagesse", 31, 40),
    row(5, "Critique", 4, 6, true),
    row(1, "Portée", 1, 1),
    row(1, "Invocation", 1, null),
    row(6, "Dommages Feu", 5, 7),
    row(6, "Dommages Air", 5, 7),
    row(8, "Résistance Eau", 6, 8, true),
    row(8, "Résistances Terre", 7, 10),
    row(10, "Résistances Air", 7, 10),
    row(12, "Dommages Critiques", 8, 12),
  ],
};

describe("matchEffect", () => {
  test("reads the labels the game shows", () => {
    expect(matchEffect("Vitalité", false)?.characteristic).toBe(11);
    expect(matchEffect("Critique", true)?.characteristic).toBe(18);
    expect(matchEffect("Dommages Critiques", false)?.characteristic).toBe(86);
    expect(matchEffect("Dommage Feu", false)?.characteristic).toBe(89);
    expect(matchEffect("Invocations", false)?.characteristic).toBe(26);
  });

  test("tells percent resistances from fixed ones", () => {
    expect(matchEffect("Résistance Eau", true)?.characteristic).toBe(35);
    expect(matchEffect("Résistances Terre", false)?.characteristic).toBe(54);
  });

  test("tolerates small misreads and rejects noise", () => {
    expect(matchEffect("Vitollté", false)?.characteristic).toBe(11);
    expect(matchEffect("Saaesse", false)?.characteristic).toBe(12);
    expect(matchEffect("reliquat", false)).toBeNull();
  });
});

describe("runes", () => {
  test("keeps the rune, Pa and Ra of a characteristic", () => {
    expect(runesFor(11).map((rune) => rune.value)).toEqual([5, 15, 50]);
    expect(fmRune(runesFor(11)[0]!)).toEqual({ characteristic: 11, value: 5, weight: 1 });
    expect(fmRune(runesFor(121)[0]!).weight).toBe(10);
  });
});

describe("odds", () => {
  test("splits a difficulty into critical, neutral and failure", () => {
    expect(chancesFromDifficulty(10, false)).toEqual({ sc: 45, sn: 50, ec: 5 });
    expect(chancesFromDifficulty(120, true)).toEqual({ sc: 2, sn: 32.5, ec: 65.5 });
  });

  test("gives AP, MP and range exos a fixed critical success", () => {
    expect(exoChances(1, 100)).toEqual({ sc: 1.5, sn: 0, ec: 98.5, estimated: false });
  });

  test("computes the odds of the runes on the read item", () => {
    const item = fmItem(trackReading(null, padgref), 200);
    const vi = runeOdds(item, fmRune(runesFor(11)[0]!));
    expect(vi.blocked).toBeUndefined();
    if (vi.blocked) return;
    expect(vi.regime).toBe("normal");
    expect(vi.sc + vi.sn + vi.ec).toBeCloseTo(100);

    const critical = runeOdds(item, fmRune(runesFor(86)[0]!));
    if (critical.blocked) throw new Error("blocked");
    expect(critical.regime).toBe("over");
    expect(critical.sc).toBeLessThan(vi.sc);
    expect(runeOdds(item, fmRune(runesFor(89)[0]!))).toMatchObject({ regime: "step" });

    expect(runeOdds(item, fmRune(runesFor(1)[0]!))).toMatchObject({ regime: "exo", sc: 1.5 });
  });
});

describe("trackReading", () => {
  test("keeps lines scrolled out of view and fills ranges missed by the OCR", () => {
    const first = trackReading(null, { ...padgref, rows: [row(1, "Invocation", 1, 1), row(5, "Tacle", 4, 6)] });
    const second = trackReading(first, padgref);

    expect(second.lines.find((line) => line.effect.characteristic === 26)).toMatchObject({ min: 1, max: 1, visible: true });
    expect(second.lines.find((line) => line.effect.characteristic === 79)).toMatchObject({ value: 5, visible: false });
    expect(second.reliquat).toBe(3.2);
  });

  test("starts over on another item", () => {
    const first = trackReading(null, { ...padgref, rows: [row(5, "Tacle", 4, 6)] });
    const other = trackReading(first, { item: "Cape Bouffante", reliquat: 0, rows: [row(10, "Force", 5, 10)] });

    expect(other.lines.map((line) => line.effect.characteristic)).toEqual([10]);
  });
});
