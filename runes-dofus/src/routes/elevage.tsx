import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DecisionBadge, ItemIcon, Meta, PageHeader } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BREEDING_FUELS } from "@/data/breeding";
import { calculateBreedingCosts } from "@/lib/breeding";
import { formatMoney, formatQuantity } from "@/lib/format";
import { usePriceReader } from "@/stores/prices";

const CATEGORIES = Object.keys(BREEDING_FUELS);

export const Route = createFileRoute("/elevage")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: CATEGORIES.includes(String(search.category)) && String(search.category) !== CATEGORIES[0] ? String(search.category) : undefined,
  }),
  component: BreedingPage,
});

function BreedingPage() {
  const { category = CATEGORIES[0]! } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const readPrice = usePriceReader();
  const fuels = BREEDING_FUELS[category]!;
  const rows = calculateBreedingCosts(fuels, readPrice);

  return (
    <>
      <PageHeader
        title="Comparer les carburants d’élevage"
        description="Saisis les prix unitaires de l’HDV pour comparer le coût de 10 000 points de recharge. Les badges se basent sur ce coût. Le coût du palier compte les unités entières nécessaires pour passer du plafond précédent au plafond du carburant."
        aside={
          <a className="underline underline-offset-4" href="https://dofusdb.fr/fr/database/items?types=326&sortBy=-id" target="_blank" rel="noreferrer">
            DofusDB
          </a>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RadioGroup
          aria-label="Catégorie"
          value={category}
          onValueChange={(value) => navigate({ search: { category: value === CATEGORIES[0] ? undefined : value }, replace: true })}
          className="flex flex-wrap gap-4"
        >
          {CATEGORIES.map((name) => (
            <Label key={name} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={name} />
              {name}
            </Label>
          ))}
        </RadioGroup>
        <p className="text-sm text-muted-foreground" role="status">
          {rows.filter((row) => row.costs).length} / {fuels.length} prix renseignés
        </p>
      </div>

      <Card className="py-0">
        <Table aria-label="Comparaison des carburants d’élevage">
          <TableHeader>
            <TableRow>
              <TableHead>Carburant</TableHead>
              <TableHead className="hidden text-right md:table-cell">Recharge (pts)</TableHead>
              <TableHead className="hidden text-right md:table-cell">Plafond de jauge (pts)</TableHead>
              <TableHead>Prix HDV ×1 (kamas)</TableHead>
              <TableHead className="text-right">Kamas / 10 000 pts</TableHead>
              <TableHead className="text-right">Coût du palier (kamas)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ fuel, costs, isBestOfTier }) => {
              const recharge = formatQuantity(fuel.recharge);
              const cap = fuel.cap === null ? null : formatQuantity(fuel.cap);
              return (
                <TableRow key={fuel.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ItemIcon item={fuel} />
                      <span>
                        <span className="block font-medium whitespace-normal">{fuel.name}</span>
                        <Meta className="md:hidden">
                          +{recharge} pts · {cap === null ? "Jusqu’au max. de la jauge" : `Jusqu’à ${cap}`}
                        </Meta>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{recharge}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{cap ?? "Max. de la jauge"}</TableCell>
                  <TableCell>
                    <PriceInput itemId={fuel.id} aria-label={`Prix HDV de ${fuel.name} (kamas par unité)`} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="flex flex-col items-end gap-1">
                      {costs ? formatMoney(costs.cost) : "–"}
                      {isBestOfTier ? (
                        <DecisionBadge decision={fuel.cap === null ? "craft" : "neutral"}>
                          {fuel.cap === null ? "Meilleur jusqu’au max." : "Meilleur du palier"}
                        </DecisionBadge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{costs ? formatMoney(costs.fillCost) : "–"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
