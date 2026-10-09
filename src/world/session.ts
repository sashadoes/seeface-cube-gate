// Ties the pieces together: world server ⇄ game ⇄ voice ⇄ spatial audio ⇄ UI state.
import { useSyncExternalStore } from "react";
import type { AgeState, RoomSummary, Role, ServerMsg } from "../../shared/world/protocol.ts";
import { roomById } from "../../shared/world/rooms.ts";
import type { Game } from "./engine/game.ts";
import type { BlobKind } from "./avatar/blob.ts";
import { connectWorld, worldUrl, type WorldNet } from "./net/client.ts";
import { createMeshVoice, type VoiceAdapter } from "./voice/mesh.ts";
import { createVoices, type Voices } from "./audio/voices.ts";
import { createOthers, type Others } from "./scene/others.ts";
import { createSoundscape } from "./audio/soundscape.ts";
import { createStt } from "./voice/stt.ts";
import { getAudio } from "./audio/engine.ts";
import { funnel } from "./analytics.ts";
import { flag } from "./flags.ts";

export type UiState = {
  connected: boolean;
  me: string | null;
  name: string;
  blob: string;
  age: AgeState;
  ageMock: boolean;
  coins: number;
  coinDelta: { n: number; reason: string; at: number } | null;
  room: string | null;
  rooms: RoomSummary[];
  canSpeak: boolean;
  stage: boolean;
  role: Role;
  live: false | "talk" | "whisper";
  locked: boolean;
  hand: boolean;
  card: string | null;
  notice: { text: string; at: number } | null;
  host: { room: string; text: string; at: number } | null;
  mutes: string[];
  follows: string[];
  transcribe: boolean;
  quests: { sayHi: boolean; spinRadio: boolean };
  reactions: { emoji: string; at: number; id: number }[];
  heardVoice: boolean;
  roomAudio: boolean;
};

function createStore<T extends object>(init: T) {
  let state = init;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      subs.forEach((s) => s());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // private mode
  }
};

export const ui = createStore<UiState>({
  connected: false,
  me: null,
  name: read("sf1w.name", ""),
  blob: read("sf1w.blobKind", "moth"),
  age: "unverified",
  ageMock: false,
  coins: 0,
  coinDelta: null,
  room: null,
  rooms: [],
  canSpeak: false,
  stage: false,
  role: "member",
  live: false,
  locked: false,
  hand: false,
  card: null,
  notice: null,
  host: null,
  mutes: [],
  follows: [],
  transcribe: read("sf1w.transcribe", false),
  quests: read("sf1w.quests", { sayHi: false, spinRadio: false }),
  reactions: [],
  heardVoice: false,
  roomAudio: true,
});
export const useUi = <K extends keyof UiState>(k: K) => useSyncExternalStore(ui.subscribe, () => ui.get()[k]);

export type Session = ReturnType<typeof startSession>;
let reactionId = 0;

export function startSession(game: Game) {
  const net: WorldNet = connectWorld(() => ({ name: ui.get().name || "", blob: ui.get().blob }));
  const voices: Voices = createVoices();
  const others: Others = createOthers(game.scene, { color: game.lab.fog.color, density: game.lab.fog.density, cam: game.camera.position });
  const scape = createSoundscape();
  let voice: VoiceAdapter | null = null;
  let ice: RTCIceServer[] = [];
  let previewPeers: string[] = [];
  let firstVoiceAt = 0;
  const notice = (text: string) => ui.set({ notice: { text, at: Date.now() } });

  // my own voice level (for my ring)
  // live captions (only with Transcribe me on, only while live; text only)
  const stt = createStt("mock", (text, final) => net.send({ t: "caption", text, final }));
  let micAnalyser: AnalyserNode | null = null;
  const micData = new Uint8Array(new ArrayBuffer(256));
  let myLevel = 0;

  const ensureVoice = () => {
    if (voice || !flag("voice")) return voice;
    voice = createMeshVoice(net, () => ice);
    voice.onVoice((v) => voices.add(v.peer, v.stream));
    voice.onVoiceGone((p) => voices.remove(p));
    return voice;
  };

  net.onState((s) => ui.set({ connected: s === "open" }));
  net.on("welcome", (m) => {
    ice = m.ice;
    ui.set({ me: m.id, age: m.age, ageMock: !!m.flags.ageMock, coins: m.coins, name: m.name, mutes: m.mutes, follows: m.follows });
    m.mutes.forEach((p) => voices.setMuted(p, true));
    write("sf1w.name", m.name);
    if (ui.get().transcribe) net.send({ t: "transcribe", on: true });
    if (m.age === "verified") ensureVoice();
  });
  net.on("age", (m) => {
    ui.set({ age: m.state });
    if (m.state === "verified") ensureVoice();
    if (m.url) location.assign(m.url);
  });
  net.on("peers", (m) => others.update(m.peers, m.gone));
  net.on("rooms", (m) => {
    ui.set({ rooms: m.rooms });
    for (const r of m.rooms) game.lab.setRoomStatus(r.id, { people: r.people, speaking: r.speaking, transcribed: r.transcribed, variant: r.variant });
    scape.setCrowd(m.rooms);
  });
  net.on("links", (m) => {
    ui.set({ room: m.room, canSpeak: m.canSpeak, stage: m.stage, role: m.role });
    if (!m.canSpeak && ui.get().live) talk(false);
    ensureVoice()?.setLinks(m.links);
    previewPeers = m.links.filter((l) => l.hearThem && !l.theyHearMe && l.kind === "room").map((l) => l.peer);
    voices.setPreview(previewPeers);
  });
  net.on("coins", (m) => ui.set({ coins: m.balance, coinDelta: { n: m.delta, reason: m.reason, at: Date.now() } }));
  net.on("notice", (m) => notice(m.text));
  net.on("host", (m) => ui.set({ host: { room: m.room, text: m.text, at: Date.now() } }));
  net.on("react", (m) => {
    const r = [...ui.get().reactions.filter((x) => Date.now() - x.at < 3000), { emoji: m.emoji, at: Date.now(), id: ++reactionId }];
    ui.set({ reactions: r });
    scape.reaction(m.emoji);
  });
  net.on("kicked", (m) => {
    notice(`you were asked to leave ${roomById(m.room)?.name ?? "the room"}`);
    game.fallTo("first-words");
  });
  net.on("fallTo", (m: Extract<ServerMsg, { t: "fallTo" }>) => {
    if (m.ok) game.fallTo(m.room);
    else notice(m.reason ?? "can't go there");
  });

  // positions at 8 Hz, audio + avatars every frame
  let sendAcc = 0, lastT = 0, lastTalkSent = 0;
  game.on("frame", (t) => {
    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    sendAcc += dt;
    const p = game.position();
    if (sendAcc >= 0.125) {
      sendAcc = 0;
      net.send({ t: "pos", x: p.x, y: p.y, z: p.z, f: p.facing, falling: game.falling() });
    }
    const st = ui.get();
    // keep the server's "live" state fresh while the mic is open (it drops stale talk after 15 s)
    if (st.live && performance.now() - lastTalkSent > 5000) {
      lastTalkSent = performance.now();
      net.send({ t: "talk", on: true, whisper: st.live === "whisper" });
    }
    others.animate(t, dt, (id) => voices.level(id), game.body, { muted: new Set(st.mutes), follows: new Set(st.follows) }, () => getAudio().sfx2.boop());
    const myRoom = st.room;
    voices.update({ x: p.x, y: Math.max(0, p.y), z: p.z, yaw: game.input.look.yaw, room: myRoom, acoustic: myRoom ? roomById(myRoom)?.acoustic ?? null : null }, others.poses());
    const act = voices.activity();
    getAudio().setVoiceActivity(act);
    scape.update(dt, p, game.falling(), act, Math.hypot(game.body.vx, game.body.vz));

    // the first real human voice you hear (time-to-first-voice)
    if (!firstVoiceAt && act > 0.06) {
      firstVoiceAt = performance.now();
      performance.mark("world-first-voice");
      funnel("heard_voice");
      net.send({ t: "heard" });
      ui.set({ heardVoice: true });
    }
    // my ring follows my real mic level while live
    if (micAnalyser && st.live) {
      micAnalyser.getByteTimeDomainData(micData);
      let peak = 0;
      for (let k = 0; k < micData.length; k += 4) peak = Math.max(peak, Math.abs(micData[k] - 128));
      myLevel += (Math.min(1, peak / 50) - myLevel) * 0.35;
    } else myLevel *= 0.85;
    game.me.setSpeaking(st.live ? Math.max(0.15, myLevel) : 0);
  });

  async function talk(on: boolean, whisper = false) {
    const st = ui.get();
    if (on && st.age !== "verified") return notice("voice opens after the 18+ check (in 👤)");
    if (on && !st.canSpeak) {
      if (st.stage) return notice("big room: raise your hand ✋ and the host brings you up");
      return notice("you can't talk here right now");
    }
    const v = ensureVoice();
    if (!v) return;
    if (on) await getAudio().resume();
    const ok = await v.setMic(on);
    if (on && !ok) return notice("the microphone is blocked. allow it in your browser to talk.");
    if (on && !micAnalyser && v.micStream()) {
      const a = getAudio();
      micAnalyser = a.ctx.createAnalyser();
      micAnalyser.fftSize = 512;
      a.ctx.createMediaStreamSource(v.micStream()!).connect(micAnalyser);
    }
    net.send({ t: "talk", on, whisper });
    lastTalkSent = performance.now();
    ui.set({ live: on ? (whisper ? "whisper" : "talk") : false, ...(on ? {} : { locked: false }) });
    if (on && st.transcribe && v.micStream()) stt.start(v.micStream()!);
    if (!on) stt.stop();
    if (on) {
      funnel("spoke");
      if (!ui.get().quests.sayHi && st.room) setTimeout(() => sayHiCheck(), 2500);
    }
  }
  function sayHiCheck() {
    if (ui.get().quests.sayHi) return;
    net.send({ t: "quest", id: "say-hi" });
  }
  net.on("coins", (m) => {
    const q = ui.get().quests;
    if (m.reason === "say-hi" && !q.sayHi) setQuests({ ...q, sayHi: true });
    if (m.reason === "spin-radio" && !q.spinRadio) setQuests({ ...q, spinRadio: true });
  });
  const setQuests = (q: UiState["quests"]) => {
    write("sf1w.quests", q);
    ui.set({ quests: q });
  };

  return {
    net,
    voices,
    others,
    talk,
    setLocked: (locked: boolean) => ui.set({ locked }),
    bubble(text: string) {
      net.send({ t: "bubble", text });
      if (ui.get().room) setTimeout(sayHiCheck, 400);
    },
    react: (emoji: string) => net.send({ t: "react", emoji }),
    hand(up: boolean) {
      net.send({ t: "hand", up });
      ui.set({ hand: up });
    },
    promote: (who: string, speaker: boolean) => net.send({ t: "promote", who, speaker }),
    follow(who: string) {
      const on = !ui.get().follows.includes(who);
      net.send({ t: "follow", who, on });
      ui.set({ follows: on ? [...ui.get().follows, who] : ui.get().follows.filter((x) => x !== who) });
      if (on) funnel("followed_someone");
    },
    mute(who: string) {
      const on = !ui.get().mutes.includes(who);
      net.send({ t: "mute", who, on });
      voices.setMuted(who, on);
      ui.set({ mutes: on ? [...ui.get().mutes, who] : ui.get().mutes.filter((x) => x !== who) });
    },
    block(who: string) {
      net.send({ t: "block", who });
      voices.setMuted(who, true);
      notice("blocked. you won't hear each other again.");
    },
    report: (who: string, reason: string) => net.send({ t: "report", who, reason }),
    kick: (who: string) => net.send({ t: "kick", who }),
    transcribe(on: boolean) {
      write("sf1w.transcribe", on);
      ui.set({ transcribe: on });
      net.send({ t: "transcribe", on });
    },
    ageMock: () => net.send({ t: "age", action: "mock" }),
    forget() {
      net.send({ t: "forget" });
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("sf1w.")) localStorage.removeItem(k);
      } catch {
        // nothing stored
      }
      setTimeout(() => location.reload(), 600);
    },
    /** the busiest live room (real counts only); quiet → First Words, where the AI host is */
    busiest() {
      const rs = ui.get().rooms.filter((r) => r.public);
      const best = [...rs].sort((a, b) => b.speaking.length - a.speaking.length || b.people - a.people)[0];
      return best && best.people > 0 ? best.id : "first-words";
    },
    ageStart: () => net.send({ t: "age", action: "start" }),
    profile(name: string, blob: string) {
      write("sf1w.name", name);
      write("sf1w.blobKind", blob);
      ui.set({ name, blob });
      game.setBlob(blob as BlobKind);
      net.send({ t: "profile", name, blob });
    },
    jumpTo: (room: string) => net.send({ t: "fallTo", room }),
    preview(room: string | null) {
      net.send({ t: "preview", room });
      // previews are heard even with the room radio off
      if (room) getAudio().voices.gain.setTargetAtTime(1, getAudio().ctx.currentTime, 0.05);
      else getAudio().voices.gain.setTargetAtTime(ui.get().roomAudio ? 1 : 0, getAudio().ctx.currentTime, 0.1);
    },
    /** radio off = mute the room's audio but stay */
    setRoomAudio(on: boolean) {
      ui.set({ roomAudio: on });
      getAudio().voices.gain.setTargetAtTime(on ? 1 : 0, getAudio().ctx.currentTime, 0.1);
    },
    spinQuest: () => !ui.get().quests.spinRadio && net.send({ t: "quest", id: "spin-radio" }),
    pick: (ndc: { x: number; y: number }) => others.pick(ndc, game.camera),
    firstVoiceAt: () => firstVoiceAt,
    /** HTTP calls to the world server, signed with our session token */
    async api<T>(path: string, body?: unknown): Promise<T | null> {
      try {
        const base = worldUrl().replace(/^ws/, "http");
        const token = localStorage.getItem("sf1w.token") ?? "";
        const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return r.ok ? ((await r.json()) as T) : null;
      } catch {
        return null;
      }
    },
    dispose() {
      voice?.dispose();
      voices.dispose();
      scape.dispose();
      net.close();
    },
  };
}
