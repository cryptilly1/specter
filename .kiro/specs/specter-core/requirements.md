# Requirements: specter-core and specter-voice

## Introduction
Specter is a cloneable kit for interactive 3D web experiences. Users author scenes by voice or text. The input becomes a validated Spec (a list of patch operations) that is applied to a Three.js scene.

## Requirements

### R1: Scene lifecycle
**User story:** As a developer, I want a scene factory that handles rendering, resizing and cleanup, so that I never write the 100-line Three.js boilerplate or leak GPU memory.

1. WHEN `createSpecterScene(container)` is called, THE system SHALL create a renderer, camera, lighting preset and orbit controls attached to the container.
2. WHEN the container is resized, THE system SHALL update the renderer size and camera aspect.
3. WHEN `destroy()` is called, THE system SHALL dispose all geometries, materials and textures under the scene root and release the WebGL context.
4. WHEN a model fails to load, THE system SHALL call the supplied fallback factory and surface a non-blocking error state.

### R2: Hotspots and notes
1. THE system SHALL require every hotspot to have a `title`, a `body` and a target (a named mesh or a world position).
2. IF a hotspot target cannot be resolved, THEN THE system SHALL throw a `TargetNotFoundError` naming the missing target.
3. WHEN a hotspot marker is clicked or activated by keyboard, THE system SHALL open a panel with its title and body.
4. THE system SHALL give every hotspot marker an accessible label.

### R3: Materials and visibility
1. WHEN `setMaterial` is applied to a named mesh, THE system SHALL change only that mesh's material.
2. THE system SHALL clone a material before editing it so that shared materials are not affected.
3. WHEN `setVisibility` is applied, THE system SHALL show or hide only the named mesh or group.

### R4: Spec and ops (specter-voice)
1. THE system SHALL define the Spec as a versioned list of patch operations validated with Zod.
2. WHEN an op type is not registered, THE system SHALL reject it with a readable error.
3. WHEN the same Spec is applied twice, THE system SHALL produce the same scene state (idempotent apply).
4. WHEN undo is requested, THE system SHALL restore the state before the last applied Spec.
5. THE `specter-voice` package SHALL NOT depend on Three.js.

### R5: Interpretation chain
1. WHEN text or a transcript is submitted, THE system SHALL try `/api/spec` first with a timeout of about 3 seconds.
2. IF the API fails, times out or returns invalid output, THEN THE system SHALL fall back to the local deterministic parser.
3. THE system SHALL show the interpreted ops in plain language and require confirmation before applying.
4. THE system SHALL treat the transcript as data and accept only registered op types.

### R6: Camera paths
1. THE system SHALL play a camera path made of keyframes with strictly increasing times.
2. IF keyframe times are not strictly increasing, THEN THE system SHALL reject the path.

### R7: Performance budget
1. WHEN a loaded scene exceeds the triangle, draw-call or texture budget, THE system SHALL report a warning without crashing.

### R8: Security
1. THE system SHALL read provider API keys only from server environment variables and never send or log them.
2. THE `/api/spec` endpoint SHALL cap request size and rate-limit callers.
