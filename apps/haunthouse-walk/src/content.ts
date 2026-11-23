import type { Chip } from "specter-ui";

export const APP_ID = "haunthouse-walk";

export const HOTSPOTS: { id: string; mesh: string; title: string; body: string; offset?: [number, number, number] }[] = [
  { id: "hs-sofa", mesh: "sofa", offset: [0, 0.6, 0], title: "Sofa", body: "A three-seater with removable covers. It faces the television, with the coffee table in easy reach." },
  { id: "hs-clock", mesh: "grandfather_clock", title: "Grandfather clock", body: "An heirloom that comes with the apartment. It chimes on the hour, and never quite at the right hour." },
  { id: "hs-fridge", mesh: "fridge", title: "Fridge", body: "Full-height fridge freezer with plenty of room for a week of groceries." },
  { id: "hs-candles", mesh: "candelabra", offset: [0, 0.35, 0], title: "Candelabra", body: "Three candles that make the dining table glow. Best saved for dinner parties and dramatic entrances." },
  { id: "hs-portrait", mesh: "portrait", title: "Portrait", body: "A gilt-framed portrait of a previous owner. Visitors say its eyes follow them around the room." },
  { id: "hs-bed", mesh: "bed", offset: [0, 0.6, 0], title: "Bed", body: "A king-size bed with a carved headboard and room for a nightstand on each side." },
  { id: "hs-wardrobe", mesh: "wardrobe", title: "Wardrobe", body: "A floor-to-near-ceiling wardrobe with two doors and hanging space for a full wardrobe of clothes." },
];

export const ALIASES: Record<string, string> = {
  couch: "sofa",
  settee: "sofa",
  tv: "television",
  telly: "television",
  screen: "television",
  refrigerator: "fridge",
  freezer: "fridge",
  sink: "kitchen_sink",
  cooker: "stove",
  hob: "stove",
  oven: "stove",
  closet: "wardrobe",
  bookcase: "bookshelf",
  clock: "grandfather_clock",
  picture: "portrait",
  painting: "portrait",
  candles: "candelabra",
  wall: "walls",
  carpet: "rug_living",
  rug: "rug_living",
  "reading lamp": "desk_lamp",
  "bed lamp": "bedside_lamp",
  worktop: "kitchen_counter",
  counter: "kitchen_counter",
};

export const FACTS: Record<string, string> = {
  history: "This building dates from 1912. The apartment was converted from a single family house and still keeps its tall ceilings and original wood floors.",
  light: "Tall windows on the west and east sides bring in morning and evening light, and warm lamps in every room make the evenings cosy.",
  storage: "Built-in shelves, a full-height wardrobe and a deep kitchen counter keep the apartment tidy.",
  style: "A mix of warm wood, deep colours and antique details, with a touch of gothic charm.",
  ghosts: "No guaranteed ghosts, but the portrait in the study has a reputation.",
};

export const CHIPS: Chip[] = [
  { label: "Paint the sofa blue", text: "Paint the sofa blue" },
  { label: "Note on the sink", text: "Add a note on the kitchen sink saying check the drain" },
  { label: "Walls teal", text: "Paint the walls teal" },
  { label: "Bedside lamp glow red", text: "Make the bedside lamp glow red" },
  { label: "Hotspot on the bookshelf", text: "Add a hotspot on the bookshelf saying first editions only" },
  { label: "Go to the kitchen", text: "Go to the kitchen" },
  { label: "Hide the clock", text: "Hide the grandfather clock" },
];
