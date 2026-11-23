import { parseColorPhrase } from "./colors";
import { matchTarget, normalize, resolveMeshName } from "./match";
import { OpRegistry } from "./registry";
import type { Spec, SpecContext } from "./types";

export interface ParseOutcome {
  ok: boolean;
  spec?: Spec;
  /** One entry per clause that could not be understood. */
  errors: string[];
  /** Non-fatal notes, for example "Matched 'sofa' to 'Sofa_Main'". */
  warnings: string[];
}

type Op = { op: string; [k: string]: unknown };

const DEFAULT_REGISTRY = new OpRegistry();

/** Split a compound command into clauses ("paint the sofa blue and add a note on the sink saying ..."). */
export function splitClauses(text: string): string[] {
  const verbs = "add|paint|colou?r|make|hide|show|remove|delete|go|jump|load|switch|turn|change|put|create|set|dye|tint|fly|take|look|zoom|update|edit";
  const cleaned = text.replace(/\s+/g, " ").trim();
  const re = new RegExp(`\\s*(?:;|\\.\\s+|\\s+and then\\s+|\\s+then\\s+|\\s+also\\s+|\\s+and\\s+(?=(?:${verbs})\\b))`, "i");
  return cleaned
    .split(re)
    .map((s) => s.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean);
}

export function humanize(id: string): string {
  const s = normalize(id);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : cap + ".";
}

function slug(s: string, max = 24): string {
  return normalize(s).replace(/ /g, "-").slice(0, max).replace(/-+$/, "");
}

const STRIP_ROOM = /\s+(?:room|view|area|stop|section|angle|preset|scene)$/i;

function stripLead(s: string): string {
  return s.replace(/^(?:the|a|an|my)\s+/i, "").trim();
}

function facts(ctx: SpecContext, topic: string): string | undefined {
  if (!ctx.facts) return undefined;
  const key = normalize(topic);
  for (const [k, v] of Object.entries(ctx.facts)) if (normalize(k) === key) return v;
  return undefined;
}

interface ClauseResult {
  ops: Op[];
  error?: string;
  warning?: string;
}

function needMesh(raw: string, ctx: SpecContext): { id?: string; error?: string; warning?: string } {
  const name = stripLead(raw);
  const r = resolveMeshName(name, ctx);
  if (r.id) {
    const warning = normalize(r.id) !== normalize(name) ? `Matched "${name}" to "${r.id}"` : undefined;
    return { id: r.id, warning };
  }
  const hint = r.suggestions.length ? ` Try: ${r.suggestions.slice(0, 4).join(", ")}.` : "";
  return { error: `I couldn't find "${name}" in this scene.${hint}` };
}

function parseHotspotAdd(clause: string, ctx: SpecContext): ClauseResult | null {
  const lead = "(?:please\\s+)?(?:add|create|put|place|drop|make|attach)\\s+(?:a\\s+|an\\s+|new\\s+)*(?:hotspot|hot spot|marker|label|info point|info pin|pin)";
  // "... on the nucleus about DNA"
  let m = clause.match(new RegExp(`^${lead}\\s+(?:on|to|at|for|over|in)\\s+(?:the\\s+)?(.+?)\\s+(about|saying|that says|with (?:the )?text|explaining|describing|that explains|that describes)\\s+(.+)$`, "i"));
  let target: string | undefined;
  let topic: string | undefined;
  let viaAbout = false;
  if (m) {
    target = m[1];
    topic = m[3];
    viaAbout = /^(about|explaining|describing|that explains|that describes)$/i.test(m[2]!);
  } else {
    // "... about DNA on the nucleus"
    m = clause.match(new RegExp(`^${lead}\\s+(?:about|saying|explaining)\\s+(.+?)\\s+(?:on|to|at|over)\\s+(?:the\\s+)?(.+)$`, "i"));
    if (m) {
      topic = m[1];
      target = m[2];
      viaAbout = true;
    }
  }
  if (!m) {
    const bare = clause.match(new RegExp(`^${lead}\\s+(?:on|to|at|for|over|in)\\s+(?:the\\s+)?(.+)$`, "i"));
    if (bare) {
      const t = needMesh(bare[1]!, ctx);
      if (t.error) return { ops: [], error: t.error };
      return { ops: [], error: `What should the hotspot on ${humanize(t.id!)} say? Try "add a hotspot on ${t.id} about ...".` };
    }
    return null;
  }
  const t = needMesh(target!, ctx);
  if (t.error) return { ops: [], error: t.error };
  const topicClean = topic!.trim();
  const words = topicClean.split(/\s+/);
  const meshLabel = humanize(t.id!);
  let title: string;
  let body: string;
  const known = facts(ctx, topicClean);
  if (known) {
    title = topicClean.length <= 4 ? topicClean.toUpperCase() : humanize(topicClean);
    body = sentence(known);
  } else if (viaAbout && words.length <= 4) {
    title = /^[A-Z0-9]{2,}$/.test(topicClean) ? topicClean : humanize(topicClean);
    body = `${title} at the ${meshLabel.toLowerCase()}.`;
  } else {
    title = meshLabel;
    body = sentence(topicClean);
  }
  return {
    ops: [{ op: "addHotspot", id: `hs-${slug(t.id!, 20)}-${slug(topicClean, 16)}`, mesh: t.id, title, body }],
    warning: t.warning,
  };
}

function parseNote(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(
    /^(?:add|put|leave|attach|write|make|create)\s+(?:a\s+|an\s+)?note\s+(?:on|to|at|for|about|near)\s+(?:the\s+)?(.+?)\s*(?:,?\s*saying|,?\s*that says|,?\s*says|,?\s*reading|,?\s*with text|:|-)\s*(.+)$/i,
  );
  if (!m) {
    if (/^(?:add|put|leave|attach|write|make|create)\s+(?:a\s+|an\s+)?note\b/i.test(clause)) {
      return { ops: [], error: `A note needs a target and text. Try "add a note on the sofa saying ...".` };
    }
    return null;
  }
  const t = needMesh(m[1]!, ctx);
  if (t.error) return { ops: [], error: t.error };
  const text = sentence(m[2]!);
  return { ops: [{ op: "addNote", id: `note-${slug(t.id!, 20)}-${slug(m[2]!, 16)}`, mesh: t.id, text }], warning: t.warning };
}

function parseHotspotRemove(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(/^(?:remove|delete|clear|get rid of)\s+(?:the\s+)?(?:hotspots?|markers?|labels?|pins?)\s+(?:on|from|at|for|over)\s+(?:the\s+)?(.+)$/i);
  if (!m) return null;
  const t = needMesh(m[1]!, ctx);
  if (t.error) return { ops: [], error: t.error };
  const ids = ctx.hotspots.filter((h) => h.mesh === t.id).map((h) => h.id);
  if (!ids.length) return { ops: [], error: `There is no hotspot on ${humanize(t.id!)} to remove.` };
  return { ops: ids.map((id) => ({ op: "removeHotspot", id })), warning: t.warning };
}

function parseHotspotUpdate(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(
    /^(?:change|update|edit|rewrite|replace)\s+(?:the\s+)?(?:hotspots?|labels?|markers?)\s+(?:on|for|at|over)\s+(?:the\s+)?(.+?)\s+(?:to say|to read|saying|to explain|to|about)\s+(.+)$/i,
  );
  if (!m) return null;
  const t = needMesh(m[1]!, ctx);
  if (t.error) return { ops: [], error: t.error };
  const hs = ctx.hotspots.filter((h) => h.mesh === t.id);
  if (!hs.length) return { ops: [], error: `There is no hotspot on ${humanize(t.id!)} to change.` };
  return { ops: [{ op: "updateHotspot", id: hs[0]!.id, body: sentence(m[2]!) }], warning: t.warning };
}

function parseNavigation(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(
    /^(?:please\s+)?(go to|go|jump to|take me to|fly to|move to|show me|look at|focus on|zoom to|zoom in on|zoom on|load|open|switch to|change to|explore)\s+(?:the\s+)?(.+)$/i,
  );
  if (!m) return null;
  const verb = m[1]!.toLowerCase();
  let rest = stripLead(m[2]!).replace(STRIP_ROOM, "").replace(/\s+(?:pack|subject|lesson|model|topic)$/i, "");
  rest = rest.trim();
  const camera = () => {
    if (!ctx.cameraPresets.length) return null;
    const r = matchTarget(rest, ctx.cameraPresets);
    return r.id;
  };
  const pack = () => {
    if (!ctx.packs.length) return null;
    return matchTarget(rest, ctx.packs).id;
  };
  const wantsPack = /^(load|open|switch to|change to|explore)$/.test(verb);
  const order = wantsPack ? [pack, camera] : [camera, pack];
  for (const fn of order) {
    const id = fn();
    if (id) {
      return fn === pack ? { ops: [{ op: "loadPack", pack: id }] } : { ops: [{ op: "setCamera", to: id }] };
    }
  }
  if (/^(?:go|go to|show me|look at|focus on|zoom|fly|jump|take|move)/.test(verb) || wantsPack) {
    const opts = [...ctx.cameraPresets, ...ctx.packs];
    return { ops: [], error: `I don't know "${rest}".${opts.length ? ` Options: ${opts.join(", ")}.` : ""}` };
  }
  return null;
}

function parseVisibility(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(/^(?:please\s+)?(hide|show|reveal|unhide|remove|delete|make invisible|turn off|turn on)\s+(?:the\s+)?(.+)$/i);
  if (!m) return null;
  const verb = m[1]!.toLowerCase();
  const visible = ["show", "reveal", "unhide", "turn on"].includes(verb);
  const t = needMesh(m[2]!, ctx);
  if (t.error) return { ops: [], error: t.error };
  return { ops: [{ op: "setVisibility", mesh: t.id, visible }], warning: t.warning };
}

function parseMaterial(clause: string, ctx: SpecContext): ClauseResult | null {
  const m = clause.match(/^(?:please\s+)?(?:paint|colou?r|dye|tint|recolou?r|turn|make|change|set|give)\s+(?:the\s+)?(.+)$/i);
  if (!m) return null;
  // "make the body matte black and the wheels gold"
  if (/\s+and\s+/i.test(m[1]!)) {
    const segs = m[1]!.split(/\s+and\s+(?:the\s+)?/i);
    if (segs.length > 1) {
      const all: Op[] = [];
      const warns: string[] = [];
      let allOk = true;
      for (const seg of segs) {
        const r = parseMaterial(`make the ${seg}`, ctx);
        if (!r || r.error || !r.ops.length) {
          allOk = false;
          break;
        }
        all.push(...r.ops);
        if (r.warning) warns.push(r.warning);
      }
      if (allOk) return { ops: all, warning: warns.join("; ") || undefined };
    }
  }
  const words = m[1]!.trim().split(/\s+/);
  if (words.length < 2) return null;
  // try the longest colour phrase first so "body matte black" -> mesh "body", "matte black"
  for (let k = Math.min(4, words.length - 1); k >= 1; k--) {
    const meshPart = words.slice(0, words.length - k).join(" ").replace(/\s+(?:to|into|with|be|is|in)$/i, "");
    const colorPart = words.slice(words.length - k).join(" ");
    const patch = parseColorPhrase(colorPart);
    if (!patch) continue;
    const t = needMesh(meshPart, ctx);
    if (t.error) {
      // keep looking: a shorter colour phrase may give a mesh that resolves
      if (k === 1) return { ops: [], error: t.error };
      continue;
    }
    return { ops: [{ op: "setMaterial", mesh: t.id, ...patch }], warning: t.warning };
  }
  if (/^(?:paint|colou?r|dye|tint|recolou?r)\b/i.test(clause)) {
    return { ops: [], error: `I couldn't tell which colour you want. Try "paint the sofa blue".` };
  }
  return null;
}

/**
 * Deterministic, offline command parser. Understands hotspots, notes, material changes, visibility, camera moves
 * and pack switching. Anything it does not understand is reported per clause. It never guesses at unknown targets.
 */
export function parseCommand(text: string, ctx: SpecContext, registry: OpRegistry<any> = DEFAULT_REGISTRY): ParseOutcome {
  const ops: Op[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const clauses = splitClauses(text);
  if (!clauses.length) return { ok: false, errors: ["Say or type a command, for example: paint the sofa blue."], warnings };

  const parsers = [parseHotspotAdd, parseHotspotRemove, parseHotspotUpdate, parseNote, parseNavigation, parseVisibility, parseMaterial];
  for (const clause of clauses) {
    let res: ClauseResult | null = null;
    for (const p of parsers) {
      res = p(clause, ctx);
      if (res) break;
    }
    if (!res) {
      errors.push(`I didn't understand "${clause}". Try: "paint the sofa blue", "add a hotspot on the nucleus about DNA", "add a note on the sink saying ...".`);
      continue;
    }
    if (res.error) errors.push(res.error);
    if (res.warning) warnings.push(res.warning);
    ops.push(...res.ops);
  }

  if (!ops.length) return { ok: false, errors, warnings };
  const validated = registry.parseSpec({ version: 1, ops }, ctx);
  if (!validated.ok) return { ok: false, errors: [...errors, ...validated.errors], warnings };
  return { ok: errors.length === 0, spec: validated.spec, errors, warnings };
}
