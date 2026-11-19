import { ChevronRightIcon, ImageUpIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MountCode } from "@/components/elevage/mount-code";
import { firstImageFile } from "@/components/ocr-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { colourLabel, type MountFamily } from "@/lib/mounts/family";
import type { ObjectiveMode } from "@/lib/mounts/horizon";
import { parseMountName } from "@/lib/mounts/names";
import { birthOutcomes, likelyChild } from "@/lib/mounts/offspring";
import type { Pairing, StablePlan } from "@/lib/mounts/planner";
import { cn } from "@/lib/utils";
import { setImagePasteHandler } from "@/stores/ocr";
import {
  clearStable,
  computeStablePlan,
  readStableDraft,
  readStableImage,
  setAvoidObtained,
  setObtained,
  setStableDraft,
  setStableMode,
  togglePairingDone,
  useStableStore,
} from "@/stores/stable";

const formatChance = (probability: number) => `${Math.round(probability * 100)} %`;

interface PlanRow {
  pairing: Pairing;
  index: number;
  targetId: string | null;
}

/** Les accouplements par génération du petit visé, la plus haute d'abord : c'est là qu'une réussite rapporte le plus. */
function groupPairings(family: MountFamily, pairings: Pairing[]) {
  const byGeneration = new Map<number, PlanRow[]>();
  const finalRows: PlanRow[] = [];
  pairings.forEach((pairing, index) => {
    let targetId = pairing.target ?? null;
    if (!targetId) {
      const male = parseMountName(pairing.pair[0], family);
      const female = parseMountName(pairing.pair[1], family);
      targetId = male && female ? likelyChild(family, male, female) : null;
    }
    const row = { pairing, index, targetId };
    if (pairing.final) {
      finalRows.push(row);
      return;
    }
    const generation = (targetId && family.byId.get(targetId)?.generation) || 0;
    if (!byGeneration.has(generation)) byGeneration.set(generation, []);
    byGeneration.get(generation)!.push(row);
  });
  const groups = [...byGeneration.entries()]
    .sort(([a], [b]) => b - a)
    .map(([generation, rows]) => {
      const counts = new Map<string | null, number>();
      rows.forEach((row) => counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1));
      const targets = [...counts.entries()]
        .map(([id, count]) => ({ id, count, name: id ? colourLabel(family, id) : "?" }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
      const rank = new Map(targets.map((target, position) => [target.id, position]));
      rows.sort((a, b) => rank.get(a.targetId)! - rank.get(b.targetId)! || a.index - b.index);
      return { generation, rows, targets };
    });
  return { groups, finalRows };
}

function CaptureDrop({ family }: { family: MountFamily }) {
  const { reading, status, error, lastCapture } = useStableStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const readFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) if (file.type.startsWith("image/")) await readStableImage(family.id, file);
  };

  // Sur cet onglet, une capture collée (Ctrl+V) va à l'étable, pas à l'OCR des prix.
  useEffect(() => setImagePasteHandler((file) => readStableImage(family.id, file)), [family.id]);

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (firstImageFile(event.dataTransfer.files)) readFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors",
          dragging && "border-primary bg-muted",
        )}
      >
        {reading ? <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> : <ImageUpIcon className="size-5" aria-hidden />}
        <span className="flex-1">
          Colle (Ctrl+V) ou dépose des captures de l’étable, filtre <strong className="font-medium text-foreground">Fécondes</strong>.
        </span>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={reading}>
          Choisir des captures
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            readFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p role="status" className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>
        {error || status}
      </p>
      {lastCapture?.corrected.length ? (
        <p className="text-sm text-muted-foreground">
          Corrigés, à vérifier :{" "}
          {lastCapture.corrected.map((entry) => (
            <span key={entry.from + entry.to} className="mr-2 inline-block font-mono">
              {entry.from} → {entry.to}
            </span>
          ))}
        </p>
      ) : null}
      {lastCapture?.unreadable.length ? (
        <p className="text-sm text-warning">
          Illisibles, à ajouter à la main : <span className="font-mono">{lastCapture.unreadable.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}

function SuccessColours({ family, obtained }: { family: MountFamily; obtained: string[] }) {
  const owned = new Set(obtained);
  const byGeneration = useMemo(() => {
    const groups = new Map<number, string[]>();
    for (const colour of family.colours)
      if (colour.generation >= 2) {
        if (!groups.has(colour.generation)) groups.set(colour.generation, []);
        groups.get(colour.generation)!.push(colour.id);
      }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [family]);
  const missing = byGeneration.flatMap(([, ids]) => ids).filter((id) => !owned.has(id)).length;

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 p-3 text-left text-sm font-medium">
        <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        Naissances déjà obtenues
        <span className="font-normal text-muted-foreground">· {missing} couleur{missing > 1 ? "s" : ""} à faire naître</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t p-3">
        {byGeneration.map(([generation, ids]) => {
          const allOwned = ids.every((id) => owned.has(id));
          return (
            <fieldset key={generation} className="flex flex-col gap-2">
              <legend className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={allOwned ? true : ids.some((id) => owned.has(id)) ? "indeterminate" : false}
                  onCheckedChange={() => setObtained(family.id, ids, !allOwned)}
                  aria-label={`Toute la génération ${generation} obtenue`}
                />
                Génération {generation}
              </legend>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {ids.map((id) => (
                  <Label key={id} className="flex items-center gap-2 font-normal">
                    <Checkbox checked={owned.has(id)} onCheckedChange={(checked) => setObtained(family.id, [id], checked === true)} />
                    {colourLabel(family, id)}
                  </Label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StableInput({ family }: { family: MountFamily }) {
  const { families, computing } = useStableStore();
  const state = families[family.id];
  const reading = useMemo(() => readStableDraft(state.draft, family.id), [state.draft, family.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ton étable</CardTitle>
        <CardDescription>Les montures fécondes, sous leur nom de 13 lettres (onglet Couples pour les renommer).</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => clearStable(family.id)} disabled={!state.draft && !state.plan}>
            Vider
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CaptureDrop family={family} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="stable-names">Noms des montures</Label>
          <Textarea
            id="stable-names"
            value={state.draft}
            onChange={(event) => setStableDraft(family.id, event.target.value)}
            placeholder={"FPOORPOPOOROR\nMPOPOSAUVSAUV\n…"}
            rows={8}
            spellCheck={false}
            className="font-mono uppercase"
          />
          <p className="text-sm text-muted-foreground">
            {reading.codes.length} monture{reading.codes.length > 1 ? "s" : ""} lue{reading.codes.length > 1 ? "s" : ""}
            {reading.completed.length ? ` · ${reading.completed.length} nom${reading.completed.length > 1 ? "s" : ""} coupé${reading.completed.length > 1 ? "s" : ""} complété${reading.completed.length > 1 ? "s" : ""} (2e parent = couleur de la monture)` : ""}
          </p>
          {reading.refused.length ? (
            <p className="text-sm text-warning">
              Non pris en compte, à vérifier en jeu : <span className="font-mono">{reading.refused.join(", ")}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <RadioGroup
            aria-label="Objectif"
            value={state.mode}
            onValueChange={(value) => setStableMode(family.id, value as ObjectiveMode)}
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="genetons" />
              Génétons : avancer le plus vite dans l’arbre
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="success" />
              Succès : faire naître les couleurs qui manquent
            </Label>
          </RadioGroup>
          {state.mode === "success" ? (
            <>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={state.avoidObtained} onCheckedChange={(checked) => setAvoidObtained(family.id, checked === true)} />
                N’accoupler que vers les couleurs qui manquent
              </Label>
              <SuccessColours family={family} obtained={state.obtained} />
            </>
          ) : null}
        </div>

        <div>
          <Button onClick={() => computeStablePlan(family.id)} disabled={computing || reading.codes.length === 0}>
            {computing ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
            {computing ? "Calcul…" : "Calculer les reproductions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PairingRow({ family, row, done }: { family: MountFamily; row: PlanRow; done: boolean }) {
  const [open, setOpen] = useState(false);
  const { pairing, index, targetId } = row;
  const male = parseMountName(pairing.pair[0], family);
  const female = parseMountName(pairing.pair[1], family);
  const outcomes = open && male && female ? birthOutcomes(family, male, female) : [];
  const offTarget = pairing.intended && targetId && pairing.intended !== targetId;

  return (
    <>
      <TableRow className={cn(done && "text-muted-foreground line-through decoration-muted-foreground/60")}>
        <TableCell className="w-8">
          <Checkbox checked={done} onCheckedChange={() => togglePairingDone(family.id, index)} aria-label={`Accouplement ${index + 1} fait`} />
        </TableCell>
        <TableCell>
          <MountCode family={family} code={pairing.pair[0]} />
        </TableCell>
        <TableCell>
          <MountCode family={family} code={pairing.pair[1]} />
        </TableCell>
        <TableCell className="whitespace-normal">
          <span className="flex flex-wrap items-center gap-1.5">
            {targetId ? colourLabel(family, targetId) : "Petit visé inconnu"}
            {pairing.potion ? (
              <Badge
                className="bg-info-muted text-info"
                title={`La couleur visée manque de ${pairing.potion === "F" ? "femelles" : "mâles"} dans l’étable`}
              >
                Potion {pairing.potion === "F" ? "femelle" : "mâle"}
              </Badge>
            ) : null}
          </span>
          {offTarget ? (
            <span className="block text-xs text-warning">
              Le plan visait {colourLabel(family, pairing.intended!)}, mais avec ces deux montures le jeu visera {colourLabel(family, targetId)} (à cause de leurs parents).
            </span>
          ) : null}
        </TableCell>
        <TableCell className="w-10 text-right">
          <Button variant="ghost" size="icon-xs" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Naissances possibles et noms du petit">
            <ChevronRightIcon className={cn("transition-transform", open && "rotate-90")} />
          </Button>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={4} className="whitespace-normal">
            <ul className="flex flex-col gap-1 py-1 text-sm">
              {outcomes.map((outcome) => (
                <li key={outcome.colourId} className="flex flex-wrap items-center gap-x-2">
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{formatChance(outcome.probability)}</span>
                  <span className="min-w-40">
                    {colourLabel(family, outcome.colourId)} <span className="text-xs text-muted-foreground">({outcome.labels.join(", ")})</span>
                  </span>
                  <MountCode family={family} code={`M${outcome.nameSuffix}`} />
                  <MountCode family={family} code={`F${outcome.nameSuffix}`} />
                </li>
              ))}
            </ul>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function PairingTable({ family, rows, done, label }: { family: MountFamily; rows: PlanRow[]; done: Set<number>; label: string }) {
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <span className="sr-only">Fait</span>
          </TableHead>
          <TableHead>Mâle</TableHead>
          <TableHead>Femelle</TableHead>
          <TableHead>Petit visé</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <PairingRow key={row.index} family={family} row={row} done={done.has(row.index)} />
        ))}
      </TableBody>
    </Table>
  );
}

function PlanResults({ family, plan, doneList }: { family: MountFamily; plan: StablePlan; doneList: number[] }) {
  const done = new Set(doneList);
  const { groups, finalRows } = useMemo(() => groupPairings(family, plan.pairings), [family, plan]);
  const pending = plan.pairings.length - plan.pairings.filter((_, index) => done.has(index)).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Les reproductions à faire</CardTitle>
          <CardDescription>
            {plan.read} monture{plan.read > 1 ? "s" : ""} lue{plan.read > 1 ? "s" : ""}
            {plan.rejected.length ? `, ${plan.rejected.length} ignorée${plan.rejected.length > 1 ? "s" : ""}` : ""} · {plan.pairings.length} accouplement
            {plan.pairings.length > 1 ? "s" : ""}, {pending} à faire. Après les naissances, recapture l’étable et recalcule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {plan.pairings.length === 0 ? <p className="text-sm text-muted-foreground">Aucune reproduction utile avec cette étable pour l’instant.</p> : null}
          {groups.map((group) => (
            <section key={group.generation} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {group.generation ? `Petits en génération ${group.generation}` : "Petit visé inconnu"}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {group.targets.map((target) => `${target.count} ${target.name}`).join(", ")}
                </span>
              </h3>
              <PairingTable family={family} rows={group.rows} done={done} label={`Accouplements vers la génération ${group.generation}`} />
            </section>
          ))}
          {finalRows.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Dernier accouplement, puis brisage des deux parents
              </h3>
              <PairingTable family={family} rows={finalRows} done={done} label="Derniers accouplements" />
            </section>
          ) : null}
          {plan.unmatched > 0 ? (
            <p className="text-sm text-muted-foreground">
              {plan.unmatched} tentative{plan.unmatched > 1 ? "s" : ""} du plan sans monture libre pour la faire : recalcule après les naissances.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>G1 à ajouter pour rééquilibrer l’étable</CardTitle>
          {plan.rebalanceNote ? <CardDescription>{plan.rebalanceNote}</CardDescription> : null}
        </CardHeader>
        {plan.rebalance.length ? (
          <CardContent>
            <Table aria-label="G1 à ajouter">
              <TableHeader>
                <TableRow>
                  <TableHead>Couleur</TableHead>
                  <TableHead className="text-right">Femelles</TableHead>
                  <TableHead className="text-right">Mâles</TableHead>
                  <TableHead>Pourquoi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.rebalance.map((line) => (
                  <TableRow key={line.nodeId}>
                    <TableCell className="font-medium">{colourLabel(family, line.nodeId)}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.females || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.males || "–"}</TableCell>
                    <TableCell className="text-sm whitespace-normal text-muted-foreground">{line.why}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : null}
      </Card>

      {plan.impures.length ? (
        <Card>
          <CardHeader>
            <CardTitle>G1 impures au repos ({plan.impures.length})</CardTitle>
            <CardDescription>
              Ces G1 ont des parents d’autres couleurs : leurs petits visent moins souvent la bonne couleur. Le plan ne s’en sert pas ce tour-ci ; tu
              peux les briser ou les vendre, et les remplacer par des G1 capturées.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-4 gap-y-1">
            {plan.impures.map((impure, index) => (
              <MountCode key={`${impure.code}-${index}`} family={family} code={impure.code} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export function StablePlanner({ family }: { family: MountFamily }) {
  const state = useStableStore((store) => store.families[family.id]);
  return (
    <>
      <StableInput family={family} />
      {state.plan && state.plan.family === family.id ? <PlanResults family={family} plan={state.plan} doneList={state.done} /> : null}
    </>
  );
}
