import { create } from "zustand";
import { trackReading, type FmReading, type TrackedItem } from "@/lib/smithmagic";

const SMITHMAGIC_PATH = "/api/smithmagic";
const RETRY_MS = 3000;

export type ForgeStatus = "connecting" | "watching" | "no-window" | "no-forge" | "offline" | "error";

interface SmithmagicState {
  status: ForgeStatus;
  detail: string;
  item: TrackedItem | null;
}

export const useSmithmagicStore = create<SmithmagicState>(() => ({ status: "connecting", detail: "", item: null }));

function toStatus(status: string): ForgeStatus {
  if (status === "watching" || status === "no-window" || status === "no-forge") return status;
  if (status.startsWith("error")) return "error";
  return "connecting";
}

export function startForgeWatch() {
  const controller = new AbortController();
  void (async () => {
    let cursor = "";
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${SMITHMAGIC_PATH}?after=${encodeURIComponent(cursor)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { cursor: string; status: string; reading: FmReading | null };
        cursor = payload.cursor;
        useSmithmagicStore.setState((state) => ({
          status: toStatus(payload.status),
          detail: payload.status,
          item: payload.reading ? trackReading(state.item, payload.reading) : state.item,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        useSmithmagicStore.setState({ status: "offline", detail: (error as Error).message });
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }
  })();
  return () => controller.abort();
}
