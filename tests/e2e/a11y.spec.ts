import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const APPS = [
  { name: "LearnForge", url: process.env.SPECTER_LF_URL ?? "http://localhost:5173" },
  { name: "HauntHouse Walk", url: process.env.SPECTER_HW_URL ?? "http://localhost:5174", start: "explore-btn" },
  { name: "Crypt Forge", url: process.env.SPECTER_CF_URL ?? "http://localhost:5175" },
];

for (const app of APPS) {
  test(`${app.name} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(`${app.url}/?quality=standard&nollm=1&debug=1`);
    await page.waitForFunction(() => Boolean((window as unknown as { __specter?: unknown }).__specter), undefined, { timeout: 30_000 });
    if (app.start) await page.getByTestId(app.start).click();
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const summary = serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(summary).toEqual([]);
  });

  test(`${app.name} works by keyboard: tab to the command box and submit`, async ({ page }) => {
    await page.goto(`${app.url}/?quality=standard&nollm=1&debug=1`);
    await page.waitForFunction(() => Boolean((window as unknown as { __specter?: unknown }).__specter), undefined, { timeout: 30_000 });
    if (app.start) await page.getByTestId(app.start).click();
    const input = page.getByTestId("command-input");
    await input.focus();
    await input.fill(app.name === "LearnForge" ? "hide the cell membrane" : app.name === "Crypt Forge" ? "hide the cap" : "hide the plant");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("confirm-card")).toBeVisible();
    await expect(page.getByTestId("apply-btn")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("undo-btn")).toBeVisible();
  });
}

test("LearnForge is usable on a phone-sized screen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(`${APPS[0]!.url}/?quality=standard&nollm=1&debug=1`);
  await page.waitForFunction(() => Boolean((window as unknown as { __specter?: unknown }).__specter), undefined, { timeout: 30_000 });
  await expect(page.getByTestId("command-input")).toBeVisible();
  await page.getByTestId("chip").first().click();
  await expect(page.getByTestId("apply-btn")).toBeVisible();
  await page.close();
});
