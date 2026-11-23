// Dev helper: open a URL in headless Chromium (WebGL via SwiftShader), print console errors, save a screenshot.
// Usage: node scripts/shot.mjs <url> <out.png> [--wait=ms] [--click="selector"] [--type="selector::text"] [--w=1280] [--h=800]
import { chromium } from "@playwright/test";

const [url, out = "/tmp/shot.png", ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=")]; }));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(opt.w ?? 1280), height: Number(opt.h ?? 800) } });
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(Number(opt.wait ?? 3500));
if (opt.click) { for (const sel of opt.click.split("||")) { await page.click(sel); await page.waitForTimeout(1200); } }
if (opt.type) { const [sel, text] = opt.type.split("::"); await page.fill(sel, text); await page.waitForTimeout(300); }
if (opt.press) { await page.keyboard.press(opt.press); await page.waitForTimeout(1500); }
if (opt.click2) { for (const sel of opt.click2.split("||")) { await page.click(sel); await page.waitForTimeout(1500); } }
if (opt.after) await page.waitForTimeout(Number(opt.after));
await page.screenshot({ path: out });
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
