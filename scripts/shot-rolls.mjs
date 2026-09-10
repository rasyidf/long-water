/**
 * Screenshot the whale designer at a list of roll angles.
 *
 *   node scripts/shot-rolls.mjs <port> <out-prefix> <rolls,csv> [zoom] [extra-json]
 *   node scripts/shot-rolls.mjs 8080 /tmp/w 0,90,180 2.2 '{"juv":0.8}'
 */
import { chromium } from "playwright";

const PORT = process.argv[2] ?? "8080";
const out = process.argv[3] ?? "/tmp/whale";
const rolls = (process.argv[4] ?? "0,45,90,135,180").split(",").map(Number);
const zoom = Number(process.argv[5] ?? 2.2);
const extra = process.argv[6] ? JSON.parse(process.argv[6]) : {};

const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const page = await browser.newPage({ viewport: { width: 980, height: 760 } });
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE", m.text());
});
await page.goto(`http://localhost:${PORT}/tools.html#whale`);
await page.waitForFunction(() => !!window.__whaleDesigner, null, {
  timeout: 15000,
});
await page.addStyleTag({
  content: "nav,.panel,.code{display:none !important}",
});

const set = (patch) =>
  page.evaluate((p) => window.__whaleDesigner.set(p), {
    zoom,
    bend: 0,
    ...patch,
  });

for (const r of rolls) {
  await set({ rollDeg: r, swim: false, ...extra });
  await page.waitForTimeout(320);
  const p = `${out}-${String(r).replace("-", "m")}.png`;
  await page.screenshot({
    path: p,
    clip: { x: 30, y: 210, width: 920, height: 340 },
  });
  console.log("wrote", p);
}
await browser.close();
