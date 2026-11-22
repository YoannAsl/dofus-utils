export type TradeKind = "craft" | "sale";

export const HDV_TAX_RATE = 0.02;

export interface TradeEntry {
  id: string;
  date: string;
  kind: TradeKind;
  itemId: number;
  itemName: string;
  iconId: number | null;
  level: number | null;
  quantity: number;
  amount: number;
  fees: number;
}

export interface ItemLedger {
  itemId: number;
  itemName: string;
  iconId: number | null;
  level: number | null;
  crafted: number;
  sold: number;
  spent: number;
  revenue: number;
  fees: number;
  stock: number;
  stockCost: number;
  matchedSales: number;
  matchedMargin: number;
  lastDate: string;
}

export function hdvTax(amount: number) {
  return Math.ceil(amount * HDV_TAX_RATE);
}

function chronological(a: TradeEntry, b: TradeEntry) {
  return a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "craft" ? -1 : 1);
}

export function summarizeTrades(entries: TradeEntry[]): ItemLedger[] {
  const byItem = new Map<number, ItemLedger>();
  for (const entry of [...entries].sort(chronological)) {
    const ledger = byItem.get(entry.itemId) ?? {
      itemId: entry.itemId,
      itemName: entry.itemName,
      iconId: entry.iconId,
      level: entry.level,
      crafted: 0,
      sold: 0,
      spent: 0,
      revenue: 0,
      fees: 0,
      stock: 0,
      stockCost: 0,
      matchedSales: 0,
      matchedMargin: 0,
      lastDate: entry.date,
    };
    if (entry.kind === "craft") {
      ledger.crafted += entry.quantity;
      ledger.spent += entry.amount;
      ledger.stock += entry.quantity;
      ledger.stockCost += entry.amount;
    } else {
      ledger.sold += entry.quantity;
      ledger.revenue += entry.amount;
      ledger.fees += entry.fees;
      const matched = Math.min(entry.quantity, ledger.stock);
      if (matched) {
        const cost = (ledger.stockCost / ledger.stock) * matched;
        const proceeds = ((entry.amount - entry.fees) / entry.quantity) * matched;
        ledger.matchedMargin += proceeds - cost;
        ledger.matchedSales += matched;
        ledger.stockCost -= cost;
        ledger.stock -= matched;
      }
    }
    ledger.lastDate = entry.date;
    byItem.set(entry.itemId, ledger);
  }
  return [...byItem.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function ledgerResult(ledger: ItemLedger, marketPrice: number | null) {
  const netRevenue = ledger.revenue - ledger.fees;
  return {
    stock: ledger.stock,
    netRevenue,
    balance: netRevenue - ledger.spent,
    unitCost: ledger.crafted ? ledger.spent / ledger.crafted : null,
    unitSale: ledger.sold ? netRevenue / ledger.sold : null,
    margin: ledger.matchedSales ? ledger.matchedMargin : null,
    uncostedSales: ledger.sold - ledger.matchedSales,
    stockValue: marketPrice === null ? null : ledger.stock * marketPrice,
  };
}

export function parseTradeEntries(values: unknown): TradeEntry[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const quantity = Number(value?.quantity);
    const amount = Number(value?.amount);
    const fees = value?.kind === "sale" ? Number(value?.fees ?? 0) : 0;
    if (
      typeof value?.id !== "string" ||
      typeof value?.itemName !== "string" ||
      typeof value?.date !== "string" ||
      (value?.kind !== "craft" && value?.kind !== "sale") ||
      !/^\d+$/.test(String(value?.itemId)) ||
      Number.isNaN(Date.parse(value?.date)) ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isFinite(fees) ||
      fees < 0
    ) {
      return [];
    }
    return [
      {
        id: value.id,
        date: new Date(value.date).toISOString(),
        kind: value.kind,
        itemId: Number(value.itemId),
        itemName: value.itemName,
        iconId: Number.isInteger(value.iconId) ? value.iconId : null,
        level: Number.isInteger(value.level) ? value.level : null,
        quantity,
        amount: Math.round(amount),
        fees: Math.round(fees),
      },
    ];
  });
}
