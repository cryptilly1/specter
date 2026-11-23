import { createCommandController, createVoiceInput, isVoiceSupported } from "specter-voice";
import { createTodoRegistry, parseTodoCommand, todoContext, type TodoApp } from "./todo";

const app: TodoApp = { todos: [], nextId: 1 };
const registry = createTodoRegistry();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $("list");
const input = $<HTMLInputElement>("input");
const preview = $("preview");
const lines = $("lines");
const err = $("err");
const undoBtn = $<HTMLButtonElement>("undo");

const controller = createCommandController({
  registry,
  ctx: app,
  getContext: () => todoContext(app),
  // /api/spec is optional here. Without it the local to-do parser answers.
  interpretOptions: { localParser: parseTodoCommand, localOnly: true },
  onChange: () => render(),
});

function render(): void {
  const s = controller.getState();
  list.replaceChildren(
    ...app.todos.map((t) => {
      const li = document.createElement("li");
      li.className = t.done ? "done" : "";
      const span = document.createElement("span");
      span.textContent = (t.done ? "✓ " : "• ") + t.text;
      li.append(span);
      return li;
    }),
  );
  preview.hidden = !s.pending;
  lines.replaceChildren(
    ...(s.pending?.lines ?? []).map((l) => {
      const li = document.createElement("li");
      li.textContent = l;
      return li;
    }),
  );
  err.hidden = s.errors.length === 0;
  err.textContent = s.errors.join(" ");
  undoBtn.disabled = !s.canUndo;
}

controller.subscribe(render);
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  void controller.submit(input.value);
});
$("apply").addEventListener("click", async () => {
  await controller.confirm();
  input.value = "";
  render();
});
$("cancel").addEventListener("click", () => controller.cancel());
undoBtn.addEventListener("click", () => void controller.undo());

if (isVoiceSupported()) {
  const mic = $("mic");
  mic.hidden = false;
  const voice = createVoiceInput({
    onFinal: (t) => {
      input.value = t;
      void controller.submit(t);
    },
    onError: (m) => {
      err.hidden = false;
      err.textContent = m;
    },
  });
  mic.addEventListener("click", () => (voice?.listening ? voice.stop() : voice?.start()));
}

render();
