import * as THREE from "three";
import { groundDisc, namedGroup, namedMesh, pbr } from "specter-core";

const METAL = "#3b3b44";

/** A procedural lantern. Every part has a name so it can be restyled by click or by voice. */
export function buildLantern(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = "lantern_root";

  root.add(groundDisc(4.5, 0x120d1c));

  const base = namedGroup("base", [
    namedMesh("base_plate", new THREE.CylinderGeometry(0.62, 0.7, 0.14, 48), pbr(METAL, { metalness: 0.85, roughness: 0.4 }), [0, 0.07, 0]),
    ...[0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      return namedMesh(`base_foot_${i}`, new THREE.SphereGeometry(0.07, 14, 10), pbr(METAL, { metalness: 0.85, roughness: 0.4 }), [Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.55]);
    }),
  ]);

  const frameMat = () => pbr(METAL, { metalness: 0.85, roughness: 0.38 });
  const frameParts: THREE.Object3D[] = [
    namedMesh("frame_ring_bottom", new THREE.TorusGeometry(0.46, 0.035, 12, 48), frameMat(), [0, 0.18, 0], { rotation: [Math.PI / 2, 0, 0] }),
    namedMesh("frame_ring_top", new THREE.TorusGeometry(0.46, 0.035, 12, 48), frameMat(), [0, 1.38, 0], { rotation: [Math.PI / 2, 0, 0] }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    frameParts.push(namedMesh(`frame_post_${i}`, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 12), frameMat(), [Math.cos(a) * 0.46, 0.78, Math.sin(a) * 0.46]));
  }
  const frame = namedGroup("frame", frameParts);

  const glass = namedMesh("glass", new THREE.CylinderGeometry(0.43, 0.43, 1.18, 48, 1, true), pbr("#cfe8ff", { roughness: 0.04, metalness: 0, opacity: 0.28, side: THREE.DoubleSide }), [0, 0.78, 0], { castShadow: false });

  const candle = namedMesh("candle", new THREE.CylinderGeometry(0.13, 0.14, 0.55, 28), pbr("#f3e9d0", { roughness: 0.7 }), [0, 0.425, 0]);

  const flameLight = new THREE.PointLight(0xffa24a, 5, 7, 2);
  flameLight.name = "flame_light";
  flameLight.userData.specterIgnore = true;
  flameLight.position.set(0, 0.2, 0);
  const flame = namedGroup(
    "flame",
    [namedMesh("flame_body", new THREE.SphereGeometry(0.09, 20, 16), pbr("#ffcf7a", { emissive: "#ff9a2e", emissiveIntensity: 3.2, roughness: 0.5 }), [0, 0, 0], { scale: [1, 2.1, 1], castShadow: false }), flameLight],
    [0, 0.84, 0],
  );

  const cap = namedGroup("cap", [
    namedMesh("cap_cone", new THREE.ConeGeometry(0.62, 0.42, 48), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 1.62, 0]),
    namedMesh("cap_ring", new THREE.TorusGeometry(0.5, 0.045, 12, 48), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 1.4, 0], { rotation: [Math.PI / 2, 0, 0] }),
    namedMesh("cap_finial", new THREE.SphereGeometry(0.075, 16, 12), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 1.87, 0]),
  ]);

  const handleRing = namedGroup("handle_ring", [namedMesh("handle_ring_loop", new THREE.TorusGeometry(0.3, 0.04, 14, 48), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 2.1, 0])]);

  const handleHook = namedGroup("handle_hook", [
    namedMesh("handle_hook_arc", new THREE.TorusGeometry(0.34, 0.04, 14, 40, Math.PI), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 1.93, 0], { rotation: [0, 0, 0] }),
    namedMesh("handle_hook_tip", new THREE.TorusGeometry(0.1, 0.035, 12, 24, Math.PI * 1.3), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 2.38, 0], { rotation: [0, 0, Math.PI * 0.9] }),
    namedMesh("handle_hook_stem", new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), pbr(METAL, { metalness: 0.85, roughness: 0.38 }), [0, 2.15, 0]),
  ]);
  handleHook.visible = false;

  root.add(base, frame, glass, candle, flame, cap, handleRing, handleHook);
  return root;
}

export const VIEWS = {
  overview: { position: [3.6, 2.6, 5.4] as [number, number, number], target: [0, 1.0, 0] as [number, number, number] },
  "flame-closeup": { position: [1.3, 1.1, 2.0] as [number, number, number], target: [0, 0.85, 0] as [number, number, number] },
  top: { position: [0.1, 5.5, 3.2] as [number, number, number], target: [0, 1.2, 0] as [number, number, number] },
  "side-view": { position: [5.6, 1.4, 0.1] as [number, number, number], target: [0, 1.0, 0] as [number, number, number] },
};

export const ALIASES: Record<string, string> = {
  metalwork: "frame",
  cage: "frame",
  body: "frame",
  bars: "frame",
  window: "glass",
  panes: "glass",
  wax: "candle",
  fire: "flame",
  light: "flame",
  lid: "cap",
  roof: "cap",
  top: "cap",
  hat: "cap",
  stand: "base",
  bottom: "base",
  "ring handle": "handle_ring",
  "round handle": "handle_ring",
  "hook handle": "handle_hook",
  hook: "handle_hook",
};

export const FACTS: Record<string, string> = {
  craft: "Each lantern frame is hand-forged from steel, then finished with a wax or powder coat so it can live outdoors.",
  glass: "The glass is borosilicate, the same kind used in laboratory glassware, so it survives the heat of the flame.",
  candle: "A pillar candle burns for roughly 40 hours. Beeswax burns cleaner and longer than paraffin.",
  safety: "Always place a lantern on a flat, non-flammable surface and keep the flame away from anything that can burn.",
};

export const HOTSPOTS = [
  { id: "hs-flame", mesh: "flame", title: "The flame", body: "A single wick burning in a draught-free glass chamber gives a steady, warm light." },
  { id: "hs-glass", mesh: "glass", offset: [0.7, 0.2, 0] as [number, number, number], title: "Heat-proof glass", body: "Borosilicate glass resists thermal shock, so the lantern is safe with a real candle." },
  { id: "hs-cap", mesh: "cap", title: "Vented cap", body: "The conical cap sheds rain and lets the heat rise out through small gaps beneath it." },
];

export const SWATCHES: { name: string; color: string }[] = [
  { name: "Iron", color: "#3b3b44" },
  { name: "Gold", color: "#d4a017" },
  { name: "Copper", color: "#b87333" },
  { name: "Silver", color: "#c0c4cc" },
  { name: "Crimson", color: "#b91c1c" },
  { name: "Teal", color: "#0d9488" },
  { name: "Violet", color: "#7c3aed" },
  { name: "Bone", color: "#e8dcc2" },
];

export const CHIPS = [
  { label: "Frame gold", text: "Make the frame gold" },
  { label: "Glass red", text: "Make the glass red" },
  { label: "Flame glow blue", text: "Make the flame glow blue" },
  { label: "Show hook handle", text: "Show the hook handle" },
  { label: "Hide ring handle", text: "Hide the ring handle" },
  { label: "Cap copper", text: "Make the cap copper" },
  { label: "Matte frame", text: "Make the frame matte black" },
];
