import { describe, expect, it } from "vitest";
import { matchColour, readBirth } from "@/lib/mounts/birth-reading";
import { getMountFamily } from "@/lib/mounts/family";
import type { Pairing } from "@/lib/mounts/planner";

const volkorne = getMountFamily("volkorne");
const birth = { child: "Roux", generation: 3, left_parent: "Pourpre et Orchidee", right_parent: "Pourpre ct Ébéne", sex: "F" as const, father: "right" as const };
const gameBirth = { child: "Émeraude et Pourpre", generation: 6, left_parent: "Pourpre", right_parent: "Emeraude", sex: "M" as const };

describe("birth reading", () => {
  it("matches colour names despite OCR slips", () => {
    expect(matchColour(volkorne, "Pourpre ct Ébéne")).toBe("pourpre_ebene");
    expect(matchColour(volkorne, "Orchidée et Pourpre")).toBe("pourpre_orchidee");
    expect(matchColour(volkorne, "Roux", 3)).toBe("roux");
    expect(matchColour(volkorne, "Rx")).toBeNull();
  });

  it("takes the parent card marked ♂ as father when no pairing matches", () => {
    expect(readBirth(volkorne, birth)).toMatchObject({ childId: "roux", sex: "F", fatherId: "pourpre_ebene", motherId: "pourpre_orchidee", names: { F: "FROROPOEBPOOR" }, pairingIndex: null });
    expect(readBirth(volkorne, { ...gameBirth, father: "left" })).toMatchObject({ fatherId: "pourpre", motherId: "emeraude" });
  });

  it("falls back to the left parent as father when the icons are unreadable", () => {
    const reading = readBirth(volkorne, gameBirth);
    expect(reading).toMatchObject({ sex: "M", fatherId: "pourpre", motherId: "emeraude" });
    expect(readBirth(volkorne, { ...gameBirth, father: null })).toEqual(reading);
  });

  const pairing = (pair: [string, string]): Pairing => ({ pair, potion: null, final: false, target: "roux" });
  const reciprocal = [pairing(["MEBPOEBEBPOPO", "FORPOORORPOPO"]), pairing(["MORPOORORPOPO", "FEBPOEBEBPOPO"])];

  it("takes the father and mother from the matching pairing, skipping done ones", () => {
    const reading = readBirth(volkorne, { ...birth, father: null }, reciprocal, new Set([0]));
    expect(reading).toMatchObject({ pairingIndex: 1, fatherId: "pourpre_orchidee", names: { F: "FROROORPOEBPO" } });
  });

  it("tells reciprocal pairings apart by the parent card marked ♂", () => {
    expect(readBirth(volkorne, birth, reciprocal)).toMatchObject({ pairingIndex: 0, fatherId: "pourpre_ebene", names: { F: "FROROEBPOORPO" } });
    expect(readBirth(volkorne, { ...birth, father: "left" }, reciprocal)).toMatchObject({ pairingIndex: 1, names: { F: "FROROORPOEBPO" } });
    expect(readBirth(volkorne, birth, reciprocal, new Set([0]))).toMatchObject({ pairingIndex: 0 });
  });

  it("prefers the pairing in progress when several match", () => {
    const twice = [reciprocal[0]!, reciprocal[0]!];
    expect(readBirth(volkorne, birth, twice)).toMatchObject({ pairingIndex: 0 });
    expect(readBirth(volkorne, birth, twice, new Set(), 1)).toMatchObject({ pairingIndex: 1 });
  });

  it("reports an unreadable colour instead of guessing", () => {
    expect(readBirth(volkorne, { ...birth, child: "%%" })).toEqual({ error: "couleur du petit illisible (« %% »)" });
  });
});
