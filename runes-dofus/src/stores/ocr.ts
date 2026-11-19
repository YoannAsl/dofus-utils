import { create } from "zustand";
import { isBreedingFuel } from "@/lib/breeding";
import { findMarketOcrItems, itemName, type DofusItem } from "@/lib/dofusdb";
import { formatMarketPrice } from "@/lib/format";
import { getOcrApplyPrice, getOcrMarketPrice, type OcrResult } from "@/lib/pricing";
import { parsePrice } from "@/lib/prices";
import { findRuneByOcrName, runeById, type Rune } from "@/lib/runes";
import { readStorageString, writeStorage } from "@/lib/storage";
import { setPrice } from "@/stores/prices";

const OCR_API_PATH = "/api/ocr";
const OCR_HEALTH_PATH = "/api/health";
const OCR_CAPTURES_PATH = "/api/captures";
const OCR_CAPTURE_CURSOR_KEY = "dofus-ocr-capture-cursor";

export type OcrTarget = Rune | DofusItem;

interface OcrState {
  open: boolean;
  loading: boolean;
  /** A capture is waiting for the user to apply or dismiss it; polling pauses meanwhile. */
  pending: boolean;
  status: string;
  result: OcrResult | null;
  previewUrl: string | null;
  targetId: string;
  /** Catalogue items matching the capture, offered as targets alongside runes. */
  items: DofusItem[];
  priceInput: string;
  updatedRuneId: string | null;
}

export const useOcrStore = create<OcrState>(() => ({
  open: false,
  loading: false,
  pending: false,
  status: "Colle une capture ou choisis un fichier.",
  result: null,
  previewUrl: null,
  targetId: "",
  items: [],
  priceInput: "",
  updatedRuneId: null,
}));

const set = useOcrStore.setState;
let requestToken = 0;
let deferredCaptureId: string | null = null;
let openMarket: () => void = () => {};

let imagePasteHandler: ((file: File | Blob) => void) | null = null;

/** Lets a page take pasted images for itself (the stable reader) instead of the price OCR. */
export function setImagePasteHandler(handler: (file: File | Blob) => void) {
  imagePasteHandler = handler;
  return () => {
    if (imagePasteHandler === handler) imagePasteHandler = null;
  };
}

export function handlePastedImage(file: File | Blob) {
  if (imagePasteHandler) imagePasteHandler(file);
  else processOcrImage(file);
}

/** Registers how to show the catalogue when a capture needs the user to pick its item. */
export function setOcrMarketNavigator(navigate: () => void) {
  openMarket = navigate;
}

export function getOcrTarget(state: OcrState): OcrTarget | null {
  return runeById.get(state.targetId) ?? state.items.find((item) => String(item.id) === state.targetId) ?? null;
}

export function getOcrItemPrice(result: OcrResult | null, id: string) {
  if (!isBreedingFuel(id)) return getOcrMarketPrice(result);
  // Fuels are priced per unit: only the ×1 lot is a usable price.
  const singleLot = result?.lots?.find((lot) => Number(lot.quantity) === 1);
  return parsePrice(singleLot?.total_price);
}

export function setOcrOpen(open: boolean) {
  set({ open });
}

export function setOcrPriceInput(priceInput: string) {
  set({ priceInput });
}

export function changeOcrTarget(id: string) {
  const { result, targetId, priceInput } = useOcrStore.getState();
  const refill = isBreedingFuel(id) !== isBreedingFuel(targetId);
  set({ targetId: id, priceInput: refill ? String(getOcrItemPrice(result, id) ?? "") : priceInput });
}

function acknowledgeCapture() {
  if (!deferredCaptureId) return;
  writeStorage(OCR_CAPTURE_CURSOR_KEY, deferredCaptureId);
  deferredCaptureId = null;
}

function applyPrice(target: OcrTarget, price: number) {
  const id = String(target.id);
  setPrice(id, price);
  acknowledgeCapture();
  set((state) => ({
    pending: false,
    updatedRuneId: runeById.has(id) ? id : state.updatedRuneId,
    status: `${itemName(target)} · ${formatMarketPrice(price)} k/u enregistré`,
  }));
}

export function applySelectedOcrPrice() {
  const state = useOcrStore.getState();
  const target = getOcrTarget(state);
  if (state.loading || !target || !state.result) return;
  const price = runeById.has(state.targetId) ? getOcrApplyPrice(state.result) : parsePrice(state.priceInput);
  if (price) applyPrice(target, price);
}

/** Makes a catalogue item the capture's target, from the item's detail panel. */
export function associateOcrItem(item: DofusItem) {
  const { result, loading, items } = useOcrStore.getState();
  if (!result || loading) return;
  set({ items: [item, ...items.filter((entry) => entry.id !== item.id)], open: true });
  changeOcrTarget(String(item.id));
}

export function dismissOcrCapture() {
  const { previewUrl } = useOcrStore.getState();
  acknowledgeCapture();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  set({ pending: false, result: null, targetId: "", items: [], previewUrl: null, status: "Capture ignorée." });
}

export function isImageFile(file: File | Blob | null | undefined): file is File | Blob {
  if (!file) return false;
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test((file as File).name || "");
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(String(payload?.error || `erreur HTTP ${response.status}`));
  if (!payload) throw new Error("reponse OCR invalide");
  return payload;
}

async function assertServerReady() {
  let response: Response;
  try {
    response = await fetch(OCR_HEALTH_PATH, { cache: "no-store" });
  } catch {
    throw new Error("serveur OCR indisponible; relance start-runes-ocr.ps1");
  }
  if (!response.ok) throw new Error("serveur OCR obsolète; arrête l'ancien serveur puis relance start-runes-ocr.ps1");
  const payload = await readJsonResponse(response);
  if (!payload?.ok) throw new Error("serveur OCR invalide; relance start-runes-ocr.ps1");
}

/** Reads a capture; applies the price directly when the item and price are unambiguous. */
export async function processOcrImage(file: File | Blob) {
  if (!isImageFile(file)) {
    set({ status: "Image requise pour l'OCR." });
    return false;
  }

  const token = ++requestToken;
  const { previewUrl } = useOcrStore.getState();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  set({
    open: true,
    loading: true,
    pending: false,
    status: "Lecture de la capture…",
    result: null,
    targetId: "",
    items: [],
    priceInput: "",
    previewUrl: URL.createObjectURL(file),
  });

  try {
    await assertServerReady();
    const response = await fetch(OCR_API_PATH, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const result = (await readJsonResponse(response)) as OcrResult;
    if (token !== requestToken) return false;

    const matchedRune = findRuneByOcrName(result.item_name);
    const matchedItems = matchedRune ? [] : await findMarketOcrItems(result.item_name).catch(() => []);
    if (token !== requestToken) return false;

    const target: OcrTarget | null = matchedRune ?? (matchedItems.length === 1 ? matchedItems[0]! : null);
    const targetId = target ? String(target.id) : "";
    const marketPrice = getOcrItemPrice(result, targetId);
    set({
      result,
      pending: true,
      items: matchedItems,
      targetId,
      status: target ? "Capture analysée." : "Choisis l’objet cible.",
      priceInput: String(marketPrice ?? ""),
    });

    if (!target) openMarket();

    const price = matchedRune ? getOcrApplyPrice(result) : marketPrice;
    if (target && price && !result.warnings?.length) applyPrice(target, price);
  } catch (error) {
    if (token !== requestToken) return false;
    set({ result: null, targetId: "", status: `OCR impossible: ${(error as Error).message}` });
  } finally {
    if (token === requestToken) set({ loading: false });
  }
  return true;
}

/**
 * Picks up ShareX captures posted to the local server. The cursor is only advanced once a
 * capture is applied or dismissed, so a capture is not lost if the page closes meanwhile.
 */
export function startCapturePolling() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function poll() {
    try {
      const { loading, pending } = useOcrStore.getState();
      if (loading || pending) return;
      acknowledgeCapture();
      const cursor = readStorageString(OCR_CAPTURE_CURSOR_KEY) || "";
      const response = await fetch(`${OCR_CAPTURES_PATH}?after=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (response.status !== 200) return;
      const captureId = response.headers.get("X-Capture-Id");
      if (!captureId) return;
      const image = await response.blob();
      const state = useOcrStore.getState();
      if (!state.loading && !state.pending && (await processOcrImage(image))) {
        deferredCaptureId = captureId;
        if (!useOcrStore.getState().pending) acknowledgeCapture();
      }
    } catch {
      // The local server may be stopped or restarting. Try again on the next poll.
    } finally {
      if (!stopped) timer = setTimeout(poll, 1000);
    }
  }

  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
