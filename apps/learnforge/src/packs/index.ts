import { cellPack } from "./cell";
import { dnaPack } from "./dna";
import { solarPack } from "./solar";
import type { Pack } from "./types";

export const PACKS: Pack[] = [cellPack, solarPack, dnaPack];
export const PACK_IDS = PACKS.map((p) => p.id);

export function getPack(id: string | null | undefined): Pack {
  return PACKS.find((p) => p.id === id) ?? cellPack;
}

export type { Pack } from "./types";
