import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ItemIcon, Meta } from "@/components/common";
import { Input } from "@/components/ui/input";
import { itemName, marketNamePattern, searchEquipment, type DofusItem } from "@/lib/dofusdb";

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

  const enabled = open && Boolean(marketNamePattern(term));
  const results = useQuery({
    queryKey: ["equipment", term],
    queryFn: ({ signal }) => searchEquipment(term, signal),
    enabled,
  });
  const pending = term !== value.trim().slice(0, 120) || results.isFetching;

  function select(item: DofusItem) {
    setOpen(false);
    onValueChange(itemName(item));
    onSelect(item);
  }

  return (
    <Popover open={open && Boolean(enabled || (pending && value.trim()))} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={container}>
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
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="max-h-80 w-(--radix-popover-trigger-width) gap-0 overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (container.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
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
      </PopoverContent>
    </Popover>
  );
}
