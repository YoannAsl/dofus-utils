export default async function ({ page, base, step, shot, aria, check }) {
  step("Open Élevage › Couples for Volkorne through its URL");
  await page.goto(`${base}/elevage?tab=couples&family=volkorne`);
  await page.getByRole("tab", { name: "Couples", selected: true }).waitFor();

  step("Enter father MPOPOSAUVSAUV and mother FORORSAUVSAUV");
  await page.getByLabel("Père (mâle)").fill("MPOPOSAUVSAUV");
  await page.getByLabel("Mère (femelle)").fill("FORORSAUVSAUV");
  const table = page.getByRole("table", { name: "Naissances possibles" });
  await table.waitFor();
  check((await table.getByRole("row").count()) === 4, "Naissances possibles has a header and 3 outcomes");
  const text = await table.innerText();
  check(text.includes("POORPOPOOROR"), "the successful baby's name ends in POORPOPOOROR");
  check(text.includes("42"), "the two-colour baby shows a 42 % chance");
  await aria("outcomes", table);
  await shot("outcomes");

  step("Put a female in the father field: no outcomes, and a sex warning");
  await page.getByLabel("Père (mâle)").fill("FPOPOSAUVSAUV");
  await page.getByText("ce n’est pas un mâle").waitFor();
  check((await page.getByRole("table", { name: "Naissances possibles" }).count()) === 0, "no outcome table for a wrong-sex father");
  await shot("wrong-sex");
}
