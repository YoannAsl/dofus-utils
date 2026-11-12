const breedingRatioFormatter = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 4 });

function renderBreedingTable() {
  const fuels = BREEDING_FUELS[$("#breedingCategory").value];
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
        <span data-fuel-ratio></span>
        <span class="badge craft" hidden>Meilleur ratio</span>
      </td>
    </tr>`;
  }).join("");
  renderBreedingPrices();
}

function renderBreedingPrices() {
  const fuels = BREEDING_FUELS[$("#breedingCategory").value];
  const rows = $("#breedingTable").rows;
  const ratios = fuels.map((fuel) => {
    const price = marketPriceOf(fuel.id);
    return price === null ? 0 : (fuel.recharge * 1000) / price;
  });
  const bestRatio = Math.max(...ratios);

  fuels.forEach((fuel, index) => {
    const row = rows[index];
    const ratio = ratios[index];
    syncMarketPriceInput(row.querySelector("input"), fuel.id);
    row.querySelector("[data-fuel-ratio]").textContent = ratio ? breedingRatioFormatter.format(ratio) : "–";
    row.querySelector(".badge").hidden = ratio === 0 || ratio !== bestRatio;
  });

  const pricedCount = ratios.filter((ratio) => ratio > 0).length;
  const status = $("#breedingStatus");
  const coverage = `${pricedCount} / ${fuels.length} prix renseignés`;
  if (status.textContent !== coverage) status.textContent = coverage;
}

function bindBreedingEvents() {
  const category = $("#breedingCategory");
  category.replaceChildren(...Object.keys(BREEDING_FUELS).map((name) => new Option(name, name)));
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
