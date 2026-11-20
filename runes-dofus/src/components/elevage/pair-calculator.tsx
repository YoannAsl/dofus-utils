import { useMemo, useState } from "react";
import { MountCode, describeMount } from "@/components/elevage/mount-code";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChance } from "@/lib/format";
import { colourLabel, type MountFamily } from "@/lib/mounts/family";
import { mountName, parseMountName } from "@/lib/mounts/names";
import { birthOutcomes } from "@/lib/mounts/offspring";
import type { Sex } from "@/lib/mounts/types";

/** Couleurs groupées par génération, pour les listes déroulantes. */
function useColoursByGeneration(family: MountFamily) {
  return useMemo(() => {
    const groups = new Map<number, { id: string; label: string }[]>();
    for (const colour of family.colours) {
      if (!groups.has(colour.generation)) groups.set(colour.generation, []);
      groups.get(colour.generation)!.push({ id: colour.id, label: colourLabel(family, colour.id) });
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([generation, options]) => ({ generation, options: options.sort((a, b) => a.label.localeCompare(b.label, "fr")) }));
  }, [family]);
}

function ColourSelect({ family, value, onChange, label }: { family: MountFamily; value: string; onChange: (id: string) => void; label: string }) {
  const groups = useColoursByGeneration(family);
  return (
    <NativeSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="w-full">
      {groups.map((group) => (
        <NativeSelectOptGroup key={group.generation} label={`Génération ${group.generation}`}>
          {group.options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      ))}
    </NativeSelect>
  );
}

/** Le nom de 13 lettres à donner en jeu à une monture. */
function NameBuilder({ family }: { family: MountFamily }) {
  const firstBred = family.colours.find((colour) => colour.generation === 2)!;
  const [sex, setSex] = useState<Sex>("F");
  const [colourId, setColourId] = useState(firstBred.id);
  const [wild, setWild] = useState(false);
  const [parents, setParents] = useState<[string, string]>(firstBred.recipes[0]!);
  const name = mountName(family, { colourId, sex, parentIds: wild ? [] : parents, keepOrder: true });

  const changeColour = (id: string) => {
    setColourId(id);
    const recipe = family.byId.get(id)?.recipes[0];
    if (recipe) setParents(recipe);
    setWild(!recipe);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renommer une monture</CardTitle>
        <CardDescription>Le nom de 13 lettres à donner en jeu.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label>Sexe</Label>
            <RadioGroup value={sex} onValueChange={(value) => setSex(value as Sex)} className="flex h-8 items-center gap-4" aria-label="Sexe">
              {(["F", "M"] as const).map((value) => (
                <Label key={value} className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value={value} />
                  {value === "F" ? "Femelle" : "Mâle"}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Couleur</Label>
            <ColourSelect family={family} value={colourId} onChange={changeColour} label="Couleur de la monture" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>1er parent</Label>
            <ColourSelect family={family} value={parents[0]} onChange={(id) => setParents([id, parents[1]])} label="1er parent" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>2e parent</Label>
            <ColourSelect family={family} value={parents[1]} onChange={(id) => setParents([parents[0], id])} label="2e parent" />
          </div>
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={wild} onCheckedChange={(checked) => setWild(checked === true)} />
          Monture capturée (parents inconnus : SAUVSAUV)
        </Label>
        {name ? (
          <div className="flex flex-wrap items-center gap-3">
            <MountCode family={family} code={name} className="rounded-md bg-muted px-2 py-1 text-base" />
            <span className="text-sm text-muted-foreground">{describeMount(family, name)}</span>
          </div>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Codes couleur des {family.label.toLowerCase()}s</summary>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            {family.baseCodes.map((entry) => (
              <li key={entry.code}>
                <span className="font-mono font-semibold">{entry.code}</span> {colourLabel(family, family.idByType.get(entry.code + entry.code)!)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            Couleur unie : son code doublé (Amande = AMAM). Bicolore : ses deux codes, dans l’ordre que tu veux. Capturée : SAUVSAUV à la place des
            parents.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

function ParentInput({ family, label, sex, value, onChange }: { family: MountFamily; label: string; sex: Sex; value: string; onChange: (value: string) => void }) {
  const mount = parseMountName(value, family);
  const wrongSex = mount && mount.sex !== sex;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`parent-${sex}`}>{label}</Label>
      <Input
        id={`parent-${sex}`}
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        placeholder={sex === "M" ? "MPOPOSAUVSAUV" : "FORORSAUVSAUV"}
        className="font-mono uppercase"
        aria-invalid={Boolean(value && (!mount || wrongSex))}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="text-xs text-muted-foreground">
        {!value ? "Nom de 13 lettres de la monture." : mount ? (wrongSex ? `${describeMount(family, mount.code)} — ce n’est pas ${sex === "M" ? "un mâle" : "une femelle"}.` : describeMount(family, mount.code)) : "Nom illisible."}
      </span>
    </div>
  );
}

/** Ce que peut donner un couple, et le nom à donner au petit. */
function PairOutcomes({ family }: { family: MountFamily }) {
  const [father, setFather] = useState("");
  const [mother, setMother] = useState("");
  const male = parseMountName(father, family);
  const female = parseMountName(mother, family);
  // Un père qui n'est pas un mâle, ou une mère qui n'est pas une femelle : pas d'accouplement possible.
  const outcomes = male?.sex === "M" && female?.sex === "F" ? birthOutcomes(family, male, female) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculer un accouplement</CardTitle>
        <CardDescription>Chances pour deux parents au niveau 40.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ParentInput family={family} label="Père (mâle)" sex="M" value={father} onChange={setFather} />
          <ParentInput family={family} label="Mère (femelle)" sex="F" value={mother} onChange={setMother} />
        </div>
        {outcomes.length ? (
          <Table aria-label="Naissances possibles">
            <TableHeader>
              <TableRow>
                <TableHead>Naissance</TableHead>
                <TableHead>Couleur</TableHead>
                <TableHead className="text-right">Chance</TableHead>
                <TableHead>Nom du petit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((outcome) => (
                <TableRow key={outcome.colourId}>
                  <TableCell className="whitespace-normal">{outcome.labels.join(", ")}</TableCell>
                  <TableCell>
                    {colourLabel(family, outcome.colourId)}
                    <span className="ml-1 text-xs text-muted-foreground">G{family.byId.get(outcome.colourId)!.generation}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatChance(outcome.probability)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-x-2">
                      <MountCode family={family} code={`M${outcome.nameSuffix}`} />
                      <MountCode family={family} code={`F${outcome.nameSuffix}`} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PairCalculator({ family }: { family: MountFamily }) {
  return (
    <>
      <PairOutcomes key={`pair-${family.id}`} family={family} />
      <NameBuilder key={`name-${family.id}`} family={family} />
    </>
  );
}
