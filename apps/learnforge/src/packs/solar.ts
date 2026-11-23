import * as THREE from "three";
import { namedGroup, namedMesh, pbr, seededRandom } from "specter-core";
import type { Pack } from "./types";

interface PlanetDef {
  name: string;
  radius: number;
  orbit: number;
  color: string;
  period: number; // seconds for one orbit in the animation
  tilt?: number;
  ring?: { inner: number; outer: number; color: string };
  moon?: boolean;
}

// sizes and distances are compressed so everything fits on screen; colors are stylised
const PLANETS: PlanetDef[] = [
  { name: "mercury", radius: 0.26, orbit: 4.6, color: "#a9a39c", period: 22 },
  { name: "venus", radius: 0.5, orbit: 6.6, color: "#e6c38a", period: 34 },
  { name: "earth", radius: 0.56, orbit: 8.8, color: "#3d7be0", period: 46, moon: true },
  { name: "mars", radius: 0.36, orbit: 11, color: "#d2623f", period: 62 },
  { name: "jupiter", radius: 1.35, orbit: 15, color: "#d9a679", period: 100 },
  { name: "saturn", radius: 1.1, orbit: 19.5, color: "#e6d08f", period: 140, tilt: 0.45, ring: { inner: 1.5, outer: 2.5, color: "#cdb783" } },
  { name: "uranus", radius: 0.78, orbit: 23.5, color: "#8fd8e0", period: 190, tilt: 1.2 },
  { name: "neptune", radius: 0.75, orbit: 27, color: "#4a63e0", period: 240 },
];

function buildSolar(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = "solar_system";

  root.add(
    namedMesh("sun", new THREE.SphereGeometry(2.2, 64, 48), pbr("#ffb347", { roughness: 0.6, emissive: "#ff8a1f", emissiveIntensity: 1.6 }), [0, 0, 0], {
      castShadow: false,
      receiveShadow: false,
    }),
  );
  const sunLight = new THREE.PointLight(0xfff0d6, 900, 0, 2);
  sunLight.name = "sun_light";
  sunLight.userData.specterIgnore = true;
  root.add(sunLight);

  const rand = seededRandom(21);
  PLANETS.forEach((p, idx) => {
    const pivot = new THREE.Group();
    pivot.name = `${p.name}_orbit`;
    pivot.userData.specterIgnore = true;
    pivot.userData.period = p.period;
    pivot.rotation.y = rand() * Math.PI * 2;
    const planet = new THREE.Group();
    planet.name = p.name;
    planet.position.set(p.orbit, 0, 0);
    const body = namedMesh(`${p.name}_body`, new THREE.SphereGeometry(p.radius, 40, 32), pbr(p.color, { roughness: 0.75, metalness: 0 }), [0, 0, 0]);
    body.rotation.z = p.tilt ?? 0;
    planet.add(body);
    if (p.name === "earth") {
      planet.add(namedMesh("earth_clouds", new THREE.SphereGeometry(p.radius * 1.03, 32, 24), pbr("#ffffff", { roughness: 0.9, opacity: 0.18 }), [0, 0, 0], { castShadow: false }));
    }
    if (p.name === "jupiter") {
      for (let b = 0; b < 3; b++) {
        const band = namedMesh(`jupiter_band_${b}`, new THREE.TorusGeometry(p.radius * Math.cos(b * 0.35 - 0.3) * 1.002, 0.05, 6, 48), pbr("#b5835a", { roughness: 0.8 }), [0, (b - 1) * p.radius * 0.45, 0], {
          rotation: [Math.PI / 2, 0, 0],
          castShadow: false,
        });
        planet.add(band);
      }
    }
    if (p.ring) {
      const ring = namedMesh("saturn_rings", new THREE.RingGeometry(p.ring.inner, p.ring.outer, 96), pbr(p.ring.color, { roughness: 0.8, opacity: 0.85, side: THREE.DoubleSide }), [0, 0, 0], {
        rotation: [Math.PI / 2 + (p.tilt ?? 0), 0, 0],
        castShadow: false,
      });
      planet.add(ring);
    }
    if (p.moon) {
      const moonPivot = new THREE.Group();
      moonPivot.name = "moon_orbit";
      moonPivot.userData.specterIgnore = true;
      moonPivot.userData.moon = true;
      moonPivot.add(namedMesh("moon", new THREE.SphereGeometry(0.16, 24, 18), pbr("#c9c9cf", { roughness: 0.9 }), [1.1, 0, 0]));
      planet.add(moonPivot);
    }
    pivot.add(planet);
    root.add(pivot);

    // orbit line (not a voice target)
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit));
    }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8b7bd6, transparent: true, opacity: 0.28 }));
    line.name = `${p.name}_orbit_line`;
    line.userData.specterIgnore = true;
    root.add(line);
    void idx;
  });

  // asteroid belt: one instanced mesh, so 220 rocks cost a single draw call
  const rockCount = 220;
  const belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), pbr("#8d8478", { roughness: 0.95 }), rockCount);
  belt.name = "asteroid_belt";
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = 12.4 + rand() * 1.5;
    dummy.position.set(Math.cos(a) * r, (rand() - 0.5) * 0.25, Math.sin(a) * r);
    dummy.scale.setScalar(0.5 + rand() * 1.4);
    dummy.rotation.set(rand() * 3, rand() * 3, 0);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  belt.instanceMatrix.needsUpdate = true;
  belt.castShadow = false;
  root.add(belt);

  // stars
  const starPos: number[] = [];
  for (let i = 0; i < 900; i++) {
    const r = 60 + rand() * 40;
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    starPos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
  stars.name = "stars";
  stars.userData.specterIgnore = true;
  root.add(stars);

  return namedGroup("solar_system_root", [root]);
}

export const solarPack: Pack = {
  id: "solar-system",
  title: "Solar system",
  blurb: "Eight planets orbit the Sun. Sizes and distances are compressed so you can see them all at once.",
  subject: "a 3D model of the solar system with the Sun, eight planets, the Moon and the asteroid belt",
  build: buildSolar,
  lighting: "night",
  background: ["#0a0f2a", "#02030a"],
  hotspots: [
    { id: "hs-sun", mesh: "sun", offset: [0, 3.2, 0], title: "The Sun", body: "A star that holds 99.8% of the solar system's mass. Its core fuses hydrogen into helium and releases the light and heat that make life on Earth possible." },
    { id: "hs-mercury", mesh: "mercury", title: "Mercury", body: "The smallest planet and the closest to the Sun. It has almost no atmosphere, so days are scorching and nights are freezing." },
    { id: "hs-venus", mesh: "venus", title: "Venus", body: "Wrapped in thick carbon dioxide clouds, Venus is the hottest planet, hotter than Mercury, at around 465 °C." },
    { id: "hs-earth", mesh: "earth", title: "Earth", body: "The only known planet with liquid water on its surface and life. The Moon's gravity helps steady Earth's tilt and drives the tides." },
    { id: "hs-mars", mesh: "mars", title: "Mars", body: "A cold desert world whose red colour comes from iron oxide, or rust, in its soil. It has the tallest volcano in the solar system, Olympus Mons." },
    { id: "hs-asteroids", mesh: "asteroid_belt", offset: [0, 1.4, 0], title: "Asteroid belt", body: "A ring of rocky leftovers between Mars and Jupiter. Together they hold less mass than our Moon." },
    { id: "hs-jupiter", mesh: "jupiter", offset: [0, 1.8, 0], title: "Jupiter", body: "The largest planet, a gas giant more than twice as massive as all the other planets combined. Its Great Red Spot is a storm older than 150 years." },
    { id: "hs-saturn", mesh: "saturn", offset: [0, 2.0, 0], title: "Saturn", body: "Famous for its rings of ice and rock. Saturn is so light for its size that it would float in a big enough bathtub." },
    { id: "hs-uranus", mesh: "uranus", title: "Uranus", body: "An ice giant that spins on its side, tilted about 98 degrees, so its poles take turns facing the Sun for decades." },
    { id: "hs-neptune", mesh: "neptune", title: "Neptune", body: "The farthest planet. Neptune has the fastest winds in the solar system, over 2,000 km/h, and takes 165 Earth years to orbit once." },
  ],
  views: {
    overview: { position: [0, 30, 40], target: [0, 0, 0] },
    "inner-planets": { position: [0, 10, 17], target: [0, 0, 0] },
    "outer-planets": { position: [0, 22, 42], target: [10, 0, 0] },
    "top-down": { position: [0, 62, 0.1], target: [0, 0, 0] },
  },
  aliases: {
    star: "sun",
    moon: "earth",
    "our planet": "earth",
    "red planet": "mars",
    rings: "saturn",
    "asteroids": "asteroid_belt",
    belt: "asteroid_belt",
  },
  facts: {
    gravity: "Gravity is the force that pulls masses together. The Sun's gravity keeps every planet in orbit around it.",
    orbit: "An orbit is the curved path an object takes around a larger one, held in place by gravity.",
    "light years": "A light year is the distance light travels in one year, about 9.46 trillion kilometres.",
    water: "Liquid water is rare in the solar system. Earth has oceans, and Mars once had rivers and lakes.",
    life: "Earth is the only place we know that has life. Scientists search for it on Mars and on icy moons like Europa.",
    comets: "Comets are balls of ice and dust. When they near the Sun they grow glowing tails that always point away from it.",
  },
  chips: [
    { label: "Hotspot on Mars about water", text: "Add a hotspot on mars about water" },
    { label: "Saturn gold", text: "Paint saturn gold" },
    { label: "Hide the asteroids", text: "Hide the asteroid belt" },
    { label: "Inner planets", text: "Go to the inner planets" },
    { label: "Look from above", text: "Go to the top down view" },
    { label: "Show the cell", text: "Switch to the cell" },
  ],
  tick: (root, dt) => {
    root.traverse((o) => {
      if (o.userData.period) o.rotation.y += (dt * Math.PI * 2) / o.userData.period;
      if (o.userData.moon) o.rotation.y += dt * 1.4;
    });
  },
};
