import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { itemName, searchEquipment } from "@/lib/dofusdb";
import { fmItem, fmRune, runeOdds, runesFor, type FmOdds, type TrackedLine } from "@/lib/smithmagic";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";
import { startForgeWatch, useSmithmagicStore, type ForgeStatus } from "@/stores/smithmagic";

export const Route = createFileRoute("/overlay/forgemagie")({
  component: ForgeOverlay,
});

const DEFAULT_LEVEL = 200;
const TIERS = ["Rune", "Pa", "Ra"] as const;

const STATUS_TEXT: Record<ForgeStatus, string> = {
  connecting: "Connexion…",
  watching: "Lecture en cours",
  "no-window": "Dofus n’est pas au premier plan",
  "no-forge": "Atelier de forgemagie introuvable",
  offline: "Serveur injoignable",
  error: "Erreur de lecture",
};

function overlayWindow() {
  return (window as Window & { pywebview?: { api: { close: () => Promise<void> } } }).pywebview;
}

function useItemLevel(name: string | undefined) {
  return useQuery({
    queryKey: ["fm-item-level", name],
    enabled: !!name,
    queryFn: async ({ signal }) => {
      const items = await searchEquipment(name!, signal);
      const exact = items.find((item) => normalizeText(itemName(item)) === normalizeText(name!));
      return exact?.level ?? null;
    },
  });
}

function ForgeOverlay() {
  const { status, detail, item } = useSmithmagicStore();
  const level = useItemLevel(item?.name);
  const itemLevel = level.data ?? DEFAULT_LEVEL;

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.title = "Overlay forgemagie";
    return startForgeWatch();
  }, []);

  const [closable, setClosable] = useState(() => !!overlayWindow());
  useEffect(() => {
    const ready = () => setClosable(true);
    window.addEventListener("pywebviewready", ready);
    return () => window.removeEventListener("pywebviewready", ready);
  }, []);

  const computed = item ? fmItem(item, itemLevel) : null;

  return (
    <div className="min-h-screen bg-background/95 p-2 text-xs text-foreground select-none">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item?.name || "Aucun objet"}</p>
          <p className="text-muted-foreground">
            {level.data ? `niv. ${level.data}` : item ? `niv. ? (calcul en ${DEFAULT_LEVEL})` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular-nums">
            Reliquat <span className="font-semibold">{item?.reliquat ?? "—"}</span>
          </p>
          <p className={cn("text-muted-foreground", status !== "watching" && "text-amber-400")} title={detail}>
            {STATUS_TEXT[status]}
          </p>
        </div>
        {closable ? (
          <button type="button" aria-label="Fermer l’overlay" className="self-start px-1 text-muted-foreground hover:text-foreground" onClick={() => void overlayWindow()?.api.close()}>
            ✕
          </button>
        ) : null}
      </header>

      {item && computed ? (
        <table className="w-full border-collapse tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-0.5 text-left font-normal">Effet</th>
              <th className="py-0.5 text-right font-normal">Jet</th>
              {TIERS.map((tier) => (
                <th key={tier} className="w-12 py-0.5 text-right font-normal">
                  {tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <LineRow key={line.effect.characteristic} line={line} odds={runesFor(line.effect.characteristic).map((rune) => runeOdds(computed, fmRune(rune)))} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">Ouvrez un atelier de forgemagie et posez un objet.</p>
      )}

      {item?.unknown.length ? <p className="mt-2 text-muted-foreground">Non reconnu : {item.unknown.join(" · ")}</p> : null}
    </div>
  );
}

function LineRow({ line, odds }: { line: TrackedLine; odds: FmOdds[] }) {
  const partial = (line.min === null) !== (line.max === null);
  const range = line.min === null && line.max === null ? "exo" : `${line.min ?? "?"}–${line.max ?? "?"}`;
  return (
    <tr className={cn("border-t border-border/50", !line.visible && "opacity-50")} title={line.visible ? undefined : "Ligne hors écran : dernière valeur lue"}>
      <td className="max-w-28 truncate py-0.5">
        {line.effect.percent ? "% " : ""}
        {line.effect.label}
      </td>
      <td className="py-0.5 text-right whitespace-nowrap">
        <span className="font-semibold">{line.value}</span> <span className="text-muted-foreground">{range}</span>
      </td>
      {TIERS.map((tier, index) =>
        partial && odds[index] ? (
          <td key={tier} className="py-0.5 text-right text-muted-foreground" title="Jet min ou max pas encore lu">
            ?
          </td>
        ) : (
          <OddsCell key={tier} odds={odds[index]} />
        ),
      )}
    </tr>
  );
}

function OddsCell({ odds }: { odds: FmOdds | undefined }) {
  if (!odds) return <td />;
  if (odds.blocked) {
    const reason = odds.blocked === "line-cap" ? `Ligne limitée à ${odds.limit}` : `Over et exo dépasseraient 101 de poids (déjà ${odds.load})`;
    return (
      <td className="py-0.5 text-right text-muted-foreground" title={reason}>
        ✕
      </td>
    );
  }
  const tone = odds.sc >= 40 ? "text-emerald-400" : odds.sc >= 15 ? "text-amber-300" : "text-rose-400";
  const title = `SC ${odds.sc.toFixed(1)} % · SN ${odds.sn.toFixed(1)} % · EC ${odds.ec.toFixed(1)} %${odds.estimated ? " (estimation)" : ""}`;
  return (
    <td className="py-0.5 text-right leading-tight" title={title}>
      <span className={cn("font-semibold", tone)}>{Math.round(odds.sc)}%</span>
      {odds.regime === "over" || odds.regime === "exo" ? <sup className="ml-0.5 text-[0.65rem] text-sky-300">{odds.regime}</sup> : null}
      <div className="text-[0.65rem] text-muted-foreground">EC {Math.round(odds.ec)}</div>
    </td>
  );
}
