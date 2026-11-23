import { describe, expect, it } from "vitest";
import { createCommandController } from "specter-voice";
import { createTodoRegistry, parseTodoCommand, todoContext, type TodoApp } from "./todo";

function setup() {
  const app: TodoApp = { todos: [], nextId: 1 };
  const registry = createTodoRegistry();
  const c = createCommandController({ registry, ctx: app, getContext: () => todoContext(app), interpretOptions: { localParser: parseTodoCommand, localOnly: true } });
  const run = async (text: string) => {
    await c.submit(text);
    await c.confirm();
  };
  return { app, registry, c, run };
}

describe("voice-todo (specter-voice without 3D)", () => {
  it("adds, completes, removes and undoes by text", async () => {
    const { app, c, run } = setup();
    await run("add buy milk");
    await run("add walk the dog");
    expect(app.todos.map((t) => t.text)).toEqual(["buy milk", "walk the dog"]);
    await run("complete buy milk");
    expect(app.todos[0]!.done).toBe(true);
    await run("clear completed");
    expect(app.todos.map((t) => t.text)).toEqual(["walk the dog"]);
    await c.undo();
    expect(app.todos).toHaveLength(2);
    await run("remove walk the dog");
    expect(app.todos).toHaveLength(1);
  });

  it("fails loudly on unknown items and unknown ops, and has no 3D ops", async () => {
    const { app, registry, c } = setup();
    await c.submit("complete something that does not exist");
    await c.confirm();
    expect(c.getState().errors.length).toBeGreaterThan(0);
    expect(registry.has("setMaterial")).toBe(false);
    expect(registry.parseSpec({ ops: [{ op: "setMaterial", mesh: "x", color: "#fff" }] }).ok).toBe(false);
    expect(app.todos).toHaveLength(0);
  });

  it("rejects gibberish", () => {
    const { registry } = setup();
    expect(parseTodoCommand("flibber", todoContext({ todos: [], nextId: 1 }), registry).ok).toBe(false);
  });
});
