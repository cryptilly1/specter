// Kiro PreToolUse hook: blocks file writes that contain what looks like an API key.
// Reads the hook event JSON on stdin. Exit 2 blocks the tool call and shows stderr to the agent.
import { readFileSync } from "node:fs";

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}
const PATTERNS = [
  [/gsk_[A-Za-z0-9]{20,}/, "Groq API key"],
  [/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}/, "OpenAI or Anthropic API key"],
  [/(?:GROQ|OPENAI|ANTHROPIC)_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{16,}/, "API key assignment"],
];
for (const [re, name] of PATTERNS) {
  if (re.test(raw)) {
    console.error(`Blocked: this write contains what looks like a ${name}. Keys belong in environment variables (see .env.example), never in source files.`);
    process.exit(2);
  }
}
process.exit(0);
