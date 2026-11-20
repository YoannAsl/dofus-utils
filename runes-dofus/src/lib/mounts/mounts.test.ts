import { describe, expect, it } from "vitest";
import { getMountFamily } from "@/lib/mounts/family";
import { completeMountName, mountName, parseMountName, readMountList } from "@/lib/mounts/names";
import { birthOutcomes, offspringChances } from "@/lib/mounts/offspring";
import { planStable, PlannerError } from "@/lib/mounts/planner";

const volkorne = getMountFamily("volkorne");
const mount = (name: string) => parseMountName(name, volkorne)!;

describe("mount names", () => {
  it("reads sex, colour and parents from a 13-letter name", () => {
    expect(mount("FPOORPOPOOROR")).toMatchObject({ sex: "F", colourId: "pourpre_orchidee", parentIds: ["pourpre", "orchidee"], wild: false });
    expect(mount("mpopoSAUVSAUV")).toMatchObject({ code: "MPOPOSAUVSAUV", colourId: "pourpre", parentIds: [], wild: true });
    expect(mount("MPOPOSAUV")).toMatchObject({ code: "MPOPOSAUVSAUV", wild: true });
  });

  it("accepts a two-colour code in either order", () => {
    expect(mount("FORPOPOPOOROR").colourId).toBe("pourpre_orchidee");
  });

  it("rejects unknown colour codes", () => {
    expect(parseMountName("FZZZZSAUVSAUV", volkorne)).toBeNull();
    expect(parseMountName("FPOORPOPO", volkorne)).toBeNull();
  });

  it("builds the in-game name, sorted unless the recipe order is kept", () => {
    expect(mountName(volkorne, { colourId: "pourpre_orchidee", sex: "F", parentIds: ["pourpre", "orchidee"] })).toBe("FORPOORORPOPO");
    expect(mountName(volkorne, { colourId: "pourpre_orchidee", sex: "F", parentIds: ["pourpre", "orchidee"], keepOrder: true })).toBe("FPOORPOPOOROR");
    expect(mountName(volkorne, { colourId: "indigo", sex: "M" })).toBe("MININSAUVSAUV");
  });

  it("completes a name the game cut with an ellipsis, using the mount's own colour", () => {
    expect(completeMountName("FPOORPOPOOR…", volkorne)).toEqual({ code: "FPOORPOPOPOOR", completed: true });
    expect(completeMountName("FPOORPOPO", volkorne)).toBeNull();
  });

  it("reads JSON or free text lists and reports what it refused", () => {
    const fromJson = readMountList('```json\n{"mounts": ["FPOORPOPOOROR", "MXXXX"], "illisibles": ["F??"]}\n```', volkorne);
    expect(fromJson).toMatchObject({ codes: ["FPOORPOPOOROR"], refused: ["MXXXX"], unreadable: ["F??"] });
    const fromText = readMountList("FPOPOSAUVSAUV, MININSAUVSAUV\nMPOORPOPOOR...", volkorne);
    expect(fromText.codes).toEqual(["FPOPOSAUVSAUV", "MININSAUVSAUV", "MPOORPOPOPOOR"]);
    expect(fromText.completed).toEqual([{ from: "MPOORPOPOOR...", to: "MPOORPOPOPOOR" }]);
  });
});

describe("offspring", () => {
  it("gives 42% to the two-colour child of two wild G1, the rest split between the parents", () => {
    const chances = offspringChances(volkorne, mount("MPOPOSAUVSAUV"), mount("FORORSAUVSAUV"));
    expect(chances.map(({ colourId, probability }) => [colourId, Number(probability.toFixed(2))])).toEqual([
      ["pourpre_orchidee", 0.42],
      ["orchidee", 0.29],
      ["pourpre", 0.29],
    ]);
  });

  it("names each possible baby after its colour and both parents", () => {
    const outcomes = birthOutcomes(volkorne, mount("MPOPOSAUVSAUV"), mount("FORORSAUVSAUV"));
    expect(outcomes.map((outcome) => [outcome.labels.join(" + "), outcome.nameSuffix])).toEqual([
      ["Réussie", "POORPOPOOROR"],
      ["Comme le père", "POPOPOPOOROR"],
      ["Comme la mère", "ORORPOPOOROR"],
    ]);
  });
});

describe("stable planner", () => {
  const stable = [
    "FPOPOSAUVSAUV",
    "MPOPOSAUVSAUV",
    "MORORSAUVSAUV",
    "FININSAUVSAUV",
    "MININSAUVSAUV",
    "FEBEBSAUVSAUV",
    "MEBEBSAUVSAUV",
    "FOROROROROROR",
    "MPOORPOPOOROR",
    "FPOORPOPOOROR",
    "MPOINPOPOININ",
    "FPOEBPOPOEBEB",
    "FPOPOPOPOOROR",
    "not a mount",
  ];

  it("pairs the stable towards the next generation and explains what to add", () => {
    const plan = planStable({ family: "volkorne", mounts: stable });
    expect(plan.read).toBe(13);
    expect(plan.rejected).toEqual([{ index: 13, code: "not a mount" }]);
    expect(plan.pairings.map((pairing) => [pairing.pair.join(" × "), pairing.target])).toEqual([
      ["MPOINPOPOININ × FPOORPOPOOROR", "roux"],
      ["MPOORPOPOOROR × FPOEBPOPOEBEB", "roux"],
      ["MININSAUVSAUV × FPOPOSAUVSAUV", "pourpre_indigo"],
      ["MPOPOSAUVSAUV × FININSAUVSAUV", "pourpre_indigo"],
      ["MEBEBSAUVSAUV × FOROROROROROR", "orchidee_ebene"],
      ["MORORSAUVSAUV × FEBEBSAUVSAUV", "orchidee_ebene"],
    ]);
    expect(plan.rebalance).toEqual([expect.objectContaining({ nodeId: "orchidee", females: 0, males: 1 })]);
    expect(plan.rebalanceNote).toBe("1 monture sans partenaire possible aujourd'hui ; les G1 conseillées en débloquent 1.");
    // Une Pourpre née de Pourpre × Orchidée vise moins bien sa couleur : le plan la laisse de côté.
    expect(plan.impures.map((impure) => impure.code)).toEqual(["FPOPOPOPOOROR"]);
  });

  it("refuses a success run with nothing left to obtain", () => {
    expect(() => planStable({ family: "volkorne", mounts: stable, mode: "success", missing: {} })).toThrow(PlannerError);
  });

  it("in success mode, only breeds towards the missing colours", () => {
    const plan = planStable({ family: "volkorne", mounts: stable, mode: "success", missing: { pourpre_indigo: 1 } });
    expect(plan.pairings.filter((pairing) => pairing.intended).every((pairing) => pairing.intended === "pourpre_indigo")).toBe(true);
    expect(plan.pairings.some((pairing) => pairing.intended === "pourpre_indigo")).toBe(true);
  });
});
