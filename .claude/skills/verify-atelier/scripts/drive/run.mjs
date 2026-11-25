import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
const args = process.argv.slice(2);
const headed = args.includes("--headed");
const names = args.filter((arg) => !arg.startsWith("--"));

if (!names.length) {
  console.error("Usage: node run.mjs <journey> [<journey>…] [--headed]");
  process.exit(2);
}

let port;
try {
  port = (await readFile(path.join(repoRoot, ".verify", "run", "server.port"), "utf8")).trim();
} catch {
  console.error("No instance started by this skill. Run: powershell -File .claude/skills/verify-atelier/scripts/atelier.ps1 launch");
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
let failures = 0;

for (const name of names) {
  const { default: journey } = await import(`./journeys/${name}.mjs`);
  const dir = path.join(repoRoot, ".verify", "evidence", `${stamp}-${name}`);
  await mkdir(dir, { recursive: true });
  const lines = [`# ${name}`, "", `- url: ${base}`, `- started: ${new Date().toISOString()}`, ""];
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  let shot = 0;
  const kit = {
    page,
    base,
    step: (text) => {
      lines.push(`- ${text}`);
      console.log(`[${name}] ${text}`);
    },
    shot: async (label) => {
      const file = `${String(++shot).padStart(2, "0")}-${label}.png`;
      await page.screenshot({ path: path.join(dir, file), fullPage: true });
      lines.push(`  - screenshot: ${file}`);
    },
    aria: async (label, locator = page.locator("main")) => {
      const file = `${label}.aria.yml`;
      await writeFile(path.join(dir, file), await locator.ariaSnapshot());
      lines.push(`  - aria: ${file}`);
    },
    storage: async (key) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"), key),
    save: async (file, value) => {
      await writeFile(path.join(dir, file), typeof value === "string" ? value : JSON.stringify(value, null, 2));
      lines.push(`  - data: ${file}`);
    },
    check: (condition, message) => {
      if (!condition) throw new Error(`Check failed: ${message}`);
      lines.push(`  - ok: ${message}`);
    },
  };
  let outcome = "PASS";
  try {
    await journey(kit);
  } catch (error) {
    outcome = "FAIL";
    failures++;
    lines.push("", `Error: ${error.stack ?? error}`);
    await page.screenshot({ path: path.join(dir, "failure.png"), fullPage: true }).catch(() => {});
  }
  await context.tracing.stop({ path: path.join(dir, "trace.zip") });
  await browser.close();
  lines.push("", `Console errors: ${consoleErrors.length ? "\n" + consoleErrors.map((text) => `- ${text}`).join("\n") : "none"}`);
  lines.push("", `Result: ${outcome}`, "");
  await writeFile(path.join(dir, "report.md"), lines.join("\n"));
  console.log(`[${name}] ${outcome} → ${dir}`);
}

process.exit(failures ? 1 : 0);
