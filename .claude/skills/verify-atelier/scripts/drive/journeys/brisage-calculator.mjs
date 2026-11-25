const ITEM = "Bottes Lunaires";

export default async function ({ page, base, step, shot, aria, storage, check }) {
  step("Open Brisage");
  await page.goto(`${base}/brisage`);
  await page.getByLabel("Objet à briser").waitFor();

  step(`Search "${ITEM}" in Objet à briser (live DofusDB catalogue) and pick it`);
  await page.getByLabel("Objet à briser").fill(ITEM);
  const option = page.getByRole("button", { name: new RegExp(`^${ITEM} Niv\\.`) }).first();
  await option.waitFor({ timeout: 20_000 });
  await option.click();
  const runes = page.getByRole("table", { name: "Runes par caractéristique" });
  await runes.waitFor();
  const lines = runes.locator("tbody tr");
  await lines.first().waitFor();
  check((await lines.count()) > 0, `the rune table lists ${await lines.count()} characteristic line(s)`);
  check(!(await page.getByText("aucune caractéristique qui donne des runes").isVisible()), "the item gives runes");

  step("Set coefficient 100 and press Enter to save it");
  const coef = page.locator("#shatterCoef");
  await coef.fill("100");
  await coef.press("Enter");
  await aria("runes-no-prices", runes);
  await shot("coef-set");

  step("Price every rune at 100 k: the total must stop saying Prix requis");
  const prices = runes.getByRole("textbox", { name: /^Prix HDV .* \(kamas par unité\)$/ });
  const count = await prices.count();
  check(count > 0, `${count} rune price inputs`);
  for (let index = 0; index < count; index++) {
    await prices.nth(index).fill("100");
    await prices.nth(index).press("Tab");
  }
  check(!(await runes.getByText("Prix requis").isVisible()), "Total kamas sans focus is a number once every rune has a price");
  await aria("runes-priced", runes);
  await shot("priced");

  const coefficients = await storage("dofus-brisage-coefficients-v1");
  check(coefficients && Object.values(coefficients).includes(100), "dofus-brisage-coefficients-v1 remembers coefficient 100");

  step("Noter ce brisage copies the item into the log form");
  await page.getByRole("button", { name: "Noter ce brisage" }).click();
  check((await page.getByLabel("Objet brisé").inputValue()).includes(ITEM), "Objet brisé is prefilled");
  check((await page.locator("#brisageCoefficient").inputValue()) === "100", "log coefficient is prefilled with 100");
  await shot("noted");
}
