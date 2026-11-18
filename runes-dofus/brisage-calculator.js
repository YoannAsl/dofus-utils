const BRISAGE_COEFFICIENT_STORAGE_KEY = "dofus-brisage-coefficients-v1";
const shatterSim = {
  item: null,
  lines: [],
  exos: [],
  coefficients: {},
  loadToken: 0,
  nextExoKey: 1,
};

function loadShatterCoefficients() {
  try {
    return parseShatterCoefficients(JSON.parse(localStorage.getItem(BRISAGE_COEFFICIENT_STORAGE_KEY)));
  } catch {
    return {};
  }
}

function parseShatterCoefficients(values) {
  const next = {};
  for (const [id, value] of Object.entries(values && typeof values === "object" ? values : {})) {
    const coefficient = Number(value);
    if (/^\d+$/.test(id) && Number.isFinite(coefficient) && coefficient > 0) next[id] = coefficient;
  }
  return next;
}

function saveShatterCoefficients(next) {
  localStorage.setItem(BRISAGE_COEFFICIENT_STORAGE_KEY, JSON.stringify(next));
  shatterSim.coefficients = next;
}

function mergeShatterCoefficients(incoming) {
  saveShatterCoefficients({ ...shatterSim.coefficients, ...parseShatterCoefficients(incoming) });
}

// A characteristic shatters into its smallest rune; the other tiers only matter for prices elsewhere.
function getBaseRunesByCharacteristic() {
  const byCharacteristic = new Map();
  for (const rune of runes) {
    if (rune.characteristic == null || rune.effect.weight <= 0) continue;
    const current = byCharacteristic.get(rune.characteristic);
    if (!current || rune.value < current.value) byCharacteristic.set(rune.characteristic, rune);
  }
  return byCharacteristic;
}

function buildShatterLines(item) {
  const baseRunes = getBaseRunesByCharacteristic();
  const runeEffectIds = new Set(runes.map((rune) => rune.effectId));
  return (Array.isArray(item.effects) ? item.effects : []).flatMap((effect, index) => {
    const rune = baseRunes.get(effect.characteristic);
    const from = Math.abs(Number(effect.from));
    let to = Math.abs(Number(effect.to));
    if (!rune || !Number.isFinite(from)) return [];
    if (!Number.isFinite(to) || to < from) to = from;
    // DofusDB stores maluses as their own effect with a positive range, e.g. 157 "-# Force".
    const negative = !runeEffectIds.has(effect.effectId);
    return [{
      key: `effect-${index}`,
      rune,
      label: `${negative ? "-" : ""}${rune.effect.label}`,
      from,
      to,
      jet: Math.round((from + to) / 2),
      negative,
    }];
  });
}

async function selectShatterItem(summary) {
  const token = ++shatterSim.loadToken;
  $("#brisageSimStatus").textContent = "Chargement des caractéristiques…";
  $("#brisageSimDetail").hidden = true;
  try {
    const item = await fetchMarketData(marketQuery(`items/${Number(summary.id)}`,
      ["id", "name.fr", "level", "typeId", "img", "iconId", "effects"]));
    if (token !== shatterSim.loadToken) return;
    shatterSim.item = item;
    shatterSim.lines = buildShatterLines(item);
    shatterSim.exos = [];
    $("#brisageSimStatus").textContent = shatterSim.lines.length ? "" : "Cet objet n’a aucune caractéristique qui donne des runes.";
    $("#brisageSimItem").innerHTML = `${marketItemIcon(item)}<span>${copyNameButton(marketItemName(item))}
      <span class="rune-meta">Niv. ${escapeHtml(item.level ?? "–")} · n°${Number(item.id)}</span></span>`;
    $("#brisageSimCoef").value = shatterSim.coefficients[item.id] ?? 100;
    $("#brisageSimPrice").setCustomValidity("");
    $("#brisageSimDetail").hidden = false;
    renderShatterTable();
  } catch {
    if (token === shatterSim.loadToken) $("#brisageSimStatus").textContent = "Objet indisponible sur DofusDB. Réessaie.";
  }
}

function jetControl(key, value, from, to, negative, label) {
  return `
    <div class="brisage-jet">
      ${from === null ? "" : `<span class="rune-meta">${negative ? "-" : ""}${formatQuantity(from)}</span>`}
      <button type="button" class="brisage-jet-step" data-jet-step="-1" data-jet-key="${key}" aria-label="${escapeAttr(`Diminuer ${label}`)}">−</button>
      <input type="number" class="brisage-jet-input" data-jet-key="${key}" value="${escapeAttr(value)}"
        min="${from ?? 1}" ${to === null ? "" : `max="${to}"`} step="1" inputmode="numeric" aria-label="${escapeAttr(`Jet ${label}`)}">
      <button type="button" class="brisage-jet-step" data-jet-step="1" data-jet-key="${key}" aria-label="${escapeAttr(`Augmenter ${label}`)}">+</button>
      ${to === null ? "" : `<span class="rune-meta">${negative ? "-" : ""}${formatQuantity(to)}</span>`}
    </div>`;
}

function runeCell(rune) {
  return `<span class="market-item-label"><img class="rune-icon" src="${escapeAttr(rune.img)}" alt="" loading="lazy">
    ${escapeHtml(rune.name.replace(/^Rune\s+/, ""))}</span>`;
}

function runePriceCell(rune) {
  return `<input class="brisage-sim-price" data-id="${rune.id}" type="text" inputmode="numeric" autocomplete="off"
    placeholder="Prix" aria-label="${escapeAttr(`Prix HDV ${rune.name} (kamas par unité)`)}">`;
}

function renderShatterTable() {
  const lineRows = shatterSim.lines.map((line) => `
    <tr class="${line.negative ? "is-negative" : ""}" data-line="${line.key}">
      <th scope="row">${escapeHtml(line.label)}</th>
      <td>${jetControl(line.key, line.jet, line.from, line.to, line.negative, line.label)}</td>
      <td>${line.negative ? "" : runeCell(line.rune)}</td>
      <td>${line.negative ? "" : runePriceCell(line.rune)}</td>
      <td class="num" data-runes-without></td>
      <td class="num brisage-focus-split" data-kamas-without></td>
      <td class="num" data-runes-with></td>
      <td class="num" data-kamas-with></td>
    </tr>`);
  const usedCharacteristics = new Set([...shatterSim.lines, ...shatterSim.exos].map((line) => line.rune?.characteristic));
  const exoRows = shatterSim.exos.map((exo) => {
    const options = [...getBaseRunesByCharacteristic().values()]
      .filter((rune) => rune === exo.rune || !usedCharacteristics.has(rune.characteristic))
      .sort((a, b) => a.effect.label.localeCompare(b.effect.label, "fr"));
    return `
      <tr class="is-exo" data-line="${exo.key}">
        <th scope="row">
          <span class="brisage-exo-label">
            <button type="button" class="brisage-exo-remove" data-remove-exo="${exo.key}" aria-label="Retirer cet exo">×</button>
            <select class="brisage-exo-select" data-exo-key="${exo.key}" aria-label="Caractéristique exo">
              <option value="">Exo…</option>
              ${options.map((rune) => `<option value="${rune.id}" ${rune === exo.rune ? "selected" : ""}>${escapeHtml(rune.effect.label)}</option>`).join("")}
            </select>
          </span>
        </th>
        <td>${exo.rune ? jetControl(exo.key, exo.jet, null, null, false, exo.rune.effect.label) : ""}</td>
        <td>${exo.rune ? runeCell(exo.rune) : ""}</td>
        <td>${exo.rune ? runePriceCell(exo.rune) : ""}</td>
        <td class="num" data-runes-without></td>
        <td class="num brisage-focus-split" data-kamas-without></td>
        <td class="num" data-runes-with></td>
        <td class="num" data-kamas-with></td>
      </tr>`;
  });
  $("#brisageSimTable").innerHTML = lineRows.join("") + exoRows.join("");
  renderShatterValues();
}

function getShatterLineByKey(key) {
  return shatterSim.lines.find((line) => line.key === key) || shatterSim.exos.find((exo) => exo.key === key) || null;
}

function readShatterCoefficient() {
  const coefficient = Number($("#brisageSimCoef").value.replace(",", "."));
  return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : null;
}

function renderShatterValues() {
  const item = shatterSim.item;
  if (!item) return;
  const activeLines = [...shatterSim.lines, ...shatterSim.exos.filter((exo) => exo.rune)];
  const coefficient = readShatterCoefficient();
  const cost = marketPriceOf(item.id);
  syncMarketPriceInput($("#brisageSimPrice"), item.id);
  for (const input of $("#brisageSimTable").querySelectorAll(".brisage-sim-price")) {
    syncMarketPriceInput(input, input.dataset.id);
  }

  const result = coefficient === null ? null : calculateShatter({
    level: Number(item.level) || 1,
    coefficient,
    lines: activeLines.map((line) => ({
      jet: Math.max(0, Number(line.jet) || 0),
      weight: line.rune.effect.weight,
      runeValue: line.rune.value,
      negative: Boolean(line.negative),
      exo: shatterSim.exos.includes(line),
      price: line.negative ? null : priceOf(line.rune),
    })),
  });
  const ranks = new Map((result?.options ?? []).slice(0, 3).map((option, rank) => [option.index, rank + 1]));
  const formatRunes = (value) => (value === null ? "" : formatter.format(value));
  const formatKamas = (value) => (value === null ? "" : `${formatMoney(value)} k`);

  activeLines.forEach((line, index) => {
    const row = $("#brisageSimTable").querySelector(`[data-line="${line.key}"]`);
    const values = result?.rows[index];
    row.querySelector("[data-runes-without]").textContent = formatRunes(values?.runesWithoutFocus ?? null);
    row.querySelector("[data-kamas-without]").textContent = formatKamas(values?.kamasWithoutFocus ?? null);
    row.querySelector("[data-runes-with]").textContent = formatRunes(values?.runesWithFocus ?? null);
    const kamasWith = row.querySelector("[data-kamas-with]");
    kamasWith.textContent = formatKamas(values?.kamasWithFocus ?? null);
    kamasWith.dataset.rank = ranks.get(index) ?? "";
  });
  for (const exo of shatterSim.exos.filter((entry) => !entry.rune)) {
    const row = $("#brisageSimTable").querySelector(`[data-line="${exo.key}"]`);
    for (const cell of row.querySelectorAll("[data-runes-without], [data-kamas-without], [data-runes-with], [data-kamas-with]")) {
      cell.textContent = "";
    }
  }

  const total = $("#brisageSimTotal");
  total.dataset.rank = ranks.get(null) ?? "";
  total.innerHTML = result === null
    ? "Coefficient requis"
    : result.totalWithoutFocus === null
      ? `Prix requis${formatMissing(result.missing)}`
      : formatKamas(result.totalWithoutFocus);

  const best = result?.best ?? null;
  const bestName = best === null ? null : best.index === null ? "Sans focus" : `Focus ${activeLines[best.index].rune.effect.label}`;
  $("#brisageSimBest").textContent = best ? `${formatMoney(best.value)} k` : "–";
  $("#brisageSimBestMeta").textContent = bestName ?? (result?.missing ? "Renseigne le prix des runes." : "Renseigne le coefficient.");
  $("#brisageSimProfit").innerHTML = best && cost !== null ? formatGain(best.value - cost) : "–";
  $("#brisageSimProfitMeta").textContent = cost === null ? "Renseigne le prix de l’objet." : `Pour un objet à ${formatMoney(cost)} k.`;
  const breakEven = best && cost !== null ? calculateBreakEvenCoefficient(cost, coefficient, best.value) : null;
  $("#brisageSimBreakEven").textContent = breakEven === null ? "–" : `${formatQuantity(breakEven)} %`;
  $("#brisageSimBreakEvenMeta").textContent = breakEven === null
    ? "Coefficient minimum pour rentrer dans tes frais."
    : coefficient >= breakEven ? "Le coefficient actuel est rentable." : "Le coefficient actuel n’est pas rentable.";
}

function changeShatterJet(key, value) {
  const line = getShatterLineByKey(key);
  if (!line) return;
  const max = line.to ?? Infinity;
  const min = line.from ?? 1;
  const jet = Math.round(Number(value));
  line.jet = Number.isFinite(jet) ? Math.min(max, Math.max(min, jet)) : min;
}

function setShatterJets(preset) {
  for (const line of shatterSim.lines) {
    line.jet = preset === "min" ? line.from : preset === "max" ? line.to : Math.round((line.from + line.to) / 2);
  }
  for (const input of $("#brisageSimTable").querySelectorAll(".brisage-jet-input")) {
    const line = getShatterLineByKey(input.dataset.jetKey);
    if (line) input.value = line.jet;
  }
  renderShatterValues();
}

function recordShatterInLog() {
  const item = shatterSim.item;
  if (!item) return;
  selectBrisageItem(item);
  const cost = marketPriceOf(item.id);
  if (cost !== null) $("#brisageUnitCost").value = cost;
  const coefficient = readShatterCoefficient();
  if (coefficient !== null) $("#brisageCoefficient").value = String(coefficient).replace(".", ",");
  renderBrisagePreview();
  $("#brisageForm").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#brisageRunes .brisage-rune-name")?.focus({ preventScroll: true });
}

function bindShatterCalculatorEvents() {
  shatterSim.coefficients = loadShatterCoefficients();
  bindEquipmentSearch($("#brisageSimSearch"), $("#brisageSimResults"), selectShatterItem);

  const table = $("#brisageSimTable");
  bindPriceTableInputs(table, ".brisage-sim-price");
  table.addEventListener("error", (event) => {
    if (event.target.matches("img")) event.target.hidden = true;
  }, true);
  table.addEventListener("input", (event) => {
    if (!event.target.matches(".brisage-jet-input")) return;
    const line = getShatterLineByKey(event.target.dataset.jetKey);
    if (line && event.target.value !== "") line.jet = Number(event.target.value);
    renderShatterValues();
  });
  table.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches(".brisage-jet-input")) {
      changeShatterJet(target.dataset.jetKey, target.value);
      target.value = getShatterLineByKey(target.dataset.jetKey)?.jet ?? "";
      renderShatterValues();
    } else if (target.matches(".brisage-exo-select")) {
      const exo = getShatterLineByKey(target.dataset.exoKey);
      exo.rune = runeById.get(target.value) || null;
      renderShatterTable();
      $(`#brisageSimTable [data-exo-key="${exo.key}"]`)?.focus();
    }
  });
  table.addEventListener("click", (event) => {
    const step = event.target.closest("[data-jet-step]");
    if (step) {
      const line = getShatterLineByKey(step.dataset.jetKey);
      changeShatterJet(step.dataset.jetKey, Number(line.jet) + Number(step.dataset.jetStep));
      table.querySelector(`.brisage-jet-input[data-jet-key="${step.dataset.jetKey}"]`).value = line.jet;
      renderShatterValues();
      return;
    }
    const remove = event.target.closest("[data-remove-exo]");
    if (remove) {
      shatterSim.exos = shatterSim.exos.filter((exo) => exo.key !== remove.dataset.removeExo);
      renderShatterTable();
      $("#brisageSimAddExo").focus();
    }
  });
  $("#brisageSimAddExo").addEventListener("click", () => {
    const key = `exo-${shatterSim.nextExoKey++}`;
    shatterSim.exos.push({ key, rune: null, jet: 1, from: null, to: null });
    renderShatterTable();
    $(`#brisageSimTable [data-exo-key="${key}"]`).focus();
  });
  $("#brisageSimPresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-jet-preset]");
    if (button) setShatterJets(button.dataset.jetPreset);
  });
  $("#brisageSimCoef").addEventListener("input", renderShatterValues);
  $("#brisageSimCoef").addEventListener("change", () => {
    const coefficient = readShatterCoefficient();
    if (!shatterSim.item || coefficient === null) return;
    saveShatterCoefficients({ ...shatterSim.coefficients, [shatterSim.item.id]: coefficient });
  });
  $("#brisageSimPrice").addEventListener("change", (event) => commitMarketInput(event.target, shatterSim.item.id));
  $("#brisageSimPrice").addEventListener("input", (event) => event.target.setCustomValidity(""));
  for (const input of [$("#brisageSimPrice"), $("#brisageSimCoef")]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.target.blur();
    });
  }
  $("#brisageSimRecord").addEventListener("click", recordShatterInLog);
}
