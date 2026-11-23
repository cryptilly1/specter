interface SynthLike {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): { lang: string; name: string; default?: boolean }[];
  speaking: boolean;
}
type UtteranceCtor = new (text: string) => { lang: string; rate: number; pitch: number; voice: unknown; onend: (() => void) | null; onerror: (() => void) | null };

export function isSpeechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export interface SpeakerOptions {
  lang?: string;
  rate?: number;
  /** Injected for tests. */
  synth?: SynthLike;
  Utterance?: UtteranceCtor;
}

export interface Speaker {
  speak(text: string, opts?: { lang?: string; onEnd?: () => void }): void;
  stop(): void;
  readonly speaking: boolean;
}

/** Read-aloud narration through speechSynthesis. A no-op speaker is returned where unsupported. */
export function createSpeaker(opts: SpeakerOptions = {}): Speaker {
  const synth = opts.synth ?? (isSpeechOutputSupported() ? (window.speechSynthesis as unknown as SynthLike) : undefined);
  const Utter = opts.Utterance ?? (typeof window !== "undefined" ? ((window as unknown as { SpeechSynthesisUtterance?: UtteranceCtor }).SpeechSynthesisUtterance as UtteranceCtor | undefined) : undefined);
  if (!synth || !Utter) {
    return { speak: () => undefined, stop: () => undefined, speaking: false };
  }
  return {
    get speaking() {
      return synth.speaking;
    },
    speak(text, o = {}) {
      synth.cancel();
      const clean = text.trim();
      if (!clean) return;
      const u = new Utter(clean);
      const lang = o.lang ?? opts.lang ?? "en-US";
      u.lang = lang;
      u.rate = opts.rate ?? 1;
      u.pitch = 1;
      const voices = synth.getVoices();
      const exact = voices.find((v) => v.lang === lang);
      const loose = voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      const v = exact ?? loose;
      if (v) u.voice = v;
      u.onend = () => o.onEnd?.();
      u.onerror = () => o.onEnd?.();
      synth.speak(u);
    },
    stop() {
      synth.cancel();
    },
  };
}
