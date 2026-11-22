import { toast } from "sonner";
import { create } from "zustand";
import { type BirthEvent, type BirthReading, readBirth } from "@/lib/mounts/birth-reading";
import { getMountFamily } from "@/lib/mounts/family";
import { afterPaste, type QueuedName, stepName } from "@/lib/mounts/name-queue";
import { pairingOrder } from "@/lib/mounts/plan-order";
import type { MountFamilyId } from "@/lib/mounts/types";
import { markPairingDone, togglePairingDone, useStableStore } from "@/stores/stable";

const BIRTHS_PATH = "/api/births";
const CLIPBOARD_PATH = "/api/clipboard";
const RETRY_MS = 3000;
const LOG_SIZE = 8;

export type WatchStatus = "connecting" | "watching" | "no-window" | "offline" | "outdated" | "error";

export interface LoggedBirth {
  id: number;
  family: MountFamilyId;
  reading: BirthReading | null;
  error: string | null;
  copied: string | null;
}

interface BirthState {
  watching: boolean;
  status: WatchStatus;
  detail: string;
  log: LoggedBirth[];
  queued: QueuedName | null;
}

type WatchEvent = ({ type: "birth" } & BirthEvent) | { type: "paste"; text: string } | { type: "next" | "previous" };

export const useBirthStore = create<BirthState>(() => ({ watching: false, status: "connecting", detail: "", log: [], queued: null }));

const set = useBirthStore.setState;
let family: MountFamilyId = "dragodinde";
let controller: AbortController | null = null;
let nextId = 1;

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

async function stepQueue(direction: 1 | -1, quiet = false) {
  const context = planContext();
  if (!context) return;
  const next = stepName(context.order, context.pairings, context.done, useBirthStore.getState().queued, direction);
  if (next) await queueName(next, quiet);
  else if (!quiet) toast.info("Tous les accouplements du plan sont faits.");
}

let litter = { id: "", copied: null as string | null, waiting: [] as string[] };

async function handlePaste(text: string) {
  const queued = useBirthStore.getState().queued;
  if (queued?.role === "baby" && queued.name === text && litter.waiting.length) {
    const name = litter.waiting.shift()!;
    litter.copied = name;
    await queueName({ role: "baby", name, pairingIndex: queued.pairingIndex });
    toast.success(`Nom du jumeau copié · ${name}`);
    return;
  }
  const context = planContext();
  if (!context) return;
  const next = afterPaste(context.order, context.pairings, context.done, useBirthStore.getState().queued, text);
  if (next) await queueName(next);
}

export function followCopiedName(id: MountFamilyId, code: string, slot?: { pairingIndex: number; role: "male" | "female" }) {
  if (!useBirthStore.getState().watching || id !== family) return;
  const context = planContext();
  if (slot && context && !context.done.has(slot.pairingIndex)) {
    set({ queued: { ...slot, name: code } });
    return;
  }
  const index = context?.order.find((index) => !context.done.has(index) && context.pairings[index]!.pair.includes(code));
  if (index === undefined) set({ queued: { role: "baby", name: code, pairingIndex: null } });
  else set({ queued: { role: context!.pairings[index]!.pair[0] === code ? "male" : "female", name: code, pairingIndex: index } });
}

async function handleEvent(event: WatchEvent) {
  if (event.type === "birth") await handleBirth(event);
  else if (event.type === "paste") await handlePaste(event.text);
  else await stepQueue(event.type === "next" ? 1 : -1);
}

const seenCards = new Map<string, { logId: number; pairingIndex: number | null; ticked: boolean }>();

async function handleBirth(birth: BirthEvent) {
  const stable = useStableStore.getState().families[family];
  const plan = stable.plan?.family === family ? stable.plan : null;
  const seen = birth.card ? seenCards.get(birth.card) : undefined;
  const done = new Set(stable.done);
  let active = useBirthStore.getState().queued?.pairingIndex ?? null;
  if (seen && seen.pairingIndex !== null) {
    done.delete(seen.pairingIndex);
    active = seen.pairingIndex;
  }
  const result = readBirth(getMountFamily(family), birth, plan?.pairings, done, active);
  const entry: LoggedBirth = { id: seen?.logId ?? nextId++, family, reading: null, error: null, copied: null };

  if ("error" in result) {
    entry.error = `Naissance vue, mais ${result.error}.`;
    toast.error(entry.error);
  } else {
    entry.reading = result;
    const index = result.pairingIndex;
    if (seen?.ticked && seen.pairingIndex !== null && seen.pairingIndex !== index) togglePairingDone(family, seen.pairingIndex);
    const ticked = index !== null && (seen?.pairingIndex === index ? seen.ticked : !stable.done.includes(index));
    if (birth.card) seenCards.set(birth.card, { logId: entry.id, pairingIndex: index, ticked });
    if (index !== null) markPairingDone(family, index);
    if (birth.litter !== litter.id) litter = { id: birth.litter ?? "", copied: null, waiting: [] };
    const twin = result.sex && litter.id && litter.copied && litter.copied !== result.names[result.sex] ? litter.copied : null;
    if (result.sex && twin) {
      const name = result.names[result.sex];
      litter.waiting.push(name);
      entry.error = `Jumeau : ${name} sera copié quand tu auras collé ${twin}.`;
      toast.info(entry.error);
    } else if (result.sex) {
      const name = result.names[result.sex];
      try {
        await copyToClipboard(name);
        entry.copied = name;
        if (litter.id) litter.copied = name;
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
  set((state) => ({ log: [entry, ...state.log.filter((logged) => logged.id !== entry.id)].slice(0, LOG_SIZE) }));
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

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
    void stepQueue(1, true);
  } else {
    set({ watching: false, queued: null });
  }
}
