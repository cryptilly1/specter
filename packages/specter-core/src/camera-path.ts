import * as THREE from "three";
import { InvalidPathError } from "./errors";

export interface Keyframe {
  /** Optional id, used by "jump to room" and room cards. */
  id?: string;
  /** Label for UI. */
  label?: string;
  /** Time in seconds from the start of the path. Must be strictly increasing. */
  t: number;
  /** Seconds to rest when playback reaches this keyframe (room cards need reading time). */
  hold?: number;
  position: [number, number, number];
  target: [number, number, number];
}

/** Throws InvalidPathError unless the path has at least 2 frames with strictly increasing, finite times. */
export function validatePath(keyframes: Keyframe[]): void {
  if (!Array.isArray(keyframes) || keyframes.length < 2) throw new InvalidPathError("A camera path needs at least 2 keyframes");
  const ids = new Set<string>();
  for (let i = 0; i < keyframes.length; i++) {
    const k = keyframes[i]!;
    if (![k.t, ...k.position, ...k.target].every((n) => Number.isFinite(n))) throw new InvalidPathError(`Keyframe ${i} has a non-finite number`);
    if (i > 0 && !(k.t > keyframes[i - 1]!.t)) throw new InvalidPathError(`Keyframe ${i} time ${k.t} is not after ${keyframes[i - 1]!.t}`);
    if (k.id) {
      if (ids.has(k.id)) throw new InvalidPathError(`Duplicate keyframe id "${k.id}"`);
      ids.add(k.id);
    }
  }
}

/** Samples a path at time t. CatmullRom through positions and look-at targets, time-faithful per segment. */
export class CameraPath {
  readonly duration: number;
  private posCurve: THREE.CatmullRomCurve3;
  private tgtCurve: THREE.CatmullRomCurve3;

  constructor(public readonly keyframes: Keyframe[]) {
    validatePath(keyframes);
    this.posCurve = new THREE.CatmullRomCurve3(keyframes.map((k) => new THREE.Vector3(...k.position)), false, "centripetal");
    this.tgtCurve = new THREE.CatmullRomCurve3(keyframes.map((k) => new THREE.Vector3(...k.target)), false, "centripetal");
    this.duration = keyframes[keyframes.length - 1]!.t;
  }

  get startTime(): number {
    return this.keyframes[0]!.t;
  }

  /** Map a time to the curve parameter u in [0,1] (equal spacing per keyframe index). */
  private param(t: number): number {
    const ks = this.keyframes;
    const n = ks.length;
    if (t <= ks[0]!.t) return 0;
    if (t >= ks[n - 1]!.t) return 1;
    let i = 0;
    while (i < n - 2 && t > ks[i + 1]!.t) i++;
    const a = ks[i]!.t;
    const b = ks[i + 1]!.t;
    const s = (t - a) / (b - a);
    // ease inside each segment so the camera settles at each room
    const eased = s * s * (3 - 2 * s);
    return (i + eased) / (n - 1);
  }

  sample(t: number, outPos = new THREE.Vector3(), outTarget = new THREE.Vector3()) {
    const u = this.param(t);
    this.posCurve.getPoint(u, outPos);
    this.tgtCurve.getPoint(u, outTarget);
    return { position: outPos, target: outTarget };
  }

  indexAt(t: number): number {
    let idx = 0;
    for (let i = 0; i < this.keyframes.length; i++) if (t + 1e-6 >= this.keyframes[i]!.t) idx = i;
    return idx;
  }

  timeOf(idOrIndex: string | number): number | null {
    if (typeof idOrIndex === "number") return this.keyframes[idOrIndex]?.t ?? null;
    return this.keyframes.find((k) => k.id === idOrIndex)?.t ?? null;
  }
}

export interface PathPlayerHost {
  camera: THREE.PerspectiveCamera;
  controlsTarget: THREE.Vector3;
  setControlsEnabled(enabled: boolean): void;
}

export interface PathPlayerEvents {
  /** Fired when the camera reaches or passes a keyframe (index changes). */
  onKeyframe?: (index: number, frame: Keyframe) => void;
  onTime?: (t: number, duration: number) => void;
  onEnd?: () => void;
  onPlayState?: (playing: boolean) => void;
}

export class PathPlayer {
  private time: number;
  private playing = false;
  private lastIndex = -1;
  private speed = 1;
  /** When set, playback stops on arrival (jump to a room). */
  private stopAt: number | null = null;
  private jump: { from: number; to: number; elapsed: number; dur: number } | null = null;
  private holdLeft = 0;

  constructor(
    readonly path: CameraPath,
    private host: PathPlayerHost,
    private events: PathPlayerEvents = {},
    private loop = false,
  ) {
    this.time = path.startTime;
    this.applyAt(this.time);
  }

  get currentTime(): number {
    return this.time;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
  get currentIndex(): number {
    return this.path.indexAt(this.time);
  }

  setSpeed(s: number): void {
    this.speed = Math.max(0.1, Math.min(4, s));
  }

  play(): void {
    if (this.time >= this.path.duration - 1e-6) this.time = this.path.startTime;
    this.stopAt = null;
    this.jump = null;
    this.holdLeft = 0;
    this.setPlaying(true);
  }

  pause(): void {
    this.jump = null;
    this.holdLeft = 0;
    this.setPlaying(false);
  }

  /** Scrub to an exact time and pause. */
  seek(t: number): void {
    this.jump = null;
    this.holdLeft = 0;
    this.time = Math.max(this.path.startTime, Math.min(this.path.duration, t));
    this.setPlaying(false);
    this.applyAt(this.time);
  }

  /** Glide to a keyframe by id or index and stop there. Playback speed does not matter. */
  jumpTo(idOrIndex: string | number, seconds = 1.6): boolean {
    const t = this.path.timeOf(idOrIndex);
    if (t === null) return false;
    this.stopAt = t;
    this.jump = { from: this.time, to: t, elapsed: 0, dur: Math.max(0.2, seconds) };
    this.setPlaying(true);
    return true;
  }

  update(dt: number): void {
    if (!this.playing) return;
    if (this.jump) {
      const j = this.jump;
      j.elapsed += dt;
      const s = Math.min(1, j.elapsed / j.dur);
      const eased = s * s * (3 - 2 * s);
      this.time = j.from + (j.to - j.from) * eased;
      this.applyAt(this.time);
      if (s >= 1) {
        this.time = j.to;
        this.jump = null;
        this.stopAt = null;
        this.setPlaying(false);
        this.applyAt(this.time);
      }
      return;
    }
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      return;
    }
    const before = this.path.indexAt(this.time);
    this.time += dt * this.speed;
    const after = this.path.indexAt(this.time);
    const reached = this.path.keyframes[after];
    if (after > before && reached?.hold && this.time < this.path.duration) {
      // arrived at a room: stop on the keyframe exactly and rest
      this.time = reached.t;
      this.holdLeft = reached.hold;
      this.applyAt(this.time);
      return;
    }
    if (this.time >= this.path.duration) {
      if (this.loop) this.time = this.path.startTime;
      else {
        this.time = this.path.duration;
        this.applyAt(this.time);
        this.setPlaying(false);
        this.events.onEnd?.();
        return;
      }
    }
    this.applyAt(this.time);
  }

  private applyAt(t: number): void {
    const { position, target } = this.path.sample(t);
    this.host.camera.position.copy(position);
    this.host.controlsTarget.copy(target);
    this.host.camera.lookAt(target);
    const idx = this.path.indexAt(t);
    if (idx !== this.lastIndex) {
      this.lastIndex = idx;
      this.events.onKeyframe?.(idx, this.path.keyframes[idx]!);
    }
    this.events.onTime?.(t, this.path.duration);
  }

  private setPlaying(p: boolean): void {
    if (this.playing === p) return;
    this.playing = p;
    this.host.setControlsEnabled(!p);
    this.events.onPlayState?.(p);
  }

  dispose(): void {
    this.playing = false;
    this.host.setControlsEnabled(true);
  }
}
