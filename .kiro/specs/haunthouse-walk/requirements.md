# Requirements: HauntHouse Walk (walkthrough app)

## Introduction
A guided camera tour through one apartment, with room cards, that the viewer can redecorate and annotate by voice or text.

## Requirements

### R1: Tour
1. THE app SHALL play a camera path through every room, resting at each room long enough to read its card.
2. THE app SHALL support play, pause, previous, next and jump-to-room.
3. WHEN the user says "go to the kitchen", THE app SHALL move the camera to that room and update the card.

### R2: Redecorating
1. WHEN the user says "Paint the sofa blue", THE app SHALL change only the sofa's materials.
2. WHEN the user says "Add a note on the kitchen sink saying ...", THE app SHALL pin a note to the sink.
3. Changes SHALL apply to the existing apartment model only. The app SHALL NOT generate new buildings.

### R3: Models
1. WHEN `/models/apartment.glb` exists, THE app SHALL use it with tour and hotspots from its sidecar; otherwise it SHALL use the procedural apartment.
2. WHEN a Gaussian splat scan exists at `/models/place.(spz|ply|splat)`, THE app SHALL offer a "Real place (scan)" scene with camera-only voice commands. IF it fails to load, THEN THE app SHALL return to the apartment.

### R4: Accessibility
1. Room cards SHALL be readable aloud, and every control SHALL be keyboard reachable.
