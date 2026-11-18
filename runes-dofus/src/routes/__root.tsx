import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { firstImageFile, OcrPanel } from "@/components/ocr-panel";
import { PriceTools } from "@/components/price-tools";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { processOcrImage, setOcrMarketNavigator, startCapturePolling } from "@/stores/ocr";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const TOOLS = [
  { to: "/prix", label: "Prix & crafts" },
  { to: "/runes", label: "Prix des runes" },
  { to: "/items-fm", label: "Items FM" },
  { to: "/eklames", label: "Eklames" },
  { to: "/elevage", label: "Carburants d’élevage" },
] as const;

function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    setOcrMarketNavigator(() => navigate({ to: "/prix" }));
  }, [navigate]);

  // Captures pasted anywhere on the page go to the OCR panel.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const file =
        items.find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile() ??
        firstImageFile(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      processOcrImage(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // ShareX captures only arrive through the local OCR server.
  useEffect(() => {
    if (!["127.0.0.1", "localhost"].includes(window.location.hostname)) return;
    return startCapturePolling();
  }, []);

  return (
    <TooltipProvider>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Atelier Dofus</h1>
          <PriceTools />
        </header>

        <nav aria-label="Outils" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {TOOLS.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-background text-foreground shadow-sm", "aria-current": "page" }}
              >
                {tool.label}
              </Link>
            ))}
          </div>
        </nav>

        <OcrPanel />

        <section className="flex flex-col gap-5">
          <Outlet />
        </section>

        <footer className="mt-4 flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
          <p>
            Les prix sont enregistrés dans ce navigateur. Les calculs excluent les taxes HDV et utilisent 3 runes du palier inférieur par craft. Un
            double-clic sur une Eklame donne 2 Eklames du palier inférieur.
          </p>
          <p>Données issues de DofusDB. Utilisation soumise à la LPNC-IA 1.0.</p>
        </footer>
      </main>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
