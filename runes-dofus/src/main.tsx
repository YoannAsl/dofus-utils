import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// DofusDB data changes with game updates only: keep it for the whole session.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () => document.documentElement.classList.toggle("dark", darkScheme.matches);
applyScheme();
darkScheme.addEventListener("change", applyScheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
