// Records for the gramophones and the radio: original music made from notes in
// the browser (no audio files, no copyright worries), plus effects.
// Everyone who hears the same record starts it from the same moment (t0), so
// players standing together hear it in step.
export type RecordId = "waltz" | "elevator" | "lullaby" | "encore" | "stomp";
export type FxId = "warm" | "slowed" | "underwater" | "cathedral" | "broken";

export const RECORDS: Record<RecordId, { name: string }> = {
  waltz: { name: "waltz for the departed" },
  elevator: { name: "elevator to the after life" },
  lullaby: { name: "1994 (a lullaby)" },
  encore: { name: "the queen's encore" },
  stomp: { name: "deco stomp" },
};

export const EFFECTS: Record<FxId, { name: string }> = {
  warm: { name: "warm vinyl" },
  slowed: { name: "slowed + reverb" },
  underwater: { name: "underwater" },
  cathedral: { name: "cathedral" },
  broken: { name: "broken record" },
};

const A4 = 440;
const hz = (semi: number) => A4 * 2 ** (semi / 12); // semitones from A4

type Song = { bpm: number; beatsPerBar: number; bars: number[][]; melody: (bar: number, beat: number) => number | null; play: (ctx: AudioContext, out: AudioNode, at: number, bar: number, beat: number, k: number, wow: number) => void };

function rng(seed: number) {
  let s = seed >>> 0 || 7;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------ instruments
function tone(ctx: AudioContext, out: AudioNode, at: number, f: number, dur: number, vol: number, type: OscillatorType, detune = 0, harm = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
  if (harm) {
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2;
    o2.detune.value = detune;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, at);
    g2.gain.linearRampToValueAtTime(vol * harm, at + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.5);
    o2.connect(g2).connect(out);
    o2.start(at);
    o2.stop(at + dur);
  }
}
const piano = (c: AudioContext, o: AudioNode, at: number, f: number, v: number, w: number) => tone(c, o, at, f, 1.3, v, "triangle", w, 0.35);
const bass = (c: AudioContext, o: AudioNode, at: number, f: number, v: number, w: number) => tone(c, o, at, f, 0.7, v, "sine", w);
const box = (c: AudioContext, o: AudioNode, at: number, f: number, v: number, w: number) => tone(c, o, at, f, 0.9, v, "sine", w, 0.5);
function brush(ctx: AudioContext, out: AudioNode, at: number, vol: number, noise: AudioBuffer) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 5000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  s.connect(f).connect(g).connect(out);
  s.start(at, Math.random(), 0.15);
}

// ------------------------------------------------------------------ the records
// chords as semitones from A4; melodies from the chord + scale
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

function song(id: RecordId, noise: AudioBuffer): Song {
  const r = rng(id.length * 9973 + id.charCodeAt(0));
  if (id === "waltz") {
    const bars = [[-12, -9, -5], [-7, -4, 0], [-10, -7, -3], [-8, -5, -1]]; // Am Dm F E-ish
    const mel = Array.from({ length: 16 }, () => Array.from({ length: 3 }, () => (r() < 0.75 ? MINOR[Math.floor(r() * 7)] + (r() < 0.3 ? 12 : 0) : null)));
    return {
      bpm: 96, beatsPerBar: 3, bars,
      melody: (bar, beat) => mel[bar % 16][beat],
      play(c, o, at, bar, beat, k, w) {
        const ch = bars[bar % bars.length];
        if (beat === 0) bass(c, o, at, hz(ch[0] - 12) * k, 0.32, w);
        else ch.forEach((n) => piano(c, o, at, hz(n) * k, 0.07, w));
        const m = this.melody(bar, beat);
        if (m !== null) piano(c, o, at, hz(m + ch[0] % 12 + 12) * k, 0.12, w);
      },
    };
  }
  if (id === "elevator") {
    const bars = [[-7, -3, 0, 4], [-12, -8, -5, -1], [-10, -6, -3, 1], [-5, -1, 2, 5]]; // lounge 7ths
    return {
      bpm: 82, beatsPerBar: 4, bars,
      melody: (bar, beat) => (beat % 2 === 0 && r() < 0.7 ? MAJOR[(bar * 3 + beat) % 7] : null),
      play(c, o, at, bar, beat, k, w) {
        const ch = bars[bar % bars.length];
        bass(c, o, at, hz(ch[(beat * 2) % 4] - 24) * k, 0.28, w);
        if (beat === 0 || beat === 2.5) ch.forEach((n) => piano(c, o, at, hz(n) * k, 0.05, w));
        if (beat === 1 || beat === 3) brush(c, o, at, 0.06, noise);
        const m = this.melody(bar, beat);
        if (m !== null) tone(c, o, at, hz(m + 12) * k, 0.8, 0.07, "sine", w, 0.2);
      },
    };
  }
  if (id === "lullaby") {
    // the melody walks the digits 1 9 9 4 through a minor scale
    const digits = [1, 9, 9, 4, 1, 9, 9, 4, 4, 9, 1, 1];
    return {
      bpm: 64, beatsPerBar: 3, bars: [[-12, -9, -5], [-8, -5, -1]],
      melody: (bar, beat) => digits[(bar * 3 + beat) % digits.length],
      play(c, o, at, bar, beat, k, w) {
        const d = this.melody(bar, beat)!;
        const n = MINOR[d % 7] + Math.floor(d / 7) * 12;
        box(c, o, at, hz(n + 12) * k, 0.14, w);
        if (beat === 0) bass(c, o, at, hz(this.bars[bar % 2][0] - 12) * k, 0.18, w);
      },
    };
  }
  if (id === "encore") {
    const TUNE = [7, 10, 14, 10, 12, 8, 5, 8, 7, 3, 5, 2];
    return {
      bpm: 118, beatsPerBar: 4, bars: [[-12], [-9], [-7], [-5]],
      melody: (bar, beat) => TUNE[(bar * 4 + beat) % TUNE.length],
      play(c, o, at, bar, beat, k, w) {
        box(c, o, at, hz(this.melody(bar, beat)! + 12) * k, 0.12, w);
        if (beat === 0) bass(c, o, at, hz(this.bars[bar % 4][0] - 12) * k, 0.15, w);
      },
    };
  }
  // stomp: ragtime-ish oom-pah
  const bars = [[-12, -8, -5], [-12, -8, -5], [-7, -3, 0], [-5, -1, 2]];
  const mel = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => (r() < 0.6 ? MAJOR[Math.floor(r() * 7)] + 12 : null)));
  return {
    bpm: 128, beatsPerBar: 4, bars,
    melody: (bar, beat) => mel[bar % 8][Math.floor(beat * 2) % 8],
    play(c, o, at, bar, beat, k, w) {
      const ch = bars[bar % bars.length];
      if (beat % 2 === 0) bass(c, o, at, hz(ch[0] - 24 + (beat === 2 ? 7 : 0)) * k, 0.3, w);
      else ch.forEach((n) => piano(c, o, at, hz(n) * k, 0.06, w));
      const m = this.melody(bar, beat);
      if (m !== null) piano(c, o, at, hz(m) * k, 0.1, w);
      const m2 = this.melody(bar, beat + 0.5);
      if (m2 !== null) piano(c, o, at + 60 / this.bpm / 2, hz(m2) * k, 0.08, w);
    },
  };
}

// ------------------------------------------------------------------ effects
function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return b;
}

/**
 * Start a record. Returns the output node (connect it where you like: a panner
 * for a gramophone, straight out for the radio) and stop().
 * t0 = when the record started (epoch ms), so everyone plays the same bar.
 */
export function playRecord(ctx: AudioContext, id: RecordId, fx: FxId, t0: number) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const s = song(id, noise);
  const tempo = fx === "slowed" ? 0.75 : 1;
  const pitch = fx === "slowed" ? 0.75 : 1;

  const input = ctx.createGain(); // the instruments play into this
  const out = ctx.createGain(); // what leaves the record
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
  let tail: AudioNode = input;
  const extra: AudioNode[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];

  // tone shaping per effect
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = fx === "underwater" ? 650 : fx === "warm" ? 3200 : fx === "broken" ? 2400 : 9000;
  lp.Q.value = fx === "underwater" ? 6 : 0.7;
  tail.connect(lp);
  tail = lp;
  if (fx === "underwater") {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.25;
    const depth = ctx.createGain();
    depth.gain.value = 350;
    lfo.connect(depth).connect(lp.frequency);
    lfo.start();
    extra.push(lfo);
  }
  if (fx === "broken") {
    // a waveshaper grit + the needle skipping (dropouts)
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.round(((i / 128 - 1) * 6)) / 6;
    ws.curve = curve;
    const skip = ctx.createGain();
    tail.connect(ws).connect(skip);
    tail = skip;
    timers.push(setInterval(() => skip.gain.setValueAtTime(Math.random() < 0.12 ? 0 : 1, ctx.currentTime), 180));
  }
  // reverb
  const wet = fx === "cathedral" ? 0.75 : fx === "slowed" ? 0.5 : fx === "underwater" ? 0.35 : 0.12;
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, fx === "cathedral" ? 4.5 : 2.2);
  const wetG = ctx.createGain();
  wetG.gain.value = wet;
  const dryG = ctx.createGain();
  dryG.gain.value = 1 - wet * 0.6;
  tail.connect(conv).connect(wetG).connect(out);
  tail.connect(dryG).connect(out);
  // vinyl crackle on everything but the cathedral
  if (fx !== "cathedral") {
    const crack = ctx.createGain();
    crack.gain.value = fx === "broken" ? 0.06 : 0.025;
    crack.connect(out);
    timers.push(
      setInterval(() => {
        const at = ctx.currentTime;
        const b = ctx.createBufferSource();
        b.buffer = noise;
        const g = ctx.createGain();
        g.gain.setValueAtTime(Math.random(), at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.01);
        b.connect(g).connect(crack);
        b.start(at, Math.random() * 0.9, 0.02);
      }, 70),
    );
  }

  // the sequencer: schedule beats a little ahead, aligned to t0
  const spb = 60 / (s.bpm * tempo); // seconds per beat
  const step = s.bpm >= 110 ? 1 : 0.5; // half beats for the slower songs (for the elevator's off-beat chord)
  let nextBeat = Math.ceil(((Date.now() - t0) / 1000 / spb) / step) * step;
  timers.push(
    setInterval(() => {
      const nowS = (Date.now() - t0) / 1000;
      while (nextBeat * spb < nowS + 0.25) {
        const at = ctx.currentTime + (nextBeat * spb - nowS);
        if (at >= ctx.currentTime) {
          const bar = Math.floor(nextBeat / s.beatsPerBar);
          const beat = nextBeat - bar * s.beatsPerBar;
          const wow = fx === "warm" || fx === "slowed" ? Math.sin(nextBeat * 0.7) * 14 : 0;
          if (Number.isInteger(beat) || id === "elevator") s.play(ctx, input, at, bar, beat, pitch, wow);
        }
        nextBeat += step;
      }
    }, 60),
  );

  return {
    output: out as AudioNode,
    stop() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => {
        timers.forEach(clearInterval);
        extra.forEach((n) => (n as OscillatorNode).stop?.());
        out.disconnect();
      }, 1500);
    },
  };
}
