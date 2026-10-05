import { useEffect, useRef, useState } from "react";
import { CHAT_PATH, FIREBASE_CONFIG, HISTORY, MAX_LEN, SLOW_MODE_MS } from "../../config/chat";
import { track } from "../../analytics";
import "./CircleChat.scss";

// "The circle": every visitor on seeface1.world can talk to everyone else, live.
// Anonymous cult names, no links, short messages, slow mode. Messages can't be
// edited or deleted by visitors (see database.rules.json); the owner moderates
// from the Firebase console.

type Msg = { id: string; name: string; text: string; ts: number };

const GLYPHS = ["☽", "☾", "✶", "◐", "♖", "▲", "⛧", "♔"];
const NAME_KEY = "seeface-circle-name";

function circleName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  const name = `${GLYPHS[Math.floor(Math.random() * GLYPHS.length)]} ${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
  return name;
}

/** No links or handles-with-links in the circle: they become a glyph. */
function clean(text: string) {
  return text
    .replace(/(https?:\/\/|www\.)\S+/gi, "⛧")
    .replace(/\b\S+\.(com|net|org|io|ru|xyz|link|ly|me|co|app|world)\b\S*/gi, "⛧")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN);
}

export const chatEnabled = FIREBASE_CONFIG !== null;

export default function CircleChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const sendRef = useRef<((t: string) => Promise<void>) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const me = useRef(circleName());

  // Firebase is loaded only when someone opens the circle.
  useEffect(() => {
    if (!FIREBASE_CONFIG) return;
    let unsubscribe = () => {};
    let alive = true;
    (async () => {
      const [{ initializeApp, getApps }, db] = await Promise.all([
        import("firebase/app"),
        import("firebase/database"),
      ]);
      if (!alive) return;
      const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
      const database = db.getDatabase(app);
      const listRefDb = db.ref(database, CHAT_PATH);
      const q = db.query(listRefDb, db.orderByChild("ts"), db.limitToLast(HISTORY));
      unsubscribe = db.onChildAdded(q, (snap) => {
        const v = snap.val();
        if (!v || typeof v.text !== "string") return;
        setMsgs((m) => [...m.slice(-(HISTORY - 1)), { id: snap.key!, name: String(v.name), text: v.text, ts: v.ts }]);
      });
      sendRef.current = async (t: string) => {
        await db.push(listRefDb, { name: me.current, text: t, ts: db.serverTimestamp() });
      };
      setReady(true);
      track("circle-opened");
    })().catch(() => setError(true));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // slow mode countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(c - 1, 0)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = clean(text);
    if (!t || cooldown > 0 || !sendRef.current) return;
    setText("");
    setCooldown(Math.ceil(SLOW_MODE_MS / 1000));
    try {
      await sendRef.current(t);
      setError(false);
      track("circle-message");
    } catch {
      setError(true);
    }
  };

  return (
    <div className="circle">
      <div className="circle-list" ref={listRef}>
        {!ready && !error && <div className="circle-wait">◐</div>}
        {msgs.map((m) => (
          <div key={m.id} className={"circle-msg" + (m.name === me.current ? " mine" : "")}>
            <span className="circle-name">{m.name}</span>
            <span className="circle-text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="circle-form" onSubmit={send}>
        <span className="circle-me">{me.current}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="speak to the circle"
          maxLength={MAX_LEN}
          autoComplete="off"
          enterKeyHint="send"
          disabled={!ready}
        />
        <button type="submit" disabled={!ready || !clean(text) || cooldown > 0}>
          {cooldown > 0 ? cooldown : "✶"}
        </button>
      </form>
      {error && <div className="circle-error">✕</div>}
    </div>
  );
}
