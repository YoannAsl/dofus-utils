const BREEDING_GAUGE_MAX = 200_000;

function renderBreedingTable() {
  const fuels = BREEDING_FUELS[$("#breedingCategory input:checked").value];
  $("#breedingTable").innerHTML = fuels.map((fuel) => {
    const recharge = formatQuantity(fuel.recharge);
    const cap = fuel.cap === null ? null : formatQuantity(fuel.cap);
    return `
    <tr>
      <th scope="row">
        <span class="market-item-label">
          ${marketItemIcon(fuel)}
          ${escapeHtml(fuel.name)}
        </span>
        <span class="rune-meta breeding-gauge-summary">+${recharge} pts · ${cap === null ? "Jusqu’au max. de la jauge" : `Jusqu’à ${cap}`}</span>
      </th>
      <td class="num breeding-gauge">${recharge}</td>
      <td class="num breeding-gauge">${cap ?? "Max. de la jauge"}</td>
      <td>
        <input class="breeding-price-input" type="text" inputmode="numeric" autocomplete="off"
          data-fuel-id="${fuel.id}" aria-label="${escapeAttr(`Prix HDV de ${fuel.name} (kamas par unité)`)}">
      </td>
      <td class="num">
        <span data-fuel-cost></span>
        <div class="breeding-badges">
          <span class="badge ${cap === null ? "craft" : "neutral"}" data-best-tier hidden>
            ${cap === null ? "Meilleur jusqu’au max." : "Meilleur du palier"}
          </span>
        </div>
      </td>
      <td class="num" data-fuel-fill-cost></td>
    </tr>`;
  }).join("");
  renderBreedingPrices();
}

function renderBreedingPrices() {
  const fuels = BREEDING_FUELS[$("#breedingCategory input:checked").value];
  const rows = $("#breedingTable").rows;
  const caps = [...new Set(fuels.map((fuel) => fuel.cap ?? BREEDING_GAUGE_MAX))].sort((a, b) => a - b);
  const tierWidths = new Map(caps.map((cap, index) => [cap, cap - (caps[index - 1] ?? 0)]));
  const lowestCostByCap = new Map();
  const costs = fuels.map((fuel) => {
    const price = marketPriceOf(fuel.id);
    if (price === null) return null;

    const cost = (price * 10_000) / fuel.recharge;
    const tierWidth = tierWidths.get(fuel.cap ?? BREEDING_GAUGE_MAX);
    const unitsToFill = Math.ceil(tierWidth / fuel.recharge);
    const lowestTierCost = lowestCostByCap.get(fuel.cap) ?? Infinity;
    lowestCostByCap.set(fuel.cap, Math.min(cost, lowestTierCost));
    return { cost, fillCost: unitsToFill * price };
  });
  const knownCosts = costs.filter((cost) => cost !== null);

  fuels.forEach((fuel, index) => {
    const row = rows[index];
    const priceComparison = costs[index];
    syncMarketPriceInput(row.querySelector("input"), fuel.id);
    row.querySelector("[data-fuel-cost]").textContent = priceComparison === null ? "–" : formatMoney(priceComparison.cost);
    row.querySelector("[data-fuel-fill-cost]").textContent = priceComparison === null ? "–" : formatMoney(priceComparison.fillCost);
    row.querySelector("[data-best-tier]").hidden = priceComparison === null || priceComparison.cost !== lowestCostByCap.get(fuel.cap);
  });

  const status = $("#breedingStatus");
  const coverage = `${knownCosts.length} / ${fuels.length} prix renseignés`;
  if (status.textContent !== coverage) status.textContent = coverage;
}

function bindBreedingEvents() {
  const category = $("#breedingCategory");
  category.replaceChildren(...Object.keys(BREEDING_FUELS).map((name, index) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "breedingCategory";
    radio.value = name;
    radio.checked = index === 0;
    label.append(radio, name);
    return label;
  }));
  category.addEventListener("change", renderBreedingTable);

  const table = $("#breedingTable");
  table.addEventListener("error", (event) => {
    if (event.target.matches("img.item-icon")) event.target.hidden = true;
  }, true);
  table.addEventListener("change", (event) => {
    const input = event.target;
    if (input.matches("[data-fuel-id]")) commitMarketInput(input, input.dataset.fuelId);
  });
  table.addEventListener("input", (event) => {
    if (event.target.matches("[data-fuel-id]")) event.target.setCustomValidity("");
  });
  table.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("[data-fuel-id]")) event.target.blur();
  });
  renderBreedingTable();
}
