import type { Part, Spec } from "specter-voice";

type Op = Spec["ops"][number];
type V3 = [number, number, number];

export interface Recipe {
  id: string;
  title: string;
  keywords: string[];
  blurb: string;
  /** Build the ops. `id` is the name of the top-level object; `place` carries position/on from the request. */
  build: (id: string, place: { position?: V3; on?: string }) => Op[];
}

const sphere = (name: string, radius: number, position: V3, color: string, extra: Partial<Part> = {}): Part => ({ name, shape: "sphere", dims: { radius }, position, color, ...extra });
const label = (name: string, text: string, position: V3, parent?: string): Part => ({ name, shape: "label", text, position, ...(parent ? { parent } : {}) });
const group = (name: string, position: V3 = [0, 0, 0], extra: Partial<Part> = {}): Part => ({ name, shape: "group", position, ...extra });

const obj = (id: string, parts: Part[], place: { position?: V3; on?: string }): Op => ({ op: "addObject", id, source: { type: "composite", parts }, ...place });
const hotspot = (mesh: string, title: string, body: string, offset?: V3): Op => ({ op: "addHotspot", id: `hs-${mesh}`, mesh, title, body, ...(offset ? { offset } : {}) });
const click = (target: string, title: string, body: string): Op => ({ op: "addInteraction", target, trigger: "click", action: { type: "showInfo", title, body } });

// ---------------------------------------------------------------------------

const solarEclipse: Recipe = {
  id: "solar-eclipse",
  title: "Solar eclipse",
  keywords: ["solar eclipse", "eclipse", "eclipse of the sun", "total eclipse"],
  blurb: "The Moon passes between the Sun and Earth and casts its shadow on Earth.",
  build: (id, place) => [
    { op: "setEnvironment", preset: "space" },
    obj(
      id,
      [
        sphere("sun", 2.2, [-9, 2.6, 0], "#ffb347", { emissive: "#ff8a1f", emissiveIntensity: 3 }),
        { name: "sunlight", shape: "pointLight", position: [-9, 2.6, 0], intensity: 900, color: "#fff0d6" },
        sphere("moon", 0.35, [-1.5, 2.6, 0], "#b9b9c0", { roughness: 0.9 }),
        sphere("earth", 1.1, [4, 2.6, 0], "#2f6fd6", { roughness: 0.7 }),
        sphere("earth_clouds", 1.13, [4, 2.6, 0], "#ffffff", { opacity: 0.18, roughness: 1 }),
        { name: "umbra", shape: "cone", dims: { radius: 0.35, height: 4.4 }, position: [0.7, 2.6, 0], rotation: [0, 0, -90], color: "#000000", opacity: 0.5 },
        { name: "penumbra", shape: "cone", dims: { radius: 1.5, height: 4.4 }, position: [0.7, 2.6, 0], rotation: [0, 0, 90], color: "#2a2347", opacity: 0.16 },
        { name: "shadow_on_earth", shape: "ring", dims: { inner: 0, outer: 0.28 }, position: [2.88, 2.6, 0], rotation: [0, 90, 0], color: "#000000", opacity: 0.75 },
        label("sun_label", "Sun", [-9, 5.4, 0]),
        label("moon_label", "Moon", [-1.5, 3.4, 0]),
        label("earth_label", "Earth", [4, 4.2, 0]),
        label("shadow_label", "Moon's shadow", [0.8, 1.5, 0]),
        label("scale_note", "Not to scale", [-2, 0.4, 0]),
      ],
      place,
    ),
    { op: "animate", target: "earth", motion: "spin", speed: 0.25 },
    { op: "animate", target: "earth_clouds", motion: "spin", speed: 0.35 },
    { op: "animate", target: "sun", motion: "pulse", speed: 0.4 },
    hotspot("sun", "The Sun", "Our star. It is about 400 times wider than the Moon, but also about 400 times farther away, so from Earth they look almost the same size."),
    hotspot("moon", "The Moon", "During a solar eclipse the new Moon passes exactly between the Sun and Earth and blocks the Sun's light."),
    hotspot("umbra", "Umbra", "The darkest part of the Moon's shadow. People inside it see a total eclipse, and the sky goes dark for a few minutes."),
    hotspot("earth", "Earth", "Only a narrow path on Earth falls inside the umbra. Around it, in the lighter penumbra, people see a partial eclipse."),
    click("moon", "Why eclipses are rare", "The Moon's orbit is tilted about 5 degrees to Earth's, so most new Moons pass just above or below the Sun. A total solar eclipse happens somewhere on Earth about every 18 months."),
  ],
};

const lunarPhases: Recipe = {
  id: "lunar-phases",
  title: "Phases of the Moon",
  keywords: ["phases of the moon", "moon phases", "lunar phases", "lunar cycle", "phases"],
  blurb: "Eight positions of the Moon around Earth. The sunlit half faces the Sun; how much of it we see sets the phase.",
  build: (id, place) => {
    const names = ["new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "third_quarter", "waning_crescent"];
    const titles = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Third quarter", "Waning crescent"];
    const r = 4;
    const moons: Part[] = names.flatMap((n, i) => {
      // the Sun is far to the left (-x); new moon sits between Earth and Sun
      const a = Math.PI + (i * Math.PI) / 4;
      const p: V3 = [Math.round(Math.cos(a) * r * 1000) / 1000, 1.6, Math.round(-Math.sin(a) * r * 1000) / 1000];
      return [sphere(n, 0.32, p, "#d8d8de", { roughness: 0.95 }), label(`${n}_label`, titles[i]!, [p[0], 2.3, p[2]])];
    });
    return [
      { op: "setEnvironment", preset: "space" },
      obj(
        id,
        [
          sphere("earth", 1.0, [0, 1.6, 0], "#2f6fd6", { roughness: 0.7 }),
          { name: "moon_orbit", shape: "torus", dims: { radius: r, tube: 0.015 }, position: [0, 1.6, 0], rotation: [90, 0, 0], color: "#8b7bd6", opacity: 0.6 },
          sphere("sun", 1.2, [-14, 1.6, 0], "#ffb347", { emissive: "#ff8a1f", emissiveIntensity: 3 }),
          { name: "sunlight", shape: "pointLight", position: [-14, 1.6, 0], intensity: 2500, color: "#fff4e0" },
          label("sun_label", "Sunlight comes from here", [-14, 3.4, 0]),
          ...moons,
        ],
        place,
      ),
      { op: "animate", target: "earth", motion: "spin", speed: 0.3 },
      hotspot("full_moon", "Full moon", "The Moon is on the far side of Earth from the Sun, so we see its whole sunlit half."),
      hotspot("new_moon", "New moon", "The Moon is between Earth and the Sun. Its sunlit side faces away from us, so it is almost invisible."),
      hotspot("first_quarter", "First quarter", "A week after new moon we see half of the sunlit side: a half-circle that grows each night."),
      click("earth", "One cycle", "The Moon takes about 29.5 days to go from one new moon to the next. Half of the Moon is always lit; only our view of that half changes."),
    ];
  },
};

const waterCycle: Recipe = {
  id: "water-cycle",
  title: "Water cycle",
  keywords: ["water cycle", "hydrological cycle", "rain cycle", "evaporation", "precipitation"],
  blurb: "Water evaporates from the sea, condenses into clouds, falls as rain and flows back.",
  build: (id, place) => {
    const arrows: Part[] = [0, 1, 2].flatMap((i) => [
      { name: `evaporation_shaft_${i + 1}`, shape: "cylinder", dims: { radius: 0.05, height: 1.4 }, position: [-4.2 + i * 0.9, 1.1, 0.6], color: "#9fd3ff", opacity: 0.8, parent: "evaporation" } as Part,
      { name: `evaporation_tip_${i + 1}`, shape: "cone", dims: { radius: 0.14, height: 0.3 }, position: [-4.2 + i * 0.9, 1.95, 0.6], color: "#9fd3ff", opacity: 0.8, parent: "evaporation" } as Part,
    ]);
    const rain: Part[] = Array.from({ length: 8 }, (_, i) => ({ name: `rain_${i + 1}`, shape: "cylinder", dims: { radius: 0.025, height: 0.45 }, position: [2.2 + (i % 4) * 0.35, 2.4 - Math.floor(i / 4) * 0.7, -0.2 + (i % 2) * 0.3], color: "#6fb6ff", opacity: 0.85, parent: "precipitation" }) as Part);
    const cloud = (name: string, x: number, parent: string): Part[] => [
      sphere(`${name}_a`, 0.55, [x, 3.6, 0], "#f2f5fb", { roughness: 1, parent }),
      sphere(`${name}_b`, 0.7, [x + 0.6, 3.75, 0.1], "#f2f5fb", { roughness: 1, parent }),
      sphere(`${name}_c`, 0.5, [x + 1.2, 3.55, -0.1], "#f2f5fb", { roughness: 1, parent }),
    ];
    return [
      { op: "setEnvironment", preset: "daylight" },
      obj(
        id,
        [
          { name: "ocean", shape: "box", dims: { width: 5, height: 0.3, depth: 4 }, position: [-3.5, 0.15, 0], color: "#1f6fbf", roughness: 0.15, metalness: 0.2, opacity: 0.92 },
          { name: "land", shape: "box", dims: { width: 6, height: 0.6, depth: 4 }, position: [2, 0.3, 0], color: "#5a8f3d", roughness: 0.9 },
          { name: "mountain", shape: "cone", dims: { radius: 1.6, height: 2.6 }, position: [3.4, 1.9, -0.6], color: "#7a6a58", roughness: 0.95 },
          { name: "snow_cap", shape: "cone", dims: { radius: 0.55, height: 0.9 }, position: [3.4, 2.75, -0.6], color: "#ffffff", roughness: 0.8 },
          { name: "river", shape: "box", dims: { width: 3.6, height: 0.05, depth: 0.35 }, position: [0.6, 0.62, 0.9], rotation: [0, 0, 6], color: "#3d8fe0", roughness: 0.2 },
          sphere("sun", 0.8, [-5.5, 5, -1], "#ffd166", { emissive: "#ffb347", emissiveIntensity: 2.5 }),
          group("evaporation"),
          ...arrows,
          group("condensation"),
          ...cloud("cloud_1", -1.5, "condensation"),
          ...cloud("cloud_2", 1.9, "condensation"),
          group("precipitation"),
          ...rain,
          label("evaporation_label", "1. Evaporation", [-3.3, 2.5, 0.6]),
          label("condensation_label", "2. Condensation", [0, 4.6, 0]),
          label("precipitation_label", "3. Precipitation", [3.6, 1.9, 1.2]),
          label("collection_label", "4. Collection", [-1.2, 0.9, 1.6]),
        ],
        place,
      ),
      { op: "animate", target: "condensation", motion: "bob", speed: 0.5 },
      { op: "animate", target: "sun", motion: "pulse", speed: 0.5 },
      hotspot("evaporation", "Evaporation", "The Sun heats the ocean and water turns into invisible water vapour that rises into the air."),
      hotspot("condensation", "Condensation", "High up the air is colder, so the vapour cools into tiny droplets that gather as clouds."),
      hotspot("precipitation", "Precipitation", "When the droplets grow heavy enough they fall as rain, snow or hail."),
      hotspot("river", "Collection", "Rain runs off the land into rivers and soaks into the ground, and eventually flows back to the sea to start again."),
    ];
  },
};

const atom: Recipe = {
  id: "atom",
  title: "Atom (carbon)",
  keywords: ["atom", "carbon atom", "bohr model", "atomic model", "electrons", "protons and neutrons"],
  blurb: "A simple Bohr model of carbon: 6 protons and 6 neutrons in the nucleus, 2 + 4 electrons in shells.",
  build: (id, place) => {
    const nucleus: Part[] = [];
    const pts: V3[] = [
      [0, 0, 0], [0.32, 0.1, 0.05], [-0.3, 0.12, -0.05], [0.05, 0.33, 0.1], [0.02, -0.3, 0.12], [0.12, 0.05, 0.33],
      [-0.1, -0.05, -0.32], [0.25, -0.22, -0.15], [-0.24, 0.26, 0.2], [-0.22, -0.22, 0.18], [0.22, 0.28, -0.2], [-0.05, 0.2, -0.3],
    ];
    pts.forEach((p, i) => nucleus.push(sphere(i % 2 === 0 ? `proton_${i / 2 + 1}` : `neutron_${(i + 1) / 2}`, 0.2, [p[0], p[1] + 2, p[2]], i % 2 === 0 ? "#e0525a" : "#9aa0ad", { parent: "nucleus", roughness: 0.4 })));
    const shell = (name: string, radius: number, tilt: V3, electrons: number): Part[] => [
      group(name, [0, 2, 0], { rotation: tilt }),
      { name: `${name}_ring`, shape: "torus", dims: { radius, tube: 0.012 }, rotation: [90, 0, 0], color: "#9db8ff", opacity: 0.7, parent: name },
      ...Array.from({ length: electrons }, (_, i) => {
        const a = (i / electrons) * Math.PI * 2;
        return sphere(`${name}_electron_${i + 1}`, 0.09, [Math.round(Math.cos(a) * radius * 1000) / 1000, 0, Math.round(Math.sin(a) * radius * 1000) / 1000], "#5ab0ff", { emissive: "#3b82f6", emissiveIntensity: 1.5, parent: name });
      }),
    ];
    return [
      obj(id, [group("nucleus"), ...nucleus, ...shell("inner_shell", 1.2, [15, 0, 0], 2), ...shell("outer_shell", 2.2, [-20, 0, 25], 4), label("atom_label", "Carbon atom (not to scale)", [0, 4.6, 0])], place),
      { op: "animate", target: "inner_shell", motion: "spin", speed: 2 },
      { op: "animate", target: "outer_shell", motion: "spin", speed: 1.2 },
      { op: "animate", target: "nucleus", motion: "pulse", speed: 0.6 },
      hotspot("nucleus", "Nucleus", "Carbon has 6 protons (red, positive) and usually 6 neutrons (grey, no charge). Almost all of the atom's mass is here."),
      hotspot("inner_shell", "Inner shell", "The first shell holds at most 2 electrons. Electrons are negative, so they balance the protons' charge."),
      hotspot("outer_shell", "Outer shell", "Carbon's outer shell has 4 electrons, so it can form 4 bonds. That is why carbon builds the long chains life is made of."),
    ];
  },
};

const volcano: Recipe = {
  id: "volcano",
  title: "Volcano",
  keywords: ["volcano", "volcanic eruption", "eruption", "magma"],
  blurb: "A see-through volcano with its magma chamber, vent, crater, lava and ash cloud.",
  build: (id, place) => [
    { op: "setEnvironment", preset: "sunset" },
    obj(
      id,
      [
        { name: "mountain", shape: "cone", dims: { radius: 3.2, height: 3.4 }, position: [0, 1.7, 0], color: "#6b5444", roughness: 0.95, opacity: 0.72 },
        sphere("magma_chamber", 0.9, [0, 0.7, 0], "#ff5a1f", { emissive: "#ff3d00", emissiveIntensity: 2.2, scale: [1.4, 0.7, 1.4] }),
        { name: "vent", shape: "cylinder", dims: { radius: 0.14, height: 2.4 }, position: [0, 2.1, 0], color: "#ff7a2e", emissive: "#ff4d00", emissiveIntensity: 2 },
        { name: "crater", shape: "cylinder", dims: { radius: 0.55, height: 0.12 }, position: [0, 3.36, 0], color: "#2a1a12", roughness: 1 },
        { name: "lava_flow", shape: "box", dims: { width: 0.35, height: 0.05, depth: 2.6 }, position: [0, 2.25, 1.15], rotation: [-46, 0, 0], color: "#ff6a1a", emissive: "#ff4d00", emissiveIntensity: 2.4 },
        group("ash_cloud", [0, 4.6, 0]),
        sphere("ash_1", 0.6, [0, 0, 0], "#55505a", { opacity: 0.8, roughness: 1, parent: "ash_cloud" }),
        sphere("ash_2", 0.75, [0.6, 0.5, 0.1], "#605a66", { opacity: 0.75, roughness: 1, parent: "ash_cloud" }),
        sphere("ash_3", 0.55, [-0.55, 0.45, -0.1], "#4a4550", { opacity: 0.8, roughness: 1, parent: "ash_cloud" }),
        { name: "glow", shape: "pointLight", position: [0, 3.6, 0], intensity: 60, color: "#ff7a2e" },
        label("volcano_label", "Volcano (cutaway)", [0, 6.4, 0]),
      ],
      place,
    ),
    { op: "animate", target: "ash_cloud", motion: "bob", speed: 0.6 },
    { op: "animate", target: "magma_chamber", motion: "pulse", speed: 0.8 },
    hotspot("magma_chamber", "Magma chamber", "A pool of molten rock several kilometres underground. Pressure builds as gas collects in the magma."),
    hotspot("vent", "Vent", "The pipe magma rises through on its way to the surface."),
    hotspot("crater", "Crater", "The bowl-shaped opening at the top where lava, gas and ash erupt."),
    hotspot("lava_flow", "Lava", "Magma that reaches the surface is called lava. It can be over 1,000 °C."),
    hotspot("ash_cloud", "Ash cloud", "Explosive eruptions blast rock into fine ash that can travel thousands of kilometres."),
  ],
};

const plantCell: Recipe = {
  id: "plant-cell",
  title: "Plant cell",
  keywords: ["plant cell", "plant cells", "chloroplast", "photosynthesis cell"],
  blurb: "A plant cell with its cell wall, large vacuole, nucleus, chloroplasts and mitochondria.",
  build: (id, place) => {
    const chloro: Part[] = Array.from({ length: 6 }, (_, i) => ({ name: `chloroplast_${i + 1}`, shape: "capsule", dims: { radius: 0.16, height: 0.62 }, position: [-1.4 + (i % 3) * 1.4, 0.55 + (i < 3 ? 0 : 1.4), i % 2 ? 0.75 : -0.75], rotation: [0, i * 40, 90], color: "#3fa34d", roughness: 0.5, parent: "chloroplasts" }) as Part);
    const mito: Part[] = Array.from({ length: 3 }, (_, i) => ({ name: `mitochondrion_${i + 1}`, shape: "capsule", dims: { radius: 0.1, height: 0.42 }, position: [1.5 - i * 0.4, 1.9 - i * 0.5, 0.85 - i * 0.6], rotation: [30, i * 50, 70], color: "#e2784f", roughness: 0.5, parent: "mitochondria" }) as Part);
    return [
      obj(
        id,
        [
          { name: "cell_wall", shape: "box", dims: { width: 4.6, height: 2.8, depth: 2.6 }, position: [0, 1.4, 0], color: "#6fbf4a", opacity: 0.22, roughness: 0.6 },
          { name: "cell_membrane", shape: "box", dims: { width: 4.4, height: 2.6, depth: 2.4 }, position: [0, 1.4, 0], color: "#c7f0a8", opacity: 0.12 },
          sphere("vacuole", 0.9, [0.1, 1.35, 0], "#8fd3ff", { opacity: 0.55, scale: [1.7, 1.0, 1.0], roughness: 0.2 }),
          sphere("nucleus", 0.42, [-1.55, 1.9, 0.4], "#7a63e0", { roughness: 0.4 }),
          sphere("nucleolus", 0.15, [-1.5, 1.95, 0.62], "#2b1a66"),
          group("chloroplasts"),
          ...chloro,
          group("mitochondria"),
          ...mito,
          label("plant_cell_label", "Plant cell", [0, 3.3, 0]),
        ],
        place,
      ),
      hotspot("cell_wall", "Cell wall", "A rigid layer of cellulose outside the membrane. It gives plant cells their fixed, box-like shape. Animal cells don't have one.", [2.4, 1.2, 0]),
      hotspot("vacuole", "Vacuole", "A large sac of cell sap. It pushes outwards to keep the cell firm; a wilting plant has vacuoles that lost water."),
      hotspot("chloroplasts", "Chloroplasts", "Where photosynthesis happens. Green chlorophyll captures light to turn carbon dioxide and water into sugar and oxygen."),
      hotspot("nucleus", "Nucleus", "Holds the cell's DNA and controls its activities."),
      hotspot("mitochondria", "Mitochondria", "Plants have them too: they release energy from the sugar made in the chloroplasts."),
    ];
  },
};

const house: Recipe = {
  id: "house",
  title: "Simple house",
  keywords: ["house", "simple house", "cottage", "home", "little house"],
  blurb: "A small house with a roof, door, windows and chimney.",
  build: (id, place) => [
    obj(
      id,
      [
        { name: "walls", shape: "box", dims: { width: 4, height: 2.5, depth: 3 }, position: [0, 1.25, 0], color: "#e8dcc2", roughness: 0.9 },
        { name: "roof", shape: "pyramid", dims: { radius: 3.05, height: 1.7 }, position: [0, 3.35, 0], rotation: [0, 45, 0], scale: [1, 1, 0.78], color: "#8a3b2e", roughness: 0.8 },
        { name: "door", shape: "box", dims: { width: 0.8, height: 1.5, depth: 0.08 }, position: [0, 0.75, 1.52], color: "#6b4226", roughness: 0.6 },
        { name: "door_knob", shape: "sphere", dims: { radius: 0.05 }, position: [0.28, 0.75, 1.58], color: "#d4a017", metalness: 0.9, roughness: 0.3 },
        { name: "window_left", shape: "box", dims: { width: 0.75, height: 0.7, depth: 0.06 }, position: [-1.25, 1.55, 1.52], color: "#bfe3ff", emissive: "#ffd27a", emissiveIntensity: 0.4, roughness: 0.1 },
        { name: "window_right", shape: "box", dims: { width: 0.75, height: 0.7, depth: 0.06 }, position: [1.25, 1.55, 1.52], color: "#bfe3ff", emissive: "#ffd27a", emissiveIntensity: 0.4, roughness: 0.1 },
        { name: "chimney", shape: "box", dims: { width: 0.45, height: 1.2, depth: 0.45 }, position: [1.1, 3.6, -0.4], color: "#7a4a3a", roughness: 0.9 },
        { name: "path", shape: "plane", dims: { width: 0.9, depth: 2.4 }, position: [0, 0.01, 2.7], color: "#b8a98f", roughness: 1 },
      ],
      place,
    ),
    hotspot("roof", "Roof", "A steep roof sheds rain and snow. Ask “paint the roof green” or “make the house bigger” to change it."),
    click("door", "Welcome", "Come in! Try “paint the walls blue”, “add a tree next to the house” or “make the chimney taller”."),
  ],
};

export const RECIPES: Recipe[] = [solarEclipse, lunarPhases, waterCycle, atom, volcano, plantCell, house];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id || r.id === id.replace(/_/g, "-"));
}

/** What the parser and the AI prompt need to know about recipes. */
export function recipeCatalogue(): { id: string; title: string; keywords: string[] }[] {
  return RECIPES.map((r) => ({ id: r.id, title: r.title, keywords: r.keywords }));
}
