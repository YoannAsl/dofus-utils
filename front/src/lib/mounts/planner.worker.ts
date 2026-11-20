import { planStable, PlannerError, type PlannerInput } from "@/lib/mounts/planner";

self.onmessage = (event: MessageEvent<PlannerInput>) => {
  try {
    self.postMessage({ plan: planStable(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof PlannerError ? error.message : "Le calcul a échoué." });
  }
};
