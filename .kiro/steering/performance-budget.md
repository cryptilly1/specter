# Performance budget

Defaults enforced by `checkBudget` in `specter-core` (a warning, never a crash):

| Resource | Budget |
|---|---|
| Triangles per scene | 300,000 |
| Draw calls | 200 |
| Largest texture edge | 2048 px |
| Total texture memory (estimated) | 128 MB |
| GLB file size (compressed) | 15 MB |

Rules:
- Compress shipped GLBs with `pnpm models:optimize` (gltf-transform: dedup, prune, Draco/Meshopt, texture resize).
- Cap device pixel ratio at 2.
- Post-processing is off by default on mobile.
- When a budget is exceeded, show a non-blocking warning in dev and fall back to the procedural model only if loading actually fails.
