import { BREEDING_FUELS } from "@/data/breeding";
import { localizedName, normalizeText, type LocalizedName } from "@/lib/text";

export const DOFUSDB_API_BASE = "https://api.dofusdb.fr";
export const MARKET_PAGE_SIZE = 50;
const MARKET_ITEM_FIELDS = ["id", "name.fr", "level", "typeId", "hasRecipe", "img", "iconId"];

export interface DofusEffect {
  effectId: number;
  from: number;
  to: number;
  characteristic: number;
}

export interface DofusItem {
  id: number;
  name?: LocalizedName;
  level?: number | null;
  typeId?: number;
  type?: { name?: LocalizedName };
  hasRecipe?: boolean;
  img?: string;
  iconId?: number | null;
  effects?: DofusEffect[];
}

export interface DofusItemType {
  id: number;
  categoryId: number;
  name?: LocalizedName;
}

interface Page<T> {
  data: T[];
  total: number;
  limit?: number;
}

export const FM_JOB_GROUPS = [
  { id: "all", label: "Tous métiers FM", typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 19, 82] },
  { id: "jeweller", label: "Joaillomage", typeIds: [1, 9] },
  { id: "shoemaker", label: "Cordomage", typeIds: [10, 11] },
  { id: "tailor", label: "Costumage", typeIds: [16, 17] },
  { id: "smith", label: "Forgemage armes", typeIds: [5, 6, 7, 8, 19] },
  { id: "carver", label: "Sculptemage", typeIds: [2, 3, 4] },
  { id: "shield", label: "Façomage", typeIds: [82] },
] as const;
export type FmJobId = (typeof FM_JOB_GROUPS)[number]["id"];

function query(path: string, fields: readonly string[] = []) {
  const url = new URL(`${DOFUSDB_API_BASE}/${path}`);
  fields.forEach((field, index) => url.searchParams.set(`$select[${index}]`, field));
  return url;
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`DofusDB HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function itemName(item: Pick<DofusItem, "id" | "name">) {
  return localizedName(item.name) || `Objet n°${item.id}`;
}

export function itemImage(item: Pick<DofusItem, "img" | "iconId">) {
  if (item.img && !String(item.img).includes("undefined")) return item.img;
  if (item.iconId) return `${DOFUSDB_API_BASE}/img/items/${item.iconId}.png`;
  return `${DOFUSDB_API_BASE}/img/items/1.png`;
}

export function marketNamePattern(value: string) {
  const parts = normalizeText(value).match(/[a-z0-9œæ]+/g) || [];
  return parts.map((part) => part.replace(/oe|œ/g, "(?:oe|œ)").replace(/ae|æ/g, "(?:ae|æ)")).join("[^a-z0-9œæ]*");
}

export async function fetchItemTypes(signal?: AbortSignal) {
  const url = query("item-types", ["id", "categoryId", "name.fr"]);
  url.searchParams.set("$sort[id]", "1");
  url.searchParams.set("$limit", String(MARKET_PAGE_SIZE));
  const types: DofusItemType[] = [];
  let total: number;
  do {
    url.searchParams.set("$skip", String(types.length));
    const page = await fetchJson<Page<DofusItemType>>(url, signal);
    if (!Array.isArray(page.data) || (!page.data.length && types.length < page.total)) {
      throw new Error("Types d’objets incomplets");
    }
    types.push(...page.data);
    total = page.total;
  } while (types.length < total);
  return types;
}

export type MarketCategory = "market" | "0" | "2" | "all";

export function typesForCategory(types: DofusItemType[], category: MarketCategory) {
  if (category === "all") return types;
  const categories = category === "market" ? [0, 2] : [Number(category)];
  return types.filter((type) => categories.includes(type.categoryId));
}

export async function searchMarketItems(
  { search, typeIds, page }: { search: string; typeIds: number[] | null; page: number },
  signal?: AbortSignal,
) {
  const url = query("items", MARKET_ITEM_FIELDS);
  url.searchParams.set("$sort[id]", "-1");
  url.searchParams.set("$limit", String(MARKET_PAGE_SIZE));
  url.searchParams.set("$skip", String(page * MARKET_PAGE_SIZE));
  if (/^\d+$/.test(search)) {
    url.searchParams.set("id", search);
  } else if (search) {
    const pattern = marketNamePattern(search);
    if (pattern) url.searchParams.set("slug.fr[$regex]", pattern);
  }
  if (typeIds?.length === 1) url.searchParams.set("typeId", String(typeIds[0]));
  else if (typeIds) for (const id of typeIds) url.searchParams.append("typeId[$in][]", String(id));
  return fetchJson<Page<DofusItem>>(url, signal);
}

export async function searchEquipment(name: string, signal?: AbortSignal) {
  const pattern = marketNamePattern(name.trim().slice(0, 120));
  if (!pattern) return [];
  const url = query("items", MARKET_ITEM_FIELDS);
  url.searchParams.set("$limit", "8");
  url.searchParams.set("$sort[level]", "-1");
  url.searchParams.set("slug.fr[$regex]", pattern);
  for (const typeId of FM_JOB_GROUPS[0].typeIds) url.searchParams.append("typeId[$in][]", String(typeId));
  return (await fetchJson<Page<DofusItem>>(url, signal)).data;
}

export async function searchCraftableItems(name: string, signal?: AbortSignal) {
  const pattern = marketNamePattern(name.trim().slice(0, 120));
  if (!pattern) return [];
  const url = query("items", MARKET_ITEM_FIELDS);
  url.searchParams.set("$limit", "8");
  url.searchParams.set("$sort[level]", "-1");
  url.searchParams.set("hasRecipe", "true");
  url.searchParams.set("slug.fr[$regex]", pattern);
  return (await fetchJson<Page<DofusItem>>(url, signal)).data;
}

export async function fetchItemWithEffects(id: number, signal?: AbortSignal) {
  return fetchJson<DofusItem>(query(`items/${id}`, ["id", "name.fr", "level", "typeId", "img", "iconId", "effects"]), signal);
}

export interface Recipe {
  ingredients: DofusItem[];
  ingredientIds: number[];
  quantities: number[];
}

export async function fetchRecipe(id: number, signal?: AbortSignal) {
  const recipe = await fetchJson<Recipe>(query(`recipes/${id}`), signal);
  if (
    !recipe.ingredientIds.length ||
    recipe.ingredientIds.length !== recipe.quantities.length ||
    recipe.quantities.some((quantity) => !Number.isInteger(quantity) || quantity <= 0)
  ) {
    throw new Error("Recette incomplète");
  }
  const ingredientsById = new Map(recipe.ingredients.map((entry) => [entry.id, entry]));
  return recipe.ingredientIds.map((ingredientId, index) => ({
    id: ingredientId,
    quantity: recipe.quantities[index]!,
    item: ingredientsById.get(ingredientId) ?? { id: ingredientId },
  }));
}

export async function fetchItemsForType(typeId: number, signal?: AbortSignal) {
  const items: DofusItem[] = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total) {
    const url = query("items", ["id", "name", "level", "typeId", "type", "effects", "img", "iconId"]);
    url.searchParams.set("$limit", String(MARKET_PAGE_SIZE));
    url.searchParams.set("$skip", String(skip));
    url.searchParams.set("typeId", String(typeId));
    url.searchParams.set("$sort[level]", "1");
    const payload = await fetchJson<Page<DofusItem>>(url, signal);
    const page = Array.isArray(payload.data) ? payload.data : [];
    total = Number(payload.total) || 0;
    items.push(...page);
    const step = Number(payload.limit) || MARKET_PAGE_SIZE;
    if (!page.length || step <= 0) break;
    skip += step;
  }
  return items;
}

export function misreadOePattern(value: string) {
  const parts = normalizeText(value).match(/[a-z0-9œæ]+/g) || [];
  return parts
    .map((part) => {
      const pattern = marketNamePattern(part);
      return /^(?:ce|c|g)[a-z]/.test(part) ? pattern.replace(/^(ce|c|g)/, "(?:oe|œ|$1)") : pattern;
    })
    .join("[^a-z0-9œæ]*");
}

export async function findMarketOcrItems(name: string | null | undefined): Promise<DofusItem[]> {
  const pattern = marketNamePattern(name || "");
  if (!pattern) return [];
  const items = await findMarketItemsByPattern(pattern);
  if (items.length) return items;
  const fallback = misreadOePattern(name || "");
  return fallback === pattern ? [] : findMarketItemsByPattern(fallback);
}

async function findMarketItemsByPattern(pattern: string): Promise<DofusItem[]> {
  const allFuels = Object.values(BREEDING_FUELS).flat();
  for (const fuelName of [new RegExp(`^${pattern}[a-z0-9œæ]*$`), new RegExp(`^${pattern}`)]) {
    const fuels = allFuels.filter((fuel) => fuelName.test(normalizeText(fuel.name)));
    if (fuels.length) return fuels;
  }

  const url = query("items", MARKET_ITEM_FIELDS);
  url.searchParams.set("$limit", String(MARKET_PAGE_SIZE));
  url.searchParams.set("slug.fr[$regex]", `^${pattern}$`);
  return (await fetchJson<Page<DofusItem>>(url)).data;
}
