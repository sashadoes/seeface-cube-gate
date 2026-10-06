// Sound design, synthesised live with the Web Audio API (no files):
//   rain / drizzle hiss, wind (slow gusts), snow hush, thunder rumbles,
//   footsteps that change with the location, and the choir for the
//   "cubes are singing" event. Silent while the page is hidden.
import type { ZoneKind } from "./zones";
import type { WeatherKind } from "../marks/weather";

export type Sound = {
  resume: () => void;
  setWeather: (kind: WeatherKind, intensity: number, wind: number) => void;
  step: (zone: ZoneKind, running: boolean) => void;
  thunder: () => void;
  choir: (on: boolean) => void;
  chime: () => void;
  /** a MediaStream of everything the game plays (for recording trailers) */
  tap: () => MediaStream;
};

export function createSound(): Sound {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
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
    src.connect(f).connect(gain).connect(master);
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
  function step(zone: ZoneKind, running: boolean) {
    const now = ctx.currentTime;
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
    src.connect(f).connect(g).connect(master);
    src.start(now, Math.random() * 1.5, 0.2);
    // a low heel thump under it
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(zone === "neon" ? 180 : 90, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.08);
    og.gain.setValueAtTime(vol * 0.8, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    o.connect(og).connect(master);
    o.start(now);
    o.stop(now + 0.12);
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
    src.connect(f).connect(g).connect(master);
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
          o.connect(f).connect(g).connect(master);
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
      o.connect(g).connect(master);
      o.start(now + k * 0.08);
      o.stop(now + k * 0.08 + 1.3);
    });
  }

  return {
    resume: () => ctx.state !== "running" && ctx.resume(),
    setWeather(kind, intensity, windKmh) {
      const now = ctx.currentTime;
      const wet = kind === "rain" || kind === "storm" ? 0.1 + intensity * 0.14 : kind === "drizzle" ? 0.06 : 0;
      rain.gain.gain.setTargetAtTime(wet, now, 2);
      rainBody.gain.gain.setTargetAtTime(wet * 0.5, now, 2);
      snow.gain.gain.setTargetAtTime(kind === "snow" ? 0.03 + intensity * 0.03 : 0, now, 2);
      windLevel = Math.min(0.02 + windKmh / 400, 0.18);
    },
    step,
    thunder,
    choir,
    chime,
    tap() {
      const d = ctx.createMediaStreamDestination();
      master.connect(d);
      return d.stream;
    },
  };
}
