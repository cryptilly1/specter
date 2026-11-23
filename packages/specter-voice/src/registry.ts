import { z } from "zod";
import { coreOpMeta } from "./ops";
import { resolveMeshName } from "./match";
import type { Spec, SpecContext, UndoFn } from "./types";

export interface OpDef<C = unknown> {
  name: string;
  schema: z.ZodType<any>;
  /** One-line JSON example, used in the LLM prompt. */
  doc: string;
  /** Human-readable description for the confirm step. */
  describe: (op: any) => string;
  /** Apply the op. May return an undo function. Must be idempotent. */
  apply?: (ctx: C, op: any) => UndoFn | void | Promise<UndoFn | void>;
}

export class SpecApplyError extends Error {
  constructor(
    message: string,
    public readonly opIndex: number,
  ) {
    super(message);
    this.name = "SpecApplyError";
  }
}

export type ParseSpecResult = { ok: true; spec: Spec } | { ok: false; errors: string[] };

const MAX_OPS = 12;

export class OpRegistry<C = unknown> {
  private defs = new Map<string, OpDef<C>>();
  private history: UndoFn[][] = [];

  constructor(opts: { includeCore?: boolean } = {}) {
    if (opts.includeCore !== false) {
      for (const m of coreOpMeta) this.defs.set(m.name, { name: m.name, schema: m.schema, doc: m.doc, describe: m.describe });
    }
  }

  /** Register (or replace) an op. Core op names get their apply function attached this way. */
  register(def: OpDef<C>): this {
    const existing = this.defs.get(def.name);
    this.defs.set(def.name, existing ? { ...existing, ...def } : def);
    return this;
  }

  /** Attach an apply function to an already-known op (keeps the shared schema). */
  bind(name: string, apply: NonNullable<OpDef<C>["apply"]>): this {
    const d = this.defs.get(name);
    if (!d) throw new Error(`Cannot bind unknown op "${name}"`);
    this.defs.set(name, { ...d, apply });
    return this;
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  names(): string[] {
    return [...this.defs.keys()];
  }

  docs(names?: string[]): string[] {
    return [...this.defs.values()].filter((d) => !names || names.includes(d.name)).map((d) => d.doc);
  }

  /**
   * Validate a raw value as a Spec. Unknown op types are rejected. When a context is given, mesh names are canonicalised
   * (aliases, fuzzy match) and unknown targets are rejected, so a model can only reference things that exist.
   */
  parseSpec(raw: unknown, sctx?: SpecContext): ParseSpecResult {
    const errors: string[] = [];
    if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["Spec must be an object"] };
    const r = raw as { version?: unknown; ops?: unknown };
    if (r.version !== undefined && r.version !== 1) return { ok: false, errors: [`Unsupported spec version ${String(r.version)}`] };
    if (!Array.isArray(r.ops)) return { ok: false, errors: ["Spec.ops must be an array"] };
    if (r.ops.length === 0) return { ok: false, errors: ["Spec has no ops"] };
    if (r.ops.length > MAX_OPS) return { ok: false, errors: [`Too many ops (max ${MAX_OPS})`] };

    const ops: Spec["ops"] = [];
    const knownHotspots = new Set(sctx?.hotspots.map((h) => h.id) ?? []);

    r.ops.forEach((rawOp, i) => {
      const label = `op ${i + 1}`;
      if (typeof rawOp !== "object" || rawOp === null || typeof (rawOp as { op?: unknown }).op !== "string") {
        errors.push(`${label}: missing "op" name`);
        return;
      }
      const name = (rawOp as { op: string }).op;
      const def = this.defs.get(name);
      if (!def) {
        errors.push(`${label}: unknown op "${name}"`);
        return;
      }
      const parsed = def.schema.safeParse(rawOp);
      if (!parsed.success) {
        errors.push(`${label} (${name}): ${parsed.error.issues.map((x) => x.message).join("; ")}`);
        return;
      }
      const op = { ...(parsed.data as Record<string, unknown>) } as { op: string; [k: string]: unknown };

      if (sctx) {
        // canonicalise mesh target
        if (typeof op.mesh === "string") {
          const m = resolveMeshName(op.mesh, sctx);
          if (!m.id) {
            errors.push(`${label} (${name}): unknown target "${op.mesh}"${m.suggestions.length ? `. Did you mean ${m.suggestions.slice(0, 3).join(", ")}?` : ""}`);
            return;
          }
          op.mesh = m.id;
        }
        if ((name === "updateHotspot" || name === "removeHotspot") && typeof op.id === "string" && !knownHotspots.has(op.id)) {
          errors.push(`${label} (${name}): unknown hotspot "${op.id}"`);
          return;
        }
        if (name === "setCamera" && typeof op.to === "string" && sctx.cameraPresets.length && !sctx.cameraPresets.includes(op.to)) {
          const hit = sctx.cameraPresets.find((p) => p.toLowerCase() === (op.to as string).toLowerCase());
          if (hit) op.to = hit;
          else {
            errors.push(`${label} (setCamera): unknown camera target "${op.to}". Options: ${sctx.cameraPresets.join(", ")}`);
            return;
          }
        }
        if (name === "loadPack" && typeof op.pack === "string" && !sctx.packs.includes(op.pack)) {
          const hit = sctx.packs.find((p) => p.toLowerCase() === (op.pack as string).toLowerCase());
          if (hit) op.pack = hit;
          else {
            errors.push(`${label} (loadPack): unknown pack "${op.pack}". Options: ${sctx.packs.join(", ")}`);
            return;
          }
        }
        if (name === "addHotspot" && typeof op.id === "string") knownHotspots.add(op.id);
      }
      ops.push(op);
    });

    if (errors.length) return { ok: false, errors };
    return { ok: true, spec: { version: 1, ops } };
  }

  /** Human-readable lines for the confirm step. */
  describe(spec: Spec): string[] {
    return spec.ops.map((op) => this.defs.get(op.op)?.describe(op) ?? `Unknown op ${op.op}`);
  }

  /**
   * Apply a validated spec atomically. If any op throws, ops already applied are rolled back in reverse order and a
   * SpecApplyError is thrown. A successful apply is pushed onto the undo history.
   */
  async apply(ctx: C, spec: Spec): Promise<void> {
    const undos: UndoFn[] = [];
    for (let i = 0; i < spec.ops.length; i++) {
      const op = spec.ops[i]!;
      const def = this.defs.get(op.op);
      if (!def || !def.apply) {
        await this.rollback(undos);
        throw new SpecApplyError(`Op "${op.op}" is not available in this app`, i);
      }
      try {
        const undo = await def.apply(ctx, op);
        if (typeof undo === "function") undos.push(undo);
      } catch (e) {
        await this.rollback(undos);
        throw new SpecApplyError(e instanceof Error ? e.message : String(e), i);
      }
    }
    this.history.push(undos);
  }

  get undoDepth(): number {
    return this.history.length;
  }

  /** Undo the most recent applied spec. Returns false when there is nothing to undo. */
  async undo(): Promise<boolean> {
    const last = this.history.pop();
    if (!last) return false;
    await this.rollback(last);
    return true;
  }

  clearHistory(): void {
    this.history = [];
  }

  private async rollback(undos: UndoFn[]): Promise<void> {
    for (let i = undos.length - 1; i >= 0; i--) {
      try {
        await undos[i]!();
      } catch {
        /* best effort: keep rolling back */
      }
    }
    undos.length = 0;
  }
}
