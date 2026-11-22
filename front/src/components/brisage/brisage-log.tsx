import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ItemSearch } from "@/components/item-search";
import { CopyName, EmptyRow, Gain, ItemIcon, Meta, Metric, MetricGrid, MissingBadge, PageHeader } from "@/components/common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { itemName, searchEquipment, type DofusItem } from "@/lib/dofusdb";
import { formatMoney, formatNumber, formatQuantity, plural, round2 } from "@/lib/format";
import { parsePrice } from "@/lib/prices";
import { findRuneByName, runeById, runesByName, shortRuneName } from "@/lib/runes";
import { calculateBreakResult } from "@/lib/shatter";
import { cn } from "@/lib/utils";
import {
  deleteEntry,
  draftRune,
  fillDraft,
  resetDraft,
  saveEntries,
  updateDraft,
  useBrisageStore,
  type BrisageDraft,
  type BrisageEntry,
} from "@/stores/brisage";
import { getPrice, usePrice, usePriceReader } from "@/stores/prices";

function readDraft(draft: BrisageDraft) {
  const errors: string[] = [];
  const quantity = Number(draft.quantity);
  const unitCost = parsePrice(draft.unitCost);
  const coefficientText = draft.coefficient.trim().replace(",", ".");
  const coefficient = coefficientText ? Number(coefficientText) : null;
  if (!draft.item) errors.push("Choisis l’objet brisé.");
  if (!Number.isInteger(quantity) || quantity <= 0) errors.push("La quantité doit être un entier positif.");
  if (unitCost === null && draft.unitCost.trim() !== "0") errors.push("Renseigne le coût unitaire de l’objet.");
  if (coefficient !== null && !(Number.isFinite(coefficient) && coefficient > 0)) errors.push("Le coefficient doit être un nombre positif.");

  const runeTotals = new Map<string, number>();
  for (const row of draft.runes) {
    const nameText = row.name.trim();
    const quantityText = row.quantity.trim();
    if (!nameText && !quantityText) continue;
    const rune = findRuneByName(nameText);
    const runeQuantity = Number(quantityText);
    if (!rune) errors.push(`Rune inconnue : « ${nameText || "vide"} ».`);
    else if (!Number.isInteger(runeQuantity) || runeQuantity <= 0) errors.push(`Quantité invalide pour ${rune.name}.`);
    else runeTotals.set(String(rune.id), (runeTotals.get(String(rune.id)) ?? 0) + runeQuantity);
  }
  if (!runeTotals.size) errors.push("Ajoute au moins une rune obtenue.");

  const item = draft.item;
  const entry: BrisageEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    itemId: item?.id == null ? null : Number(item.id),
    itemName: item ? itemName(item) : "",
    iconId: Number.isInteger(item?.iconId) ? item!.iconId! : null,
    level: Number.isInteger(item?.level) ? item!.level! : null,
    quantity,
    unitCost: unitCost ?? 0,
    coefficient,
    runes: [...runeTotals].map(([id, runeQuantity]) => ({ id, quantity: runeQuantity })),
  };
  return { errors, entry };
}

function editEntry(entry: BrisageEntry) {
  fillDraft({
    item: { id: entry.itemId ?? 0, name: entry.itemName, iconId: entry.iconId, level: entry.level },
    itemSearch: entry.itemName,
    quantity: String(entry.quantity),
    unitCost: String(entry.unitCost),
    coefficient: entry.coefficient === null ? "" : String(entry.coefficient).replace(".", ","),
    runes: entry.runes.map(({ id, quantity }) => draftRune(runeById.get(id)!.name, String(quantity))),
    editingId: entry.id,
    focus: "quantity",
  });
}

export function BrisageLog() {
  const entries = useBrisageStore((state) => state.entries);
  const editingId = useBrisageStore((state) => state.draft.editingId);
  const readPrice = usePriceReader();
  const [pendingDelete, setPendingDelete] = useState<BrisageEntry | null>(null);

  const rows = entries.map((entry) => ({ entry, result: calculateBreakResult(entry, readPrice) }));
  const totals = rows.reduce(
    (sum, { entry, result }) => ({
      items: sum.items + entry.quantity,
      cost: sum.cost + result.cost,
      value: sum.value + result.value,
      missing: sum.missing + result.missing,
    }),
    { items: 0, cost: 0, value: 0, missing: 0 },
  );
  const profit = totals.value - totals.cost;

  return (
    <>
      <PageHeader
        title="Suivi des brisages"
        description="La valeur des runes suit les prix saisis dans Prix des runes."
      />
      <BrisageForm />

      <MetricGrid label="Synthèse des brisages" className="lg:grid-cols-4">
        <Metric
          label="Brisages"
          value={`${formatQuantity(rows.length)} ${plural(rows.length, "brisage")}`}
          meta={`${formatQuantity(totals.items)} ${plural(totals.items, "objet")} ${plural(totals.items, "brisé")}`}
        />
        <Metric label="Kamas investis" value={`${formatMoney(totals.cost)} k`} />
        <Metric
          label="Valeur des runes"
          value={`${formatMoney(totals.value)} k`}
          meta={
            totals.missing
              ? `Valeur partielle · ${totals.missing} prix de rune ${plural(totals.missing, "manquant")}`
              : "Aux prix HDV actuels des runes."
          }
        />
        <Metric
          label="Bénéfice"
          value={rows.length ? <Gain value={profit} /> : "–"}
          meta={rows.length && totals.cost ? `Rentabilité ${formatNumber(round2((profit / totals.cost) * 100))} %` : undefined}
        />
      </MetricGrid>

      <Card className="py-0">
        <Table aria-label="Historique des brisages">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead className="text-right">Coef.</TableHead>
              <TableHead className="text-right">Coût</TableHead>
              <TableHead>Runes</TableHead>
              <TableHead className="text-right">Valeur runes</TableHead>
              <TableHead className="text-right">Bénéfice</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(({ entry, result }) => (
                <TableRow key={entry.id} className={cn(entry.id === editingId && "bg-info-muted/60 hover:bg-info-muted")}>
                  <TableCell className="tabular-nums">
                    {new Date(entry.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {entry.iconId ? <ItemIcon item={{ iconId: entry.iconId }} /> : null}
                      <span>
                        <CopyName name={entry.itemName} />
                        <Meta>
                          {entry.quantity > 1 ? `×${formatQuantity(entry.quantity)} · ` : ""}
                          {entry.level != null ? `Niv. ${entry.level}` : ""}
                        </Meta>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{entry.coefficient === null ? "–" : `${formatNumber(entry.coefficient)} %`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(result.cost)} k</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                      {entry.runes.map(({ id, quantity }) => {
                        const rune = runeById.get(id)!;
                        const price = readPrice(id);
                        return (
                          <span key={id} title={price === null ? "Prix manquant" : `${formatMoney(price)} k/u`} className={cn(price === null && "text-warning")}>
                            {formatQuantity(quantity)} {shortRuneName(rune)}
                          </span>
                        );
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(result.value)} k
                    <MissingBadge missing={result.missing} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Gain value={result.profit} />
                    {result.cost ? <Meta>{formatNumber(round2(result.roi! * 100))} %</Meta> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Modifier le brisage ${entry.itemName}`} title="Modifier" onClick={() => editEntry(entry)}>
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Supprimer le brisage ${entry.itemName}`}
                        title="Supprimer"
                        onClick={() => setPendingDelete(entry)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <EmptyRow colSpan={8}>Aucun brisage enregistré.</EmptyRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce brisage du suivi ?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && deleteEntry(pendingDelete.id)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BrisageForm() {
  const draft = useBrisageStore((state) => state.draft);
  const readPrice = usePriceReader();
  const itemPrice = usePrice(draft.item?.id || null);
  const [errors, setErrors] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const runeList = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLDivElement>(null);
  const focusLastRune = useRef(false);

  useEffect(() => {
    if (!draft.revision) return;
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const target = draft.focus === "rune" ? runeList.current?.querySelector("input") : quantityInput.current;
    target?.focus({ preventScroll: true });
    setErrors([]);
  }, [draft.revision]);

  useEffect(() => {
    if (!focusLastRune.current) return;
    focusLastRune.current = false;
    const inputs = runeList.current?.querySelectorAll<HTMLInputElement>("input[list]");
    inputs?.[inputs.length - 1]?.focus();
  }, [draft.runes.length]);

  const change = (changes: Partial<BrisageDraft>) => {
    setErrors([]);
    updateDraft(changes);
  };
  const addRune = () => {
    focusLastRune.current = true;
    change({ runes: [...draft.runes, draftRune()] });
  };

  const { entry } = readDraft(draft);
  const preview = calculateBreakResult(entry, readPrice);
  const editing = draft.editingId !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const { errors: next, entry: submitted } = readDraft(draft);
    if (next.length) {
      setErrors(next);
      return;
    }
    const { entries } = useBrisageStore.getState();
    const original = entries.find((candidate) => candidate.id === draft.editingId);
    saveEntries(
      original
        ? entries.map((candidate) => (candidate === original ? { ...submitted, id: original.id, date: original.date } : candidate))
        : [submitted, ...entries],
    );
    resetDraft();
    searchInput.current?.querySelector("input")?.focus();
  }

  function selectItem(item: DofusItem) {
    const price = getPrice(item.id);
    change({ item, itemSearch: itemName(item), ...(price === null ? {} : { unitCost: String(price) }) });
    quantityInput.current?.focus();
  }

  return (
    <Card className={cn(editing && "ring-2 ring-info")}>
      <CardContent>
        <form ref={form} noValidate onSubmit={submit} onReset={(event) => (event.preventDefault(), resetDraft(), setErrors([]))} className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <Field className="w-auto min-w-72 flex-1">
              <FieldLabel htmlFor="brisageItem">Objet brisé</FieldLabel>
              <div ref={searchInput}>
                <ItemSearch scope="equipment" search={searchEquipment} emptyLabel="Aucun équipement trouvé."
                  id="brisageItem"
                  placeholder="Gelano, Cape Bouffante…"
                  value={draft.itemSearch}
                  onValueChange={(itemSearch) => change({ itemSearch, item: null })}
                  onSelect={selectItem}
                />
              </div>
              {draft.item ? (
                <div className="flex items-center gap-2 text-sm">
                  {draft.item.iconId || draft.item.img ? <ItemIcon item={draft.item} className="size-6" /> : null}
                  <strong>{itemName(draft.item)}</strong>
                  <Meta className="inline">
                    {draft.item.level != null ? `Niv. ${draft.item.level}` : ""}
                    {itemPrice !== null ? ` · prix HDV enregistré ${formatMoney(itemPrice)} k` : ""}
                  </Meta>
                </div>
              ) : null}
            </Field>
            <Field className="w-24">
              <FieldLabel htmlFor="brisageQuantity">Quantité</FieldLabel>
              <Input
                ref={quantityInput}
                id="brisageQuantity"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={draft.quantity}
                onChange={(event) => change({ quantity: event.currentTarget.value })}
              />
            </Field>
            <Field className="w-36">
              <FieldLabel htmlFor="brisageUnitCost">Coût unitaire (k)</FieldLabel>
              <Input id="brisageUnitCost" inputMode="numeric" autoComplete="off" value={draft.unitCost} onChange={(event) => change({ unitCost: event.currentTarget.value })} />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="brisageCoefficient">Coefficient (%)</FieldLabel>
              <Input
                id="brisageCoefficient"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Optionnel"
                value={draft.coefficient}
                onChange={(event) => change({ coefficient: event.currentTarget.value })}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Runes obtenues</span>
            <div ref={runeList} className="flex flex-col gap-2">
              {draft.runes.map((row, index) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2">
                  <Field className="w-56">
                    <FieldLabel htmlFor={`brisageRune-${row.key}`} className={cn(index && "sr-only")}>
                      Rune
                    </FieldLabel>
                    <Input
                      id={`brisageRune-${row.key}`}
                      list="brisageRuneOptions"
                      autoComplete="off"
                      placeholder="Rune Fo"
                      value={row.name}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        change({ runes: draft.runes.map((entry) => (entry.key === row.key ? { ...entry, name } : entry)) });
                      }}
                    />
                  </Field>
                  <Field className="w-24">
                    <FieldLabel htmlFor={`brisageRuneQty-${row.key}`} className={cn(index && "sr-only")}>
                      Quantité
                    </FieldLabel>
                    <Input
                      id={`brisageRuneQty-${row.key}`}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={row.quantity}
                      onChange={(event) => {
                        const quantity = event.currentTarget.value;
                        change({ runes: draft.runes.map((entry) => (entry.key === row.key ? { ...entry, quantity } : entry)) });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && index === draft.runes.length - 1) {
                          event.preventDefault();
                          addRune();
                        }
                      }}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Retirer cette rune"
                    onClick={() => {
                      const runes = draft.runes.filter((entry) => entry.key !== row.key);
                      change({ runes: runes.length ? runes : [draftRune()] });
                    }}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
            </div>
            <datalist id="brisageRuneOptions">
              {runesByName.map((rune) => (
                <option key={rune.id} value={rune.name} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addRune}>
              <PlusIcon data-icon="inline-start" />
              Ajouter une rune
            </Button>
            <Button type="submit">{editing ? "Mettre à jour le brisage" : "Enregistrer le brisage"}</Button>
            <Button type="reset" variant="ghost">
              {editing ? "Annuler la modification" : "Vider"}
            </Button>
            <p className="text-sm text-muted-foreground" role="status">
              {entry.runes.length ? (
                <>
                  Coût {formatMoney(preview.cost)} k · Runes {formatMoney(preview.value)} k
                  <MissingBadge missing={preview.missing} /> · Bénéfice <Gain value={preview.profit} />
                </>
              ) : (
                "Ajoute les runes obtenues pour voir le résultat."
              )}
            </p>
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
