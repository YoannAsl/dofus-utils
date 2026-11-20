import { colourLabel, type MountFamily } from "@/lib/mounts/family";
import type { Pairing } from "@/lib/mounts/planner";

export interface PlanRow {
  pairing: Pairing;
  index: number;
}

/** Les accouplements par génération du petit visé, la plus haute d'abord : c'est là qu'une réussite rapporte le plus. */
export function groupPairings(family: MountFamily, pairings: Pairing[]) {
  const byGeneration = new Map<number, PlanRow[]>();
  const finalRows: PlanRow[] = [];
  pairings.forEach((pairing, index) => {
    const row = { pairing, index };
    if (pairing.final) {
      finalRows.push(row);
      return;
    }
    const generation = (pairing.target && family.byId.get(pairing.target)?.generation) || 0;
    if (!byGeneration.has(generation)) byGeneration.set(generation, []);
    byGeneration.get(generation)!.push(row);
  });
  const groups = [...byGeneration.entries()]
    .sort(([a], [b]) => b - a)
    .map(([generation, rows]) => {
      const counts = new Map<string | null, number>();
      rows.forEach(({ pairing }) => counts.set(pairing.target, (counts.get(pairing.target) ?? 0) + 1));
      const targets = [...counts.entries()]
        .map(([id, count]) => ({ id, count, name: id ? colourLabel(family, id) : "?" }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
      const rank = new Map(targets.map((target, position) => [target.id, position]));
      rows.sort((a, b) => rank.get(a.pairing.target)! - rank.get(b.pairing.target)! || a.index - b.index);
      return { generation, rows, targets };
    });
  return { groups, finalRows };
}

/** Les accouplements dans l’ordre où le plan les montre. */
export function pairingOrder(family: MountFamily, pairings: Pairing[]) {
  const { groups, finalRows } = groupPairings(family, pairings);
  return [...groups.flatMap((group) => group.rows), ...finalRows].map((row) => row.index);
}
