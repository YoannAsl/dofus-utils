import type { MountFamily } from "@/lib/mounts/family";
import { completeMountName, parseMountName, WILD } from "@/lib/mounts/names";

export interface OcrWord {
  text: string;
  box?: { x: number; y: number; width: number; height: number } | null;
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
}

/** Lettres que l'OCR confond entre elles : les substituer coûte moitié moins. */
const CONFUSABLE = ["ODQ", "ILJT", "UV", "EF", "MN", "BE", "SZ", "CG", "AR"];
const confusable = new Set(CONFUSABLE.flatMap((group) => [...group].flatMap((a) => [...group].map((b) => a + b))));
const DIGIT_LOOKALIKES: Record<string, string> = { "0": "O", "1": "I", "|": "I", "!": "I", "5": "S", "8": "B", "2": "Z", "6": "G" };
/** Une lettre que l'OCR lit en deux morceaux : U lu « IJ », M lu « RN »… */
const SPLIT_GLYPHS: Record<string, string> = { IJ: "U", LJ: "U", II: "U", LI: "U", RN: "M", CL: "D" };
const MAX_REPAIR_COST = 2;

/** Majuscules sans accents ; les chiffres pris pour des lettres sont remplacés, le reste est retiré. */
function normalizeToken(raw: string) {
  const truncated = /(…|\.{2,})\s*$/u.test(raw);
  const letters = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[0-9|!]/g, (char) => DIGIT_LOOKALIKES[char] ?? "")
    .replace(/[^A-Z]/g, "");
  return { letters, truncated };
}

function substitutionCost(a: string, b: string) {
  if (a === b) return 0;
  return confusable.has(a + b) ? 0.5 : 1;
}

/** Distance d'édition pondérée entre un morceau lu et un code attendu. */
function editDistance(read: string, expected: string) {
  const beforePrevious = new Float64Array(expected.length + 1);
  const previous = new Float64Array(expected.length + 1);
  const current = new Float64Array(expected.length + 1);
  for (let j = 0; j <= expected.length; j += 1) previous[j] = j;
  for (let i = 1; i <= read.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= expected.length; j += 1) {
      let cost = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + substitutionCost(read[i - 1]!, expected[j - 1]!));
      if (i >= 2 && SPLIT_GLYPHS[read.slice(i - 2, i)] === expected[j - 1]) cost = Math.min(cost, beforePrevious[j - 1]! + 0.3);
      current[j] = cost;
    }
    beforePrevious.set(previous);
    previous.set(current);
  }
  return previous[expected.length]!;
}

interface Parse {
  cost: number;
  name: string;
}

/**
 * Réaligne un nom mal lu sur la forme attendue — sexe, couleur, 1er et 2e parent (ou SAUVSAUV) —
 * par programmation dynamique sur les codes de la famille. Ne garde la réparation que si elle est
 * proche et sans ambiguïté.
 */
function alignToGrammar(letters: string, family: MountFamily, truncated: boolean): string | null {
  const types = [...family.idByType.keys()];
  const sexes = ["M", "F"];
  const segments: string[][] = [sexes, types, [...types, WILD + WILD, WILD], types];
  const length = letters.length;
  // best[s][i] : les meilleures lectures des s premiers segments qui consomment i lettres.
  const best: Parse[][][] = segments.map(() => []);
  best.push([]);
  best[0]![0] = [{ cost: 0, name: "" }];
  const keep = (bucket: Parse[][], index: number, parse: Parse) => {
    const list = (bucket[index] ??= []);
    if (list.some((entry) => entry.name === parse.name && entry.cost <= parse.cost)) return;
    list.push(parse);
    list.sort((a, b) => a.cost - b.cost);
    if (list.length > 3) list.length = 3;
  };
  for (let s = 0; s < segments.length; s += 1)
    for (let i = 0; i <= length; i += 1) {
      const starts = best[s]![i];
      if (!starts) continue;
      for (const code of segments[s]!)
        for (let span = Math.max(0, code.length - 2); span <= code.length + 2 && i + span <= length; span += 1) {
          const cost = editDistance(letters.slice(i, i + span), code);
          if (cost > MAX_REPAIR_COST) continue;
          for (const start of starts) {
            const total = start.cost + cost;
            if (total > MAX_REPAIR_COST) continue;
            const name = start.name + code;
            // Une capture n'a pas de 2e parent : SAUVSAUV termine le nom.
            if (s === 2 && code.startsWith(WILD)) keep(best[4]!, i + span, { cost: total, name });
            else keep(best[s + 1]!, i + span, { cost: total, name });
          }
        }
    }
  const finished: Parse[] = [...(best[4]![length] ?? [])];
  // Nom coupé : le 2e parent est la couleur de la monture elle-même.
  if (truncated) for (const parse of best[3]![length] ?? []) finished.push({ cost: parse.cost, name: parse.name + parse.name.slice(1, 5) });
  const valid = finished
    .map((parse) => ({ ...parse, mount: parseMountName(parse.name, family) }))
    .filter((parse) => parse.mount !== null)
    .sort((a, b) => a.cost - b.cost);
  const first = valid[0];
  if (!first) return null;
  // Deux lectures presque aussi plausibles qui désignent deux montures différentes : on ne choisit pas.
  const identity = (mount: NonNullable<(typeof first)["mount"]>) => `${mount.sex}|${mount.colourId}|${[...mount.parentIds].sort().join(",")}`;
  const rivals = new Set(valid.filter((parse) => parse.cost - first.cost < 0.5).map((parse) => identity(parse.mount!)));
  return rivals.size === 1 ? first.name : null;
}

export interface RepairedName {
  code: string;
  /** Lecture brute, quand elle a été corrigée. */
  from?: string;
}

/** Nom de monture lu par OCR : tel quel, complété s'il est coupé, ou réparé. */
export function repairMountName(raw: string, family: MountFamily): RepairedName | null {
  const direct = parseMountName(raw, family);
  if (direct) return { code: direct.code };
  const { letters, truncated } = normalizeToken(raw);
  if (letters.length < 7 || letters.length > 17) return null;
  // L'OCR lit bien les « … » : sans eux, un nom trop court a perdu une lettre, il n'a pas été coupé.
  const clean = truncated ? completeMountName(letters + "…", family)?.code : parseMountName(letters, family)?.code;
  if (clean) return { code: clean, from: raw };
  const aligned = alignToGrammar(letters, family, truncated);
  return aligned ? { code: aligned, from: raw } : null;
}

export interface StableCaptureReading {
  names: string[];
  corrected: { from: string; to: string }[];
  /** Lignes qui ressemblent à un nom de monture mais n'ont pas pu être lues. */
  unreadable: string[];
}

const looksLikeName = (word: string) => /^[MF]/i.test(word.trim()) && normalizeToken(word).letters.length >= 7;

/** Noms de montures d'une capture de l'étable, de haut en bas. */
export function readStableCapture(lines: OcrLine[], family: MountFamily): StableCaptureReading {
  const top = (line: OcrLine) => line.words[0]?.box?.y ?? 0;
  const left = (line: OcrLine) => line.words[0]?.box?.x ?? 0;
  const ordered = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => top(a.line) - top(b.line) || left(a.line) - left(b.line) || a.index - b.index);
  const reading: StableCaptureReading = { names: [], corrected: [], unreadable: [] };
  for (const { line } of ordered) {
    const words = line.words.length ? line.words.map((word) => word.text) : line.text.split(/\s+/);
    const start = words.findIndex(looksLikeName);
    if (start < 0) continue;
    const first = words[start]!;
    const candidates = [first];
    // L'OCR coupe parfois un nom en deux mots.
    const next = words[start + 1];
    if (next && normalizeToken(first).letters.length < 13 && /^[A-Z0-9|.…]+$/i.test(next)) candidates.push(first + next);
    const repaired = candidates.map((candidate) => repairMountName(candidate, family)).find((result) => result !== null);
    if (!repaired) {
      reading.unreadable.push(first);
      continue;
    }
    reading.names.push(repaired.code);
    if (repaired.from && repaired.from !== repaired.code) reading.corrected.push({ from: repaired.from, to: repaired.code });
  }
  return reading;
}

/**
 * Ajoute les noms d'une nouvelle capture. Les captures se chevauchent quand on fait défiler la
 * liste : les lignes vues des deux côtés du raccord ne comptent qu'une fois.
 */
export function appendCapture(existing: string[], incoming: string[]) {
  let overlap = 0;
  for (let size = Math.min(existing.length, incoming.length); size > 0; size -= 1) {
    const tail = existing.slice(existing.length - size);
    if (tail.every((name, index) => name === incoming[index])) {
      overlap = size;
      break;
    }
  }
  return { names: [...existing, ...incoming.slice(overlap)], overlap };
}
