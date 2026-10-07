import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Howl } from "howler";
import { createWorld } from "./world";
import { createInput, type Input } from "./controls";
import { createHunter } from "./hunter";
import { createResidents } from "./residents";
import { createKeepers } from "./keepers";
import { createPopQueen } from "./popqueen";
import { createEdge } from "./edge";
import { createTwists, garble } from "./twists";
import { ALL_DONE_BONUS, createQuests, type QuestKind, type QuestView } from "./quests";
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
import { noteLevel, noteRun, readProgress } from "../progress";
import { accountsReady, currentAccount, deleteAccount, finishInstagram, instagramReady, instagramUrl, login, logout, refresh, register, type Account, type AuthError } from "../account";
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
import { free, spawn, roomOf, safeSpot as roomCentreOf, CELL, inShip, placeCentre } from "./maze";
import type { WeatherKind } from "../marks/weather";
import { skyAt, SKY_NOTICE } from "./sky";
import { createFlood } from "./flood";
import { createHazards } from "./hazards";
import { createAi, type AiResidents } from "./ai";
import { createPosts, shrink, wallAhead, type Post } from "./posts";
import { createShip } from "./ship";
import { createNotes, type Note } from "./notes";
import { createFx } from "./fx";
import { myVibe, trackVibe } from "./vibes";
import { createMarket, type Listing } from "./market";
import { createPlaces, PLACE_NAMES as PLACE_TITLES, setChampions, setStalls } from "./places";
import { createChampions, playerId } from "./champions";
import { createGramophones } from "./gramophone";
import { EFFECTS, RECORDS, type FxId, type RecordId } from "./music";
import { STATIONS, createStations } from "./stations";
import { createAfterlife, ORDER_COST } from "./afterlife";
import { CLIP_SECONDS, clipSupported, createClipper, shareClip } from "./clip";
import { clearResume, markEntered, readResume, saveResume } from "./resume";
import { DEFAULTS, hasSavedSettings, onSettings, setSettings, settings, type Settings } from "./settings";
import { createPerf, detectTier } from "./perf";
import { ITEMS, addItem, onBag, randomItem, readBag, type ItemId } from "./inventory";
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
  // coming back? say so, and say where they'll continue
  const [back] = useState(() => (new URLSearchParams(location.search).get("with") ? null : readResume()));
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
  // optional account: save progress + play on any device
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [igOn, setIgOn] = useState(false);
  useEffect(() => {
    void instagramReady().then(setIgOn);
    // coming back from instagram
    const q = new URLSearchParams(location.search).get("ig");
    if (q === "ok") void finishInstagram().then((a) => a && (setAccount(a), saveNick(a.nick), track("account-instagram")));
    else if (q && q !== "off") setAuthErr(q === "cancelled" ? "instagram sign-in cancelled" : "instagram sign-in didn't work · try again");
  }, []);
  const [mode, setMode] = useState<"" | "save" | "delete">("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const progress = account?.progress ?? readProgress();
  useEffect(() => {
    // another device may have played since: pull the account's progress
    if (currentAccount()) void refresh().then((a) => {
      setAccount(a);
      if (a) setV(a.nick);
    });
  }, []);
  useEffect(() => {
    if (account) setV(account.nick);
  }, [account]);
  const ERR: Record<AuthError, string> = {
    taken: "that name is taken · log in, or pick another name",
    wrong: "wrong name or password",
    password: "password: at least 6 characters",
    nick: "name: 2–16 letters or numbers",
    email: "that email doesn't look right",
    offline: "can't reach the labyrinth's memory right now · try again",
    slow: "too many tries · wait a few minutes",
  };
  const auth = async (kind: "register" | "login") => {
    const n = cleanNick(v);
    if (!n) return setAuthErr(ERR.nick);
    if (password.length < 6) return setAuthErr(ERR.password);
    setBusy(true);
    setAuthErr("");
    const mail = email.trim();
    const r = kind === "register" ? await register(n, password, mail || undefined, Boolean(mail) && consent) : await login(n, password);
    setBusy(false);
    if ("error" in r) return setAuthErr(ERR[r.error]);
    setPassword("");
    setMode("");
    setAccount(r.account);
    saveNick(r.account.nick);
    track(kind === "register" ? "account-registered" : "account-login");
  };
  const emailOk = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const n = account ? account.nick : cleanNick(v);
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
      {back && savedNick() && (
        <div className="lab-gate-back">
          welcome back. you were in {back.place}, {back.metres} m in.
        </div>
      )}
      <form onSubmit={enter} className={bad ? "bad" : ""}>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          readOnly={!!account}
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
      {/* progress, and the optional account that saves it */}
      <div className="lab-gate-progress">
        ◈ {progress.blood} · best {progress.best} m{progress.levels.length ? ` · levels ${progress.levels.map((l) => ["", "I", "II", "III"][l]).join(" ")}` : ""}
        {accountsReady &&
          (account ? (
            <>
              {" "}
              · <span className="saved">✓ saved to {account.nick}{account.instagram ? " · instagram" : ""}</span> ·{" "}
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => setAccount(null));
                  track("account-logout");
                }}
              >
                log out
              </button>{" "}
              ·{" "}
              <button type="button" onClick={() => setMode(mode === "delete" ? "" : "delete")}>
                delete
              </button>
            </>
          ) : (
            <>
              {" "}
              · only on this device ·{" "}
              <button type="button" onClick={() => setMode(mode ? "" : "save")}>
                {mode ? "close" : "save it / log in"}
              </button>
            </>
          ))}
      </div>
      {accountsReady && !account && mode === "save" && (
        <div className="lab-gate-account">
          {igOn && (
            <>
              <a className="lab-ig" href={instagramUrl()}>
                <span className="glyph">⬚</span> continue with instagram
              </a>
              <div className="lab-or">or a password</div>
            </>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password (6+ characters)"
            autoComplete="current-password"
            maxLength={200}
            onKeyDown={(e) => e.key === "Enter" && void auth("register")}
          />
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void auth("register")}>
              register “{cleanNick(v) ?? v}”
            </button>
            <button type="button" disabled={busy} onClick={() => void auth("login")}>
              log in
            </button>
          </div>
          {authErr && <div className="err">{authErr}</div>}
          <div className="hint">registering keeps your name and progress on any device. the email below is optional (only to recover your account).</div>
        </div>
      )}
      {account && mode === "delete" && (
        <div className="lab-gate-account">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="your password, to delete everything" autoComplete="current-password" maxLength={200} />
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await deleteAccount(password);
                setBusy(false);
                setPassword("");
                if (!ok) return setAuthErr("wrong password");
                setAuthErr("");
                setMode("");
                setAccount(null);
                track("account-deleted");
              }}
            >
              delete my account forever
            </button>
          </div>
          {authErr && <div className="err">{authErr}</div>}
          <div className="hint">your name becomes free again. progress stays only on this device.</div>
        </div>
      )}
      {apiReady && !account && (
        <div className={"lab-gate-email" + (emailOk ? "" : " bad")}>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email (optional) · news, account recovery"
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
  const mapRef = useRef<{ getPos: () => { x: number; z: number; yaw: number }; presence: Presence | null; wishList: () => { kind: string; x: number; z: number }[]; edge?: () => { radius: number; centre: { x: number; z: number } }; ai?: () => { name: string; x: number; z: number }[] } | null>(null);
  const [wishOpen, setWishOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // meeting someone from the map: who you're walking to, and messages like "x is coming to find you"
  const meetRef = useRef<string | null>(null);
  const [meetId, setMeetId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(0);
  // on-screen text only for what really matters (owner: keep the screen quiet).
  // Everything else is shown by the world itself (sound, light, the arrow…).
  const say = (text: string, important = false) => {
    if (!important) return;
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 5000);
  };
  // leaving? offer to save their soul (an account), once per visit, after 2 minutes
  const [soulAsk, setSoulAsk] = useState(false);
  const [soulPw, setSoulPw] = useState("");
  const [soulMsg, setSoulMsg] = useState("");
  useEffect(() => {
    if (!accountsReady || currentAccount()) return;
    const started = Date.now();
    let asked = false;
    const out = (e: MouseEvent) => {
      if (asked || e.clientY > 0 || e.relatedTarget || Date.now() - started < 120_000) return;
      asked = true;
      setSoulAsk(true);
      track("soul-ask");
    };
    document.addEventListener("mouseout", out);
    return () => document.removeEventListener("mouseout", out);
  }, []);
  const saveSoul = async () => {
    if (soulPw.length < 6) return setSoulMsg("at least 6 characters");
    const r = await register(nick, soulPw);
    setSoulPw("");
    if ("error" in r) return setSoulMsg(r.error === "taken" ? "that name is taken. log in from the entry screen." : "couldn't save right now. try again.");
    setSoulMsg("");
    setSoulAsk(false);
    track("soul-saved");
  };

  // gramophone record picker + radio dial
  const [gramoKey, setGramoKey] = useState<string | null>(null);
  const [pickRec, setPickRec] = useState<RecordId>("waltz");
  const [pickFx, setPickFx] = useState<FxId>("warm");
  const gramoPlayRef = useRef<(key: string, rec: RecordId, fx: FxId) => void>(() => {});
  const [station, setStation] = useState(STATIONS[0]);
  const radioNextRef = useRef<() => void>(() => {});

  // settings (⚙ / Esc)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"sound" | "game" | "controls" | "graphics">("sound");
  const [st, setSt] = useState<Settings>(() => settings());
  useEffect(() => onSettings(setSt), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (e.target as HTMLElement)?.tagName !== "INPUT") setSettingsOpen((o) => !o);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // invite: a link, or a 6-second video of your game with your invite on it
  const [inviteMenu, setInviteMenu] = useState(false);
  const [clipState, setClipState] = useState<"" | "rec" | "ready">("");
  const clipRef = useRef<() => void>(() => {});
  const clipBlob = useRef<{ blob: Blob; url: string } | null>(null);

  // the inventory: afterlife objects you've collected
  const [bag, setBag] = useState(() => readBag());
  const [bagOpen, setBagOpen] = useState(false);
  useEffect(() => {
    const off = onBag(() => setBag(readBag()));
    return () => {
      off();
    };
  }, []);
  const bagCount = Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);

  // daily quests (same three for everyone today)
  const questsRef = useRef<ReturnType<typeof createQuests> | null>(null);
  if (!questsRef.current) questsRef.current = createQuests();
  const [questList, setQuestList] = useState<QuestView[]>(() => questsRef.current!.list());
  const [questsOpen, setQuestsOpen] = useState(false);
  const questRef = useRef<(k: QuestKind, n?: number) => void>(() => {});

  // chat with strangers + weird interactions
  type Line = { key: number; id: string; nick: string; text: string; mine?: boolean };
  const [chat, setChat] = useState<Line[]>([]);
  // the open chat keeps the whole conversation (this visit); closed, lines float and fade
  const [log, setLog] = useState<Line[]>([]);
  const [chatOpen, setChatOpenState] = useState(false);
  const chatOpenRef = useRef(false);
  const [unread, setUnread] = useState(0);
  const [lineMenu, setLineMenu] = useState<number | null>(null);
  const setChatOpen = (open: boolean) => {
    chatOpenRef.current = open;
    setChatOpenState(open);
    setLineMenu(null);
    if (open) {
      setUnread(0);
      track("chat-open");
    }
  };
  const [draft, setDraft] = useState("");
  const chatInput = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const muted = useRef(new Set<string>());
  const lineKey = useRef(0);
  const addLine = (l: Omit<Line, "key">) => {
    const line = { ...l, key: ++lineKey.current };
    setChat((c) => [...c.slice(-4), line]);
    setLog((c) => [...c.slice(-59), line]);
    if (!l.mine && !chatOpenRef.current) setUnread((n) => n + 1);
    setTimeout(() => setChat((c) => c.filter((x) => x.key !== line.key)), 25_000);
  };
  useEffect(() => {
    if (chatOpen) logEnd.current?.scrollIntoView({ block: "end" });
  }, [chatOpen, log.length]);
  const muteLine = (l: Line) => {
    muted.current.add(l.id);
    setChat((c) => c.filter((x) => x.id !== l.id));
    setLog((c) => c.filter((x) => x.id !== l.id));
    setLineMenu(null);
    say(`${l.nick} muted`, true);
    track("chat-mute");
  };
  /** real people close enough to hear you clearly (30 m) and at all (80 m) */
  const hearers = () => {
    const ps = presenceRef.current ? [...presenceRef.current.peers.values()] : [];
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - posRef.current.x, p.z - posRef.current.z);
    return { clear: ps.filter((p) => d(p) <= 30).length, far: ps.filter((p) => d(p) > 30 && d(p) <= 80).length };
  };
  const addLineRef = useRef(addLine);
  addLineRef.current = addLine;
  const lastHeard = useRef("");
  const aiRef = useRef<AiResidents | null>(null);
  // the open market
  const marketRef = useRef<ReturnType<typeof createMarket> | null>(null);
  const [atMarket, setAtMarket] = useState(false);
  const [marketTab, setMarketTab] = useState<null | "buy" | "sell" | "mine">(null);
  const [sellItem, setSellItem] = useState<ItemId | "">("");
  const [sellPrice, setSellPrice] = useState("10");
  const [, bumpMarket] = useState(0);

  // notes between players
  const notesRef = useRef<ReturnType<typeof createNotes> | null>(null);
  const [notesOpen, setNotesOpen] = useState<null | "write" | "inbox">(null);
  const [noteTo, setNoteTo] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteView, setNoteView] = useState<Note | null>(null);
  const sendNote = () => {
    const n = notesRef.current;
    if (!n) return;
    const to = noteTo.replace(/^@/, "").trim() || null;
    if (!n.leave(noteText, to, posRef.current.x, posRef.current.z)) return say("that can't be written here", true);
    setNoteText("");
    setNoteTo("");
    setNotesOpen(null);
    say(to ? `note sent to @${to}` : "note left here", true);
    track(to ? "note-to" : "note-here");
  };

  // posts on the walls
  const postsRef = useRef<ReturnType<typeof createPosts> | null>(null);
  const yawRef = useRef(0);
  const [composer, setComposer] = useState<null | { mode: "photo" | "draw"; img: string | null }>(null);
  const [caption, setCaption] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [viewing, setViewing] = useState<Post | null>(null);
  const [, bumpPosts] = useState(0);
  const pad = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState("#fff6e2");
  const hangPost = async () => {
    const posts = postsRef.current;
    if (!posts || !composer) return;
    let img = composer.img;
    if (composer.mode === "draw" && pad.current) img = await shrink(pad.current);
    if (!img) return say("choose a photo first", true);
    if (!agreed) return say("tick the box: it's your own work", true);
    const at = wallAhead(posRef.current.x, posRef.current.z, yawRef.current);
    if (!at) return say("face a wall to hang it", true);
    posts.publish(img, caption, at);
    setComposer(null);
    setCaption("");
    say("posted · others see it once it's approved", true);
    track(`post-${composer.mode}`);
  };
  const posRef = useRef({ x: 0, z: 0 });
  const sendChat = (said?: string) => {
    const text = (said ?? draft).trim();
    if (!text) return;
    if (presenceRef.current?.say(text)) {
      addLine({ id: "me", nick, text, mine: true });
      questRef.current("say");
      // one of the dreamed ones (◇) nearby may answer (never claiming to be a person)
      const heard = aiRef.current?.hear(text, posRef.current.x, posRef.current.z);
      if (heard) setTimeout(() => addLine({ id: `ai-${heard.name}`, nick: `◇ ${heard.name}`, text: heard.reply }), 1400);
      if (said === undefined) setDraft("");
      chatInput.current?.focus(); // stay in the conversation
      track("chat-said");
    } else say("that can't be said here (or slow down)", true);
  };
  const emote = (k: Emote) => {
    presenceRef.current?.emote(k);
    questRef.current("emote");
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
  // one-time hint for phones (gone after the first walk)
  const [moveHint, setMoveHint] = useState(() => {
    try {
      return !localStorage.getItem("seeface-move-hint");
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!stick.active || !moveHint) return;
    const t = setTimeout(() => {
      setMoveHint(false);
      try {
        localStorage.setItem("seeface-move-hint", "1");
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [stick.active, moveHint]);
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
    const pixelRatio = (q: Settings["quality"]) => (q === "low" ? 0.75 : q === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, isPhone ? 1.25 : 1.5));
    renderer.setPixelRatio(pixelRatio(settings().quality));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    el.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
    const world = createWorld();
    const fx = createFx(renderer, world.scene, camera, myVibe());
    const stopVibe = trackVibe();
    const perf = createPerf(renderer, world.scene, (pr) => fx.setPixelRatio(pr));
    // first visit: pick a quality that suits this device
    if (!hasSavedSettings()) setSettings({ quality: detectTier(renderer) });
    const hunter = createHunter();
    const residents = createResidents();
    const keepers = createKeepers();
    const queen = createPopQueen();
    const flood = createFlood();
    const places = createPlaces();
    const afterlife = createAfterlife();
    let tvHinted = false;
    const order = () => {
      if (blood < ORDER_COST) {
        sayRef.current("insufficient ◈. the after life isn't free (yet)", true);
        return;
      }
      blood = addBlood(-ORDER_COST);
      const it = addItem(randomItem(1));
      sound.chime();
      sayRef.current(`order confirmed: ${it.name} · your After Life™ ships never`, true);
      track("afterlife-order");
    };
    const found = (luck = 0) => {
      const it = addItem(randomItem(luck));
      setTimeout(() => sayRef.current(`you found: ${it.name}`), 1200);
      track(`item-${it.id}`);
    };
    let inPlace: ReturnType<typeof places.update>["inside"] = null;
    const placesSeen = new Set<string>();
    const floodFx = document.createElement("div");
    floodFx.className = "lab-flood-fx";
    el.appendChild(floodFx);
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
    world.scene.add(hunter.object, residents.group, keepers.group, queen.group, flood.group, places.group, afterlife.group, others.group, artLayer.group, wishes.group, props.group, rifts.group, camera);
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

    // the labyrinth's own weather (changes every few minutes, the same for everyone)
    let skyKind: WeatherKind | null = null;
    let thunderIn = 8;
    let wet = 0;
    const WETNESS: Partial<Record<WeatherKind, number>> = { drizzle: 0.45, rain: 0.85, storm: 1, snow: 0.2 };
    const applySky = (announce: boolean) => {
      const w = skyAt();
      if (w.kind === skyKind) return;
      skyKind = w.kind;
      world.setWeather(w);
      sound.setWeather(w.kind, w.intensity, w.wind);
      if (announce) sayRef.current(SKY_NOTICE[w.kind]);
      track(`weather-${w.kind}`);
    };
    applySky(false);
    setTimeout(() => sayRef.current("welcome to the after life™"), 1500);

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
    // the dark king (the Hollow) no longer kills. Meeting him pays: a welcome
    // gift the first time ever, a little once a day after that. Then he's gone.
    const KING_EVER = "seeface-king-welcomed";
    const kingDayKey = () => `seeface-king-${Math.floor(Date.now() / 86_400_000)}`;
    const flag = (k: string) => {
      try {
        return localStorage.getItem(k) === "1";
      } catch {
        return true; // no storage: no free money loop
      }
    };
    const setFlag = (k: string) => {
      try {
        localStorage.setItem(k, "1");
      } catch {
        // ignore
      }
    };
    let kingSummonT = 0;
    const kingMeets = () => {
      const first = !flag(KING_EVER);
      const today = !flag(kingDayKey());
      if (first || today) {
        setFlag(KING_EVER);
        setFlag(kingDayKey());
        const gift = first ? 100 : 10;
        blood = addBlood(gift);
        sound.choir(true);
        setTimeout(() => sound.choir(false), 3500);
        track(first ? "king-welcome" : "king-gift");
        if (first) {
          sayRef.current(`the dark king bows to you · +${gift} ◈`, true);
          setTimeout(() => sayRef.current("keep it. soon, something in this world will be yours.", true), 5200);
        } else sayRef.current(`the dark king remembers you · +${gift} ◈`, true);
      }
      hunter.reset(pos.x + 40, pos.z + 40);
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
        // close by: their exact position; far away: their beacon (where they roughly are)
        const f = presence.peers.get(withId) ?? presence.far.get(withId);
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
    markEntered();
    // coming back: continue where you were (unless a friend's invite or a level link says otherwise)
    const back = !withId && !startLevel ? readResume() : null;
    if (back && free(back.x, back.z)) {
      pos.x = back.x;
      pos.z = back.z;
      input.yaw = back.yaw;
      light = Math.max(40, back.light);
      shards = back.shards;
      depth = back.depth;
      metres = back.metres;
      nextBloodAt = Math.floor(metres / 100) * 100 + 100;
      world.setDepth(depth);
      hunter.reset(pos.x, pos.z);
      runTime = GRACE; // a few seconds to settle back in before anything hunts
      track("resumed");
      setTimeout(() => sayRef.current(`welcome back to the after life™ · ${back.place}`), 1700);
    }
    // remember where you are, every few seconds and when you leave
    const remember = () => {
      if (!alive) return;
      const lvl = levelAtX(pos.x);
      const place = lvl > 0 ? LEVELS[lvl].name : inPlace ? PLACE_TITLES[inPlace.kind] : PLACE_NAMES[world.zone().kind] ?? "the labyrinth";
      saveResume({ x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +input.yaw.toFixed(3), light: Math.round(light), shards, depth, metres: Math.round(metres), place });
    };
    const rememberTimer = setInterval(remember, 5000);
    const rememberHidden = () => document.hidden && remember();
    window.addEventListener("pagehide", remember);
    document.addEventListener("visibilitychange", rememberHidden);

    function die() {
      clearResume();
      alive = false;
      caughtSfx.play();
      radio.set(0);
      try {
        navigator.vibrate?.([300, 80, 300]);
      } catch {
        // unsupported
      }
      const best = metres > readBest();
      noteRun(Math.round(metres)); // progress (saved to the account if they have one)
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
      if (k === "popqueen") sound.showtune(0);
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
      questRef.current("wish");
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
      ai: () => aiRef.current?.list() ?? [],
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
        others,
        queen,
        flood,
        gramos: () => gramos,
        ai: () => ai,
        perf,
      };

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      fx.setSize(w, h);
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
      const p = meetRef.current ? presence.peers.get(meetRef.current) ?? presence.far.get(meetRef.current) : treasure ? { nick: "◈ treasure", x: treasure.x, z: treasure.z } : null;
      if (!p) return null;
      const a = -(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)) - input.yaw);
      return { nick: p.nick, d: Math.round(Math.hypot(p.x - pos.x, p.z - pos.z)), a: Math.atan2(Math.sin(a), Math.cos(a)) };
    };
    // someone picked you on their map
    presence.onCalled((from) => {
      sayRef.current(`${from.nick} is coming to find you`, true);
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
        if (settings().shake) el.classList.add("scream");
      }
      if (d < 20) sayRef.current(`${from.nick} ${kind === "stare" ? "stares at you" : kind === "spin" ? "spins" : kind === "melt" ? "melts into the floor" : kind === "float" ? "floats" : "screams"}`);
    });

    const howler = (window as unknown as { Howler?: { ctx?: AudioContext; masterGain?: GainNode } }).Howler;
    const howlerTap = () => {
      if (!howler?.ctx || !howler.masterGain) return new MediaStream();
      const d = howler.ctx.createMediaStreamDestination();
      howler.masterGain.connect(d);
      return d.stream;
    };
    const clipper = createClipper([sound.tap(), radio.tap(), howlerTap()]);
    clipRef.current = async () => {
      if (clipper.busy()) return;
      setClipState("rec");
      track("clip-record");
      const lvl = levelAtX(pos.x);
      const place = lvl > 0 ? LEVELS[lvl].name : inPlace ? PLACE_TITLES[inPlace.kind] : PLACE_NAMES[world.zone().kind] ?? "the labyrinth";
      const inviteUrl = `${location.origin}/labyrinth?with=${presence.me}&v=${myVibe().id}`;
      try {
        const { blob } = await clipper.record({ nick, place, inviteUrl });
        clipBlob.current = { blob, url: inviteUrl };
        if (import.meta.env.DEV) (window as unknown as { __lastClip: Blob }).__lastClip = blob; // for testing
        setClipState("ready");
      } catch {
        setClipState("");
        sayRef.current("couldn't record a video on this device · send the link instead", true);
      }
    };

    // the champions: everyone's best run, shared; the top 10 go on the billboard
    const champions = createChampions(presence);
    let lastRank = 0;
    champions.onChange((top) => {
      setChampions(top, playerId());
      const r = champions.rank();
      if (r && r !== lastRank) {
        if (lastRank === 0 || r < lastRank) sayRef.current(`your name is on the champions' billboard · #${r}`);
        lastRank = r;
      }
    });
    setTimeout(() => champions.report(nick, readBest()), 4000);
    let ritualT = 0;

    // settings: volumes, graphics, what's shown
    const sfx: [Howl, number][] = [[spinSfx, 0.5], [shardSfx, 0.6], [shiftSfx, 0.7], [caughtSfx, 0.8], [signalSfx, 0.35], [meetSfx, 0.5]];
    const offSettings = onSettings((st) => {
      sound.setVolumes(st);
      radio.setVolume(st.radio * st.master);
      sfx.forEach(([h, base]) => h.volume(base * st.effects * st.master));
      perf.setQuality(pixelRatio(st.quality), st.quality);
      world.setFlashes(st.flashes);
      others.setShow(st.showNames, st.showChat);
      el.dataset.calm = st.flashes ? "" : "1";
      fx.setEnabled(st.glow && st.quality !== "low");
    });

    const hazards = createHazards(sound.ctx, sound.ambienceOut);
    const ship = createShip();
    world.scene.add(ship.group);
    let beamT = 0;
    const market = createMarket(presence, () => nick, {
      sold: (l: Listing) => {
        blood = readBlood();
        sound.chime();
        sayRef.current(`you sold ${ITEMS[l.item].name} for ${l.price} ◈ to @${l.soldTo}`, true);
        track("market-sold");
      },
      changed: () => {
        blood = readBlood();
        // one stall per seller, up to 12 stalls
        const bySeller = new Map<string, { seller: string; items: { glyph: string; name: string; price: number }[] }>();
        for (const l of market.open()) {
          const row = bySeller.get(l.sellerId) ?? { seller: l.seller, items: [] };
          row.items.push({ glyph: ITEMS[l.item].glyph, name: ITEMS[l.item].name, price: l.price });
          bySeller.set(l.sellerId, row);
        }
        setStalls([...bySeller.values()].slice(0, 12));
        bumpMarket((n) => n + 1);
      },
    });
    marketRef.current = market;
    let wasAtMarket = false;
    const notes = createNotes(presence, () => nick);
    notesRef.current = notes;
    let unreadSeen = 0;
    notes.onChange(() => {
      bumpPosts((n) => n + 1);
      const u = notes.unread();
      if (u > unreadSeen && notes.inbox()[0]) sayRef.current(`✉ a note from @${notes.inbox()[0].from}`, true);
      unreadSeen = u;
    });
    world.scene.add(notes.group);
    const posts = createPosts(presence, () => nick);
    postsRef.current = posts;
    posts.onChange(() => bumpPosts((n) => n + 1));
    world.scene.add(posts.group);
    const ai = createAi();
    aiRef.current = ai;
    world.scene.add(ai.group);
    world.scene.add(hazards.group);

    // gramophones (music for everyone nearby) + the radio dial
    const gramos = createGramophones(presence, sound.ctx, sound.musicBus);
    world.scene.add(gramos.group);
    gramoPlayRef.current = (key, rec, fx) => {
      gramos.play(key, rec, fx, nick);
      track(`gramophone-${rec}-${fx}`);
    };
    const stations = createStations(sound.ctx, sound.musicBus, () => gramos.nearestPlaying(pos.x, pos.z));
    radioNextRef.current = () => {
      sound.resume();
      setStation(stations.next());
      track("radio-tune");
    };
    const listener = sound.ctx.listener;
    const setListener = () => {
      const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
      if (listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY.value = 1.6;
        listener.positionZ.value = pos.z;
        listener.forwardX.value = fx;
        listener.forwardY.value = 0;
        listener.forwardZ.value = fz;
      } else {
        (listener as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, 1.6, pos.z);
        (listener as unknown as { setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void }).setOrientation(fx, 0, fz, 0, 1, 0);
      }
    };

    // deaths: rare when the labyrinth is quiet. With 6+ people inside it's deadly;
    // with fewer, only now and then (1 in 5), otherwise it hurts but you live.
    const lethal = () => presence.online() >= 6 || Math.random() < 0.2;

    // quests: pay out and announce
    const quest = (k: QuestKind, n = 1) => {
      const r = questsRef.current!.bump(k, n);
      if (r.quest) {
        earn(r.quest.reward, "quest");
        sayRef.current(`quest done: ${r.quest.text} · +${r.quest.reward} ◈`);
        sound.chime();
        track(`quest-${r.quest.kind}`);
        setQuestList(questsRef.current!.list());
      }
      if (r.allDone) {
        earn(ALL_DONE_BONUS, "quests-all");
        setTimeout(() => sayRef.current(`all of today's quests done · +${ALL_DONE_BONUS} ◈ · new ones tomorrow`), 3000);
        track("quests-all-done");
      }
    };
    questRef.current = quest;
    let questTick = 0;

    // twist state
    let lowGravT = 0, fogT = 0, colourT = 0, glimpseT = 0;
    let treasure: { x: number; z: number; until: number } | null = null;
    let floodOn = false;

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
          vy = eventKind === "inversion" || lowGravT > 0 ? 7.5 : 4.2;
          jumpedNow = true;
          quest("jump");
          track("jump");
        }
        if (jumpY > 0 || vy > 0) {
          vy -= (eventKind === "inversion" || lowGravT > 0 ? 6 : 13) * dt;
          jumpY = Math.max(0, jumpY + vy * dt);
          if (jumpY === 0) {
            if (vy < -3) {
              landDip = 0.12;
              sound.step(world.zone().kind, running, wet);
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
            quest("relic");
            found();
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
          quest("walk", moved);
          if (Math.floor(metres / 10) !== Math.floor((metres - moved) / 10)) champions.report(nick, metres);
          if (metres > nextBloodAt) {
            nextBloodAt += 100;
            earn(1, "walk");
          }
          bob += moved * (running ? 1.5 : 1.8);
          walkedSfx += moved;
          if (walkedSfx > nextStep) {
            sound.step(world.zone().kind, running, wet);
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
        if (h.dist < 1.0 && !room && kingSummonT <= 0) kingMeets();
        // never met him: he comes to greet you once, standing right in front of you
        if (kingSummonT <= 0 && !flag(KING_EVER) && alive && !room && runTime > GRACE + 4) {
          hunter.object.position.set(pos.x - Math.sin(input.yaw) * 2.5, 0, pos.z - Math.cos(input.yaw) * 2.5);
          kingSummonT = 2.2;
        }
        if (kingSummonT > 0) {
          hunter.object.position.set(pos.x - Math.sin(input.yaw) * 2.5, 0, pos.z - Math.cos(input.yaw) * 2.5);
          kingSummonT -= dt;
          if (kingSummonT <= 0) kingMeets();
        }
      }

      const speedNow = Math.hypot(vel.x, vel.z);
      const bobAmp = settings().cameraBob ? 0.025 + (speedNow / RUN) * 0.045 : 0;
      camera.position.set(
        pos.x,
        EYE + jumpY - landDip + Math.sin(bob) * bobAmp + (lastDanger > 0.6 && settings().shake ? (Math.random() - 0.5) * 0.02 * lastDanger : 0),
        pos.z
      );
      // lean into turns and strafes
      const turn = (input.yaw - lastYaw) / Math.max(dt, 0.001);
      lastYaw = input.yaw;
      const strafe = vel.x * Math.cos(input.yaw) - vel.z * Math.sin(input.yaw);
      lean += (-strafe * 0.012 - Math.max(-2, Math.min(2, turn)) * 0.015 - lean) * Math.min(1, dt * 6);
      camera.rotation.set(input.pitch, input.yaw, lean, "YXZ");
      // field of view opens up when you sprint
      const fovTarget = settings().fov + (speedNow / RUN) * 10;
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
        if (pulled > 0) {
          noteLevel(pulled);
          quest("level");
        }
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
      renderer.toneMappingExposure += ((inPlace?.kind === "dark" ? 0.12 : world.zone().exposure) - renderer.toneMappingExposure) * Math.min(1, dt * 1.5);

      // other wanderers
      presence.send({ x: pos.x, z: pos.z, yaw: input.yaw, light, nick, held: held ? held.colour : 0 });
      wishes.update(pos.x, pos.z, dt);
      const meet = others.update(dt, t, pos.x, pos.z);
      if (meet.nearest < 4 && !metSomeone) {
        metSomeone = true;
        meetSfx.play();
        earn(2, "meet");
        quest("meet");
        track("met-someone");
        try {
          navigator.vibrate?.([30, 60, 30]);
        } catch {
          // unsupported
        }
      }
      if (meet.nearest > 10) metSomeone = false;

      // walking to someone you picked on the map
      const mt = meetRef.current ? presence.peers.get(meetRef.current) ?? presence.far.get(meetRef.current) : null;
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
      // the ship is outside the labyrinth's edge rules
      const eg = inShip(pos.x, pos.z) ? { fog: 0, grew: false, throwBack: null, nearEdge: false } : edge.update(pos.x, pos.z, presence.online(), dt);
      edgeFog = eg.fog;
      world.setEdgeFog(Math.max(eg.fog, fogT > 0 ? 0.7 : 0));
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
      if (tw === "gravity") {
        lowGravT = 12;
        sayRef.current("gravity forgot you · jump");
      }
      if (tw === "whisper") {
        // only real people: a whisper about someone who is actually in here
        const ps = [...presence.peers.values()];
        const p = ps[Math.floor(Math.random() * ps.length)];
        if (p) {
          const a = -(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)) - input.yaw);
          const r = Math.atan2(Math.sin(a), Math.cos(a));
          const dir = Math.abs(r) < Math.PI / 4 ? "ahead" : Math.abs(r) > (3 * Math.PI) / 4 ? "behind you" : r < 0 ? "to your left" : "to your right";
          sayRef.current(`a whisper: "${p.nick} is ${Math.round(Math.hypot(p.x - pos.x, p.z - pos.z))} m ${dir}"`);
        } else sayRef.current("a whisper: \"bring someone. it's lonely down here\"");
      }
      if (tw === "glimpse" && runTime > GRACE && light > 30) {
        // the Hollow, right there, for a blink
        hunter.object.position.set(pos.x - Math.sin(input.yaw) * 9, 0, pos.z - Math.cos(input.yaw) * 9);
        glimpseT = 1.3;
      }
      if (tw === "treasure") {
        for (let k = 0; k < 30; k++) {
          const a = Math.random() * Math.PI * 2, d = 15 + Math.random() * 15;
          const x = pos.x + Math.sin(a) * d, z = pos.z + Math.cos(a) * d;
          const c = { x: (Math.floor(x / CELL) + 0.5) * CELL, z: (Math.floor(z / CELL) + 0.5) * CELL };
          if (!free(c.x, c.z)) continue;
          for (let m = 0; m < 4; m++) props.spawnMoney(c.x + (m % 2 ? 0.6 : -0.6), c.z + (m < 2 ? 0.6 : -0.6));
          treasure = { x: c.x, z: c.z, until: t + 90 };
          sayRef.current("something was hidden near you · follow the arrow");
          break;
        }
      }
      if (tw === "waterfall") {
        const sp = Math.hypot(vel.x, vel.z);
        flood.surprise(pos.x, pos.z, sp > 0.5 ? vel.x / sp : -Math.sin(input.yaw), sp > 0.5 ? vel.z / sp : -Math.cos(input.yaw));
        sayRef.current("drip… drip… move!");
      }
      if (tw === "fogwall") {
        fogT = 7;
        sayRef.current("a wall of fog rolled in");
      }
      if (tw === "colours") {
        colourT = 9;
        renderer.domElement.style.filter = "hue-rotate(150deg) saturate(1.7)";
        sayRef.current("the colours went wrong");
      }
      lowGravT = Math.max(0, lowGravT - dt);
      fogT = Math.max(0, fogT - dt);
      if (colourT > 0) {
        colourT -= dt;
        if (colourT <= 0) renderer.domElement.style.filter = "";
      }
      if (glimpseT > 0) {
        glimpseT -= dt;
        if (glimpseT <= 0) hunter.reset(pos.x, pos.z);
      }
      if (treasure) {
        if (Math.hypot(treasure.x - pos.x, treasure.z - pos.z) < 2.5) {
          treasure = null;
          sayRef.current("you found the treasure");
          found(2);
          quest("treasure");
        } else if (t > treasure.until) treasure = null;
      }
      // quests that count time, and keeping the list fresh
      if (alive && light < 20) quest("dark", dt);
      questTick -= dt;
      if (questTick <= 0) {
        questTick = 1;
        setQuestList(questsRef.current!.list());
      }
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
            place: levelAtX(pos.x) > 0 ? LEVELS[levelAtX(pos.x)].name : inPlace ? PLACE_TITLES[inPlace.kind] : PLACE_NAMES[world.zone().kind] ?? "the labyrinth",
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
        if (kAct.why === "keeper-trade") quest("trade");
        sound.chime();
        track(kAct.why ?? "keeper");
      }

      // ---------------- cubes: spin a new room's cube → shard + full light
      const c = world.nearestCube(pos.x, pos.z);
      const isNear = !!c && c.dist < CELL * 0.75 && alive;
      const al = afterlife.update(pos.x, pos.z, t);
      if (al.nearTV && !tvHinted) {
        tvHinted = true;
        sayRef.current(`tap the screen to order AFTER LIFE™ · ${ORDER_COST} ◈`);
      }
      if (!al.nearTV) tvHinted = false;
      gramos.update(pos.x, pos.z, t);
      ai.update(dt, pos.x, pos.z);
      posts.update(pos.x, pos.z);
      notes.update(pos.x, pos.z, t);
      ship.update(pos.x, pos.z, t);
      world.setSpace(inShip(pos.x, pos.z));
      // the beams: stand in one for 2.5 s to go up to the ship / back down to the open
      const onShip = inShip(pos.x, pos.z);
      const openBeam = inPlace?.kind === "open" ? placeCentre(inPlace.I, inPlace.J) : null;
      const inBeam = (openBeam && Math.hypot(openBeam.x - pos.x, openBeam.z - pos.z) < 1.3) || (onShip && Math.hypot(ship.dock.x - pos.x, ship.dock.z - pos.z) < 1.3);
      beamT = inBeam && alive ? beamT + dt : 0;
      if (beamT > 2.5) {
        beamT = 0;
        if (onShip) {
          const back = placeCentre(1, 1); // the open by the entrance
          pos.x = back.x + 3;
          pos.z = back.z;
          track("ship-leave");
        } else {
          pos.x = ship.dock.x + 4;
          pos.z = ship.dock.z;
          input.yaw = -Math.PI / 2; // facing the church
          track("ship-board");
        }
        vel.x = vel.z = 0;
        hunter.reset(pos.x + 60, pos.z + 60);
        if (settings().flashes) {
          el.classList.remove("rift");
          void el.offsetWidth;
          el.classList.add("rift");
          el.style.setProperty("--rift", "#bfe8ff");
        }
      }
      yawRef.current = input.yaw;
      posRef.current.x = pos.x;
      posRef.current.z = pos.z;
      setListener();
      const gn = gramos.near(pos.x, pos.z);
      const tapNow = input.consumeTap();
      if (tapNow && al.nearTV && alive) order();
      else if (tapNow && gn && alive) setGramoKey(gn.key);
      else if (tapNow && posts.lookingAt(pos.x, pos.z, input.yaw)) setViewing(posts.lookingAt(pos.x, pos.z, input.yaw));
      else if (tapNow && notes.lookingAt(pos.x, pos.z, input.yaw)) setNoteView(notes.lookingAt(pos.x, pos.z, input.yaw));
      else if (tapNow && c && isNear) {
        world.spinCube(c.mesh);
        spinSfx.play();
        light = 100;
        const roomKey = c.mesh.userData.key as string;
        if (!claimed.has(roomKey)) {
          claimed.add(roomKey);
          shards += 1;
          earn(1, "shard");
          quest("shards");
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

      // weather: check the sky now and then; floors get wet in the rain, storms thunder
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2) && !floodOn) applySky(true);
      const wetTarget = floodOn ? 1 : WETNESS[skyKind ?? "clear"] ?? 0;
      wet += (wetTarget - wet) * Math.min(1, dt * (wetTarget > wet ? 0.15 : 0.03));
      world.setWet(wet);
      if (skyKind === "storm" || floodOn) {
        thunderIn -= dt;
        if (thunderIn <= 0) {
          thunderIn = 6 + Math.random() * 10;
          sound.thunder();
        }
      }

      // the flood
      const sp = Math.hypot(vel.x, vel.z);
      const fl = flood.update(dt, t, { px: pos.x, pz: pos.z, vx: sp > 0.5 ? vel.x / sp : -Math.sin(input.yaw), vz: sp > 0.5 ? vel.z / sp : -Math.cos(input.yaw), alive });
      sound.siren(fl.phase === "warn" ? 1 : fl.phase === "flood" ? (fl.kind === "flood" ? 0.35 : 0.18) : 0);
      for (const d of fl.crashes) sound.crash(d);
      if (fl.changed) {
        floodFx.dataset.phase = fl.changed;
        floodFx.dataset.kind = fl.kind;
        if (fl.changed === "warn") {
          const WARN = { flood: "⚠ the flood is coming", tornado: "⚠ a tornado is coming", fire: "⚠ fire", plague: "⚠ the plague is coming" } as const;
          sayRef.current(`${WARN[fl.kind]} · get into a room`, true);
          track(`${fl.kind}-warn`);
        }
        if (fl.changed === "flood" && fl.kind === "tornado") {
          sound.setWeather("storm", 1, 90);
          skyKind = null;
        }
        if (fl.changed === "flood" && fl.kind === "flood") {
          floodOn = true;
          world.setWeather({ kind: "storm", intensity: 1, wind: 40, isDay: false, temp: 10 });
          sound.setWeather("storm", 1, 40);
          skyKind = null;
          sayRef.current("the flood");
        }
        if (fl.changed === "none") {
          floodOn = false;
          applySky(false);
          if (alive) {
            quest("flood");
            track(`${fl.kind}-survived`);
          }
        }
      }

      // the other disasters: tornado, fire, plague
      const hz = hazards.update(dt, t, fl.kind, fl.phase, { px: pos.x, pz: pos.z, alive });
      if (hz.pull) {
        const nx = pos.x + hz.pull.x * dt, nz = pos.z + hz.pull.z * dt;
        if (free(nx, pos.z)) pos.x = nx;
        if (free(pos.x, nz)) pos.z = nz;
      }
      if (hz.warmth) light = Math.min(100, light + hz.warmth * dt);
      if (hz.cough) hazards.cough();
      el.style.setProperty("--plague", String(hz.plague));
      el.classList.toggle("plagued", hz.plague > 0);
      if (hz.hit && alive) {
        if (lethal()) {
          killedBy = hz.hit.by;
          track(`${hz.hit.by.replace("the ", "")}-killed`);
          die();
        } else {
          // it hurts, it doesn't take you: thrown somewhere safe (far, for the tornado)
          const far = hz.hit.fling ? 2 + Math.floor(Math.random() * 2) : 0;
          const c = roomCentreOf(Math.floor(pos.x / CELL / 7) + (Math.random() < 0.5 ? -far : far), Math.floor(pos.z / CELL / 7) + (Math.random() < 0.5 ? -far : far));
          pos.x = c.x;
          pos.z = c.z;
          vel.x = vel.z = 0;
          light = Math.min(light, 25);
          if (hz.hit.by === "the plague" && blood > 0) blood = addBlood(-Math.min(3, blood));
          hunter.reset(pos.x, pos.z);
          if (settings().flashes) {
            el.classList.remove("rift");
            void el.offsetWidth;
            el.classList.add("rift");
            el.style.setProperty("--rift", hz.hit.by === "the fire" ? "#ff9a3c" : hz.hit.by === "the plague" ? "#7aff9a" : "#d8d0c0");
          }
          track(`${hz.hit.by.replace("the ", "")}-survived-hit`);
        }
      }
      if (fl.killed && alive) {
        if (lethal()) {
          killedBy = "the flood";
          track("flood-killed");
          die();
        } else {
          // the water throws you instead of taking you
          const c = roomCentreOf(Math.floor(pos.x / CELL / 7), Math.floor(pos.z / CELL / 7));
          pos.x = c.x;
          pos.z = c.z;
          vel.x = vel.z = 0;
          light = Math.min(light, 30);
          el.classList.remove("rift");
          void el.offsetWidth;
          el.classList.add("rift");
          el.style.setProperty("--rift", "#9fdcff");
          sayRef.current("the water took you and spat you out");
          track("flood-thrown");
        }
      }

      // places: the open, the theater, the mall, the museum, the supermarket, the dark room
      const pl = places.update(pos.x, pos.z, t, dt);
      inPlace = pl.inside;
      const nowAtMarket = pl.inside?.kind === "bazaar";
      if (nowAtMarket !== wasAtMarket) {
        wasAtMarket = nowAtMarket;
        setAtMarket(nowAtMarket);
      }
      world.setCeiling(pl.inside?.kind !== "open" && pl.inside?.kind !== "ritual" && pl.inside?.kind !== "bazaar" && !inShip(pos.x, pos.z));
      // the ritual: stand in the gold circle by the altar for 5 seconds
      if (pl.atAltar && alive) {
        if (ritualT === 0) sayRef.current("stand still… the ritual has begun");
        ritualT += dt;
        if (ritualT > 5 && ritualT < 100) {
          ritualT = 100; // done for this visit to the circle
          const key = `seeface-ritual-${Math.floor(Date.now() / 86_400_000)}`;
          let done = true;
          try {
            done = localStorage.getItem(key) === "1";
            if (!done) localStorage.setItem(key, "1");
          } catch {
            // ignore
          }
          light = 100;
          if (!done) {
            earn(5, "ritual");
            sayRef.current("the champions bless you · full light · +5 ◈");
          } else sayRef.current("the champions bless you · full light");
          sound.choir(true);
          setTimeout(() => sound.choir(false), 4000);
          track("ritual");
        }
      } else ritualT = 0;
      if (pl.entered) {
        const k = pl.entered.kind;
        sayRef.current(k === "dark" ? "you found the dark room" : PLACE_TITLES[k]);
        track(`place-${k}`);
        if (!placesSeen.has(k) && k !== "dark") {
          placesSeen.add(k);
          quest("place");
        }
        if (k === "dark") quest("darkroom");
      }
      if (pl.darkCubeNear) {
        // once a day, the cube in the dark pays whoever finds it
        const key = `seeface-dark-${Math.floor(Date.now() / 86_400_000)}`;
        let paid = true;
        try {
          paid = localStorage.getItem(key) === "1";
          if (!paid) localStorage.setItem(key, "1");
        } catch {
          // ignore
        }
        if (!paid) {
          earn(20, "dark-cube");
          sound.chime();
          sayRef.current("the cube remembers you · +20 ◈");
          track("dark-cube");
        }
      }

      // the Pop Queen's show
      const qa = queen.update(dt, t, { px: pos.x, pz: pos.z, yaw: input.yaw, active: eventKind === "popqueen" && alive });
      const qd = queen.near(pos.x, pos.z);
      sound.showtune(eventKind === "popqueen" ? Math.max(0.15, Math.min(1, 1 - (qd - 2) / 18)) : 0);
      if (qa?.steal) {
        const lost = Math.min(blood, qa.steal);
        if (lost > 0) blood = addBlood(-lost);
        sayRef.current(lost > 0 ? `the Pop Queen took ${lost} ◈` : "the Pop Queen bowed. you had nothing to give");
        caughtSfx.play();
        track("popqueen-caught");
      }
      if (heldObj) heldObj.rotation.y += dt * 1.5;

      // light & effects; under open skies (and in the ship) the eye sees much further
      const sky = inPlace?.kind === "open" || inPlace?.kind === "ritual" || inPlace?.kind === "bazaar" || inShip(pos.x, pos.z);
      const far = sky ? 500 : 80;
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      fx.setDanger(alive ? lastDanger : 0);
      fx.update(dt, t, { x: pos.x, z: pos.z, moving: Math.hypot(vel.x, vel.z) > 0.6, sky, zoneTint: world.zone().panel });
      perf.frame(dt, camera);
      fx.render();
      clipper.frame(renderer.domElement); // share video (only while recording)

      // snapshot: grab the frame right after it's drawn
      if (snapRequested) {
        snapRequested = false;
        if (eventKind) quest("snap");
        const fq = queen.flash(pos.x, pos.z, input.yaw);
        if (fq?.flashed) {
          earn(fq.flashed, "popqueen-photo");
          sayRef.current(`she hates cameras · +${fq.flashed} ◈`);
          track("popqueen-photo");
        }
        const lvl = levelAtX(pos.x);
        const place = lvl > 0 ? LEVELS[lvl].name : inPlace ? PLACE_TITLES[inPlace.kind] : PLACE_NAMES[world.zone().kind] ?? "the labyrinth";
        const inviteUrl = `${location.origin}/labyrinth?with=${presence.me}&v=${myVibe().id}`;
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
      stopVibe();
      stations.stop();
      offSettings();
      clearInterval(rememberTimer);
      window.removeEventListener("pagehide", remember);
      document.removeEventListener("visibilitychange", rememberHidden);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("keydown", onKey);
      presence.close();
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
    const url = `${location.origin}/labyrinth?with=${id}&v=${myVibe().id}`;
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

      {inviteMenu && (
        <div className="lab-invite" onPointerDown={stop} onPointerUp={stop}>
          <button
            onClick={() => {
              setInviteMenu(false);
              void invite();
            }}
          >
            send my link
          </button>
          <button
            onClick={() => {
              setInviteMenu(false);
              clipRef.current();
            }}
          >
            record a {CLIP_SECONDS}-second video invite
          </button>
        </div>
      )}
      {clipState === "rec" && <div className="lab-clip rec">● recording {CLIP_SECONDS} s · keep playing, make it good</div>}
      {clipState === "ready" && (
        <div className="lab-clip" onPointerDown={stop} onPointerUp={stop}>
          <button
            onClick={async () => {
              const c = clipBlob.current;
              if (!c) return;
              const how = await shareClip(c.blob, c.url);
              track(`clip-${how}`);
              if (how !== "cancelled") setClipState("");
            }}
          >
            share your video ➝
          </button>
          <button className="x" onClick={() => setClipState("")} aria-label="discard">
            ×
          </button>
        </div>
      )}
      {isPhone && moveHint && st.showHints && <div className="lab-hint">left thumb: walk + turn · push far to run · right side: look around</div>}
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
        <i className="ai"> · ◇ {aiRef.current?.count() ?? 6}</i>
      </div>

      {/* thumb controls (phones) + signal / invite (everyone) */}
      <div className="lab-actions" onPointerDown={stop} onPointerUp={stop}>
        <button className="lab-btn invite" onClick={() => (clipSupported() ? setInviteMenu((m) => !m) : void invite())} aria-label="invite a friend">
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
        <button
          className="lab-btn bag"
          onClick={() => {
            setNotesOpen(notesRef.current?.inbox().length ? "inbox" : "write");
            notesRef.current?.markRead();
          }}
          aria-label="notes"
        >
          ✉{(notesRef.current?.unread() ?? 0) > 0 && <small>{notesRef.current?.unread()}</small>}
        </button>
        <button className="lab-btn post" onClick={() => setComposer({ mode: "photo", img: null })} aria-label="post a photo or drawing on the wall">
          ⊞
        </button>
        <button className="lab-btn bag" onClick={() => setBagOpen(true)} aria-label="inventory">
          ◫{bagCount > 0 && <small>{bagCount}</small>}
        </button>
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
      {atMarket && !marketTab && (
        <button className="lab-market-btn" onPointerDown={stop} onPointerUp={stop} onClick={() => setMarketTab("buy")}>
          open the market
        </button>
      )}
      {marketTab && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box">
            <div className="lab-settings-tabs">
              {(["buy", "sell", "mine"] as const).map((t) => (
                <button key={t} className={marketTab === t ? "on" : ""} onClick={() => setMarketTab(t)}>
                  {t === "mine" ? "my stall" : t}
                </button>
              ))}
              <span className="lab-market-purse">◈ {hud.blood}</span>
            </div>
            <div className="lab-settings-body">
              {marketTab === "buy" && (
                <div className="lab-market-list">
                  {(marketRef.current?.open() ?? []).filter((l) => !marketRef.current?.isMine(l)).map((l) => (
                    <div key={l.id}>
                      <span className="g">{ITEMS[l.item].glyph}</span>
                      <span className="n">
                        {ITEMS[l.item].name}
                        <i>@{l.seller}</i>
                      </span>
                      <button
                        onClick={() => {
                          const r = marketRef.current?.buy(l);
                          if (r === "ok") {
                            say(`bought: ${ITEMS[l.item].name}`, true);
                            track("market-bought");
                          } else if (r === "poor") say("not enough ◈", true);
                          else if (r === "gone") say("someone was faster", true);
                        }}
                      >
                        {l.price} ◈
                      </button>
                    </div>
                  ))}
                  {!(marketRef.current?.open() ?? []).filter((l) => !marketRef.current?.isMine(l)).length && <p className="note">nothing for sale yet. be the first: sell something.</p>}
                </div>
              )}
              {marketTab === "sell" && (
                <>
                  <label className="toggle">
                    <span>object</span>
                    <select value={sellItem} onChange={(e) => setSellItem(e.target.value as ItemId)}>
                      <option value="">choose from your bag…</option>
                      {(Object.keys(bag) as ItemId[])
                        .filter((id) => bag[id])
                        .map((id) => (
                          <option key={id} value={id}>
                            {ITEMS[id].name} ×{bag[id]}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="toggle">
                    <span>price in ◈</span>
                    <input className="lab-post-cap" type="number" min={1} max={999} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
                  </label>
                  <p className="note">it goes on a stall with your name. you're paid when someone buys it, even if you're away.</p>
                </>
              )}
              {marketTab === "mine" && (
                <div className="lab-market-list">
                  {(marketRef.current?.mine() ?? []).map((l) => (
                    <div key={l.id}>
                      <span className="g">{ITEMS[l.item].glyph}</span>
                      <span className="n">
                        {ITEMS[l.item].name}
                        <i>{l.soldTo ? `sold to @${l.soldTo}` : `${l.price} ◈`}</i>
                      </span>
                      {!l.soldTo && <button onClick={() => marketRef.current?.cancel(l)}>take back</button>}
                    </div>
                  ))}
                  {!(marketRef.current?.mine() ?? []).length && <p className="note">your stall is empty.</p>}
                </div>
              )}
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setMarketTab(null)}>close</button>
              {marketTab === "sell" && (
                <button
                  className="done"
                  onClick={() => {
                    if (!sellItem) return say("choose an object first", true);
                    if (marketRef.current?.sell(sellItem, Number(sellPrice))) {
                      say(`on your stall: ${ITEMS[sellItem].name} · ${Math.round(Number(sellPrice))} ◈`, true);
                      setSellItem("");
                      setMarketTab("mine");
                      track("market-listed");
                    } else say("price 1–999 ◈", true);
                  }}
                >
                  put it on my stall
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {notesOpen && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box">
            <div className="lab-settings-tabs">
              <button className={notesOpen === "write" ? "on" : ""} onClick={() => setNotesOpen("write")}>
                write
              </button>
              <button className={notesOpen === "inbox" ? "on" : ""} onClick={() => setNotesOpen("inbox")}>
                inbox {notesRef.current?.inbox().length ? `· ${notesRef.current.inbox().length}` : ""}
              </button>
            </div>
            <div className="lab-settings-body">
              {notesOpen === "write" ? (
                <>
                  <input className="lab-post-cap" value={noteTo} maxLength={17} onChange={(e) => setNoteTo(e.target.value)} placeholder="to @nickname (or empty: leave it right here)" />
                  <input className="lab-post-cap" value={noteText} maxLength={120} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendNote()} placeholder="your note" autoFocus />
                  <p className="note">notes are like postcards: not private. no links, no phone numbers.</p>
                </>
              ) : (
                <div className="lab-inbox">
                  {(notesRef.current?.inbox() ?? []).map((n) => (
                    <div key={n.id}>
                      <b>@{n.from}</b> <i>{Math.max(1, Math.round((Date.now() - n.t) / 60000))} min ago</i>
                      <span>{n.text}</span>
                      <button
                        onClick={() => {
                          setNoteTo(n.from);
                          setNotesOpen("write");
                        }}
                      >
                        reply
                      </button>
                    </div>
                  ))}
                  {!notesRef.current?.inbox().length && <p className="note">no notes yet. leave one for someone.</p>}
                </div>
              )}
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setNotesOpen(null)}>close</button>
              {notesOpen === "write" && (
                <button className="done" onClick={sendNote}>
                  {noteTo.trim() ? "send" : "leave it here"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {noteView && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop} onClick={() => setNoteView(null)}>
          <div className="lab-settings-box">
            <div className="lab-settings-body">
              <b className="lab-note-from">a note from @{noteView.from}</b>
              <p className="lab-note-text">{noteView.text}</p>
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setNoteView(null)}>close</button>
              <button
                className="done"
                onClick={(e) => {
                  e.stopPropagation();
                  setNoteTo(noteView.from);
                  setNoteView(null);
                  setNotesOpen("write");
                }}
              >
                reply
              </button>
            </div>
          </div>
        </div>
      )}
      {composer && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box">
            <div className="lab-settings-tabs">
              <button className={composer.mode === "photo" ? "on" : ""} onClick={() => setComposer({ mode: "photo", img: null })}>
                photo
              </button>
              <button className={composer.mode === "draw" ? "on" : ""} onClick={() => setComposer({ mode: "draw", img: null })}>
                draw
              </button>
            </div>
            <div className="lab-settings-body">
              {composer.mode === "photo" ? (
                <label className="lab-post-pick">
                  {composer.img ? <img src={composer.img} alt="" /> : <span>tap to choose a photo</span>}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setComposer({ mode: "photo", img: await shrink(f) });
                    }}
                  />
                </label>
              ) : (
                <div className="lab-post-draw">
                  <canvas
                    ref={pad}
                    width={320}
                    height={320}
                    onPointerDown={(e) => {
                      const c = e.currentTarget, g = c.getContext("2d")!, r = c.getBoundingClientRect();
                      c.setPointerCapture(e.pointerId);
                      g.strokeStyle = ink;
                      g.lineWidth = ink === "#0b0b0b" ? 18 : 4;
                      g.lineCap = "round";
                      g.beginPath();
                      g.moveTo(((e.clientX - r.left) / r.width) * 320, ((e.clientY - r.top) / r.height) * 320);
                      c.dataset.down = "1";
                    }}
                    onPointerMove={(e) => {
                      const c = e.currentTarget;
                      if (c.dataset.down !== "1") return;
                      const g = c.getContext("2d")!, r = c.getBoundingClientRect();
                      g.lineTo(((e.clientX - r.left) / r.width) * 320, ((e.clientY - r.top) / r.height) * 320);
                      g.stroke();
                    }}
                    onPointerUp={(e) => (e.currentTarget.dataset.down = "")}
                  />
                  <div className="inks">
                    {["#fff6e2", "#ff8aa8", "#9fe8ff", "#d8ff9a", "#ffd27a", "#0b0b0b"].map((c) => (
                      <button key={c} className={ink === c ? "on" : ""} style={{ background: c }} onClick={() => setInk(c)} aria-label={c === "#0b0b0b" ? "eraser" : "ink"} />
                    ))}
                  </div>
                </div>
              )}
              <input className="lab-post-cap" value={caption} maxLength={80} onChange={(e) => setCaption(e.target.value)} placeholder="caption (optional)" />
              <label className="lab-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>
                  I made this myself. I let seeface1 show it in the labyrinth and in seeface1's promotion, for free, with my name. It stays mine and I can have it removed any time.{" "}
                  <a href="/artists" target="_blank" rel="noreferrer">
                    the artist agreement
                  </a>
                </span>
              </label>
              <p className="note">it hangs on the wall in front of you. everyone sees it once it's approved.</p>
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setComposer(null)}>cancel</button>
              <button className="done" onClick={() => void hangPost()}>
                hang it here
              </button>
            </div>
          </div>
        </div>
      )}
      {viewing && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop} onClick={() => setViewing(null)}>
          <div className="lab-settings-box lab-post-view" onClick={(e) => e.stopPropagation()}>
            <img src={viewing.img} alt="" />
            <div className="lab-settings-body">
              <b>@{viewing.nick}</b>
              {viewing.cap && <span>{viewing.cap}</span>}
              {postsRef.current?.isPending(viewing.id) && <p className="note">only you can see this until it's approved.</p>}
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setViewing(null)}>close</button>
              <button
                className="done"
                onClick={() => {
                  const p = postsRef.current;
                  if (!p) return;
                  p.like(viewing.id, !p.liked(viewing.id));
                  track("post-like");
                }}
              >
                {postsRef.current?.liked(viewing.id) ? "♥" : "♡"} {postsRef.current?.likeCount(viewing.id) ?? 0}
              </button>
            </div>
          </div>
        </div>
      )}

      {soulAsk && (
        <div className="lab-bag" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-bag-title">leaving the after life?</div>
          <div className="lab-soul">
            <p>
              save your soul. register <b>{nick}</b> and your ◈ {readProgress().blood}, your best run and your {bagCount} objects will wait for you, on any device.
            </p>
            <input type="password" value={soulPw} onChange={(e) => setSoulPw(e.target.value)} placeholder="choose a password (6+)" autoComplete="new-password" maxLength={200} />
            <div className="row">
              <button onClick={() => void saveSoul()}>save my soul</button>
              <button onClick={() => setSoulAsk(false)}>not now</button>
            </div>
            {soulMsg && <div className="err">{soulMsg}</div>}
          </div>
        </div>
      )}

      {bagOpen && (
        <div className="lab-bag" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-bag-title">your afterlife objects · {bagCount}</div>
          {bagCount === 0 && <div className="lab-bag-empty">nothing yet. pick up relics, find treasures, or order from an After Life™ TV.</div>}
          <div className="lab-bag-grid">
            {(Object.keys(ITEMS) as ItemId[])
              .filter((id) => bag[id])
              .map((id) => (
                <div key={id} className={"lab-bag-item r" + ITEMS[id].rarity}>
                  <div className="pic">
                    <img
                      src={`/items/${id}.png`}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      onLoad={(e) => ((e.currentTarget.nextSibling as HTMLElement).style.display = "none")}
                    />
                    <span>{ITEMS[id].glyph}</span>
                  </div>
                  <b>
                    {ITEMS[id].name} {bag[id]! > 1 && <i>×{bag[id]}</i>}
                  </b>
                  <em>{ITEMS[id].blurb}</em>
                </div>
              ))}
          </div>
          <button className="lab-wish-close" onClick={() => setBagOpen(false)} aria-label="close">
            ×
          </button>
        </div>
      )}

      <button className="lab-radio" onPointerDown={stop} onPointerUp={stop} onClick={() => radioNextRef.current()} aria-label="radio: next station">
        ◍ {station.freq} <i>{station.name}</i>
      </button>
      {gramoKey && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box">
            <div className="lab-settings-body">
              <label className="toggle">
                <span>record</span>
                <select value={pickRec} onChange={(e) => setPickRec(e.target.value as RecordId)}>
                  {(Object.keys(RECORDS) as RecordId[]).map((r) => (
                    <option key={r} value={r}>
                      {RECORDS[r].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle">
                <span>effect</span>
                <select value={pickFx} onChange={(e) => setPickFx(e.target.value as FxId)}>
                  {(Object.keys(EFFECTS) as FxId[]).map((f) => (
                    <option key={f} value={f}>
                      {EFFECTS[f].name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="note">everyone nearby hears it, for 3 minutes.</p>
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setGramoKey(null)}>cancel</button>
              <button
                className="done"
                onClick={() => {
                  gramoPlayRef.current(gramoKey, pickRec, pickFx);
                  setGramoKey(null);
                }}
              >
                play for everyone
              </button>
            </div>
          </div>
        </div>
      )}
      <button className="lab-gear" onPointerDown={stop} onPointerUp={stop} onClick={() => setSettingsOpen(true)} aria-label="settings">
        ⚙
      </button>
      {settingsOpen && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box">
            <div className="lab-settings-tabs">
              {(["sound", "game", "controls", "graphics"] as const).map((t) => (
                <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="lab-settings-body">
              {tab === "sound" && (
                <>
                  {(
                    [
                      ["master", "master volume"],
                      ["effects", "effects · steps, splashes, pickups"],
                      ["ambience", "ambience · rain, wind, thunder"],
                      ["voices", "voices · sirens, songs, choirs"],
                      ["records", "gramophones & radio music"],
                      ["radio", "the radio · the Hollow's static"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="slider">
                      <span>{label}</span>
                      <input type="range" min={0} max={1} step={0.05} value={st[k]} onChange={(e) => setSettings({ [k]: Number(e.target.value) })} />
                      <i>{Math.round(st[k] * 100)}</i>
                    </label>
                  ))}
                  <p className="note">the background music has its own switch, top left (♪ on / off).</p>
                </>
              )}
              {tab === "game" && (
                <>
                  {(
                    [
                      ["showNames", "show names above people"],
                      ["showChat", "show chat"],
                      ["showHints", "show hints"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="toggle">
                      <span>{label}</span>
                      <input type="checkbox" checked={st[k]} onChange={(e) => setSettings({ [k]: e.target.checked })} />
                    </label>
                  ))}
                </>
              )}
              {tab === "controls" && (
                <>
                  <label className="slider">
                    <span>look speed</span>
                    <input type="range" min={0.3} max={2} step={0.05} value={st.lookSpeed} onChange={(e) => setSettings({ lookSpeed: Number(e.target.value) })} />
                    <i>{st.lookSpeed.toFixed(2)}</i>
                  </label>
                  <label className="toggle">
                    <span>invert look up/down</span>
                    <input type="checkbox" checked={st.invertY} onChange={(e) => setSettings({ invertY: e.target.checked })} />
                  </label>
                  <label className="toggle">
                    <span>phone stick turns you (off = side-steps)</span>
                    <input type="checkbox" checked={st.stickSteers} onChange={(e) => setSettings({ stickSteers: e.target.checked })} />
                  </label>
                  <label className="toggle">
                    <span>stick on the right side</span>
                    <input type="checkbox" checked={st.stickSide === "right"} onChange={(e) => setSettings({ stickSide: e.target.checked ? "right" : "left" })} />
                  </label>
                  <div className="keys">
                    <b>keyboard</b>
                    <span>W A S D · move</span>
                    <span>mouse drag / ← → · look</span>
                    <span>shift · run</span>
                    <span>space · jump</span>
                    <span>E · spin a cube / order from a TV</span>
                    <span>F · strike (with a knife)</span>
                    <span>G · drop a relic</span>
                    <span>P · snapshot</span>
                    <span>T / enter · talk</span>
                    <span>esc · settings</span>
                  </div>
                </>
              )}
              {tab === "graphics" && (
                <>
                  <label className="toggle">
                    <span>quality</span>
                    <select value={st.quality} onChange={(e) => setSettings({ quality: e.target.value as Settings["quality"] })}>
                      <option value="low">low (fastest)</option>
                      <option value="medium">medium</option>
                      <option value="high">high (sharpest)</option>
                    </select>
                  </label>
                  <label className="slider">
                    <span>field of view</span>
                    <input type="range" min={60} max={90} step={1} value={st.fov} onChange={(e) => setSettings({ fov: Number(e.target.value) })} />
                    <i>{st.fov}°</i>
                  </label>
                  {(
                    [
                      ["glow", "glow & light effects"],
                      ["cameraBob", "camera bob when walking"],
                      ["shake", "screen shake"],
                      ["flashes", "lightning & bright flashes"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="toggle">
                      <span>{label}</span>
                      <input type="checkbox" checked={st[k]} onChange={(e) => setSettings({ [k]: e.target.checked })} />
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => setSettings(DEFAULTS)}>reset</button>
              <button className="done" onClick={() => setSettingsOpen(false)}>
                done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* today's quests */}
      <div className={"lab-quests" + (questsOpen ? " open" : "")} onPointerDown={stop} onPointerUp={stop}>
        <button className="lab-quests-chip" onClick={() => setQuestsOpen((o) => !o)}>
          ◇ quests {questList.filter((q) => q.done).length}/{questList.length}
        </button>
        {questsOpen && (
          <ul>
            {questList.map((q) => (
              <li key={q.text} className={q.done ? "done" : ""}>
                <span>{q.done ? "✓" : "◇"}</span> {q.text}
                <em>
                  {q.done ? "done" : q.kind === "walk" ? `${q.count}/${q.goal} m` : q.kind === "dark" ? `${q.count}/${q.goal} s` : `${q.count}/${q.goal}`} · +{q.reward} ◈
                </em>
              </li>
            ))}
            <li className="hint">new quests every day · the same for everyone</li>
          </ul>
        )}
      </div>

      {notice && (
        <div className="lab-notice" key={notice}>
          {notice}
        </div>
      )}

      {/* chat with strangers: closed = a big talk button + the last lines floating;
          open = the whole conversation, who can hear you, quick phrases, send */}
      <div className={"lab-chat" + (chatOpen ? " open" : "")} style={st.showChat ? undefined : { display: "none" }} onPointerDown={stop} onPointerUp={stop}>
        {chatOpen ? (
          <div className="lab-chat-panel" onKeyDown={(e) => e.key === "Escape" && setChatOpen(false)}>
            <div className="lab-chat-head">
              {(() => {
                const h = hearers();
                return (
                  <span>
                    {h.clear ? `${h.clear} ${h.clear === 1 ? "person hears" : "people hear"} you` : "no one is close enough to hear you"}
                    {h.far ? ` · ${h.far} further away` : ""}
                  </span>
                );
              })()}
              <button className="lab-chat-x" onClick={() => setChatOpen(false)} aria-label="close chat">
                ×
              </button>
            </div>
            <div className="lab-chat-log">
              {log.length === 0 && <div className="lab-chat-empty">say hi. anyone within 30 m hears you.</div>}
              {log.map((l) => (
                <div key={l.key} className={"lab-chat-row" + (l.mine ? " mine" : "")}>
                  <button className="lab-chat-line" onClick={() => !l.mine && setLineMenu(lineMenu === l.key ? null : l.key)}>
                    <b>{l.mine ? "you" : l.nick}</b> {l.text}
                  </button>
                  {lineMenu === l.key && (
                    <span className="lab-chat-menu">
                      <button
                        onClick={() => {
                          setDraft(`@${l.nick.replace(/^◇ /, "")} `);
                          setLineMenu(null);
                          chatInput.current?.focus();
                        }}
                      >
                        reply
                      </button>
                      <button onClick={() => muteLine(l)}>mute</button>
                    </span>
                  )}
                </div>
              ))}
              <div ref={logEnd} />
            </div>
            <div className="lab-quick">
              {["hi", "where are you?", "follow me", "wait for me", "look at this", "nice", "bye"].map((q) => (
                <button key={q} type="button" onClick={() => sendChat(q)}>
                  {q}
                </button>
              ))}
            </div>
            <form
              className="lab-chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
            >
              <input ref={chatInput} autoFocus value={draft} maxLength={80} enterKeyHint="send" onChange={(e) => setDraft(e.target.value)} placeholder="type a message…" />
              <button type="submit" className="lab-chat-send" disabled={!draft.trim()} aria-label="send">
                ➝
              </button>
            </form>
            <div className="lab-emotes">
              {EMOTES.map((k) => (
                <button type="button" key={k} onClick={() => emote(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chat.map((l) => (
              <button key={l.key} className={"lab-chat-line" + (l.mine ? " mine" : "")} onClick={() => setChatOpen(true)}>
                <b>{l.mine ? "you" : l.nick}</b> {l.text}
              </button>
            ))}
            <button className="lab-chat-open" onClick={() => setChatOpen(true)} aria-label="open chat">
              <span className="lab-chat-icon">❝</span> chat
              {unread > 0 && <span className="lab-chat-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
          </>
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
