# Design: specter-core and specter-voice

## Packages
- `specter-voice` (no 3D): op registry, Zod schemas, deterministic parser, `interpret()` client, voice input, undo stack.
- `specter-core` (Three.js): `createSpecterScene`, loaders, lighting, hotspots, notes, materials, path player, budget, dispose. Registers core ops with the `specter-voice` registry.
- `specter-viewer`: `<specter-viewer>` web component.
- `specter-r3f`: thin R3F adapter.

## Spec shape
```json
{ "version": 1, "ops": [ { "op": "setMaterial", "mesh": "sofa", "color": "#3b82f6" } ] }
```
Ops: `addHotspot`, `updateHotspot`, `removeHotspot`, `setMaterial`, `addNote`, `setCamera`, `loadPack`, `setVisibility`.

## Flow
Input (mic / text / chip) -> `interpret(text, context)` -> (`/api/spec` | local parser) -> Zod validate -> confirm UI -> `applySpec(registry, spec)` -> app apply functions -> scene.

## Key decisions
- **Patch ops, not full state:** voice edits an existing scene, so apply is idempotent and easy to property-test.
- **Context in prompt:** the LLM receives known mesh and hotspot ids, so it can only reference real targets. Unknown ids are rejected after validation too.
- **Undo:** each op's apply function returns an inverse; the registry keeps a stack.
- **Fallbacks:** procedural models and the local parser guarantee the demo works offline.

## Properties to test (PBT)
- P1: every hotspot target resolves or fails loudly.
- P2: material swaps affect only listed meshes.
- P3: applying a Spec twice equals applying it once.
- P4: apply then undo restores the previous state.
- P5: path keyframes are strictly increasing in time or rejected.
- P6: after `applySpec`, `destroy()` leaves no undisposed resources.
- P7: unknown op types and unknown targets never mutate the scene.
