const STORAGE_KEY = "dofus-rune-prices-v1";
const ITEM_PRICE_STORAGE_KEY = "dofus-fm-item-prices-v1";
const OCR_API_PATH = "/api/ocr";
const OCR_HEALTH_PATH = "/api/health";

const EFFECTS = {
  111: { label: "PA", unit: "PA", weight: 100, family: "Exo" },
  112: { label: "Dommages", unit: "Do", weight: 20, family: "Dommages" },
  115: { label: "Critique", unit: "Critique", weight: 10, family: "Combat" },
  117: { label: "Portée", unit: "PO", weight: 51, family: "Exo" },
  118: { label: "Force", unit: "Force", weight: 1, family: "Élémentaires" },
  119: { label: "Agilité", unit: "Agilité", weight: 1, family: "Élémentaires" },
  123: { label: "Chance", unit: "Chance", weight: 1, family: "Élémentaires" },
  124: { label: "Sagesse", unit: "Sagesse", weight: 3, family: "Élémentaires" },
  125: { label: "Vitalité", unit: "Vitalité", weight: 0.2, family: "Élémentaires" },
  126: { label: "Intelligence", unit: "Intelligence", weight: 1, family: "Élémentaires" },
  128: { label: "PM", unit: "PM", weight: 90, family: "Exo" },
  138: { label: "Puissance", unit: "Puissance", weight: 2, family: "Combat" },
  158: { label: "Pods", unit: "Pods", weight: 0.25, family: "Utilitaire" },
  160: { label: "Esquive PA", unit: "Ré PA", weight: 7, family: "Esquive" },
  161: { label: "Esquive PM", unit: "Ré PM", weight: 7, family: "Esquive" },
  174: { label: "Initiative", unit: "Initiative", weight: 0.1, family: "Utilitaire" },
  176: { label: "Prospection", unit: "Prospection", weight: 3, family: "Utilitaire" },
  178: { label: "Soins", unit: "Soins", weight: 10, family: "Combat" },
  182: { label: "Invocation", unit: "Invocation", weight: 30, family: "Exo" },
  210: { label: "Résistance % terre", unit: "% Terre", weight: 6, family: "Résistances %" },
  211: { label: "Résistance % eau", unit: "% Eau", weight: 6, family: "Résistances %" },
  212: { label: "Résistance % air", unit: "% Air", weight: 6, family: "Résistances %" },
  213: { label: "Résistance % feu", unit: "% Feu", weight: 6, family: "Résistances %" },
  214: { label: "Résistance % neutre", unit: "% Neutre", weight: 6, family: "Résistances %" },
  220: { label: "Dommages renvoyés", unit: "Do renvoyés", weight: 5, family: "Dommages" },
  225: { label: "Dommages pièges", unit: "Do pièges", weight: 5, family: "Dommages" },
  226: { label: "Puissance pièges", unit: "Puissance pièges", weight: 2, family: "Dommages" },
  240: { label: "Résistance terre", unit: "Ré terre", weight: 2, family: "Résistances fixes" },
  241: { label: "Résistance eau", unit: "Ré eau", weight: 2, family: "Résistances fixes" },
  242: { label: "Résistance air", unit: "Ré air", weight: 2, family: "Résistances fixes" },
  243: { label: "Résistance feu", unit: "Ré feu", weight: 2, family: "Résistances fixes" },
  244: { label: "Résistance neutre", unit: "Ré neutre", weight: 2, family: "Résistances fixes" },
  410: { label: "Retrait PA", unit: "Ret PA", weight: 7, family: "Retrait" },
  412: { label: "Retrait PM", unit: "Ret PM", weight: 7, family: "Retrait" },
  414: { label: "Dommages poussée", unit: "Do poussée", weight: 5, family: "Dommages" },
  416: { label: "Résistance poussée", unit: "Ré poussée", weight: 2, family: "Résistances fixes" },
  418: { label: "Dommages critiques", unit: "Do crit", weight: 5, family: "Dommages" },
  420: { label: "Résistance critique", unit: "Ré crit", weight: 2, family: "Résistances fixes" },
  422: { label: "Dommages terre", unit: "Do terre", weight: 5, family: "Dommages" },
  424: { label: "Dommages feu", unit: "Do feu", weight: 5, family: "Dommages" },
  426: { label: "Dommages eau", unit: "Do eau", weight: 5, family: "Dommages" },
  428: { label: "Dommages air", unit: "Do air", weight: 5, family: "Dommages" },
  430: { label: "Dommages neutre", unit: "Do neutre", weight: 5, family: "Dommages" },
  752: { label: "Fuite", unit: "Fuite", weight: 4, family: "Tacle/Fuite" },
  753: { label: "Tacle", unit: "Tacle", weight: 4, family: "Tacle/Fuite" },
  795: { label: "Chasse", unit: "Chasse", weight: 0, family: "Spécial" },
  2800: { label: "Dommages % mêlée", unit: "% mêlée", weight: 15, family: "Dommages %" },
  2803: { label: "Résistance % mêlée", unit: "% mêlée", weight: 15, family: "Résistances %" },
  2804: { label: "Dommages % distance", unit: "% distance", weight: 15, family: "Dommages %" },
  2807: { label: "Résistance % distance", unit: "% distance", weight: 15, family: "Résistances %" },
  2808: { label: "Dommages % arme", unit: "% arme", weight: 15, family: "Dommages %" },
  2812: { label: "Dommages % sort", unit: "% sort", weight: 15, family: "Dommages %" },
};

const state = {
  prices: loadPrices(),
  itemPrices: loadItemPrices(),
  search: "",
  family: "all",
  decision: "all",
  sort: "targetCost",
  itemFinder: {
    runeId: null,
    job: "all",
    minLevel: "",
    maxLevel: "",
    search: "",
    sort: "potential",
    candidates: [],
    searched: false,
    loading: false,
    status: "Recherche prête.",
  },
  ocr: {
    loading: false,
    status: "Colle ou depose une capture HDV.",
    result: null,
    previewUrl: null,
    selectedRuneId: "",
    updatedRuneId: null,
    appliedPrice: null,
    appliedLot: null,
  },
};

const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const moneyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const XP_RATIO_DISPLAY_SCALE = 1000;
const XP_TARGET_DENSITY = 1000;
const DOFUSDB_API_BASE = "https://api.dofusdb.fr";
const ITEM_PAGE_SIZE = 50;
const ITEM_RESULT_LIMIT = 40;
const ITEM_SELECT_FIELDS = ["id", "name", "level", "typeId", "type", "effects", "img", "iconId"];
const FM_JOB_GROUPS = [
  { id: "all", label: "Tous métiers FM", typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 19, 82] },
  { id: "jeweller", label: "Joaillomage", typeIds: [1, 9] },
  { id: "shoemaker", label: "Cordomage", typeIds: [10, 11] },
  { id: "tailor", label: "Costumage", typeIds: [16, 17] },
  { id: "smith", label: "Forgemage armes", typeIds: [5, 6, 7, 8, 19] },
  { id: "carver", label: "Sculptemage", typeIds: [2, 3, 4] },
  { id: "shield", label: "Façomage", typeIds: [82] },
];

const runes = window.RUNE_DATA.map(enrichRune);
const xpRunes = runes
  .filter((rune) => rune.density > 0)
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));
const familyMap = buildFamilyMap(runes);
const runeById = new Map(runes.map((rune) => [String(rune.id), rune]));
const itemTypeCache = new Map();
let itemSearchToken = 0;
let activeRuneResultIndex = -1;
let ocrRequestToken = 0;

state.itemFinder.runeId = getDefaultItemRuneId();

function enrichRune(rune) {
  const tier = parseTier(rune.name);
  const effect = EFFECTS[rune.effectId] || {
    label: "Effet inconnu",
    unit: "effet",
    weight: 0,
    family: "Autres",
  };
  const density = round2((Number(rune.value) || 0) * effect.weight);
  return {
    ...rune,
    ...tier,
    effect,
    density,
  };
}

function parseTier(name) {
  const clean = name.replace(/^Rune\s+/, "").trim();
  if (clean.startsWith("Pa ")) {
    return { tier: "pa", tierRank: 2, tierLabel: "Pa", baseName: clean.slice(3) };
  }
  if (clean.startsWith("Ra ")) {
    return { tier: "ra", tierRank: 3, tierLabel: "Ra", baseName: clean.slice(3) };
  }
  return { tier: "simple", tierRank: 1, tierLabel: "Simple", baseName: clean };
}

function buildFamilyMap(items) {
  const map = new Map();
  for (const rune of items) {
    if (!map.has(rune.baseName)) map.set(rune.baseName, new Map());
    map.get(rune.baseName).set(rune.tierRank, rune);
  }
  return map;
}

function getDefaultItemRuneId() {
  const paSo = runes.find((rune) => rune.name === "Rune Pa So");
  const firstXpRune = runes.find((rune) => rune.density > 0);
  return String((paSo || firstXpRune || runes[0]).id);
}

function loadPrices() {
  return loadStoredMap(STORAGE_KEY);
}

function loadItemPrices() {
  return loadStoredMap(ITEM_PRICE_STORAGE_KEY);
}

function loadStoredMap(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrices() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prices));
  $("#saveStatus").textContent = "Sauvegardé localement à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function saveItemPrices() {
  localStorage.setItem(ITEM_PRICE_STORAGE_KEY, JSON.stringify(state.itemPrices));
}

function priceOf(rune) {
  const price = Number(state.prices[rune.id]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parsePrice(value) {
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function getAcquisition(rune) {
  const directPrice = priceOf(rune);
  const options = [];
  const group = familyMap.get(rune.baseName);

  if (directPrice) {
    options.push({
      kind: "buy",
      cost: directPrice,
      label: "Acheter HDV",
      detail: "Prix direct renseigné",
    });
  }

  if (group && rune.tierRank >= 2) {
    const lower = group.get(rune.tierRank - 1);
    const lowerPrice = lower ? priceOf(lower) : null;
    if (lower && lowerPrice) {
      options.push({
        kind: "craft",
        cost: lowerPrice * 3,
        label: `Crafter via 3 ${lower.name}`,
        detail: `3 × ${formatMoney(lowerPrice)} kamas`,
      });
    }
  }

  if (group && rune.tierRank === 3) {
    const simple = group.get(1);
    const simplePrice = simple ? priceOf(simple) : null;
    if (simple && simplePrice) {
      options.push({
        kind: "craft",
        cost: simplePrice * 9,
        label: `Crafter via 9 ${simple.name}`,
        detail: `9 × ${formatMoney(simplePrice)} kamas`,
      });
    }
  }

  options.sort((a, b) => a.cost - b.cost);
  const best = options[0] || null;
  const craftOptions = options.filter((option) => option.kind === "craft");
  const bestCraft = craftOptions[0] || null;
  const saving = directPrice && bestCraft ? directPrice - bestCraft.cost : null;
  const xpDirect = directPrice && rune.density > 0 ? rune.density / directPrice : null;
  const xpOptimal = best && rune.density > 0 ? rune.density / best.cost : null;

  let decision = "missing";
  let badge = "Prix requis";
  if (rune.density <= 0) {
    decision = "neutral";
    badge = "Hors XP";
  } else if (best && best.kind === "craft" && directPrice && best.cost < directPrice) {
    decision = "craft";
    badge = "Crafter";
  } else if (best && best.kind === "craft" && !directPrice) {
    decision = "craft";
    badge = "Craft possible";
  } else if (best && best.kind === "buy") {
    decision = "buy";
    badge = "Acheter";
  }

  return {
    directPrice,
    options,
    best,
    bestCraft,
    saving,
    profit: saving && saving > 0 ? saving : 0,
    xpDirect,
    xpOptimal,
    decision,
    badge,
  };
}

function getRows() {
  const rows = runes.map((rune) => ({ rune, acquisition: getAcquisition(rune) }));
  const bestXp = rows
    .filter((row) => row.acquisition.xpOptimal)
    .sort((a, b) => b.acquisition.xpOptimal - a.acquisition.xpOptimal)[0];

  const filtered = rows.filter((row) => {
    const { rune, acquisition } = row;
    const query = state.search.trim().toLowerCase();
    const matchesSearch = !query || rune.name.toLowerCase().includes(query) || rune.effect.label.toLowerCase().includes(query);
    const matchesFamily =
      state.family === "all" ||
      state.family === `category:${rune.effect.family}` ||
      state.family === `base:${rune.baseName}`;
    const matchesDecision =
      state.decision === "all" ||
      (state.decision === "xp" && bestXp && bestXp.rune.id === rune.id) ||
      acquisition.decision === state.decision;
    return matchesSearch && matchesFamily && matchesDecision;
  });

  filtered.sort((a, b) => {
    if (state.sort === "name") return a.rune.name.localeCompare(b.rune.name, "fr");
    if (state.sort === "density") return b.rune.density - a.rune.density || a.rune.name.localeCompare(b.rune.name, "fr");
    if (state.sort === "profit") return b.acquisition.profit - a.acquisition.profit || sortByXp(a, b);
    if (state.sort === "saving") return (b.acquisition.saving || -Infinity) - (a.acquisition.saving || -Infinity) || sortByXp(a, b);
    if (state.sort === "targetCost") return sortByTargetCost(a, b);
    return sortByXp(a, b);
  });

  return { rows, filtered, bestXp };
}

function sortByXp(a, b) {
  return (b.acquisition.xpOptimal || -Infinity) - (a.acquisition.xpOptimal || -Infinity) || a.rune.name.localeCompare(b.rune.name, "fr");
}

function sortByTargetCost(a, b) {
  const costA = getTargetDensityCost(a.rune, a.acquisition)?.cost ?? Infinity;
  const costB = getTargetDensityCost(b.rune, b.acquisition)?.cost ?? Infinity;
  return costA - costB || sortByXp(a, b);
}

function renderFilters() {
  const families = [...new Set(runes.map((rune) => rune.effect.family))].sort((a, b) => a.localeCompare(b, "fr"));
  const characteristics = [...new Set(runes.map((rune) => rune.baseName))].sort((a, b) => a.localeCompare(b, "fr"));
  $("#familyFilter").innerHTML = [
    `<option value="all">Toutes</option>`,
    `<optgroup label="Catégories">`,
    ...families.map((family) => `<option value="category:${escapeAttr(family)}">${escapeHtml(family)}</option>`),
    `</optgroup>`,
    `<optgroup label="Caractéristiques">`,
    ...characteristics.map((family) => `<option value="base:${escapeAttr(family)}">${escapeHtml(family)}</option>`),
    `</optgroup>`,
  ].join("");
}

function renderItemFinderControls() {
  $("#itemRuneSearch").value = getSelectedItemRune().name;

  $("#itemJobSelect").innerHTML = FM_JOB_GROUPS
    .map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.label)}</option>`)
    .join("");
  $("#itemJobSelect").value = state.itemFinder.job;
}

function renderOcrControls() {
  $("#ocrRuneSelect").innerHTML = [
    `<option value="">Choisir une rune...</option>`,
    ...[...runes]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((rune) => `<option value="${rune.id}">${escapeHtml(rune.name)}</option>`),
  ].join("");
}

function getSelectedItemRune() {
  return runeById.get(String(state.itemFinder.runeId)) || runes.find((rune) => rune.density > 0) || runes[0];
}

function getSelectedJobGroup() {
  return FM_JOB_GROUPS.find((group) => group.id === state.itemFinder.job) || FM_JOB_GROUPS[0];
}

function getMatchingItemRunes(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return xpRunes;

  return xpRunes.filter((rune) => {
    const searchableText = normalizeText(`${rune.name} ${rune.effect.label} ${rune.baseName}`);
    return searchableText.includes(normalizedQuery);
  });
}

function renderRuneSearchResults(query = "") {
  const results = $("#itemRuneResults");
  const matches = getMatchingItemRunes(query).slice(0, 12);
  activeRuneResultIndex = -1;

  if (!matches.length) {
    results.innerHTML = `<div class="rune-search-empty">Aucune rune trouvée.</div>`;
  } else {
    results.innerHTML = matches
      .map(
        (rune) => `
          <button
            type="button"
            class="rune-search-result"
            role="option"
            data-rune-id="${rune.id}"
            aria-selected="${String(rune.id) === String(state.itemFinder.runeId)}"
          >
            <span>${escapeHtml(rune.name)}</span>
            <small>${escapeHtml(rune.effect.label)} · ${formatDensity(rune.density)} dens.</small>
          </button>
        `,
      )
      .join("");
  }

  results.hidden = false;
  $("#itemRuneSearch").setAttribute("aria-expanded", "true");
}

function closeRuneSearchResults({ restoreSelection = false } = {}) {
  $("#itemRuneResults").hidden = true;
  $("#itemRuneSearch").setAttribute("aria-expanded", "false");
  $("#itemRuneSearch").removeAttribute("aria-activedescendant");
  activeRuneResultIndex = -1;

  if (restoreSelection) {
    $("#itemRuneSearch").value = getSelectedItemRune().name;
  }
}

function selectItemRune(runeId) {
  const rune = runeById.get(String(runeId));
  if (!rune || rune.density <= 0) return;

  state.itemFinder.runeId = String(rune.id);
  $("#itemRuneSearch").value = rune.name;
  closeRuneSearchResults();
  clearItemSearch("Rune changée.");
  renderItemFinder();
}

function moveRuneSearchSelection(direction) {
  const options = [...document.querySelectorAll(".rune-search-result")];
  if (!options.length) return;

  if (activeRuneResultIndex === -1) {
    activeRuneResultIndex = direction > 0 ? 0 : options.length - 1;
  } else {
    activeRuneResultIndex = (activeRuneResultIndex + direction + options.length) % options.length;
  }
  options.forEach((option, index) => {
    option.classList.toggle("is-active", index === activeRuneResultIndex);
    if (index === activeRuneResultIndex) {
      option.id = "activeRuneResult";
      $("#itemRuneSearch").setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else {
      option.removeAttribute("id");
    }
  });
}

function renderSummary(rows, bestXp) {
  const priced = runes.filter((rune) => priceOf(rune)).length;
  const bestCraft = rows
    .filter((row) => row.acquisition.profit > 0)
    .sort((a, b) => b.acquisition.profit - a.acquisition.profit)[0];
  const bestSaving = rows
    .filter((row) => row.acquisition.saving > 0)
    .sort((a, b) => b.acquisition.saving - a.acquisition.saving)[0];

  $("#pricedCount").textContent = `${priced} / ${runes.length}`;

  if (bestXp) {
    $("#bestXpName").textContent = bestXp.rune.name;
    $("#bestXpMeta").textContent = `${formatXpRatio(bestXp.acquisition.xpOptimal)} densité / 1 000 kamas via ${bestXp.acquisition.best.label.toLowerCase()}`;
  } else {
    $("#bestXpName").textContent = "Prix requis";
    $("#bestXpMeta").textContent = "Renseigne au moins un prix.";
  }

  if (bestCraft) {
    $("#bestCraftName").textContent = bestCraft.rune.name;
    $("#bestCraftMeta").textContent = `+${formatMoney(bestCraft.acquisition.profit)} kamas si revendu au prix HDV.`;
  } else {
    $("#bestCraftName").textContent = "Aucune opportunité";
    $("#bestCraftMeta").textContent = "Aucun craft positif avec les prix actuels.";
  }

  if (bestSaving) {
    $("#bestSavingName").textContent = bestSaving.rune.name;
    $("#bestSavingMeta").textContent = `${formatMoney(bestSaving.acquisition.saving)} kamas économisés vs achat direct.`;
  } else {
    $("#bestSavingName").textContent = "Prix requis";
    $("#bestSavingMeta").textContent = "Compare achat direct et craft dès que les prix existent.";
  }
}

function renderTable(filtered, bestXp) {
  const tbody = $("#runeTable");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="8">Aucune rune ne correspond aux filtres.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(({ rune, acquisition }) => {
      const targetCost = getTargetDensityCost(rune, acquisition);
      const isTopXp = bestXp && bestXp.rune.id === rune.id;
      const rowClasses = [
        acquisition.decision === "craft" && acquisition.profit > 0 ? "is-craft" : "",
        isTopXp ? "is-top-xp" : "",
        String(state.ocr.updatedRuneId) === String(rune.id) ? "is-ocr-updated" : "",
      ].filter(Boolean).join(" ");
      return `
        <tr class="${rowClasses}">
          <td>
            <div class="rune-cell">
              <img class="rune-icon" src="${escapeAttr(rune.img)}" alt="" loading="lazy">
              <span>
                <span class="rune-name">${escapeHtml(rune.name)}</span>
                <span class="rune-meta">${escapeHtml(rune.effect.label)} · ${escapeHtml(rune.tierLabel)} · niv. ${rune.level}</span>
              </span>
            </div>
          </td>
          <td class="num">${formatDensity(rune.density)}</td>
          <td>
            <input
              class="price-input"
              inputmode="numeric"
              data-id="${rune.id}"
              aria-label="Prix HDV ${escapeAttr(rune.name)}"
              value="${escapeAttr(state.prices[rune.id] || "")}"
              placeholder="0"
            >
          </td>
          <td class="num">${acquisition.best ? `${formatMoney(acquisition.best.cost)} k` : "-"}</td>
          <td><span class="badge ${badgeClass(acquisition.decision)}">${escapeHtml(acquisition.badge)}</span></td>
          <td class="num">${formatGain(acquisition.saving)}</td>
          <td class="num">
            <strong>${targetCost ? `${formatMoney(targetCost.cost)} k` : "-"}</strong>
            ${targetCost ? `<span class="rune-meta">${formatQuantity(targetCost.quantity)} runes · ${formatDensity(targetCost.density)} dens.</span>` : ""}
          </td>
          <td class="detail">${escapeHtml(detailText(rune, acquisition))}</td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  const active = document.activeElement;
  const activeSelector = getActiveInputSelector(active);
  const activePosition = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
  const { rows, filtered, bestXp } = getRows();
  renderSummary(rows, bestXp);
  renderOcrPanel();
  renderTable(filtered, bestXp);
  renderItemFinder();
  if (activeSelector) {
    const next = document.querySelector(activeSelector);
    if (next) {
      next.focus();
      if (activePosition !== null) next.setSelectionRange(activePosition, activePosition);
    }
  }
}

function getActiveInputSelector(active) {
  if (!active) return null;
  if (active.matches(".price-input")) return `.price-input[data-id="${active.dataset.id}"]`;
  if (active.matches(".item-price-input")) return `.item-price-input[data-id="${active.dataset.id}"]`;
  return null;
}

function renderOcrPanel() {
  $("#ocrStatus").textContent = state.ocr.status;

  const previewWrap = $("#ocrPreviewWrap");
  const preview = $("#ocrPreview");
  if (state.ocr.previewUrl) {
    previewWrap.hidden = false;
    preview.src = state.ocr.previewUrl;
  } else {
    previewWrap.hidden = true;
    preview.removeAttribute("src");
  }

  const result = state.ocr.result;
  const bestLot = getOcrBestLot(result);
  const selectedRune = state.ocr.selectedRuneId ? runeById.get(String(state.ocr.selectedRuneId)) : null;
  $("#ocrRuneSelect").value = selectedRune ? String(selectedRune.id) : "";
  $("#ocrApplyBtn").disabled = state.ocr.loading || !result || !bestLot || !selectedRune;

  if (!result) {
    $("#ocrDetectedName").textContent = "-";
    $("#ocrDetectedMeta").textContent = "Aucune capture traitee.";
    $("#ocrDetectedPrice").textContent = "-";
    $("#ocrPriceMeta").textContent = "Meilleur lot visible.";
    $("#ocrLots").textContent = "";
    return;
  }

  $("#ocrDetectedName").textContent = result.item_name || "Nom non lu";
  $("#ocrDetectedMeta").textContent = getOcrDetectedMeta(result, selectedRune);

  if (bestLot) {
    const appliedPrice = getOcrApplyPrice(bestLot);
    $("#ocrDetectedPrice").textContent = `${formatMoney(appliedPrice)} k/u`;
    $("#ocrPriceMeta").textContent = `Lot x${formatQuantity(bestLot.quantity)} a ${formatOcrUnitPrice(bestLot.unit_price)} k/u.`;
  } else {
    $("#ocrDetectedPrice").textContent = "-";
    $("#ocrPriceMeta").textContent = "Aucun lot lisible.";
  }

  $("#ocrLots").innerHTML = renderOcrLots(result);
}

function getOcrDetectedMeta(result, selectedRune) {
  if (Array.isArray(result.warnings) && result.warnings.length) {
    return `A verifier: ${result.warnings[0]}`;
  }
  if (selectedRune) {
    return `Associe a ${selectedRune.name}.`;
  }
  return "Choisis la rune cible.";
}

function renderOcrLots(result) {
  const lots = Array.isArray(result?.lots) ? result.lots : [];
  if (!lots.length) return "";

  return lots
    .map((lot) => {
      const isBest = result.best_lot && Number(result.best_lot.quantity) === Number(lot.quantity);
      const label = isBest ? " meilleur" : "";
      return `<span><strong>x${formatQuantity(lot.quantity)}</strong>${label}: ${formatMoney(lot.total_price)} k (${formatOcrUnitPrice(lot.unit_price)} k/u)</span>`;
    })
    .join(" · ");
}

function getOcrBestLot(result) {
  return result && result.best_lot ? result.best_lot : null;
}

function getOcrApplyPrice(lot) {
  const unitPrice = Number(lot?.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return Math.max(1, Math.round(unitPrice));
}

function formatOcrUnitPrice(value) {
  const unitPrice = Number(value);
  if (!Number.isFinite(unitPrice)) return "-";
  if (Number.isInteger(unitPrice)) return formatMoney(unitPrice);
  return formatter.format(round2(unitPrice));
}

function applySelectedOcrPrice() {
  const rune = runeById.get(String($("#ocrRuneSelect").value));
  if (!rune || !state.ocr.result) return;
  applyOcrPrice(rune, state.ocr.result, false);
}

function applyOcrPrice(rune, result, automatic) {
  const bestLot = getOcrBestLot(result);
  const price = getOcrApplyPrice(bestLot);
  if (!price) {
    state.ocr.status = "Aucun prix OCR lisible dans cette capture.";
    renderOcrPanel();
    return;
  }

  state.prices[rune.id] = price;
  state.ocr.selectedRuneId = String(rune.id);
  state.ocr.updatedRuneId = String(rune.id);
  state.ocr.appliedPrice = price;
  state.ocr.appliedLot = bestLot;
  state.ocr.status = `${automatic ? "Prix OCR applique" : "Prix applique"}: ${rune.name} = ${formatMoney(price)} k/u.`;
  savePrices();
  render();
}

async function processOcrImage(file) {
  if (!file || !isImageFile(file)) {
    state.ocr.status = "Image requise pour l'OCR.";
    renderOcrPanel();
    return;
  }

  const token = ++ocrRequestToken;
  if (state.ocr.previewUrl) URL.revokeObjectURL(state.ocr.previewUrl);

  state.ocr.loading = true;
  state.ocr.status = "OCR en cours...";
  state.ocr.result = null;
  state.ocr.selectedRuneId = "";
  state.ocr.appliedPrice = null;
  state.ocr.appliedLot = null;
  state.ocr.previewUrl = URL.createObjectURL(file);
  renderOcrPanel();

  try {
    if (window.location.protocol === "file:") {
      throw new Error("lance runes-dofus/start-with-ocr.ps1 puis ouvre l'URL locale");
    }

    await assertOcrServerReady();

    const response = await fetch(OCR_API_PATH, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const result = await readOcrJsonResponse(response);
    if (token !== ocrRequestToken) return;

    const matchedRune = findRuneByOcrName(result.item_name);
    state.ocr.result = result;
    state.ocr.selectedRuneId = matchedRune ? String(matchedRune.id) : "";
    state.ocr.status = matchedRune ? "OCR termine." : `Rune non reconnue: ${result.item_name || "nom absent"}.`;

    if (matchedRune && getOcrBestLot(result)) {
      applyOcrPrice(matchedRune, result, true);
    }
  } catch (error) {
    if (token !== ocrRequestToken) return;
    state.ocr.result = null;
    state.ocr.selectedRuneId = "";
    state.ocr.status = `OCR impossible: ${error.message}`;
  } finally {
    if (token === ocrRequestToken) {
      state.ocr.loading = false;
      renderOcrPanel();
    }
  }
}

async function assertOcrServerReady() {
  let response = null;
  try {
    response = await fetch(OCR_HEALTH_PATH, { cache: "no-store" });
  } catch {
    throw new Error("serveur OCR indisponible; relance start-runes-ocr.ps1");
  }

  if (!response.ok) {
    throw new Error("serveur OCR obsolete; arrete l'ancien serveur puis relance start-runes-ocr.ps1");
  }

  const payload = await readOcrJsonResponse(response);
  if (!payload?.ok) {
    throw new Error("serveur OCR invalide; relance start-runes-ocr.ps1");
  }
}

async function readOcrJsonResponse(response) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `erreur HTTP ${response.status}`);
  }
  if (!payload) {
    throw new Error("reponse OCR invalide");
  }

  return payload;
}

function getClipboardImageFile(event) {
  const items = Array.from(event.clipboardData?.items || []);
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return getFirstImageFile(event.clipboardData?.files);
}

function getFirstImageFile(files) {
  return Array.from(files || []).find(isImageFile) || null;
}

function isImageFile(file) {
  return file && (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name || ""));
}

function findRuneByOcrName(itemName) {
  const target = normalizeRuneNameForMatch(itemName);
  if (!target) return null;

  return runes.find((rune) => normalizeRuneNameForMatch(rune.name) === target) || null;
}

function normalizeRuneNameForMatch(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\brunes?\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function renderItemFinder() {
  const rune = getSelectedItemRune();
  const acquisition = getAcquisition(rune);
  const visible = getVisibleItemCandidates(rune, acquisition);
  const total = state.itemFinder.candidates.length;

  if (document.activeElement !== $("#itemRuneSearch") || $("#itemRuneResults").hidden) {
    $("#itemRuneSearch").value = rune.name;
  }
  $("#itemJobSelect").value = state.itemFinder.job;
  $("#itemMinLevel").value = state.itemFinder.minLevel;
  $("#itemMaxLevel").value = state.itemFinder.maxLevel;
  $("#itemSearchInput").value = state.itemFinder.search;
  $("#itemSortSelect").value = state.itemFinder.sort;
  $("#itemFinderStatus").textContent = state.itemFinder.status;
  $("#findItemsBtn").disabled = state.itemFinder.loading;

  $("#itemRuneName").textContent = rune.name;
  $("#itemRuneMeta").textContent = `${rune.effect.label} · ${formatDensity(rune.density)} densité par rune`;

  if (acquisition.best) {
    $("#itemRuneCost").textContent = `${formatMoney(acquisition.best.cost)} k`;
    $("#itemRuneCostMeta").textContent = acquisition.best.label;
  } else {
    $("#itemRuneCost").textContent = "Prix requis";
    $("#itemRuneCostMeta").textContent = "Renseigne le prix direct ou le craft de la rune.";
  }

  if (state.itemFinder.loading) {
    $("#itemCandidateCount").textContent = "...";
    $("#itemCandidateMeta").textContent = "Chargement DofusDB.";
  } else if (state.itemFinder.searched) {
    $("#itemCandidateCount").textContent = `${visible.length} / ${total}`;
    $("#itemCandidateMeta").textContent = visible.length > ITEM_RESULT_LIMIT ? `Affichage des ${ITEM_RESULT_LIMIT} meilleurs.` : "Résultats filtrés.";
  } else {
    $("#itemCandidateCount").textContent = "0";
    $("#itemCandidateMeta").textContent = "Aucune recherche lancée.";
  }

  renderItemTable(visible, rune, acquisition);
}

function renderItemTable(visible, rune, acquisition) {
  const tbody = $("#itemTable");
  if (state.itemFinder.loading) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="6">Chargement des items compatibles...</td></tr>`;
    return;
  }

  if (!state.itemFinder.searched) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="6">Lance une recherche pour afficher les items compatibles.</td></tr>`;
    return;
  }

  if (!state.itemFinder.candidates.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="6">Aucun item compatible avec ${escapeHtml(rune.name)} dans ce métier.</td></tr>`;
    return;
  }

  if (!visible.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="6">Aucun item ne correspond aux filtres de niveau ou de recherche.</td></tr>`;
    return;
  }

  tbody.innerHTML = visible
    .slice(0, ITEM_RESULT_LIMIT)
    .map(({ candidate, economy }) => {
      const itemPrice = state.itemPrices[candidate.id] || "";
      const costLabel = economy.costPerDensity ? `${formatMoney(economy.costPerDensity)} k` : "-";
      const costMeta = getItemCostMeta(economy);
      return `
        <tr>
          <td>
            <div class="rune-cell item-cell">
              <img class="item-icon" src="${escapeAttr(getItemImage(candidate.item))}" alt="" loading="lazy">
              <span>
                <span class="rune-name">${escapeHtml(candidate.name)}</span>
                <span class="rune-meta">${escapeHtml(candidate.typeName)} · niv. ${candidate.level}</span>
              </span>
            </div>
          </td>
          <td class="num">
            <strong>${escapeHtml(formatEffectRange(candidate))}</strong>
            <span class="rune-meta">${escapeHtml(rune.effect.label)}</span>
          </td>
          <td class="num">
            <strong>${formatQuantity(candidate.runeUses)}</strong>
            <span class="rune-meta">${formatDensity(candidate.potentialDensity)} dens.</span>
          </td>
          <td>
            <input
              class="item-price-input"
              inputmode="numeric"
              data-id="${candidate.id}"
              aria-label="Prix HDV ${escapeAttr(candidate.name)}"
              value="${escapeAttr(itemPrice)}"
              placeholder="0"
            >
          </td>
          <td class="num">
            <strong>${costLabel}</strong>
            ${costMeta ? `<span class="rune-meta">${escapeHtml(costMeta)}</span>` : ""}
          </td>
          <td class="detail">${escapeHtml(getItemDetail(candidate, rune, acquisition, economy))}</td>
        </tr>
      `;
    })
    .join("");
}

function getVisibleItemCandidates(rune, acquisition) {
  const query = normalizeText(state.itemFinder.search);
  const minLevel = parseLevelFilter(state.itemFinder.minLevel);
  const maxLevel = parseLevelFilter(state.itemFinder.maxLevel);

  return state.itemFinder.candidates
    .filter((candidate) => {
      if (minLevel !== null && candidate.level < minLevel) return false;
      if (maxLevel !== null && candidate.level > maxLevel) return false;
      if (!query) return true;
      return normalizeText(candidate.name).includes(query) || normalizeText(candidate.typeName).includes(query);
    })
    .map((candidate) => ({ candidate, economy: getItemCandidateEconomy(candidate, acquisition) }))
    .sort(sortItemCandidateRows);
}

function sortItemCandidateRows(a, b) {
  if (state.itemFinder.sort === "cost") {
    return (a.economy.costPerDensity ?? Infinity) - (b.economy.costPerDensity ?? Infinity) || sortByItemPotential(a, b);
  }
  if (state.itemFinder.sort === "level") {
    return a.candidate.level - b.candidate.level || sortByItemPotential(a, b);
  }
  if (state.itemFinder.sort === "name") {
    return a.candidate.name.localeCompare(b.candidate.name, "fr") || sortByItemPotential(a, b);
  }
  return sortByItemPotential(a, b);
}

function sortByItemPotential(a, b) {
  return (
    b.candidate.runeUses - a.candidate.runeUses ||
    b.candidate.potentialDensity - a.candidate.potentialDensity ||
    a.candidate.level - b.candidate.level ||
    a.candidate.name.localeCompare(b.candidate.name, "fr")
  );
}

function getItemCandidateEconomy(candidate, acquisition) {
  const itemPrice = itemPriceOf(candidate.id);
  const runeCost = acquisition.best ? candidate.runeUses * acquisition.best.cost : null;
  const totalCost = itemPrice ? itemPrice + (runeCost || 0) : null;
  const costPerDensity = totalCost && candidate.potentialDensity > 0 ? (totalCost / candidate.potentialDensity) * XP_TARGET_DENSITY : null;

  return {
    itemPrice,
    runeCost,
    totalCost,
    costPerDensity,
  };
}

function getItemCostMeta(economy) {
  if (!economy.itemPrice) return "Prix item requis";
  if (!economy.runeCost) return "Hors coût runes";
  return `${formatMoney(economy.totalCost)} k total`;
}

function getItemDetail(candidate, rune, acquisition, economy) {
  if (!economy.itemPrice) {
    return `Potentiel théorique: ${formatQuantity(candidate.runeUses)} ${rune.name} avant de vider ${candidate.maxValue} ${rune.effect.unit}.`;
  }
  if (!acquisition.best) {
    return `Prix item saisi: ${formatMoney(economy.itemPrice)} kamas. Renseigne le coût de la rune pour comparer le total.`;
  }
  return `${formatMoney(economy.itemPrice)} k item + ${formatMoney(economy.runeCost)} k runes pour ${formatDensity(candidate.potentialDensity)} densité théorique.`;
}

function itemPriceOf(itemId) {
  const price = Number(state.itemPrices[itemId]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parseLevelFilter(value) {
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function clearItemSearch(status = "Relance une recherche avec les nouveaux critères.") {
  state.itemFinder.candidates = [];
  state.itemFinder.searched = false;
  state.itemFinder.loading = false;
  state.itemFinder.status = status;
  itemSearchToken += 1;
}

async function searchItemCandidates() {
  const rune = getSelectedItemRune();
  const job = getSelectedJobGroup();
  const token = ++itemSearchToken;

  state.itemFinder.loading = true;
  state.itemFinder.searched = true;
  state.itemFinder.candidates = [];
  state.itemFinder.status = `Chargement ${job.label}...`;
  renderItemFinder();

  try {
    const items = [];
    for (let index = 0; index < job.typeIds.length; index += 1) {
      if (token !== itemSearchToken) return;
      const typeId = job.typeIds[index];
      state.itemFinder.status = `Chargement DofusDB ${index + 1} / ${job.typeIds.length}`;
      renderItemFinder();
      const typeItems = await fetchItemsForType(typeId);
      items.push(...typeItems);
    }

    if (token !== itemSearchToken) return;

    state.itemFinder.candidates = items
      .map((item) => buildItemCandidate(item, rune))
      .filter(Boolean);
    state.itemFinder.status = `${state.itemFinder.candidates.length} items compatibles pour ${rune.name}.`;
  } catch (error) {
    state.itemFinder.candidates = [];
    state.itemFinder.status = "Chargement DofusDB impossible.";
    console.error(error);
  } finally {
    if (token === itemSearchToken) {
      state.itemFinder.loading = false;
      renderItemFinder();
    }
  }
}

async function fetchItemsForType(typeId) {
  if (itemTypeCache.has(typeId)) return itemTypeCache.get(typeId);

  const items = [];
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const response = await fetch(buildItemsUrl(typeId, skip));
    if (!response.ok) throw new Error(`DofusDB items ${typeId}: ${response.status}`);
    const payload = await response.json();
    const page = Array.isArray(payload.data) ? payload.data : [];
    total = Number(payload.total) || 0;
    items.push(...page);

    const step = Number(payload.limit) || ITEM_PAGE_SIZE;
    if (!page.length || step <= 0) break;
    skip += step;
  }

  itemTypeCache.set(typeId, items);
  return items;
}

function buildItemsUrl(typeId, skip) {
  const url = new URL(`${DOFUSDB_API_BASE}/items`);
  url.searchParams.set("$limit", String(ITEM_PAGE_SIZE));
  url.searchParams.set("$skip", String(skip));
  url.searchParams.set("typeId", String(typeId));
  url.searchParams.set("$sort[level]", "1");
  ITEM_SELECT_FIELDS.forEach((field, index) => {
    url.searchParams.set(`$select[${index}]`, field);
  });
  return url.toString();
}

function buildItemCandidate(item, rune) {
  const match = findBestMatchingEffect(item, rune);
  if (!match) return null;

  const runeValue = Math.max(Number(rune.value) || 1, 1);
  const runeUses = Math.max(1, Math.floor(match.maxValue / runeValue));

  return {
    id: String(item.id),
    item,
    name: localizedName(item.name),
    typeName: localizedName(item.type?.name) || `Type ${item.typeId || "-"}`,
    level: Number(item.level) || 0,
    effect: match.effect,
    minValue: match.minValue,
    maxValue: match.maxValue,
    runeUses,
    potentialDensity: runeUses * rune.density,
  };
}

function findBestMatchingEffect(item, rune) {
  const effects = Array.isArray(item.effects) ? item.effects : [];
  const matches = effects
    .filter((effect) => Number(effect.effectId) === Number(rune.effectId))
    .filter((effect) => rune.characteristic === null || Number(effect.characteristic) === Number(rune.characteristic))
    .map((effect) => {
      const bounds = getPositiveEffectBounds(effect);
      return bounds ? { effect, ...bounds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.maxValue - a.maxValue);

  return matches[0] || null;
}

function getPositiveEffectBounds(effect) {
  const values = [Number(effect.from), Number(effect.to)].filter(Number.isFinite).filter((value) => value > 0);
  if (!values.length) return null;
  return {
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
  };
}

function localizedName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.fr || value.en || value.id || "";
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatEffectRange(candidate) {
  if (candidate.minValue === candidate.maxValue) return String(candidate.maxValue);
  return `${candidate.minValue} à ${candidate.maxValue}`;
}

function getItemImage(item) {
  if (item.img && !String(item.img).includes("undefined")) return item.img;
  if (item.iconId) return `${DOFUSDB_API_BASE}/img/items/${item.iconId}.png`;
  return `${DOFUSDB_API_BASE}/img/items/1.png`;
}

function detailText(rune, acquisition) {
  if (rune.density <= 0) return "Rune sans densité XP exploitable dans cet outil.";
  if (!acquisition.best) return "Renseigne le prix direct ou les prix des tiers inférieurs.";
  if (acquisition.best.kind === "buy") {
    if (acquisition.bestCraft) {
      const delta = acquisition.directPrice - acquisition.bestCraft.cost;
      return delta <= 0
        ? `Achat direct moins cher que le meilleur craft de ${formatMoney(Math.abs(delta))} kamas.`
        : `Le craft serait moins cher de ${formatMoney(delta)} kamas.`;
    }
    return "Pas de tier inférieur disponible ou prix inférieur manquant.";
  }
  return `${acquisition.best.label}: ${acquisition.best.detail}.`;
}

function formatGain(value) {
  if (value === null || value === undefined) return "-";
  const className = value > 0 ? "gain-positive" : value < 0 ? "gain-negative" : "";
  const sign = value > 0 ? "+" : "";
  return `<span class="${className}">${sign}${formatMoney(value)} k</span>`;
}

function badgeClass(decision) {
  if (decision === "craft") return "craft";
  if (decision === "buy") return "buy";
  if (decision === "neutral") return "neutral";
  return "missing";
}

function formatDensity(value) {
  return formatter.format(round2(value));
}

function formatMoney(value) {
  return moneyFormatter.format(Math.round(value));
}

function getTargetDensityCost(rune, acquisition) {
  if (!acquisition.best || rune.density <= 0) return null;
  const quantity = Math.ceil(XP_TARGET_DENSITY / rune.density);
  return {
    quantity,
    cost: quantity * acquisition.best.cost,
    density: quantity * rune.density,
  };
}

function formatQuantity(value) {
  return moneyFormatter.format(value);
}

function formatXpRatio(value) {
  if (!value) return "-";
  return formatter.format(value * XP_RATIO_DISPLAY_SCALE);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function exportPrices() {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Atelier Runes",
    prices: state.prices,
    itemPrices: state.itemPrices,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prix-runes-dofus.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importPrices(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      state.prices = parsePriceMap(payload.prices || payload);
      state.itemPrices = parsePriceMap(payload.itemPrices || {});
      savePrices();
      saveItemPrices();
      render();
    } catch {
      alert("Import impossible: le fichier JSON n'est pas valide.");
    }
  };
  reader.readAsText(file);
}

function parsePriceMap(values) {
  const next = {};
  for (const [id, value] of Object.entries(values || {})) {
    const parsed = parsePrice(value);
    if (parsed) next[id] = parsed;
  }
  return next;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  $("#familyFilter").addEventListener("change", (event) => {
    state.family = event.target.value;
    render();
  });
  $("#decisionFilter").addEventListener("change", (event) => {
    state.decision = event.target.value;
    render();
  });
  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  $("#ocrChooseBtn").addEventListener("click", () => $("#ocrFileInput").click());
  $("#ocrFileInput").addEventListener("change", (event) => {
    const file = getFirstImageFile(event.target.files);
    if (file) processOcrImage(file);
    event.target.value = "";
  });
  $("#ocrRuneSelect").addEventListener("change", (event) => {
    state.ocr.selectedRuneId = event.target.value;
    renderOcrPanel();
  });
  $("#ocrApplyBtn").addEventListener("click", applySelectedOcrPrice);
  $("#ocrDropZone").addEventListener("dragenter", (event) => {
    event.preventDefault();
    $("#ocrDropZone").classList.add("is-dragover");
  });
  $("#ocrDropZone").addEventListener("dragover", (event) => {
    event.preventDefault();
    $("#ocrDropZone").classList.add("is-dragover");
  });
  $("#ocrDropZone").addEventListener("dragleave", () => {
    $("#ocrDropZone").classList.remove("is-dragover");
  });
  $("#ocrDropZone").addEventListener("drop", (event) => {
    event.preventDefault();
    $("#ocrDropZone").classList.remove("is-dragover");
    const file = getFirstImageFile(event.dataTransfer?.files);
    if (file) processOcrImage(file);
  });
  document.addEventListener("paste", (event) => {
    const file = getClipboardImageFile(event);
    if (!file) return;
    event.preventDefault();
    processOcrImage(file);
  });
  $("#itemRuneSearch").addEventListener("focus", (event) => {
    event.target.select();
    closeRuneSearchResults();
  });
  $("#itemRuneSearch").addEventListener("input", (event) => {
    renderRuneSearchResults(event.target.value);
  });
  $("#itemRuneSearch").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if ($("#itemRuneResults").hidden) renderRuneSearchResults(event.currentTarget.value);
      moveRuneSearchSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if ($("#itemRuneResults").hidden) renderRuneSearchResults(event.currentTarget.value);
      moveRuneSearchSelection(-1);
    } else if (event.key === "Enter") {
      const options = [...document.querySelectorAll(".rune-search-result")];
      const selected = options[activeRuneResultIndex] || options[0];
      if (selected) {
        event.preventDefault();
        selectItemRune(selected.dataset.runeId);
      }
    } else if (event.key === "Escape") {
      closeRuneSearchResults({ restoreSelection: true });
      event.currentTarget.blur();
    }
  });
  $("#itemRuneSearch").addEventListener("blur", () => {
    window.setTimeout(() => closeRuneSearchResults({ restoreSelection: true }), 0);
  });
  $("#itemRuneResults").addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  $("#itemRuneResults").addEventListener("click", (event) => {
    const option = event.target.closest(".rune-search-result");
    if (option) selectItemRune(option.dataset.runeId);
  });
  $("#itemJobSelect").addEventListener("change", (event) => {
    state.itemFinder.job = event.target.value;
    clearItemSearch("Métier changé.");
    renderItemFinder();
  });
  $("#itemMinLevel").addEventListener("input", (event) => {
    state.itemFinder.minLevel = event.target.value;
    renderItemFinder();
  });
  $("#itemMaxLevel").addEventListener("input", (event) => {
    state.itemFinder.maxLevel = event.target.value;
    renderItemFinder();
  });
  $("#itemSearchInput").addEventListener("input", (event) => {
    state.itemFinder.search = event.target.value;
    renderItemFinder();
  });
  $("#itemSortSelect").addEventListener("change", (event) => {
    state.itemFinder.sort = event.target.value;
    renderItemFinder();
  });
  $("#findItemsBtn").addEventListener("click", searchItemCandidates);
  $("#runeTable").addEventListener("input", (event) => {
    if (!event.target.matches(".price-input")) return;
    const id = event.target.dataset.id;
    const parsed = parsePrice(event.target.value);
    if (parsed) {
      state.prices[id] = parsed;
    } else {
      delete state.prices[id];
    }
    savePrices();
    render();
  });
  $("#itemTable").addEventListener("input", (event) => {
    if (!event.target.matches(".item-price-input")) return;
    const id = event.target.dataset.id;
    const parsed = parsePrice(event.target.value);
    if (parsed) {
      state.itemPrices[id] = parsed;
    } else {
      delete state.itemPrices[id];
    }
    saveItemPrices();
    render();
  });
  $("#exportBtn").addEventListener("click", exportPrices);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importPrices(file);
    event.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Effacer tous les prix saisis ?")) return;
    state.prices = {};
    savePrices();
    render();
  });
}

renderFilters();
renderItemFinderControls();
renderOcrControls();
bindEvents();
render();
