import { runes, type Rune } from "@/lib/runes";
import { normalizeText } from "@/lib/text";

export const MAX_ITEM_LOAD = 101;
const STEP_POSITION = 0.8;
const MALUS_WEIGHT_FACTOR = 0.5;
const HIGH_LEVEL = 170;
const LOW_LEVEL = 100;
const LOW_LEVEL_BONUS = 15;
const RATIO_FACTOR = 4;
const EXO_FIXED_SC = 1.5;
const DEFAULT_QUALITY = 0.85;
const EPSILON = 1e-9;
const AP = 1;
const MP = 23;
const RANGE = 19;
const AP_MP = new Set([AP, MP]);
const FIXED_EXO = new Set([AP, MP, RANGE]);
const TEN_PER_POINT = new Set([121, 124]);

export interface FmLine {
  characteristic: number;
  value: number;
  min: number | null;
  max: number | null;
  unitWeight: number | null;
}

export interface FmItem {
  level: number;
  lines: FmLine[];
}

export interface FmRune {
  characteristic: number;
  value: number;
  weight: number;
}

export type FmRegime = "normal" | "step" | "over" | "repass" | "exo";

export interface FmChances {
  sc: number;
  sn: number;
  ec: number;
}

export type FmOdds =
  | { blocked: "line-cap"; limit: number }
  | { blocked: "item-cap"; limit: number; load: number }
  | (FmChances & {
      blocked?: undefined;
      regime: FmRegime;
      estimated: boolean;
      limit: number;
      malus: boolean;
      exoApMp: boolean;
    });

const hasRange = (line: Pick<FmLine, "min" | "max">): line is FmLine & { min: number; max: number } =>
  Number.isFinite(line.min) && Number.isFinite(line.max);
const hasWeight = (line: FmLine): line is FmLine & { unitWeight: number } => Number.isFinite(line.unitWeight) && line.unitWeight! > 0;
const bounds = (line: { min: number; max: number }) => [Math.min(line.min, line.max), Math.max(line.min, line.max)] as const;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function itemQuality(lines: FmLine[], skip = -1) {
  let reached = 0;
  let total = 0;
  lines.forEach((line, index) => {
    if (index === skip || !hasRange(line) || !hasWeight(line)) return;
    const [, max] = bounds(line);
    if (max < 0) return;
    reached += line.unitWeight * Math.min(Math.max(0, line.value), max);
    total += line.unitWeight * max;
  });
  return total > 0 ? reached / total : 0;
}

function levelBonus(level: number, quality: number) {
  return (level < HIGH_LEVEL ? 20 * Math.max(0, 1.1 - quality) : 0) + (level < LOW_LEVEL ? LOW_LEVEL_BONUS : 0);
}

interface DifficultyInput {
  position: number;
  over: boolean;
  overWeight: number;
  ratio: number;
  power: number;
  quality: number;
  level: number;
  step: boolean;
}

export function difficulty({ position, over, overWeight, ratio, power, quality, level, step }: DifficultyInput) {
  let value = 5 + RATIO_FACTOR * power * Math.max(0, ratio - 14) + 60 * quality ** 12;
  if (over) value += 65 + 4 * Math.max(0, overWeight);
  else if (step && position >= STEP_POSITION - EPSILON) value += 45;
  return value - levelBonus(level, quality);
}

export function chancesFromDifficulty(value: number, over: boolean): FmChances {
  const sc = Math.max(2, (100 - value) / 2);
  let sn = over ? Math.max(5, 40 - 0.375 * (value - 100)) : value <= 100 ? Math.min(50, 100 - sc) : 50 - 0.375 * (value - 100);
  sn = Math.min(Math.max(sn, 0), 100 - sc);
  return { sc, sn, ec: 100 - sc - sn };
}

export function exoChances(characteristic: number, weight: number, { quality = DEFAULT_QUALITY, level = 200 } = {}): FmChances & { estimated: boolean } {
  if (FIXED_EXO.has(characteristic)) return { sc: EXO_FIXED_SC, sn: 0, ec: 100 - EXO_FIXED_SC, estimated: false };
  let base = 0;
  if (weight <= 2) base = 57;
  else if (weight <= 15) base = 57 - ((weight - 2) * 38) / 13;
  else if (weight < 25) base = 19 - (weight - 15) * 1.9;
  if (level < LOW_LEVEL && weight <= 50) base = Math.max(base, 8 + ((3 - 8) * (weight - 25)) / 25);
  if (base <= 0) return { sc: 1, sn: 0, ec: 99, estimated: true };
  const success = Math.max(1, 0.077 * base) + 0.923 * base;
  const odds = (success / (100 - success)) * Math.exp(1.2 * (DEFAULT_QUALITY - quality));
  const passed = Math.max(1, (100 * odds) / (1 + odds));
  const sc = Math.max(1, 0.077 * passed);
  return { sc, sn: passed - sc, ec: 100 - passed, estimated: true };
}

function lineLimit(line: Pick<FmLine, "min" | "max">, unitWeight: number) {
  const cap = Math.floor(MAX_ITEM_LOAD / unitWeight + EPSILON);
  return hasRange(line) ? Math.max(bounds(line)[1], cap) : cap;
}

export function overLoad(lines: FmLine[]) {
  return lines.reduce((load, line) => {
    if (!hasWeight(line) || !(line.value > 0)) return load;
    if (!hasRange(line)) return load + line.value * line.unitWeight;
    const [, max] = bounds(line);
    if (max < 0) return load + line.value * line.unitWeight - max * line.unitWeight * MALUS_WEIGHT_FACTOR;
    return load + Math.max(0, line.value - max) * line.unitWeight;
  }, 0);
}

export function runeOdds(item: FmItem, rune: FmRune): FmOdds {
  const { lines } = item;
  const index = lines.findIndex((line) => line.characteristic === rune.characteristic);
  const line = index >= 0 ? lines[index]! : null;
  const unitWeight = rune.weight / rune.value;
  const current = line ? line.value : 0;
  const limit = lineLimit(line ?? { min: null, max: null }, unitWeight);
  const next = current + rune.value;
  if (next > limit) return { blocked: "line-cap", limit };

  const after =
    index >= 0
      ? lines.map((other, i) => (i === index ? { ...other, value: next } : other))
      : [...lines, { characteristic: rune.characteristic, value: rune.value, min: null, max: null, unitWeight }];
  if (overLoad(after) > MAX_ITEM_LOAD + EPSILON) return { blocked: "item-cap", limit, load: round2(overLoad(lines)) };

  const quality = itemQuality(lines, index);
  if (!line || !hasRange(line)) {
    const exo = exoChances(rune.characteristic, next * unitWeight, { quality, level: item.level });
    return { ...exo, regime: "exo", limit, malus: false, exoApMp: false };
  }

  const [min, max] = bounds(line);
  const over = next > max;
  if (over) {
    const others = overLoad(lines.filter((other) => other !== line));
    const own = max < 0 ? overLoad([after[index]!]) : next * unitWeight;
    if (own + others > MAX_ITEM_LOAD + EPSILON) return { blocked: "item-cap", limit, load: round2(Math.max(0, current) * unitWeight + others) };
  }

  const fixed = max === min;
  const position = fixed ? 1 : (next - min) / (max - min);
  const exoApMp = lines.some((other) => AP_MP.has(other.characteristic) && !hasRange(other) && other.value > 0);
  const value = difficulty({
    position,
    over,
    overWeight: over ? (next - max) * unitWeight : 0,
    ratio: current / rune.value,
    power: rune.weight,
    quality: exoApMp ? 1 : quality,
    level: item.level,
    step: !fixed,
  });
  const regime: FmRegime = over ? "over" : fixed ? "repass" : position >= STEP_POSITION - EPSILON ? "step" : "normal";
  return { ...chancesFromDifficulty(value, over), regime, estimated: false, limit, malus: next < 0, exoApMp };
}

export interface FmEffect {
  characteristic: number;
  label: string;
  percent: boolean;
}

export const FM_EFFECTS: FmEffect[] = [
  { characteristic: 1, label: "PA", percent: false },
  { characteristic: 23, label: "PM", percent: false },
  { characteristic: 19, label: "Portée", percent: false },
  { characteristic: 26, label: "Invocation", percent: false },
  { characteristic: 11, label: "Vitalité", percent: false },
  { characteristic: 12, label: "Sagesse", percent: false },
  { characteristic: 10, label: "Force", percent: false },
  { characteristic: 15, label: "Intelligence", percent: false },
  { characteristic: 13, label: "Chance", percent: false },
  { characteristic: 14, label: "Agilité", percent: false },
  { characteristic: 25, label: "Puissance", percent: false },
  { characteristic: 18, label: "Critique", percent: true },
  { characteristic: 16, label: "Dommage", percent: false },
  { characteristic: 49, label: "Soin", percent: false },
  { characteristic: 40, label: "Pod", percent: false },
  { characteristic: 44, label: "Initiative", percent: false },
  { characteristic: 48, label: "Prospection", percent: false },
  { characteristic: 27, label: "Esquive PA", percent: false },
  { characteristic: 28, label: "Esquive PM", percent: false },
  { characteristic: 82, label: "Retrait PA", percent: false },
  { characteristic: 83, label: "Retrait PM", percent: false },
  { characteristic: 78, label: "Fuite", percent: false },
  { characteristic: 79, label: "Tacle", percent: false },
  { characteristic: 50, label: "Dommages Renvoyés", percent: false },
  { characteristic: 70, label: "Dommage Pièges", percent: false },
  { characteristic: 69, label: "Puissance Pièges", percent: false },
  { characteristic: 84, label: "Dommage Poussée", percent: false },
  { characteristic: 85, label: "Résistance Poussée", percent: false },
  { characteristic: 86, label: "Dommage Critique", percent: false },
  { characteristic: 87, label: "Résistance Critiques", percent: false },
  { characteristic: 88, label: "Dommage Terre", percent: false },
  { characteristic: 89, label: "Dommage Feu", percent: false },
  { characteristic: 90, label: "Dommage Eau", percent: false },
  { characteristic: 91, label: "Dommage Air", percent: false },
  { characteristic: 92, label: "Dommage Neutre", percent: false },
  { characteristic: 54, label: "Résistance Terre", percent: false },
  { characteristic: 55, label: "Résistance Feu", percent: false },
  { characteristic: 56, label: "Résistance Eau", percent: false },
  { characteristic: 57, label: "Résistance Air", percent: false },
  { characteristic: 58, label: "Résistance Neutre", percent: false },
  { characteristic: 33, label: "Résistance Terre", percent: true },
  { characteristic: 34, label: "Résistance Feu", percent: true },
  { characteristic: 35, label: "Résistance Eau", percent: true },
  { characteristic: 36, label: "Résistance Air", percent: true },
  { characteristic: 37, label: "Résistance Neutre", percent: true },
  { characteristic: 125, label: "Dommages mêlée", percent: true },
  { characteristic: 124, label: "Résistance mêlée", percent: true },
  { characteristic: 120, label: "Dommages distance", percent: true },
  { characteristic: 121, label: "Résistance distance", percent: true },
  { characteristic: 122, label: "Dommages d'armes", percent: true },
  { characteristic: 123, label: "Dommages aux sorts", percent: true },
];

function labelKey(label: string) {
  return normalizeText(label)
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && word !== "aux" && word !== "d")
    .map((word) => word.replace(/s$/, ""))
    .join(" ");
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

const EFFECT_KEYS = FM_EFFECTS.map((effect) => ({ effect, key: labelKey(effect.label) }));

export function matchEffect(label: string, percent: boolean): FmEffect | null {
  const key = labelKey(label);
  if (!key) return null;
  let best: { effect: FmEffect; score: number } | null = null;
  for (const candidate of EFFECT_KEYS) {
    const distance = editDistance(key, candidate.key) / Math.max(key.length, candidate.key.length);
    const score = distance + (candidate.effect.percent === percent ? 0 : 0.2);
    if (!best || score < best.score) best = { effect: candidate.effect, score };
  }
  return best && best.score <= 0.25 ? best.effect : null;
}

export function unitWeight(characteristic: number) {
  if (TEN_PER_POINT.has(characteristic)) return 10;
  return runesFor(characteristic)[0]?.effect.weight ?? null;
}

const RUNES_BY_CHARACTERISTIC = new Map<number, Rune[]>();
for (const rune of [...runes].sort((a, b) => a.value - b.value || a.id - b.id)) {
  if (rune.characteristic == null || rune.characteristic <= 0 || !(rune.value > 0) || !(rune.effect.weight > 0)) continue;
  const list = RUNES_BY_CHARACTERISTIC.get(rune.characteristic) ?? [];
  if (list.length < 3 && !list.some((other) => other.value === rune.value)) list.push(rune);
  RUNES_BY_CHARACTERISTIC.set(rune.characteristic, list);
}

export function runesFor(characteristic: number): Rune[] {
  return RUNES_BY_CHARACTERISTIC.get(characteristic) ?? [];
}

export function fmRune(rune: Rune): FmRune {
  const characteristic = rune.characteristic!;
  return { characteristic, value: rune.value, weight: rune.value * (TEN_PER_POINT.has(characteristic) ? 10 : rune.effect.weight) };
}

export interface ReadRow {
  min: number | null;
  max: number | null;
  value: number | null;
  percent: boolean;
  label: string;
  text: string;
}

export interface FmReading {
  item: string;
  reliquat: number | null;
  rows: ReadRow[];
}

export interface TrackedLine {
  effect: FmEffect;
  value: number;
  min: number | null;
  max: number | null;
  visible: boolean;
}

export interface TrackedItem {
  name: string;
  reliquat: number | null;
  lines: TrackedLine[];
  unknown: string[];
}

export function trackReading(previous: TrackedItem | null, reading: FmReading): TrackedItem {
  const same = previous && normalizeText(previous.name) === normalizeText(reading.item);
  const before = new Map((same ? previous.lines : []).map((line) => [line.effect.characteristic, line]));
  const seen = new Map<number, TrackedLine>();
  const unknown: string[] = [];
  for (const row of reading.rows) {
    const effect = matchEffect(row.label, row.percent);
    if (!effect || row.value === null) {
      unknown.push(row.text);
      continue;
    }
    if (seen.has(effect.characteristic)) continue;
    const old = before.get(effect.characteristic);
    const rangeKnown = row.min !== null && row.max !== null;
    seen.set(effect.characteristic, {
      effect,
      value: row.value,
      min: rangeKnown ? row.min : (old?.min ?? row.min),
      max: rangeKnown ? row.max : (old?.max ?? row.max),
      visible: true,
    });
  }
  const order = [...(same ? previous.lines.map((line) => line.effect.characteristic) : []), ...seen.keys()];
  const lines = [...new Set(order)].map((characteristic) => seen.get(characteristic) ?? { ...before.get(characteristic)!, visible: false });
  return { name: reading.item, reliquat: reading.reliquat ?? (same ? previous.reliquat : null), lines, unknown };
}

export function fmItem(tracked: TrackedItem, level: number): FmItem {
  return {
    level,
    lines: tracked.lines.map((line) => ({
      characteristic: line.effect.characteristic,
      value: line.value,
      min: line.min ?? (line.max === null ? null : Math.min(line.max, line.value)),
      max: line.max ?? (line.min === null ? null : Math.max(line.min, line.value)),
      unitWeight: unitWeight(line.effect.characteristic),
    })),
  };
}
