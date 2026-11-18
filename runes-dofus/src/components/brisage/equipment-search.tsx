import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ItemIcon, Meta } from "@/components/common";
import { Input } from "@/components/ui/input";
import { itemName, marketNamePattern, searchEquipment, type DofusItem } from "@/lib/dofusdb";

/** Debounced DofusDB search over forgemageable equipment, shared by the calculator and the log form. */
export function EquipmentSearch({
  id,
  value,
  onValueChange,
  onSelect,
  placeholder,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (item: DofusItem) => void;
  placeholder?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(value.trim().slice(0, 120)), 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const enabled = open && Boolean(marketNamePattern(term));
  const results = useQuery({ queryKey: ["equipment", term], queryFn: ({ signal }) => searchEquipment(term, signal), enabled });
  const pending = term !== value.trim().slice(0, 120) || results.isFetching;

  function select(item: DofusItem) {
    setOpen(false);
    onValueChange(itemName(item));
    onSelect(item);
  }

  return (
    <div ref={container} className="relative">
      <Input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter") {
            event.preventDefault();
            const first = results.data?.[0];
            if (open && first && !pending) select(first);
          }
        }}
      />
      {enabled || (open && pending && value.trim()) ? (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 flex max-h-80 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {pending ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Recherche…</p>
          ) : results.isError ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Catalogue DofusDB indisponible.</p>
          ) : !results.data?.length ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucun équipement trouvé.</p>
          ) : (
            results.data.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <ItemIcon item={item} className="size-7" />
                <span className="flex-1">{itemName(item)}</span>
                <Meta>Niv. {item.level ?? "–"}</Meta>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
