import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ThemePreference, useThemeStore } from "@/stores/theme";

const OPTIONS = [
  { value: "light", label: "Thème clair", Icon: SunIcon },
  { value: "dark", label: "Thème sombre", Icon: MoonIcon },
  { value: "system", label: "Thème du système", Icon: MonitorIcon },
] as const satisfies readonly { value: ThemePreference; label: string; Icon: unknown }[];

export function ThemeToggle() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={preference}
      onValueChange={(value) => value && setPreference(value as ThemePreference)}
      aria-label="Thème"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={value} aria-label={label}>
              <Icon />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
