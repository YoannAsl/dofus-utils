import type { QueryClient } from "@tanstack/react-query";
import { fetchRecipe, type DofusItem } from "@/lib/dofusdb";
import { calculateRecipeCost } from "@/lib/pricing";
import { getPrice } from "@/stores/prices";

export async function fetchCraftCost(queryClient: QueryClient, item: DofusItem) {
  if (!item.hasRecipe) return null;
  try {
    const recipe = await queryClient.fetchQuery({ queryKey: ["recipe", item.id], queryFn: ({ signal }) => fetchRecipe(item.id, signal) });
    const cost = calculateRecipeCost(recipe, getPrice);
    return cost.missing || cost.total <= 0 ? null : Math.round(cost.total);
  } catch {
    return null;
  }
}
