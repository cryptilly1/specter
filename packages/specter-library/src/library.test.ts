// @vitest-environment node
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchCatalogue } from "./catalogue";
import { pollGeneration, startGeneration } from "./meshy";
import { resetPolyHavenCache } from "./providers";
import { clearSearchCache, searchLibraries } from "./search";
import { handleAssetsRequest, handleGenerateRequest, resetLibraryLimiter } from "./server";
import { isAllowedAssetUrl } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function libraryFetch(overrides: Partial<Record<"polyhaven" | "polypizza" | "si3d" | "sioa", () => Response>> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://api.polyhaven.com/assets")) {
      return overrides.polyhaven?.() ?? json({ lantern_01: { name: "Lantern 01", categories: ["lighting"], tags: ["lantern"], authors: { Jo: "All" } }, rifle_01: { name: "Rifle", categories: ["weapons"], tags: ["lantern"] } });
    }
    if (u.startsWith("https://api.polyhaven.com/files/")) {
      return json({ gltf: { "1k": { gltf: { url: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/lantern_01/lantern_01_1k.gltf", include: { "textures/a.jpg": { url: "https://dl.polyhaven.org/a.jpg" }, "evil.bin": { url: "https://evil.example/x.bin" } } } } } });
    }
    if (u.startsWith("https://api.poly.pizza/")) {
      expect((init?.headers as Record<string, string>)["X-Auth-Token"]).toBe("pp-key");
      return (
        overrides.polypizza?.() ??
        json({
          results: [
            { ID: "a1", Title: "Lantern", Creator: { Username: "ann" }, Download: "https://static.poly.pizza/a1.glb", Licence: "CC-BY 4.0", Tags: [] },
            { ID: "a2", Title: "Lantern NC", Creator: { Username: "bob" }, Download: "https://static.poly.pizza/a2.glb", Licence: "CC-BY-NC 4.0" },
            { ID: "a3", Title: "Lantern", Creator: { Username: "cy" }, Download: "https://evil.example/a3.glb", Licence: "CC0" },
            { ID: "a4", Title: "Old lantern", Creator: { Username: "di" }, Download: "https://static.poly.pizza/a4.glb", Licence: "CC0" },
          ],
        })
      );
    }
    if (u.startsWith("https://3d-api.si.edu/")) {
      return (
        overrides.si3d?.() ??
        json({
          rows: [
            { title: "Lantern A", content: { usage: "Web3D", quality: "High", uri: "https://3d-api.si.edu/content/document/3d_package:11111111-1111-1111-1111-111111111111/high.glb", model_url: "3d_package:11111111-1111-1111-1111-111111111111" } },
            { title: "Lantern A", content: { usage: "Web3D", quality: "Medium", uri: "https://3d-api.si.edu/content/document/3d_package:11111111-1111-1111-1111-111111111111/medium.glb", model_url: "3d_package:11111111-1111-1111-1111-111111111111" } },
            { title: "Lantern NC", content: { usage: "Web3D", quality: "Medium", uri: "https://3d-api.si.edu/content/document/3d_package:22222222-2222-2222-2222-222222222222/m.glb", model_url: "3d_package:22222222-2222-2222-2222-222222222222" } },
          ],
        })
      );
    }
    if (u.startsWith("https://api.si.edu/openaccess/")) {
      const isA = u.includes("11111111");
      return (
        overrides.sioa?.() ??
        json({
          response: {
            rows: [
              {
                unitCode: "NMAH",
                content: {
                  descriptiveNonRepeating: {
                    record_link: "https://si.edu/x",
                    online_media: { media: [{ id: isA ? "3d_package:11111111-1111-1111-1111-111111111111" : "3d_package:22222222-2222-2222-2222-222222222222", type: "3d_voyager", usage: { access: isA ? "CC0" : "usage conditions apply" } }] },
                  },
                },
              },
            ],
          },
        })
      );
    }
    throw new Error(`unexpected ${u}`);
  });
}

const env = { POLY_PIZZA_API_KEY: "pp-key", SMITHSONIAN_API_KEY: "si-key" };

beforeEach(() => {
  clearSearchCache();
  resetPolyHavenCache();
  resetLibraryLimiter();
});

describe("library search", () => {
  it("merges providers and keeps only CC0 / CC-BY assets on allowlisted hosts", async () => {
    const f = libraryFetch();
    const r = await searchLibraries("lantern", env, { fetchImpl: f as unknown as typeof fetch, limit: 12 });
    const ids = r.candidates.map((c) => `${c.provider}:${c.assetId}`);
    expect(ids).toContain("catalogue:khronos-lantern");
    expect(ids).toContain("polypizza:a1");
    expect(ids).toContain("polypizza:a4");
    expect(ids).not.toContain("polypizza:a2"); // NC rejected
    expect(ids).not.toContain("polypizza:a3"); // bad host rejected
    expect(ids).toContain("polyhaven:lantern_01");
    expect(ids).not.toContain("polyhaven:rifle_01"); // blocked category
    expect(ids).toContain("smithsonian:3d_package:11111111-1111-1111-1111-111111111111");
    expect(ids).not.toContain("smithsonian:3d_package:22222222-2222-2222-2222-222222222222"); // not CC0
    for (const c of r.candidates) {
      expect(isAllowedAssetUrl(c.url)).toBe(true);
      expect(c.credit.length).toBeGreaterThan(5);
      if (c.license.attributionRequired) expect(c.credit).toMatch(/by|BY/);
    }
    const ph = r.candidates.find((c) => c.provider === "polyhaven")!;
    expect(Object.keys(ph.urlMap!)).toEqual(["textures/a.jpg"]); // off-host file dropped
    expect(ph.platformCredit?.text).toBe("Powered by Poly Haven");
    expect(r.candidates.find((c) => c.provider === "polypizza")!.platformCredit?.text).toBe("Models provided by Poly Pizza");
    const si = r.candidates.find((c) => c.provider === "smithsonian")!;
    expect(si.url).toContain("medium.glb"); // web-sized file preferred
  });

  it("skips providers without keys and survives a failing provider", async () => {
    const f = libraryFetch({ polyhaven: () => json({}, 500) });
    const r = await searchLibraries("lantern", {}, { fetchImpl: f as unknown as typeof fetch });
    expect(r.candidates.every((c) => c.provider === "catalogue")).toBe(true);
    expect(r.notes.join(" ")).toContain("polyhaven");
    expect(f.mock.calls.some(([u]) => String(u).includes("poly.pizza"))).toBe(false);
  });

  it("times out slow providers without blocking the rest", async () => {
    const f = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes("polyhaven")) return new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      return libraryFetch()(url, init);
    });
    const r = await searchLibraries("lantern", env, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 50 });
    expect(r.notes.join(" ")).toContain("timed out");
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it("refuses blocked queries and empty queries", async () => {
    expect((await searchLibraries("assault rifle", env)).candidates).toEqual([]);
    expect((await searchLibraries("   ", env)).candidates).toEqual([]);
  });

  it("tolerates quotes or backticks pasted around keys", async () => {
    const f = libraryFetch();
    await searchLibraries("lantern", { POLY_PIZZA_API_KEY: "`pp-key`" }, { fetchImpl: f as unknown as typeof fetch });
    expect(f.mock.calls.some(([u]) => String(u).includes("poly.pizza"))).toBe(true);
  });

  it("catalogue matches whole words only", () => {
    expect(searchCatalogue("tree").map((c) => c.assetId)).toEqual([]);
    expect(searchCatalogue("a red chair").map((c) => c.assetId)).toEqual(["khronos-sheenchair"]);
    expect(searchCatalogue("lanterns").map((c) => c.assetId)).toEqual(["khronos-lantern"]);
  });
});

describe("asset URL allowlist (PBT)", () => {
  it("only https URLs on known hosts pass", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const ok = isAllowedAssetUrl(url);
        const u = new URL(url);
        const known = ["dl.polyhaven.org", "static.poly.pizza", "3d-api.si.edu", "raw.githubusercontent.com", "assets.meshy.ai"].includes(u.hostname) || u.hostname.endsWith(".meshy.ai");
        expect(ok).toBe(u.protocol === "https:" && known && !u.username && !u.password);
      }),
    );
    expect(isAllowedAssetUrl("http://static.poly.pizza/a.glb")).toBe(false);
    expect(isAllowedAssetUrl("https://static.poly.pizza.evil.com/a.glb")).toBe(false);
    expect(isAllowedAssetUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("HTTP handlers", () => {
  it("/api/assets reports capabilities, validates and searches", async () => {
    const caps = await handleAssetsRequest({ method: "GET", query: {} }, { ...env, MESHY_API_KEY: "m" });
    expect(caps.body).toEqual({ providers: ["catalogue", "polyhaven", "polypizza", "smithsonian"], generate: true });
    expect((await handleAssetsRequest({ method: "POST", query: {} }, env)).status).toBe(405);
    expect((await handleAssetsRequest({ method: "GET", query: { q: "x".repeat(81) } }, env)).status).toBe(400);
    const r = await handleAssetsRequest({ method: "GET", query: { q: "lantern", providers: "catalogue" } }, env);
    expect((r.body as { candidates: unknown[] }).candidates.length).toBe(1);
    expect(JSON.stringify(r.body)).not.toContain("pp-key");
  });

  it("/api/generate is off without a key and never leaks it", async () => {
    expect((await handleGenerateRequest({ method: "GET", query: {} }, {})).body).toEqual({ enabled: false });
    expect((await handleGenerateRequest({ method: "POST", query: {}, body: { prompt: "a vase" } }, {})).status).toBe(503);
    expect((await handleGenerateRequest({ method: "POST", query: {}, body: { prompt: "" } }, { MESHY_API_KEY: "secret-m" })).status).toBe(400);
  });
});

describe("Meshy generation flow", () => {
  it("preview -> refine -> done, with readable errors", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ result: "task-preview-0001" }))
      .mockResolvedValueOnce(json({ id: "task-preview-0001", status: "IN_PROGRESS", progress: 40 }))
      .mockResolvedValueOnce(json({ id: "task-preview-0001", status: "SUCCEEDED", progress: 100 }))
      .mockResolvedValueOnce(json({ result: "task-refine-0002" }))
      .mockResolvedValueOnce(json({ id: "task-refine-0002", status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.meshy.ai/x/model.glb" }, thumbnail_url: "https://assets.meshy.ai/x/t.png" }));
    const deps = { fetchImpl: f as unknown as typeof fetch };
    const s = await startGeneration("a carved stone gargoyle", "k", deps);
    expect(s.job).toEqual({ id: "task-preview-0001", stage: "preview" });
    expect((await pollGeneration(s.job!, "a carved stone gargoyle", "k", deps)).progress).toBe(20);
    const r = await pollGeneration(s.job!, "a carved stone gargoyle", "k", deps);
    expect(r.job?.stage).toBe("refine");
    const done = await pollGeneration(r.job!, "a carved stone gargoyle", "k", deps);
    expect(done.done).toBe(true);
    expect(done.candidate?.license.id).toBe("Generated");
    expect(done.candidate?.credit).toContain("expire");
    const auth = (f.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(auth.authorization).toBe("Bearer k");
  });

  it("maps payment and moderation errors, rejects blocked prompts and bad ids", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ message: "x" }, 402));
    expect((await startGeneration("a vase", "k", { fetchImpl: f as unknown as typeof fetch })).error).toMatch(/paid plan/);
    expect((await startGeneration("a gun", "k")).ok).toBe(false);
    expect((await pollGeneration({ id: "../../etc", stage: "preview" }, "x", "k")).error).toMatch(/Invalid/);
  });

  it("rejects a finished model served from an unexpected host", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ id: "task-refine-0002", status: "SUCCEEDED", model_urls: { glb: "https://evil.example/m.glb" } }));
    const r = await pollGeneration({ id: "task-refine-0002", stage: "refine" }, "x", "k", { fetchImpl: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
  });
});
