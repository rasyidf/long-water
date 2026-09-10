/**
 * Screenshot the whale designer with a stable (non-swimming) pose.
 *
 *   node scripts/shot-whale.mjs [out.png] [zoom] [clip x,y,w,h] [port]
 */
import { chromium } from "playwright";

const out = process.argv[2] ?? "/tmp/whale.png";
const zoom = Number(process.argv[3] ?? 2.6);
const clip = process.argv[4];
const PORT = process.argv[5] ?? "8080";

const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto(`http://localhost:${PORT}/tools.html#whale`);
await page.waitForFunction(() => !!window.__whaleDesigner, null, {
  timeout: 15000,
});

await page.evaluate(
  (z) => window.__whaleDesigner.set({ swim: false, bend: 0, zoom: z }),
  zoom,
);
await page.waitForTimeout(600);

await page.screenshot({
  path: out,
  clip: clip
    ? (() => {
        const [x, y, w, h] = clip.split(",").map(Number);
        return { x, y, width: w, height: h };
      })()
    : undefined,
});
await browser.close();
console.log("wrote", out);
