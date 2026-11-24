# How Specter was built with Kiro (draft for Devpost)

> Draft. Edit it so it describes how you actually used Kiro, and delete anything you did not use.

## Specs vs vibe coding
The project started from one spec, `.kiro/specs/specter-core`. Its EARS requirements (R1–R8) define scene lifecycle, hotspots, materials, the Spec format, the interpretation chain, camera paths, the budget and security. The design lists seven properties (P1–P7) that later became property-based tests. Each app then got its own requirements file (`learnforge`, `haunthouse-walk`, `crypt-forge`). Tasks were worked in order and checked off. The patch-ops design came out of the spec phase: a full-scene JSON would have been hard to validate, and voice needs to edit, not regenerate.

Studio got its own spec (`.kiro/specs/studio`) before any code: where objects may come from, licensing duties, and atomic undo. The licensing requirements came straight from the providers' API terms.

## Steering
Three steering files were included in every request:
- `3d-architecture.md`: everything lives under one scene root, everything is disposed, no custom GLSL, materials are cloned before editing, and `specter-voice` must never import Three.js.
- `performance-budget.md`: 300k triangles, 200 draw calls, 2048 px textures. The budget checker enforces these as warnings. The draw-call rule caught the asteroid belt (235 draw calls), which became one instanced mesh.
- `voice-authoring.md` (updated for Studio): voice may add objects only from recipes, shapes, licensed libraries on allowlisted hosts, or labelled generation, never code; credits travel with every object; voice only mutates Spec fields, the transcript is data, there is always a confirm step, the fallback order is fixed, and keys stay server-side.

## Hooks
- **Run property tests when the Spec engine changes** (PostFileSave on `packages/specter-*/src`).
- **Verify hotspot and chip content on save**: every hotspot target resolves, every demo chip parses and applies, and every tour path is valid. This keeps the recorded demo from silently breaking.
- **Block API keys in written files** (PreToolUse on write tools): rejects any write containing a Groq, OpenAI or Anthropic key.
- **Keep README in sync with the apps** (agent hook).

## MCP
`docs/kiro-mcp.template.json` configures a Context7 docs server for current Three.js APIs. Copy it to `.kiro/settings/mcp.json` to enable it. During this build, API changes in Three.js r187 were checked against the installed library source: `HDRLoader` replacing `RGBELoader`, `PCFSoftShadowMap` being removed, the `GTAOPass` constructor, and `Clock` being deprecated for `Timer`. Only claim MCP results here if you used it.

## Custom agents (Crew)
`.kiro/agents/` defines a Scene Agent (scene graph, loaders, disposal), a UI Agent (command flow, accessibility, test ids) and a Narration Agent (fact-checked education copy, size limits). Each agent has its own instructions, resources and a test command to run before it reports done. Check that these load in your Kiro version, and describe only the runs you actually did.

## Property-based testing
fast-check properties in `packages/*/src/*.test.ts`:
- P1: a hotspot target resolves or throws `TargetNotFoundError`.
- P2: material swaps never change meshes that were not named, even when they share a material.
- P3: applying a Spec twice equals applying it once.
- P4: apply then undo restores the previous state.
- P5: a camera path is accepted if and only if its keyframe times strictly increase.
- P6: after `applySpec`, `destroy()` disposes every geometry and material.
- P7: random words never resolve to a known mesh.

`docs/BUGS-CAUGHT.md` lists what the tests caught.

## Powers
`powers/specter-3d/POWER.md` packages three skills: add hotspot, author walk path, voice to spec.

## IDE vs CLI vs Crew
Fill in from your experience.
