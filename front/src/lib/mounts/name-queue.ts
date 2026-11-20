import type { Pairing } from "@/lib/mounts/planner";

/**
 * Le nom que l'app a mis dans le presse-papiers pendant l'élevage : le mâle à chercher dans l'étable,
 * la femelle, puis le nom du petit. Chaque collage dans Dofus fait passer au suivant.
 */
export type QueuedName =
  | { role: "male" | "female"; name: string; pairingIndex: number }
  | { role: "baby"; name: string; pairingIndex: number | null };

/** Les noms des parents à chercher, dans l'ordre du plan, en sautant les accouplements faits. */
function parentSlots(order: number[], pairings: Pairing[], done: Set<number>) {
  return order
    .filter((index) => pairings[index] && !done.has(index))
    .flatMap((index): QueuedName[] => [
      { role: "male", name: pairings[index]!.pair[0], pairingIndex: index },
      { role: "female", name: pairings[index]!.pair[1], pairingIndex: index },
    ]);
}

/**
 * Le nom d'à côté, pour F8 (+1) et Maj+F8 (−1). Après le nom d'un petit, ou sans nom en cours,
 * F8 donne le mâle du premier accouplement pas fait ; on boucle au bout de la liste.
 */
export function stepName(order: number[], pairings: Pairing[], done: Set<number>, current: QueuedName | null, direction: 1 | -1): QueuedName | null {
  const slots = parentSlots(order, pairings, done);
  if (!slots.length) return null;
  const position =
    current && current.role !== "baby" ? slots.findIndex((slot) => slot.role === current.role && slot.pairingIndex === current.pairingIndex) : -1;
  if (position === -1) return direction === 1 ? slots[0]! : slots[slots.length - 1]!;
  return slots[(position + direction + slots.length) % slots.length]!;
}

/**
 * Ce qui suit le collage de `pasted` : la femelle après le mâle, le prochain accouplement après le petit.
 * Après la femelle, le nom reste jusqu'à la naissance. Un autre texte collé ne change rien.
 */
export function afterPaste(order: number[], pairings: Pairing[], done: Set<number>, current: QueuedName | null, pasted: string): QueuedName | null {
  if (!current || current.name !== pasted || current.role === "female") return null;
  return stepName(order, pairings, done, current, 1);
}
