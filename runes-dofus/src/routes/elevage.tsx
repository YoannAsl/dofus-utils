import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { FUEL_CATEGORIES, FuelComparison } from "@/components/elevage/fuel-comparison";
import { PairCalculator } from "@/components/elevage/pair-calculator";
import { StablePlanner } from "@/components/elevage/stable-planner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getMountFamily, isMountFamilyId, MOUNT_FAMILY_IDS } from "@/lib/mounts/family";
import type { MountFamilyId } from "@/lib/mounts/types";

const TABS = ["etable", "couples", "carburants"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_FAMILY: MountFamilyId = "dragodinde";

interface ElevageSearch {
  tab?: Exclude<Tab, "etable">;
  family?: MountFamilyId;
  category?: string;
}

export const Route = createFileRoute("/elevage")({
  validateSearch: (search: Record<string, unknown>): ElevageSearch => ({
    tab: TABS.includes(search.tab as Tab) && search.tab !== "etable" ? (search.tab as ElevageSearch["tab"]) : undefined,
    family: isMountFamilyId(search.family) && search.family !== DEFAULT_FAMILY ? search.family : undefined,
    category: FUEL_CATEGORIES.includes(String(search.category)) && String(search.category) !== FUEL_CATEGORIES[0] ? String(search.category) : undefined,
  }),
  component: BreedingPage,
});

const DESCRIPTIONS: Record<Tab, string> = {
  etable: "Les couples à former pour avancer dans l’arbre, et les G1 à capturer.",
  couples: "Les naissances possibles d’un couple, et le nom à donner à chaque monture.",
  carburants: "Le coût du palier compte les unités entières pour passer du plafond précédent à celui du carburant.",
};

function BreedingPage() {
  const { tab = "etable", family: familyId = DEFAULT_FAMILY, category = FUEL_CATEGORIES[0]! } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const family = getMountFamily(familyId);
  const update = (change: Partial<ElevageSearch>) => navigate({ search: (previous) => ({ ...previous, ...change }), replace: true });

  return (
    <Tabs value={tab} onValueChange={(value) => update({ tab: value === "etable" ? undefined : (value as ElevageSearch["tab"]) })} className="gap-5">
      <PageHeader
        title="Élevage"
        description={DESCRIPTIONS[tab]}
        aside={
          tab === "carburants" ? null : (
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={familyId}
              onValueChange={(value) => value && update({ family: value === DEFAULT_FAMILY ? undefined : (value as MountFamilyId) })}
              aria-label="Famille de montures"
            >
              {MOUNT_FAMILY_IDS.map((id) => (
                <ToggleGroupItem key={id} value={id} className="px-3">
                  {getMountFamily(id).label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )
        }
      />
      <TabsList aria-label="Outils d’élevage">
        <TabsTrigger value="etable">Étable</TabsTrigger>
        <TabsTrigger value="couples">Couples</TabsTrigger>
        <TabsTrigger value="carburants">Carburants</TabsTrigger>
      </TabsList>
      <TabsContent value="etable" className="flex flex-col gap-5">
        <StablePlanner family={family} />
      </TabsContent>
      <TabsContent value="couples" className="flex flex-col gap-5">
        <PairCalculator family={family} />
      </TabsContent>
      <TabsContent value="carburants" className="flex flex-col gap-5">
        <FuelComparison category={category} onCategoryChange={(value) => update({ category: value === FUEL_CATEGORIES[0] ? undefined : value })} />
      </TabsContent>
    </Tabs>
  );
}
