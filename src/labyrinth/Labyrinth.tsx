import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Howl } from "howler";
import { createWorld } from "./world";
import { createInput, type Input } from "./controls";
import { createHunter } from "./hunter";
import { createResidents } from "./residents";
import { createKeepers } from "./keepers";
import { createEdge } from "./edge";
import { createTwists, garble } from "./twists";
import { EMOTES, type Emote } from "./net";
import { demonOf, demonTexture } from "./demons";
import { createRadio } from "./radio";
import { shareCard, type RunResult } from "./card";
import { createPresence, type Presence } from "./net";
import { createOthers } from "./others";
import { createArt } from "./art";
import { createWishes, readBlood, addBlood, WISH_COST, WISH_KINDS, type WishKind } from "./wishes";
import { cleanNick, savedNick, saveNick } from "./nick";
import { apiReady, registerPlayer } from "../api";
import LabMap from "./LabMap";
import { onOnline } from "../online";
import { createProps } from "./props";
import { createRifts } from "./rifts";
import { LEVELS, levelAtX } from "./zones";
import { createSound } from "./sound";
import { currentEvent, EVENTS, type EventKind } from "./events";
import { makeSnapshot, shareSnapshot } from "./snapshot";
import { relicMesh } from "./props";

const PLACE_NAMES: Record<string, string> = {
  monogram: "the monogram halls", pools: "the pools", red: "the red corridors", neon: "the neon void",
  photo: "the photo garden", white: "the overexposed white", ash: "ash", deep: "the deep",
};
import { free, spawn, roomOf, roomCentre as roomCentreOf, CELL } from "./maze";
import { loadWeather } from "../marks/weather";
import { track } from "../analytics";
import "./Labyrinth.scss";

// /labyrinth: survive the infinite seeface1 maze.
//   your lantern dies in the dark · working lights recharge it · rooms are safe
//   spin a new room's cube → a shard + full light · 6 shards → the labyrinth shifts deeper
//   the Hollow hunts you when your light is low · the radio crackles when it's near

const EYE = 1.62;
const WALK = 5.2; // owner: twice as fast as before
const RUN = 9.0;
const SHARDS_PER_DEPTH = 6;
const GRACE = 15; // seconds before the Hollow starts moving
const BEST_KEY = "seeface-lab-best";
const STAMINA_DRAIN = 24; // per second while running
const STAMINA_REGEN = 13;
const isPhone = matchMedia("(pointer: coarse)").matches;
const PROTECTED = 120; // seconds a newcomer can't be knifed
const FOV = 72;

type Hud = { event: EventKind | null; holding: boolean; level: number; light: number; stamina: number; shards: number; depth: number; danger: number; near: boolean; online: number; met: boolean; blood: number; knife: boolean; dead: RunResult | null; killedBy: string | null; meet?: { nick: string; d: number; a: number } | null };

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

/** Every player picks a nickname before entering. */
/** A nickname is mandatory on every entry (pre-filled with the last one). */
export default function Labyrinth() {
  const [nick, setNick] = useState<string | null>(null);
  if (!nick) return <NickGate onDone={setNick} />;
  return <Game nick={nick} />;
}

function NickGate({ onDone }: { onDone: (n: string) => void }) {
  // default for newcomers: face_ + 4 random digits (e.g. face_2492)
  const [v, setV] = useState(() => savedNick() ?? `face_${Math.floor(1000 + Math.random() * 9000)}`);
  const [bad, setBad] = useState(false);
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("seeface-lab-email") ?? "";
    } catch {
      return "";
    }
  });
  const [consent, setConsent] = useState(false);
  const emailOk = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const n = cleanNick(v);
    if (!n) {
      setBad(true);
      setTimeout(() => setBad(false), 500);
      return;
    }
    if (!emailOk) {
      setBad(true);
      setTimeout(() => setBad(false), 500);
      return;
    }
    const changed = n !== savedNick();
    saveNick(n);
    const mail = email.trim();
    try {
      if (mail) localStorage.setItem("seeface-lab-email", mail);
    } catch {
      // ignore
    }
    // stored on our server (MongoDB); fire-and-forget, never blocks entry
    void registerPlayer({ nick: n, email: mail || undefined, consent: Boolean(mail) && consent, ref: new URLSearchParams(location.search).get("with") });
    track(mail ? (consent ? "email-given-consent" : "email-given") : "email-skipped");
    track(changed ? "nick-chosen" : "nick-confirmed");
    onDone(n);
  };
  return (
    <div className="lab-gate">
      <img src="/imgs/seeface-logo-transparent.png" alt="seeface1" />
      <form onSubmit={enter} className={bad ? "bad" : ""}>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="your name in the labyrinth"
          maxLength={16}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <button type="submit" disabled={v.trim().length < 2} aria-label="enter">
          ➝
        </button>
      </form>
      {apiReady && (
        <div className={"lab-gate-email" + (emailOk ? "" : " bad")}>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email (optional) · keep your ◈ and name"
            autoComplete="email"
            maxLength={120}
          />
          {email.trim() && (
            <label>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> send me news from seeface1
            </label>
          )}
        </div>
      )}
      <p>
        2–16 letters or numbers. not your real name. · <a href="/privacy">privacy</a>
      </p>
    </div>
  );
}

function Game({ nick }: { nick: string }) {
  const host = useRef<HTMLDivElement>(null);
  const wishRef = useRef<(k: WishKind | "room") => void>(() => {});
  const mapRef = useRef<{ getPos: () => { x: number; z: number; yaw: number }; presence: Presence | null; wishList: () => { kind: string; x: number; z: number }[]; edge?: () => { radius: number; centre: { x: number; z: number } } } | null>(null);
  const [wishOpen, setWishOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // meeting someone from the map: who you're walking to, and messages like "x is coming to find you"
  const meetRef = useRef<string | null>(null);
  const [meetId, setMeetId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(0);
  const say = (text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 5000);
  };
  // chat with strangers + weird interactions
  type Line = { key: number; id: string; nick: string; text: string; mine?: boolean };
  const [chat, setChat] = useState<Line[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const muted = useRef(new Set<string>());
  const lineKey = useRef(0);
  const addLine = (l: Omit<Line, "key">) => {
    const line = { ...l, key: ++lineKey.current };
    setChat((c) => [...c.slice(-4), line]);
    setTimeout(() => setChat((c) => c.filter((x) => x.key !== line.key)), 25_000);
  };
  const addLineRef = useRef(addLine);
  addLineRef.current = addLine;
  const lastHeard = useRef("");
  const sendChat = () => {
    const text = draft.trim();
    if (!text) return setChatOpen(false);
    if (presenceRef.current?.say(text)) {
      addLine({ id: "me", nick, text, mine: true });
      setDraft("");
      setChatOpen(false);
      track("chat-said");
    } else say("that can't be said here (or slow down)");
  };
  const emote = (k: Emote) => {
    presenceRef.current?.emote(k);
    say(`you ${k}`);
    track(`emote-${k}`);
  };
  const sayRef = useRef(say);
  sayRef.current = say;
  const startMeet = (id: string | null) => {
    meetRef.current = id;
    setMeetId(id);
    if (id) {
      presenceRef.current?.call(id);
      const p = presenceRef.current?.peers.get(id);
      if (p) say(`going to find ${p.nick}`);
      track("meet-start");
    }
  };
  const restartRef = useRef<() => void>(() => {});
  const inputRef = useRef<Input | null>(null);
  const presenceRef = useRef<Presence | null>(null);
  const signalRef = useRef<() => void>(() => {});
  const [invited, setInvited] = useState(false);
  const [stick, setStick] = useState({ active: false, ox: 0, oy: 0, x: 0, y: 0 });
  const snapRef = useRef<() => void>(() => {});
  const dropRef = useRef<() => void>(() => {});
  const [snapState, setSnapState] = useState<"" | "busy" | "done">("");
  const [hud, setHud] = useState<Hud>({ event: null, holding: false, level: 0, light: 100, stamina: 100, shards: 0, depth: 0, danger: 0, near: false, online: 1, met: false, blood: readBlood(), knife: false, dead: null, killedBy: null });
  const strikeRef = useRef<() => void>(() => {});
  const [shareState, setShareState] = useState<"" | "busy" | "done">("");

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // phones: lighter rendering so it stays smooth
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPhone ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    el.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
    const world = createWorld();
    const hunter = createHunter();
    const residents = createResidents();
    const keepers = createKeepers();
    const presence = createPresence();
    // also counted in the site-wide live counter (cube page)
    const stopOnline = onOnline(() => {});
    presenceRef.current = presence;
    const others = createOthers(presence);
    const wishes = createWishes(presence);
    const artLayer = createArt(wishes.roomSeed);
    wishes.onRoomChange((I, J) => artLayer.refresh(I, J));
    const props = createProps();
    const rifts = createRifts();
    world.scene.add(hunter.object, residents.group, keepers.group, others.group, artLayer.group, wishes.group, props.group, rifts.group, camera);
    const input: Input = createInput(renderer.domElement);
    inputRef.current = input;
    const radio = createRadio();
    const sound = createSound();

    // the lantern you carry
    const lantern = new THREE.SpotLight(0xffe9c4, 6, 14, 0.62, 0.55, 1.2);
    lantern.position.set(0.18, -0.15, 0);
    lantern.target.position.set(0, -0.2, -3);
    camera.add(lantern, lantern.target);

    const spinSfx = new Howl({ src: ["/sounds/ShuffleCube.mp3"], volume: 0.5, preload: true });
    const shardSfx = new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.6, preload: true });
    const shiftSfx = new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.7, preload: true });
    const caughtSfx = new Howl({ src: ["/sounds/CubeErrorCode.mp3"], volume: 0.8, preload: true });

    const signalSfx = new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.35, preload: true });
    const meetSfx = new Howl({ src: ["/sounds/MagicClick2.mp3"], volume: 0.5, preload: true });
    presence.onSignal(() => signalSfx.play());

    // Android: go fullscreen on the first touch (iOS: use "Add to Home Screen")
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Enter" || e.code === "KeyT") {
        e.preventDefault();
        setChatOpen(true);
      }
      if (e.code === "KeyF") strikeRef.current();
      if (e.code === "KeyG") dropRef.current();
      if (e.code === "KeyP") snapRef.current();
    };
    window.addEventListener("keydown", onKey);
    const wake = () => {
      radio.resume();
      sound.resume();
      if (isPhone && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      }
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);

    let thunderTimer: ReturnType<typeof setInterval> | undefined;
    loadWeather().then((w) => {
      world.setWeather(w);
      sound.setWeather(w.kind, w.intensity, w.wind);
      if (w.kind === "storm") thunderTimer = setInterval(() => !document.hidden && sound.thunder(), 6000 + Math.random() * 8000);
      track(`weather-${w.kind}`);
    });

    // ---------------------------------------------------------------- run state
    const start = spawn();
    const pos = { x: 0, z: 0 };
    let light = 100, stamina = 100, shards = 0, depth = 0, metres = 0, runTime = 0, alive = true;
    let exhausted = false;
    let hasKnife = false;
    let killedBy: string | null = null;
    // movement feel: momentum, jumping, sprint FOV, lean
    const vel = { x: 0, z: 0 };
    let vy = 0, jumpY = 0, landDip = 0, lean = 0, lastYaw = 0;
    let jumpedNow = false;
    let blood = readBlood();
    let nextBloodAt = 100; // +1 ◈ every 100 m walked
    const earn = (n: number, why: string) => {
      // secret levels pay double
      if (n > 0 && levelAtX(pos.x) > 0) n *= 2;
      blood = addBlood(n);
      track(`blood-${why}`);
    };
    let signalFlare = 0;
    let metSomeone = false;
    signalRef.current = () => {
      presence.signal();
      signalFlare = 1;
      signalSfx.play();
      track("signal");
      try {
        navigator.vibrate?.(30);
      } catch {
        // unsupported
      }
    };
    let claimed = new Set<string>();

    function newRun() {
      pos.x = start.x + 2.4;
      pos.z = start.z + 2.4;
      input.yaw = Math.PI / 4;
      input.pitch = 0;
      light = 100;
      stamina = 100;
      shards = 0;
      depth = 0;
      metres = 0;
      nextBloodAt = 100;
      runTime = 0;
      alive = true;
      hasKnife = false;
      killedBy = null;
      vel.x = vel.z = 0;
      vy = jumpY = 0;
      claimed = new Set();
      world.setDepth(0);
      hunter.reset(pos.x, pos.z);
      setHud((h) => ({ ...h, light: 100, stamina: 100, shards: 0, depth: 0, danger: 0, near: false, knife: false, dead: null, killedBy: null }));
      track("run-start");
    }

    // invited by a friend (?with=id): arrive right next to them once we hear them
    const withId = new URLSearchParams(location.search).get("with");
    if (withId) {
      track("invite-opened");
      const until = Date.now() + 15000;
      const look = setInterval(() => {
        const f = presence.peers.get(withId);
        if (f) {
          clearInterval(look);
          for (const [ox, oz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [0, 0]]) {
            if (free(f.x + ox, f.z + oz)) {
              pos.x = f.x + ox;
              pos.z = f.z + oz;
              break;
            }
          }
          input.yaw = Math.atan2(-(f.x - pos.x), -(f.z - pos.z));
          track("invite-joined");
        } else if (Date.now() > until) clearInterval(look);
      }, 400);
    }
    // shortcut: /labyrinth?level=1|2|3 starts straight inside a secret level
    const startLevel = Number(new URLSearchParams(location.search).get("level"));
    const enterStartLevel = () => {
      if (startLevel >= 1 && startLevel <= 3) {
        const to = rifts.arrival(startLevel);
        pos.x = to.x;
        pos.z = to.z;
        hunter.reset(pos.x, pos.z);
        track(`secret-level-${startLevel}-link`);
      }
    };
    restartRef.current = () => {
      setShareState("");
      newRun();
      enterStartLevel();
    };
    newRun();
    enterStartLevel();

    function die() {
      alive = false;
      caughtSfx.play();
      radio.set(0);
      try {
        navigator.vibrate?.([300, 80, 300]);
      } catch {
        // unsupported
      }
      const best = metres > readBest();
      if (best) {
        try {
          localStorage.setItem(BEST_KEY, String(Math.round(metres)));
        } catch {
          // ignore
        }
      }
      const bucket = metres < 50 ? "0-50" : metres < 150 ? "50-150" : metres < 400 ? "150-400" : metres < 1000 ? "400-1000" : "1000+";
      track(`caught-${bucket}m`);
      const result: RunResult = { metres, shards, depth, seconds: runTime, best };
      const by = killedBy;
      setTimeout(() => setHud((h) => ({ ...h, dead: result, danger: 0, killedBy: by })), 900);
    }

    // ---------------------------------------------------------------- relics in your hand
    let held: { colour: number; shape: number } | null = null;
    let heldObj: THREE.Object3D | null = null;
    const dropped = new THREE.Group();
    world.scene.add(dropped);
    function hold(colour: number, shape: number) {
      held = { colour, shape };
      heldObj = relicMesh(colour, shape);
      heldObj.position.set(0.32, -0.28, -0.65);
      heldObj.scale.setScalar(0.8);
      camera.add(heldObj);
    }
    dropRef.current = () => {
      if (!held || !heldObj) return;
      camera.remove(heldObj);
      const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
      const o = relicMesh(held.colour, held.shape);
      o.position.set(pos.x + fx * 1.1, 0.25, pos.z + fz * 1.1);
      dropped.add(o);
      held = null;
      heldObj = null;
      track("relic-dropped");
    };

    // ---------------------------------------------------------------- snapshot
    let snapRequested = false;
    snapRef.current = () => {
      snapRequested = true;
    };

    // ---------------------------------------------------------------- world events (same for everyone)
    let eventKind: EventKind | null = null;
    let eventTimer = 0;
    let goldTimer = 0;
    const rainGroup = new THREE.Group();
    world.scene.add(rainGroup);
    const rainCards: THREE.Sprite[] = [];
    const eventOverlay = document.createElement("div");
    eventOverlay.className = "lab-event-fx";
    el.appendChild(eventOverlay);
    function startEvent(k: EventKind) {
      track(`event-${k}`);
      sound.chime();
      eventOverlay.dataset.kind = k;
      if (k === "choir") sound.choir(true);
      if (k === "photo-rain") {
        const loader = new THREE.TextureLoader();
        for (let n = 0; n < 36; n++) {
          const tex = loader.load(`https://picsum.photos/seed/seeface1-rain-${n % 12}/256?grayscale`);
          tex.colorSpace = THREE.SRGBColorSpace;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9 }));
          sp.scale.set(0.5, 0.5, 1);
          sp.position.set(pos.x + (Math.random() - 0.5) * 16, Math.random() * 3.4, pos.z + (Math.random() - 0.5) * 16);
          sp.userData.v = 0.4 + Math.random() * 0.8;
          rainGroup.add(sp);
          rainCards.push(sp);
        }
      }
    }
    function endEvent(k: EventKind) {
      delete eventOverlay.dataset.kind;
      if (k === "choir") sound.choir(false);
      rainCards.splice(0).forEach((c) => rainGroup.remove(c));
    }

    strikeRef.current = () => {
      if (!alive || !hasKnife) return;
      hasKnife = false; // one knife, one strike
      const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
      let target: string | null = null;
      for (const p of presence.peers.values()) {
        const dx = p.x - pos.x, dz = p.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && (dx * fx + dz * fz) / d > 0.4) target = p.id;
      }
      caughtSfx.play();
      track(target ? "knife-strike" : "knife-miss");
      if (target) presence.strike(target);
      try {
        navigator.vibrate?.(60);
      } catch {
        // unsupported
      }
    };
    presence.onStruck((from) => {
      // my own client decides: close enough, not in a sanctuary, not a newcomer
      const close = Math.hypot(from.x - pos.x, from.z - pos.z) < 2.6;
      const safe = roomOf(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL)) !== null;
      if (!alive || !close || safe || runTime < PROTECTED) return;
      const lost = Math.min(20, Math.floor(blood / 2));
      blood = addBlood(-lost);
      presence.confirmKill(from.id, lost);
      killedBy = from.nick;
      track("knifed");
      die();
    });
    presence.onKillConfirmed((amount) => {
      earn(Math.max(3, amount), "kill");
      shardSfx.play();
    });

    wishRef.current = (k) => {
      if (blood < WISH_COST) return;
      if (k === "room") {
        const r = roomOf(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL));
        // nearest room: the one you stand in, else the region's room
        const I = r ? r.I : Math.floor(pos.x / CELL / 7), J = r ? r.J : Math.floor(pos.z / CELL / 7);
        wishes.changeRoom(I, J);
      } else {
        // place it a step in front of you
        const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
        const x = free(pos.x + fx * 1.4, pos.z + fz * 1.4) ? pos.x + fx * 1.4 : pos.x;
        const z = free(pos.x + fx * 1.4, pos.z + fz * 1.4) ? pos.z + fz * 1.4 : pos.z;
        wishes.make(k, x, z);
      }
      blood = addBlood(-WISH_COST);
      shiftSfx.play();
      track(`wish-${k}`);
      try {
        navigator.vibrate?.([40, 30, 120]);
      } catch {
        // unsupported
      }
    };
    mapRef.current = {
      getPos: () => ({ x: pos.x, z: pos.z, yaw: input.yaw }),
      presence,
      wishList: () => wishes.list(),
      edge: () => edge.state(pos.x),
    };

    // dev-only handle for debugging in the browser console
    if (import.meta.env.DEV)
      (window as unknown as { __lab: unknown }).__lab = {
        pos,
        input,
        camera,
        world,
        hunter,
        state: () => ({ light, shards, depth, metres, alive, runTime }),
        setLight: (v: number) => (light = v),
        skipGrace: () => (runTime = GRACE + 1),
        // for recording trailers (dev only): local-only peers never reach the relay
        presence,
        keepers,
        sound,
        renderer,
        rifts,
        earn,
        radio,
      };

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let bob = 0, nextStep = 0, walkedSfx = 0, hudTimer = 0;
    let raf = 0;
    let lastDanger = 0;
    let wasNear = false;

    // direction + distance to the person you're walking to (a = angle on screen, 0 = straight ahead)
    const meetInfo = () => {
      const p = meetRef.current ? presence.peers.get(meetRef.current) : null;
      if (!p) return null;
      const a = -(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)) - input.yaw);
      return { nick: p.nick, d: Math.round(Math.hypot(p.x - pos.x, p.z - pos.z)), a: Math.atan2(Math.sin(a), Math.cos(a)) };
    };
    // someone picked you on their map
    presence.onCalled((from) => {
      sayRef.current(`${from.nick} is coming to find you`);
      sound.chime();
      if (!meetRef.current) {
        meetRef.current = from.id; // meet them halfway
        setMeetId(from.id);
      }
      track("meet-called");
    });

    // what strangers say: clear up close, breaking up with distance, nothing past 80 m
    presence.onSay((from, text) => {
      if (muted.current.has(from.id)) return;
      const d = Math.hypot(from.x - pos.x, from.z - pos.z);
      if (d > 80) return;
      const heard = garble(text, Math.max(0, Math.min(0.8, (d - 30) / 50)));
      others.say(from.id, heard);
      addLineRef.current({ id: from.id, nick: from.nick, text: heard });
      lastHeard.current = text;
    });
    presence.onEmote((from, kind) => {
      if (muted.current.has(from.id)) return;
      others.emote(from.id, kind);
      const d = Math.hypot(from.x - pos.x, from.z - pos.z);
      if (kind === "scream" && d < 14) {
        sound.thunder();
        el.classList.remove("scream");
        void el.offsetWidth;
        el.classList.add("scream");
      }
      if (d < 20) sayRef.current(`${from.nick} ${kind === "stare" ? "stares at you" : kind === "spin" ? "spins" : kind === "melt" ? "melts into the floor" : kind === "float" ? "floats" : "screams"}`);
    });

    // the edge: the labyrinth is as big as the crowd inside
    const edge = createEdge();
    let edgeFog = 0, edgeWarned = false;
    // twists: unpredictable things that happen to you
    const twists = createTwists();
    const doppel = new THREE.Sprite(new THREE.SpriteMaterial({ map: demonTexture(demonOf(presence.me)), transparent: true, depthWrite: false, opacity: 0 }));
    doppel.scale.set(0.9, 2.8, 1);
    doppel.center.set(0.5, 0);
    doppel.visible = false;
    world.scene.add(doppel);
    let doppelT = -1, mirrorT = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      if (alive) {
        runTime += dt;

        // ---------------- move (slide along walls)
        const wantsRun = input.run && (input.move.x !== 0 || input.move.z !== 0);
        if (stamina < 3) exhausted = true;
        if (exhausted && stamina > 30) exhausted = false;
        const running = wantsRun && !exhausted;
        stamina = running ? Math.max(0, stamina - STAMINA_DRAIN * dt) : Math.min(100, stamina + STAMINA_REGEN * dt);
        const top = running ? RUN : WALK;
        const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
        const rx = Math.cos(input.yaw), rz = -Math.sin(input.yaw);
        const tx = (fx * input.move.z + rx * input.move.x) * top;
        const tz = (fz * input.move.z + rz * input.move.x) * top;
        // momentum: speed up quickly, glide a little when you let go
        const accel = input.move.x || input.move.z ? 9 : 5;
        vel.x += (tx - vel.x) * Math.min(1, dt * accel);
        vel.z += (tz - vel.z) * Math.min(1, dt * accel);
        const dx = vel.x * dt, dz = vel.z * dt;
        const ox = pos.x, oz = pos.z;
        if (free(pos.x + dx, pos.z)) pos.x += dx;
        else vel.x *= -0.2; // bump off walls
        if (free(pos.x, pos.z + dz)) pos.z += dz;
        else vel.z *= -0.2;
        const moved = Math.hypot(pos.x - ox, pos.z - oz);

        // jump
        if (input.consumeJump() && jumpY <= 0.001) {
          vy = eventKind === "inversion" ? 7.5 : 4.2;
          jumpedNow = true;
          track("jump");
        }
        if (jumpY > 0 || vy > 0) {
          vy -= (eventKind === "inversion" ? 6 : 13) * dt;
          jumpY = Math.max(0, jumpY + vy * dt);
          if (jumpY === 0) {
            if (vy < -3) {
              landDip = 0.12;
              sound.step(world.zone().kind, running);
            }
            vy = 0;
          }
        }
        landDip = Math.max(0, landDip - dt * 0.6);

        // pickups: money (◈), knives, relics (carry one at a time)
        for (const pk of props.pickupsNear(pos.x, pos.z, 1.0)) {
          if (pk.kind === "relic" && held) continue;
          props.take(pk);
          if (pk.kind === "relic") {
            hold(pk.colour!, pk.shape!);
            sound.chime();
            track("relic-picked");
          } else if (pk.kind === "money") {
            earn(1, "money");
            spinSfx.play();
          } else if (!hasKnife) {
            hasKnife = true;
            track("knife-found");
            shardSfx.play();
          }
          try {
            navigator.vibrate?.(25);
          } catch {
            // unsupported
          }
        }
        if (moved > 0) {
          metres += moved;
          if (metres > nextBloodAt) {
            nextBloodAt += 100;
            earn(1, "walk");
          }
          bob += moved * (running ? 1.5 : 1.8);
          walkedSfx += moved;
          if (walkedSfx > nextStep) {
            sound.step(world.zone().kind, running);
            nextStep = walkedSfx + (running ? 2.0 : 1.5);
          }
        }

        // ---------------- light: dies in the dark, lives under working lights and in rooms
        const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL);
        const room = roomOf(ci, cj);
        if (room) light = Math.min(100, light + 25 * dt);
        else if (world.isLit(pos.x, pos.z) || wishes.lanternNear(pos.x, pos.z)) light = Math.min(100, light + 14 * dt);
        else light = Math.max(0, light - (2.2 + depth * 0.3 + (running ? 0.8 : 0)) * dt);

        // lantern follows the light level, and stutters when it's nearly gone
        const lvl = light / 100;
        const stutter = light < 20 && Math.random() < 0.08 ? 0.15 : 1;
        signalFlare = Math.max(0, signalFlare - dt * 0.9);
        lantern.intensity = 7 * Math.pow(lvl, 0.7) * stutter + signalFlare * 18;
        lantern.distance = 5 + 10 * lvl;

        // ---------------- the Hollow
        const h = runTime > GRACE ? hunter.update(dt, t, { px: pos.x, pz: pos.z, light, depth: depth + (levelAtX(pos.x) > 0 ? 3 : 0), isLit: world.isLit }) : { dist: 99, hunting: false };
        const danger = Math.max(0, 1 - h.dist / (CELL * 5)) * (h.hunting ? 1 : 0.45);
        radio.set(Math.max(danger, edgeFog * 0.7));
        lastDanger = danger;
        if (h.dist < 1.0 && !room) die();
      }

      const speedNow = Math.hypot(vel.x, vel.z);
      const bobAmp = 0.025 + (speedNow / RUN) * 0.045;
      camera.position.set(
        pos.x,
        EYE + jumpY - landDip + Math.sin(bob) * bobAmp + (lastDanger > 0.6 ? (Math.random() - 0.5) * 0.02 * lastDanger : 0),
        pos.z
      );
      // lean into turns and strafes
      const turn = (input.yaw - lastYaw) / Math.max(dt, 0.001);
      lastYaw = input.yaw;
      const strafe = vel.x * Math.cos(input.yaw) - vel.z * Math.sin(input.yaw);
      lean += (-strafe * 0.012 - Math.max(-2, Math.min(2, turn)) * 0.015 - lean) * Math.min(1, dt * 6);
      camera.rotation.set(input.pitch, input.yaw, lean, "YXZ");
      // field of view opens up when you sprint
      const fovTarget = FOV + (speedNow / RUN) * 10;
      if (Math.abs(camera.fov - fovTarget) > 0.05) {
        camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 5);
        camera.updateProjectionMatrix();
      }

      world.update(pos.x, pos.z, t, dt);
      residents.update(dt, t, { px: pos.x, pz: pos.z, light });
      artLayer.update(pos.x, pos.z, dt);
      props.update(pos.x, pos.z, t);

      // rifts: step into one and fall into a secret level (or back up)
      const pulled = alive ? rifts.update(pos.x, pos.z, t, dt) : null;
      if (pulled !== null) {
        const to = rifts.arrival(pulled);
        pos.x = to.x;
        pos.z = to.z;
        vel.x = vel.z = 0;
        input.yaw = Math.PI / 4;
        hunter.reset(pos.x, pos.z);
        shiftSfx.play();
        track(pulled > 0 ? `secret-level-${pulled}` : "secret-level-exit");
        el.classList.remove("rift");
        void el.offsetWidth;
        el.classList.add("rift");
        el.style.setProperty("--rift", `#${LEVELS[pulled].colour.toString(16).padStart(6, "0")}`);
        try {
          navigator.vibrate?.([80, 40, 80, 40, 200]);
        } catch {
          // unsupported
        }
      }
      // each location has its own exposure (the white is blinding)
      renderer.toneMappingExposure += (world.zone().exposure - renderer.toneMappingExposure) * Math.min(1, dt * 1.5);

      // other wanderers
      presence.send({ x: pos.x, z: pos.z, yaw: input.yaw, light, nick, held: held ? held.colour : 0 });
      wishes.update(pos.x, pos.z, dt);
      const meet = others.update(dt, t, pos.x, pos.z);
      if (meet.nearest < 4 && !metSomeone) {
        metSomeone = true;
        meetSfx.play();
        earn(2, "meet");
        track("met-someone");
        try {
          navigator.vibrate?.([30, 60, 30]);
        } catch {
          // unsupported
        }
      }
      if (meet.nearest > 10) metSomeone = false;

      // walking to someone you picked on the map
      const mt = meetRef.current ? presence.peers.get(meetRef.current) : null;
      if (meetRef.current && !mt) {
        meetRef.current = null;
        setMeetId(null);
        sayRef.current("they left the labyrinth");
      }
      if (mt && Math.hypot(mt.x - pos.x, mt.z - pos.z) < 3) {
        meetRef.current = null;
        setMeetId(null);
        sayRef.current(`you found ${mt.nick}`);
        sound.chime();
        track("meet-found");
      }

      // the edge of the labyrinth
      const eg = edge.update(pos.x, pos.z, presence.online(), dt);
      edgeFog = eg.fog;
      world.setEdgeFog(eg.fog);
      if (eg.grew) sayRef.current(`the labyrinth grew · ${presence.online()} inside`);
      if (eg.nearEdge && !edgeWarned) {
        edgeWarned = true;
        sayRef.current("the labyrinth ends here for now · it grows when more people come in");
        track("edge-reached");
      }
      if (!eg.nearEdge && edgeFog === 0) edgeWarned = false;
      if (eg.throwBack && alive) {
        pos.x = eg.throwBack.x;
        pos.z = eg.throwBack.z;
        vel.x = vel.z = 0;
        hunter.reset(pos.x, pos.z);
        el.classList.remove("rift");
        void el.offsetWidth;
        el.classList.add("rift");
        el.style.setProperty("--rift", "#ffffff");
        sayRef.current("the static threw you back");
        track("edge-thrown");
      }

      // twists
      const tw = twists.update(dt, alive && runTime > 30);
      if (tw === "blackout") {
        light = Math.min(light, 15);
        sayRef.current("the lights died");
      }
      if (tw === "doppel") {
        doppelT = 0;
        doppel.position.set(pos.x - Math.sin(input.yaw) * 7, 0, pos.z - Math.cos(input.yaw) * 7);
        doppel.visible = true;
      }
      if (tw === "moved") {
        const I = Math.floor(pos.x / CELL / 7) + (Math.random() < 0.5 ? -1 : 1), J = Math.floor(pos.z / CELL / 7) + (Math.random() < 0.5 ? -1 : 1);
        const c = roomCentreOf(I, J);
        pos.x = c.x;
        pos.z = c.z;
        hunter.reset(pos.x, pos.z);
        el.classList.remove("rift");
        void el.offsetWidth;
        el.classList.add("rift");
        el.style.setProperty("--rift", "#c8b8ff");
        sayRef.current("the labyrinth moved you");
      }
      if (tw === "mirror") {
        mirrorT = 7;
        renderer.domElement.style.transform = "scaleX(-1)";
        sayRef.current("everything is backwards");
      }
      if (tw === "money") {
        for (let k = 0; k < 3; k++) {
          const gx = pos.x - Math.sin(input.yaw) * (1.5 + k), gz = pos.z - Math.cos(input.yaw) * (1.5 + k);
          if (free(gx, gz)) props.spawnMoney(gx, gz);
        }
        sayRef.current("someone's lost ◈ fell at your feet");
      }
      if (tw === "echo") sayRef.current(lastHeard.current ? `an echo: "${garble(lastHeard.current, 0.3)}"` : "someone whispered your name");
      if (tw) track(`twist-${tw}`);
      if (mirrorT > 0) {
        mirrorT -= dt;
        if (mirrorT <= 0) renderer.domElement.style.transform = "";
      }
      if (doppelT >= 0) {
        // you, walking towards yourself, gone before it reaches you
        doppelT += dt;
        const dx = pos.x - doppel.position.x, dz = pos.z - doppel.position.z;
        const dd = Math.hypot(dx, dz);
        doppel.position.x += (dx / dd) * dt * 1.2;
        doppel.position.z += (dz / dd) * dt * 1.2;
        (doppel.material as THREE.SpriteMaterial).opacity = Math.min(0.8, doppelT) * (dd < 3 || doppelT > 6 ? 0 : 1);
        if (dd < 3 || doppelT > 6) {
          if (doppelT > 0.5) sayRef.current("you saw yourself");
          doppel.visible = false;
          doppelT = -1;
        }
      }

      // keepers: characters with personalities who keep a lonely player company
      const kAct = alive
        ? keepers.update(dt, t, {
            px: pos.x, pz: pos.z, yaw: input.yaw, light, nick, holding: !!held, jumped: jumpedNow, realNearest: meet.nearest,
            place: levelAtX(pos.x) > 0 ? LEVELS[levelAtX(pos.x)].name : PLACE_NAMES[world.zone().kind] ?? "the labyrinth",
            rift: rifts.nearest(pos.x, pos.z),
          })
        : null;
      jumpedNow = false;
      if (kAct) {
        if (kAct.light) light = Math.min(100, light + kAct.light);
        if (kAct.takeRelic && held && heldObj) {
          camera.remove(heldObj);
          held = null;
          heldObj = null;
        }
        if (kAct.earn) earn(kAct.earn, kAct.why ?? "keeper");
        sound.chime();
        track(kAct.why ?? "keeper");
      }

      // ---------------- cubes: spin a new room's cube → shard + full light
      const c = world.nearestCube(pos.x, pos.z);
      const isNear = !!c && c.dist < CELL * 0.75 && alive;
      if (input.consumeTap() && c && isNear) {
        world.spinCube(c.mesh);
        spinSfx.play();
        light = 100;
        const roomKey = c.mesh.userData.key as string;
        if (!claimed.has(roomKey)) {
          claimed.add(roomKey);
          shards += 1;
          earn(1, "shard");
          shardSfx.play();
          track(`shard-${Math.min(shards, 60)}`);
          try {
            navigator.vibrate?.([20, 40, 80]);
          } catch {
            // unsupported
          }
          if (shards % SHARDS_PER_DEPTH === 0) {
            depth += 1;
            earn(3, "depth");
            world.setDepth(depth);
            shiftSfx.play();
            track(`depth-${Math.min(depth, 20)}`);
            el.classList.remove("shift");
            void el.offsetWidth;
            el.classList.add("shift");
          }
        }
      }

      setStick((s) => (s.active === input.joystick.active && s.x === input.joystick.x && s.y === input.joystick.y ? s : { ...input.joystick }));
      hudTimer -= dt;
      if (hudTimer <= 0 || isNear !== wasNear) {
        hudTimer = 0.1;
        wasNear = isNear;
        setHud((prev) =>
          prev.dead
            ? { ...prev, online: presence.online() }
            : { event: eventKind, holding: !!held, level: levelAtX(pos.x), light, stamina, shards, depth, danger: lastDanger, near: isNear, online: presence.online(), met: metSomeone, blood, knife: hasKnife, dead: null, killedBy: null, meet: meetInfo() }
        );
      }

      // world events: checked twice a second, same moment for everyone
      eventTimer -= dt;
      if (eventTimer <= 0) {
        eventTimer = 0.5;
        const ev = currentEvent();
        const k = ev?.kind ?? null;
        if (k !== eventKind) {
          if (eventKind) endEvent(eventKind);
          eventKind = k;
          if (k) startEvent(k);
        }
      }
      if (eventKind === "photo-rain")
        for (const c of rainCards) {
          c.position.y -= c.userData.v * dt;
          c.material.rotation += dt * 0.5;
          if (c.position.y < 0) {
            c.position.set(pos.x + (Math.random() - 0.5) * 16, 3.4, pos.z + (Math.random() - 0.5) * 16);
          }
        }
      if (eventKind === "gold-hour" && alive) {
        goldTimer -= dt;
        if (goldTimer <= 0) {
          goldTimer = 1.2;
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
          const gx = pos.x + Math.cos(a) * r, gz = pos.z + Math.sin(a) * r;
          if (free(gx, gz)) props.spawnMoney(gx, gz);
        }
      }
      if (eventKind === "eclipse") renderer.toneMappingExposure *= 0.97;
      if (heldObj) heldObj.rotation.y += dt * 1.5;

      renderer.render(world.scene, camera);

      // snapshot: grab the frame right after it's drawn
      if (snapRequested) {
        snapRequested = false;
        const lvl = levelAtX(pos.x);
        const place = lvl > 0 ? LEVELS[lvl].name : PLACE_NAMES[world.zone().kind] ?? "the labyrinth";
        const inviteUrl = `${location.origin}/labyrinth?with=${presence.me}`;
        setSnapState("busy");
        makeSnapshot(renderer.domElement, { nick, place, event: eventKind ? EVENTS[eventKind].name : null, inviteUrl })
          .then((b) => {
            if (import.meta.env.DEV) (window as unknown as { __lastSnap: Blob }).__lastSnap = b; // for testing
            return shareSnapshot(b, inviteUrl);
          })
          .then((how) => {
            track(`snapshot-${how}${eventKind ? "-event" : ""}`);
            setSnapState("done");
            setTimeout(() => setSnapState(""), 2500);
          });
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("keydown", onKey);
      presence.close();
      clearInterval(thunderTimer);
      stopOnline();
      renderer.dispose();
      el.innerHTML = "";
    };
  }, []);

  const share = async () => {
    if (!hud.dead || shareState === "busy") return;
    setShareState("busy");
    const how = await shareCard(hud.dead);
    track(`share-card-${how}`);
    setShareState("done");
  };

  const invite = async () => {
    const id = presenceRef.current?.me;
    if (!id) return;
    const url = `${location.origin}/labyrinth?with=${id}`;
    track("invite-sent");
    try {
      if (navigator.share) {
        await navigator.share({ title: "seeface1", text: "meet me in the labyrinth", url });
        setInvited(true);
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setInvited(true);
    } catch {
      // ignore
    }
  };

  const hold = (on: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.runHeld = on;
  };

  const ring = 2 * Math.PI * 22;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <div className="labyrinth" ref={host} />

      {/* danger: the edges close in, colder and redder */}
      <div className="lab-vignette" style={{ opacity: hud.danger }} />

      {stick.active && (
        <div className="lab-stick" style={{ left: stick.ox, top: stick.oy }}>
          <span style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
        </div>
      )}
      <div className={"lab-reticle" + (hud.near ? " near" : "")} />

      {/* HUD: glyphs only. Light ring, shards, depth marks */}
      <div className="lab-hud">
        <svg className={"lab-light" + (hud.light < 25 ? " low" : "")} viewBox="0 0 54 54" aria-label="light">
          <circle cx="27" cy="27" r="22" className="track" />
          <circle cx="27" cy="27" r="22" className="fill" strokeDasharray={`${(hud.light / 100) * ring} ${ring}`} />
          <text x="27" y="31">✶</text>
        </svg>
        <div className="lab-stamina" style={{ width: `${hud.stamina * 0.42}px` }} />
        <div className="lab-blood">◈ {hud.blood}</div>
        <div className="lab-shards">
          <span className="glyph">◆</span>
          {hud.shards}
        </div>
        {hud.level > 0 && <div className="lab-level">{["", "I", "II", "III"][hud.level]}</div>}
        <div className="lab-depth">
          {Array.from({ length: hud.depth + 1 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>

      {hud.event && (
        <div className="lab-event">
          <span className="g">{EVENTS[hud.event].glyph}</span> {EVENTS[hud.event].name}
        </div>
      )}

      {/* souls inside right now (you + everyone else) */}
      <div className={"lab-online" + (hud.met ? " met" : "")}>
        <span className="dot" />
        {hud.online}
      </div>

      {/* thumb controls (phones) + signal / invite (everyone) */}
      <div className="lab-actions" onPointerDown={stop} onPointerUp={stop}>
        <button className="lab-btn invite" onClick={invite} aria-label="invite a friend">
          {invited ? "✓" : "⊕"}
        </button>
        {hud.knife && (
          <button className="lab-btn knife" onClick={() => strikeRef.current()} aria-label="strike">
            †
          </button>
        )}
        {isPhone && (
          <button
            className="lab-btn jump"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (inputRef.current) inputRef.current.jumpPressed = true;
            }}
            aria-label="jump"
          >
            ⤒
          </button>
        )}
        <button
          className={"lab-btn snap" + (hud.event ? " event" : "")}
          onClick={() => snapRef.current()}
          aria-label="snapshot"
          disabled={snapState === "busy"}
        >
          {snapState === "done" ? "✓" : "⊡"}
        </button>
        {hud.holding && (
          <button className="lab-btn drop" onClick={() => dropRef.current()} aria-label="drop the relic">
            ⤓
          </button>
        )}
        <button className="lab-btn map" onClick={() => setMapOpen(true)} aria-label="map">
          ◎
        </button>
        {hud.blood >= WISH_COST && (
          <button className="lab-btn wish" onClick={() => setWishOpen(true)} aria-label="make a wish">
            ✦
          </button>
        )}
        <button className="lab-btn signal" onClick={() => signalRef.current()} aria-label="signal">
          ✺
        </button>
        {isPhone && (
          <button
            className={"lab-btn run" + (hud.stamina < 30 ? " tired" : "")}
            onPointerDown={hold(true)}
            onPointerUp={hold(false)}
            onPointerCancel={hold(false)}
            onPointerLeave={hold(false)}
            aria-label="run"
            style={{ "--stamina": `${hud.stamina}%` } as React.CSSProperties}
          >
            ➶
          </button>
        )}
      </div>

      {wishOpen && (
        <div className="lab-wish" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-wish-title">◈ {hud.blood} · a wish costs {WISH_COST}</div>
          <div className="lab-wish-grid">
            {WISH_KINDS.map((w) => (
              <button
                key={w.kind}
                onClick={() => {
                  wishRef.current(w.kind);
                  setWishOpen(false);
                }}
              >
                <span className="g">{w.glyph}</span>
                <span className="l">{w.label}</span>
              </button>
            ))}
          </div>
          <button className="lab-wish-close" onClick={() => setWishOpen(false)} aria-label="close">
            ×
          </button>
        </div>
      )}

      {hud.meet && (
        <div className="lab-meet" onPointerDown={stop} onPointerUp={stop}>
          <span className="arrow" style={{ transform: `rotate(${hud.meet.a}rad)` }}>
            ↑
          </span>
          <span className="who">
            {hud.meet.nick} · {hud.meet.d} m
          </span>
          <button onClick={() => startMeet(null)} aria-label="stop">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="lab-notice" key={notice}>
          {notice}
        </div>
      )}

      {/* chat with strangers: what people near you said */}
      <div className="lab-chat" onPointerDown={stop} onPointerUp={stop}>
        {chat.map((l) => (
          <button
            key={l.key}
            className={"lab-chat-line" + (l.mine ? " mine" : "")}
            title={l.mine ? "" : "tap to mute"}
            onClick={() => {
              if (l.mine) return;
              muted.current.add(l.id);
              setChat((c) => c.filter((x) => x.id !== l.id));
              say(`${l.nick} muted`);
              track("chat-mute");
            }}
          >
            <b>{l.nick}</b> {l.text}
          </button>
        ))}
        {chatOpen ? (
          <form
            className="lab-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              sendChat();
            }}
          >
            <input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setChatOpen(false)} placeholder="say something to whoever is near…" />
            <div className="lab-emotes">
              {EMOTES.map((k) => (
                <button type="button" key={k} onClick={() => emote(k)}>
                  {k}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <button className="lab-chat-open" onClick={() => setChatOpen(true)} aria-label="talk">
            talk…
          </button>
        )}
      </div>

      {mapOpen && mapRef.current && <LabMap source={mapRef.current} nick={nick} onClose={() => setMapOpen(false)} onMeet={startMeet} target={meetId} />}

      {hud.dead && (
        <div className="lab-dead" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-dead-eyes">
            <span />
            <span />
          </div>
          {hud.killedBy && <div className="lab-dead-by">† {hud.killedBy}</div>}
          <div className="lab-dead-metres">{Math.round(hud.dead.metres)} m</div>
          <div className="lab-dead-sub">
            ◆ {hud.dead.shards} · {"|".repeat(hud.dead.depth + 1)}
            {hud.dead.best && <span className="lab-best"> ✶</span>}
          </div>
          <div className="lab-dead-actions">
            <button onClick={() => restartRef.current()} aria-label="again">
              ↻
            </button>
            <button onClick={share} aria-label="share" disabled={shareState === "busy"}>
              {shareState === "done" ? "✓" : "⇪"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
