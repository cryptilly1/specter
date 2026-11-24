import { expect, test, type Page } from "@playwright/test";

const LF = process.env.SPECTER_LF_URL ?? "http://localhost:5173";
const HW = process.env.SPECTER_HW_URL ?? "http://localhost:5174";
const CF = process.env.SPECTER_CF_URL ?? "http://localhost:5175";

// `?quality=standard` keeps software rendering fast. `?debug=1` exposes the scene as window.__specter.
const q = "quality=standard&debug=1";

async function waitForScene(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as { __specter?: unknown }).__specter), undefined, { timeout: 30_000 });
  await page.waitForSelector("canvas", { timeout: 30_000 });
}

/** Colour of a named mesh's first material, as a hex string. */
async function meshColor(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const s = (window as any).__specter;
    const obj = s?.modelSlot.getObjectByName(n);
    let hex = "";
    if (!obj) return hex; // scene still building: let expect.poll retry
    obj.traverse((o: any) => {
      if (!hex && o.isMesh) hex = (Array.isArray(o.material) ? o.material[0] : o.material).color.getHexString();
    });
    return hex;
  }, name);
}

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|GL Driver|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
};

async function preview(page: Page, text: string) {
  await page.getByTestId("command-input").fill(text);
  await page.getByTestId("send-btn").click();
  await expect(page.getByTestId("confirm-card")).toBeVisible();
}

test.describe("LearnForge", () => {
  test("loads with hotspots, applies a chip, undoes, switches subjects", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.goto(`${LF}/?${q}&nollm=1`);
    await waitForScene(page);
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(7);

    // opening a hotspot shows its explanation
    await page.getByTestId("hotspot-list").locator("button").first().click();
    await expect(page.locator(".specter-panel")).toContainText("DNA");

    // chip -> confirm -> apply adds a hotspot
    await page.getByTestId("chip").first().click();
    await expect(page.getByTestId("confirm-card")).toContainText("Add hotspot");
    await page.getByTestId("apply-btn").click();
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(8);

    // undo removes it
    await page.getByTestId("undo-btn").click();
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(7);

    // typed command changes a material on the real scene
    const before = await meshColor(page, "golgi_apparatus");
    await preview(page, "paint the golgi gold");
    await page.getByTestId("apply-btn").click();
    await expect.poll(() => meshColor(page, "golgi_apparatus")).not.toBe(before);

    // switching subject rebuilds the scene
    await page.getByTestId("pack-solar-system").click();
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(10);
    await page.getByTestId("pack-dna").click();
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test("unknown targets fail loudly and change nothing", async ({ page }) => {
    await page.goto(`${LF}/?${q}&nollm=1`);
    await waitForScene(page);
    await page.getByTestId("command-input").fill("paint the spaceship blue");
    await page.getByTestId("send-btn").click();
    await expect(page.getByTestId("error-box")).toContainText("spaceship");
    await expect(page.getByTestId("confirm-card")).toHaveCount(0);
  });

  test("works with the AI endpoint blocked (local parser fallback)", async ({ page }) => {
    await page.route("**/api/spec", (r) => r.abort());
    await page.goto(`${LF}/?${q}`);
    await waitForScene(page);
    await preview(page, "make the mitochondria glow red");
    await expect(page.getByTestId("confirm-card")).toContainText("Built-in parser");
    await page.getByTestId("apply-btn").click();
    await expect(page.getByTestId("undo-btn")).toBeVisible();
  });

  test("uses the AI answer when the endpoint responds, and rejects a bad one", async ({ page }) => {
    let mode: "good" | "bad" = "good";
    await page.route("**/api/spec", async (r) => {
      const spec = mode === "good" ? { version: 1, ops: [{ op: "setMaterial", mesh: "nucleus", color: "#112233" }] } : { version: 1, ops: [{ op: "setMaterial", mesh: "spaceship", color: "#112233" }] };
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ spec }) });
    });
    await page.goto(`${LF}/?${q}`);
    await waitForScene(page);
    await preview(page, "tint the control room navy");
    await expect(page.getByTestId("confirm-card")).toContainText("AI");
    await page.getByTestId("cancel-btn").click();
    mode = "bad";
    await page.getByTestId("command-input").fill("paint the nucleus navy");
    await page.getByTestId("send-btn").click();
    await expect(page.getByTestId("confirm-card")).toContainText("Built-in parser");
  });

  test("share link reproduces the edit in a fresh page", async ({ page, context }) => {
    await page.goto(`${LF}/?${q}&nollm=1`);
    await waitForScene(page);
    await preview(page, "paint the nucleus gold");
    await page.getByTestId("apply-btn").click();
    await page.getByTestId("share-btn").click();
    const link = await page.getByLabel("Share link").inputValue();
    expect(link).toContain("spec=");
    await page.close(); // software WebGL is slow; free the first context before opening the second
    const page2 = await context.newPage();
    await page2.goto(link.replace(/^https?:\/\/[^/]+/, LF) + "&debug=1&quality=standard");
    await waitForScene(page2);
    await expect.poll(() => meshColor(page2, "nucleus_envelope")).toBe("d4a017");
  });

  test("an invalid share link is rejected without breaking the page", async ({ page }) => {
    await page.goto(`${LF}/?${q}&spec=not-a-valid-spec`);
    await waitForScene(page);
    await expect(page.locator(".specter-toast")).toContainText("isn't valid");
    await expect(page.getByTestId("hotspot-list").locator("li")).toHaveCount(7);
  });
});

test.describe("HauntHouse Walk", () => {
  test("tour, jump between rooms, voice-style edits", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.goto(`${HW}/?${q}&nollm=1`);
    await waitForScene(page);
    await expect(page.getByTestId("intro")).toBeVisible();
    await page.getByTestId("explore-btn").click();
    await expect(page.getByTestId("tour-card")).toContainText("The whole apartment");

    // reach every room via the dots
    for (const id of ["living-room", "kitchen", "study", "bedroom"]) {
      await page.getByTestId(`dot-${id}`).click();
      await expect(page.getByTestId("tour-card")).toContainText(id === "living-room" ? "Living room" : id === "kitchen" ? "Kitchen and dining" : id === "study" ? "Study" : "Bedroom", { timeout: 30_000 });
    }

    // paint the sofa, note on the sink
    const before = await meshColor(page, "sofa_base");
    await preview(page, "Paint the sofa blue");
    await page.getByTestId("apply-btn").click();
    await expect.poll(() => meshColor(page, "sofa_base")).not.toBe(before);
    await preview(page, "Add a note on the kitchen sink saying check the drain");
    await page.getByTestId("apply-btn").click();
    await expect(page.locator('.specter-marker[data-kind="note"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("start tour plays and can be paused", async ({ page }) => {
    await page.goto(`${HW}/?${q}&nollm=1`);
    await waitForScene(page);
    await page.getByTestId("start-tour").click();
    await expect(page.getByTestId("play-btn")).toContainText("Pause");
    await page.getByTestId("play-btn").click();
    await expect(page.getByTestId("play-btn")).toContainText("Play tour");
  });

  test("voice navigation to a room works", async ({ page }) => {
    await page.goto(`${HW}/?${q}&nollm=1`);
    await waitForScene(page);
    await page.getByTestId("explore-btn").click();
    await preview(page, "Go to the kitchen");
    await page.getByTestId("apply-btn").click();
    await expect(page.getByTestId("tour-card")).toContainText("Kitchen and dining");
  });
});

test.describe("Crypt Forge", () => {
  test("click swatch, toggle handles, voice command, reset", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.goto(`${CF}/?${q}&nollm=1`);
    await waitForScene(page);
    await page.getByTestId("swatch-gold").click();
    await expect.poll(() => meshColor(page, "frame")).toBe("d4a017");
    await page.getByTestId("handle-hook").click();
    await expect
      .poll(() => page.evaluate(() => [(window as any).__specter.modelSlot.getObjectByName("handle_hook").visible, (window as any).__specter.modelSlot.getObjectByName("handle_ring").visible]))
      .toEqual([true, false]);
    await preview(page, "Make the glass red");
    await page.getByTestId("apply-btn").click();
    await expect.poll(() => meshColor(page, "glass")).toBe("dc2626");
    await page.getByTestId("reset-btn").click();
    await expect.poll(() => meshColor(page, "frame")).toBe("3b3b44");
    expect(errors).toEqual([]);
  });
});

// Opt-in: SPECTER_LIVE_AI=1 pnpm test:e2e. Uses the real /api/spec with the provider key, no mocking.
test.describe("Live AI", () => {
  test.skip(!process.env.SPECTER_LIVE_AI, "set SPECTER_LIVE_AI=1 to call the real AI");
  test("a free-form sentence goes through the AI and applies", async ({ page }) => {
    await page.goto(`${LF}/?${q}`);
    await waitForScene(page);
    const before = await meshColor(page, "mitochondria");
    await preview(page, "tint the powerhouse of the cell a deep purple");
    await expect(page.getByTestId("confirm-card")).toContainText("AI");
    await page.getByTestId("apply-btn").click();
    await expect.poll(() => meshColor(page, "mitochondria")).not.toBe(before);
  });
});
