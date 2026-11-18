import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DecisionBadge, EmptyRow, Gain, Meta, Metric, MetricGrid, PageHeader } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDensity, formatMoney, formatQuantity, formatXpRatio } from "@/lib/format";
import { calculateRuneAcquisition, getTargetDensityCost, type RuneAcquisition } from "@/lib/pricing";
import { runeFamily, runes, type Rune } from "@/lib/runes";
import { cn } from "@/lib/utils";
import { useOcrStore } from "@/stores/ocr";
import { usePriceReader, usePriceStore } from "@/stores/prices";

const DECISIONS = [
  { value: "all", label: "Toutes" },
  { value: "craft", label: "Crafter rentable" },
  { value: "buy", label: "Acheter direct" },
  { value: "missing", label: "Prix manquants" },
  { value: "xp", label: "Top XP" },
] as const;
const SORTS = [
  { value: "targetCost", label: "Coût / 1 000" },
  { value: "profit", label: "Profit craft" },
  { value: "saving", label: "Économie achat" },
  { value: "density", label: "Densité" },
  { value: "name", label: "Nom" },
] as const;
type DecisionFilter = (typeof DECISIONS)[number]["value"];
type RuneSort = (typeof SORTS)[number]["value"];

interface RunesSearch {
  q?: string;
  family?: string;
  decision?: DecisionFilter;
  sort?: RuneSort;
}

export const Route = createFileRoute("/runes")({
  validateSearch: (search: Record<string, unknown>): RunesSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    family: typeof search.family === "string" && search.family !== "all" ? search.family : undefined,
    decision: DECISIONS.find((entry) => entry.value === search.decision && entry.value !== "all")?.value,
    sort: SORTS.find((entry) => entry.value === search.sort && entry.value !== "targetCost")?.value,
  }),
  component: RunesPage,
});

const categories = [...new Set(runes.map((rune) => rune.effect.family))].sort((a, b) => a.localeCompare(b, "fr"));
const characteristics = [...new Set(runes.map((rune) => rune.baseName))].sort((a, b) => a.localeCompare(b, "fr"));

interface Row {
  rune: Rune;
  acquisition: RuneAcquisition;
}

const byXp = (a: Row, b: Row) =>
  (b.acquisition.xpOptimal || -Infinity) - (a.acquisition.xpOptimal || -Infinity) || a.rune.name.localeCompare(b.rune.name, "fr");
const targetCost = (row: Row) => getTargetDensityCost(row.rune, row.acquisition)?.cost ?? Infinity;

const SORTERS: Record<RuneSort, (a: Row, b: Row) => number> = {
  name: (a, b) => a.rune.name.localeCompare(b.rune.name, "fr"),
  density: (a, b) => b.rune.density - a.rune.density || a.rune.name.localeCompare(b.rune.name, "fr"),
  profit: (a, b) => b.acquisition.profit - a.acquisition.profit || byXp(a, b),
  saving: (a, b) => (b.acquisition.saving || -Infinity) - (a.acquisition.saving || -Infinity) || byXp(a, b),
  targetCost: (a, b) => targetCost(a) - targetCost(b) || byXp(a, b),
};

function detailText({ rune, acquisition }: Row) {
  if (rune.density <= 0) return "Rune sans densité XP exploitable dans cet outil.";
  if (!acquisition.best) return "Renseigne le prix direct ou les prix des tiers inférieurs.";
  if (acquisition.best.kind === "buy") {
    if (acquisition.bestCraft && acquisition.directPrice) {
      const delta = acquisition.directPrice - acquisition.bestCraft.cost;
      return delta <= 0
        ? `Achat direct moins cher que le meilleur craft de ${formatMoney(Math.abs(delta))} kamas.`
        : `Le craft serait moins cher de ${formatMoney(delta)} kamas.`;
    }
    return "Pas de tier inférieur disponible ou prix inférieur manquant.";
  }
  const { label, quantity, unitPrice } = acquisition.best;
  return `${label}: ${quantity} × ${formatMoney(unitPrice ?? 0)} kamas.`;
}

function RunesPage() {
  const { q = "", family = "all", decision = "all", sort = "targetCost" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const readPrice = usePriceReader();
  const savedAt = usePriceStore((state) => state.savedAt.prices);
  const updatedRuneId = useOcrStore((state) => state.updatedRuneId);

  const readRunePrice = (rune: Rune) => readPrice(rune.id);
  const rows: Row[] = runes.map((rune) => ({ rune, acquisition: calculateRuneAcquisition(rune, runeFamily(rune), readRunePrice) }));
  const bestXp = rows.filter((row) => row.acquisition.xpOptimal).sort((a, b) => b.acquisition.xpOptimal! - a.acquisition.xpOptimal!)[0];
  const bestCraft = rows.filter((row) => row.acquisition.profit > 0).sort((a, b) => b.acquisition.profit - a.acquisition.profit)[0];
  const bestSaving = rows.filter((row) => (row.acquisition.saving ?? 0) > 0).sort((a, b) => b.acquisition.saving! - a.acquisition.saving!)[0];
  const priced = runes.filter((rune) => readPrice(rune.id)).length;

  const query = q.trim().toLowerCase();
  const visible = rows
    .filter(({ rune, acquisition }) => {
      const matchesSearch = !query || rune.name.toLowerCase().includes(query) || rune.effect.label.toLowerCase().includes(query);
      const matchesFamily = family === "all" || family === `category:${rune.effect.family}` || family === `base:${rune.baseName}`;
      const matchesDecision =
        decision === "all" || (decision === "xp" && bestXp?.rune.id === rune.id) || acquisition.decision === decision;
      return matchesSearch && matchesFamily && matchesDecision;
    })
    .sort(SORTERS[sort]);

  const setSearch = (changes: Partial<RunesSearch>) => navigate({ search: (prev) => ({ ...prev, ...changes }), replace: true });

  return (
    <>
      <PageHeader
        title="Acheter ou crafter des runes"
        description="Compare les prix HDV et le coût pour 1 000 points de densité."
        aside={
          <span className="flex flex-col items-end">
            <span>
              <strong className="text-foreground">
                {priced} / {runes.length}
              </strong>{" "}
              prix saisis
            </span>
            <span role="status">
              {savedAt ? `Sauvegardé localement à ${savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Sauvegarde locale active."}
            </span>
          </span>
        }
      />

      <MetricGrid label="Recommandations">
        <Metric
          label="Meilleur rendement XP"
          value={bestXp ? bestXp.rune.name : "Prix requis"}
          meta={
            bestXp
              ? `${formatXpRatio(bestXp.acquisition.xpOptimal)} densité / 1 000 kamas via ${bestXp.acquisition.best!.label.toLowerCase()}`
              : "Renseigne au moins un prix."
          }
        />
        <Metric
          label="Meilleure revente après craft"
          value={bestCraft ? bestCraft.rune.name : "Aucune opportunité"}
          meta={bestCraft ? `+${formatMoney(bestCraft.acquisition.profit)} kamas si revendu au prix HDV.` : "Aucun craft positif avec les prix actuels."}
        />
        <Metric
          label="Meilleure économie à l’achat"
          value={bestSaving ? bestSaving.rune.name : "Prix requis"}
          meta={
            bestSaving ? `${formatMoney(bestSaving.acquisition.saving!)} kamas économisés vs achat direct.` : "Compare achat direct et craft dès que les prix existent."
          }
        />
      </MetricGrid>

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-auto min-w-52 flex-1">
          <FieldLabel htmlFor="runeSearch">Rune</FieldLabel>
          <Input id="runeSearch" type="search" placeholder="Fo, Pa Sa…" value={q} onChange={(event) => setSearch({ q: event.currentTarget.value || undefined })} />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="runeFamily">Famille</FieldLabel>
          <NativeSelect id="runeFamily" value={family} onChange={(event) => setSearch({ family: event.currentTarget.value === "all" ? undefined : event.currentTarget.value })}>
            <NativeSelectOption value="all">Toutes</NativeSelectOption>
            <NativeSelectOptGroup label="Catégories">
              {categories.map((name) => (
                <NativeSelectOption key={name} value={`category:${name}`}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Caractéristiques">
              {characteristics.map((name) => (
                <NativeSelectOption key={name} value={`base:${name}`}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="runeDecision">Décision</FieldLabel>
          <NativeSelect id="runeDecision" value={decision} onChange={(event) => setSearch({ decision: event.currentTarget.value as DecisionFilter })}>
            {DECISIONS.map((entry) => (
              <NativeSelectOption key={entry.value} value={entry.value}>
                {entry.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="runeSort">Tri</FieldLabel>
          <NativeSelect id="runeSort" value={sort} onChange={(event) => setSearch({ sort: event.currentTarget.value as RuneSort })}>
            {SORTS.map((entry) => (
              <NativeSelectOption key={entry.value} value={entry.value}>
                {entry.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Card className="py-0">
        <Table aria-label="Tableau des runes">
          <TableHeader>
            <TableRow>
              <TableHead>Rune</TableHead>
              <TableHead>Prix HDV</TableHead>
              <TableHead className="text-right">Densité</TableHead>
              <TableHead className="text-right">Coût optimal</TableHead>
              <TableHead>Décision</TableHead>
              <TableHead className="text-right">Écart achat / craft</TableHead>
              <TableHead className="text-right">Coût / 1 000 dens.</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const { rune, acquisition } = row;
              const target = getTargetDensityCost(rune, acquisition);
              return (
                <TableRow
                  key={rune.id}
                  className={cn(
                    bestXp?.rune.id === rune.id && "bg-success-muted/60 hover:bg-success-muted",
                    String(rune.id) === updatedRuneId && "animate-[ocr-flash_2s_ease-out]",
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img src={rune.img} alt="" loading="lazy" className="size-8 shrink-0" />
                      <span>
                        <span className="block font-medium">{rune.name}</span>
                        <Meta>
                          {rune.effect.label} · {rune.tierLabel} · niv. {rune.level}
                        </Meta>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriceInput itemId={rune.id} aria-label={`Prix HDV ${rune.name}`} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatDensity(rune.density)}</TableCell>
                  <TableCell className="text-right tabular-nums">{acquisition.best ? `${formatMoney(acquisition.best.cost)} k` : "-"}</TableCell>
                  <TableCell>
                    <DecisionBadge decision={acquisition.decision}>{acquisition.badge}</DecisionBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Gain value={acquisition.saving} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <strong>{target ? `${formatMoney(target.cost)} k` : "-"}</strong>
                    {target ? (
                      <Meta>
                        {formatQuantity(target.quantity)} runes · {formatDensity(target.density)} dens.
                      </Meta>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-72 text-sm whitespace-normal text-muted-foreground">{detailText(row)}</TableCell>
                </TableRow>
              );
            })}
            {visible.length ? null : <EmptyRow colSpan={8}>Aucune rune ne correspond aux filtres.</EmptyRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
