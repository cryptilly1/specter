# Specter 3D architecture rules

These rules apply to every change in `packages/specter-core`, `packages/specter-viewer`, `packages/specter-r3f` and every app.

## Scene graph and GPU resources
- Every mesh, light and helper lives under a scene root created by `createSpecterScene`. Never add objects to the raw `THREE.Scene` from app code.
- Anything that creates geometries, materials or textures must be disposed through `disposeObject3D` or `scene.destroy()`. No orphaned GPU resources on pack switch, model swap or route change.
- Material swaps clone the material before editing so shared materials are never mutated.
- Use only documented Three.js APIs. Look them up with the Three.js docs MCP before using an API you are not sure about. Do not invent loader or control methods.

## Studio objects
- Studio objects live in `StudioWorld`. Removing one frees only GPU resources no other object uses (copies share geometry).
- Library and generated models are normalised to a real-world height and stood on the ground. Their license record travels with them.
- Names users give objects ("cube", "sphere") must always stay targetable, even when they look like exporter defaults.

## Hotspots and targets
- A hotspot always has `title`, `body`, and a resolvable target (a named mesh or a world position). An unresolvable target throws a typed `TargetNotFoundError`. It never silently does nothing.
- Hotspot markers must be keyboard-focusable and carry an ARIA label.

## Rendering
- No custom GLSL or ShaderMaterial in the MVP. Standard PBR materials only (`MeshStandardMaterial` / `MeshPhysicalMaterial`).
- Post-processing (SSAO, bloom) is behind the quality toggle and must be off on low-power devices.

## Package boundaries
- `specter-voice` has zero 3D dependencies. It must never import `three`.
- `specter-library` (model search, licenses, Meshy) has zero 3D dependencies and runs on the server. It never re-hosts provider files.
- `specter-core` may import `specter-voice` but never React.
- Apps compose packages. They do not reach into package internals.
