import { create } from "zustand";
import { readStorageString, writeStorage } from "@/lib/storage";

// Read by the inline script in index.html too, so the first paint already has the right theme.
const THEME_STORAGE_KEY = "dofus-theme";

export type ThemePreference = "light" | "dark" | "system";

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function isDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && darkScheme.matches);
}

interface ThemeState {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
}

const initialPreference = parsePreference(readStorageString(THEME_STORAGE_KEY));

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: initialPreference,
  resolved: isDark(initialPreference) ? "dark" : "light",
  setPreference: (preference) => {
    writeStorage(THEME_STORAGE_KEY, preference);
    set({ preference, resolved: isDark(preference) ? "dark" : "light" });
  },
}));

/** Keeps the `dark` class on <html> in sync with the preference and, in system mode, the OS setting. */
export function startThemeSync() {
  const apply = () => {
    const { preference } = useThemeStore.getState();
    const resolved = isDark(preference) ? "dark" : "light";
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
    if (useThemeStore.getState().resolved !== resolved) useThemeStore.setState({ resolved });
  };
  apply();
  darkScheme.addEventListener("change", apply);
  useThemeStore.subscribe(apply);
}
