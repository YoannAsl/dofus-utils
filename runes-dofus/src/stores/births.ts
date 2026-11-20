import { toast } from "sonner";
import { create } from "zustand";
import { type BirthEvent, type BirthReading, readBirth } from "@/lib/mounts/birth-reading";
import { getMountFamily } from "@/lib/mounts/family";
import { afterPaste, type QueuedName, stepName } from "@/lib/mounts/name-queue";
import { pairingOrder } from "@/lib/mounts/plan-order";
import type { MountFamilyId } from "@/lib/mounts/types";
import { markPairingDone, useStableStore } from "@/stores/stable";

const BIRTHS_PATH = "/api/births";
const CLIPBOARD_PATH = "/api/clipboard";
const RETRY_MS = 3000;
const LOG_SIZE = 8;

/** Ce que fait le serveur OCR pendant qu'on écoute : il regarde Dofus, ou attend qu'il passe devant. */
export type WatchStatus = "connecting" | "watching" | "no-window" | "offline" | "outdated" | "error";

export interface LoggedBirth {
  id: number;
  family: MountFamilyId;
  reading: BirthReading | null;
  error: string | null;
  /** Le nom copié, quand le sexe était lisible et la copie a marché. */
  copied: string | null;
}

interface BirthState {
  watching: boolean;
  status: WatchStatus;
  detail: string;
  log: LoggedBirth[];
  /** Le nom que l'app a mis dans le presse-papiers, et qu'un collage dans Dofus fera passer au suivant. */
  queued: QueuedName | null;
}

/** Ce que le serveur OCR voit dans Dofus : une naissance, un nom collé, ou F8 / Maj+F8. */
type WatchEvent = ({ type: "birth" } & BirthEvent) | { type: "paste"; text: string } | { type: "next" | "previous" };

export const useBirthStore = create<BirthState>(() => ({ watching: false, status: "connecting", detail: "", log: [], queued: null }));

const set = useBirthStore.setState;
let family: MountFamilyId = "dragodinde";
let controller: AbortController | null = null;
let nextId = 1;

/** Le serveur écrit le presse-papiers : un onglet en arrière-plan n'en a pas le droit. */
export async function copyToClipboard(name: string) {
  const response = await fetch(CLIPBOARD_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: name }) });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `erreur HTTP ${response.status}`);
  }
}

function planContext() {
  const stable = useStableStore.getState().families[family];
  const plan = stable.plan?.family === family ? stable.plan : null;
  if (!plan) return null;
  return { pairings: plan.pairings, order: pairingOrder(getMountFamily(family), plan.pairings), done: new Set(stable.done) };
}

async function queueName(next: QueuedName, quiet = false) {
  try {
    await copyToClipboard(next.name);
    set({ queued: next });
  } catch (error) {
    if (!quiet) toast.error(`Copie impossible : ${(error as Error).message}.`);
  }
}

/** F8 et Maj+F8 : le nom de parent suivant ou précédent. */
async function stepQueue(direction: 1 | -1, quiet = false) {
  const context = planContext();
  if (!context) return;
  const next = stepName(context.order, context.pairings, context.done, useBirthStore.getState().queued, direction);
  if (next) await queueName(next, quiet);
  else if (!quiet) toast.info("Tous les accouplements du plan sont faits.");
}

async function handlePaste(text: string) {
  const context = planContext();
  if (!context) return;
  const next = afterPaste(context.order, context.pairings, context.done, useBirthStore.getState().queued, text);
  if (next) await queueName(next);
}

/**
 * Un nom copié à la main dans la page : les collages suivants reprennent à partir de lui.
 * Un parent du plan reprend son accouplement ; un autre nom compte comme celui d'un petit.
 */
export function followCopiedName(id: MountFamilyId, code: string) {
  if (!useBirthStore.getState().watching || id !== family) return;
  const context = planContext();
  const index = context?.order.find((index) => !context.done.has(index) && context.pairings[index]!.pair.includes(code));
  if (index === undefined) set({ queued: { role: "baby", name: code, pairingIndex: null } });
  else set({ queued: { role: context!.pairings[index]!.pair[0] === code ? "male" : "female", name: code, pairingIndex: index } });
}

async function handleEvent(event: WatchEvent) {
  if (event.type === "birth") await handleBirth(event);
  else if (event.type === "paste") await handlePaste(event.text);
  else await stepQueue(event.type === "next" ? 1 : -1);
}

async function handleBirth(birth: BirthEvent) {
  const stable = useStableStore.getState().families[family];
  const plan = stable.plan?.family === family ? stable.plan : null;
  const result = readBirth(getMountFamily(family), birth, plan?.pairings, new Set(stable.done));
  const entry: LoggedBirth = { id: nextId++, family, reading: null, error: null, copied: null };

  if ("error" in result) {
    entry.error = `Naissance vue, mais ${result.error}.`;
    toast.error(entry.error);
  } else {
    entry.reading = result;
    if (result.pairingIndex !== null) markPairingDone(family, result.pairingIndex);
    if (result.sex) {
      const name = result.names[result.sex];
      try {
        await copyToClipboard(name);
        entry.copied = name;
        set({ queued: { role: "baby", name, pairingIndex: result.pairingIndex } });
        toast.success(`Nom copié · ${name}`);
      } catch (error) {
        entry.error = `Copie impossible : ${(error as Error).message}.`;
        toast.error(entry.error);
      }
    } else {
      entry.error = "Sexe du petit illisible : choisis le nom ci-dessous.";
      toast.warning(entry.error);
    }
  }
  set((state) => ({ log: [entry, ...state.log].slice(0, LOG_SIZE) }));
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * Chaque requête attend la prochaine naissance (jusqu'à 20 s) et garde le serveur en éveil.
 * Une requête réseau qui revient n'est pas ralentie dans un onglet en arrière-plan, au contraire des minuteurs.
 */
async function listen(signal: AbortSignal) {
  let cursor = "";
  while (!signal.aborted) {
    try {
      const response = await fetch(`${BIRTHS_PATH}?after=${encodeURIComponent(cursor)}`, { cache: "no-store", signal });
      if (response.status === 404) {
        set({ status: "outdated", detail: "" });
        return;
      }
      if (!response.ok) throw new Error(`erreur HTTP ${response.status}`);
      const payload = (await response.json()) as { cursor: string; events?: WatchEvent[]; status: string };
      // Un serveur d'avant les touches de Dofus renvoie « births » sans « events ».
      if (!Array.isArray(payload.events)) {
        set({ status: "outdated", detail: "" });
        return;
      }
      cursor = payload.cursor;
      const status = payload.status.startsWith("error")
        ? "error"
        : payload.status === "no-window"
          ? "no-window"
          : "watching";
      set({ status, detail: status === "error" ? payload.status.replace(/^error:\s*/, "") : "" });
      for (const event of payload.events) await handleEvent(event);
    } catch {
      if (signal.aborted) return;
      set({ status: "offline", detail: "" });
      await wait(RETRY_MS, signal);
    }
  }
}

export function setBirthWatchFamily(id: MountFamilyId) {
  family = id;
}

export function setBirthWatch(on: boolean, id: MountFamilyId) {
  family = id;
  controller?.abort();
  controller = null;
  if (on) {
    controller = new AbortController();
    set({ watching: true, status: "connecting", detail: "", queued: null });
    listen(controller.signal);
    // Le premier mâle à chercher est prêt avant même d'aller dans Dofus.
    void stepQueue(1, true);
  } else {
    set({ watching: false, queued: null });
  }
}
