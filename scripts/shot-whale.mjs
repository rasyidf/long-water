import { chromium } from "playwright";

const out = process.argv[2] ?? "/tmp/whale.png";
const zoom = process.argv[3] ?? "2.6";

const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto("http://localhost:8083/procgen.html");
await page.waitForTimeout(1500);

// stop the swim animation for a stable pose
await page.click("#swim");

async function setSlider(key, value) {
  await page.evaluate(
    ([k, v]) => {
      const inputs = [...document.querySelectorAll("#sliders .ctl input")];
      const el = inputs.find((i) =>
        i
          .closest(".ctl")
          .querySelector("label")
          .textContent.toLowerCase()
          .startsWith(k),
      );
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [key, value],
  );
}

await setSlider("zoom", zoom);
await setSlider("bend", 0);
await page.waitForTimeout(600);

const clip = process.argv[4];
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
