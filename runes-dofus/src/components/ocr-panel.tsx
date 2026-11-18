import { CheckIcon, ChevronDownIcon, ImageIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Meta } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { isBreedingFuel } from "@/lib/breeding";
import { itemName } from "@/lib/dofusdb";
import { formatMarketPrice, formatMoney, formatQuantity } from "@/lib/format";
import { getOcrApplyPrice, getOcrBestLot, getOcrPracticalAverage, getOcrUnitPrice, getOcrWeightedAverage, type OcrResult } from "@/lib/pricing";
import { parsePrice } from "@/lib/prices";
import { runeById, runesByName } from "@/lib/runes";
import { cn } from "@/lib/utils";
import {
  applySelectedOcrPrice,
  changeOcrTarget,
  dismissOcrCapture,
  getOcrItemPrice,
  getOcrTarget,
  isImageFile,
  processOcrImage,
  setOcrOpen,
  setOcrPriceInput,
  useOcrStore,
} from "@/stores/ocr";

function formatUnitPrice(value: unknown) {
  const unitPrice = Number(value);
  return Number.isFinite(unitPrice) ? formatMoney(unitPrice) : "-";
}

function priceMeta(result: OcrResult) {
  const practicalAverage = getOcrPracticalAverage(result);
  if (practicalAverage) return `Moyenne pratique: ${formatUnitPrice(practicalAverage)} k/u; x1 bas, gros lots trop chers ecartes.`;
  const weightedAverage = getOcrWeightedAverage(result);
  if (weightedAverage) return `Moyenne ponderee: ${formatUnitPrice(weightedAverage)} k/u.`;
  const bestLot = getOcrBestLot(result);
  if (bestLot) return `Fallback lot x${formatQuantity(bestLot.quantity)} a ${formatUnitPrice(bestLot.unit_price)} k/u.`;
  return "Aucun lot lisible.";
}

export function firstImageFile(files: FileList | null | undefined) {
  return Array.from(files ?? []).find(isImageFile) ?? null;
}

export function OcrPanel() {
  const state = useOcrStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { result, targetId, loading } = state;

  const target = getOcrTarget(state);
  const isRune = runeById.has(targetId);
  const isFuel = isBreedingFuel(targetId);
  const detectedPrice = isRune ? getOcrApplyPrice(result) : getOcrItemPrice(result, targetId);
  const price = isRune ? detectedPrice : parsePrice(state.priceInput);
  const catalogueItems = state.items.filter((item) => !runeById.has(String(item.id)));

  let detectedPriceMeta = "Moyenne pratique visible.";
  if (result && detectedPrice) {
    if (isFuel) detectedPriceMeta = "Prix du lot ×1.";
    else if (!isRune && !getOcrUnitPrice(result)) detectedPriceMeta = "Prix moyen affiché par le jeu.";
    else detectedPriceMeta = priceMeta(result);
  } else if (result) {
    if (isFuel) detectedPriceMeta = "Lot ×1 introuvable. Saisis le prix d’un exemplaire.";
    else detectedPriceMeta = isRune ? "Aucun lot lisible." : "Saisis le prix visible sur la capture.";
  }

  let detectedMeta = "Aucune capture traitée.";
  if (result?.warnings?.length) detectedMeta = "Vérifie les lots et le prix détectés.";
  else if (result && target) detectedMeta = `Objet cible · ${itemName(target)}.`;
  else if (result) detectedMeta = "Ouvre l’objet dans Prix & crafts, puis choisis Associer à la capture.";

  const lots = Array.isArray(result?.lots) ? result.lots : [];

  return (
    <Collapsible open={state.open} onOpenChange={setOcrOpen} asChild>
      <Card className="gap-0 py-0">
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
          <span className="flex items-center gap-2 font-medium">
            <ImageIcon className="size-4" />
            Importer une capture HDV
          </span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {state.status}
            <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 border-t px-4 py-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div
              className={cn(
                "flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors",
                dragging && "border-primary bg-muted",
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = firstImageFile(event.dataTransfer?.files);
                if (file) processOcrImage(file);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = firstImageFile(event.currentTarget.files);
                  if (file) processOcrImage(file);
                  event.currentTarget.value = "";
                }}
              />
              <Button onClick={() => fileInput.current?.click()}>
                <ImageIcon data-icon="inline-start" />
                Choisir une image
              </Button>
              <span>Ctrl+V ou glisser une image</span>
              {state.pending && !loading ? (
                <Button variant="outline" size="sm" onClick={dismissOcrCapture}>
                  <XIcon data-icon="inline-start" />
                  Ignorer la capture
                </Button>
              ) : null}
            </div>
            {state.previewUrl ? (
              <div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-2">
                <img src={state.previewUrl} alt="Capture HDV" className="max-h-64 object-contain" />
              </div>
            ) : null}
          </div>

          {result ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Objet détecté</span>
                  <strong>{result.item_name || "Nom non lu"}</strong>
                  <Meta className="text-sm">{detectedMeta}</Meta>
                </div>
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prix lu</span>
                  <strong>{detectedPrice ? `${formatMarketPrice(detectedPrice)} k/u` : "-"}</strong>
                  <Meta className="text-sm">{detectedPriceMeta}</Meta>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Field className="w-auto min-w-64">
                  <FieldLabel htmlFor="ocrTarget">Objet cible</FieldLabel>
                  <NativeSelect id="ocrTarget" className="w-full" value={targetId} onChange={(event) => changeOcrTarget(event.currentTarget.value)}>
                    <NativeSelectOption value="">Choisir un objet…</NativeSelectOption>
                    {catalogueItems.length ? (
                      <NativeSelectOptGroup label="Catalogue">
                        {catalogueItems.map((item) => (
                          <NativeSelectOption key={item.id} value={String(item.id)}>
                            {itemName(item)} · n°{item.id}
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                    ) : null}
                    <NativeSelectOptGroup label="Runes">
                      {runesByName.map((rune) => (
                        <NativeSelectOption key={rune.id} value={String(rune.id)}>
                          {rune.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  </NativeSelect>
                </Field>
                {isRune ? null : (
                  <Field className="w-auto">
                    <FieldLabel htmlFor="ocrPrice">Prix à enregistrer (k/u)</FieldLabel>
                    <Input
                      id="ocrPrice"
                      className="w-40"
                      inputMode="numeric"
                      autoComplete="off"
                      value={state.priceInput}
                      onChange={(event) => setOcrPriceInput(event.currentTarget.value)}
                      onBlur={(event) => {
                        const parsed = parsePrice(event.currentTarget.value);
                        if (parsed !== null) setOcrPriceInput(String(parsed));
                      }}
                    />
                  </Field>
                )}
                <Button disabled={loading || !price || !target} onClick={applySelectedOcrPrice}>
                  <CheckIcon data-icon="inline-start" />
                  Appliquer le prix
                </Button>
              </div>

              {lots.length ? (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {lots.map((lot, index) => (
                    <span key={index}>
                      {index ? " · " : ""}
                      <strong className="text-foreground">x{formatQuantity(lot.quantity)}</strong>
                      {result.best_lot && Number(result.best_lot.quantity) === Number(lot.quantity) ? " moins cher" : ""}: {formatMoney(lot.total_price)} k (
                      {formatUnitPrice(lot.unit_price)} k/u)
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          ) : null}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
