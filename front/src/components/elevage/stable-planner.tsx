import { ChevronRightIcon, ImageUpIcon, LoaderCircleIcon, RadarIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MountCell, MountCode } from "@/components/elevage/mount-code";
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
import { formatChance } from "@/lib/format";
import { parseMountName } from "@/lib/mounts/names";
import { birthOutcomes } from "@/lib/mounts/offspring";
import type { StablePlan } from "@/lib/mounts/planner";
import type { QueuedName } from "@/lib/mounts/name-queue";
import { groupPairings, type PlanRow } from "@/lib/mounts/plan-order";
import { cn } from "@/lib/utils";
import { followCopiedName, setBirthWatch, setBirthWatchFamily, useBirthStore, type WatchStatus } from "@/stores/births";
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
          Colle (Ctrl+V) ou dépose des captures de l’étable, filtre <strong className="font-medium text-foreground">Fécondes</strong>, sans qu’une ligne apparaisse sur deux captures.
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

/** L'étable lue, par génération puis couleur, pour vérifier la lecture avant de calculer. */
function StableInventory({ family, codes }: { family: MountFamily; codes: string[] }) {
  const byGeneration = useMemo(() => {
    const counts = new Map<string, { M: number; F: number }>();
    for (const code of codes) {
      const mount = parseMountName(code, family);
      if (!mount) continue;
      const entry = counts.get(mount.colourId) ?? { M: 0, F: 0 };
      entry[mount.sex] += 1;
      counts.set(mount.colourId, entry);
    }
    const groups = new Map<number, { id: string; name: string; M: number; F: number }[]>();
    for (const [id, count] of counts) {
      const generation = family.byId.get(id)?.generation ?? 0;
      if (!groups.has(generation)) groups.set(generation, []);
      groups.get(generation)!.push({ id, name: colourLabel(family, id), ...count });
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([generation, colours]) => ({ generation, colours: colours.sort((a, b) => a.name.localeCompare(b.name, "fr")) }));
  }, [family, codes]);
  const colourCount = byGeneration.reduce((total, group) => total + group.colours.length, 0);

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        {codes.length} monture{codes.length > 1 ? "s" : ""} lue{codes.length > 1 ? "s" : ""}, {colourCount} couleur{colourCount > 1 ? "s" : ""}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 flex flex-col gap-3 rounded-lg border p-3">
        {byGeneration.map((group) => (
          <div key={group.generation} className="flex flex-col gap-1">
            <h4 className="text-xs font-medium text-muted-foreground">G{group.generation}</h4>
            <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {group.colours.map((colour) => (
                <li key={colour.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{colour.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span className={cn(!colour.M && "opacity-40")}>{colour.M} ♂</span>{" "}
                    <span className={cn(!colour.F && "opacity-40")}>{colour.F} ♀</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
            className="field-sizing-fixed h-48 resize-y font-mono uppercase"
          />
          {reading.codes.length ? <StableInventory family={family} codes={reading.codes} /> : null}
          {reading.completed.length ? (
            <p className="text-sm text-muted-foreground">
              {reading.completed.length} nom{reading.completed.length > 1 ? "s" : ""} coupé{reading.completed.length > 1 ? "s" : ""} complété
              {reading.completed.length > 1 ? "s" : ""} (2e parent = couleur de la monture)
            </p>
          ) : null}
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

/** Les deux noms possibles du petit, mâle et femelle, à copier dès la naissance. */
function BabyNames({ family, suffix, className, onCopy }: { family: MountFamily; suffix: string; className?: string; onCopy?: (code: string) => void }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5", className)}>
      {(["M", "F"] as const).map((sex) => (
        <span key={sex} className="flex items-center gap-1">
          <span className="text-muted-foreground" aria-hidden>
            {sex === "M" ? "♂" : "♀"}
          </span>
          <MountCode family={family} code={`${sex}${suffix}`} className="text-xs" onCopy={onCopy} />
        </span>
      ))}
    </span>
  );
}

/** `queued` : le parent de cette ligne qui est dans le presse-papiers. */
function PairingRow({ family, row, done, queued }: { family: MountFamily; row: PlanRow; done: boolean; queued: "male" | "female" | null }) {
  const [open, setOpen] = useState(false);
  const { pairing, index } = row;
  const follow = (role: "male" | "female") => (code: string) => followCopiedName(family.id, code, { pairingIndex: index, role });
  const targetId = pairing.target;
  const male = parseMountName(pairing.pair[0], family);
  const female = parseMountName(pairing.pair[1], family);
  const outcomes = useMemo(() => (male && female ? birthOutcomes(family, male, female) : []), [family, male?.code, female?.code]);
  const targetOutcome = outcomes.find((outcome) => outcome.colourId === targetId);
  const offTarget = pairing.intended && targetId && pairing.intended !== targetId;

  return (
    <>
      <TableRow
        className={cn(done && "text-muted-foreground line-through decoration-muted-foreground/60", queued && "bg-primary/5 hover:bg-primary/10")}
        aria-current={queued ? "step" : undefined}
      >
        <TableCell className="w-8">
          <Checkbox checked={done} onCheckedChange={() => togglePairingDone(family.id, index)} aria-label={`Accouplement ${index + 1} fait`} />
        </TableCell>
        <TableCell>
          <MountCell family={family} code={pairing.pair[0]} onCopy={follow("male")} active={queued === "male"} />
        </TableCell>
        <TableCell>
          <MountCell family={family} code={pairing.pair[1]} onCopy={follow("female")} active={queued === "female"} />
        </TableCell>
        <TableCell className="whitespace-normal font-medium">
          <span className="flex flex-wrap items-center gap-1.5">
            {targetId ? colourLabel(family, targetId) : "Petit visé inconnu"}
            {targetOutcome ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{formatChance(targetOutcome.probability)}</span> : null}
            {pairing.potion ? (
              <Badge
                className="bg-info-muted text-info"
                title={`La couleur visée manque de ${pairing.potion === "F" ? "femelles" : "mâles"} dans l’étable`}
              >
                Potion {pairing.potion === "F" ? "femelle" : "mâle"}
              </Badge>
            ) : null}
          </span>
          {targetOutcome ? <BabyNames family={family} suffix={targetOutcome.nameSuffix} className="mt-0.5 font-normal" /> : null}
          {offTarget ? (
            <span className="block text-xs font-normal text-warning">
              Le plan visait {colourLabel(family, pairing.intended!)}, mais avec ces deux montures le jeu visera {colourLabel(family, targetId)} (à cause de leurs parents).
            </span>
          ) : null}
        </TableCell>
        <TableCell className="w-10 text-right">
          <Button variant="ghost" size="icon-xs" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Autres naissances possibles et leurs noms"
            title="Autres naissances possibles">
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
                <li key={outcome.colourId} className={cn("flex flex-wrap items-center gap-x-2", outcome.colourId === targetId && "font-medium")}>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{formatChance(outcome.probability)}</span>
                  <span className="min-w-40">
                    {colourLabel(family, outcome.colourId)} <span className="text-xs text-muted-foreground">({outcome.labels.join(", ")})</span>
                  </span>
                  <BabyNames family={family} suffix={outcome.nameSuffix} />
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
  const queued = useBirthStore((state) => state.queued);
  return (
    <Table aria-label={label} className="min-w-xl table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <span className="sr-only">Fait</span>
          </TableHead>
          <TableHead className="w-[32%]">Mâle</TableHead>
          <TableHead className="w-[32%]">Femelle</TableHead>
          <TableHead>Petit visé</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <PairingRow
            key={row.index}
            family={family}
            row={row}
            done={done.has(row.index)}
            queued={queued && queued.role !== "baby" && queued.pairingIndex === row.index ? queued.role : null}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function PlanResults({ family, plan, doneList }: { family: MountFamily; plan: StablePlan; doneList: number[] }) {
  const done = new Set(doneList);
  const { groups, finalRows } = useMemo(() => groupPairings(family, plan.pairings), [family, plan]);
  const doneCount = plan.pairings.filter((_, index) => done.has(index)).length;
  const [hideDone, setHideDone] = useState(false);
  const visible = (rows: PlanRow[]) => (hideDone ? rows.filter((row) => !done.has(row.index)) : rows);
  const groupDone = (rows: PlanRow[]) => rows.filter((row) => done.has(row.index)).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Les reproductions à faire</CardTitle>
          <CardDescription>
            {doneCount} fait{doneCount > 1 ? "s" : ""} sur {plan.pairings.length} accouplement{plan.pairings.length > 1 ? "s" : ""}
            {plan.rejected.length ? `, ${plan.rejected.length} monture${plan.rejected.length > 1 ? "s" : ""} ignorée${plan.rejected.length > 1 ? "s" : ""}` : ""}. Après
            les naissances, recapture l’étable et recalcule.
          </CardDescription>
          {plan.pairings.length ? (
            <CardAction>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={hideDone} onCheckedChange={(checked) => setHideDone(checked === true)} />
                Masquer les faits
              </Label>
            </CardAction>
          ) : null}
          {plan.pairings.length ? (
            <div className="col-span-full mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(doneCount / plan.pairings.length) * 100}%` }} />
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {plan.pairings.length === 0 ? <p className="text-sm text-muted-foreground">Aucune reproduction utile avec cette étable pour l’instant.</p> : null}
          {groups.map((group) => {
            const rows = visible(group.rows);
            const finished = groupDone(group.rows);
            return (
              <section key={group.generation} className="flex flex-col gap-2">
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                  {group.generation ? `Petits en génération ${group.generation}` : "Petit visé inconnu"}
                  <span className="tabular-nums font-normal text-muted-foreground">
                    {finished}/{group.rows.length}
                  </span>
                  <span className="basis-full font-normal text-muted-foreground sm:basis-auto">
                    {group.targets.map((target) => `${target.count} ${target.name}`).join(", ")}
                  </span>
                </h3>
                {rows.length ? (
                  <PairingTable family={family} rows={rows} done={done} label={`Accouplements vers la génération ${group.generation}`} />
                ) : (
                  <p className="text-sm text-muted-foreground">Tous faits.</p>
                )}
              </section>
            );
          })}
          {finalRows.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                Dernier accouplement, puis brisage des deux parents
                <span className="tabular-nums font-normal text-muted-foreground">
                  {groupDone(finalRows)}/{finalRows.length}
                </span>
              </h3>
              {visible(finalRows).length ? (
                <PairingTable family={family} rows={visible(finalRows)} done={done} label="Derniers accouplements" />
              ) : (
                <p className="text-sm text-muted-foreground">Tous faits.</p>
              )}
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

const WATCH_STATUS: Record<WatchStatus, string> = {
  connecting: "Connexion au serveur OCR…",
  watching: "Dofus est surveillé.",
  "no-window": "En attente : mets la fenêtre de Dofus au premier plan.",
  offline: "Serveur OCR indisponible ; lance start.ps1.",
  outdated: "Serveur OCR obsolète ; arrête-le puis relance start.ps1.",
  error: "Lecture de l’écran impossible",
};

const QUEUED_ROLE = { male: "le mâle à chercher", female: "la femelle à chercher", baby: "le nom du petit" } as const;

function QueuedLine({ family, queued }: { family: MountFamily; queued: QueuedName }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="text-muted-foreground">Presse-papiers :</span>
      <MountCode family={family} code={queued.name} className="-mx-1 bg-primary/10 text-primary" />
      <span className="text-muted-foreground">{QUEUED_ROLE[queued.role]}</span>
    </p>
  );
}

/** Pendant les accouplements, le serveur OCR met dans le presse-papiers le prochain nom à coller dans Dofus. */
function BirthWatch({ family }: { family: MountFamily }) {
  const { watching, status, detail, log, queued } = useBirthStore();
  useEffect(() => setBirthWatchFamily(family.id), [family.id]);
  const entries = log.filter((entry) => entry.family === family.id);
  const statusText = status === "error" && detail ? `${WATCH_STATUS.error} : ${detail}` : WATCH_STATUS[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Noms à coller</CardTitle>
        <CardDescription>
          Le presse-papiers suit le plan : le mâle, la femelle, puis le petit dès sa naissance. Chaque Ctrl+V dans Dofus passe au nom suivant ; F8
          le saute, Maj+F8 revient en arrière.
        </CardDescription>
        <CardAction>
          <Button variant={watching ? "secondary" : "default"} size="sm" onClick={() => setBirthWatch(!watching, family.id)} aria-pressed={watching}>
            <RadarIcon data-icon="inline-start" className={cn(watching && status === "watching" && "animate-pulse")} aria-hidden />
            {watching ? "Arrêter" : "Démarrer"}
          </Button>
        </CardAction>
      </CardHeader>
      {watching || entries.length ? (
        <CardContent className="flex flex-col gap-3">
          {watching ? (
            <p role="status" className={cn("text-sm", ["offline", "outdated", "error"].includes(status) ? "text-warning" : "text-muted-foreground")}>
              {statusText}
            </p>
          ) : null}
          {watching && queued ? <QueuedLine family={family} queued={queued} /> : null}
          {entries.length ? (
            <ul className="flex flex-col gap-2 text-sm" aria-label="Dernières naissances">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {entry.reading ? (
                    <>
                      <span className="min-w-44">
                        <span className="font-medium">{colourLabel(family, entry.reading.childId)}</span>
                        {entry.reading.sex ? <span className="text-muted-foreground"> {entry.reading.sex === "F" ? "♀" : "♂"}</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · de {colourLabel(family, entry.reading.fatherId)} × {colourLabel(family, entry.reading.motherId)}
                        </span>
                      </span>
                      {entry.copied ? (
                        <span className="flex items-center gap-1.5">
                          <MountCode family={family} code={entry.copied} />
                          <span className="text-xs text-success">copié</span>
                        </span>
                      ) : (
                        <BabyNames family={family} suffix={entry.reading.names.M.slice(1)} onCopy={(code) => followCopiedName(family.id, code)} />
                      )}
                    </>
                  ) : null}
                  {entry.error ? <span className="basis-full text-xs text-warning">{entry.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function StablePlanner({ family }: { family: MountFamily }) {
  const state = useStableStore((store) => store.families[family.id]);
  return (
    <>
      <StableInput family={family} />
      <BirthWatch family={family} />
      {state.plan && state.plan.family === family.id ? <PlanResults family={family} plan={state.plan} doneList={state.done} /> : null}
    </>
  );
}
