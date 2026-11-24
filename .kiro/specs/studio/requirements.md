# Requirements: Specter Studio (build from an empty scene)

## Introduction
Studio starts empty. People build interactive 3D scenes by speaking or typing, or with Spline-style panels. Every change, whether spoken or clicked, becomes a validated, undoable Spec.

## Requirements

### R1: Building
1. WHEN the user asks for a known topic ("build a solar eclipse"), THE system SHALL build it from a built-in recipe, with labels, hotspots and motion.
2. WHEN the user asks for a real-world thing ("add a triceratops"), THE system SHALL search the free libraries (Poly Haven, Poly Pizza, Smithsonian CC0, built-in catalogue), show the matches as choices, and add the chosen model at a typical real-world size.
3. WHEN the user asks for something simple with no recipe ("a snowman"), THE system SHALL let the AI compose it from named shapes (at most 30).
4. WHEN the user says "generate ..." and a Meshy key is set, THE system SHALL run generation in the background and ask for confirmation when the model is ready.
5. IF nothing is found, THEN THE system SHALL say so and leave the scene unchanged.

### R2: Licensing
1. THE system SHALL only add library models that are CC0 or CC BY and load them only from allowlisted hosts.
2. THE system SHALL keep the credit for every library or generated object, show it in a credits panel, and write it into exported GLB files.
3. THE system SHALL show the platform credit each provider's terms require (Poly Pizza, Poly Haven) and SHALL NOT re-host or mirror their catalogues.

### R3: Editing
1. THE system SHALL support move, rotate, scale, place-on-top, duplicate (row, ring, grid, scatter), delete, colour, finish and visibility by voice and by panel.
2. WHEN the transform handle is released, THE system SHALL apply the change as an undoable op.
3. IF a requested position overlaps another object, THEN THE system SHALL place the new object in free space.

### R4: Motion, interactions and environment
1. THE system SHALL support spin, orbit (around another object), float, pulse and swing, and stopping them.
2. THE system SHALL support click and hover actions (show text, speak, zoom to, toggle motion, show/hide another object, highlight), which run in Play mode.
3. THE system SHALL support environment presets (studio, indoor, daylight, sunset, night, space) and turning the ground on or off.

### R5: Keeping work
1. THE system SHALL autosave the scene in the browser and restore it on reload.
2. THE system SHALL save and open scene files, produce share links and embed code, and export GLB.

### R6: Safety and limits
1. THE system SHALL reject scenes over 1.5x the triangle budget or with more than 200 objects, and roll back.
2. Every applied Spec SHALL be atomic: if one op fails, none of it stays.
