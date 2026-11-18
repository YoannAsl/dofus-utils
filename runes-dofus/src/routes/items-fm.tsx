import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { CopyName, EmptyRow, ItemIcon, Meta, Metric, MetricGrid, PageHeader } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchItemsForType, FM_JOB_GROUPS, itemName, type DofusItem, type FmJobId } from "@/lib/dofusdb";
import { formatDensity, formatMoney, formatQuantity } from "@/lib/format";
import { calculateItemEconomy, calculateRuneAcquisition, type RuneAcquisition } from "@/lib/pricing";
import { DEFAULT_XP_RUNE_ID, runeById, runeFamily, xpRunes, type Rune } from "@/lib/runes";
import { localizedName, normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";
import { usePriceReader } from "@/stores/prices";

const ITEM_RESULT_LIMIT = 40;
const SORTS = [
  { value: "potential", label: "Potentiel XP" },
  { value: "cost", label: "Coût / densité" },
  { value: "level", label: "Niveau" },
  { value: "name", label: "Nom" },
] as const;
type ItemSort = (typeof SORTS)[number]["value"];

interface ItemsSearch {
  rune?: number;
  job?: FmJobId;
  type?: number;
  min?: number;
  max?: number;
  q?: string;
  sort?: ItemSort;
}

function level(value: unknown) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute("/items-fm")({
  validateSearch: (search: Record<string, unknown>): ItemsSearch => ({
    rune: runeById.get(String(search.rune))?.density && String(search.rune) !== DEFAULT_XP_RUNE_ID ? Number(search.rune) : undefined,
    job: FM_JOB_GROUPS.find((group) => group.id === search.job && group.id !== "all")?.id,
    type: level(search.type),
    min: level(search.min),
    max: level(search.max),
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    sort: SORTS.find((entry) => entry.value === search.sort && entry.value !== "potential")?.value,
  }),
  component: ItemsPage,
});

interface Candidate {
  id: string;
  item: DofusItem;
  name: string;
  typeName: string;
  level: number;
  minValue: number;
  maxValue: number;
  runeUses: number;
  potentialDensity: number;
}

// An item can take the rune as long as it rolls the rune's characteristic with a positive value.
function buildCandidate(item: DofusItem, rune: Rune): Candidate | null {
  const match = (item.effects ?? [])
    .filter((effect) => Number(effect.effectId) === Number(rune.effectId))
    .filter((effect) => rune.characteristic === null || Number(effect.characteristic) === Number(rune.characteristic))
    .map((effect) => [Number(effect.from), Number(effect.to)].filter((value) => Number.isFinite(value) && value > 0))
    .filter((values) => values.length)
    .map((values) => ({ minValue: Math.min(...values), maxValue: Math.max(...values) }))
    .sort((a, b) => b.maxValue - a.maxValue)[0];
  if (!match) return null;
  const runeUses = Math.max(1, Math.floor(match.maxValue / Math.max(Number(rune.value) || 1, 1)));
  return {
    id: String(item.id),
    item,
    name: localizedName(item.name),
    typeName: localizedName(item.type?.name) || `Type ${item.typeId || "-"}`,
    level: Number(item.level) || 0,
    ...match,
    runeUses,
    potentialDensity: runeUses * rune.density,
  };
}

type Visible = { candidate: Candidate; economy: ReturnType<typeof calculateItemEconomy> };
const byPotential = (a: Visible, b: Visible) =>
  b.candidate.runeUses - a.candidate.runeUses ||
  b.candidate.potentialDensity - a.candidate.potentialDensity ||
  a.candidate.level - b.candidate.level ||
  a.candidate.name.localeCompare(b.candidate.name, "fr");
const SORTERS: Record<ItemSort, (a: Visible, b: Visible) => number> = {
  potential: byPotential,
  cost: (a, b) => (a.economy.costPerDensity ?? Infinity) - (b.economy.costPerDensity ?? Infinity) || byPotential(a, b),
  level: (a, b) => a.candidate.level - b.candidate.level || byPotential(a, b),
  name: (a, b) => a.candidate.name.localeCompare(b.candidate.name, "fr") || byPotential(a, b),
};

function ItemsPage() {
  const search = Route.useSearch();
  const { job = "all", sort = "potential", q = "" } = search;
  const rune = runeById.get(String(search.rune ?? DEFAULT_XP_RUNE_ID))!;
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const readPrice = usePriceReader();
  const [requested, setRequested] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const group = FM_JOB_GROUPS.find((entry) => entry.id === job) ?? FM_JOB_GROUPS[0];
  const searchKey = `${rune.id}:${group.id}`;

  // DofusDB is only queried on demand; each item type stays cached for the session.
  const candidates = useQuery({
    queryKey: ["fm-candidates", rune.id, group.id],
    enabled: requested === searchKey,
    queryFn: async ({ signal }) => {
      const items: DofusItem[] = [];
      for (const [index, typeId] of group.typeIds.entries()) {
        setProgress(`Chargement DofusDB ${index + 1} / ${group.typeIds.length}`);
        items.push(
          ...(await queryClient.fetchQuery({ queryKey: ["items-of-type", typeId], queryFn: () => fetchItemsForType(typeId, signal) })),
        );
      }
      return items.map((item) => buildCandidate(item, rune)).filter((candidate) => candidate !== null);
    },
  });
  const searched = requested === searchKey;
  const loading = searched && candidates.isFetching;
  const all = searched ? (candidates.data ?? []) : [];

  const acquisition: RuneAcquisition = calculateRuneAcquisition(rune, runeFamily(rune), (entry) => readPrice(entry.id));
  const types = [...new Map(all.map((candidate) => [candidate.item.typeId!, candidate.typeName]))].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const typeId = types.some(([id]) => id === search.type) ? search.type : undefined;
  const query = normalizeText(q);
  const visible = all
    .filter((candidate) => {
      if (typeId && candidate.item.typeId !== typeId) return false;
      if (search.min !== undefined && candidate.level < search.min) return false;
      if (search.max !== undefined && candidate.level > search.max) return false;
      return !query || normalizeText(candidate.name).includes(query) || normalizeText(candidate.typeName).includes(query);
    })
    .map((candidate) => ({ candidate, economy: calculateItemEconomy(candidate, acquisition, readPrice(candidate.id)) }))
    .sort(SORTERS[sort]);

  let status = "Recherche prête.";
  if (loading) status = progress || `Chargement ${group.label}...`;
  else if (searched && candidates.isError) status = "Chargement DofusDB impossible.";
  else if (searched && candidates.data) status = `${all.length} items compatibles pour ${rune.name}.`;
  else if (requested) status = "Relance une recherche avec les nouveaux critères.";

  const setSearch = (changes: Partial<ItemsSearch>) => navigate({ search: (prev) => ({ ...prev, ...changes }), replace: true });

  return (
    <>
      <PageHeader title="Trouver un item pour XP" aside={<span role="status">{status}</span>} />

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-auto">
          <FieldLabel>Rune</FieldLabel>
          <RunePicker value={rune} onChange={(next) => setSearch({ rune: String(next.id) === DEFAULT_XP_RUNE_ID ? undefined : next.id, type: undefined })} />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="itemJob">Métier</FieldLabel>
          <NativeSelect
            id="itemJob"
            value={group.id}
            onChange={(event) => setSearch({ job: event.currentTarget.value === "all" ? undefined : (event.currentTarget.value as FmJobId), type: undefined })}
          >
            {FM_JOB_GROUPS.map((entry) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                {entry.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="itemType">Type d’objet</FieldLabel>
          <NativeSelect id="itemType" value={typeId ? String(typeId) : ""} disabled={!types.length} onChange={(event) => setSearch({ type: level(event.currentTarget.value) })}>
            <NativeSelectOption value="">Tous les types</NativeSelectOption>
            {types.map(([id, name]) => (
              <NativeSelectOption key={id} value={String(id)}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-24">
          <FieldLabel htmlFor="itemMin">Niv. min</FieldLabel>
          <Input id="itemMin" type="number" min={1} max={250} placeholder="1" value={search.min ?? ""} onChange={(event) => setSearch({ min: level(event.currentTarget.value) })} />
        </Field>
        <Field className="w-24">
          <FieldLabel htmlFor="itemMax">Niv. max</FieldLabel>
          <Input id="itemMax" type="number" min={1} max={250} placeholder="200" value={search.max ?? ""} onChange={(event) => setSearch({ max: level(event.currentTarget.value) })} />
        </Field>
        <Field className="w-auto min-w-44 flex-1">
          <FieldLabel htmlFor="itemSearch">Item</FieldLabel>
          <Input id="itemSearch" type="search" placeholder="Amulette, cape..." value={q} onChange={(event) => setSearch({ q: event.currentTarget.value || undefined })} />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="itemSort">Tri</FieldLabel>
          <NativeSelect id="itemSort" value={sort} onChange={(event) => setSearch({ sort: event.currentTarget.value as ItemSort })}>
            {SORTS.map((entry) => (
              <NativeSelectOption key={entry.value} value={entry.value}>
                {entry.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button
          disabled={loading}
          onClick={() => {
            if (requested === searchKey && candidates.isError) candidates.refetch();
            setRequested(searchKey);
          }}
        >
          <SearchIcon data-icon="inline-start" />
          Chercher
        </Button>
      </div>

      <MetricGrid label="Synthèse items FM">
        <Metric label="Rune choisie" value={rune.name} meta={`${rune.effect.label} · ${formatDensity(rune.density)} densité par rune`} />
        <Metric
          label="Coût rune"
          value={acquisition.best ? `${formatMoney(acquisition.best.cost)} k` : "Prix requis"}
          meta={acquisition.best ? acquisition.best.label : "Renseigne le prix direct ou le craft de la rune."}
        />
        <Metric
          label="Candidats"
          value={loading ? "..." : searched ? `${visible.length} / ${all.length}` : "0"}
          meta={
            loading
              ? "Chargement DofusDB."
              : searched
                ? visible.length > ITEM_RESULT_LIMIT
                  ? `Affichage des ${ITEM_RESULT_LIMIT} meilleurs.`
                  : "Résultats filtrés."
                : "Aucune recherche lancée."
          }
        />
      </MetricGrid>

      <Card className="py-0">
        <Table aria-label="Tableau des items FM">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Jet</TableHead>
              <TableHead className="text-right">Runes</TableHead>
              <TableHead>Prix item</TableHead>
              <TableHead className="text-right">Coût / 1 000 dens.</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <EmptyRow colSpan={6}>Chargement des items compatibles...</EmptyRow>
            ) : !searched || !candidates.data ? (
              <EmptyRow colSpan={6}>Lance une recherche pour afficher les items compatibles.</EmptyRow>
            ) : !all.length ? (
              <EmptyRow colSpan={6}>Aucun item compatible avec {rune.name} dans ce métier.</EmptyRow>
            ) : !visible.length ? (
              <EmptyRow colSpan={6}>Aucun item ne correspond aux filtres.</EmptyRow>
            ) : (
              visible.slice(0, ITEM_RESULT_LIMIT).map(({ candidate, economy }) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ItemIcon item={candidate.item} />
                      <span>
                        <CopyName name={candidate.name || itemName(candidate.item)} />
                        <Meta>
                          {candidate.typeName} · niv. {candidate.level}
                        </Meta>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <strong>{candidate.minValue === candidate.maxValue ? candidate.maxValue : `${candidate.minValue} à ${candidate.maxValue}`}</strong>
                    <Meta>{rune.effect.label}</Meta>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <strong>{formatQuantity(candidate.runeUses)}</strong>
                    <Meta>{formatDensity(candidate.potentialDensity)} dens.</Meta>
                  </TableCell>
                  <TableCell>
                    <PriceInput itemId={candidate.id} placeholder="0" aria-label={`Prix HDV ${candidate.name}`} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <strong>{economy.costPerDensity ? `${formatMoney(economy.costPerDensity)} k` : "-"}</strong>
                    <Meta>{!economy.itemPrice ? "Prix item requis" : !economy.runeCost ? "Hors coût runes" : `${formatMoney(economy.totalCost!)} k total`}</Meta>
                  </TableCell>
                  <TableCell className="max-w-72 text-sm whitespace-normal text-muted-foreground">
                    {!economy.itemPrice
                      ? `Potentiel théorique: ${formatQuantity(candidate.runeUses)} ${rune.name} avant de vider ${candidate.maxValue} ${rune.effect.unit}.`
                      : !acquisition.best
                        ? `Prix item saisi: ${formatMoney(economy.itemPrice)} kamas. Renseigne le coût de la rune pour comparer le total.`
                        : `${formatMoney(economy.itemPrice)} k item + ${formatMoney(economy.runeCost!)} k runes pour ${formatDensity(candidate.potentialDensity)} densité théorique.`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function RunePicker({ value, onChange }: { value: Rune; onChange: (rune: Rune) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-56 justify-between font-normal">
          {value.name}
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command
          filter={(itemValue, searchValue) => (normalizeText(itemValue).includes(normalizeText(searchValue)) ? 1 : 0)}
        >
          <CommandInput placeholder="Rechercher une rune..." />
          <CommandList>
            <CommandEmpty>Aucune rune trouvée.</CommandEmpty>
            {xpRunes.map((rune) => (
              <CommandItem
                key={rune.id}
                value={`${rune.name} ${rune.effect.label} ${rune.baseName}`}
                onSelect={() => {
                  onChange(rune);
                  setOpen(false);
                }}
              >
                <CheckIcon className={cn(rune.id === value.id ? "opacity-100" : "opacity-0")} />
                <span className="flex flex-col">
                  <span>{rune.name}</span>
                  <Meta>
                    {rune.effect.label} · {formatDensity(rune.density)} dens.
                  </Meta>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
