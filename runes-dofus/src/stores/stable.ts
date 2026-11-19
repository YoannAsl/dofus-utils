import { create } from "zustand";
import { getMountFamily, isMountFamilyId, MOUNT_FAMILY_IDS } from "@/lib/mounts/family";
import type { ObjectiveMode } from "@/lib/mounts/horizon";
import { readMountList } from "@/lib/mounts/names";
import type { StablePlan } from "@/lib/mounts/planner";
import { PlannerCancelled, runPlanner } from "@/lib/mounts/planner-client";
import { appendCapture, type OcrLine, readStableCapture } from "@/lib/mounts/stable-ocr";
import type { MountFamilyId } from "@/lib/mounts/types";
import { readStorage, writeStorage } from "@/lib/storage";

const STORAGE_KEY = "dofus-elevage";
const OCR_TEXT_PATH = "/api/ocr/text";
/** En dessous de cette largeur, la capture est agrandie : l'OCR lit mieux les petits noms. */
const UPSCALE_BELOW_WIDTH = 2400;

export interface FamilyStable {
  /** Noms de l'étable, un par ligne, modifiables. */
  draft: string;
  plan: StablePlan | null;
  /** Lignes du plan déjà faites, par indice. */
  done: number[];
  mode: ObjectiveMode;
  avoidObtained: boolean;
  /** Mode succès : couleurs (G2 et plus) déjà nées au moins une fois. */
  obtained: string[];
}

export interface CaptureReport {
  added: number;
  overlap: number;
  corrected: { from: string; to: string }[];
  unreadable: string[];
}

interface StableState {
  families: Record<MountFamilyId, FamilyStable>;
  reading: boolean;
  computing: boolean;
  status: string;
  error: string;
  lastCapture: CaptureReport | null;
}

const emptyFamily = (): FamilyStable => ({ draft: "", plan: null, done: [], mode: "genetons", avoidObtained: true, obtained: [] });

function loadFamilies(): Record<MountFamilyId, FamilyStable> {
  const stored = readStorage(STORAGE_KEY);
  const families = Object.fromEntries(MOUNT_FAMILY_IDS.map((id) => [id, emptyFamily()])) as Record<MountFamilyId, FamilyStable>;
  if (!stored || typeof stored !== "object") return families;
  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!isMountFamilyId(id) || !value || typeof value !== "object") continue;
    const entry = value as Partial<FamilyStable>;
    families[id] = {
      draft: typeof entry.draft === "string" ? entry.draft : "",
      plan: entry.plan && typeof entry.plan === "object" && Array.isArray(entry.plan.pairings) ? entry.plan : null,
      done: Array.isArray(entry.done) ? entry.done.filter((index) => Number.isInteger(index)) : [],
      mode: entry.mode === "success" ? "success" : "genetons",
      avoidObtained: entry.avoidObtained !== false,
      obtained: Array.isArray(entry.obtained) ? entry.obtained.filter((id) => typeof id === "string") : [],
    };
  }
  return families;
}

export const useStableStore = create<StableState>(() => ({
  families: loadFamilies(),
  reading: false,
  computing: false,
  status: "",
  error: "",
  lastCapture: null,
}));

const set = useStableStore.setState;
const get = useStableStore.getState;

function updateFamily(family: MountFamilyId, change: Partial<FamilyStable>) {
  const families = { ...get().families, [family]: { ...get().families[family], ...change } };
  set({ families });
  writeStorage(STORAGE_KEY, families);
}

export const setStableDraft = (family: MountFamilyId, draft: string) => updateFamily(family, { draft });
export const setStableMode = (family: MountFamilyId, mode: ObjectiveMode) => updateFamily(family, { mode });
export const setAvoidObtained = (family: MountFamilyId, avoidObtained: boolean) => updateFamily(family, { avoidObtained });

export function setObtained(family: MountFamilyId, colourIds: string[], obtained: boolean) {
  const current = new Set(get().families[family].obtained);
  for (const id of colourIds) obtained ? current.add(id) : current.delete(id);
  updateFamily(family, { obtained: [...current] });
}

export function togglePairingDone(family: MountFamilyId, index: number) {
  const done = new Set(get().families[family].done);
  done.has(index) ? done.delete(index) : done.add(index);
  updateFamily(family, { done: [...done] });
}

export function clearStable(family: MountFamilyId) {
  updateFamily(family, { draft: "", plan: null, done: [] });
  set({ lastCapture: null, status: "", error: "" });
}

/** Les noms du brouillon, un par ligne. */
export function draftNames(draft: string) {
  return draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Lit le brouillon : du JSON collé tel quel, sinon chaque mot compte, pour signaler ceux qui ne sont pas des noms. */
export function readStableDraft(draft: string, family: MountFamilyId) {
  const text = draft.trim();
  const entries = /^[[{`]/.test(text) ? text : JSON.stringify(text.split(/[\s,;]+/).filter(Boolean));
  return readMountList(entries, getMountFamily(family));
}

async function upscaledForOcr(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width >= UPSCALE_BELOW_WIDTH) return file;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * 2;
    canvas.height = bitmap.height * 2;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png"));
  } catch {
    return file;
  }
}

/** Lit une capture de l'étable et ajoute ses noms au brouillon, sans recompter le raccord avec la précédente. */
export async function readStableImage(family: MountFamilyId, file: Blob) {
  set({ reading: true, error: "", status: "Lecture de la capture…" });
  try {
    const image = await upscaledForOcr(file);
    let response: Response;
    try {
      response = await fetch(OCR_TEXT_PATH, { method: "POST", headers: { "Content-Type": image.type || "image/png" }, body: image });
    } catch {
      throw new Error("serveur OCR indisponible ; relance start-runes-ocr.ps1");
    }
    if (response.status === 404) throw new Error("serveur OCR obsolète ; arrête-le puis relance start-runes-ocr.ps1");
    const payload = (await response.json().catch(() => null)) as { lines?: OcrLine[]; error?: string } | null;
    if (!response.ok || !payload) throw new Error(payload?.error || `erreur HTTP ${response.status}`);

    const reading = readStableCapture(payload.lines ?? [], getMountFamily(family));
    const existing = draftNames(get().families[family].draft);
    const { names, overlap } = appendCapture(existing, reading.names);
    updateFamily(family, { draft: names.join("\n") });
    const added = names.length - existing.length;
    set({
      lastCapture: { added, overlap, corrected: reading.corrected, unreadable: reading.unreadable },
      status: reading.names.length
        ? `${added} monture${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}${overlap ? `, ${overlap} déjà vue${overlap > 1 ? "s" : ""} au raccord` : ""}.`
        : "Aucun nom de monture lu sur cette capture.",
    });
  } catch (error) {
    set({ error: `OCR impossible : ${(error as Error).message}`, status: "" });
  } finally {
    set({ reading: false });
  }
}

/** Couleurs à faire naître en mode succès : toutes les G2+ pas encore obtenues. */
export function missingColours(family: MountFamilyId) {
  const obtained = new Set(get().families[family].obtained);
  return Object.fromEntries(
    getMountFamily(family)
      .colours.filter((colour) => colour.generation >= 2 && !obtained.has(colour.id))
      .map((colour) => [colour.id, 1]),
  );
}

export async function computeStablePlan(family: MountFamilyId) {
  const state = get().families[family];
  const reading = readStableDraft(state.draft, family);
  if (reading.codes.length === 0) {
    set({ error: "Aucun nom de monture lisible dans l'étable." });
    return;
  }
  set({ computing: true, error: "" });
  try {
    const plan = await runPlanner({
      family,
      mounts: reading.codes,
      mode: state.mode,
      missing: state.mode === "success" ? missingColours(family) : {},
      avoidObtained: state.avoidObtained,
    });
    updateFamily(family, { plan, done: [] });
    set({ computing: false });
  } catch (error) {
    if (error instanceof PlannerCancelled) return;
    set({ computing: false, error: (error as Error).message });
  }
}
