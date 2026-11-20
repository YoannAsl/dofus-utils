import { create } from "zustand";
import type { DofusItem } from "@/lib/dofusdb";
import { runeById } from "@/lib/runes";
import type { BreakEntryRune } from "@/lib/shatter";
import { readStorage, writeStorage } from "@/lib/storage";

const BRISAGE_STORAGE_KEY = "dofus-brisage-log-v1";
const COEFFICIENT_STORAGE_KEY = "dofus-brisage-coefficients-v1";

export interface BrisageEntry {
  id: string;
  date: string;
  itemId: number | null;
  itemName: string;
  iconId: number | null;
  level: number | null;
  quantity: number;
  unitCost: number;
  coefficient: number | null;
  runes: BreakEntryRune[];
}

export function parseBrisageEntries(values: unknown): BrisageEntry[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const quantity = Number(value?.quantity);
    const unitCost = Number(value?.unitCost);
    const coefficient = value?.coefficient == null ? null : Number(value.coefficient);
    const runeEntries: unknown[] = Array.isArray(value?.runes) ? value.runes : [];
    const parsedRunes = runeEntries
      .map((rune) => {
        const entry = rune as { id?: unknown; quantity?: unknown } | null;
        return { id: String(entry?.id), quantity: Number(entry?.quantity) };
      })
      .filter((rune) => runeById.has(rune.id) && Number.isInteger(rune.quantity) && rune.quantity > 0);
    if (
      typeof value?.id !== "string" ||
      typeof value?.itemName !== "string" ||
      Number.isNaN(Date.parse(value?.date)) ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0 ||
      (coefficient !== null && !(Number.isFinite(coefficient) && coefficient > 0)) ||
      parsedRunes.length !== runeEntries.length
    ) {
      return [];
    }
    return [
      {
        id: value.id,
        date: value.date,
        itemId: /^\d+$/.test(String(value.itemId)) ? Number(value.itemId) : null,
        itemName: value.itemName,
        iconId: Number.isInteger(value.iconId) ? value.iconId : null,
        level: Number.isInteger(value.level) ? value.level : null,
        quantity,
        unitCost: Math.round(unitCost),
        coefficient,
        runes: parsedRunes,
      },
    ];
  });
}

export function parseShatterCoefficients(values: unknown) {
  const next: Record<string, number> = {};
  for (const [id, value] of Object.entries(values && typeof values === "object" ? values : {})) {
    const coefficient = Number(value);
    if (/^\d+$/.test(id) && Number.isFinite(coefficient) && coefficient > 0) next[id] = coefficient;
  }
  return next;
}

export interface DraftRune {
  key: number;
  name: string;
  quantity: string;
}

export interface BrisageDraft {
  item: DofusItem | null;
  itemSearch: string;
  quantity: string;
  unitCost: string;
  coefficient: string;
  runes: DraftRune[];
  editingId: string | null;
  revision: number;
  focus: "quantity" | "rune";
}

interface BrisageState {
  entries: BrisageEntry[];
  coefficients: Record<string, number>;
  draft: BrisageDraft;
}

let nextRuneKey = 1;
export function draftRune(name = "", quantity = ""): DraftRune {
  return { key: nextRuneKey++, name, quantity };
}

function emptyDraft(revision = 0): BrisageDraft {
  return { item: null, itemSearch: "", quantity: "1", unitCost: "", coefficient: "", runes: [draftRune()], editingId: null, revision, focus: "quantity" };
}

export const useBrisageStore = create<BrisageState>(() => ({
  entries: parseBrisageEntries(readStorage(BRISAGE_STORAGE_KEY)),
  coefficients: parseShatterCoefficients(readStorage(COEFFICIENT_STORAGE_KEY)),
  draft: emptyDraft(),
}));

export function saveEntries(entries: BrisageEntry[]) {
  writeStorage(BRISAGE_STORAGE_KEY, entries);
  useBrisageStore.setState({ entries });
}

export function mergeBrisageEntries(incoming: unknown) {
  const byId = new Map(useBrisageStore.getState().entries.map((entry) => [entry.id, entry]));
  for (const entry of parseBrisageEntries(incoming)) byId.set(entry.id, entry);
  saveEntries([...byId.values()].sort((a, b) => b.date.localeCompare(a.date)));
}

export function saveCoefficient(itemId: number, coefficient: number) {
  const coefficients = { ...useBrisageStore.getState().coefficients, [itemId]: coefficient };
  writeStorage(COEFFICIENT_STORAGE_KEY, coefficients);
  useBrisageStore.setState({ coefficients });
}

export function mergeShatterCoefficients(incoming: unknown) {
  const coefficients = { ...useBrisageStore.getState().coefficients, ...parseShatterCoefficients(incoming) };
  writeStorage(COEFFICIENT_STORAGE_KEY, coefficients);
  useBrisageStore.setState({ coefficients });
}

export function updateDraft(changes: Partial<BrisageDraft>) {
  useBrisageStore.setState((state) => ({ draft: { ...state.draft, ...changes } }));
}

export function resetDraft() {
  useBrisageStore.setState((state) => ({ draft: emptyDraft(state.draft.revision) }));
}

export function fillDraft(changes: Partial<Omit<BrisageDraft, "revision">>) {
  useBrisageStore.setState((state) => ({ draft: { ...emptyDraft(state.draft.revision + 1), ...changes } }));
}

export function deleteEntry(id: string) {
  const { entries, draft } = useBrisageStore.getState();
  saveEntries(entries.filter((entry) => entry.id !== id));
  if (draft.editingId === id) resetDraft();
}
