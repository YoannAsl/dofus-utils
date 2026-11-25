const STABLE = ["MAMAMSAUVSAUV", "FAMAMSAUVSAUV", "MDODOSAUVSAUV", "FDODOSAUVSAUV", "MROROSAUVSAUV", "FROROSAUVSAUV"];

export default async function ({ page, base, step, shot, aria, storage, save, check }) {
  step("Open Élevage › Étable (default family Dragodinde)");
  await page.goto(`${base}/elevage`);
  await page.getByRole("tab", { name: "Étable", selected: true }).waitFor();
  await page.getByRole("radio", { name: "Dragodinde" }).waitFor();
  await shot("empty-stable");

  step(`Type ${STABLE.length} wild G1 names into "Noms des montures"`);
  await page.getByLabel("Noms des montures").fill(STABLE.join("\n"));
  const compute = page.getByRole("button", { name: "Calculer les reproductions" });
  check(await compute.isEnabled(), "Calculer les reproductions is enabled once names are read");
  await shot("names-typed");

  step("Click Calculer les reproductions and wait for the plan");
  await compute.click();
  await page.getByText("Les reproductions à faire").waitFor({ timeout: 60_000 });
  const first = page.getByRole("checkbox", { name: "Accouplement 1 fait" });
  await first.waitFor();
  const pairings = await page.getByRole("checkbox", { name: /^Accouplement \d+ fait$/ }).count();
  check(pairings > 0, `the plan lists ${pairings} pairing(s)`);
  check(await page.getByText(/0 fait sur \d+ accouplement/).isVisible(), "progress reads 0 fait sur N");
  await aria("plan");
  await shot("plan");

  step("Tick pairing 1 as done");
  await first.click();
  check(await first.isChecked(), "Accouplement 1 fait is checked");
  check(await page.getByText(/^1 fait sur/).isVisible(), "progress reads 1 fait sur N");

  step("Reload the page: draft, plan and ticked pairing must survive");
  await page.reload();
  await page.getByRole("checkbox", { name: "Accouplement 1 fait" }).waitFor();
  check(await page.getByRole("checkbox", { name: "Accouplement 1 fait" }).isChecked(), "pairing 1 still ticked after reload");
  check((await page.getByLabel("Noms des montures").inputValue()).includes("MAMAMSAUVSAUV"), "names textarea restored after reload");
  const stored = await storage("dofus-elevage");
  await save("dofus-elevage.json", stored);
  check(stored?.dragodinde?.done?.includes(0), "localStorage dofus-elevage.dragodinde.done contains pairing index 0");
  check(stored?.dragodinde?.plan?.pairings?.length === pairings, "stored plan has the same pairing count as the screen");
  await shot("after-reload");
}
