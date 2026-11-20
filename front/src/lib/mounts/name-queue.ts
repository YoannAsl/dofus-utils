import type { Pairing } from "@/lib/mounts/planner";

export type QueuedName =
  | { role: "male" | "female"; name: string; pairingIndex: number }
  | { role: "baby"; name: string; pairingIndex: number | null };

function parentSlots(order: number[], pairings: Pairing[], done: Set<number>) {
  return order
    .filter((index) => pairings[index] && !done.has(index))
    .flatMap((index): QueuedName[] => [
      { role: "male", name: pairings[index]!.pair[0], pairingIndex: index },
      { role: "female", name: pairings[index]!.pair[1], pairingIndex: index },
    ]);
}

export function stepName(order: number[], pairings: Pairing[], done: Set<number>, current: QueuedName | null, direction: 1 | -1): QueuedName | null {
  const slots = parentSlots(order, pairings, done);
  if (!slots.length) return null;
  const position =
    current && current.role !== "baby" ? slots.findIndex((slot) => slot.role === current.role && slot.pairingIndex === current.pairingIndex) : -1;
  if (position === -1) return direction === 1 ? slots[0]! : slots[slots.length - 1]!;
  return slots[(position + direction + slots.length) % slots.length]!;
}

export function afterPaste(order: number[], pairings: Pairing[], done: Set<number>, current: QueuedName | null, pasted: string): QueuedName | null {
  if (!current || current.name !== pasted || current.role === "female") return null;
  return stepName(order, pairings, done, current, 1);
}
