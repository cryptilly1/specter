---
name: "specter-3d"
displayName: "Specter 3D"
description: "Author interactive 3D scenes by voice or text on the Specter kit: add hotspots, author a walk path, and turn speech into a validated Spec."
keywords: ["3d", "three.js", "hotspot", "walkthrough", "voice", "spec", "specter"]
---

# Specter 3D

Use this power when a task is about adding interactivity to a Specter app (LearnForge, HauntHouse Walk, Crypt Forge) or building a new app on `specter-core`.

## Rules that always apply

- Voice and text only change a scene through registered ops. Never invent a model, building or arbitrary geometry.
- Every hotspot needs a `title`, a `body` and a target that resolves (a named mesh, or a world position). Unknown targets must fail loudly.
- Every mesh a user may target needs a stable, speakable name. Generic exporter names such as `Object_12` are not voice targets.
- Dispose everything you create (`disposeObject3D`, `scene.destroy()`).
- No custom GLSL. Standard PBR materials only.
- Keys are read only by the serverless function from environment variables.

## Skills

### add hotspot

1. Find the mesh name: run `pnpm models:audit path/to/model.glb`, or read the builder in `apps/*/src`.
2. Add `{ id, mesh, title, body, offset? }` to the app's hotspot list (`packs/*.ts`, `content.ts`, or the model's `.config.json`).
3. Write the body as one to three accurate sentences.
4. Run `pnpm vitest run tests/unit/content.test.ts`.

### author walk path

1. Pick eye-level positions inside each room and a look-at target for each.
2. Add keyframes `{ id, label, t, hold, position, target, title, body }`. Times must strictly increase. `hold` is the rest time in seconds so the card can be read.
3. Validate with `validatePath` (the content test does this).
4. Make sure each `id` is something a person would say ("kitchen", "living room").

### voice to spec

1. Register ops with `createSpecterRegistry()` (core ops) or `new OpRegistry({ includeCore: false })` for a non-3D app.
2. Call `interpret(text, context, { endpoint: "/api/spec" })`. It tries the LLM, validates the answer against the same registry and scene context, then falls back to the local parser.
3. Show the readable preview (`registry.describe(spec)`), then `registry.apply(ctx, spec)`. Keep `registry.undo()` available.
4. Add phrases to the local parser (`packages/specter-voice/src/parser.ts`) with a table-driven test.

## Useful commands

```
pnpm test                       unit and property tests
pnpm test:e2e                   Playwright suite
pnpm models:audit file.glb      mesh names, triangles, budget warnings (add --init-config for a sidecar)
pnpm models:optimize file.glb   Draco + WebP compression
```
