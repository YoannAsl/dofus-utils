import { copyText } from "@/components/common";
import { colourLabel, type MountFamily } from "@/lib/mounts/family";
import { parseMountName } from "@/lib/mounts/names";
import { cn } from "@/lib/utils";

/** « Femelle · Pourpre-Orchidée · née de Pourpre × Orchidée » */
export function describeMount(family: MountFamily, code: string) {
  const mount = parseMountName(code, family);
  if (!mount) return null;
  const sex = mount.sex === "F" ? "Femelle" : "Mâle";
  const origin = mount.wild
    ? mount.sex === "F"
      ? "capturée"
      : "capturé"
    : `${mount.sex === "F" ? "née" : "né"} de ${mount.parentIds.map((id) => colourLabel(family, id)).join(" × ")}`;
  return `${sex} · ${colourLabel(family, mount.colourId)} · ${origin}`;
}

/** Le nom à copier, avec dessous sa couleur et ses parents : « Amande · de Orchidée-Ébène × Pourpre-Ébène ». */
export function MountCell({ family, code }: { family: MountFamily; code: string }) {
  const mount = parseMountName(code, family);
  return (
    <span className="flex min-w-0 flex-col items-start">
      <MountCode family={family} code={code} className="-mx-1" />
      {mount ? (
        <span className="max-w-full truncate text-xs text-muted-foreground" title={describeMount(family, code) ?? undefined}>
          <span className="font-medium text-foreground/80">{colourLabel(family, mount.colourId)}</span>
          {mount.wild ? (mount.sex === "F" ? " · capturée" : " · capturé") : ` · de ${mount.parentIds.map((id) => colourLabel(family, id)).join(" × ")}`}
        </span>
      ) : null}
    </span>
  );
}

/** Nom de monture qui se copie, pour le chercher dans l'étable en jeu. */
export function MountCode({ family, code, className }: { family: MountFamily; code: string; className?: string }) {
  const description = describeMount(family, code);
  return (
    <button
      type="button"
      onClick={() => copyText(code)}
      title={description ? `${description} — cliquer pour copier` : "Copier le nom"}
      aria-label={`Copier ${code}${description ? ` (${description})` : ""}`}
      className={cn(
        "rounded-md px-1 font-mono text-sm font-semibold tracking-wide underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none",
        className,
      )}
    >
      {code}
    </button>
  );
}
