import { CopyIcon } from "lucide-react";
import { copyText, DecisionBadge, ItemIcon, Meta } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BREEDING_FUELS } from "@/data/breeding";
import { calculateBreedingCosts } from "@/lib/breeding";
import { formatMoney, formatQuantity } from "@/lib/format";
import { usePriceReader } from "@/stores/prices";

export const FUEL_CATEGORIES = Object.keys(BREEDING_FUELS);

export function FuelComparison({ category, onCategoryChange }: { category: string; onCategoryChange: (category: string) => void }) {
  const readPrice = usePriceReader();
  const fuels = BREEDING_FUELS[category]!;
  const rows = calculateBreedingCosts(fuels, readPrice);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RadioGroup aria-label="Catégorie" value={category} onValueChange={onCategoryChange} className="flex flex-wrap gap-4">
          {FUEL_CATEGORIES.map((name) => (
            <Label key={name} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={name} />
              {name}
            </Label>
          ))}
        </RadioGroup>
        <p className="text-sm text-muted-foreground" role="status">
          {rows.filter((row) => row.costs).length} / {fuels.length} prix renseignés ·{" "}
          <a className="underline underline-offset-4" href="https://dofusdb.fr/fr/database/items?types=326&sortBy=-id" target="_blank" rel="noreferrer">
            DofusDB
          </a>
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
                        <span className="flex items-center gap-1">
                          <span className="font-medium whitespace-normal">{fuel.name}</span>
                          <Button variant="ghost" size="icon-xs" aria-label={`Copier ${fuel.name}`} title="Copier le nom" onClick={() => copyText(fuel.name)}>
                            <CopyIcon />
                          </Button>
                        </span>
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
