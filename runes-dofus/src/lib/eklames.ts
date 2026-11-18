import { DOFUSDB_API_BASE } from "@/lib/dofusdb";
import type { Eklame } from "@/lib/pricing";

/** DofusDB item type 310; opening one gives two of the tier below. */
export const EKLAMES: Eklame[] = [
  { id: "31518", name: "Eklame inferieure", levelRange: "1 a 50", factor: 1, iconId: 74084 },
  { id: "31519", name: "Eklame ordinaire", levelRange: "51 a 100", factor: 2, iconId: 74072 },
  { id: "31520", name: "Eklame superieure", levelRange: "101 a 150", factor: 4, iconId: 74061 },
  { id: "31521", name: "Eklame majestueuse", levelRange: "151 a 190", factor: 8, iconId: 74066 },
  { id: "31522", name: "Eklame supreme", levelRange: "191 a 200", factor: 16, iconId: 74071 },
];

export const DEFAULT_EKLAME_ID = "31520";

export function eklameImage(eklame: Eklame) {
  return `${DOFUSDB_API_BASE}/img/items/${eklame.iconId}.png`;
}
