/** Minimal Web Speech API typings so this package compiles without extra libs. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isVoiceSupported(): boolean {
  return getCtor() !== undefined;
}

export type VoiceState = "idle" | "listening";

export interface VoiceInputOptions {
  lang?: string;
  /** Interim (not final) transcript, for live display only. Never act on it. */
  onInterim?: (text: string) => void;
  /** A final transcript. Safe to send to the confirm step. */
  onFinal: (text: string) => void;
  onState?: (state: VoiceState) => void;
  onError?: (message: string) => void;
  /** Injected for tests. */
  ctor?: SpeechRecognitionCtor;
}

export interface VoiceInput {
  start(): void;
  stop(): void;
  setLang(lang: string): void;
  readonly listening: boolean;
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow it in the browser, or type your command instead.",
  "service-not-allowed": "Speech recognition is blocked in this browser. Type your command instead.",
  "no-speech": "I didn't hear anything. Try again.",
  "audio-capture": "No microphone was found. Type your command instead.",
  network: "Speech recognition needs a network connection. Type your command instead.",
  "language-not-supported": "That language is not supported for voice input here.",
};

/**
 * Push-to-talk voice input. Only final results are delivered through onFinal, so a command is never applied
 * from half-heard words.
 */
export function createVoiceInput(opts: VoiceInputOptions): VoiceInput | null {
  const Ctor = opts.ctor ?? getCtor();
  if (!Ctor) return null;
  let lang = opts.lang ?? "en-US";
  let listening = false;
  let rec: SpeechRecognitionLike | null = null;

  const setState = (s: VoiceState) => {
    listening = s === "listening";
    opts.onState?.(s);
  };

  return {
    get listening() {
      return listening;
    },
    setLang(l: string) {
      lang = l;
    },
    start() {
      if (listening) return;
      rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let delivered = false;
      rec.onstart = () => setState("listening");
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          const t = r[0]?.transcript ?? "";
          if (r.isFinal) {
            const text = t.trim();
            if (text && !delivered) {
              delivered = true;
              opts.onFinal(text);
            }
          } else {
            interim += t;
          }
        }
        if (interim) opts.onInterim?.(interim.trim());
      };
      rec.onerror = (e) => {
        opts.onError?.(ERROR_TEXT[e.error] ?? `Voice input error: ${e.error}`);
      };
      rec.onend = () => setState("idle");
      try {
        rec.start();
      } catch (err) {
        setState("idle");
        opts.onError?.(err instanceof Error ? err.message : "Could not start voice input.");
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

export const VOICE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文" },
];
