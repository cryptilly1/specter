import { expect, test, type Page } from "@playwright/test";

const ST = process.env.SPECTER_ST_URL ?? "http://localhost:5178";
const q = "quality=standard&debug=1";

async function ready(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).__specter), undefined, { timeout: 30_000 });
}

const ids = (page: Page) => page.locator("[data-testid=outliner] .st-name").allInnerTexts();

async function say(page: Page, text: string) {
  await page.getByTestId("command-input").fill(text);
  await page.getByTestId("send-btn").click();
  await expect(page.getByTestId("confirm-card")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("apply-btn").click();
  await expect(page.getByTestId("confirm-card")).toHaveCount(0, { timeout: 30_000 });
}

/** Deterministic library results, so these tests don't depend on third-party uptime. */
async function mockLibraries(page: Page) {
  await page.route("**/api/assets**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("q")) return route.fulfill({ json: { providers: ["catalogue", "polyhaven"], generate: false } });
    return route.fulfill({
      json: {
        query: url.searchParams.get("q"),
        notes: [],
        candidates: [
          {
            provider: "catalogue",
            assetId: "khronos-lantern",
            title: "Lantern",
            url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb",
            license: { id: "CC0-1.0", label: "CC0", attributionRequired: false },
            credit: "Lantern from the Khronos glTF Sample Assets (CC0)",
            sourceUrl: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Lantern",
          },
          {
            provider: "catalogue",
            assetId: "khronos-avocado",
            title: "Avocado",
            url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb",
            license: { id: "CC0-1.0", label: "CC0", attributionRequired: false },
            credit: "Avocado from the Khronos glTF Sample Assets (CC0)",
            sourceUrl: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Avocado",
          },
        ],
      },
    });
  });
}

test.describe("Studio", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem("__cleared")) { localStorage.clear(); sessionStorage.setItem("__cleared", "1"); } });
  });

  test("build from empty by voice-style commands, edit, undo", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockLibraries(page);
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await say(page, "Build a solar eclipse");
    await expect.poll(() => ids(page)).toEqual([expect.stringContaining("solar_eclipse")]);
    await expect(page.getByTestId("empty-state")).toHaveCount(0);

    await say(page, "add a red sphere");
    await say(page, "move the sphere up by 2");
    await expect.poll(() => page.evaluate(() => (window as any).__specter.modelSlot.getObjectByName("sphere").position.y)).toBeCloseTo(2);
    await say(page, "make the moon orbit the earth");
    const start = await page.evaluate(() => (window as any).__specter.modelSlot.getObjectByName("moon").position.x);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__specter.modelSlot.getObjectByName("moon").position.x)).not.toBeCloseTo(start, 2);

    await page.getByTestId("undo-btn").click();
    await page.getByTestId("undo-btn").click();
    await expect.poll(() => page.evaluate(() => (window as any).__specter.modelSlot.getObjectByName("sphere").position.y)).toBeCloseTo(0);
    expect(errors).toEqual([]);
  });

  test("library model with choices, credits shown, survives reload via autosave", async ({ page }) => {
    await mockLibraries(page);
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await page.getByTestId("command-input").fill("add a lantern");
    await page.getByTestId("send-btn").click();
    await expect(page.getByTestId("model-choices")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("model-choice")).toHaveCount(2);
    await page.getByTestId("model-choice").nth(1).click();
    await expect(page.getByTestId("confirm-card")).toContainText("Avocado");
    await page.getByTestId("apply-btn").click();
    await expect.poll(() => ids(page), { timeout: 40_000 }).toEqual([expect.stringContaining("lantern")]);
    await expect(page.getByTestId("credits")).toContainText("Avocado from the Khronos");

    await page.reload();
    await ready(page);
    await expect.poll(() => ids(page), { timeout: 40_000 }).toEqual([expect.stringContaining("lantern")]);
  });

  test("panel buttons, gizmo-free edits and play-mode interactions", async ({ page }) => {
    await mockLibraries(page);
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await page.getByTestId("shape-cube").click();
    await page.getByTestId("shape-sphere").click();
    await expect.poll(() => ids(page)).toHaveLength(2);
    await page.getByTestId("obj-cube").click();
    await expect(page.getByTestId("properties")).toBeVisible();
    await page.getByTestId("onclick-input").fill("This cube is a demo.");
    await page.getByTestId("onclick-input").press("Enter");
    await page.getByTestId("motion-select").selectOption("spin");
    await expect(page.getByTestId("obj-cube")).toContainText("spin");
    await expect(page.getByTestId("obj-cube")).toContainText("interactive");

    // play mode: run the click action
    await page.getByTestId("mode-play").click();
    await page.evaluate(() => {
      const s = (window as any).__specter;
      const box = s.renderer.domElement.getBoundingClientRect();
      const v = s.modelSlot.getObjectByName("cube").getWorldPosition(new s.camera.position.constructor()).project(s.camera);
      (window as any).__pt = { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
    });
    const pt = await page.evaluate(() => (window as any).__pt);
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator(".specter-panel")).toContainText("This cube is a demo.");
    await page.getByTestId("mode-edit").click();
    await page.getByTestId("del-sphere").click();
    await expect.poll(() => ids(page)).toHaveLength(1);
  });

  test("unknown things fail loudly and leave the scene alone; exports a GLB", async ({ page }) => {
    await page.route("**/api/assets**", (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("q") ? { candidates: [], notes: [] } : { providers: ["catalogue"], generate: false } }));
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await page.getByTestId("command-input").fill("add a zorblax");
    await page.getByTestId("send-btn").click();
    await expect(page.getByTestId("error-box")).toContainText("zorblax");
    await page.getByTestId("recipe-house").click();
    await expect.poll(() => ids(page)).toHaveLength(1);
    const dl = page.waitForEvent("download");
    await page.getByTestId("export-glb").click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe("specter-scene.glb");
  });

  test("share link rebuilds the scene in play mode via embed", async ({ page, context }) => {
    await mockLibraries(page);
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await page.getByTestId("recipe-atom").click();
    await expect.poll(() => ids(page)).toHaveLength(1);
    await page.getByTestId("share-btn").click();
    const link = await page.getByLabel("Share link").inputValue();
    await page.close();
    const p2 = await context.newPage();
    await p2.goto(`${link.replace(/^https?:\/\/[^/]+/, ST)}&embed=1&debug=1&quality=standard`);
    await ready(p2);
    await expect.poll(() => p2.evaluate(() => (window as any).__specter.modelSlot.children.length)).toBe(1);
    await expect(p2.getByTestId("command-input")).toHaveCount(0);
  });
});

// Opt-in: SPECTER_LIVE_AI=1. The real AI composes something with no recipe, and real libraries are searched.
test.describe("Studio live", () => {
  test.skip(!process.env.SPECTER_LIVE_AI, "set SPECTER_LIVE_AI=1");
  test("AI composes a snowman from shapes", async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem("__cleared")) { localStorage.clear(); sessionStorage.setItem("__cleared", "1"); } });
    await page.goto(`${ST}/?${q}`);
    await ready(page);
    await say(page, "build a snowman with a carrot nose and a top hat");
    const meshes = await page.evaluate(() => {
      let n = 0;
      (window as any).__specter.modelSlot.traverse((o: any) => o.isMesh && n++);
      return n;
    });
    expect(meshes).toBeGreaterThanOrEqual(4);
  });
  test("real library search returns licensed models", async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem("__cleared")) { localStorage.clear(); sessionStorage.setItem("__cleared", "1"); } });
    await page.goto(`${ST}/?${q}&nollm=1`);
    await ready(page);
    await say(page, "add a pine tree");
    await expect(page.getByTestId("credits")).toBeVisible({ timeout: 40_000 });
  });
});
