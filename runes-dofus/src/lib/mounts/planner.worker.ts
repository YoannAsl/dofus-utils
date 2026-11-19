import { planStable, PlannerError, type PlannerInput } from "@/lib/mounts/planner";

// Le PL peut prendre plusieurs secondes sur une grande étable : il tourne hors du fil de la page.
self.onmessage = (event: MessageEvent<PlannerInput>) => {
  try {
    self.postMessage({ plan: planStable(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof PlannerError ? error.message : "Le calcul a échoué." });
  }
};
