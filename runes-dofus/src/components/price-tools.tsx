import { DownloadIcon, SlidersHorizontalIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mergeBrisageEntries, mergeShatterCoefficients, useBrisageStore } from "@/stores/brisage";
import { clearPrices, mergePrices, priceSnapshot } from "@/stores/prices";

function exportPrices() {
  const { entries, coefficients } = useBrisageStore.getState();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Atelier Dofus",
    ...priceSnapshot(),
    brisages: entries,
    brisageCoefficients: coefficients,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "prix-dofus.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importPrices(file: File) {
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || typeof payload !== "object") throw new Error("not an object");
    mergePrices(payload);
    mergeBrisageEntries(payload.brisages);
    mergeShatterCoefficients(payload.brisageCoefficients);
    toast.success("Prix importés.");
  } catch {
    toast.error("Import impossible: le fichier JSON n'est pas valide.");
  }
}

/** Backup, restore and reset of everything saved in this browser. */
export function PriceTools() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontalIcon data-icon="inline-start" />
            Gérer les prix
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-auto flex-col gap-1 p-1.5">
          <Button variant="ghost" className="justify-start" onClick={exportPrices}>
            <DownloadIcon data-icon="inline-start" />
            Exporter
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => fileInput.current?.click()}>
            <UploadIcon data-icon="inline-start" />
            Importer
          </Button>
          <Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={() => setConfirmReset(true)}>
            <Trash2Icon data-icon="inline-start" />
            Effacer
          </Button>
        </PopoverContent>
      </Popover>
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) importPrices(file);
          event.currentTarget.value = "";
        }}
      />
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Effacer tous les prix saisis ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les prix des runes, des objets et des Eklames enregistrés dans ce navigateur seront supprimés. Le suivi des brisages est conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearPrices();
                toast.success("Prix effacés.");
              }}
            >
              Effacer les prix
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
