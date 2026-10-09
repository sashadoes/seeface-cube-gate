// Every remote voice comes out of its speaker's mouth: HRTF panning (nearest 12; the rest are a
// cheap equal-power bed), distance falloff, walls muffle it (low-pass per wall), a smooth
// crossfade from muffled to clear when you step into a room, and per-room reverb.
// Whisper: only people within ~2 m hear it, close in their ears. Muted people are silent.
import { wallsBetween } from "../../../shared/world/maze.ts";
import { WHISPER_R } from "../../../shared/world/protocol.ts";
import type { Acoustic } from "../../../shared/world/rooms.ts";
import { getAudio } from "./engine.ts";

export type VoicePose = { x: number; y: number; z: number; room: string | null; talking: 0 | 1 | 2 };

type Voice = {
  peer: string;
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  gain: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  send: GainNode;
  level: number;
  hrtf: boolean;
  preview: boolean;
};

const HRTF_MAX = 12;

export function createVoices() {
  const a = getAudio();
  const ctx = a.ctx;
  const voices = new Map<string, Voice>();
  const muted = new Set<string>();
  const previewPeers = new Set<string>();

  // reverb: two convolvers so a room change crossfades instead of clicking
  const verbs = [ctx.createConvolver(), ctx.createConvolver()];
  const verbGains = verbs.map(() => ctx.createGain());
  const verbIn = ctx.createGain();
  verbs.forEach((v, i) => {
    verbIn.connect(v);
    v.connect(verbGains[i]).connect(a.voices);
    verbGains[i].gain.value = 0;
  });
  let activeVerb = 0, currentAcoustic: Acoustic | "corridor" | null = null;

  function setAcoustic(kind: Acoustic | "corridor") {
    if (kind === currentAcoustic) return;
    currentAcoustic = kind;
    const next = 1 - activeVerb;
    verbs[next].buffer = impulse(kind);
    const t = ctx.currentTime;
    verbGains[next].gain.setTargetAtTime(WET[kind], t, 0.25);
    verbGains[activeVerb].gain.setTargetAtTime(0, t, 0.25);
    activeVerb = next;
  }

  function impulse(kind: Acoustic | "corridor") {
    const [secs, bright] = ({ booth: [0.5, 0.6], hall: [2.6, 0.5], tunnel: [1.7, 0.75], closet: [0.22, 0.4], corridor: [3.0, 0.25] } as const)[kind];
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * bright; // darker tails for low "bright"
        d[i] = lp * Math.pow(1 - i / len, kind === "tunnel" ? 1.6 : 2.4);
      }
    }
    return buf;
  }

  return {
    add(peer: string, stream: MediaStream) {
      this.remove(peer);
      // Chrome only feeds remote WebRTC audio into Web Audio while a media element plays it
      const el = new Audio();
      el.muted = true;
      el.srcObject = stream;
      void el.play().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 16000;
      const panner = new PannerNode(ctx, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1.6, maxDistance: 60, rolloffFactor: 1.1 });
      const send = ctx.createGain();
      send.gain.value = 0.25;
      src.connect(analyser);
      src.connect(gain).connect(lp).connect(panner).connect(a.voices);
      panner.connect(send).connect(verbIn);
      voices.set(peer, { peer, el, src, analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)), gain, lp, panner, send, level: 0, hrtf: true, preview: false });
    },
    remove(peer: string) {
      const v = voices.get(peer);
      if (!v) return;
      v.src.disconnect();
      v.panner.disconnect();
      v.send.disconnect();
      v.el.srcObject = null;
      voices.delete(peer);
    },
    setMuted(peer: string, on: boolean) {
      if (on) muted.add(peer);
      else muted.delete(peer);
    },
    /** radio preview peers: heard flat and band-limited, like a radio, not placed in the world */
    setPreview(peers: string[]) {
      previewPeers.clear();
      peers.forEach((p) => previewPeers.add(p));
    },
    level: (peer: string) => voices.get(peer)?.level ?? 0,
    /** total voice activity 0..1 (drives ambience ducking) */
    activity() {
      let m = 0;
      for (const v of voices.values()) m = Math.max(m, v.level);
      return m;
    },
    has: (peer: string) => voices.has(peer),
    count: () => voices.size,
    update(me: { x: number; y: number; z: number; yaw: number; room: string | null; acoustic: Acoustic | null }, poses: Map<string, VoicePose>) {
      const t = ctx.currentTime;
      const L = ctx.listener;
      const head = me.y + 1.1;
      if (L.positionX) {
        L.positionX.setTargetAtTime(me.x, t, 0.03);
        L.positionY.setTargetAtTime(head, t, 0.03);
        L.positionZ.setTargetAtTime(me.z, t, 0.03);
        L.forwardX.setTargetAtTime(-Math.sin(me.yaw), t, 0.03);
        L.forwardY.setTargetAtTime(0, t, 0.03);
        L.forwardZ.setTargetAtTime(-Math.cos(me.yaw), t, 0.03);
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      } else {
        L.setPosition(me.x, head, me.z);
        L.setOrientation(-Math.sin(me.yaw), 0, -Math.cos(me.yaw), 0, 1, 0);
      }
      setAcoustic(me.acoustic ?? "corridor");
      const speakers = a.output() === "speakers";

      // the nearest voices get full HRTF; the rest are an equal-power bed
      const order = [...voices.values()].map((v) => {
        const p = poses.get(v.peer);
        return { v, p, d: p ? Math.hypot(p.x - me.x, p.z - me.z) : 999 };
      });
      order.sort((x, y) => x.d - y.d);
      order.forEach(({ v, p, d }, i) => {
        // level for the speaking ring and ducking
        v.analyser.getByteTimeDomainData(v.data);
        let peak = 0;
        for (let k = 0; k < v.data.length; k += 4) peak = Math.max(peak, Math.abs(v.data[k] - 128));
        v.level += (Math.min(1, peak / 50) - v.level) * 0.35;

        const preview = previewPeers.has(v.peer);
        const wantHrtf = !speakers && !preview && i < HRTF_MAX;
        if (wantHrtf !== v.hrtf) {
          v.panner.panningModel = wantHrtf ? "HRTF" : "equalpower";
          v.hrtf = wantHrtf;
        }
        let gain = 1, cutoff = 16000, wet = 0.25;
        if (!p || muted.has(v.peer)) gain = 0;
        else if (preview) {
          // place it right in front of you, band-limited like an old radio
          v.panner.positionX.setTargetAtTime(me.x - Math.sin(me.yaw) * 1.2, t, 0.02);
          v.panner.positionY.setTargetAtTime(head, t, 0.02);
          v.panner.positionZ.setTargetAtTime(me.z - Math.cos(me.yaw) * 1.2, t, 0.02);
          cutoff = 3400;
          wet = 0;
          gain = 0.9;
        } else {
          v.panner.positionX.setTargetAtTime(p.x, t, 0.05);
          v.panner.positionY.setTargetAtTime(p.y + 0.6, t, 0.05);
          v.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
          const sameRoom = !!me.room && p.room === me.room;
          if (p.talking === 2) {
            // whisper: only close people, very close in your ears
            gain = d < WHISPER_R ? 1.6 : 0;
            wet = 0;
          } else if (sameRoom) {
            gain = 1;
            // room-wide audio: everyone in the room is clear, distance matters less
            v.panner.refDistance = 4;
          } else {
            v.panner.refDistance = 1.6;
            const walls = wallsBetween(me.x, me.z, p.x, p.z);
            cutoff = walls === 0 ? 16000 : walls === 1 ? 1100 : walls === 2 ? 600 : 350;
            gain = walls === 0 ? 1 : 0.75 / walls;
          }
        }
        v.gain.gain.setTargetAtTime(gain, t, 0.12);
        v.lp.frequency.setTargetAtTime(cutoff, t, 0.18);
        v.send.gain.setTargetAtTime(wet, t, 0.2);
      });
    },
    dispose() {
      [...voices.keys()].forEach((p) => this.remove(p));
    },
  };
}

const WET: Record<Acoustic | "corridor", number> = { booth: 0.25, hall: 0.55, tunnel: 0.45, closet: 0.12, corridor: 0.4 };
export type Voices = ReturnType<typeof createVoices>;
