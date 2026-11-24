import { LICENSES, type AssetCandidate } from "./types";

const K = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

type Entry = AssetCandidate & { keywords: string[] };

function khronos(model: string, title: string, keywords: string[], license = LICENSES.cc0, note = "CC0"): Entry {
  return {
    provider: "catalogue",
    assetId: `khronos-${model.toLowerCase()}`,
    title,
    url: `${K}/${model}/glTF-Binary/${model}.glb`,
    license,
    credit: `${title} from the Khronos glTF Sample Assets (${note})`,
    sourceUrl: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${model}`,
    keywords,
  };
}

/**
 * Built-in catalogue: glTF sample models whose license was checked against each model's metadata.json.
 * It needs no key or search service, so common requests still work when every online library is down.
 */
export const CATALOGUE: Entry[] = [
  khronos("Avocado", "Avocado", ["avocado", "fruit", "food"]),
  khronos("Lantern", "Lantern", ["lantern", "street lamp", "lamp post"]),
  khronos("WaterBottle", "Water bottle", ["bottle", "water bottle", "flask"]),
  khronos("BoomBox", "Boom box", ["boombox", "boom box", "radio", "stereo"]),
  khronos("ToyCar", "Toy car", ["toy car", "car", "toy"]),
  khronos("SheenChair", "Armchair", ["chair", "armchair", "seat"]),
  khronos("Fox", "Fox", ["fox", "animal"], LICENSES.ccby, "model CC0 by PixelMannen, rig CC BY 4.0 by tomkranis"),
];

export function searchCatalogue(query: string): AssetCandidate[] {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (q.trim() === "") return [];
  // whole-word match only: "tree" must not match "street lamp"
  return CATALOGUE.filter((c) => c.keywords.some((k) => q.includes(` ${k} `) || q.includes(` ${k}s `))).map(({ keywords: _k, ...c }) => c);
}
