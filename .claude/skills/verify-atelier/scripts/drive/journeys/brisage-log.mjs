const ITEM = "Bottes Lunaires";

export default async function ({ page, base, step, shot, aria, storage, save, check }) {
  step("Open Brisage");
  await page.goto(`${base}/brisage`);
  await page.getByText("Suivi des brisages").waitFor();

  step(`Search "${ITEM}" in Objet brisé (live DofusDB catalogue) and pick it`);
  await page.getByLabel("Objet brisé").fill(ITEM);
  const option = page.getByRole("button", { name: new RegExp(`^${ITEM} Niv\\.`) }).first();
  await option.waitFor({ timeout: 20_000 });
  await option.click();

  step("Fill quantity 2, unit cost 50000, coefficient 120, and 30 × Rune Fo");
  await page.locator("#brisageQuantity").fill("2");
  await page.getByLabel("Coût unitaire (k)").fill("50000");
  await page.locator("#brisageCoefficient").fill("120");
  await page.getByPlaceholder("Rune Fo").first().fill("Rune Fo");
  await page.locator('input[id^="brisageRuneQty-"]').first().fill("30");
  const preview = page.getByRole("status").filter({ hasText: "Coût" });
  await preview.waitFor();
  check((await preview.innerText()).replace(/\s/g, "").includes("Coût100000k"), "preview shows Coût 100 000 k");
  await shot("form-filled");

  step("Click Enregistrer le brisage");
  await page.getByRole("button", { name: "Enregistrer le brisage" }).click();
  const history = page.getByRole("table", { name: "Historique des brisages" });
  const remove = page.getByRole("button", { name: new RegExp(`^Supprimer le brisage .*${ITEM}`) });
  await remove.waitFor();
  await aria("history", history);
  await shot("saved");

  step("Reload: the entry must come back from storage");
  await page.reload();
  await remove.waitFor();
  const stored = await storage("dofus-brisage-log-v1");
  await save("dofus-brisage-log-v1.json", stored);
  check(Array.isArray(stored) && stored.length === 1, "dofus-brisage-log-v1 holds one entry");
  check(stored[0].quantity === 2 && stored[0].unitCost === 50000 && stored[0].coefficient === 120, "stored quantity, cost and coefficient match the form");
  check(stored[0].runes.length === 1 && stored[0].runes[0].quantity === 30, "stored runes are 30 × one rune");

  step("Delete the entry");
  await remove.click();
  const confirm = page.getByRole("alertdialog", { name: "Supprimer ce brisage du suivi ?" });
  await confirm.waitFor();
  await shot("confirm-delete");
  await confirm.getByRole("button", { name: "Supprimer", exact: true }).click();
  await remove.waitFor({ state: "detached" });
  check(await page.getByText("Aucun brisage enregistré.").isVisible(), "the history shows Aucun brisage enregistré.");
  const after = await storage("dofus-brisage-log-v1");
  check(Array.isArray(after) && after.length === 0, "dofus-brisage-log-v1 is empty after delete");
  await shot("deleted");
}
