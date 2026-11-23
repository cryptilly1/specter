/** Context describing what a scene currently contains. Used to ground the LLM prompt and the local parser. */
export interface SpecContext {
  /** App id, e.g. "learnforge". */
  app: string;
  /** Names of meshes (or groups) that ops may target. */
  meshes: string[];
  /** Existing hotspots. */
  hotspots: { id: string; mesh?: string; title: string }[];
  /** Content pack ids that `loadPack` may switch to. */
  packs: string[];
  /** Camera presets / rooms that `setCamera` may target. */
  cameraPresets: string[];
  /** Friendly alias -> mesh id, e.g. "powerhouse" -> "mitochondria". */
  aliases?: Record<string, string>;
  /**
   * Optional topic -> short explanation. Lets the offline parser write a real hotspot body for
   * "add a hotspot on the nucleus about DNA" without an LLM.
   */
  facts?: Record<string, string>;
  /** Op names this app supports. When omitted, every registered op is allowed. */
  ops?: string[];
  /** Short plain description of the subject, e.g. "a 3D animal cell". Helps the LLM write accurate copy. */
  subject?: string;
}

export type UndoFn = () => void | Promise<void>;

export interface Spec {
  version: 1;
  ops: { op: string; [key: string]: unknown }[];
}

export type InterpretSource = "llm" | "local";

export interface InterpretResult {
  spec: Spec;
  source: InterpretSource;
  warnings: string[];
}
