import { describe, expect, it } from "vitest";
import { afterPaste, type QueuedName, stepName } from "@/lib/mounts/name-queue";
import type { Pairing } from "@/lib/mounts/planner";

const pairing = (male: string, female: string): Pairing => ({ pair: [male, female], potion: null, final: false, target: null });
const pairings = [pairing("MA", "FA"), pairing("MB", "FB"), pairing("MC", "FC")];
const order = [2, 0, 1];

describe("name queue", () => {
  it("starts with the male of the first pairing shown that isn't done", () => {
    expect(stepName(order, pairings, new Set([2]), null, 1)).toEqual({ role: "male", name: "MA", pairingIndex: 0 });
  });

  it("goes male, female, then the next pairing, and wraps around", () => {
    const male: QueuedName = { role: "male", name: "MC", pairingIndex: 2 };
    expect(stepName(order, pairings, new Set(), male, 1)).toEqual({ role: "female", name: "FC", pairingIndex: 2 });
    expect(stepName(order, pairings, new Set(), { role: "female", name: "FC", pairingIndex: 2 }, 1)).toMatchObject({ name: "MA" });
    expect(stepName(order, pairings, new Set(), { role: "female", name: "FB", pairingIndex: 1 }, 1)).toMatchObject({ name: "MC" });
    expect(stepName(order, pairings, new Set(), male, -1)).toMatchObject({ name: "FB" });
  });

  it("gives the female once the male is pasted, and nothing more until the birth", () => {
    const male: QueuedName = { role: "male", name: "MC", pairingIndex: 2 };
    expect(afterPaste(order, pairings, new Set(), male, "MC")).toMatchObject({ role: "female", name: "FC" });
    expect(afterPaste(order, pairings, new Set(), { role: "female", name: "FC", pairingIndex: 2 }, "FC")).toBeNull();
  });

  it("moves to the next pairing not done once the baby's name is pasted", () => {
    const baby: QueuedName = { role: "baby", name: "MBABY", pairingIndex: 2 };
    expect(afterPaste(order, pairings, new Set([2]), baby, "MBABY")).toEqual({ role: "male", name: "MA", pairingIndex: 0 });
  });

  it("ignores a paste of some other name", () => {
    expect(afterPaste(order, pairings, new Set(), { role: "male", name: "MC", pairingIndex: 2 }, "MA")).toBeNull();
  });

  it("has nothing left when every pairing is done", () => {
    expect(stepName(order, pairings, new Set([0, 1, 2]), null, 1)).toBeNull();
  });
});
