import { create } from "zustand";
import { parsePriceMap, type PriceMap } from "@/lib/prices";
import { runeById } from "@/lib/runes";
import { readStorage, writeStorage } from "@/lib/storage";

// Storage keys and formats are unchanged from the original app, so saved prices carry over.
const PRICE_STORAGE_KEYS = {
  prices: "dofus-rune-prices-v1",
  itemPrices: "dofus-fm-item-prices-v1",
} as const;

export type PriceGroup = keyof typeof PRICE_STORAGE_KEYS;
const GROUPS = Object.keys(PRICE_STORAGE_KEYS) as PriceGroup[];

export function groupForItem(id: string | number): PriceGroup {
  if (runeById.has(String(id))) return "prices";
  return "itemPrices";
}

type PriceValues = Record<PriceGroup, PriceMap>;

interface PriceState {
  values: PriceValues;
  /** Last local save per group, shown as a save confirmation. */
  savedAt: Partial<Record<PriceGroup, Date>>;
}

function load(group: PriceGroup) {
  const saved = readStorage(PRICE_STORAGE_KEYS[group]);
  return saved && typeof saved === "object" && !Array.isArray(saved) ? parsePriceMap(saved) : {};
}

export const usePriceStore = create<PriceState>(() => ({
  values: Object.fromEntries(GROUPS.map((group) => [group, load(group)])) as PriceValues,
  savedAt: {},
}));

function replace(changes: Partial<PriceValues>) {
  const now = new Date();
  usePriceStore.setState((state) => {
    const values = { ...state.values };
    const savedAt = { ...state.savedAt };
    for (const [group, next] of Object.entries(changes) as [PriceGroup, PriceMap][]) {
      writeStorage(PRICE_STORAGE_KEYS[group], next);
      values[group] = next;
      savedAt[group] = now;
    }
    return { values, savedAt };
  });
}

export function readPrice(values: PriceValues, id: string | number) {
  const price = Number(values[groupForItem(id)][String(id)]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Saved HDV price of any item (rune or catalogue item), or null. */
export function usePrice(id: string | number | null | undefined) {
  return usePriceStore((state) => (id == null ? null : readPrice(state.values, id)));
}

/** A stable reader over the current prices, for calculations spanning many items. */
export function usePriceReader() {
  const values = usePriceStore((state) => state.values);
  return (id: string | number) => readPrice(values, id);
}

export function getPrice(id: string | number) {
  return readPrice(usePriceStore.getState().values, id);
}

export function setPrice(id: string | number, price: number | null) {
  const group = groupForItem(id);
  const next = { ...usePriceStore.getState().values[group] };
  if (price === null) delete next[String(id)];
  else next[String(id)] = price;
  replace({ [group]: next });
}

export function mergePrices(payload: Record<string, unknown>) {
  const { values } = usePriceStore.getState();
  const incoming: PriceValues = {
    // Exports from the first version were a bare map of rune prices.
    prices: parsePriceMap(payload.prices || payload),
    itemPrices: parsePriceMap(payload.itemPrices),
  };
  replace(Object.fromEntries(GROUPS.map((group) => [group, { ...values[group], ...incoming[group] }])));
}

export function clearPrices() {
  replace(Object.fromEntries(GROUPS.map((group) => [group, {}])));
}

export function priceSnapshot() {
  const { values } = usePriceStore.getState();
  return Object.fromEntries(GROUPS.map((group) => [group, { ...values[group] }])) as PriceValues;
}
