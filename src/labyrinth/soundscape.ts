// The soundscape: every zone has its own living sound bed, plus little sounds
// placed around you in 3D (drips, birds, embers, whales…), and a reward ladder
// for pickups (each ◈ in a streak rings one step higher; every 5th is "divine").
// All synthesised live, no files. Calm by design:
//   · beds fade in and cross-fade (never a sudden start)
//   · natural sounds (water, leaves, fire) in most zones; the white zone is the
//     calm one: a soft pad that swells about six times a minute, like slow breathing
//   · nothing sharp or loud in the beds; the scares stay where they already are
// Headphones mode places the little sounds with HRTF (you hear above/behind you).
import type { Sound } from "./sound";
import type { ZoneKind } from "./zones";

type Bed = { out: GainNode; stop: (at: number) => void; level: number };
type Spot = (at: AudioNode, when: number) => number; // returns seconds until it is done

// major pentatonic over two octaves (C D E G A): any order sounds sweet
const LADDER = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];

export function createSoundscape(sound: Sound) {
  const ctx = sound.ctx;
  const amb = sound.ambienceOut;
  const fx = sound.effectsOut;
  let headphones = false;

  // ----------------------------------------------------------- shared parts
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  {
    // pinkish noise (gentler than white): Paul Kellet's filter
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  /** stereo noise: the same buffer started at two offsets, so left and right differ (wide, not mono) */
  function stereoNoise(into: AudioNode) {
    const merge = ctx.createChannelMerger(2);
    const srcs = [0, 1].map((ch) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      s.connect(merge, 0, ch);
      s.start(ctx.currentTime, ch * 1.37 + Math.random());
      return s;
    });
    merge.connect(into);
    return srcs;
  }

  // a small room reverb for the placed sounds (generated impulse, ~1.6 s)
  const verb = ctx.createConvolver();
  {
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
  }
  const verbIn = ctx.createGain();
  verbIn.gain.value = 0.5;
  verbIn.connect(verb).connect(amb);

  // a soft echo for rewards (on the effects slider)
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.19;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.28;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = "lowpass";
  echoLp.frequency.value = 3200;
  const echoIn = ctx.createGain();
  echoIn.gain.value = 0.35;
  echoIn.connect(echo).connect(echoLp).connect(echoFb).connect(echo);
  echoLp.connect(fx);

  // ----------------------------------------------------------- bed builders
  function lfo(rate: number, depth: number, target: AudioParam) {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  function newBed(level: number, build: (out: GainNode) => AudioScheduledSourceNode[]): Bed {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(amb);
    const nodes = build(out);
    return {
      out,
      level,
      stop(at) {
        nodes.forEach((n) => n.stop(at));
        setTimeout(() => out.disconnect(), (at - ctx.currentTime + 0.5) * 1000);
      },
    };
  }

  /** filtered stereo noise, its level gently moving (water, leaves, air) */
  function wash(out: AudioNode, type: BiquadFilterType, freq: number, q: number, vol: number, sway = 0, swayRate = 0.1) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    const nodes: AudioScheduledSourceNode[] = stereoNoise(f);
    f.connect(g).connect(out);
    if (sway) nodes.push(lfo(swayRate, vol * sway, g.gain), lfo(swayRate * 0.7, freq * 0.25, f.frequency));
    return nodes;
  }

  /** a soft chord (each note two detuned voices, spread left/right), optional breathing swell */
  function pad(out: AudioNode, freqs: number[], type: OscillatorType, cutoff: number, vol: number, breathe = 0) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    f.connect(g).connect(out);
    const nodes: AudioScheduledSourceNode[] = [];
    freqs.forEach((fr, k) => {
      for (const side of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = fr;
        o.detune.value = side * (4 + k);
        const p = ctx.createStereoPanner();
        p.pan.value = side * 0.6;
        o.connect(p).connect(f);
        o.start();
        nodes.push(o);
      }
    });
    nodes.push(lfo(0.05, cutoff * 0.35, f.frequency));
    if (breathe) nodes.push(lfo(breathe, vol * 0.7, g.gain));
    return nodes;
  }

  // levels are balanced by ear-equivalent loudness (measured RMS ≈ 0.03 each;
  // the white zone a little softer, neon a quiet buzz)
  const BEDS: Record<ZoneKind, () => Bed> = {
    // the arrival halls: a warm, open low fifth and a breath of air
    monogram: () => newBed(0.42, (o) => [...pad(o, [55, 82.4, 110, 164.8], "sine", 600, 0.05), ...wash(o, "highpass", 5000, 0.5, 0.012, 0.6, 0.07)]),
    // the pools: water lapping at the tiles, slow and close
    pools: () => newBed(4.5, (o) => [...wash(o, "bandpass", 420, 0.9, 0.07, 0.8, 0.13), ...wash(o, "highpass", 3800, 0.4, 0.008, 0.5, 0.21)]),
    // the red rooms: velvet hum under the carpet, a little uneasy (a minor second, very low)
    red: () => newBed(1.05, (o) => [...pad(o, [49, 52, 98], "sawtooth", 180, 0.035), ...wash(o, "lowpass", 160, 0.7, 0.03, 0.4, 0.05)]),
    // neon: the mains hum of the tubes and a hiss of static
    neon: () => newBed(1.9, (o) => [...pad(o, [60, 120, 180], "sawtooth", 900, 0.012), ...wash(o, "bandpass", 6500, 2, 0.006, 0.9, 0.9)]),
    // the moss: wind moving through leaves
    photo: () => newBed(6.5, (o) => [...wash(o, "bandpass", 1300, 0.6, 0.045, 0.9, 0.09), ...wash(o, "lowpass", 300, 0.5, 0.02, 0.5, 0.04)]),
    // the white: the calm zone. A major-seventh pad that swells ~6 times a minute
    white: () => newBed(0.7, (o) => [...pad(o, [130.8, 196, 246.9, 329.6, 392], "triangle", 1400, 0.03, 0.1), ...wash(o, "highpass", 7000, 0.5, 0.006, 0.6, 0.1)]),
    // the ash: embers and a low fire rumble
    ash: () => newBed(3.5, (o) => [...wash(o, "lowpass", 140, 0.8, 0.06, 0.5, 0.11), ...wash(o, "bandpass", 900, 0.4, 0.012, 0.7, 0.3)]),
    // the deep: underwater pressure, a slow tide
    deep: () => newBed(0.75, (o) => [...wash(o, "lowpass", 220, 1.5, 0.08, 0.7, 0.06), ...pad(o, [41.2, 61.7], "sine", 200, 0.04)]),
  };

  // ----------------------------------------------------------- placed one-shots
  const env = (g: GainNode, t: number, peak: number, attack: number, dur: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  };
  const tone = (at: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, glide: number, peak: number, dur: number, attack = 0.005) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const g = ctx.createGain();
    env(g, t, peak, attack, dur);
    o.connect(g).connect(at);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  };
  const burst = (at: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, dur: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, peak, 0.003, dur);
    s.connect(f).connect(g).connect(at);
    s.start(t, Math.random() * 2, dur + 0.05);
  };
  const r = (a: number, b: number) => a + Math.random() * (b - a);

  const drip: Spot = (at, t) => (tone(at, t, "sine", r(1200, 2000), r(300, 500), 0.07, 0.12, 0.14), 0.2);
  const bird: Spot = (at, t) => {
    const base = r(2200, 3600);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(at, t + i * 0.11, "sine", base, base * r(1.15, 1.5), 0.06, 0.05, 0.09);
    return n * 0.11 + 0.1;
  };
  const ember: Spot = (at, t) => {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) burst(at, t + i * r(0.02, 0.09), "highpass", r(2500, 5000), 1, 0.1, 0.025);
    return 0.3;
  };
  const crackle: Spot = (at, t) => (burst(at, t, "bandpass", r(3000, 7000), 4, 0.05, 0.04), 0.1);
  const bell: Spot = (at, t) => {
    const f = LADDER[Math.floor(Math.random() * 5)] / 2;
    tone(at, t, "sine", f, f, 0.01, 0.04, 4, 0.01);
    tone(at, t, "sine", f * 2.76, f * 2.76, 0.01, 0.012, 2, 0.01);
    return 4;
  };
  const glass: Spot = (at, t) => {
    const f = [1318.5, 1568, 1975.5, 2349.3][Math.floor(Math.random() * 4)];
    tone(at, t, "sine", f, f, 0.01, 0.018, 3, 0.4);
    return 3;
  };
  const whale: Spot = (at, t) => {
    const f = r(160, 240);
    const o = tone(at, t, "sine", f, f * r(0.55, 0.75), 3.5, 0.05, 4, 1.2);
    lfo(r(4, 6), 6, o.frequency).stop(t + 4.1);
    return 4;
  };
  const bubbles: Spot = (at, t) => {
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const f = r(300, 700);
      tone(at, t + i * r(0.05, 0.14), "sine", f, f * 2.2, 0.06, 0.05, 0.08);
    }
    return 1;
  };
  const creak: Spot = (at, t) => {
    const s = ctx.createOscillator();
    s.type = "sawtooth";
    s.frequency.setValueAtTime(r(70, 110), t);
    s.frequency.linearRampToValueAtTime(r(130, 200), t + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 700;
    f.Q.value = 6;
    const g = ctx.createGain();
    env(g, t, 0.025, 0.3, 1.4);
    s.connect(f).connect(g).connect(at);
    s.start(t);
    s.stop(t + 1.5);
    return 1.5;
  };
  const blip: Spot = (at, t) => {
    const root = [220, 246.9, 293.7, 329.6][Math.floor(Math.random() * 4)];
    [1, 1.5, 2, 3].forEach((m, i) => tone(at, t + i * 0.09, "square", root * m, root * m, 0.01, 0.012, 0.12));
    return 0.5;
  };

  /** zone → [sound, min gap s, max gap s, distance m] */
  const SPOTS: Record<ZoneKind, [Spot, number, number, number][]> = {
    monogram: [[bell, 10, 22, 14]],
    pools: [[drip, 0.5, 2.2, 5], [drip, 1.5, 4, 9]],
    red: [[creak, 12, 26, 9], [bell, 25, 50, 18]],
    neon: [[crackle, 0.6, 3, 4], [blip, 9, 20, 12]],
    photo: [[bird, 2, 6, 10], [bird, 5, 12, 16], [drip, 3, 8, 4]],
    white: [[glass, 7, 15, 8]],
    ash: [[ember, 0.3, 1.4, 4], [crackle, 0.4, 1.8, 3]],
    deep: [[bubbles, 3, 8, 5], [whale, 14, 30, 25]],
  };

  /** play a sound at a point around the player (x, z in metres, world space) */
  function place(spot: Spot, x: number, y: number, z: number) {
    const p = ctx.createPanner();
    p.panningModel = headphones ? "HRTF" : "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = 2;
    p.rolloffFactor = 0.8;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else (p as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, y, z);
    p.connect(amb);
    p.connect(verbIn);
    const dur = spot(p, ctx.currentTime + 0.02);
    setTimeout(() => p.disconnect(), (dur + 1) * 1000);
  }

  // ----------------------------------------------------------- zone state
  let zone: ZoneKind | null = null;
  let bed: Bed | null = null;
  let calm = 1; // 1 = normal; rooms soften the bed a little
  const timers = new Map<number, number>(); // spot index → seconds until next

  function setZone(k: ZoneKind) {
    if (k === zone) return;
    zone = k;
    const now = ctx.currentTime;
    if (bed) {
      bed.out.gain.setTargetAtTime(0, now, 1.2);
      bed.stop(now + 6);
    }
    bed = BEDS[k]();
    bed.out.gain.setValueAtTime(0, now);
    bed.out.gain.setTargetAtTime(bed.level * calm, now + 0.3, 1.5);
    timers.clear();
    SPOTS[k].forEach((s, i) => timers.set(i, r(s[1], s[2]) * 0.5));
  }

  // ----------------------------------------------------------- rewards (the ladder)
  let streak = 0, lastAt = -99;
  const STREAK_GAP = 4; // seconds: pick up the next ◈ within this to climb

  function note(f: number, t: number, peak: number, dur = 1.1) {
    const g = ctx.createGain();
    env(g, t, peak, 0.004, dur);
    g.connect(fx);
    g.connect(echoIn);
    for (const [m, v] of [[1, 1], [2.01, 0.35], [3.98, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * m;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  function sparkle(t: number, n: number, from: number) {
    for (let i = 0; i < n; i++) note(LADDER[Math.min(LADDER.length - 1, from + i)] * 2, t + i * 0.045, 0.035, 0.5);
  }
  /** the "divine" moment: a bright rising run and a short choir "aah" */
  function divine(t: number) {
    sparkle(t, 8, 2);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 800; // the "ah" formant
    f.Q.value = 1.2;
    const g = ctx.createGain();
    env(g, t, 0.05, 0.25, 1.8);
    f.connect(g).connect(fx);
    g.connect(echoIn);
    for (const fr of [261.6, 329.6, 392, 523.3]) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 1.9);
      }
    }
  }

  /**
   * a reward sound. "coin" climbs the ladder while the streak lasts; bigger
   * rewards play a short rising figure. Returns the streak (for words on screen).
   */
  function reward(kind: "coin" | "shard" | "depth" | "walk" | "quest" | "relic") {
    const now = ctx.currentTime;
    const t = now + 0.01;
    if (kind === "coin") {
      streak = now - lastAt < STREAK_GAP ? streak + 1 : 0;
      lastAt = now;
      const step = Math.min(streak, LADDER.length - 1);
      // a tiny random detune keeps it alive (no two pickups exactly alike)
      note(LADDER[step] * (1 + (Math.random() - 0.5) * 0.004), t, 0.07 + Math.min(streak, 8) * 0.004);
      if (streak > 0 && (streak + 1) % 5 === 0) divine(t + 0.12);
      return streak + 1;
    }
    if (kind === "walk") note(LADDER[4], t, 0.04, 0.8);
    if (kind === "shard") [0, 2, 4].forEach((s, i) => note(LADDER[s + 2], t + i * 0.07, 0.06));
    if (kind === "relic") [0, 2, 4, 7].forEach((s, i) => note(LADDER[s], t + i * 0.08, 0.06));
    if (kind === "depth" || kind === "quest") divine(t);
    return 0;
  }

  return {
    reward,
    setHeadphones(v: boolean) {
      headphones = v;
    },
    /** once per frame: where you are, which zone, and whether you're inside a room */
    update(dt: number, x: number, z: number, k: ZoneKind, inRoom: boolean) {
      setZone(k);
      const c = inRoom ? 0.55 : 1;
      if (c !== calm && bed) {
        calm = c;
        bed.out.gain.setTargetAtTime(bed.level * calm, ctx.currentTime, 1);
      }
      if (ctx.state !== "running") return;
      const list = SPOTS[k];
      for (let i = 0; i < list.length; i++) {
        const left = (timers.get(i) ?? 0) - dt;
        if (left > 0) {
          timers.set(i, left);
          continue;
        }
        const [spot, lo, hi, dist] = list[i];
        timers.set(i, r(lo, hi));
        const a = Math.random() * Math.PI * 2;
        const d = dist * r(0.5, 1);
        place(spot, x + Math.cos(a) * d, r(0.3, 3), z + Math.sin(a) * d);
      }
    },
  };
}

export type Soundscape = ReturnType<typeof createSoundscape>;
