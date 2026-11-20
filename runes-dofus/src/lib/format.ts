const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const moneyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const XP_RATIO_DISPLAY_SCALE = 1000;

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatDensity(value: number) {
  return numberFormatter.format(round2(value));
}

export function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

export function formatQuantity(value: number) {
  return moneyFormatter.format(value);
}

export function formatMarketPrice(value: number | null) {
  return value === null ? "–" : formatMoney(value);
}

export function formatXpRatio(value: number | null) {
  if (!value) return "-";
  return numberFormatter.format(value * XP_RATIO_DISPLAY_SCALE);
}

export function formatChance(probability: number) {
  return `${Math.round(probability * 100)} %`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}
