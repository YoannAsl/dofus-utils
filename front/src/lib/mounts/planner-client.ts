import type { PlannerInput, StablePlan } from "@/lib/mounts/planner";

export class PlannerCancelled extends Error {}

let cancelRunning: (() => void) | null = null;

export function runPlanner(input: PlannerInput): Promise<StablePlan> {
  cancelRunning?.();
  const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const settle = () => {
      worker.terminate();
      if (cancelRunning === cancel) cancelRunning = null;
    };
    const cancel = () => {
      settle();
      reject(new PlannerCancelled());
    };
    cancelRunning = cancel;
    worker.onmessage = (event: MessageEvent<{ plan?: StablePlan; error?: string }>) => {
      settle();
      if (event.data.plan) resolve(event.data.plan);
      else reject(new Error(event.data.error ?? "Le calcul a échoué."));
    };
    worker.onerror = () => {
      settle();
      reject(new Error("Le calcul a échoué."));
    };
    worker.postMessage(input);
  });
}
