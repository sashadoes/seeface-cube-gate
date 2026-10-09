// The audio engine: one AudioContext, a master bus with a gentle limiter (ear safety), buses for
// voices / sfx / ambience / music, automatic ducking of everything but voices while someone
// speaks, and synthesised sound effects that are all notes of ONE musical key, so moving makes
// melody. No audio files: nothing to download.

export type AudioEngine = {
  ctx: AudioContext;
  voices: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  music: GainNode;
  /** call on the first user gesture (mobile autoplay rules) */
  resume: () => Promise<void>;
  /** headphones = full HRTF + bass; speakers = softer panning, less bass */
  setOutput: (mode: "headphones" | "speakers") => void;
  output: () => "headphones" | "speakers";
  /** 0..1 how much voice is happening right now; ambience ducks under it */
  setVoiceActivity: (level: number) => void;
  /** noise buffer shared by the synths */
  noise: AudioBuffer;
  note: (degree: number, octave?: number) => number;
  sfx2: Sfx;
};

export type Sfx = {
  step: (surface: Surface, gain?: number, pan?: PannerNode | null) => void;
  jump: (double?: boolean) => void;
  land: (impact: number) => void;
  boop: () => void;
  pad: () => void;
  vent: () => void;
  whoosh: (secs: number) => void;
  bassHit: () => void;
  chime: () => void;
  logo: () => void;
  tick: () => void;
  staticBurst: (secs: number) => AudioScheduledSourceNode;
};

export type Surface = "stone" | "metal" | "carpet";

// D dorian-ish pentatonic: D F G A C (the world's key)
const SCALE = [0, 3, 5, 7, 10];
const ROOT = 146.83; // D3

let engine: AudioEngine | null = null;

export function getAudio(): AudioEngine {
  if (engine) return engine;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ latencyHint: "interactive" });
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // limiter on the master bus: nobody blasts your ears
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  // no harsh highs; speakers mode also trims the lows
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 14000;
  const lows = ctx.createBiquadFilter();
  lows.type = "lowshelf";
  lows.frequency.value = 120;
  lows.gain.value = 0;
  master.connect(lows).connect(tone).connect(limiter).connect(ctx.destination);

  const bus = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(master);
    return g;
  };
  const voices = bus(1);
  const duckable = ctx.createGain();
  duckable.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.55;
  sfx.connect(duckable);
  const ambience = ctx.createGain();
  ambience.gain.value = 0.5;
  ambience.connect(duckable);
  const music = ctx.createGain();
  music.gain.value = 0.5;
  music.connect(duckable);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  let output: "headphones" | "speakers" = (localStorage.getItem("sf1w.output") as "speakers") || "headphones";
  const applyOutput = () => (lows.gain.value = output === "speakers" ? -6 : 0);
  applyOutput();

  const note = (degree: number, octave = 0) => {
    const o = Math.floor(degree / SCALE.length) + octave;
    const d = ((degree % SCALE.length) + SCALE.length) % SCALE.length;
    return ROOT * Math.pow(2, o + SCALE[d] / 12);
  };

  const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const tone1 = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, dest: AudioNode = sfx) => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, 0.005, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const noiseHit = (freq: number, q: number, dur: number, peak: number, dest: AudioNode = sfx, type: BiquadFilterType = "bandpass") => {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 0.003, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  };

  let stepN = 0;
  const sfx2: Sfx = {
    step(surface, gain = 1, pan = null) {
      const dest: AudioNode = pan ?? sfx;
      if (pan) pan.connect(sfx);
      stepN++;
      if (surface === "metal") (noiseHit(2400, 4, 0.08, 0.18 * gain, dest), tone1("triangle", note(stepN % 2 ? 7 : 9, 1), note(7, 1), 0.06, 0.03 * gain, dest));
      else if (surface === "carpet") noiseHit(500, 0.8, 0.07, 0.12 * gain, dest, "lowpass");
      else (noiseHit(900, 1.2, 0.06, 0.2 * gain, dest), tone1("sine", 90, 50, 0.07, 0.12 * gain, dest));
    },
    jump(double) {
      tone1("triangle", note(double ? 7 : 4, 1), note(double ? 9 : 6, 1), 0.16, 0.12);
    },
    land(impact) {
      tone1("sine", 140, 38, 0.18 + impact * 0.2, 0.3 + impact * 0.4);
      noiseHit(300, 0.7, 0.12 + impact * 0.1, 0.2 + impact * 0.3, sfx, "lowpass");
    },
    boop() {
      tone1("sine", note(2, 1), note(0, 1), 0.18, 0.25);
    },
    pad() {
      // a springy boing: two notes of the key, sliding up
      tone1("sine", note(0, 0), note(5, 1), 0.35, 0.3);
      tone1("triangle", note(2, 1), note(7, 1), 0.3, 0.08);
    },
    vent() {
      noiseHit(700, 0.5, 0.8, 0.12, sfx, "lowpass");
    },
    whoosh(secs) {
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + secs);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + secs * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.1);
      s.connect(f).connect(g).connect(sfx);
      s.start(t);
      s.stop(t + secs + 0.2);
      // rising riser in the key (tension)
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(note(0, -1), t);
      o.frequency.exponentialRampToValueAtTime(note(0, 1), t + secs);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, t);
      lp.frequency.exponentialRampToValueAtTime(2400, t + secs);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.07, t + secs * 0.9);
      og.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.05);
      o.connect(lp).connect(og).connect(sfx);
      o.start(t);
      o.stop(t + secs + 0.1);
    },
    bassHit() {
      // the release: deep thump + bloom
      tone1("sine", 90, 32, 0.9, 0.9);
      tone1("triangle", note(0, 0), note(0, 0), 1.2, 0.08);
      tone1("sine", note(4, 1), note(4, 1), 1.4, 0.05);
    },
    chime() {
      [0, 2, 4].forEach((d, i) => setTimeout(() => tone1("sine", note(d, 2), note(d, 2), 0.6, 0.08), i * 70));
    },
    logo() {
      // the 3-note seeface1 signature
      [0, 4, 3].forEach((d, i) => setTimeout(() => tone1("triangle", note(d, 1), note(d, 1), 0.5, 0.12), i * 170));
    },
    tick() {
      noiseHit(3500, 6, 0.02, 0.15);
      tone1("square", 1800, 1200, 0.015, 0.03);
    },
    staticBurst(secs) {
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      s.connect(f).connect(g).connect(sfx);
      s.start(t);
      if (secs > 0) s.stop(t + secs);
      return s;
    },
  };

  let duck = 1;
  engine = {
    ctx,
    voices,
    sfx,
    ambience,
    music,
    noise,
    note,
    sfx2,
    resume: async () => {
      if (ctx.state !== "running") await ctx.resume().catch(() => {});
    },
    setOutput(m) {
      output = m;
      try {
        localStorage.setItem("sf1w.output", m);
      } catch {
        // private mode
      }
      applyOutput();
    },
    output: () => output,
    setVoiceActivity(level) {
      // voices always win: ambience and music dip by up to ~60% while people talk
      const target = 1 - Math.min(0.6, level * 0.8);
      duck += (target - duck) * 0.15;
      duckable.gain.setTargetAtTime(duck, ctx.currentTime, 0.08);
    },
  };
  return engine;
}
