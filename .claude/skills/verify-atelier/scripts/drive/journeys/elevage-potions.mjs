const WAITING_FEMALES = ["FEMPOPOPOEMEM", "FEMPOPOPOEMEM", "FEMPOPOPOEMEM", "FPRPRAMROAMPO", "MROROPOORPOIN"];
const BOTH_SEXES_WAITING = ["FEMPOPOPOEMEM", "MEMPOPOPOEMEM", "FPRPRAMROAMPO", "MROROPOORPOIN"];

async function computePlan(page, names) {
  await page.getByLabel("Noms des montures").fill(names.join("\n"));
  await page.getByRole("button", { name: "Calculer les reproductions" }).click();
  await page.waitForFunction(
    (count) => JSON.parse(localStorage.getItem("dofus-elevage") ?? "null")?.volkorne?.plan?.read === count,
    names.length,
    { timeout: 60_000 },
  );
  await page.getByRole("checkbox", { name: "Accouplement 1 fait" }).waitFor();
}

export default async function ({ page, base, step, shot, aria, storage, save, check }) {
  step("Open Élevage › Étable for Volkorne");
  await page.goto(`${base}/elevage?family=volkorne`);
  await page.getByRole("radio", { name: "Volkorne", checked: true }).waitFor();

  step("Stable: 3 Émeraude-Pourpre ♀ wait for a Prune-Roux ♂, plus one Prune ♀ and one Roux ♂ to make it");
  await computePlan(page, WAITING_FEMALES);
  const plan = page.getByRole("table").filter({ has: page.getByRole("checkbox", { name: "Accouplement 1 fait" }) });
  check(await plan.getByText("Prune-Roux").first().isVisible(), "the plan breeds a Prune-Roux");
  const badge = page.getByText("Potion mâle", { exact: true });
  check(await badge.isVisible(), "the pairing shows the badge Potion mâle");
  const title = await badge.getAttribute("title");
  check(title === "Dans l’étable, des partenaires attendent un mâle de cette couleur, pas une femelle", `badge title: "${title}"`);
  check(!(await page.getByText("Potion femelle", { exact: true }).isVisible()), "no Potion femelle badge");
  await aria("plan-waiting-females", plan);
  await shot("potion-male");

  step("Reload: the potion is part of the stored plan");
  await page.reload();
  await page.getByText("Potion mâle", { exact: true }).waitFor();
  const stored = await storage("dofus-elevage");
  await save("dofus-elevage.json", stored);
  const pairings = stored?.volkorne?.plan?.pairings ?? [];
  check(pairings.length === 1 && pairings[0].potion === "M" && pairings[0].target === "prune_roux", "dofus-elevage.volkorne.plan.pairings is one Prune-Roux pairing with potion M");

  step("Control: an Émeraude-Pourpre ♀ and ♂ both wait, so either sex finds a partner");
  await computePlan(page, BOTH_SEXES_WAITING);
  check(await page.getByText("Prune-Roux").first().isVisible(), "the plan still breeds a Prune-Roux");
  check((await page.getByText(/^Potion (mâle|femelle)$/).count()) === 0, "no potion badge when both sexes have a partner");
  const control = await storage("dofus-elevage");
  check((control?.volkorne?.plan?.pairings ?? []).every((pairing) => pairing.potion === null), "stored plan has no potion");
  await shot("no-potion");
}
