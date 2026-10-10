// The gate's sound: the cube's own click, doubled and driven up into a riser,
// through a ping-pong delay and a long reverb, landing on a deep bell as the
// light tears open (Gate.scss). Built from the cube's sounds, decoded during
// the pre-launch (prelaunch.ts) so it starts on the exact frame.
//   0.0 s   the cube's click, then again and again, closer and higher each time
//   0–2.5 s a noise + tone riser sweeps up underneath
//   2.5 s   impact: the bell an octave down, a sub drop, the riser cut
//   2.9 s   everything fades as you fall through (the page changes at 3.4 s)
// Goes through Howler's master output, so it obeys the same mute as every
// other cube sound. Without Web Audio it falls back to the two plain chimes.
import { Howl, Howler } from "howler";

const SRC = { click: "/sounds/CodeClickInput.mp3", bell: "/sounds/BellClick1.mp3", magic: "/sounds/MagicClick1.mp3" };
type Name = keyof typeof SRC;

export const IMPACT_S = 2.5;

let buffers: Partial<Record<Name, AudioBuffer>> | null = null;
let loading: Promise<void> | null = null;

function context(): AudioContext | null {
  // Howler makes its context with the first Howl
  if (!Howler.ctx) new Howl({ src: [SRC.click], preload: false });
  return Howler.usingWebAudio && Howler.ctx ? Howler.ctx : null;
}

/** decode the gate's sounds ahead of time (safe to call more than once) */
export function preparePortal(): Promise<void> {
  if (loading) return loading;
  const ctx = context();
  if (!ctx) return (loading = Promise.resolve());
  const out: Partial<Record<Name, AudioBuffer>> = {};
  loading = Promise.all(
    (Object.keys(SRC) as Name[]).map(async (k) => {
      try {
        const data = await (await fetch(SRC[k])).arrayBuffer();
        out[k] = await ctx.decodeAudioData(data);
      } catch {
        // that layer stays silent
      }
    }),
  ).then(() => {
    buffers = out;
  });
  return loading;
}

/** a reverb tail made of decaying stereo noise: no file to download */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / n, decay);
  }
  return ir;
}

function noise(ctx: AudioContext, seconds: number) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  return b;
}

/** times (s) of the doubled clicks: each gap shorter than the last, up to the impact */
export function clickTimes(): number[] {
  const out: number[] = [];
  let t = 0, gap = 0.62;
  while (t < IMPACT_S - 0.05) {
    out.push(t);
    t += gap;
    gap = Math.max(0.045, gap * 0.72);
  }
  return out;
}

/** play the gate; `onHit(k)` fires (in sync with the audio) on each doubled click */
export function playPortal(onHit?: (k: number, at: number) => void) {
  const ctx = context();
  if (!ctx || !buffers || !buffers.click) {
    new Howl({ src: [SRC.bell], volume: 0.8 }).play();
    setTimeout(() => new Howl({ src: [SRC.magic], volume: 0.8 }).play(), 700);
    clickTimes().forEach((t, k) => setTimeout(() => onHit?.(k, t), t * 1000));
    return;
  }
  void ctx.resume();
  const b = buffers;
  const now = ctx.currentTime + 0.03;
  const end = now + IMPACT_S;

  // ---- the bus: dry + ping-pong delay + reverb → master (fades out as you fall)
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.9, now);
  master.gain.setValueAtTime(0.9, end + 0.4);
  master.gain.linearRampToValueAtTime(0, end + 0.9);
  master.connect(Howler.masterGain ?? ctx.destination);

  const bus = ctx.createGain();
  bus.connect(master);

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.5, 2.6);
  const verbIn = ctx.createGain();
  verbIn.gain.setValueAtTime(0.35, now);
  verbIn.gain.linearRampToValueAtTime(0.9, end); // the room opens up as it rises
  bus.connect(verbIn).connect(verb).connect(master);

  // ping-pong: left 0.27 s, right 0.41 s, each feeding the other through a darkening filter
  const dl = ctx.createDelay(1), dr = ctx.createDelay(1);
  dl.delayTime.value = 0.27;
  dr.delayTime.value = 0.41;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  const pl = new StereoPannerNode(ctx, { pan: -0.75 }), pr = new StereoPannerNode(ctx, { pan: 0.75 });
  const send = ctx.createGain();
  send.gain.value = 0.5;
  bus.connect(send).connect(dl);
  dl.connect(pl).connect(master);
  dl.connect(dr);
  dr.connect(pr).connect(master);
  dr.connect(tone).connect(fb).connect(dl);
  pl.connect(verbIn);
  pr.connect(verbIn);

  const shot = (buf: AudioBuffer | undefined, at: number, rate: number, gain: number, pan = 0) => {
    if (!buf) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(new StereoPannerNode(ctx, { pan })).connect(bus);
    s.start(at);
  };

  // ---- the cube's click, doubled: the original + an octave below, rising in pitch and closing in
  const times = clickTimes();
  times.forEach((t, k) => {
    const p = k / Math.max(1, times.length - 1); // 0 → 1 up to the impact
    const rate = Math.pow(2, p * 1.4); // up ~1.4 octaves
    const gain = 0.32 + p * 0.25;
    shot(b.click, now + t, rate, gain, k % 2 ? 0.35 : -0.35);
    shot(b.click, now + t + 0.012, rate / 2, gain * 0.8, k % 2 ? -0.35 : 0.35); // the double
    if (onHit) setTimeout(() => onHit(k, t), Math.max(0, (now + t - ctx.currentTime) * 1000));
  });
  // the first chime at the start, like before
  shot(b.magic, now, 1, 0.45);

  // ---- riser: filtered noise sweeping up + a saw climbing underneath
  const hiss = ctx.createBufferSource();
  hiss.buffer = noise(ctx, IMPACT_S + 0.2);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.6;
  band.frequency.setValueAtTime(250, now);
  band.frequency.exponentialRampToValueAtTime(9000, end);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.0001, now);
  hg.gain.exponentialRampToValueAtTime(0.32, end - 0.05);
  hg.gain.linearRampToValueAtTime(0, end + 0.02);
  hiss.connect(band).connect(hg).connect(bus);
  hiss.start(now);
  hiss.stop(end + 0.1);

  const saw = new OscillatorNode(ctx, { type: "sawtooth", frequency: 55 });
  saw.frequency.exponentialRampToValueAtTime(880, end);
  const sawLp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 400 });
  sawLp.frequency.exponentialRampToValueAtTime(5000, end);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, now);
  sg.gain.exponentialRampToValueAtTime(0.09, end - 0.05);
  sg.gain.linearRampToValueAtTime(0, end + 0.02);
  saw.connect(sawLp).connect(sg).connect(bus);
  saw.start(now);
  saw.stop(end + 0.1);

  // ---- impact: the bell an octave down (and doubled), a magic shimmer, a sub drop
  shot(b.bell, end, 0.5, 0.9, -0.2);
  shot(b.bell, end + 0.015, 1, 0.55, 0.2);
  shot(b.magic, end + 0.05, 0.75, 0.5);
  const sub = new OscillatorNode(ctx, { type: "sine", frequency: 110 });
  sub.frequency.exponentialRampToValueAtTime(32, end + 0.8);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.0001, end);
  subG.gain.exponentialRampToValueAtTime(0.55, end + 0.02);
  subG.gain.exponentialRampToValueAtTime(0.0001, end + 0.9);
  sub.connect(subG).connect(master);
  sub.start(end);
  sub.stop(end + 1);
}
