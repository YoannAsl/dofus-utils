import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DecisionBadge, Gain, ItemIcon, Meta, Metric, MetricGrid, PageHeader } from "@/components/common";
import { PriceInput } from "@/components/price-input";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_EKLAME_ID, EKLAMES, eklameImage } from "@/lib/eklames";
import { formatMoney, formatQuantity } from "@/lib/format";
import { calculateEklameRows, type Eklame } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { usePriceReader, usePriceStore } from "@/stores/prices";

export const Route = createFileRoute("/eklames")({
  validateSearch: (search: Record<string, unknown>): { target?: number } => ({
    target: EKLAMES.some((eklame) => eklame.id === String(search.target)) && String(search.target) !== DEFAULT_EKLAME_ID ? Number(search.target) : undefined,
  }),
  component: EklamesPage,
});

type EklameRow = ReturnType<typeof calculateEklameRows>[number];

function detail(row: EklameRow, target: Eklame, directCost: number | null, isBest: boolean) {
  if (!row.canOpenToTarget) return `${row.eklame.name} est plus bas que ${target.name}.`;
  if (!row.directPrice) return `Renseigne le prix HDV de ${row.eklame.name}.`;
  if (row.eklame.id === target.id) return isBest ? "Acheter directement est le meilleur choix connu." : "Prix direct de reference.";
  const quantity = row.targetQuantity!;
  const opens = Math.log2(quantity);
  const openText = opens === 1 ? "1 double-clic" : `${opens} double-clics`;
  if (isBest) return `Acheter puis ouvrir: ${openText} pour obtenir ${formatQuantity(quantity)} ${target.name}.`;
  if (directCost) return `Donne ${formatQuantity(quantity)} ${target.name}, mais revient plus cher que le meilleur choix connu.`;
  return `Donne ${formatQuantity(quantity)} ${target.name} apres ${openText}.`;
}

function EklamesPage() {
  const { target: targetParam } = Route.useSearch();
  const target = EKLAMES.find((eklame) => eklame.id === String(targetParam ?? DEFAULT_EKLAME_ID))!;
  const navigate = useNavigate({ from: Route.fullPath });
  const readPrice = usePriceReader();
  const savedAt = usePriceStore((state) => state.savedAt.eklamePrices);

  const rows = calculateEklameRows(EKLAMES, target, (eklame) => readPrice(eklame.id));
  const bestOption = rows.filter((row) => row.costPerTarget).sort((a, b) => a.costPerTarget! - b.costPerTarget!)[0] ?? null;
  const directCost = rows.find((row) => row.eklame.id === target.id)?.costPerTarget || null;
  const bestSaving = bestOption && directCost ? directCost - bestOption.costPerTarget! : null;

  let saving: { value: string; meta: string };
  if (bestOption && bestOption.eklame.id !== target.id && bestSaving! > 0) {
    saving = { value: `${formatMoney(bestSaving!)} k`, meta: `Economises par ${target.name} vs achat direct.` };
  } else if (directCost) {
    saving = { value: "Achat direct", meta: `Le prix direct est le meilleur connu pour ${target.name}.` };
  } else {
    saving = { value: "Direct inconnu", meta: `Renseigne ${target.name} pour comparer l'economie.` };
  }

  return (
    <>
      <PageHeader
        title="Comparer les Eklames"
        aside={
          savedAt ? (
            `Sauvegarde locale a ${savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
          ) : (
            <>
              Prix manuels, tiers issus de{" "}
              <a className="underline underline-offset-4" href="https://dofusdb.fr/fr/database/items?types=310&sortBy=-id" target="_blank" rel="noreferrer">
                DofusDB
              </a>
              .
            </>
          )
        }
      />
      <Field className="w-auto self-start">
        <FieldLabel htmlFor="eklameTarget">Palier recherché</FieldLabel>
        <NativeSelect
          id="eklameTarget"
          value={target.id}
          onChange={(event) => navigate({ search: { target: event.currentTarget.value === DEFAULT_EKLAME_ID ? undefined : Number(event.currentTarget.value) }, replace: true })}
        >
          {EKLAMES.map((eklame) => (
            <NativeSelectOption key={eklame.id} value={eklame.id}>
              {eklame.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <MetricGrid label="Synthèse Eklames">
        <Metric label="Prix renseignés" value={`${rows.filter((row) => row.directPrice).length} / ${EKLAMES.length}`} meta="Sauvegarde locale active." />
        <Metric
          label="Meilleur achat"
          value={bestOption ? bestOption.eklame.name : "Prix requis"}
          meta={bestOption ? `${formatMoney(bestOption.costPerTarget!)} k par ${target.name}.` : `Renseigne ${target.name} ou un tier superieur.`}
        />
        <Metric label="Économie à l’achat" value={saving.value} meta={saving.meta} />
      </MetricGrid>

      <Card className="py-0">
        <Table aria-label="Tableau comparateur Eklames">
          <TableHeader>
            <TableRow>
              <TableHead>Eklame</TableHead>
              <TableHead>Prix HDV</TableHead>
              <TableHead className="text-right">Quantité reçue</TableHead>
              <TableHead className="text-right">Coût par unité</TableHead>
              <TableHead>Décision</TableHead>
              <TableHead className="text-right">Économie</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isBest = bestOption?.eklame.id === row.eklame.id;
              return (
                <TableRow key={row.eklame.id} className={cn(isBest && "bg-success-muted/60 hover:bg-success-muted")}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ItemIcon src={eklameImage(row.eklame)} />
                      <span>
                        <span className="block font-medium">{row.eklame.name}</span>
                        <Meta>
                          Monstres niv. {row.eklame.levelRange} - x{formatQuantity(row.eklame.factor)} base
                        </Meta>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriceInput itemId={row.eklame.id} placeholder="0" aria-label={`Prix HDV ${row.eklame.name}`} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.targetQuantity ? formatQuantity(row.targetQuantity) : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.costPerTarget ? `${formatMoney(row.costPerTarget)} k` : "-"}</TableCell>
                  <TableCell>
                    <DecisionBadge decision={row.decision}>{row.action}</DecisionBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!row.costPerTarget || !directCost || row.costPerTarget === directCost ? "-" : <Gain value={directCost - row.costPerTarget} />}
                  </TableCell>
                  <TableCell className="max-w-72 text-sm whitespace-normal text-muted-foreground">{detail(row, target, directCost, isBest)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
