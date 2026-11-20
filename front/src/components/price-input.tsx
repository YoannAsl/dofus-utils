import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { parsePrice } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { setPrice, usePrice } from "@/stores/prices";

/**
 * Edits the saved HDV price of an item. The price is saved when the field is left or on Enter,
 * not on every keystroke, so a half-typed value is never stored or wiped.
 */
export function PriceInput({
  itemId,
  className,
  ...props
}: { itemId: string | number } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const price = usePrice(itemId);
  const [draft, setDraft] = useState<string | null>(null);

  function commit(input: HTMLInputElement) {
    if (draft === null) return;
    const next = parsePrice(draft);
    if (next === null && draft.trim()) {
      input.setCustomValidity("Saisis un prix positif ou vide le champ.");
      input.reportValidity();
      return;
    }
    setPrice(itemId, next);
    setDraft(null);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="—"
      {...props}
      className={cn("h-8 w-28 tabular-nums", className)}
      value={draft ?? (price === null ? "" : String(price))}
      onChange={(event) => {
        event.currentTarget.setCustomValidity("");
        setDraft(event.currentTarget.value);
      }}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget);
        if (event.key === "Escape") {
          event.currentTarget.setCustomValidity("");
          setDraft(null);
        }
      }}
    />
  );
}
