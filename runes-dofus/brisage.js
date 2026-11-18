const BRISAGE_STORAGE_KEY = "dofus-brisage-log-v1";
// Loaded before app.js: entries are read in bindBrisageEvents, once the rune catalogue exists.
const brisage = {
  entries: [],
  item: null,
  results: [],
  searchToken: 0,
  searchTimer: null,
};

function loadBrisageEntries() {
  try {
    return parseBrisageEntries(JSON.parse(localStorage.getItem(BRISAGE_STORAGE_KEY)));
  } catch {
    return [];
  }
}

function saveBrisageEntries(entries) {
  localStorage.setItem(BRISAGE_STORAGE_KEY, JSON.stringify(entries));
  brisage.entries = entries;
}

function mergeBrisageEntries(incoming) {
  const byId = new Map(brisage.entries.map((entry) => [entry.id, entry]));
  for (const entry of parseBrisageEntries(incoming)) byId.set(entry.id, entry);
  saveBrisageEntries([...byId.values()].sort((a, b) => b.date.localeCompare(a.date)));
}

// Entries come from localStorage or an imported file: keep only well-formed ones.
function parseBrisageEntries(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const quantity = Number(value?.quantity);
    const unitCost = Number(value?.unitCost);
    const coefficient = value?.coefficient == null ? null : Number(value.coefficient);
    const runeEntries = Array.isArray(value?.runes) ? value.runes : [];
    const parsedRunes = runeEntries
      .map((rune) => ({ id: String(rune?.id), quantity: Number(rune?.quantity) }))
      .filter((rune) => runeById.has(rune.id) && Number.isInteger(rune.quantity) && rune.quantity > 0);
    if (typeof value?.id !== "string" || typeof value?.itemName !== "string" || Number.isNaN(Date.parse(value?.date))
      || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0
      || (coefficient !== null && !(Number.isFinite(coefficient) && coefficient > 0))
      || parsedRunes.length !== runeEntries.length) {
      return [];
    }
    return [{
      id: value.id,
      date: value.date,
      itemId: /^\d+$/.test(String(value.itemId)) ? Number(value.itemId) : null,
      itemName: value.itemName,
      iconId: Number.isInteger(value.iconId) ? value.iconId : null,
      level: Number.isInteger(value.level) ? value.level : null,
      quantity,
      unitCost: Math.round(unitCost),
      coefficient,
      runes: parsedRunes,
    }];
  });
}

function findRuneByName(value) {
  const name = normalizeText(value).trim().replace(/^rune\s+/, "");
  return runes.find((rune) => normalizeText(rune.name).replace(/^rune\s+/, "") === name) || null;
}

function brisageRuneRow(rune = null, quantity = "") {
  return `
    <div class="brisage-rune-row">
      <label class="field">
        <span>Rune</span>
        <input class="brisage-rune-name" list="brisageRuneOptions" autocomplete="off" placeholder="Rune Fo"
          value="${escapeAttr(rune?.name ?? "")}">
      </label>
      <label class="field compact">
        <span>Quantité</span>
        <input class="brisage-rune-qty" type="number" min="1" step="1" inputmode="numeric" value="${escapeAttr(quantity)}">
      </label>
      <button type="button" class="icon-button" data-remove-rune aria-label="Retirer cette rune">Retirer</button>
    </div>`;
}

function addBrisageRuneRow() {
  $("#brisageRunes").insertAdjacentHTML("beforeend", brisageRuneRow());
  const rows = $("#brisageRunes").querySelectorAll(".brisage-rune-name");
  rows[rows.length - 1].focus();
}

function readBrisageForm() {
  const errors = [];
  const quantity = Number($("#brisageQuantity").value);
  const unitCost = parsePrice($("#brisageUnitCost").value);
  const coefficientText = $("#brisageCoefficient").value.trim().replace(",", ".");
  const coefficient = coefficientText ? Number(coefficientText) : null;
  if (!brisage.item) errors.push("Choisis l’objet brisé.");
  if (!Number.isInteger(quantity) || quantity <= 0) errors.push("La quantité doit être un entier positif.");
  if (unitCost === null && $("#brisageUnitCost").value.trim() !== "0") errors.push("Renseigne le coût unitaire de l’objet.");
  if (coefficient !== null && !(Number.isFinite(coefficient) && coefficient > 0)) errors.push("Le coefficient doit être un nombre positif.");

  const runeTotals = new Map();
  for (const row of $("#brisageRunes").querySelectorAll(".brisage-rune-row")) {
    const nameText = row.querySelector(".brisage-rune-name").value.trim();
    const quantityText = row.querySelector(".brisage-rune-qty").value.trim();
    if (!nameText && !quantityText) continue;
    const rune = findRuneByName(nameText);
    const runeQuantity = Number(quantityText);
    if (!rune) errors.push(`Rune inconnue : « ${nameText || "vide"} ».`);
    else if (!Number.isInteger(runeQuantity) || runeQuantity <= 0) errors.push(`Quantité invalide pour ${rune.name}.`);
    else runeTotals.set(String(rune.id), (runeTotals.get(String(rune.id)) || 0) + runeQuantity);
  }
  if (!runeTotals.size) errors.push("Ajoute au moins une rune obtenue.");

  return {
    errors,
    entry: {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      itemId: brisage.item ? Number(brisage.item.id) : null,
      itemName: brisage.item ? marketItemName(brisage.item) : "",
      iconId: Number.isInteger(brisage.item?.iconId) ? brisage.item.iconId : null,
      level: Number.isInteger(brisage.item?.level) ? brisage.item.level : null,
      quantity,
      unitCost: unitCost ?? 0,
      coefficient,
      runes: [...runeTotals].map(([id, runeQuantity]) => ({ id, quantity: runeQuantity })),
    },
  };
}

function renderBrisagePreview() {
  const { entry } = readBrisageForm();
  const result = calculateBreakResult(entry, (id) => priceOf(runeById.get(id)));
  const preview = $("#brisagePreview");
  if (!entry.runes.length) {
    preview.textContent = "Ajoute les runes obtenues pour voir le résultat.";
    return;
  }
  preview.innerHTML = `Coût ${formatMoney(result.cost)} k · Runes ${formatMoney(result.value)} k${formatMissing(result.missing)} · Bénéfice ${formatGain(result.profit)}`;
}

function formatMissing(missing) {
  return missing ? ` <span class="badge missing">${missing} prix manquant${missing === 1 ? "" : "s"}</span>` : "";
}

function selectBrisageItem(item) {
  brisage.item = item;
  brisage.results = [];
  $("#brisageItemResults").replaceChildren();
  $("#brisageItemResults").hidden = true;
  $("#brisageItemSearch").value = marketItemName(item);
  const price = marketPriceOf(item.id);
  if (price !== null) $("#brisageUnitCost").value = price;
  $("#brisageSelectedItem").innerHTML = `${marketItemIcon(item)}<strong>${escapeHtml(marketItemName(item))}</strong>
    <span class="rune-meta">${item.level != null ? `Niv. ${escapeHtml(item.level)}` : ""}${price !== null ? ` · prix HDV enregistré ${formatMoney(price)} k` : ""}</span>`;
  renderBrisagePreview();
  $("#brisageQuantity").focus();
}

function queueBrisageItemSearch() {
  clearTimeout(brisage.searchTimer);
  brisage.searchToken++;
  brisage.item = null;
  $("#brisageSelectedItem").replaceChildren();
  brisage.searchTimer = setTimeout(searchBrisageItems, 250);
}

async function searchBrisageItems() {
  const token = ++brisage.searchToken;
  const list = $("#brisageItemResults");
  const pattern = marketNamePattern($("#brisageItemSearch").value.trim().slice(0, 120));
  if (!pattern) {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  list.innerHTML = `<p class="brisage-search-status">Recherche…</p>`;
  try {
    const url = marketQuery("items", MARKET_ITEM_FIELDS);
    url.searchParams.set("$limit", 8);
    url.searchParams.set("$sort[level]", "-1");
    url.searchParams.set("slug.fr[$regex]", pattern);
    for (const typeId of FM_JOB_GROUPS[0].typeIds) url.searchParams.append("typeId[$in][]", typeId);
    const { data } = await fetchMarketData(url);
    if (token !== brisage.searchToken) return;
    brisage.results = data;
    list.innerHTML = data.length
      ? data.map((item) => `
        <button type="button" class="market-item-button market-item-label" data-brisage-item="${Number(item.id)}">
          ${marketItemIcon(item)}<span>${escapeHtml(marketItemName(item))}</span>
          <small class="rune-meta">Niv. ${escapeHtml(item.level ?? "–")}</small>
        </button>`).join("")
      : `<p class="brisage-search-status">Aucun équipement trouvé.</p>`;
  } catch {
    if (token === brisage.searchToken) list.innerHTML = `<p class="brisage-search-status">Catalogue DofusDB indisponible.</p>`;
  }
}

function resetBrisageForm() {
  brisage.item = null;
  $("#brisageItemSearch").value = "";
  $("#brisageSelectedItem").replaceChildren();
  $("#brisageQuantity").value = 1;
  $("#brisageUnitCost").value = "";
  $("#brisageCoefficient").value = "";
  $("#brisageRunes").innerHTML = brisageRuneRow();
  $("#brisageErrors").replaceChildren();
  renderBrisagePreview();
}

function submitBrisage(event) {
  event.preventDefault();
  const { errors, entry } = readBrisageForm();
  const errorList = $("#brisageErrors");
  if (errors.length) {
    errorList.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
    return;
  }
  saveBrisageEntries([entry, ...brisage.entries]);
  resetBrisageForm();
  renderBrisageLog();
  $("#brisageItemSearch").focus();
}

function renderBrisageLog() {
  const readRunePrice = (id) => priceOf(runeById.get(id));
  const rows = brisage.entries.map((entry) => ({ entry, result: calculateBreakResult(entry, readRunePrice) }));
  const totals = rows.reduce((sum, { entry, result }) => ({
    items: sum.items + entry.quantity,
    cost: sum.cost + result.cost,
    value: sum.value + result.value,
    missing: sum.missing + result.missing,
  }), { items: 0, cost: 0, value: 0, missing: 0 });
  const profit = totals.value - totals.cost;

  $("#brisageCount").textContent = `${formatQuantity(rows.length)} brisage${rows.length === 1 ? "" : "s"}`;
  $("#brisageCountMeta").textContent = `${formatQuantity(totals.items)} objet${totals.items === 1 ? "" : "s"} brisé${totals.items === 1 ? "" : "s"}`;
  $("#brisageTotalCost").textContent = `${formatMoney(totals.cost)} k`;
  $("#brisageTotalValue").textContent = `${formatMoney(totals.value)} k`;
  $("#brisageTotalValueMeta").innerHTML = totals.missing
    ? `Valeur partielle · ${totals.missing} prix de rune manquant${totals.missing === 1 ? "" : "s"}`
    : "Aux prix HDV actuels des runes.";
  $("#brisageTotalProfit").innerHTML = rows.length ? formatGain(profit) : "–";
  $("#brisageTotalProfitMeta").textContent = rows.length && totals.cost
    ? `Rentabilité ${formatter.format(round2((profit / totals.cost) * 100))} %`
    : "Bénéfice = valeur des runes − coût des objets.";

  $("#brisageTable").innerHTML = rows.length
    ? rows.map(({ entry, result }) => `
      <tr>
        <td>${escapeHtml(new Date(entry.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }))}</td>
        <td><div class="market-item-label">
          ${entry.iconId ? marketItemIcon({ iconId: entry.iconId }) : ""}
          <span>${copyNameButton(entry.itemName)}<span class="rune-meta">${entry.quantity > 1 ? `×${formatQuantity(entry.quantity)} · ` : ""}${entry.level != null ? `Niv. ${entry.level}` : ""}</span></span>
        </div></td>
        <td class="num">${entry.coefficient === null ? "–" : `${formatter.format(entry.coefficient)} %`}</td>
        <td class="num">${formatMoney(result.cost)} k</td>
        <td class="brisage-rune-list">${entry.runes.map(({ id, quantity }) => {
          const rune = runeById.get(id);
          const price = priceOf(rune);
          return `<span title="${escapeAttr(price === null ? "Prix manquant" : `${formatMoney(price)} k/u`)}"
            class="${price === null ? "is-missing" : ""}">${formatQuantity(quantity)} ${escapeHtml(rune.name.replace(/^Rune\s+/, ""))}</span>`;
        }).join("")}</td>
        <td class="num">${formatMoney(result.value)} k${formatMissing(result.missing)}</td>
        <td class="num">${formatGain(result.profit)}${result.cost ? `<span class="rune-meta">${formatter.format(round2(result.roi * 100))} %</span>` : ""}</td>
        <td><button type="button" class="icon-button danger" data-delete-brisage="${escapeAttr(entry.id)}"
          aria-label="${escapeAttr(`Supprimer le brisage ${entry.itemName}`)}">Supprimer</button></td>
      </tr>`).join("")
    : `<tr><td class="empty-state" colspan="8">Aucun brisage enregistré.</td></tr>`;
  renderBrisagePreview();
}

function bindBrisageEvents() {
  brisage.entries = loadBrisageEntries();
  $("#brisageRuneOptions").innerHTML = [...runes]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((rune) => `<option value="${escapeAttr(rune.name)}"></option>`).join("");
  $("#brisageView").addEventListener("error", (event) => {
    if (event.target.matches("img.item-icon")) event.target.hidden = true;
  }, true);
  $("#brisageItemSearch").addEventListener("input", queueBrisageItemSearch);
  $("#brisageItemResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-brisage-item]");
    const item = brisage.results.find((entry) => String(entry.id) === button?.dataset.brisageItem);
    if (item) selectBrisageItem(item);
  });
  $("#brisageAddRune").addEventListener("click", addBrisageRuneRow);
  $("#brisageRunes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-rune]");
    if (!button) return;
    button.closest(".brisage-rune-row").remove();
    if (!$("#brisageRunes").children.length) addBrisageRuneRow();
    renderBrisagePreview();
  });
  $("#brisageRunes").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches(".brisage-rune-qty")) return;
    const row = event.target.closest(".brisage-rune-row");
    if (row !== $("#brisageRunes").lastElementChild) return;
    event.preventDefault();
    addBrisageRuneRow();
  });
  $("#brisageForm").addEventListener("input", () => {
    $("#brisageErrors").replaceChildren();
    renderBrisagePreview();
  });
  $("#brisageForm").addEventListener("submit", submitBrisage);
  $("#brisageForm").addEventListener("reset", (event) => {
    event.preventDefault();
    resetBrisageForm();
  });
  $("#brisageTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-brisage]");
    if (!button || !confirm("Supprimer ce brisage du suivi ?")) return;
    saveBrisageEntries(brisage.entries.filter((entry) => entry.id !== button.dataset.deleteBrisage));
    renderBrisageLog();
  });
  resetBrisageForm();
  renderBrisageLog();
}
