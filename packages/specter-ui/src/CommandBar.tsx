import { useEffect, useRef, useState } from "react";
import { createVoiceInput, isVoiceSupported, VOICE_LANGUAGES, type CommandController, type VoiceInput } from "specter-voice";
import { useCommandState } from "./hooks";

export interface Chip {
  label: string;
  text: string;
}

export interface CommandBarProps {
  controller: CommandController;
  chips?: Chip[];
  lang: string;
  onLangChange: (lang: string) => void;
  /** Skip the LLM for chips so they are instant and offline-safe. Default true. */
  chipsLocalOnly?: boolean;
  placeholder?: string;
  /** Called after a successful confirm so apps can refresh derived UI. */
  onApplied?: () => void;
}

/**
 * Voice or text command box with a confirm step, undo and one-click chips.
 * Flow: speak or type -> readable preview -> Apply or Cancel.
 */
export function CommandBar({ controller, chips = [], lang, onLangChange, chipsLocalOnly = true, placeholder, onApplied }: CommandBarProps) {
  const state = useCommandState(controller);
  const [text, setText] = useState("");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceRef = useRef<VoiceInput | null>(null);
  const supported = typeof window !== "undefined" && isVoiceSupported();
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!supported) return;
    voiceRef.current = createVoiceInput({
      lang,
      onInterim: (t) => setHeard(t),
      onFinal: (t) => {
        setHeard(t);
        setText(t);
        void controller.submit(t, { lang: langRef.current });
      },
      onState: (s) => setListening(s === "listening"),
      onError: (m) => setVoiceError(m),
    });
    return () => voiceRef.current?.stop();
    // recreate only when the controller changes; language is pushed through setLang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, supported]);

  useEffect(() => {
    voiceRef.current?.setLang(lang);
  }, [lang]);

  const submit = (t: string, local = false) => {
    const clean = t.trim();
    if (!clean) return;
    setVoiceError(null);
    setHeard("");
    void controller.submit(clean, { lang, localOnly: local });
  };

  const confirm = async () => {
    await controller.confirm();
    setText("");
    setHeard("");
    onApplied?.();
  };

  const busy = state.status === "thinking" || state.status === "applying";
  const pending = state.pending;

  return (
    <div className="sp-dock" data-testid="command-dock">
      <div className="sp-sr-only" role="status" aria-live="polite">
        {state.status === "thinking" ? "Interpreting your command" : pending ? `Preview ready: ${pending.lines.join(". ")}` : ""}
      </div>

      {pending && (
        <div className="sp-card sp-confirm" role="group" aria-label="Confirm changes" data-testid="confirm-card">
          {pending.source !== "chip" && pending.text && <div className="sp-heard">“{pending.text}”</div>}
          <h4>
            Apply these changes?
            <span className={`sp-badge ${pending.source === "llm" ? "" : "sp-local"}`}>{pending.source === "llm" ? "AI" : "Built-in parser"}</span>
          </h4>
          <ul>
            {pending.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {state.notice && <div className="sp-note">{state.notice}</div>}
          <div className="sp-row">
            <button className="sp-btn sp-primary" onClick={confirm} disabled={busy} data-testid="apply-btn" autoFocus>
              Apply
            </button>
            <button className="sp-btn" onClick={() => controller.cancel()} data-testid="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      )}

      {(state.errors.length > 0 || voiceError) && (
        <div className="sp-error" role="alert" data-testid="error-box">
          {[...state.errors, ...(voiceError ? [voiceError] : [])].map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="sp-card">
        {chips.length > 0 && (
          <div className="sp-chips" style={{ marginBottom: 10 }} aria-label="Try a command">
            {chips.map((c) => (
              <button key={c.label} className="sp-chip" onClick={() => submit(c.text, chipsLocalOnly)} disabled={busy} data-testid="chip">
                {c.label}
              </button>
            ))}
          </div>
        )}
        <form
          className="sp-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          {supported && (
            <button
              type="button"
              className="sp-btn sp-mic"
              data-listening={listening}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Speak a command"}
              title={listening ? "Stop listening" : "Speak a command"}
              onClick={() => {
                setVoiceError(null);
                if (listening) voiceRef.current?.stop();
                else voiceRef.current?.start();
              }}
              data-testid="mic-btn"
            >
              {listening ? "■" : "🎙"}
            </button>
          )}
          <input
            className="sp-input"
            value={listening && heard ? heard : text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? (listening ? "Listening…" : "Say or type: “paint the sofa blue”")}
            aria-label="Command"
            data-testid="command-input"
            autoComplete="off"
            spellCheck={false}
          />
          {supported && (
            <select className="sp-select" value={lang} onChange={(e) => onLangChange(e.target.value)} aria-label="Voice language" data-testid="lang-select">
              {VOICE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
          <button className="sp-btn sp-primary" type="submit" disabled={busy || !text.trim()} data-testid="send-btn">
            {state.status === "thinking" ? "Thinking…" : "Preview"}
          </button>
        </form>
        {!supported && <div className="sp-note" style={{ marginTop: 8 }}>Voice input works in Chrome. You can type commands here.</div>}
        {state.history.length > 0 && (
          <div className="sp-history" style={{ marginTop: 8 }}>
            <button className="sp-btn" onClick={() => void controller.undo()} disabled={!state.canUndo} data-testid="undo-btn">
              ↶ Undo
            </button>
            <span>Last: {state.history[state.history.length - 1]!.lines.join("; ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
