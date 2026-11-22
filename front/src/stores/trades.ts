import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";
import { parseTradeEntries, type TradeEntry } from "@/lib/trades";

const TRADE_STORAGE_KEY = "dofus-trade-log-v1";

export const useTradeStore = create<{ entries: TradeEntry[] }>(() => ({
  entries: parseTradeEntries(readStorage(TRADE_STORAGE_KEY)),
}));

function save(entries: TradeEntry[]) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  writeStorage(TRADE_STORAGE_KEY, sorted);
  useTradeStore.setState({ entries: sorted });
}

export function saveTrade(entry: TradeEntry) {
  const { entries } = useTradeStore.getState();
  save([entry, ...entries.filter((candidate) => candidate.id !== entry.id)]);
}

export function deleteTrade(id: string) {
  save(useTradeStore.getState().entries.filter((entry) => entry.id !== id));
}

export function mergeTradeEntries(incoming: unknown) {
  const byId = new Map(useTradeStore.getState().entries.map((entry) => [entry.id, entry]));
  for (const entry of parseTradeEntries(incoming)) byId.set(entry.id, entry);
  save([...byId.values()]);
}
