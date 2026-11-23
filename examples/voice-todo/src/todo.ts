import { z } from "zod";
import { matchTarget, OpRegistry, type ParseOutcome, type SpecContext } from "specter-voice";

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoApp {
  todos: Todo[];
  nextId: number;
}

const text = z.string().trim().min(1).max(120);

export const addTodoSchema = z.object({ op: z.literal("addTodo"), text });
export const completeTodoSchema = z.object({ op: z.literal("completeTodo"), item: text });
export const removeTodoSchema = z.object({ op: z.literal("removeTodo"), item: text });
export const clearDoneSchema = z.object({ op: z.literal("clearDone") });

function find(app: TodoApp, name: string): Todo {
  const ids = app.todos.map((t) => t.text);
  const m = matchTarget(name, ids);
  const hit = m.id ? app.todos.find((t) => t.text === m.id) : undefined;
  if (!hit) throw new Error(`No to-do matches "${name}"`);
  return hit;
}

/** Only the ops this app needs. No 3D ops are registered, so a model can't ask for them. */
export function createTodoRegistry(): OpRegistry<TodoApp> {
  const reg = new OpRegistry<TodoApp>({ includeCore: false });
  reg.register({
    name: "addTodo",
    schema: addTodoSchema,
    doc: '{"op":"addTodo","text":"<what to do>"}',
    describe: (o) => `Add “${o.text}”`,
    apply: (app, o) => {
      const t: Todo = { id: app.nextId++, text: o.text, done: false };
      app.todos.push(t);
      return () => {
        app.todos = app.todos.filter((x) => x.id !== t.id);
      };
    },
  });
  reg.register({
    name: "completeTodo",
    schema: completeTodoSchema,
    doc: '{"op":"completeTodo","item":"<existing to-do text>"}',
    describe: (o) => `Complete “${o.item}”`,
    apply: (app, o) => {
      const t = find(app, o.item);
      const prev = t.done;
      t.done = true;
      return () => {
        t.done = prev;
      };
    },
  });
  reg.register({
    name: "removeTodo",
    schema: removeTodoSchema,
    doc: '{"op":"removeTodo","item":"<existing to-do text>"}',
    describe: (o) => `Remove “${o.item}”`,
    apply: (app, o) => {
      const t = find(app, o.item);
      const index = app.todos.indexOf(t);
      app.todos.splice(index, 1);
      return () => {
        app.todos.splice(index, 0, t);
      };
    },
  });
  reg.register({
    name: "clearDone",
    schema: clearDoneSchema,
    doc: '{"op":"clearDone"}',
    describe: () => "Clear completed to-dos",
    apply: (app) => {
      const removed = app.todos.filter((t) => t.done);
      app.todos = app.todos.filter((t) => !t.done);
      return () => {
        app.todos.push(...removed);
        app.todos.sort((a, b) => a.id - b.id);
      };
    },
  });
  return reg;
}

export function todoContext(app: TodoApp): SpecContext {
  return { app: "voice-todo", subject: "a to-do list", meshes: app.todos.map((t) => t.text), hotspots: [], packs: [], cameraPresets: [] };
}

/** Offline parser for the to-do vocabulary. Same shape as the 3D parser, so it plugs into interpret(). */
export function parseTodoCommand(input: string, _ctx: SpecContext, registry: OpRegistry<any>): ParseOutcome {
  const t = input.trim().replace(/[.!?]+$/, "");
  const ops: { op: string; [k: string]: unknown }[] = [];
  let m: RegExpMatchArray | null;
  if (/^(clear|remove|delete)\s+(all\s+)?(the\s+)?(completed|done|finished)(\s+(items|tasks|to-?dos))?$/i.test(t)) ops.push({ op: "clearDone" });
  else if ((m = t.match(/^(?:complete|finish|check off|tick off|mark)\s+(?:the\s+)?(.+?)(?:\s+as\s+done|\s+done)?$/i))) ops.push({ op: "completeTodo", item: m[1] });
  else if ((m = t.match(/^(?:remove|delete)\s+(?:the\s+)?(.+)$/i))) ops.push({ op: "removeTodo", item: m[1] });
  else if ((m = t.match(/^(?:add|create|new|remind me to)\s+(?:a\s+|an\s+)?(?:to-?do|task|item)?\s*(?:to\s+)?(.+?)(?:\s+to my list)?$/i))) ops.push({ op: "addTodo", text: m[1] });
  if (!ops.length) return { ok: false, errors: [`I didn't understand “${input}”. Try “add buy milk” or “complete buy milk”.`], warnings: [] };
  const parsed = registry.parseSpec({ version: 1, ops });
  if (!parsed.ok) return { ok: false, errors: parsed.errors, warnings: [] };
  return { ok: true, spec: parsed.spec, errors: [], warnings: [] };
}
