import { chromium } from "playwright";

/**
 * Screenshots the ocean/sky playground (`tools.html#ocean`) through the
 * `window.__ocean` hook the designer installs.
 *
 *   node scripts/shot-ocean.mjs /tmp/out '[{"name":"gale","preset":"gale","cam":[180,0.6]}]'
 *
 * Each step may set `preset`, `patch` ({wave|sky|column: {...}}), `only`
 * (draw sections to leave on), `cam` ([y, scale]) and `wait` (ms).
 */
const prefix = process.argv[2] ?? "/tmp/ocean";
const steps = JSON.parse(process.argv[3] ?? "[{}]");

const b = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const p = await b.newPage({ viewport: { width: 1500, height: 860 } });
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto("http://localhost:8080/tools.html#ocean", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__ocean, null, { timeout: 15000 });
await p.waitForTimeout(2000);

let i = 0;
for (const step of steps) {
  await p.evaluate((s) => {
    const o = window.__ocean;
    if (s.preset) o.preset(s.preset);
    for (const [g, v] of Object.entries(s.patch ?? {})) o.patch(g, v);
    if (s.only) o.only(s.only);
    else o.all();
    if (s.cam) o.camera(s.cam[0], s.cam[1]);
  }, step);
  await p.waitForTimeout(step.wait ?? 1200);
  const stats = await p.evaluate(() => window.__ocean.stats);
  console.log(`${step.name ?? i}:`, JSON.stringify(stats));
  await p.screenshot({ path: `${prefix}-${step.name ?? i}.png` });
  i++;
}
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
await b.close();
