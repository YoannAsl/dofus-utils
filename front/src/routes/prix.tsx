import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon, ScanTextIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText, CopyName, EmptyRow, ItemIcon, PageHeader } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchItemTypes,
  fetchRecipe,
  itemName,
  MARKET_PAGE_SIZE,
  searchMarketItems,
  typesForCategory,
  type DofusItem,
  type MarketCategory,
} from "@/lib/dofusdb";
import { formatMarketPrice, formatQuantity, plural } from "@/lib/format";
import { calculateRecipeCost } from "@/lib/pricing";
import { localizedName } from "@/lib/text";
import { associateOcrItem, useOcrStore } from "@/stores/ocr";
import { usePrice, usePriceReader } from "@/stores/prices";

interface MarketSearch {
  q?: string;
  cat?: MarketCategory;
  type?: number;
  page?: number;
}

const CATEGORIES: { value: MarketCategory; label: string }[] = [
  { value: "market", label: "Ressources et équipements" },
  { value: "2", label: "Ressources" },
  { value: "0", label: "Équipements" },
  { value: "all", label: "Tous les objets" },
];

export const Route = createFileRoute("/prix")({
  validateSearch: (search: Record<string, unknown>): MarketSearch => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 120) : undefined,
    cat: CATEGORIES.some((category) => category.value === String(search.cat)) ? (String(search.cat) as MarketCategory) : undefined,
    type: Number.isInteger(Number(search.type)) && Number(search.type) > 0 ? Number(search.type) : undefined,
    page: Number.isInteger(Number(search.page)) && Number(search.page) > 0 ? Number(search.page) : undefined,
  }),
  component: MarketPage,
});

export const itemTypesQuery = { queryKey: ["item-types"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchItemTypes(signal) };

function MarketPage() {
  const { q = "", cat = "market", type, page = 0 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [searchText, setSearchText] = useState(q);
  const [selected, setSelected] = useState<DofusItem | null>(null);

  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => navigate({ search: (prev) => ({ ...prev, q: trimmed || undefined, page: undefined }), replace: true }), 250);
    return () => clearTimeout(timer);
  }, [searchText, q, navigate]);

  const types = useQuery(itemTypesQuery);
  const categoryTypes = typesForCategory(types.data ?? [], cat);
  const typeIds = type ? [type] : cat === "all" ? null : categoryTypes.map((entry) => entry.id);
  const results = useQuery({
    queryKey: ["market", q, cat, type, page],
    queryFn: ({ signal }) => searchMarketItems({ search: q, typeIds, page }, signal),
    enabled: cat === "all" || types.isSuccess,
    placeholderData: keepPreviousData,
  });
  const typeNames = new Map((types.data ?? []).map((entry) => [entry.id, localizedName(entry.name)]));
  const pageCount = Math.ceil((results.data?.total ?? 0) / MARKET_PAGE_SIZE);
  const failed = results.isError || (cat !== "all" && types.isError);

  let status = "Chargement du catalogue…";
  if (failed) status = "Catalogue DofusDB indisponible.";
  else if (searchText.trim() !== q || results.isFetching) status = "Recherche…";
  else if (results.data) status = results.data.total ? `${formatQuantity(results.data.total)} objets` : "Aucun objet trouvé.";

  const setPage = (next: number) => navigate({ search: (prev) => ({ ...prev, page: next || undefined }) });

  return (
    <>
      <PageHeader
        title="Prix HDV et coûts de craft"
        description="Clique sur un nom pour voir le prix et la recette."
        aside={<span role="status">{status}</span>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-auto min-w-64 flex-1">
          <FieldLabel htmlFor="marketSearch">Objet</FieldLabel>
          <Input id="marketSearch" type="search" placeholder="Bois de Frêne, Gelano…" value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="marketCategory">Catégorie</FieldLabel>
          <NativeSelect
            id="marketCategory"
            value={cat}
            onChange={(event) =>
              navigate({ search: (prev) => ({ ...prev, cat: event.currentTarget.value as MarketCategory, type: undefined, page: undefined }) })
            }
          >
            {CATEGORIES.map((category) => (
              <NativeSelectOption key={category.value} value={category.value}>
                {category.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="marketType">Type d’objet</FieldLabel>
          <NativeSelect
            id="marketType"
            value={type ? String(type) : ""}
            disabled={!categoryTypes.length}
            onChange={(event) => navigate({ search: (prev) => ({ ...prev, type: Number(event.currentTarget.value) || undefined, page: undefined }) })}
          >
            <NativeSelectOption value="">Tous les types</NativeSelectOption>
            {[...categoryTypes]
              .map((entry) => ({ id: entry.id, name: localizedName(entry.name) || `Type ${entry.id}` }))
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((entry) => (
                <NativeSelectOption key={entry.id} value={String(entry.id)}>
                  {entry.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        {failed ? (
          <Button
            variant="outline"
            onClick={() => {
              if (types.isError) types.refetch();
              results.refetch();
            }}
          >
            Réessayer
          </Button>
        ) : null}
      </div>

      {selected ? <MarketDetail key={selected.id} item={selected} typeName={typeNames.get(selected.typeId ?? -1)} onClose={() => setSelected(null)} /> : null}

      <Card className="py-0">
        <Table aria-label="Catalogue des objets">
          <TableHeader>
            <TableRow>
              <TableHead>Objet</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Prix HDV (k/u)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(results.data?.data ?? []).map((item) => (
              <MarketRow key={item.id} item={item} typeName={typeNames.get(item.typeId ?? -1) || localizedName(item.type?.name) || "–"} onOpen={() => setSelected(item)} />
            ))}
            {results.data && !results.data.data.length ? <EmptyRow colSpan={4}>Aucun objet trouvé.</EmptyRow> : null}
          </TableBody>
        </Table>
      </Card>
      {pageCount > 1 ? (
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} / {pageCount}
          </span>
          <Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
            Suivant
          </Button>
        </div>
      ) : null}
    </>
  );
}

function MarketRow({ item, typeName, onOpen }: { item: DofusItem; typeName: string; onOpen: () => void }) {
  const name = itemName(item);
  const price = usePrice(item.id);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-center gap-2 text-left font-medium hover:underline" onClick={onOpen}>
            <ItemIcon item={item} />
            {name}
          </button>
          <Button variant="ghost" size="icon-xs" aria-label={`Copier ${name}`} title="Copier le nom" onClick={() => copyText(name)}>
            <CopyIcon />
          </Button>
        </div>
      </TableCell>
      <TableCell>{typeName}</TableCell>
      <TableCell>{item.level ?? "–"}</TableCell>
      <TableCell className="tabular-nums">{formatMarketPrice(price)}</TableCell>
    </TableRow>
  );
}

function MarketDetail({ item, typeName, onClose }: { item: DofusItem; typeName?: string; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const ocrReady = useOcrStore((state) => Boolean(state.result) && !state.loading);
  const readPrice = usePriceReader();
  const recipe = useQuery({
    queryKey: ["recipe", item.id],
    queryFn: ({ signal }) => fetchRecipe(item.id, signal),
    enabled: Boolean(item.hasRecipe),
  });

  useEffect(() => heading.current?.focus(), []);

  const cost = recipe.data ? calculateRecipeCost(recipe.data, readPrice) : null;
  let recipeStatus = "Aucune recette.";
  if (item.hasRecipe) {
    if (recipe.isPending) recipeStatus = "Chargement de la recette…";
    else if (recipe.isError) recipeStatus = "Recette indisponible. Rouvre l’objet pour réessayer.";
    else if (cost?.missing)
      recipeStatus = `Coût incomplet · ${cost.missing} prix ${plural(cost.missing, "manquant")} · Sous-total connu ${formatMarketPrice(cost.total)} k`;
    else if (cost) recipeStatus = `Coût de craft · ${formatMarketPrice(cost.total)} k`;
  }

  return (
    <Card aria-labelledby="marketItemName">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 id="marketItemName" ref={heading} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none">
              <ItemIcon item={item} />
              <CopyName name={itemName(item)} />
            </h3>
            <p className="text-sm text-muted-foreground">
              {[localizedName(item.type?.name) || typeName, item.level != null ? `Niv. ${item.level}` : "", `n°${item.id}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button variant="outline" onClick={onClose}>
            <XIcon data-icon="inline-start" />
            Fermer
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="marketItemPrice">Prix HDV (k/u)</FieldLabel>
            <PriceInput id="marketItemPrice" itemId={item.id} className="w-40" />
          </Field>
          {ocrReady ? (
            <Button variant="outline" onClick={() => associateOcrItem(item)}>
              <ScanTextIcon data-icon="inline-start" />
              Associer à la capture
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          {recipeStatus}
        </p>
        {recipe.data && cost ? (
          <Table aria-label="Ingrédients de la recette">
            <TableHeader>
              <TableRow>
                <TableHead>Ingrédient</TableHead>
                <TableHead>Quantité</TableHead>
                <TableHead>Prix HDV (k/u)</TableHead>
                <TableHead>Sous-total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipe.data.map((ingredient, index) => {
                const name = itemName(ingredient.item);
                const subtotal = cost.subtotals[index] ?? null;
                return (
                  <TableRow key={ingredient.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ItemIcon item={ingredient.item} />
                        <CopyName name={name} />
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatQuantity(ingredient.quantity)}</TableCell>
                    <TableCell>
                      <PriceInput itemId={ingredient.id} aria-label={`Prix unitaire · ${name}`} />
                    </TableCell>
                    <TableCell className="tabular-nums">{subtotal === null ? "Prix manquant" : `${formatMarketPrice(subtotal)} k`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
