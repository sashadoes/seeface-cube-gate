// Voice: talk with your own voice to the people around you.
//   - in a room or a place (a square), you join its wave: you hear everyone in
//     it all the time; they hear you only once you tap "talk" (the mic is off
//     until then, and turns itself off when you leave the square)
//   - in the corridors, meeting someone (within ~9 m) works the same way
//   - listening vents: some rooms have a brass grille in the corridor, on the
//     outside of one of their walls. Stand at it and you hear that room,
//     muffled, without being in it. You can't talk from there, and the people
//     inside always see that someone is listening (never who).
// Audio goes straight between devices (WebRTC). The relay only carries the
// handshake, encrypted per pair (ECDH + AES-GCM), so a stranger reading the
// public relay can't see anyone's network address. A link only opens when one
// of the two has their mic on, so nobody connects to anyone just by walking by.
import * as THREE from "three";
import { CELL, placeAt, placeOf, rnd, roomOf, roomOrigin, wallEast, wallSouth } from "./maze";
import type { Peer, Presence } from "./net";

const ROOM = 3, REGION = 7;
const NEAR_ON = 9, NEAR_OFF = 13; // corridors: meet someone → you can talk
const EAR_R = 1.2; // how close to a vent you need to stand
const EAR_CHARGE = 1.5; // seconds at the vent before the room fades in
const MAX_LINKS = 8;
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];

export type Vent = { room: string; x: number; z: number; /** where the grille hangs */ gx: number; gz: number; ry: number };

/** the listening vent of the room in region (I, J): against one of its real outer walls, away from the doors (not every room has one) */
const ventCache = new Map<string, Vent | null>();
export function ventOf(I: number, J: number): Vent | null {
  const key = `${I}_${J}`;
  let v = ventCache.get(key);
  if (v === undefined) {
    if (ventCache.size > 4000) ventCache.clear();
    ventCache.set(key, (v = findVent(I, J)));
  }
  return v;
}
function findVent(I: number, J: number): Vent | null {
  if (placeAt(I, J)) return null;
  const o = roomOrigin(I, J);
  const cand: (() => Vent | null)[] = [];
  for (const k of [0, 2]) {
    const zc = (o.j + k + 0.5) * CELL, xc = (o.i + k + 0.5) * CELL;
    // west, east, north, south walls of the room (k = 1 is the door)
    cand.push(() => (wallEast(o.i - 1, o.j + k) ? { room: `r${I}_${J}`, x: o.i * CELL - 0.75, z: zc, gx: o.i * CELL - 0.16, gz: zc, ry: -Math.PI / 2 } : null));
    cand.push(() => (wallEast(o.i + ROOM - 1, o.j + k) ? { room: `r${I}_${J}`, x: (o.i + ROOM) * CELL + 0.75, z: zc, gx: (o.i + ROOM) * CELL + 0.16, gz: zc, ry: Math.PI / 2 } : null));
    cand.push(() => (wallSouth(o.i + k, o.j - 1) ? { room: `r${I}_${J}`, x: xc, z: o.j * CELL - 0.75, gx: xc, gz: o.j * CELL - 0.16, ry: Math.PI } : null));
    cand.push(() => (wallSouth(o.i + k, o.j + ROOM - 1) ? { room: `r${I}_${J}`, x: xc, z: (o.j + ROOM) * CELL + 0.75, gx: xc, gz: (o.j + ROOM) * CELL + 0.16, ry: 0 } : null));
  }
  // about two rooms in three have a vent; which wall is the same for everyone
  if (rnd(I, J, 171) > 0.68) return null;
  const start = Math.floor(rnd(I, J, 172) * cand.length);
  for (let n = 0; n < cand.length; n++) {
    const v = cand[(start + n) % cand.length]();
    if (v) return v;
  }
  return null;
}

/** the square (room or place) at (x, z): its wave */
export function squareAt(x: number, z: number): string | null {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  const r = roomOf(i, j);
  if (r) return `r${r.I}_${r.J}`;
  const p = placeOf(i, j);
  if (p) return `p${p.I}_${p.J}`;
  return null;
}

/** the vent you're standing at, if any */
export function ventAt(x: number, z: number): Vent | null {
  const I = Math.floor(x / CELL / REGION), J = Math.floor(z / CELL / REGION);
  for (let a = I - 1; a <= I + 1; a++)
    for (let b = J - 1; b <= J + 1; b++) {
      const v = ventOf(a, b);
      if (v && Math.hypot(v.x - x, v.z - z) < EAR_R) return v;
    }
  return null;
}

type Spot = { sq: string | null; vent: Vent | null; x: number; z: number };
const spotOf = (x: number, z: number): Spot => {
  const sq = squareAt(x, z);
  return { sq, vent: sq ? null : ventAt(x, z), x, z };
};

/** can a and b hear each other? "both" = a wave or a corridor meeting; "a-ear"/"b-ear" = that one listens through a vent */
function pair(a: Spot, b: Spot, linked: boolean): "both" | "a-ear" | "b-ear" | null {
  if (a.sq && a.sq === b.sq) return "both";
  if (a.vent && a.vent.room === b.sq) return "a-ear";
  if (b.vent && b.vent.room === a.sq) return "b-ear";
  if (!a.sq && !b.sq && !a.vent && !b.vent && Math.hypot(a.x - b.x, a.z - b.z) < (linked ? NEAR_OFF : NEAR_ON)) return "both";
  return null;
}

export type VoicePerson = { id: string; nick: string; speaking: boolean; mic: boolean };
export type VoiceView = {
  /** where your voice reaches: a room/place wave, someone near you, a vent, or nobody */
  where: "square" | "near" | "vent" | "none";
  mic: boolean;
  speaking: boolean;
  /** the people you're connected with (never the ones listening through a vent) */
  people: VoicePerson[];
  /** people near you who could talk (in your wave) but aren't connected yet */
  around: number;
  /** how many listen to your room through a vent */
  ears: number;
  /** 0–1 while you settle in at a vent */
  vent: number;
};

type Link = {
  id: string;
  pc: RTCPeerConnection | null;
  key: CryptoKey | null;
  myPub: boolean; // sent my key
  initiator: boolean;
  role: "both" | "me-ear" | "they-ear";
  chain: Promise<void>; // handshake messages are handled one at a time, in order
  ice: RTCIceCandidateInit[];
  audio?: HTMLAudioElement;
  nodes?: { src: MediaStreamAudioSourceNode; lp: BiquadFilterNode; an: AnalyserNode; gain: GainNode; panner: PannerNode };
  speaking: boolean;
  wantSince: number;
  unwantSince: number;
  connected: boolean;
};

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type Voice = ReturnType<typeof createVoice>;

export function createVoice(presence: Presence, ctx: AudioContext, opts: { isMuted: (id: string) => boolean; onChange: (v: VoiceView) => void }) {
  const supported = typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!crypto?.subtle;
  // people's voices go straight to the speakers, never into recordings (video invites tap the game's master bus)
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const links = new Map<string, Link>();
  const cooldown = new Map<string, number>(); // after a hang-up, wait before reconnecting
  let mic: MediaStream | null = null;
  let micOn = false;
  let micAsk = false;
  let me: Spot = { sq: null, vent: null, x: 0, z: 0 };
  let ventT = 0;
  let lastView = "";
  let meSpeaking = false;
  const myAn = ctx.createAnalyser();
  myAn.fftSize = 512;
  let mySrc: MediaStreamAudioSourceNode | null = null;
  const buf = new Float32Array(512);

  // my key for the handshakes (new every visit)
  const keys = supported ? crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]) : null;
  const myPubRaw = keys ? keys.then((k) => crypto.subtle.exportKey("raw", k.publicKey)).then(b64) : null;

  async function send(l: Link, msg: Record<string, unknown>) {
    if (!l.key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, l.key, new TextEncoder().encode(JSON.stringify(msg)));
    presence.direct(l.id, { t: "x", iv: b64(iv.buffer), c: b64(c) });
  }
  async function sayHello(l: Link) {
    if (!myPubRaw || l.myPub) return;
    l.myPub = true;
    presence.direct(l.id, { t: "hi", k: await myPubRaw });
  }

  function newLink(id: string, role: Link["role"]): Link {
    const l: Link = { id, pc: null, key: null, myPub: false, initiator: presence.me < id, role, chain: Promise.resolve(), ice: [], speaking: false, wantSince: 0, unwantSince: 0, connected: false };
    links.set(id, l);
    void sayHello(l);
    return l;
  }

  function sending(l: Link) {
    return micOn && !!mic && l.role !== "me-ear";
  }
  function applyTrack(l: Link) {
    const tx = l.pc?.getTransceivers()[0];
    if (!tx || tx.currentDirection === "stopped") return;
    void tx.sender.replaceTrack(sending(l) ? mic!.getAudioTracks()[0] ?? null : null).catch(() => {});
  }

  function makePc(l: Link) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    l.pc = pc;
    pc.onicecandidate = (e) => e.candidate && void send(l, { k: "ice", c: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      l.connected = pc.connectionState === "connected";
      if (pc.connectionState === "failed") hangUp(l.id, true);
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome only feeds a remote stream into Web Audio while a media element plays it
      const a = new Audio();
      a.srcObject = stream;
      a.muted = true;
      void a.play().catch(() => {});
      l.audio = a;
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 140;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7000;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = new PannerNode(ctx, { panningModel: "equalpower", distanceModel: "inverse", refDistance: 2.5, rolloffFactor: 0.8, maxDistance: 40 });
      src.connect(hp).connect(lp).connect(an);
      lp.connect(gain).connect(panner).connect(out);
      l.nodes?.src.disconnect();
      l.nodes = { src, lp, an, gain, panner };
    };
    return pc;
  }

  async function startCall(l: Link) {
    if (l.pc || !l.key || !l.initiator) return;
    const pc = makePc(l);
    pc.addTransceiver("audio", { direction: "sendrecv" });
    applyTrack(l);
    await pc.setLocalDescription(await pc.createOffer());
    await send(l, { k: "sdp", d: pc.localDescription!.toJSON(), r: l.role === "me-ear" ? "ear" : "" });
  }

  async function handle(l: Link, m: Record<string, unknown>) {
    if (m.k === "sdp" && m.d && typeof m.d === "object") {
      const d = m.d as RTCSessionDescriptionInit;
      if (d.type === "offer") {
        if (l.pc) l.pc.close();
        const pc = makePc(l);
        await pc.setRemoteDescription(d);
        const tx = pc.getTransceivers()[0];
        if (tx) tx.direction = "sendrecv";
        applyTrack(l);
        await pc.setLocalDescription(await pc.createAnswer());
        await send(l, { k: "sdp", d: pc.localDescription!.toJSON() });
      } else if (d.type === "answer" && l.pc && l.pc.signalingState === "have-local-offer") {
        await l.pc.setRemoteDescription(d);
      }
      for (const c of l.ice.splice(0)) await l.pc?.addIceCandidate(c).catch(() => {});
    }
    if (m.k === "ice" && m.c && typeof m.c === "object") {
      if (l.pc?.remoteDescription) await l.pc.addIceCandidate(m.c as RTCIceCandidateInit).catch(() => {});
      else if (l.ice.length < 40) l.ice.push(m.c as RTCIceCandidateInit);
    }
  }

  presence.onDirect(async (from: Peer, d) => {
    if (!supported || !keys) return;
    if (d.t === "bye") {
      if (links.has(from.id)) hangUp(from.id, false);
      return;
    }
    // only people who could really hear you (the same rules, a little looser)
    const r = pair(me, spotOf(from.x, from.z), true);
    if (!r || opts.isMuted(from.id)) return;
    let l = links.get(from.id);
    if (!l) {
      if (links.size >= MAX_LINKS) return;
      l = newLink(from.id, r === "a-ear" ? "me-ear" : r === "b-ear" ? "they-ear" : "both");
    }
    const link = l;
    link.chain = link.chain.then(() => receive(link, d)).catch(() => {});
  });

  async function receive(l: Link, d: Record<string, unknown>) {
    if (links.get(l.id) !== l || !keys) return; // hung up meanwhile
    if (d.t === "hi" && typeof d.k === "string" && d.k.length < 200 && !l.key) {
      const pub = await crypto.subtle.importKey("raw", unb64(d.k), { name: "ECDH", namedCurve: "P-256" }, false, []);
      l.key = await crypto.subtle.deriveKey({ name: "ECDH", public: pub }, (await keys).privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await sayHello(l);
      if (l.initiator) await startCall(l).catch(() => hangUp(l.id, true));
      return;
    }
    if (d.t === "x" && typeof d.iv === "string" && typeof d.c === "string" && l.key) {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(d.iv) }, l.key, unb64(d.c));
      const m = JSON.parse(new TextDecoder().decode(plain));
      if (m && typeof m === "object") await handle(l, m);
    }
  }

  function hangUp(id: string, tell: boolean) {
    const l = links.get(id);
    if (!l) return;
    links.delete(id);
    cooldown.set(id, performance.now() + 3000);
    l.pc?.close();
    l.nodes?.src.disconnect();
    l.nodes?.panner.disconnect();
    if (l.audio) l.audio.srcObject = null;
    if (tell) presence.direct(id, { t: "bye" });
  }

  function setMicOn(on: boolean) {
    micOn = on;
    if (!on && mic) {
      // really let go of the microphone (the browser's mic light goes off)
      mic.getTracks().forEach((t) => t.stop());
      mic = null;
      mySrc?.disconnect();
      mySrc = null;
    }
    links.forEach(applyTrack);
    emit(true);
  }

  function level(an: AnalyserNode) {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let k = 0; k < buf.length; k++) s += buf[k] * buf[k];
    return Math.sqrt(s / buf.length);
  }

  function view(): VoiceView {
    const people: VoicePerson[] = [];
    let ears = 0;
    for (const l of links.values()) {
      if (l.role === "they-ear") {
        if (l.connected) ears++;
        continue;
      }
      const p = presence.peers.get(l.id);
      if (p && l.connected) people.push({ id: l.id, nick: p.nick, speaking: l.speaking, mic: p.mic });
    }
    let around = 0;
    for (const p of presence.peers.values()) {
      const r = pair(me, spotOf(p.x, p.z), false);
      if (r === "both" && !links.has(p.id) && !opts.isMuted(p.id)) around++;
    }
    const where = me.sq ? "square" : me.vent ? "vent" : people.length || around ? "near" : "none";
    return { where, mic: micOn, speaking: meSpeaking, people, around, ears, vent: me.vent ? Math.min(1, ventT / EAR_CHARGE) : 0 };
  }
  function emit(force = false) {
    const v = view();
    const sig = JSON.stringify(v);
    if (!force && sig === lastView) return;
    lastView = sig;
    opts.onChange(v);
  }

  let tick = 0;
  return {
    supported,
    /** where you stand (every frame); listener position is set by the game */
    update(x: number, z: number, dt: number) {
      if (!supported) return;
      const before = me;
      me = spotOf(x, z);
      // leaving your square / the person you met: the mic switches itself off
      if (micOn && (before.sq !== me.sq || (!!before.vent !== !!me.vent))) setMicOn(false);
      ventT = me.vent ? ventT + dt : 0;

      const now = performance.now();
      // who should be linked: people in your wave/meeting, when one of you has the mic on
      const want = new Map<string, Link["role"]>();
      const cands: [Peer, number][] = [];
      for (const p of presence.peers.values()) {
        if (opts.isMuted(p.id) || (cooldown.get(p.id) ?? 0) > now) continue;
        const r = pair(me, spotOf(p.x, p.z), links.has(p.id));
        if (!r) continue;
        const someoneTalks = r === "a-ear" ? p.mic : r === "b-ear" ? micOn : micOn || p.mic;
        if (!someoneTalks && !links.get(p.id)?.connected) continue;
        cands.push([p, Math.hypot(p.x - x, p.z - z)]);
        want.set(p.id, r === "a-ear" ? "me-ear" : r === "b-ear" ? "they-ear" : "both");
      }
      cands.sort((a, b) => a[1] - b[1]);
      const keep = new Set(cands.slice(0, MAX_LINKS).map(([p]) => p.id));
      for (const [id, role] of want) {
        if (!keep.has(id)) continue;
        let l = links.get(id);
        if (!l) l = newLink(id, role);
        else if (l.role !== role) {
          l.role = role;
          applyTrack(l);
        }
        l.unwantSince = 0;
      }
      // hang up a little after it stops making sense (people step in and out of doorways)
      for (const l of [...links.values()]) {
        if (keep.has(l.id) && presence.peers.has(l.id)) continue;
        if (!l.unwantSince) l.unwantSince = now;
        else if (now - l.unwantSince > (presence.peers.has(l.id) ? 2500 : 0)) hangUp(l.id, true);
      }

      // place each voice where its speaker stands; through a vent it's muffled and comes from the wall
      for (const l of links.values()) {
        const n = l.nodes;
        const p = presence.peers.get(l.id);
        if (!n || !p) continue;
        const t = ctx.currentTime;
        const ear = l.role === "me-ear";
        const vx = ear && me.vent ? me.vent.gx : p.x, vz = ear && me.vent ? me.vent.gz : p.z;
        if (n.panner.positionX) {
          n.panner.positionX.setTargetAtTime(vx, t, 0.1);
          n.panner.positionY.setTargetAtTime(1.6, t, 0.1);
          n.panner.positionZ.setTargetAtTime(vz, t, 0.1);
        } else n.panner.setPosition(vx, 1.6, vz);
        n.lp.frequency.setTargetAtTime(ear ? 1100 : 7000, t, 0.2);
        const g = l.role === "they-ear" ? 0 : ear ? 1.6 * Math.min(1, ventT / EAR_CHARGE) : 1;
        n.gain.gain.setTargetAtTime(opts.isMuted(l.id) ? 0 : g, t, 0.15);
      }

      tick -= dt;
      if (tick <= 0) {
        tick = 0.12;
        for (const l of links.values()) l.speaking = !!l.nodes && l.role !== "they-ear" && level(l.nodes.an) > 0.012;
        meSpeaking = micOn && !!mySrc && level(myAn) > 0.015;
        emit();
      }
    },
    /** turn the mic on: "ok", "denied" (blocked by the browser) or "unsupported" */
    async talk(): Promise<"ok" | "denied" | "unsupported" | "nobody"> {
      if (!supported) return "unsupported";
      if (me.vent) return "nobody"; // you can't talk through a vent
      if (micAsk) return "ok";
      micAsk = true;
      try {
        if (!mic) {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          mySrc = ctx.createMediaStreamSource(mic);
          mySrc.connect(myAn);
        }
        void ctx.resume();
        setMicOn(true);
        return "ok";
      } catch {
        return "denied";
      } finally {
        micAsk = false;
      }
    },
    mute: () => setMicOn(false),
    /** 0–1 while you settle in at a vent */
    charge: () => (me.vent ? Math.min(1, ventT / EAR_CHARGE) : 0),
    mic: () => micOn,
    /** the vents near you, for drawing the grilles */
    ventsNear(x: number, z: number) {
      const I = Math.floor(x / CELL / REGION), J = Math.floor(z / CELL / REGION);
      const vs: Vent[] = [];
      for (let a = I - 2; a <= I + 2; a++) for (let b = J - 2; b <= J + 2; b++) {
        const v = ventOf(a, b);
        if (v) vs.push(v);
      }
      return vs;
    },
    /** someone was muted in the game: drop their voice at once */
    drop(id: string) {
      hangUp(id, true);
    },
    setVolume(v: number) {
      out.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
    close() {
      for (const id of [...links.keys()]) hangUp(id, true);
      setMicOn(false);
      out.disconnect();
    },
  };
}

/** brass grilles on the walls where the vents are (a small pool, moved as you walk) */
export function createVents() {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0.85 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x050403 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const make = () => {
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), dark);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.03), brass);
    frame.position.z = -0.012;
    g.add(frame, back);
    back.position.z = 0.004;
    for (let k = 0; k < 6; k++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.022, 0.03), brass);
      slat.position.set(0, -0.17 + k * 0.068, 0.016);
      slat.rotation.x = -0.5;
      g.add(slat);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), glowMat.clone());
    glow.position.z = 0.03;
    g.add(glow);
    g.userData.glow = glow;
    g.position.y = 0.55; // low on the wall: you lean in to listen
    g.visible = false;
    group.add(g);
    return g;
  };
  const pool = Array.from({ length: 6 }, make);
  let lastCell = "";
  return {
    group,
    update(x: number, z: number, vents: () => Vent[], charge: number, t: number) {
      const cell = `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
      if (cell !== lastCell) {
        lastCell = cell;
        const vs = vents()
          .map((v) => [v, Math.hypot(v.x - x, v.z - z)] as const)
          .sort((a, b) => a[1] - b[1])
          .slice(0, pool.length);
        pool.forEach((g, k) => {
          const v = vs[k]?.[0];
          g.visible = !!v;
          if (!v) return;
          g.position.set(v.gx, 0.55, v.gz);
          g.rotation.y = v.ry;
          g.userData.vent = v;
        });
      }
      // the grille breathes faintly, and glows when you're listening at it
      for (const g of pool) {
        if (!g.visible) continue;
        const v = g.userData.vent as Vent;
        const d = Math.hypot(v.x - x, v.z - z);
        const m = (g.userData.glow as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = (d < EAR_R ? 0.25 + 0.35 * charge : 0.05 + 0.04 * Math.sin(t * 1.3)) * (d < 12 ? 1 : 0);
      }
    },
  };
}
