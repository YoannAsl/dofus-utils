import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HammerIcon, PencilIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CopyName, EmptyRow, Gain, ItemIcon, Meta, Metric, MetricGrid, PageHeader } from "@/components/common";
import { ItemSearch } from "@/components/item-search";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchRecipe, itemName, searchCraftableItems, type DofusItem } from "@/lib/dofusdb";
import { formatMoney, formatQuantity, plural } from "@/lib/format";
import { parsePrice } from "@/lib/prices";
import { calculateRecipeCost } from "@/lib/pricing";
import { hdvTax, ledgerResult, summarizeTrades, type ItemLedger, type TradeEntry, type TradeKind } from "@/lib/trades";
import { cn } from "@/lib/utils";
import { usePrice, usePriceReader } from "@/stores/prices";
import { deleteTrade, saveTrade, useTradeStore } from "@/stores/trades";

export const Route = createFileRoute("/ventes")({
  component: VentesPage,
});

interface TradeDraft {
  kind: TradeKind;
  item: DofusItem | null;
  itemSearch: string;
  quantity: string;
  amount: string;
  fees: string;
  editing: TradeEntry | null;
}

function emptyDraft(kind: TradeKind = "craft"): TradeDraft {
  return { kind, item: null, itemSearch: "", quantity: "1", amount: "", fees: "", editing: null };
}

function itemFromLedger(entry: Pick<TradeEntry, "itemId" | "itemName" | "iconId" | "level">): DofusItem {
  return { id: entry.itemId, name: entry.itemName, iconId: entry.iconId, level: entry.level, hasRecipe: true };
}

function readKamas(text: string) {
  return text.trim() === "" || text.trim() === "0" ? 0 : parsePrice(text);
}

function readDraft(draft: TradeDraft) {
  const errors: string[] = [];
  const quantity = Number(draft.quantity);
  const amount = draft.amount.trim() === "0" ? 0 : parsePrice(draft.amount);
  const fees = draft.kind === "sale" ? readKamas(draft.fees) : 0;
  if (!draft.item) errors.push("Choisis l’objet.");
  if (!Number.isInteger(quantity) || quantity <= 0) errors.push("La quantité doit être un entier positif.");
  if (amount === null) errors.push(draft.kind === "craft" ? "Renseigne le coût total du craft." : "Renseigne le prix de vente total.");
  if (fees === null) errors.push("La taxe doit être un nombre positif.");
  if (errors.length || !draft.item) return { errors, entry: null };
  const entry: TradeEntry = {
    id: draft.editing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: draft.editing?.date ?? new Date().toISOString(),
    kind: draft.kind,
    itemId: Number(draft.item.id),
    itemName: itemName(draft.item),
    iconId: Number.isInteger(draft.item.iconId) ? draft.item.iconId! : null,
    level: Number.isInteger(draft.item.level) ? draft.item.level! : null,
    quantity,
    amount: amount!,
    fees: fees!,
  };
  return { errors, entry };
}

function VentesPage() {
  const entries = useTradeStore((state) => state.entries);
  const readPrice = usePriceReader();
  const [draft, setDraft] = useState<TradeDraft>(emptyDraft);
  const [pendingDelete, setPendingDelete] = useState<TradeEntry | null>(null);
  const formCard = useRef<HTMLDivElement>(null);

  const ledgers = summarizeTrades(entries).map((ledger) => ({ ledger, result: ledgerResult(ledger, readPrice(ledger.itemId)) }));
  const totals = ledgers.reduce(
    (sum, { ledger, result }) => ({
      spent: sum.spent + ledger.spent,
      netRevenue: sum.netRevenue + result.netRevenue,
      fees: sum.fees + ledger.fees,
      stock: sum.stock + result.stock,
      stockValue: sum.stockValue + (result.stockValue ?? 0),
      unpriced: sum.unpriced + (result.stock && result.stockValue === null ? 1 : 0),
    }),
    { spent: 0, netRevenue: 0, fees: 0, stock: 0, stockValue: 0, unpriced: 0 },
  );

  function startFor(kind: TradeKind, ledger: ItemLedger) {
    const stock = ledgerResult(ledger, null).stock;
    setDraft({
      ...emptyDraft(kind),
      item: itemFromLedger(ledger),
      itemSearch: ledger.itemName,
      quantity: kind === "sale" && stock ? String(stock) : "1",
    });
    focusForm();
  }

  function edit(entry: TradeEntry) {
    setDraft({
      kind: entry.kind,
      item: itemFromLedger(entry),
      itemSearch: entry.itemName,
      quantity: String(entry.quantity),
      amount: String(entry.amount),
      fees: entry.fees ? String(entry.fees) : "",
      editing: entry,
    });
    focusForm();
  }

  function focusForm() {
    formCard.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => formCard.current?.querySelector<HTMLInputElement>("input[name=amount]")?.focus({ preventScroll: true }));
  }

  return (
    <>
      <PageHeader
        title="Crafts & ventes"
        description="Note ce que tu dépenses pour crafter et ce que tu encaisses en vendant. Le bilan se fait par objet."
      />
      <div ref={formCard} className="scroll-mt-4">
        <TradeForm draft={draft} setDraft={setDraft} />
      </div>

      <MetricGrid label="Bilan des crafts et ventes" className="lg:grid-cols-4">
        <Metric label="Dépensé" value={`${formatMoney(totals.spent)} k`} meta="Coût total des crafts." />
        <Metric
          label="Encaissé"
          value={`${formatMoney(totals.netRevenue)} k`}
          meta={totals.fees ? `Net de ${formatMoney(totals.fees)} k de taxes HDV.` : "Ventes nettes de taxes."}
        />
        <Metric label="Solde" value={entries.length ? <Gain value={totals.netRevenue - totals.spent} /> : "–"} meta="Encaissé moins dépensé." />
        <Metric
          label="Stock invendu"
          value={`${formatQuantity(totals.stock)} ${plural(totals.stock, "objet")}`}
          meta={
            totals.stock
              ? `≈ ${formatMoney(totals.stockValue)} k au prix HDV${totals.unpriced ? ` · ${totals.unpriced} prix ${plural(totals.unpriced, "manquant")}` : ""}`
              : undefined
          }
        />
      </MetricGrid>

      <Card className="py-0">
        <Table aria-label="Bilan par objet">
          <TableHeader>
            <TableRow>
              <TableHead>Objet</TableHead>
              <TableHead className="text-right">Craftés</TableHead>
              <TableHead className="text-right">Vendus</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Coût / u</TableHead>
              <TableHead className="text-right">Vente nette / u</TableHead>
              <TableHead className="text-right">Marge</TableHead>
              <TableHead className="text-right">Solde</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgers.length ? (
              ledgers.map(({ ledger, result }) => (
                <TableRow key={ledger.itemId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {ledger.iconId ? <ItemIcon item={{ iconId: ledger.iconId }} /> : null}
                      <span>
                        <CopyName name={ledger.itemName} />
                        {ledger.level != null ? <Meta>Niv. {ledger.level}</Meta> : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(ledger.crafted)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(ledger.sold)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(result.stock)}
                    {result.stockValue ? <Meta>≈ {formatMoney(result.stockValue)} k</Meta> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{result.unitCost === null ? "–" : `${formatMoney(result.unitCost)} k`}</TableCell>
                  <TableCell className="text-right tabular-nums">{result.unitSale === null ? "–" : `${formatMoney(result.unitSale)} k`}</TableCell>
                  <TableCell className="text-right">
                    <Gain value={result.margin} />
                    {result.uncostedSales ? (
                      <Meta>
                        {formatQuantity(result.uncostedSales)} {plural(result.uncostedSales, "vente")} sans craft noté
                      </Meta>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Gain value={result.balance} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" title="Noter un craft" aria-label={`Noter un craft de ${ledger.itemName}`} onClick={() => startFor("craft", ledger)}>
                        <HammerIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Noter une vente" aria-label={`Noter une vente de ${ledger.itemName}`} onClick={() => startFor("sale", ledger)}>
                        <ShoppingCartIcon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <EmptyRow colSpan={9}>Aucun craft ni vente enregistré.</EmptyRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {entries.length ? (
        <>
          <PageHeader title="Historique" />
          <Card className="py-0">
            <Table aria-label="Historique des crafts et ventes">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">Par unité</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const net = entry.kind === "sale" ? entry.amount - entry.fees : -entry.amount;
                  return (
                    <TableRow key={entry.id} className={cn(entry.id === draft.editing?.id && "bg-info-muted/60 hover:bg-info-muted")}>
                      <TableCell className="tabular-nums">
                        {new Date(entry.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <Badge className={entry.kind === "craft" ? "bg-info-muted text-info" : "bg-success-muted text-success"}>
                          {entry.kind === "craft" ? "Craft" : "Vente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {entry.iconId ? <ItemIcon item={{ iconId: entry.iconId }} className="size-6" /> : null}
                          <CopyName name={entry.itemName} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(entry.quantity)}</TableCell>
                      <TableCell className="text-right">
                        <Gain value={net} />
                        {entry.fees ? <Meta>dont {formatMoney(entry.fees)} k de taxe</Meta> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(Math.abs(net) / entry.quantity)} k</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" title="Modifier" aria-label={`Modifier · ${entry.itemName}`} onClick={() => edit(entry)}>
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            title="Supprimer"
                            aria-label={`Supprimer · ${entry.itemName}`}
                            onClick={() => setPendingDelete(entry)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.kind === "sale" ? "Supprimer cette vente ?" : "Supprimer ce craft ?"}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                deleteTrade(pendingDelete.id);
                if (draft.editing?.id === pendingDelete.id) setDraft(emptyDraft());
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TradeForm({ draft, setDraft }: { draft: TradeDraft; setDraft: (draft: TradeDraft) => void }) {
  const [errors, setErrors] = useState<string[]>([]);
  const readPrice = usePriceReader();
  const marketPrice = usePrice(draft.item?.id ?? null);
  const searchBox = useRef<HTMLDivElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const recipe = useQuery({
    queryKey: ["recipe", draft.item?.id],
    queryFn: ({ signal }) => fetchRecipe(draft.item!.id, signal),
    enabled: draft.kind === "craft" && Boolean(draft.item?.id && draft.item.hasRecipe !== false),
  });

  const change = (changes: Partial<TradeDraft>) => {
    setErrors([]);
    setDraft({ ...draft, ...changes });
  };
  const quantity = Number(draft.quantity);
  const validQuantity = Number.isInteger(quantity) && quantity > 0;
  const amount = parsePrice(draft.amount);
  const recipeCost = recipe.data ? calculateRecipeCost(recipe.data, readPrice) : null;
  const editing = draft.editing !== null;
  const isSale = draft.kind === "sale";

  function submit(event: FormEvent) {
    event.preventDefault();
    const { errors: next, entry } = readDraft(draft);
    if (!entry) {
      setErrors(next);
      return;
    }
    saveTrade(entry);
    setDraft(emptyDraft(draft.kind));
    setErrors([]);
    searchBox.current?.querySelector("input")?.focus();
  }

  let suggestion: { label: string; unit: number } | null = null;
  let hint: ReactNode = null;
  if (draft.item && !isSale) {
    if (recipe.isFetching) hint = "Chargement de la recette…";
    else if (recipe.isError) hint = "Recette indisponible.";
    else if (recipeCost?.missing)
      hint = (
        <>
          Recette incomplète · {recipeCost.missing} prix {plural(recipeCost.missing, "manquant")} ·{" "}
          <Link to="/prix" search={{ q: itemName(draft.item), cat: "all" }} className="underline underline-offset-4">
            compléter dans Prix & crafts
          </Link>
        </>
      );
    else if (recipeCost) suggestion = { label: "Coût de la recette", unit: recipeCost.total };
  }
  if (draft.item && isSale && marketPrice !== null) suggestion = { label: "Prix HDV enregistré", unit: marketPrice };

  return (
    <Card className={cn(editing && "ring-2 ring-info")}>
      <CardContent>
        <form
          noValidate
          onSubmit={submit}
          onReset={(event) => {
            event.preventDefault();
            setDraft(emptyDraft(draft.kind));
            setErrors([]);
          }}
          className="flex flex-col gap-4"
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.kind}
            onValueChange={(kind) => kind && change({ kind: kind as TradeKind, amount: "", fees: "" })}
            aria-label="Type d’opération"
          >
            <ToggleGroupItem value="craft">
              <HammerIcon />
              Craft (dépense)
            </ToggleGroupItem>
            <ToggleGroupItem value="sale">
              <ShoppingCartIcon />
              Vente (recette)
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-wrap items-start gap-3">
            <Field className="w-auto min-w-64 flex-1">
              <FieldLabel htmlFor="tradeItem">Objet</FieldLabel>
              <div ref={searchBox}>
                <ItemSearch
                  id="tradeItem"
                  scope="craftable"
                  search={searchCraftableItems}
                  emptyLabel="Aucun objet craftable trouvé."
                  placeholder="Potion de Rappel, Gelano…"
                  value={draft.itemSearch}
                  onValueChange={(itemSearch) => change({ itemSearch, item: null })}
                  onSelect={(item) => {
                    change({ item, itemSearch: itemName(item) });
                    quantityInput.current?.focus();
                  }}
                />
              </div>
              {draft.item ? (
                <div className="flex items-center gap-2 text-sm">
                  {draft.item.iconId || draft.item.img ? <ItemIcon item={draft.item} className="size-6" /> : null}
                  <strong>{itemName(draft.item)}</strong>
                  {draft.item.level != null ? <Meta className="inline">Niv. {draft.item.level}</Meta> : null}
                </div>
              ) : null}
            </Field>
            <Field className="w-24">
              <FieldLabel htmlFor="tradeQuantity">Quantité</FieldLabel>
              <Input
                ref={quantityInput}
                id="tradeQuantity"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={draft.quantity}
                onChange={(event) => change({ quantity: event.currentTarget.value })}
              />
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="tradeAmount">{isSale ? "Prix de vente total (k)" : "Coût total (k)"}</FieldLabel>
              <Input
                id="tradeAmount"
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                value={draft.amount}
                onChange={(event) => change({ amount: event.currentTarget.value })}
              />
              {amount !== null && validQuantity && quantity > 1 ? <Meta>{formatMoney(amount / quantity)} k / u</Meta> : null}
            </Field>
            {isSale ? (
              <Field className="w-36">
                <FieldLabel htmlFor="tradeFees">Taxe HDV (k)</FieldLabel>
                <Input
                  id="tradeFees"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={draft.fees}
                  onChange={(event) => change({ fees: event.currentTarget.value })}
                />
                {amount !== null ? (
                  <button
                    type="button"
                    className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    onClick={() => change({ fees: String(hdvTax(amount)) })}
                  >
                    2 % = {formatMoney(hdvTax(amount))} k
                  </button>
                ) : null}
              </Field>
            ) : null}
          </div>

          {suggestion || hint ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">
              {suggestion ? (
                <>
                  {suggestion.label} · {formatMoney(suggestion.unit)} k / u
                  {validQuantity ? (
                    <Button type="button" variant="outline" size="xs" onClick={() => change({ amount: String(suggestion.unit * quantity) })}>
                      Utiliser {formatMoney(suggestion.unit * quantity)} k
                    </Button>
                  ) : null}
                </>
              ) : (
                hint
              )}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">{editing ? "Mettre à jour" : isSale ? "Enregistrer la vente" : "Enregistrer le craft"}</Button>
            <Button type="reset" variant="ghost">
              {editing ? "Annuler la modification" : "Vider"}
            </Button>
          </div>
          {errors.length ? (
            <ul className="list-disc pl-5 text-sm text-destructive" aria-live="polite">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
