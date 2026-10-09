// The labyrinth's living soundscape, all synthesised (nothing to download):
//   a deep drone everywhere; one bed per district, crossfaded as you walk:
//   entrance  — a slow ~60 bpm pulse + a crowd murmur that exists only when real people are in rooms nearby
//   whisper   — close whispers drifting around your head; they stop when you stand still
//   market    — electric buzz, flicker crackles, vinyl hiss
//   rain      — rain on glass that gets heavier the more people are in nearby rooms, far thunder
//   archive   — slow clock ticks, paper rustle
//   music     — bass leaking through walls
//   garden    — soft pads and chimes in the world's key
// plus wind roaring up from the wells (and a rising choir while you fall), time-of-day colour
// (evenings warmer, late night deeper, a witching hour at 03:00), and crowd sounds driven only by
// real reactions. Ambience ducks under voices (engine.setVoiceActivity).
import { districtAt, wellsNear } from "../../../shared/world/maze.ts";
import type { District } from "../../../shared/world/rooms.ts";
import type { RoomSummary } from "../../../shared/world/protocol.ts";
import { getAudio } from "./engine.ts";

const DISTRICTS: District[] = ["entrance", "whisper", "market", "rain", "archive", "music", "garden"];

export function createSoundscape() {
  const a = getAudio();
  const ctx = a.ctx;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  const tod = ctx.createBiquadFilter(); // time-of-day colour
  tod.type = "lowpass";
  tod.frequency.value = 12000;
  out.connect(tod).connect(a.ambience);

  const noiseSrc = (rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = a.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * 1.5);
    return s;
  };
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const gainNode = (v = 0) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const osc = (type: OscillatorType, f: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    return o;
  };

  // ---- drone (always)
  const drone = gainNode(0.05);
  const dlp = filt("lowpass", 160);
  osc("sawtooth", a.note(0, -2)).connect(dlp);
  osc("sawtooth", a.note(3, -2) * 1.003).connect(dlp);
  dlp.connect(drone).connect(out);

  // ---- district beds
  const beds = Object.fromEntries(DISTRICTS.map((d) => [d, gainNode(0)])) as Record<District, GainNode>;
  DISTRICTS.forEach((d) => beds[d].connect(out));

  // entrance murmur (real crowd only)
  const murmur = gainNode(0);
  noiseSrc(0.6).connect(filt("bandpass", 420, 1.2)).connect(murmur).connect(beds.entrance);
  // market buzz + hiss
  const buzz = osc("square", 100);
  buzz.connect(filt("lowpass", 300)).connect(gainNode(0.03)).connect(beds.market);
  noiseSrc(1).connect(filt("highpass", 5000)).connect(gainNode(0.015)).connect(beds.market);
  // rain
  const rain = gainNode(0.05);
  noiseSrc(1).connect(filt("highpass", 900)).connect(filt("lowpass", 7000)).connect(rain).connect(beds.rain);
  // garden pad
  const pad = gainNode(0.02);
  [0, 2, 4].forEach((deg) => osc("sine", a.note(deg, 0)).connect(pad));
  pad.connect(filt("lowpass", 1500)).connect(beds.garden);
  // music district: bass leaking through walls (scheduled below)
  const leak = filt("lowpass", 220);
  leak.connect(gainNode(0.6)).connect(beds.music);

  // wells: wind roaring up, louder close to a hole; choir while falling
  const wind = gainNode(0);
  const windBand = filt("bandpass", 500, 0.8);
  noiseSrc(0.7).connect(windBand).connect(wind).connect(out);
  const choir = gainNode(0);
  const choirLp = filt("lowpass", 400);
  [0, 2, 4, 7].forEach((deg, i) => osc("sawtooth", a.note(deg, 0) * (1 + i * 0.002)).connect(choirLp));
  choirLp.connect(choir).connect(out);

  // the witching hour (03:00–04:00 local)
  const witch = gainNode(0);
  osc("sine", a.note(1, 1) * 1.01).connect(witch);
  osc("sine", a.note(1, 1) * 0.99).connect(witch);
  witch.connect(out);

  let current: District = "entrance";
  let crowdNear = 0, rainLevel = 0;
  let nextBeat = 0, nextTick = 0, nextWhisper = 0, nextCrackle = 0, nextChime = 0, nextBass = 0, nextThunder = ctx.currentTime + 20, bassStep = 0;

  function blip(dest: AudioNode, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = "sine", at = ctx.currentTime) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  function burst(dest: AudioNode, f: number, q: number, dur: number, peak: number, pan = 0, at = ctx.currentTime, type: BiquadFilterType = "bandpass") {
    const s = ctx.createBufferSource();
    s.buffer = a.noise;
    const b = filt(type, f, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.08, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(b).connect(g).connect(p).connect(dest);
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.05);
  }

  return {
    setCrowd(rooms: RoomSummary[]) {
      // real people only: a murmur/rain intensity from the number of humans in rooms
      const people = rooms.reduce((n, r) => n + r.people, 0);
      crowdNear = Math.min(1, people / 12);
      rainLevel = Math.min(1, 0.2 + people / 10);
    },
    reaction(emoji: string) {
      // laughter / applause from REAL reactions only
      const t = ctx.currentTime;
      if (emoji === "👏") for (let i = 0; i < 10; i++) burst(out, 2500, 1.5, 0.05, 0.08, Math.random() * 1.6 - 0.8, t + i * 0.07 + Math.random() * 0.04);
      else if (emoji === "😂") for (let i = 0; i < 5; i++) blip(out, a.note(4 + (i % 2), 1), a.note(3, 1), 0.12, 0.03, "triangle", t + i * 0.11);
      else a.sfx2.chime();
    },
    update(_dt: number, p: { x: number; y: number; z: number }, falling: boolean, voice: number, speed: number) {
      const t = ctx.currentTime;
      const d = districtAt(p.x, p.z);
      if (d !== current) current = d;
      for (const k of DISTRICTS) beds[k].gain.setTargetAtTime(k === current ? 1 : 0, t, 1.2);
      murmur.gain.setTargetAtTime(crowdNear * 0.05, t, 1.5);
      rain.gain.setTargetAtTime(0.02 + rainLevel * 0.06, t, 2);

      // wells
      let near = 99;
      for (const w of wellsNear(p.x, p.z, 1)) near = Math.min(near, Math.hypot(w.x - p.x, w.z - p.z));
      wind.gain.setTargetAtTime(falling ? 0.35 : Math.max(0, 0.12 - near * 0.006), t, 0.3);
      windBand.frequency.setTargetAtTime(falling ? 1400 : 500, t, 0.8);
      choir.gain.setTargetAtTime(falling ? 0.05 : 0, t, falling ? 0.8 : 0.2);
      choirLp.frequency.setTargetAtTime(falling ? 2400 : 400, t, 1);

      // time of day: warmer evenings, deeper late nights, the witching hour
      const h = new Date().getHours();
      tod.frequency.setTargetAtTime(h >= 23 || h < 5 ? 2200 : h >= 18 ? 5000 : 12000, t, 3);
      witch.gain.setTargetAtTime(h === 3 ? 0.012 : 0, t, 4);
      drone.gain.setTargetAtTime(h >= 23 || h < 5 ? 0.07 : 0.05, t, 3);

      // rhythmic + random events (look-ahead scheduling)
      const ahead = t + 0.15;
      if (current === "entrance" && nextBeat < ahead) {
        nextBeat = Math.max(nextBeat, t) + 1.0; // resting heartbeat
        blip(beds.entrance, 70, 40, 0.18, 0.12, "sine", nextBeat);
        blip(beds.entrance, 60, 38, 0.15, 0.08, "sine", nextBeat + 0.28);
      }
      if (current === "archive" && nextTick < ahead) {
        nextTick = Math.max(nextTick, t) + 1.0;
        burst(beds.archive, 3200, 8, 0.03, 0.08, 0.3, nextTick);
        if (Math.random() < 0.08) burst(beds.archive, 1800, 0.6, 0.5, 0.02, Math.random() - 0.5, nextTick);
      }
      if (current === "whisper" && speed > 0.4 && nextWhisper < t) {
        // whispers drift past only while you move; stand still and listen, they stop
        nextWhisper = t + 0.6 + Math.random() * 1.4;
        const pan = Math.random() * 2 - 1;
        for (let i = 0; i < 4; i++) burst(beds.whisper, 1200 + Math.random() * 2400, 6, 0.12 + Math.random() * 0.1, 0.035, pan, t + i * 0.13);
      }
      if (current === "market" && nextCrackle < t) {
        nextCrackle = t + 0.2 + Math.random() * 2;
        burst(beds.market, 4000, 2, 0.02, 0.05, Math.random() - 0.5);
        buzz.frequency.setValueAtTime(Math.random() < 0.1 ? 120 : 100, t);
      }
      if (current === "rain" && nextThunder < t) {
        nextThunder = t + 25 + Math.random() * 40;
        burst(beds.rain, 120, 0.5, 4, 0.15, Math.random() - 0.5, t, "lowpass");
      }
      if (current === "garden" && nextChime < t) {
        nextChime = t + 1.5 + Math.random() * 3;
        blip(beds.garden, a.note(Math.floor(Math.random() * 5), 2), a.note(0, 2), 1.2, 0.03, "sine");
      }
      if (current === "music" && nextBass < ahead) {
        nextBass = Math.max(nextBass, t) + 0.3; // 100 bpm eighths
        if (bassStep % 2 === 0) blip(leak, 110, 40, 0.2, 0.5, "sine", nextBass);
        blip(leak, a.note([0, 0, 3, 4][bassStep % 4], -2), a.note([0, 0, 3, 4][bassStep % 4], -2), 0.25, 0.25, "sawtooth", nextBass);
        bassStep++;
      }
      void voice;
    },
    dispose() {
      out.disconnect();
    },
  };
}
