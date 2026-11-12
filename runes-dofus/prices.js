const PRICE_STORAGE_KEYS = {
  prices: "dofus-rune-prices-v1",
  itemPrices: "dofus-fm-item-prices-v1",
  eklamePrices: "dofus-eklame-prices-v1",
};

function createPriceStore(runeById, eklames) {
  const groups = Object.keys(PRICE_STORAGE_KEYS);
  const values = Object.fromEntries(groups.map((group) => [group, load(group)]));

  function load(group) {
    try {
      const saved = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEYS[group]));
      return saved && typeof saved === "object" && !Array.isArray(saved) ? parsePriceMap(saved) : {};
    } catch {
      return {};
    }
  }

  function replace(group, next) {
    localStorage.setItem(PRICE_STORAGE_KEYS[group], JSON.stringify(next));
    values[group] = next;
  }

  function groupForItem(id) {
    if (runeById.has(String(id))) return "prices";
    if (eklames.some((eklame) => eklame.id === String(id))) return "eklamePrices";
    return "itemPrices";
  }

  function get(group, id) {
    const price = Number(values[group][id]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function set(group, id, price) {
    const next = { ...values[group] };
    if (price === null) delete next[id];
    else next[id] = price;
    replace(group, next);
  }

  function merge(payload) {
    const incoming = {
      prices: parsePriceMap(payload.prices || payload),
      itemPrices: parsePriceMap(payload.itemPrices),
      eklamePrices: parsePriceMap(payload.eklamePrices),
    };
    for (const group of groups) replace(group, { ...values[group], ...incoming[group] });
  }

  function clear() {
    for (const group of groups) replace(group, {});
  }

  function snapshot() {
    return Object.fromEntries(groups.map((group) => [group, { ...values[group] }]));
  }

  return { groupForItem, get, set, merge, clear, snapshot };
}

function parsePrice(value) {
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : null;
}

function parsePriceMap(values) {
  const next = {};
  for (const [id, value] of Object.entries(values || {})) {
    if (!/^\d+$/.test(id)) continue;
    const parsed = parsePrice(value);
    if (parsed) next[id] = parsed;
  }
  return next;
}
