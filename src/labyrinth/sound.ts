// Sound design, synthesised live with the Web Audio API (no files):
//   rain / drizzle hiss, wind (slow gusts), snow hush, thunder rumbles,
//   footsteps that change with the location, and the choir for the
//   "cubes are singing" event. Silent while the page is hidden.
import type { ZoneKind } from "./zones";
import type { WeatherKind } from "../marks/weather";

export type Sound = {
  resume: () => void;
  /** the shared audio context + a bus for gramophones/radio music (own volume slider) */
  ctx: AudioContext;
  musicBus: GainNode;
  effectsOut: GainNode;
  ambienceOut: GainNode;
  setWeather: (kind: WeatherKind, intensity: number, wind: number) => void;
  step: (zone: ZoneKind, running: boolean, wet?: number) => void;
  /** the flood siren: 0 = off, 1 = full wail */
  siren: (level: number) => void;
  /** a waterfall landing, d metres away */
  crash: (d: number) => void;
  thunder: () => void;
  choir: (on: boolean) => void;
  chime: () => void;
  /** the Pop Queen's music-box tune: 0 = off, 1 = she's right here */
  showtune: (level: number) => void;
  /** settings: 0–1 for everything, effects, ambience (weather) and voices (siren, songs) */
  setVolumes: (v: { master: number; effects: number; ambience: number; voices: number; records: number }) => void;
  /** a MediaStream of everything the game plays (for recording trailers) */
  tap: () => MediaStream;
};

export function createSound(): Sound {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // a gentle limiter at the very end: many sounds at once (a reward streak in the
  // rain next to a gramophone) never clip or crackle, they just sit a bit lower
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);
  // groups the player can turn up/down in the settings
  const bus = () => {
    const g = ctx.createGain();
    g.connect(master);
    return g;
  };
  const effectsBus = bus(), ambienceBus = bus(), voicesBus = bus(), musicBus = bus();
  document.addEventListener("visibilitychange", () => (document.hidden ? ctx.suspend() : ctx.resume()));

  // shared noise buffer
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  };

  // ---------------------------------------------------------- weather beds
  const bed = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const src = noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(ambienceBus);
    src.start();
    return { f, gain };
  };
  const rain = bed("highpass", 1400);
  const rainBody = bed("bandpass", 500, 0.5);
  const wind = bed("lowpass", 380, 2.5);
  const snow = bed("bandpass", 3000, 0.4);

  // wind gusts: slowly moving filter + level
  let windLevel = 0.02;
  setInterval(() => {
    const now = ctx.currentTime;
    wind.f.frequency.setTargetAtTime(250 + Math.random() * 500, now, 1.2);
    wind.gain.gain.setTargetAtTime(windLevel * (0.5 + Math.random()), now, 1.5);
  }, 1800);

  // ---------------------------------------------------------- one-shots
  function step(zone: ZoneKind, running: boolean, wet = 0) {
    const now = ctx.currentTime;
    if (wet > 0.05) splash(wet, running);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    // each location has its own floor sound
    const tone: Record<ZoneKind, [BiquadFilterType, number, number]> = {
      monogram: ["bandpass", 900, 1.2],
      pools: ["highpass", 2400, 0.8], // wet tiles
      red: ["lowpass", 500, 0.9], // carpet
      neon: ["bandpass", 2800, 6], // metal grating
      photo: ["lowpass", 700, 0.6], // moss
      white: ["bandpass", 1600, 0.8],
      ash: ["bandpass", 1200, 0.5], // crunch
      deep: ["lowpass", 420, 3], // muffled
    };
    const [type, freq, q] = tone[zone];
    f.type = type;
    f.frequency.value = freq * (0.9 + Math.random() * 0.2);
    f.Q.value = q;
    const vol = (running ? 0.28 : 0.18) * (zone === "photo" || zone === "red" ? 0.6 : 1);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (zone === "pools" ? 0.16 : 0.09));
    src.connect(f).connect(g).connect(effectsBus);
    src.start(now, Math.random() * 1.5, 0.2);
    // a low heel thump under it
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(zone === "neon" ? 180 : 90, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.08);
    og.gain.setValueAtTime(vol * 0.8, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    o.connect(og).connect(effectsBus);
    o.start(now);
    o.stop(now + 0.12);
  }

  // wet floor: a short splash and a small drip under each step
  function splash(wet: number, running: boolean) {
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2200 + Math.random() * 1600;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    const vol = (running ? 0.3 : 0.2) * Math.min(1, wet);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    src.connect(f).connect(g).connect(effectsBus);
    src.start(now, Math.random() * 1.5, 0.3);
    // the drip: a tiny falling "plip"
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(900 + Math.random() * 500, now + 0.04);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.12);
    og.gain.setValueAtTime(0, now + 0.04);
    og.gain.linearRampToValueAtTime(vol * 0.35, now + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(og).connect(effectsBus);
    o.start(now + 0.04);
    o.stop(now + 0.2);
  }

  // the flood siren: two detuned saws sweeping up and down, like an air-raid siren
  const sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  const sirenLp = ctx.createBiquadFilter();
  sirenLp.type = "lowpass";
  sirenLp.frequency.value = 2200;
  sirenLp.connect(sirenGain).connect(voicesBus);
  const sirenOsc = [0, 7].map((det) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 500;
    o.detune.value = det;
    o.connect(sirenLp);
    o.start();
    return o;
  });
  const sirenLfo = ctx.createOscillator();
  sirenLfo.frequency.value = 0.22;
  const sirenDepth = ctx.createGain();
  sirenDepth.gain.value = 330;
  sirenLfo.connect(sirenDepth);
  sirenOsc.forEach((o) => {
    o.frequency.value = 800;
    sirenDepth.connect(o.frequency);
  });
  sirenLfo.start();

  // a waterfall crashing down: a roar with a long wash after it
  function crash(d: number) {
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, 1.4 / (1 + d * 0.25)));
    const src = noise();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3000, now);
    f.frequency.exponentialRampToValueAtTime(500, now + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.7 * vol, now + 0.05);
    g.gain.setTargetAtTime(0.25 * vol, now + 0.3, 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    src.connect(f).connect(g).connect(effectsBus);
    src.start(now);
    src.stop(now + 3.5);
  }

  function thunder() {
    const now = ctx.currentTime;
    const src = noise();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, now);
    f.frequency.exponentialRampToValueAtTime(60, now + 3.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.9, now + 0.08 + Math.random() * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    src.connect(f).connect(g).connect(ambienceBus);
    src.start(now);
    src.stop(now + 4.6);
  }

  // the choir: a slow minor chord of soft voices
  let choirNodes: { o: OscillatorNode; g: GainNode }[] = [];
  function choir(on: boolean) {
    const now = ctx.currentTime;
    if (on && !choirNodes.length) {
      for (const freq of [146.8, 174.6, 220, 261.6, 293.7]) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = freq;
          o.detune.value = det;
          const f = ctx.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.018, now + 4);
          o.connect(f).connect(g).connect(voicesBus);
          o.start(now);
          choirNodes.push({ o, g });
        }
      }
    }
    if (!on && choirNodes.length) {
      for (const n of choirNodes) {
        n.g.gain.setTargetAtTime(0, now, 1.2);
        n.o.stop(now + 5);
      }
      choirNodes = [];
    }
  }

  function chime() {
    const now = ctx.currentTime;
    [880, 1320, 1760].forEach((f, k) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + k * 0.08);
      g.gain.linearRampToValueAtTime(0.12, now + k * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + k * 0.08 + 1.2);
      o.connect(g).connect(effectsBus);
      o.start(now + k * 0.08);
      o.stop(now + k * 0.08 + 1.3);
    });
  }

  // the Pop Queen's tune: a slightly detuned music box, minor and sweet
  const showGain = ctx.createGain();
  showGain.gain.value = 0;
  showGain.connect(voicesBus);
  const TUNE = [659.3, 784, 987.8, 784, 880, 698.5, 587.3, 698.5, 659.3, 523.3, 587.3, 493.9];
  let note = 0, showLevel = 0;
  setInterval(() => {
    if (showLevel <= 0.01) return;
    const now = ctx.currentTime;
    const f = TUNE[note++ % TUNE.length] * (1 + (Math.random() - 0.5) * 0.012); // a little out of tune
    for (const [mult, vol] of [[1, 0.2], [2, 0.06], [3.01, 0.03]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.connect(g).connect(showGain);
      o.start(now);
      o.stop(now + 1);
    }
  }, 260);

  return {
    resume: () => ctx.state !== "running" && ctx.resume(),
    ctx,
    musicBus,
    effectsOut: effectsBus,
    ambienceOut: ambienceBus,
    showtune(level) {
      showLevel = level;
      showGain.gain.setTargetAtTime(level * 0.9, ctx.currentTime, 0.3);
    },
    setWeather(kind, intensity, windKmh) {
      const now = ctx.currentTime;
      const wet = kind === "rain" || kind === "storm" ? 0.1 + intensity * 0.14 : kind === "drizzle" ? 0.06 : 0;
      rain.gain.gain.setTargetAtTime(wet, now, 2);
      rainBody.gain.gain.setTargetAtTime(wet * 0.5, now, 2);
      snow.gain.gain.setTargetAtTime(kind === "snow" ? 0.03 + intensity * 0.03 : 0, now, 2);
      windLevel = Math.min(0.02 + windKmh / 400, 0.18);
    },
    step,
    siren(level) {
      sirenGain.gain.setTargetAtTime(level * 0.09, ctx.currentTime, 0.4);
    },
    crash,
    thunder,
    choir,
    chime,
    setVolumes(v) {
      const now = ctx.currentTime;
      master.gain.setTargetAtTime(0.9 * v.master, now, 0.05);
      effectsBus.gain.setTargetAtTime(v.effects, now, 0.05);
      ambienceBus.gain.setTargetAtTime(v.ambience, now, 0.05);
      voicesBus.gain.setTargetAtTime(v.voices, now, 0.05);
      musicBus.gain.setTargetAtTime(v.records, now, 0.05);
    },
    tap() {
      const d = ctx.createMediaStreamDestination();
      limiter.connect(d);
      return d.stream;
    },
  };
}
