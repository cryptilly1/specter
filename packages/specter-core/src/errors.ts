/** Thrown when an op or hotspot names a mesh/camera/pack that does not exist. Never swallowed silently. */
export class TargetNotFoundError extends Error {
  constructor(
    public readonly target: string,
    public readonly kind: "mesh" | "hotspot" | "camera" | "pack" = "mesh",
  ) {
    super(`Could not find ${kind} "${target}" in this scene`);
    this.name = "TargetNotFoundError";
  }
}

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

export class ModelLoadError extends Error {
  /** True when the file simply does not exist (an optional GLB was not supplied). Callers fall back quietly. */
  notFound = false;
  constructor(
    public readonly url: string,
    cause?: unknown,
  ) {
    super(`Failed to load model ${url}${cause instanceof Error ? `: ${cause.message}` : ""}`);
    this.name = "ModelLoadError";
  }
}
