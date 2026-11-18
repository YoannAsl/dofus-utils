import { MinusIcon, NotebookPenIcon, PlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { EquipmentSearch } from "@/components/brisage/equipment-search";
import { CopyName, Gain, ItemIcon, Meta, Metric, MetricGrid, MissingBadge } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchItemWithEffects, itemName, type DofusItem } from "@/lib/dofusdb";
import { formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import { baseRuneByCharacteristic, runeById, runeEffectIds, shortRuneName, type Rune } from "@/lib/runes";
import { calculateBreakEvenCoefficient, calculateShatter, type ShatterResult } from "@/lib/shatter";
import { cn } from "@/lib/utils";
import { draftRune, fillDraft, saveCoefficient, useBrisageStore } from "@/stores/brisage";
import { usePrice, usePriceReader } from "@/stores/prices";

interface Line {
  key: string;
  rune: Rune | null;
  label: string;
  /** Roll bounds; null for exotic lines, which have no item range. */
  from: number | null;
  to: number | null;
  jet: number;
  negative: boolean;
  exo: boolean;
}

function buildLines(item: DofusItem): Line[] {
  return (item.effects ?? []).flatMap((effect, index) => {
    const rune = baseRuneByCharacteristic.get(effect.characteristic);
    const from = Math.abs(Number(effect.from));
    let to = Math.abs(Number(effect.to));
    if (!rune || !Number.isFinite(from)) return [];
    if (!Number.isFinite(to) || to < from) to = from;
    // DofusDB stores maluses as their own effect with a positive range, e.g. 157 "-# Force".
    const negative = !runeEffectIds.has(effect.effectId);
    return [{ key: `effect-${index}`, rune, label: `${negative ? "-" : ""}${rune.effect.label}`, from, to, jet: Math.round((from + to) / 2), negative, exo: false }];
  });
}

function parseCoefficient(value: string) {
  const coefficient = Number(value.replace(",", "."));
  return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : null;
}

function clampJet(line: Line, value: number) {
  const jet = Math.round(value);
  const min = line.from ?? 1;
  return Number.isFinite(jet) ? Math.min(line.to ?? Infinity, Math.max(min, jet)) : min;
}

const exoRunes = [...baseRuneByCharacteristic.values()].sort((a, b) => a.effect.label.localeCompare(b.effect.label, "fr"));
let nextExoKey = 1;

export function ShatterCalculator() {
  const [search, setSearch] = useState("");
  const [item, setItem] = useState<DofusItem | null>(null);
  const [status, setStatus] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [coefficientText, setCoefficientText] = useState("100");
  // Key of the focused line, "" for no focus; null follows the best result until the user picks one.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const loadToken = useRef(0);
  const coefficients = useBrisageStore((state) => state.coefficients);
  const readPrice = usePriceReader();
  const cost = usePrice(item?.id);

  async function selectItem(summary: DofusItem) {
    const token = ++loadToken.current;
    setStatus("Chargement des caractéristiques…");
    setItem(null);
    try {
      const loaded = await fetchItemWithEffects(summary.id);
      if (token !== loadToken.current) return;
      const built = buildLines(loaded);
      setItem(loaded);
      setLines(built);
      setFocusKey(null);
      setCoefficientText(String(coefficients[loaded.id] ?? 100));
      setStatus(built.length ? "" : "Cet objet n’a aucune caractéristique qui donne des runes.");
    } catch {
      if (token === loadToken.current) setStatus("Objet indisponible sur DofusDB. Réessaie.");
    }
  }

  const updateLine = (key: string, changes: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));

  const coefficient = parseCoefficient(coefficientText);
  const activeLines = lines.filter((line): line is Line & { rune: Rune } => line.rune !== null);
  const result: ShatterResult | null =
    item && coefficient !== null
      ? calculateShatter({
          level: Number(item.level) || 1,
          coefficient,
          lines: activeLines.map((line) => ({
            jet: Math.max(0, Number(line.jet) || 0),
            weight: line.rune.effect.weight,
            runeValue: line.rune.value,
            negative: line.negative,
            exo: line.exo,
            price: line.negative ? null : readPrice(line.rune.id),
          })),
        })
      : null;

  const ranks = new Map((result?.options ?? []).slice(0, 3).map((option, rank) => [option.index, rank + 1]));
  const best = result?.best ?? null;
  const focusable = activeLines.filter((line, index) => result?.rows[index]?.runesWithFocus != null || (result === null && !line.negative && !line.exo));
  const validFocusKey = focusKey === "" || focusable.some((line) => line.key === focusKey) ? focusKey : null;
  const selectedFocus = validFocusKey ?? (best?.index == null ? "" : activeLines[best.index]!.key);
  const breakEven = best && cost !== null && coefficient !== null ? calculateBreakEvenCoefficient(cost, coefficient, best.value) : null;
  const usedCharacteristics = new Set(lines.map((line) => line.rune?.characteristic));

  function recordInLog() {
    if (!item) return;
    // Expected rune counts for the chosen focus, rounded to whole runes as the game drops them.
    const focusIndex = activeLines.findIndex((line) => line.key === selectedFocus);
    const totals = new Map<Rune, number>();
    activeLines.forEach((line, index) => {
      if (!result || (focusIndex !== -1 && index !== focusIndex)) return;
      const row = result.rows[index]!;
      const quantity = Math.round((focusIndex === -1 ? row.runesWithoutFocus : row.runesWithFocus) ?? 0);
      if (quantity > 0) totals.set(line.rune, (totals.get(line.rune) ?? 0) + quantity);
    });
    fillDraft({
      item,
      itemSearch: itemName(item),
      unitCost: cost === null ? "" : String(cost),
      coefficient: coefficient === null ? "" : String(coefficient).replace(".", ","),
      runes: totals.size ? [...totals].map(([rune, quantity]) => draftRune(rune.name, String(quantity))) : [draftRune()],
      focus: "rune",
    });
  }

  return (
    <Card aria-label="Calculateur de brisage">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-auto min-w-72 flex-1">
            <FieldLabel htmlFor="shatterSearch">Objet à briser</FieldLabel>
            <EquipmentSearch id="shatterSearch" placeholder="Bottes Lunaires, Gelano…" value={search} onValueChange={setSearch} onSelect={selectItem} />
          </Field>
          {status ? (
            <p className="pb-2 text-sm text-muted-foreground" role="status">
              {status}
            </p>
          ) : null}
        </div>

        {item ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-60 flex-1 items-center gap-2">
                <ItemIcon item={item} className="size-10" />
                <span>
                  <CopyName name={itemName(item)} />
                  <Meta>
                    Niv. {item.level ?? "–"} · n°{item.id}
                  </Meta>
                </span>
              </div>
              <Field className="w-28">
                <FieldLabel htmlFor="shatterCoef">Coefficient (%)</FieldLabel>
                <Input
                  id="shatterCoef"
                  inputMode="decimal"
                  autoComplete="off"
                  value={coefficientText}
                  onChange={(event) => setCoefficientText(event.currentTarget.value)}
                  onBlur={() => coefficient !== null && saveCoefficient(item.id, coefficient)}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                />
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor="shatterPrice">Prix de l’objet (k)</FieldLabel>
                <PriceInput id="shatterPrice" itemId={item.id} placeholder="Prix" className="w-36" />
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor="shatterFocus">Focus noté</FieldLabel>
                <NativeSelect id="shatterFocus" value={selectedFocus} onChange={(event) => setFocusKey(event.currentTarget.value)}>
                  <NativeSelectOption value="">Sans focus{result?.totalWithoutFocus != null ? ` · ${formatMoney(result.totalWithoutFocus)} k` : ""}</NativeSelectOption>
                  {focusable.map((line) => {
                    const kamas = result?.rows[activeLines.indexOf(line)]?.kamasWithFocus;
                    return (
                      <NativeSelectOption key={line.key} value={line.key}>
                        Focus {line.rune.effect.label}
                        {kamas != null ? ` · ${formatMoney(kamas)} k` : ""}
                      </NativeSelectOption>
                    );
                  })}
                </NativeSelect>
              </Field>
              <Button variant="outline" onClick={recordInLog}>
                <NotebookPenIcon data-icon="inline-start" />
                Noter ce brisage
              </Button>
            </div>

            <MetricGrid label="Résultat du brisage">
              <Metric
                label="Meilleur résultat"
                value={best ? `${formatMoney(best.value)} k` : "–"}
                meta={
                  best
                    ? best.index === null
                      ? "Sans focus"
                      : `Focus ${activeLines[best.index]!.rune.effect.label}`
                    : result?.missing
                      ? "Renseigne le prix des runes."
                      : "Renseigne le coefficient."
                }
              />
              <Metric
                label="Bénéfice"
                value={best && cost !== null ? <Gain value={best.value - cost} /> : "–"}
                meta={cost === null ? "Renseigne le prix de l’objet." : `Pour un objet à ${formatMoney(cost)} k.`}
              />
              <Metric
                label="Seuil de rentabilité"
                value={breakEven === null ? "–" : `${formatQuantity(breakEven)} %`}
                meta={
                  breakEven === null
                    ? "Coefficient minimum pour rentrer dans tes frais."
                    : coefficient! >= breakEven
                      ? "Le coefficient actuel est rentable."
                      : "Le coefficient actuel n’est pas rentable."
                }
              />
            </MetricGrid>

            <div role="group" aria-label="Jets" className="flex items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Jets</span>
              {(["min", "mid", "max"] as const).map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((current) =>
                      current.map((line) =>
                        line.exo || line.from === null || line.to === null
                          ? line
                          : { ...line, jet: preset === "min" ? line.from : preset === "max" ? line.to : Math.round((line.from + line.to) / 2) },
                      ),
                    )
                  }
                >
                  {preset === "min" ? "Min" : preset === "max" ? "Max" : "Moyen"}
                </Button>
              ))}
            </div>

            <Table aria-label="Runes par caractéristique">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead colSpan={4} />
                  <TableHead colSpan={2} scope="colgroup" className="border-l text-center">
                    Sans focus
                  </TableHead>
                  <TableHead colSpan={2} scope="colgroup" className="border-l text-center">
                    Avec focus
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead scope="col">Caractéristique</TableHead>
                  <TableHead scope="col">Jet</TableHead>
                  <TableHead scope="col">Rune</TableHead>
                  <TableHead scope="col">Prix (k/u)</TableHead>
                  <TableHead scope="col" className="border-l text-right">
                    Runes
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Kamas
                  </TableHead>
                  <TableHead scope="col" className="border-l text-right">
                    Runes
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Kamas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const index = line.rune ? activeLines.indexOf(line as Line & { rune: Rune }) : -1;
                  const values = index === -1 ? undefined : result?.rows[index];
                  return (
                    <TableRow key={line.key} className={cn(line.negative && "text-muted-foreground", line.exo && "bg-info-muted/40")}>
                      <TableHead scope="row" className="font-medium">
                        {line.exo ? (
                          <span className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-xs" aria-label="Retirer cet exo" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>
                              <XIcon />
                            </Button>
                            <NativeSelect
                              size="sm"
                              aria-label="Caractéristique exo"
                              value={line.rune ? String(line.rune.id) : ""}
                              onChange={(event) => {
                                const rune = runeById.get(event.currentTarget.value) ?? null;
                                updateLine(line.key, { rune, label: rune?.effect.label ?? "" });
                              }}
                            >
                              <NativeSelectOption value="">Exo…</NativeSelectOption>
                              {exoRunes
                                .filter((rune) => rune === line.rune || !usedCharacteristics.has(rune.characteristic))
                                .map((rune) => (
                                  <NativeSelectOption key={rune.id} value={String(rune.id)}>
                                    {rune.effect.label}
                                  </NativeSelectOption>
                                ))}
                            </NativeSelect>
                          </span>
                        ) : (
                          line.label
                        )}
                      </TableHead>
                      <TableCell>{line.rune ? <JetControl line={line} onChange={(jet) => updateLine(line.key, { jet })} /> : null}</TableCell>
                      <TableCell>
                        {line.rune && !line.negative ? (
                          <span className="flex items-center gap-1.5">
                            <ItemIcon src={line.rune.img} className="size-6" />
                            {shortRuneName(line.rune)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {line.rune && !line.negative ? (
                          <PriceInput itemId={line.rune.id} placeholder="Prix" className="w-24" aria-label={`Prix HDV ${line.rune.name} (kamas par unité)`} />
                        ) : null}
                      </TableCell>
                      <TableCell className="border-l text-right tabular-nums">{values?.runesWithoutFocus == null ? "" : formatNumber(values.runesWithoutFocus)}</TableCell>
                      <TableCell className="text-right tabular-nums">{values?.kamasWithoutFocus == null ? "" : `${formatMoney(values.kamasWithoutFocus)} k`}</TableCell>
                      <TableCell className="border-l text-right tabular-nums">{values?.runesWithFocus == null ? "" : formatNumber(values.runesWithFocus)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {values?.kamasWithFocus == null ? (
                          ""
                        ) : (
                          <Ranked rank={ranks.get(index)}>{`${formatMoney(values.kamasWithFocus)} k`}</Ranked>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableHead scope="row" colSpan={5}>
                    Total kamas sans focus
                  </TableHead>
                  <TableCell colSpan={3} className="text-right tabular-nums">
                    {result === null ? (
                      "Coefficient requis"
                    ) : result.totalWithoutFocus === null ? (
                      <>
                        Prix requis
                        <MissingBadge missing={result.missing} />
                      </>
                    ) : (
                      <Ranked rank={ranks.get(null)}>{`${formatMoney(result.totalWithoutFocus)} k`}</Ranked>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((current) => [...current, { key: `exo-${nextExoKey++}`, rune: null, label: "", from: null, to: null, jet: 1, negative: false, exo: true }])}
              >
                <PlusIcon data-icon="inline-start" />
                Exo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chaque ligne donne un poids de (3 × jet × poids de la caractéristique × niveau) / 200 + 1, converti en runes simples selon le coefficient. Le
              focus ajoute à la caractéristique choisie la moitié du poids des autres lignes positives. Les meilleurs résultats sont numérotés de 1 à 3.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

const rankClasses = ["", "bg-success text-background", "bg-success/70 text-background", "bg-success/40 text-foreground"];

/** Marks the top three shatter outcomes. */
function Ranked({ rank, children }: { rank: number | undefined; children: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", rank === 1 && "font-semibold text-success")}>
      {rank ? (
        <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[0.7rem] font-semibold", rankClasses[rank])} aria-label={`Rang ${rank}`}>
          {rank}
        </span>
      ) : null}
      {children}
    </span>
  );
}

function JetControl({ line, onChange }: { line: Line; onChange: (jet: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const sign = line.negative ? "-" : "";
  const label = line.label || line.rune?.effect.label || "";
  return (
    <div className="flex items-center gap-1">
      {line.from === null ? null : <Meta className="w-8 text-right">{`${sign}${formatQuantity(line.from)}`}</Meta>}
      <Button variant="ghost" size="icon-xs" aria-label={`Diminuer ${label}`} onClick={() => onChange(clampJet(line, line.jet - 1))}>
        <MinusIcon />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        className="h-7 w-16 text-center tabular-nums"
        aria-label={`Jet ${label}`}
        min={line.from ?? 1}
        max={line.to ?? undefined}
        step={1}
        value={draft ?? line.jet}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setDraft(value);
          if (value !== "") onChange(Number(value));
        }}
        onBlur={() => {
          onChange(clampJet(line, Number(draft ?? line.jet)));
          setDraft(null);
        }}
      />
      <Button variant="ghost" size="icon-xs" aria-label={`Augmenter ${label}`} onClick={() => onChange(clampJet(line, line.jet + 1))}>
        <PlusIcon />
      </Button>
      {line.to === null ? null : <Meta className="w-8">{`${sign}${formatQuantity(line.to)}`}</Meta>}
    </div>
  );
}
