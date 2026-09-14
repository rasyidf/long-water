/**
 * Screenshots the squid body designer (`tools.html#squid`) through the
 * `window.__squid` hook it installs.
 *
 *   node scripts/shot-squid.mjs /tmp/squid '[{"name":"lurk","pose":"lurk"}]' [port]
 *
 * Each step may set `pose` (a brain state), `set` (a `SquidParams` patch),
 * `look` (a `SquidLook` patch), `mode` ("body" | "scene") and `wait` (ms).
 * With no steps it shoots one frame of the default pose, swim frozen.
 */
import { chromium } from "playwright";

const prefix = process.argv[2] ?? "/tmp/squid";
const steps = JSON.parse(process.argv[3] ?? '[{"set":{"swim":false}}]');
const PORT = process.argv[4] ?? "8080";

const b = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const p = await b.newPage({ viewport: { width: 1300, height: 820 } });
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`http://localhost:${PORT}/tools.html#squid`, {
  waitUntil: "networkidle",
});
await p.waitForFunction(() => !!window.__squid, null, { timeout: 15000 });
await p.waitForTimeout(1200);

let i = 0;
for (const step of steps) {
  await p.evaluate((s) => {
    const o = window.__squid;
    if (s.mode) o.mode = s.mode;
    if (s.pose) o.pose(s.pose);
    if (s.set) o.set(s.set);
    if (s.look) o.setLook(s.look);
  }, step);
  await p.waitForTimeout(step.wait ?? 900);
  await p.screenshot({ path: `${prefix}-${step.name ?? i}.png` });
  i++;
}
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
await b.close();
