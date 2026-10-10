// Live voice with the strangers near you ("go live"). 18+ only, opt-in.
//   mode 0 = off (never connects, never hears anyone)
//   mode 1 = listening (hears live people near you, mic closed)
//   mode 2 = live (mic open: people within RANGE hear you)
// Peer-to-peer WebRTC audio; the offers/answers travel over the relay
// (net.ts rtc/<id>). Only people who BOTH turned voice on and stand within
// RANGE get connected, and only when at least one of them is live. Each voice
// comes from where that person stands (3D panner) and fades with distance.
// The audio never passes through any server of ours (STUN only: on some strict
// networks two people can't connect without a TURN server, which we don't run yet).
import type { Peer, Presence, RtcMsg } from "./net";

export const RANGE = 25; // metres: you hear and are heard within this
const DROP = 32; // hang up a bit further out (no flapping at the border)
const MAX_CONN = 8;
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];

type Conn = {
  id: string;
  pc: RTCPeerConnection;
  gain: GainNode;
  panner: PannerNode;
  analyser: AnalyserNode;
  el: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  started: number;
};

export type VoiceMode = 0 | 1 | 2;

export function voiceSupported() {
  return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function createVoice(presence: Presence, ctx: AudioContext, out: AudioNode, isMuted: (id: string) => boolean) {
  let mode: VoiceMode = 0;
  let mic: MediaStream | null = null;
  const conns = new Map<string, Conn>();
  const failedAt = new Map<string, number>();
  const level = new Float32Array(256);
  let myLevel: AnalyserNode | null = null;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());

  function micTrack() {
    return mode === 2 ? mic?.getAudioTracks()[0] ?? null : null;
  }

  function open(id: string): Conn {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    // the voice chain: clean band (no rumble, no hiss) → distance gain → 3D position
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 110;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = "equalpower";
    panner.distanceModel = "inverse";
    panner.refDistance = 3;
    panner.rolloffFactor = 0.8;
    panner.maxDistance = RANGE;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    hp.connect(lp).connect(gain).connect(panner).connect(out);
    lp.connect(analyser);
    const c: Conn = { id, pc, gain, panner, analyser, el: null, pendingIce: [], started: Date.now() };
    pc.onicecandidate = (e) => e.candidate && presence.rtc(id, { k: "ice", d: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome only feeds a remote WebRTC stream into Web Audio while a media
      // element is also playing it (muted: the sound goes through the panner)
      const el = new Audio();
      el.muted = true;
      el.srcObject = stream;
      void el.play().catch(() => {});
      c.el = el;
      ctx.createMediaStreamSource(stream).connect(hp);
      changed();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        failedAt.set(id, Date.now());
        close(id, false);
      }
    };
    conns.set(id, c);
    return c;
  }

  function close(id: string, tell = true) {
    const c = conns.get(id);
    if (!c) return;
    conns.delete(id);
    if (tell) presence.rtc(id, { k: "bye" });
    try {
      c.pc.close();
    } catch {
      // ignore
    }
    c.gain.disconnect();
    c.panner.disconnect();
    if (c.el) c.el.srcObject = null;
    changed();
  }

  async function call(id: string) {
    const c = open(id);
    const t = c.pc.addTransceiver("audio", { direction: "sendrecv" });
    await t.sender.replaceTrack(micTrack());
    const offer = await c.pc.createOffer();
    await c.pc.setLocalDescription(offer);
    presence.rtc(id, { k: "offer", d: c.pc.localDescription?.toJSON() });
  }

  presence.onRtc(async (from: Peer, m: RtcMsg) => {
    try {
      if (m.k === "bye") return close(from.id, false);
      if (mode === 0 || isMuted(from.id)) return;
      if (m.k === "offer") {
        close(from.id, false); // a fresh offer replaces an old connection
        const c = open(from.id);
        await c.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        const t = c.pc.getTransceivers()[0];
        if (t) {
          t.direction = "sendrecv";
          await t.sender.replaceTrack(micTrack());
        }
        const answer = await c.pc.createAnswer();
        await c.pc.setLocalDescription(answer);
        presence.rtc(from.id, { k: "answer", d: c.pc.localDescription?.toJSON() });
        for (const ice of c.pendingIce.splice(0)) await c.pc.addIceCandidate(ice);
      } else if (m.k === "answer") {
        const c = conns.get(from.id);
        if (!c || c.pc.signalingState !== "have-local-offer") return;
        await c.pc.setRemoteDescription(m.d as RTCSessionDescriptionInit);
        for (const ice of c.pendingIce.splice(0)) await c.pc.addIceCandidate(ice);
      } else if (m.k === "ice") {
        const c = conns.get(from.id);
        if (!c) return;
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(m.d as RTCIceCandidateInit);
        else c.pendingIce.push(m.d as RTCIceCandidateInit);
      }
    } catch {
      // a broken handshake: drop it, the next update tries again
      close(from.id, false);
    }
  });

  /** call every ~half second with where you stand */
  function update(px: number, pz: number) {
    if (mode === 0) return;
    const near = [...presence.peers.values()]
      .map((p) => ({ p, d: Math.hypot(p.x - px, p.z - pz) }))
      .filter(({ p }) => !isMuted(p.id))
      .sort((a, b) => a.d - b.d);
    const want = new Set<string>();
    for (const { p, d } of near) {
      if (want.size >= MAX_CONN) break;
      const both = p.voice > 0 && (mode === 2 || p.voice === 2);
      if (both && d < (conns.has(p.id) ? DROP : RANGE)) want.add(p.id);
    }
    for (const id of [...conns.keys()]) if (!want.has(id)) close(id);
    for (const id of want) {
      // the lower id calls, so two people never call each other at once
      if (conns.has(id) || presence.me > id) continue;
      if (Date.now() - (failedAt.get(id) ?? 0) < 15_000) continue;
      void call(id).catch(() => close(id, false));
    }
    // place each voice where its person stands; fade out towards the edge of range
    const now = ctx.currentTime;
    for (const c of conns.values()) {
      const p = presence.peers.get(c.id);
      if (!p) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      c.panner.positionX.setTargetAtTime(p.x, now, 0.1);
      c.panner.positionY.setTargetAtTime(1.6, now, 0.1);
      c.panner.positionZ.setTargetAtTime(p.z, now, 0.1);
      const fade = Math.max(0, Math.min(1, (RANGE + 3 - d) / 8));
      c.gain.gain.setTargetAtTime(p.voice === 2 ? 1.6 * fade : 0, now, 0.15);
    }
  }

  async function setMode(m: VoiceMode): Promise<boolean> {
    if (m === 2 && !mic) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        myLevel = ctx.createAnalyser();
        myLevel.fftSize = 256;
        ctx.createMediaStreamSource(mic).connect(myLevel); // only measured, never played back
      } catch {
        return false; // no mic or permission refused
      }
    }
    mode = m;
    if (m === 0) for (const id of [...conns.keys()]) close(id);
    // open or close the mic on every connection (no renegotiation needed)
    for (const c of conns.values()) for (const t of c.pc.getTransceivers()) void t.sender.replaceTrack(micTrack()).catch(() => {});
    if (m !== 2 && mic) {
      mic.getTracks().forEach((t) => t.stop());
      mic = null;
      myLevel = null;
    }
    changed();
    return true;
  }

  const rms = (a: AnalyserNode) => {
    a.getFloatTimeDomainData(level);
    let s = 0;
    for (let i = 0; i < level.length; i++) s += level[i] * level[i];
    return Math.sqrt(s / level.length);
  };

  return {
    mode: () => mode,
    setMode,
    update,
    /** ids of the people you're connected to by voice right now */
    connected: () => [...conns.keys()],
    /** ids of people whose voice is coming through right now */
    talking: () => [...conns.values()].filter((c) => (presence.peers.get(c.id)?.voice ?? 0) === 2 && rms(c.analyser) > 0.02).map((c) => c.id),
    /** is your own mic picking you up? */
    meTalking: () => !!myLevel && rms(myLevel) > 0.02,
    mute: (id: string) => close(id),
    onChange: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop() {
      void setMode(0);
    },
  };
}

export type Voice = ReturnType<typeof createVoice>;

const OK_KEY = "seeface-voice-18";
/** has this person confirmed they're 18+ for live voice? */
export function voiceConsented() {
  try {
    return localStorage.getItem(OK_KEY) === "1";
  } catch {
    return false;
  }
}
export function setVoiceConsent() {
  try {
    localStorage.setItem(OK_KEY, "1");
  } catch {
    // ignore
  }
}
