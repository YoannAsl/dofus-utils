const MARKET_PAGE_SIZE = 50;
const market = {
  page: 0,
  items: [],
  selected: null,
  ingredients: [],
  searchToken: 0,
  recipeToken: 0,
  searchTimer: null,
  itemTypes: null,
};
const MARKET_ITEM_FIELDS = ["id", "name.fr", "level", "typeId", "hasRecipe", "img", "iconId"];

function marketPriceOf(id) {
  return priceStore.get(priceStore.groupForItem(id), id);
}

function marketQuery(path, fields = []) {
  const url = new URL(`${DOFUSDB_API_BASE}/${path}`);
  fields.forEach((field, index) => url.searchParams.set(`$select[${index}]`, field));
  return url;
}

async function fetchMarketData(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`DofusDB HTTP ${response.status}`);
  return response.json();
}

async function getMarketItemTypes() {
  if (market.itemTypes) return market.itemTypes;
  const url = marketQuery("item-types", ["id", "categoryId", "name.fr"]);
  url.searchParams.set("$sort[id]", "1");
  url.searchParams.set("$limit", MARKET_PAGE_SIZE);
  const types = [];
  let total;
  do {
    url.searchParams.set("$skip", types.length);
    const page = await fetchMarketData(url);
    if (!Array.isArray(page.data) || (!page.data.length && types.length < page.total)) {
      throw new Error("Types d’objets incomplets");
    }
    types.push(...page.data);
    total = page.total;
  } while (types.length < total);
  market.itemTypes = types;
  return types;
}

function marketNamePattern(value) {
  const parts = normalizeText(value).match(/[a-z0-9œæ]+/g) || [];
  return parts
    .map((part) => part.replace(/oe|œ/g, "(?:oe|œ)").replace(/ae|æ/g, "(?:ae|æ)"))
    .join("[^a-z0-9œæ]*");
}

async function findMarketOcrItems(name) {
  const pattern = marketNamePattern(name || "");
  if (!pattern) return [];

  // A clipped capture can cut off the last word of a long breeding fuel name.
  const fuelName = new RegExp(`^${pattern}[a-z0-9œæ]*$`);
  const fuels = Object.values(BREEDING_FUELS).flat()
    .filter((fuel) => fuelName.test(normalizeText(fuel.name)));
  if (fuels.length) return fuels;

  const url = marketQuery("items", MARKET_ITEM_FIELDS);
  url.searchParams.set("$limit", MARKET_PAGE_SIZE);
  url.searchParams.set("slug.fr[$regex]", `^${pattern}$`);
  const result = await fetchMarketData(url);
  return result.data;
}

function queueMarketSearch() {
  clearTimeout(market.searchTimer);
  market.searchToken++;
  market.page = 0;
  $("#marketStatus").textContent = "Recherche…";
  $("#marketPages").hidden = true;
  market.searchTimer = setTimeout(searchMarket, 250);
}

async function searchMarket() {
  const token = ++market.searchToken;
  const search = $("#marketSearch").value.trim().slice(0, 120);
  const category = $("#marketCategory").value;
  const typeSelect = $("#marketType");
  $("#marketStatus").textContent = "Chargement du catalogue…";
  $("#marketRetry").hidden = true;
  $("#marketPages").hidden = true;
  $("#marketResults").replaceChildren();
  market.items = [];

  try {
    const url = marketQuery("items", MARKET_ITEM_FIELDS);
    url.searchParams.set("$sort[id]", "-1");
    url.searchParams.set("$limit", MARKET_PAGE_SIZE);
    url.searchParams.set("$skip", market.page * MARKET_PAGE_SIZE);
    if (/^\d+$/.test(search)) {
      url.searchParams.set("id", search);
    } else if (search) {
      const pattern = marketNamePattern(search);
      if (pattern) url.searchParams.set("slug.fr[$regex]", pattern);
    }
    const types = await getMarketItemTypes().catch((error) => {
      if (category !== "all") throw error;
      return [];
    });
    if (token !== market.searchToken) return;
    const categories = category === "market" ? [0, 2] : [Number(category)];
    const categoryTypes = category === "all" ? types : types.filter((type) => categories.includes(type.categoryId));
    if (typeSelect.dataset.category !== category || typeSelect.disabled) {
      setItemTypeOptions(typeSelect, categoryTypes.map((type) => [type.id, localizedName(type.name) || `Type ${type.id}`]));
      typeSelect.dataset.category = category;
    }
    if (typeSelect.value) {
      url.searchParams.set("typeId", typeSelect.value);
    } else if (category !== "all") {
      for (const type of categoryTypes) url.searchParams.append("typeId[$in][]", type.id);
    }
    const { data, total } = await fetchMarketData(url);
    if (token !== market.searchToken) return;
    market.items = data;
    renderMarketResults();
    $("#marketStatus").textContent = total ? `${formatQuantity(total)} objets` : "Aucun objet trouvé.";
    const pageCount = Math.ceil(total / MARKET_PAGE_SIZE);
    $("#marketPages").hidden = pageCount <= 1;
    $("#marketPage").textContent = `Page ${market.page + 1} / ${pageCount}`;
    $("#marketPrev").disabled = market.page === 0;
    $("#marketNext").disabled = market.page + 1 >= pageCount;
  } catch {
    if (token !== market.searchToken) return;
    $("#marketStatus").textContent = "Catalogue DofusDB indisponible.";
    $("#marketRetry").hidden = false;
  }
}

function marketItemName(item) {
  return localizedName(item.name) || `Objet n°${item.id}`;
}

function marketItemIcon(item) {
  if (!item) return "";
  return `<img class="item-icon" src="${escapeAttr(getItemImage(item))}" alt="" loading="lazy">`;
}

function renderMarketResults() {
  const typeNames = new Map((market.itemTypes ?? []).map((type) => [type.id, localizedName(type.name)]));
  $("#marketResults").innerHTML = market.items.map((item) => {
    const name = marketItemName(item);
    return `
      <tr>
        <td><div class="market-item-label">
          <button type="button" class="market-item-button market-item-label" data-market-id="${Number(item.id)}">
            ${marketItemIcon(item)}
            <span>${escapeHtml(name)}</span>
          </button>
          <button type="button" class="icon-button" data-copy-name="${escapeAttr(name)}"
            aria-label="${escapeAttr(`Copier ${name}`)}">Copier</button>
        </div></td>
        <td>${escapeHtml(typeNames.get(item.typeId) || localizedName(item.type?.name) || "–")}</td>
        <td>${escapeHtml(item.level ?? "–")}</td>
        <td data-market-price="${Number(item.id)}"></td>
      </tr>`;
  }).join("");
  renderMarketPrices();
}

function formatMarketPrice(value) {
  return value === null ? "–" : formatMoney(value);
}

async function openMarketItem(item) {
  const token = ++market.recipeToken;
  market.selected = item;
  market.ingredients = [];
  $("#marketDetail").hidden = false;
  $("#marketRecipeTable").hidden = true;
  $("#marketIngredients").replaceChildren();
  $("#marketItemName").innerHTML = `${marketItemIcon(item)}${copyNameButton(marketItemName(item))}`;
  $("#marketItemPrice").setCustomValidity("");
  $("#marketItemMeta").textContent = [
    localizedName(item.type?.name || market.itemTypes?.find((type) => type.id === item.typeId)?.name),
    item.level != null ? `Niv. ${item.level}` : "",
    `n°${item.id}`,
  ].filter(Boolean).join(" · ");
  renderMarketPrices();
  $("#marketItemName").focus();

  const status = $("#marketRecipeStatus");
  status.textContent = item.hasRecipe ? "Chargement de la recette…" : "Aucune recette.";
  if (!item.hasRecipe) return;

  try {
    const recipe = await fetchMarketData(marketQuery(`recipes/${Number(item.id)}`));
    if (token !== market.recipeToken) return;
    const ingredientsById = new Map(recipe.ingredients.map((entry) => [entry.id, entry]));
    if (!recipe.ingredientIds.length || recipe.ingredientIds.length !== recipe.quantities.length
      || recipe.quantities.some((quantity) => !Number.isInteger(quantity) || quantity <= 0)) {
      throw new Error("Recette incomplète");
    }
    market.ingredients = recipe.ingredientIds.map((id, index) => ({ id, quantity: recipe.quantities[index] }));
    $("#marketIngredients").innerHTML = market.ingredients.map(({ id, quantity }) => {
      const ingredient = ingredientsById.get(id);
      const name = marketItemName(ingredient ?? { id });
      return `
        <tr>
          <td><div class="market-item-label">
            ${marketItemIcon(ingredient)}
            ${copyNameButton(name)}
          </div></td>
          <td>${formatQuantity(quantity)}</td>
          <td><input class="market-ingredient-price" data-market-input="${Number(id)}" type="text" inputmode="numeric"
            aria-label="${escapeAttr(`Prix unitaire · ${name}`)}" autocomplete="off"></td>
          <td data-market-subtotal></td>
        </tr>`;
    }).join("");
    $("#marketRecipeTable").hidden = false;
    renderMarketPrices();
  } catch {
    if (token === market.recipeToken) status.textContent = "Recette indisponible. Rouvre l’objet pour réessayer.";
  }
}

function renderMarketOcrTarget() {
  $("#marketOcrTarget").hidden = !state.ocr.result || state.ocr.loading;
}

function renderMarketPrices(changedId) {
  const matches = (id) => changedId === undefined || String(id) === String(changedId);
  for (const cell of $("#marketResults").querySelectorAll("[data-market-price]")) {
    const id = cell.dataset.marketPrice;
    if (matches(id)) cell.textContent = formatMarketPrice(marketPriceOf(id));
  }
  if (!market.selected) return;
  if (matches(market.selected.id)) syncMarketPriceInput($("#marketItemPrice"), market.selected.id);
  if (!market.ingredients.some(({ id }) => matches(id))) return;

  const { subtotals, total, missing } = calculateRecipeCost(market.ingredients, marketPriceOf);
  const rows = $("#marketIngredients").rows;
  market.ingredients.forEach(({ id }, index) => {
    if (!matches(id)) return;
    const row = rows[index];
    syncMarketPriceInput(row.querySelector("input"), id);
    const subtotal = subtotals[index];
    row.querySelector("[data-market-subtotal]").textContent = subtotal === null
      ? "Prix manquant"
      : `${formatMarketPrice(subtotal)} k`;
  });
  $("#marketRecipeStatus").textContent = missing
    ? `Coût incomplet · ${missing} prix manquant${missing === 1 ? "" : "s"} · Sous-total connu ${formatMarketPrice(total)} k`
    : `Coût de craft · ${formatMarketPrice(total)} k`;
}

function syncMarketPriceInput(input, id) {
  if (input === document.activeElement) return;
  const price = marketPriceOf(id);
  if (input.value !== String(price ?? "")) {
    input.value = price ?? "";
    input.setCustomValidity("");
  }
}

function commitMarketInput(input, id) {
  const price = parsePrice(input.value);
  if (price === null && input.value.trim()) {
    input.setCustomValidity("Saisis un prix positif ou vide le champ.");
    input.reportValidity();
    return;
  }
  updatePrice(priceStore.groupForItem(id), id, price);
  input.value = price ?? "";
}

function bindMarketEvents() {
  $("#marketView").addEventListener("error", (event) => {
    if (event.target.matches("img.item-icon")) event.target.hidden = true;
  }, true);
  $("#marketSearch").addEventListener("input", queueMarketSearch);
  $("#marketCategory").addEventListener("change", () => {
    setItemTypeOptions($("#marketType"), []);
    queueMarketSearch();
  });
  $("#marketType").addEventListener("change", queueMarketSearch);
  $("#marketRetry").addEventListener("click", searchMarket);
  $("#marketPrev").addEventListener("click", () => {
    market.page--;
    searchMarket();
  });
  $("#marketNext").addEventListener("click", () => {
    market.page++;
    searchMarket();
  });
  $("#marketResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-market-id]");
    const item = market.items.find((entry) => String(entry.id) === button?.dataset.marketId);
    if (item) openMarketItem(item);
  });
  $("#marketClose").addEventListener("click", () => {
    const button = $("#marketResults").querySelector(`[data-market-id="${Number(market.selected.id)}"]`);
    market.recipeToken++;
    market.selected = null;
    market.ingredients = [];
    $("#marketDetail").hidden = true;
    (button || $("#marketSearch")).focus();
  });
  $("#marketDetail").addEventListener("change", (event) => {
    const input = event.target;
    if (input.id === "marketItemPrice") commitMarketInput(input, market.selected.id);
    else if (input.matches("[data-market-input]")) commitMarketInput(input, input.dataset.marketInput);
  });
  $("#marketDetail").addEventListener("input", (event) => {
    if (event.target.matches("input")) event.target.setCustomValidity("");
  });
  $("#marketDetail").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input")) event.target.blur();
  });
  $("#marketOcrTarget").addEventListener("click", () => selectMarketOcrTarget(market.selected));
}
