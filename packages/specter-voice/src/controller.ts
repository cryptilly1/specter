import { interpret, type InterpretOptions } from "./interpret";
import type { OpRegistry } from "./registry";
import type { InterpretSource, Spec, SpecContext } from "./types";

export interface PendingCommand {
  text: string;
  spec: Spec;
  lines: string[];
  source: InterpretSource | "chip";
  warnings: string[];
}

export interface HistoryItem {
  id: number;
  text: string;
  lines: string[];
  source: PendingCommand["source"];
  at: number;
}

export type CommandStatus = "idle" | "thinking" | "confirming" | "applying";

export interface CommandState {
  status: CommandStatus;
  pending: PendingCommand | null;
  errors: string[];
  notice: string | null;
  history: HistoryItem[];
  canUndo: boolean;
}

export interface CommandControllerOptions<C> {
  registry: OpRegistry<C>;
  /** The app's apply context (for example the Specter scene). */
  ctx: C;
  getContext: () => SpecContext;
  interpretOptions?: InterpretOptions;
  /** Called after a spec is applied or undone. */
  onChange?: (applied: Spec) => void;
}

/**
 * Framework-agnostic command flow: submit -> (interpret) -> confirm -> apply -> undo.
 * UI layers (React, web components) subscribe and render `getState()`.
 */
export function createCommandController<C>(options: CommandControllerOptions<C>) {
  let nextId = 1;
  let state: CommandState = { status: "idle", pending: null, errors: [], notice: null, history: [], canUndo: false };
  const listeners = new Set<() => void>();
  const batches: { id: number; ops: Spec["ops"] }[] = [];

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<CommandState>) => {
    state = { ...state, ...patch, canUndo: batches.length > 0 };
    emit();
  };
  const applied = (): Spec => ({ version: 1, ops: batches.flatMap((b) => b.ops) });

  async function submit(text: string, o: { lang?: string; localOnly?: boolean } = {}): Promise<void> {
    set({ status: "thinking", errors: [], notice: null, pending: null });
    const outcome = await interpret(text, options.getContext(), {
      ...options.interpretOptions,
      lang: o.lang ?? options.interpretOptions?.lang,
      localOnly: o.localOnly ?? options.interpretOptions?.localOnly,
      registry: options.registry,
    });
    if (!outcome.ok) {
      set({ status: "idle", errors: outcome.errors, notice: outcome.warnings[0] ?? null });
      return;
    }
    set({
      status: "confirming",
      pending: { text, spec: outcome.spec, lines: options.registry.describe(outcome.spec), source: outcome.source, warnings: outcome.warnings },
      notice: outcome.warnings[0] ?? null,
    });
  }

  /** Submit a prebuilt spec (demo chips, share links). Optionally apply without a confirm step. */
  async function submitSpec(spec: Spec, text: string, o: { autoApply?: boolean } = {}): Promise<void> {
    const parsed = options.registry.parseSpec(spec, options.getContext());
    if (!parsed.ok) {
      set({ status: "idle", errors: parsed.errors });
      return;
    }
    set({
      status: "confirming",
      errors: [],
      notice: null,
      pending: { text, spec: parsed.spec, lines: options.registry.describe(parsed.spec), source: "chip", warnings: [] },
    });
    if (o.autoApply) await confirm();
  }

  async function confirm(): Promise<void> {
    const pending = state.pending;
    if (!pending || state.status === "applying") return;
    set({ status: "applying" });
    try {
      await options.registry.apply(options.ctx, pending.spec);
      const id = nextId++;
      batches.push({ id, ops: pending.spec.ops });
      set({
        status: "idle",
        pending: null,
        errors: [],
        notice: null,
        history: [...state.history, { id, text: pending.text, lines: pending.lines, source: pending.source, at: Date.now() }],
      });
      options.onChange?.(applied());
    } catch (e) {
      set({ status: "idle", pending: null, errors: [e instanceof Error ? e.message : "Could not apply that change."] });
    }
  }

  function cancel(): void {
    set({ status: "idle", pending: null, errors: [], notice: null });
  }

  async function undo(): Promise<void> {
    const ok = await options.registry.undo();
    if (!ok) return;
    const last = batches.pop();
    set({ history: state.history.filter((h) => h.id !== last?.id), notice: "Undone", errors: [] });
    options.onChange?.(applied());
  }

  /** Apply a spec silently (share links on load). Not added to the undo list shown to the user. */
  async function applyQuietly(spec: Spec): Promise<{ ok: boolean; errors: string[] }> {
    const parsed = options.registry.parseSpec(spec, options.getContext());
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    try {
      await options.registry.apply(options.ctx, parsed.spec);
      const id = nextId++;
      batches.push({ id, ops: parsed.spec.ops });
      set({});
      options.onChange?.(applied());
      return { ok: true, errors: [] };
    } catch (e) {
      return { ok: false, errors: [e instanceof Error ? e.message : "Could not apply"] };
    }
  }

  /** Forget applied ops and undo history, for example after the whole scene was replaced (pack switch). */
  function reset(): void {
    batches.length = 0;
    options.registry.clearHistory();
    set({ history: [], pending: null, errors: [], notice: null });
  }

  return {
    reset,
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    submit,
    submitSpec,
    confirm,
    cancel,
    undo,
    applyQuietly,
    /** All ops applied so far (for share links). */
    getApplied: applied,
  };
}

export type CommandController = ReturnType<typeof createCommandController>;
