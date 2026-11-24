import { interpret, type InterpretOptions } from "./interpret";
import type { OpRegistry } from "./registry";
import type { InterpretSource, Spec, SpecContext } from "./types";

export interface ChoiceOption {
  label: string;
  detail?: string;
  thumbnail?: string;
  /** The op to use if this option is picked. */
  op: Spec["ops"][number];
}

/** Alternatives for one op, e.g. other library models that matched "lantern". */
export interface Choice {
  opIndex: number;
  prompt: string;
  options: ChoiceOption[];
  selected: number;
}

export interface ResolveResult {
  spec: Spec;
  choices?: Choice[];
  /** Shown to the user, e.g. "Generating a model with Meshy…". */
  notices?: string[];
  errors?: string[];
}

export interface PendingCommand {
  text: string;
  spec: Spec;
  lines: string[];
  source: InterpretSource | "chip";
  warnings: string[];
  choices?: Choice[];
}

export interface HistoryItem {
  id: number;
  text: string;
  lines: string[];
  source: PendingCommand["source"];
  at: number;
}

export type CommandStatus = "idle" | "thinking" | "resolving" | "confirming" | "applying";

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
  /**
   * Optional step between interpreting and confirming: expand recipes, find library models, start generation jobs.
   * Its output is validated again before it is shown, so a resolver can never smuggle in an unchecked op.
   */
  resolve?: (spec: Spec, text: string) => Promise<ResolveResult>;
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

  /** Run the resolver (if any) and re-validate. Returns null and sets errors when nothing usable is left. */
  async function runResolve(spec: Spec, text: string): Promise<{ spec: Spec; choices?: Choice[]; notices: string[] } | null> {
    if (!options.resolve) return { spec, notices: [] };
    set({ status: "resolving" });
    let res: ResolveResult;
    try {
      res = await options.resolve(spec, text);
    } catch (e) {
      set({ status: "idle", errors: [e instanceof Error ? e.message : "Could not prepare that change."] });
      return null;
    }
    const notices = res.notices ?? [];
    if (!res.spec.ops.length) {
      set({ status: "idle", errors: res.errors ?? [], notice: notices[0] ?? null });
      return null;
    }
    const checked = options.registry.parseSpec(res.spec, options.getContext());
    if (!checked.ok) {
      set({ status: "idle", errors: [...(res.errors ?? []), ...checked.errors], notice: notices[0] ?? null });
      return null;
    }
    return { spec: checked.spec, choices: res.choices, notices: [...(res.errors ?? []), ...notices] };
  }

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
    const resolved = await runResolve(outcome.spec, text);
    if (!resolved) return;
    const warnings = [...outcome.warnings, ...resolved.notices];
    set({
      status: "confirming",
      pending: { text, spec: resolved.spec, lines: options.registry.describe(resolved.spec), source: outcome.source, warnings, choices: resolved.choices },
      notice: warnings[0] ?? null,
    });
  }

  /** Submit a prebuilt spec (demo chips, share links). Optionally apply without a confirm step. */
  async function submitSpec(spec: Spec, text: string, o: { autoApply?: boolean } = {}): Promise<void> {
    const parsed = options.registry.parseSpec(spec, options.getContext());
    if (!parsed.ok) {
      set({ status: "idle", errors: parsed.errors });
      return;
    }
    const resolved = await runResolve(parsed.spec, text);
    if (!resolved) return;
    set({
      status: "confirming",
      errors: [],
      notice: resolved.notices[0] ?? null,
      pending: { text, spec: resolved.spec, lines: options.registry.describe(resolved.spec), source: "chip", warnings: resolved.notices, choices: resolved.choices },
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

  /** Pick another option for one op (for example a different library model). */
  function choose(opIndex: number, optionIndex: number): void {
    const p = state.pending;
    if (!p?.choices) return;
    const choice = p.choices.find((c) => c.opIndex === opIndex);
    const option = choice?.options[optionIndex];
    if (!choice || !option) return;
    const ops = p.spec.ops.slice();
    ops[opIndex] = option.op;
    const checked = options.registry.parseSpec({ version: 1, ops }, options.getContext());
    if (!checked.ok) {
      set({ errors: checked.errors });
      return;
    }
    const choices = p.choices.map((c) => (c.opIndex === opIndex ? { ...c, selected: optionIndex } : c));
    set({ pending: { ...p, spec: checked.spec, lines: options.registry.describe(checked.spec), choices }, errors: [] });
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
    let ready = parsed.spec;
    if (options.resolve) {
      try {
        const r = await options.resolve(parsed.spec, "");
        const again = options.registry.parseSpec(r.spec, options.getContext());
        if (!again.ok) return { ok: false, errors: again.errors };
        ready = again.spec;
      } catch (e) {
        return { ok: false, errors: [e instanceof Error ? e.message : "Could not prepare the shared scene"] };
      }
    }
    try {
      await options.registry.apply(options.ctx, ready);
      const id = nextId++;
      batches.push({ id, ops: ready.ops });
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
    choose,
    confirm,
    cancel,
    undo,
    applyQuietly,
    /** All ops applied so far (for share links). */
    getApplied: applied,
  };
}

export type CommandController = ReturnType<typeof createCommandController>;
