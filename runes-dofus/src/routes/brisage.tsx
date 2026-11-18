import { createFileRoute } from "@tanstack/react-router";
import { BrisageLog } from "@/components/brisage/brisage-log";
import { ShatterCalculator } from "@/components/brisage/shatter-calculator";
import { PageHeader } from "@/components/common";

export const Route = createFileRoute("/brisage")({
  component: BrisagePage,
});

function BrisagePage() {
  return (
    <>
      <PageHeader
        title="Rentabilité du brisage"
        description="Choisis un objet pour estimer les runes obtenues avec et sans focus, à partir de tes prix de runes."
      />
      <ShatterCalculator />
      <div className="mt-4 flex flex-col gap-5">
        <BrisageLog />
      </div>
    </>
  );
}
