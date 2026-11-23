import * as THREE from "three";
import { namedGroup, namedMesh, pbr } from "specter-core";

type V3 = [number, number, number];

/** A box whose position is its centre on the floor plan: x, z centre and y = bottom. */
function box(name: string, w: number, h: number, d: number, at: V3, color: string, o: Partial<{ roughness: number; metalness: number; emissive: string; emissiveIntensity: number; opacity: number; rot: V3; shadow: boolean }> = {}): THREE.Mesh {
  const m = namedMesh(name, new THREE.BoxGeometry(w, h, d), pbr(color, { roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0, emissive: o.emissive, emissiveIntensity: o.emissiveIntensity, opacity: o.opacity }), [at[0], at[1] + h / 2, at[2]], {
    rotation: o.rot,
    castShadow: o.shadow ?? true,
  });
  return m;
}

function cyl(name: string, rTop: number, rBot: number, h: number, at: V3, color: string, o: Partial<{ roughness: number; metalness: number; emissive: string; emissiveIntensity: number }> = {}): THREE.Mesh {
  return namedMesh(name, new THREE.CylinderGeometry(rTop, rBot, h, 24), pbr(color, { roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, emissive: o.emissive, emissiveIntensity: o.emissiveIntensity }), [at[0], at[1] + h / 2, at[2]]);
}

const WALL_H = 2.7;
const WALL_T = 0.16;

/** A wall along X (fixed z) or Z (fixed x) with optional door openings. Segments are plain meshes inside one group. */
function wallRun(axis: "x" | "z", fixed: number, from: number, to: number, doors: [number, number][], height: number, color: string, prefix: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const cuts = [...doors].sort((a, b) => a[0] - b[0]);
  let cursor = from;
  const seg = (a: number, b: number, y0: number, h: number, tag: string) => {
    if (b - a < 0.01 || h < 0.01) return;
    const len = b - a;
    const mid = (a + b) / 2;
    const [w, d, x, z] = axis === "x" ? [len, WALL_T, mid, fixed] : [WALL_T, len, fixed, mid];
    out.push(box(`${prefix}_${tag}`, w, h, d, [x, y0, z], color, { roughness: 0.92 }));
  };
  cuts.forEach(([a, b], i) => {
    seg(cursor, a, 0, height, `seg${i}`);
    seg(a, b, 2.1, height - 2.1, `lintel${i}`);
    cursor = b;
  });
  seg(cursor, to, 0, height, "end");
  return out;
}

export interface Apartment {
  root: THREE.Group;
}

export function buildApartment(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = "apartment";

  // ---------- floors ----------
  const floors = namedGroup("floor", [
    box("floor_living", 8, 0.1, 5, [-3, -0.1, 2.5], "#8a6a4b", { roughness: 0.55, shadow: false }),
    box("floor_kitchen", 6, 0.1, 5, [4, -0.1, 2.5], "#cfc9bd", { roughness: 0.35, shadow: false }),
    box("floor_bedroom", 6, 0.1, 5, [-4, -0.1, -2.5], "#7b5a44", { roughness: 0.55, shadow: false }),
    box("floor_study", 8, 0.1, 5, [3, -0.1, -2.5], "#5f4a3a", { roughness: 0.55, shadow: false }),
  ]);
  root.add(floors);

  // ---------- walls ----------
  const wallColor = "#b8ab9b";
  const walls = namedGroup("walls", [
    // north and west outer walls full height, south and east lowered like a dolls-house cutaway
    ...wallRun("x", -5, -7, 7, [], WALL_H, wallColor, "wall_north"),
    ...wallRun("z", -7, -5, 5, [], WALL_H, wallColor, "wall_west"),
    ...wallRun("x", 5, -7, 7, [], 0.9, wallColor, "wall_south"),
    ...wallRun("z", 7, -5, 5, [], WALL_H, wallColor, "wall_east"),
    // interior
    ...wallRun("z", 1, 0, 5, [[1.2, 3.8]], WALL_H, wallColor, "wall_kitchen_arch"),
    ...wallRun("x", 0, -7, -1, [[-3, -2]], WALL_H, wallColor, "wall_bedroom"),
    ...wallRun("z", -1, -5, 0, [[-3, -2]], WALL_H, wallColor, "wall_bed_study"),
    ...wallRun("x", 0, -1, 7, [[1.8, 2.8]], WALL_H, wallColor, "wall_study"),
  ]);
  root.add(walls);

  // ---------- living room ----------
  const sofa = namedGroup(
    "sofa",
    [
      box("sofa_base", 2.5, 0.42, 1.0, [0, 0.12, 0], "#8a7762", { roughness: 0.85 }),
      box("sofa_back", 2.5, 0.62, 0.22, [0, 0.54, 0.39], "#8a7762", { roughness: 0.85 }),
      box("sofa_arm_l", 0.24, 0.5, 1.0, [-1.13, 0.54, 0], "#7d6a56", { roughness: 0.85 }),
      box("sofa_arm_r", 0.24, 0.5, 1.0, [1.13, 0.54, 0], "#7d6a56", { roughness: 0.85 }),
      box("sofa_cushion_l", 1.0, 0.16, 0.78, [-0.5, 0.54, -0.06], "#9b8670", { roughness: 0.9 }),
      box("sofa_cushion_r", 1.0, 0.16, 0.78, [0.5, 0.54, -0.06], "#9b8670", { roughness: 0.9 }),
    ],
    [-3.2, 0, 4.15],
  );
  root.add(sofa); // back to the south wall, facing the television on the north wall

  root.add(box("rug_living", 3.4, 0.02, 2.4, [-3.2, 0, 2.6], "#7a2f3a", { roughness: 1, shadow: false }));
  root.add(namedGroup("coffee_table", [box("coffee_table_top", 1.3, 0.06, 0.7, [0, 0.4, 0], "#3a2a22", { roughness: 0.4 }), ...[[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]].map(([x, z], i) => box(`coffee_table_leg_${i}`, 0.06, 0.4, 0.06, [x!, 0, z!], "#2a1c16"))], [-3.2, 0, 2.5]));
  root.add(
    namedGroup("tv_stand", [box("tv_stand_body", 1.8, 0.45, 0.45, [0, 0, 0], "#2d2420", { roughness: 0.5 })], [-3.2, 0, 0.4]),
  );
  root.add(
    namedGroup(
      "television",
      [box("tv_frame", 1.35, 0.78, 0.06, [0, 0, 0], "#111111", { roughness: 0.3 }), box("tv_screen", 1.27, 0.7, 0.02, [0, 0.04, 0.035], "#0e1a2b", { roughness: 0.15, emissive: "#18305a", emissiveIntensity: 0.5, shadow: false })],
      [-3.2, 0.95, 0.5],
    ),
  );
  const shelfParts: THREE.Mesh[] = [box("bookshelf_frame", 0.4, 2.1, 1.6, [0, 0, 0], "#4a3426", { roughness: 0.6 })];
  const bookColors = ["#a23b3b", "#2f6f8f", "#c9a23a", "#4b7a4a", "#6b4a8f", "#b4572a"];
  for (let s = 0; s < 4; s++) for (let b = 0; b < 6; b++) shelfParts.push(box(`book_${s}_${b}`, 0.22, 0.34, 0.14, [0.08, 0.2 + s * 0.5, -0.65 + b * 0.24], bookColors[(s + b) % bookColors.length]!, { roughness: 0.8 }));
  root.add(namedGroup("bookshelf", shelfParts, [-6.75, 0, 2.5]));
  root.add(
    namedGroup("floor_lamp", [cyl("floor_lamp_pole", 0.03, 0.03, 1.5, [0, 0, 0], "#222222", { metalness: 0.6 }), cyl("floor_lamp_base", 0.18, 0.2, 0.04, [0, 0, 0], "#222222"), cyl("floor_lamp_shade", 0.28, 0.2, 0.34, [0, 1.45, 0], "#f6e7c1", { emissive: "#ffcf80", emissiveIntensity: 0.9 })], [-6.0, 0, 4.4]),
  );
  root.add(namedGroup("plant", [cyl("plant_pot", 0.22, 0.17, 0.35, [0, 0, 0], "#8b5a3c"), ...Array.from({ length: 7 }, (_, i) => namedMesh(`plant_leaf_${i}`, new THREE.SphereGeometry(0.2, 12, 10), pbr("#3d7a3d", { roughness: 0.8 }), [Math.cos(i) * 0.18, 0.55 + (i % 3) * 0.2, Math.sin(i) * 0.18], { scale: [0.8, 1.5, 0.5], rotation: [0, i, 0.4] }))], [0.45, 0, 4.4]));
  root.add(
    namedGroup("grandfather_clock", [box("clock_case", 0.5, 2.0, 0.35, [0, 0, 0], "#3b2417", { roughness: 0.5 }), box("clock_face", 0.34, 0.34, 0.03, [0, 1.5, -0.18], "#f1e8d2", { roughness: 0.6 }), box("clock_pendulum", 0.04, 0.6, 0.02, [0, 0.45, -0.18], "#d4a017", { metalness: 0.8, roughness: 0.3 })], [-1.2, 0, 0.35]),
  );
  root.add(box("window_living", 0.05, 1.1, 1.8, [-6.95, 1.0, 4.0], "#9fc6ff", { emissive: "#6fa3ff", emissiveIntensity: 0.6, roughness: 0.1, shadow: false }));

  // ---------- kitchen & dining ----------
  const counterParts: THREE.Mesh[] = [box("counter_base", 4.2, 0.88, 0.62, [0, 0, 0], "#2f3b46", { roughness: 0.6 }), box("counter_top", 4.3, 0.05, 0.68, [0, 0.88, 0], "#e7e4de", { roughness: 0.2 })];
  root.add(namedGroup("kitchen_counter", counterParts, [4.2, 0, 0.45]));
  root.add(
    namedGroup("kitchen_sink", [box("sink_basin", 0.8, 0.04, 0.45, [0, 0, 0], "#b8bfc6", { metalness: 0.9, roughness: 0.25 }), cyl("faucet_stem", 0.025, 0.025, 0.3, [0.0, 0.0, -0.18], "#c9d1d8", { metalness: 0.95, roughness: 0.2 }), box("faucet_spout", 0.03, 0.03, 0.2, [0, 0.3, -0.09], "#c9d1d8", { metalness: 0.95, roughness: 0.2 })], [3.1, 0.9, 0.45]),
  );
  root.add(
    namedGroup("stove", [box("stove_top", 0.7, 0.03, 0.55, [0, 0, 0], "#1a1a1a", { metalness: 0.5, roughness: 0.3 }), ...[[-0.17, -0.12], [0.17, -0.12], [-0.17, 0.12], [0.17, 0.12]].map(([x, z], i) => cyl(`burner_${i}`, 0.11, 0.11, 0.015, [x!, 0.03, z!], "#444444", { metalness: 0.7 }))], [5.3, 0.93, 0.45]),
  );
  root.add(namedGroup("fridge", [box("fridge_body", 0.85, 1.9, 0.75, [0, 0, 0], "#d8dde2", { metalness: 0.5, roughness: 0.3 }), box("fridge_handle", 0.04, 0.8, 0.05, [0.32, 0.8, 0.4], "#8a9097", { metalness: 0.9, roughness: 0.3 })], [6.4, 0, 0.5]));
  const dining: THREE.Object3D[] = [box("dining_table_top", 1.8, 0.06, 0.95, [0, 0.74, 0], "#6b4a33", { roughness: 0.4 }), ...[[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].map(([x, z], i) => box(`dining_table_leg_${i}`, 0.07, 0.74, 0.07, [x!, 0, z!], "#4a3223"))];
  root.add(namedGroup("dining_table", dining, [4.3, 0, 3.3]));
  const chairs: THREE.Object3D[] = [];
  [[-0.5, -0.85, Math.PI], [0.5, -0.85, Math.PI], [-0.5, 0.85, 0], [0.5, 0.85, 0]].forEach(([x, z, r], i) => {
    const c = namedGroup(`dining_chair_${i}`, [box(`chair_seat_${i}`, 0.45, 0.06, 0.45, [0, 0.45, 0], "#8a5a3a"), box(`chair_back_${i}`, 0.45, 0.5, 0.05, [0, 0.5, 0.2], "#8a5a3a"), ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([lx, lz], j) => box(`chair_leg_${i}_${j}`, 0.05, 0.45, 0.05, [lx!, 0, lz!], "#4a3223"))], [4.3 + x!, 0, 3.3 + z!]);
    c.rotation.y = r!;
    chairs.push(c);
  });
  root.add(namedGroup("dining_chairs", chairs));
  root.add(
    namedGroup("candelabra", [cyl("candelabra_base", 0.08, 0.1, 0.03, [0, 0, 0], "#b08d3a", { metalness: 0.9, roughness: 0.3 }), cyl("candelabra_stem", 0.015, 0.015, 0.3, [0, 0.03, 0], "#b08d3a", { metalness: 0.9 }), ...[-0.12, 0, 0.12].flatMap((x, i) => [cyl(`candle_${i}`, 0.02, 0.02, 0.14, [x, 0.3, 0], "#f4ead2"), namedMesh(`flame_${i}`, new THREE.SphereGeometry(0.022, 10, 8), pbr("#ffb347", { emissive: "#ff8a1f", emissiveIntensity: 3 }), [x, 0.48, 0], { scale: [1, 1.6, 1], castShadow: false })])], [4.3, 0.77, 3.3]),
  );
  root.add(box("window_kitchen", 0.05, 1.1, 1.8, [6.95, 1.1, 3.2], "#9fc6ff", { emissive: "#6fa3ff", emissiveIntensity: 0.6, roughness: 0.1, shadow: false }));

  // ---------- bedroom ----------
  root.add(
    namedGroup(
      "bed",
      [
        box("bed_frame", 1.7, 0.3, 2.1, [0, 0, 0], "#3d2a21", { roughness: 0.6 }),
        box("bed_headboard", 1.8, 1.0, 0.1, [0, 0, -1.05], "#3d2a21", { roughness: 0.6 }),
        box("bed_mattress", 1.6, 0.25, 2.0, [0, 0.3, 0.02], "#e8e2f0", { roughness: 0.95 }),
        box("bed_blanket", 1.62, 0.1, 1.2, [0, 0.52, 0.45], "#6b3a5c", { roughness: 1 }),
        box("pillow_left", 0.6, 0.14, 0.38, [-0.4, 0.55, -0.75], "#ffffff", { roughness: 1 }),
        box("pillow_right", 0.6, 0.14, 0.38, [0.4, 0.55, -0.75], "#ffffff", { roughness: 1 }),
      ],
      [-4.2, 0, -3.8],
    ),
  );
  root.add(box("rug_bedroom", 2.6, 0.02, 1.8, [-4.2, 0, -2.2], "#38455c", { roughness: 1, shadow: false }));
  [-5.6, -2.8].forEach((x, i) => {
    root.add(namedGroup(`nightstand_${i === 0 ? "left" : "right"}`, [box(`nightstand_body_${i}`, 0.5, 0.5, 0.4, [0, 0, 0], "#3d2a21", { roughness: 0.6 })], [x, 0, -4.7]));
  });
  root.add(
    namedGroup("bedside_lamp", [cyl("bedside_lamp_base", 0.07, 0.09, 0.2, [0, 0, 0], "#c9a959", { metalness: 0.6 }), cyl("bedside_lamp_shade", 0.14, 0.1, 0.2, [0, 0.2, 0], "#f6e7c1", { emissive: "#ffcf80", emissiveIntensity: 1.1 })], [-2.8, 0.5, -4.7]),
  );
  root.add(namedGroup("wardrobe", [box("wardrobe_body", 0.65, 2.2, 1.7, [0, 0, 0], "#5a4535", { roughness: 0.55 }), box("wardrobe_door_l", 0.03, 2.0, 0.8, [0.34, 0.1, -0.42], "#6b5440"), box("wardrobe_door_r", 0.03, 2.0, 0.8, [0.34, 0.1, 0.42], "#6b5440")], [-6.6, 0, -2.2]));
  root.add(box("window_bedroom", 0.05, 1.1, 1.8, [-6.95, 1.1, -3.2], "#9fc6ff", { emissive: "#6fa3ff", emissiveIntensity: 0.5, roughness: 0.1, shadow: false }));

  // ---------- study ----------
  root.add(
    namedGroup(
      "desk",
      [box("desk_top", 1.7, 0.05, 0.8, [0, 0.72, 0], "#4a3426", { roughness: 0.45 }), box("desk_leg_l", 0.06, 0.72, 0.7, [-0.8, 0, 0], "#33231a"), box("desk_leg_r", 0.06, 0.72, 0.7, [0.8, 0, 0], "#33231a"), box("laptop_base", 0.4, 0.02, 0.28, [0, 0.77, 0.05], "#9aa0a8", { metalness: 0.8, roughness: 0.3 }), box("laptop_screen", 0.4, 0.26, 0.015, [0, 0.79, -0.08], "#1a2438", { emissive: "#3b5da8", emissiveIntensity: 0.6, rot: [-0.25, 0, 0], shadow: false })],
      [4.5, 0, -4.4],
    ),
  );
  root.add(
    namedGroup("desk_chair", [box("desk_chair_seat", 0.5, 0.07, 0.5, [0, 0.46, 0], "#2b2b34"), box("desk_chair_back", 0.5, 0.55, 0.06, [0, 0.55, 0.25], "#2b2b34"), cyl("desk_chair_post", 0.04, 0.04, 0.45, [0, 0, 0], "#444444", { metalness: 0.7 })], [4.5, 0, -3.5]),
  );
  root.add(
    namedGroup("desk_lamp", [cyl("desk_lamp_base", 0.08, 0.09, 0.03, [0, 0, 0], "#222222"), box("desk_lamp_arm", 0.025, 0.4, 0.025, [0, 0.03, 0], "#222222"), cyl("desk_lamp_head", 0.1, 0.05, 0.12, [0, 0.4, 0], "#d4a017", { emissive: "#ffcf80", emissiveIntensity: 1.2 })], [3.8, 0.77, -4.5]),
  );
  root.add(namedGroup("study_shelf", [box("study_shelf_frame", 2.2, 1.6, 0.3, [0, 0, 0], "#4a3426")], [1.5, 0, -4.82]));
  root.add(
    namedGroup("portrait", [box("portrait_frame", 0.9, 1.2, 0.06, [0, 0, 0], "#b08d3a", { metalness: 0.8, roughness: 0.35 }), box("portrait_canvas", 0.74, 1.04, 0.02, [0, 0.08, 0.035], "#2a2530", { roughness: 0.9 }), namedMesh("portrait_eye_l", new THREE.SphereGeometry(0.035, 10, 8), pbr("#e8f0ff", { emissive: "#9bd1ff", emissiveIntensity: 2 }), [-0.1, 0.72, 0.06], { castShadow: false }), namedMesh("portrait_eye_r", new THREE.SphereGeometry(0.035, 10, 8), pbr("#e8f0ff", { emissive: "#9bd1ff", emissiveIntensity: 2 }), [0.1, 0.72, 0.06], { castShadow: false })], [-0.5, 1.0, -4.88]),
  );
  root.add(namedGroup("armchair", [box("armchair_seat", 0.9, 0.45, 0.9, [0, 0, 0], "#6b2f2f", { roughness: 0.9 }), box("armchair_back", 0.9, 0.55, 0.2, [0, 0.45, 0.35], "#6b2f2f", { roughness: 0.9 })], [-0.1, 0, -2.2]));
  root.add(box("window_study", 1.8, 1.1, 0.05, [4.5, 1.3, -4.95], "#9fc6ff", { emissive: "#6fa3ff", emissiveIntensity: 0.5, roughness: 0.1, shadow: false }));
  root.add(box("rug_study", 2.6, 0.02, 1.8, [3.4, 0, -3.2], "#4a3a52", { roughness: 1, shadow: false }));

  // room lights (soft warm glows; no shadows so the scene stays cheap)
  const lights: [number, number, number, string][] = [
    [-3.2, 2.3, 2.5, "#ffd9a3"],
    [4.3, 2.3, 2.5, "#fff0d9"],
    [-4.0, 2.3, -2.5, "#ffc98a"],
    [3.4, 2.3, -2.5, "#ffd9a3"],
  ];
  lights.forEach(([x, y, z, c], i) => {
    const l = new THREE.PointLight(c, 6, 9, 2);
    l.position.set(x, y, z);
    l.name = `room_light_${i}`;
    l.userData.specterIgnore = true;
    root.add(l);
  });

  return root;
}

/** Eye-level tour. Times are strictly increasing; ids double as voice targets ("go to the kitchen"). */
export const TOUR = [
  { id: "overview", label: "Overview", t: 0, hold: 0, position: [10, 12, 13], target: [0, 0, 0], title: "The whole apartment", body: "A cutaway of a four-room apartment: living room, kitchen and dining area, bedroom and study. Everything you see has a name, so you can ask for changes by voice." },
  { id: "living-room", label: "Living room", t: 6, hold: 5, position: [-6.2, 1.7, 4.4], target: [-2.4, 1.0, 1.4], title: "Living room", body: "Warm wood floors, a deep taupe sofa facing the television, and a grandfather clock that has not told the right time in years." },
  { id: "kitchen", label: "Kitchen", t: 12, hold: 5, position: [1.7, 1.7, 4.5], target: [5.0, 1.0, 1.2], title: "Kitchen and dining", body: "A galley counter with a stove and sink, a tall fridge, and a dining table lit by a candelabra. A window on the east wall lets in the morning light." },
  { id: "study", label: "Study", t: 19, hold: 5, position: [0.2, 1.7, -0.7], target: [3.6, 1.1, -4.0], title: "Study", body: "A quiet corner with a desk, a laptop and a portrait whose eyes seem to follow you around the room." },
  { id: "bedroom", label: "Bedroom", t: 26, hold: 5, position: [-1.7, 1.7, -0.8], target: [-4.6, 0.8, -3.6], title: "Bedroom", body: "A king-size bed with a carved headboard, two nightstands and a wardrobe. The west window catches the evening light." },
] as const;

export const TOUR_VIEWS: Record<string, { position: V3; target: V3 }> = Object.fromEntries(TOUR.map((k) => [k.id, { position: [...k.position] as V3, target: [...k.target] as V3 }]));
