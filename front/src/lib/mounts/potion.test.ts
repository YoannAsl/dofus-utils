import { describe, expect, it } from "vitest";
import { breedingGraph } from "@/lib/mounts/breeding-graph";
import { getMountFamily } from "@/lib/mounts/family";
import { choosePotions, freePartnerSlots } from "@/lib/mounts/potion";

const graph = breedingGraph(getMountFamily("volkorne").colours);

describe("free partner slots", () => {
  it("counts the partners of the opposite sex that nothing else needs", () => {
    const stable = { graph, counts: { ivoire_turquoise: 1 }, females: { ivoire_turquoise: 1 } };
    expect(freePartnerSlots(stable, "turquoise_indigo", "M", 3)).toBe(1);
    expect(freePartnerSlots(stable, "turquoise_indigo", "F", 3)).toBe(0);
  });

  it("does not count a partner another colour already pairs with", () => {
    const stable = { graph, counts: { ivoire_turquoise: 1, turquoise_orchidee: 1 }, females: { ivoire_turquoise: 1 } };
    expect(freePartnerSlots(stable, "turquoise_indigo", "M", 3)).toBe(0);
  });

  it("never runs out for a colour that can pair with a capturable G1", () => {
    expect(freePartnerSlots({ graph, counts: {}, females: {} }, "amande", "F", 3)).toBe(Infinity);
  });
});

describe("potions", () => {
  const attempts = (childId: string, count: number) => Array.from({ length: count }, () => ({ childId, chance: 0.42 }));

  it("asks for the sex whose partners are waiting", () => {
    const stable = { graph, counts: { emeraude_pourpre: 3 }, females: { emeraude_pourpre: 3 } };
    expect(choosePotions({ ...stable, attempts: attempts("prune_roux", 2) })).toEqual(["M", "M"]);
    const males = { graph, counts: { emeraude_pourpre: 3 }, females: {} };
    expect(choosePotions({ ...males, attempts: attempts("prune_roux", 1) })).toEqual(["F"]);
  });

  it("skips the potion when either sex would find a partner", () => {
    const stable = { graph, counts: { emeraude_pourpre: 2 }, females: { emeraude_pourpre: 1 } };
    expect(choosePotions({ ...stable, attempts: attempts("prune_roux", 1) })).toEqual([null]);
  });

  it("skips the potion when no partner exists yet for either sex", () => {
    expect(choosePotions({ graph, counts: {}, females: {}, attempts: attempts("prune_roux", 2) })).toEqual([null, null]);
  });

  it("skips colours that pair with capturable G1", () => {
    expect(choosePotions({ graph, counts: {}, females: {}, attempts: attempts("amande", 3) })).toEqual([null, null, null]);
  });

  it("stops once the waiting partners are likely covered", () => {
    const stable = { graph, counts: { emeraude_pourpre: 1 }, females: { emeraude_pourpre: 1 } };
    expect(choosePotions({ ...stable, attempts: attempts("prune_roux", 6) }).filter((potion) => potion === "M").length).toBeLessThan(6);
  });
});
