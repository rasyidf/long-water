import { chromium } from "playwright";

/**
 * Screenshots the coral designer (`tools.html#coral`) through the
 * `window.__coral` hook the designer installs.
 *
 *   node scripts/shot-coral.mjs /tmp/coral '[{"name":"sheet"},{"name":"whip","only":[4],"sheet":{"zoom":3}}]' [port]
 *
 * Each step may set `mode` ("body" | "scene"), `set` (a `CoralParams` patch),
 * `sheet` (a `CoralSheetParams` patch: zoom, scale, seed, light, sonar,
 * freeze), `only` (kind indices to leave on the sheet) and `wait` (ms).
 */
const prefix = process.argv[2] ?? "/tmp/coral";
const steps = JSON.parse(process.argv[3] ?? "[{}]");
const PORT = process.argv[4] ?? "8080";

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
await p.goto(`http://localhost:${PORT}/tools.html#coral`, {
  waitUntil: "networkidle",
});
await p.waitForFunction(() => !!window.__coral?.ready, null, {
  timeout: 15000,
});
await p.waitForTimeout(1200);

let i = 0;
for (const step of steps) {
  await p.evaluate((s) => {
    const o = window.__coral;
    if (s.mode) o.mode(s.mode);
    if (s.set) o.set(s.set);
    if (s.sheet) o.setSheet(s.sheet);
    o.only(s.only ?? []);
  }, step);
  await p.waitForTimeout(step.wait ?? 1200);
  await p.screenshot({ path: `${prefix}-${step.name ?? i}.png` });
  console.log("wrote", `${prefix}-${step.name ?? i}.png`);
  i++;
}
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
await b.close();
