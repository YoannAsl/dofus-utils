import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { itemImage, type DofusItem } from "@/lib/dofusdb";
import { formatMoney, plural } from "@/lib/format";
import type { Decision } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** DofusDB icon that disappears instead of showing a broken image. */
export function ItemIcon({ item, src, className }: { item?: Pick<DofusItem, "img" | "iconId">; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = src ?? (item ? itemImage(item) : null);
  if (!url || failed) return null;
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("size-8 shrink-0 object-contain", className)} />;
}

export async function copyText(name: string) {
  try {
    await navigator.clipboard.writeText(name);
    toast.success(`Nom copié · ${name}`);
  } catch {
    toast.error("Impossible de copier le nom.");
  }
}

/** An item name that copies itself, to paste in the in-game market search. */
export function CopyName({ name, className }: { name: string; className?: string }) {
  return (
    <button
      type="button"
      title="Copier le nom"
      aria-label={`Copier ${name}`}
      onClick={() => copyText(name)}
      className={cn("text-left font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none", className)}
    >
      {name}
    </button>
  );
}

export function Gain({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <>-</>;
  return (
    <span className={cn("font-medium tabular-nums", value > 0 && "text-success", value < 0 && "text-destructive")}>
      {value > 0 ? "+" : ""}
      {formatMoney(value)} k
    </span>
  );
}

const decisionClasses: Record<Decision, string> = {
  craft: "bg-success-muted text-success",
  buy: "bg-info-muted text-info",
  neutral: "bg-muted text-muted-foreground",
  missing: "bg-warning-muted text-warning",
};

export function DecisionBadge({ decision, children }: { decision: Decision; children: ReactNode }) {
  return <Badge className={decisionClasses[decision]}>{children}</Badge>;
}

export function MissingBadge({ missing }: { missing: number }) {
  if (!missing) return null;
  return (
    <Badge className={cn(decisionClasses.missing, "ml-1.5")}>
      {missing} prix {plural(missing, "manquant")}
    </Badge>
  );
}

export function Metric({ label, value, meta }: { label: string; value: ReactNode; meta?: ReactNode }) {
  return (
    <Card size="sm" className="gap-1">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <strong className="text-lg leading-tight font-semibold">{value}</strong>
        {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : null}
      </CardContent>
    </Card>
  );
}

export function MetricGrid({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <section aria-label={label} className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, aside }: { title: string; description?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

/** Secondary line under a table cell's main value. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("block text-xs text-muted-foreground", className)}>{children}</span>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-6 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
