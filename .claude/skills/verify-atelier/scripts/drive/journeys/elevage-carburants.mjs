export default async function ({ page, base, step, shot, aria, check }) {
  step("Open Élevage › Carburants");
  await page.goto(`${base}/elevage?tab=carburants`);
  await page.getByRole("tab", { name: "Carburants", selected: true }).waitFor();
  const table = page.getByRole("table", { name: "Comparaison des carburants d’élevage" });
  await table.waitFor();
  check((await table.getByRole("row").count()) > 1, "the fuel table lists fuels for the first category");
  await aria("fuels-default", table);

  const categories = page.getByRole("radiogroup", { name: "Catégorie" }).getByRole("radio");
  const count = await categories.count();
  check(count > 1, `${count} fuel categories are offered`);
  step("Pick the second category; the URL keeps it");
  await categories.nth(1).click();
  await page.waitForURL(/category=/);
  check(new URL(page.url()).searchParams.has("category"), "?category= is in the URL");

  step("Enter 1234 as the price of the first fuel and reload");
  const price = table.getByRole("textbox", { name: /^Prix HDV de .* \(kamas par unité\)$/ }).first();
  const label = await price.getAttribute("aria-label");
  await price.fill("1234");
  await price.press("Tab");
  await shot("priced");
  await page.reload();
  const restored = await page.getByRole("textbox", { name: label, exact: true }).inputValue();
  check(restored.replace(/\D/g, "") === "1234", `${label} survives a reload`);
  await aria("fuels-priced", table);
}
