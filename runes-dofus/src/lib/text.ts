export type LocalizedName = string | { fr?: string; en?: string; id?: string } | null | undefined;

export function localizedName(value: LocalizedName) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.fr || value.en || value.id || "";
}

export function normalizeText(value: unknown) {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
