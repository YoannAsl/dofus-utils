const ITEM = "Bottes Lunaires";
const INGREDIENT_PRICE = "100";
const RECIPE_RESPONSE = /api\.dofusdb\.fr\/recipes\/\d+/;
const PRICES_KEY = "dofus-fm-item-prices-v1";

async function pickEquipment(page, label) {
  await page.getByLabel(label).fill(ITEM);
  const option = page.getByRole("button", { name: new RegExp(`^${ITEM} Niv\\.`) }).first();
  await option.waitFor({ timeout: 20_000 });
  await option.click();
}

export default async function ({ page, base, step, shot, aria, storage, save, check }) {
  step("Open Brisage with no price saved at all");
  await page.goto(`${base}/brisage`);
  await page.getByLabel("Objet à briser").waitFor();

  step(`Pick "${ITEM}" in the calculator while its ingredients have no price`);
  const firstRecipe = page.waitForResponse(RECIPE_RESPONSE, { timeout: 20_000 });
  await pickEquipment(page, "Objet à briser");
  await firstRecipe;
  await page.getByRole("table", { name: "Runes par caractéristique" }).locator("tbody tr").first().waitFor();
  await page.waitForTimeout(500);
  check((await page.locator("#shatterPrice").inputValue()) === "", "with unpriced ingredients, the calculator leaves the item price empty");
  check(!Object.keys((await storage(PRICES_KEY)) ?? {}).length, `${PRICES_KEY} stays empty when the recipe cost is incomplete`);
  await shot("calculator-no-ingredient-prices");

  step(`Open Prix, search "${ITEM}" and open it from the catalogue`);
  await page.goto(`${base}/prix`);
  await page.locator("#marketSearch").fill(ITEM);
  const catalogue = page.getByRole("table", { name: "Catalogue des objets" });
  const row = catalogue.getByRole("button", { name: new RegExp(`${ITEM}$`) }).first();
  await row.waitFor({ timeout: 20_000 });
  await row.click();
  const detail = page.getByRole("region", { name: ITEM }).or(page.locator("[aria-labelledby=marketItemName]"));
  const ingredients = page.getByRole("table", { name: "Ingrédients de la recette" });
  await ingredients.waitFor({ timeout: 20_000 });
  const idText = (await detail.getByText(/n°\d+/).textContent()) ?? "";
  const itemId = idText.match(/n°(\d+)/)?.[1];
  check(Boolean(itemId), `the detail card shows the item id n°${itemId}`);

  step(`Price every ingredient at ${INGREDIENT_PRICE} k`);
  const inputs = ingredients.getByRole("textbox", { name: /^Prix unitaire · / });
  const count = await inputs.count();
  check(count > 0, `${count} ingredient price inputs`);
  for (let index = 0; index < count; index++) {
    await inputs.nth(index).fill(INGREDIENT_PRICE);
    await inputs.nth(index).press("Tab");
  }
  const status = detail.getByRole("status");
  await status.getByText(/^Coût de craft · /).waitFor();
  const statusText = (await status.textContent()) ?? "";
  const craftCost = Number(statusText.replace(/[^\d]/g, ""));
  check(craftCost > 0, `the recipe status reads "${statusText.trim()}"`);
  check((await page.locator("#marketItemPrice").inputValue()) === "", "the item's own HDV price is still empty");
  await aria("recipe", ingredients);
  await shot("ingredients-priced");

  step(`Back on Brisage, pick "${ITEM}" in the log form: Coût unitaire (k) fills with the craft cost`);
  await page.goto(`${base}/brisage`);
  await pickEquipment(page, "Objet brisé");
  const unitCost = page.getByLabel("Coût unitaire (k)");
  await page.waitForFunction(
    ([selectorValue]) => [...document.querySelectorAll("input")].some((input) => input.value === selectorValue),
    [String(craftCost)],
    { timeout: 20_000 },
  );
  check(Number((await unitCost.inputValue()).replace(/[^\d]/g, "")) === craftCost, `Coût unitaire (k) is ${craftCost}, the craft cost`);
  check(!(await storage(PRICES_KEY))?.[itemId], "the log form does not save a price for the item");
  await shot("log-prefilled");

  step(`Pick "${ITEM}" in the calculator: its price fills with the craft cost and is saved`);
  await pickEquipment(page, "Objet à briser");
  await page.waitForFunction((value) => document.querySelector("#shatterPrice")?.value === value, String(craftCost), { timeout: 20_000 });
  check((await page.locator("#shatterPrice").inputValue()) === String(craftCost), `#shatterPrice is ${craftCost}`);
  await shot("calculator-prefilled");

  step("Reload: the saved price survives and shows again");
  await page.reload();
  await page.getByLabel("Objet à briser").waitFor();
  const prices = await storage(PRICES_KEY);
  await save("item-prices.json", prices);
  check(prices?.[itemId] === craftCost, `${PRICES_KEY}[${itemId}] is ${craftCost} after reload`);
  await pickEquipment(page, "Objet à briser");
  await page.waitForFunction((value) => document.querySelector("#shatterPrice")?.value === value, String(craftCost), { timeout: 20_000 });
  check(true, `after reload, picking the item again shows ${craftCost} in #shatterPrice`);
  await shot("after-reload");
}
