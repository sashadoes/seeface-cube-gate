// /chamber: the Creation Chamber. Full-screen, dark. SeeFace speaks first; the
// artist talks (text or voice) and shares images/sounds; every reply can patch the
// room's blueprint, and the preview rebuilds live. Desktop: chat | room side by side.
// Phones: a toggle. Everything is saved on the server as it happens.
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { chamber, redeem, requestLink, say, submitRoom, token, type Asset, type ChamberState, type Message } from "./api";
import type { Blueprint } from "./types";
import { Composer } from "./Composer";
import { Thumb } from "./Thumb";
import { track } from "../analytics";
import "./architects.scss";
import "./chamber.scss";

const RoomPreview = lazy(() => import("./room/RoomPreview"));

const ERR: Record<string, string> = {
  limit: "SeeFace rests until tomorrow (today's messages are used up). Your room is saved.",
  submitted: "Your room is with the labyrinth now. You can't change it while it's being reviewed.",
  offline: "The chamber can't be reached. Check your connection and try again.",
  failed: "SeeFace lost the thread. Say it again?",
};

export default function Chamber() {
  const [state, setState] = useState<ChamberState | null>(null);
  const [need, setNeed] = useState<"" | "signin" | "apply" | "offline">("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [status, setStatus] = useState("draft");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(150);
  const [view, setView] = useState<"chat" | "room">("chat");
  const [walk, setWalk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  async function load() {
    // a sign-in link: /chamber/#code=…
    const code = /code=([0-9a-f]{48})/.exec(location.hash)?.[1];
    if (code) {
      history.replaceState(null, "", location.pathname);
      await redeem(code);
    }
    if (!token()) return setNeed("signin");
    const r = await chamber();
    if (!r.ok) return setNeed(r.status === 401 ? "signin" : r.status === 404 ? "apply" : "offline");
    setState(r);
    setMessages(r.messages);
    setAssets(r.assets);
    setBp(r.room.blueprint);
    setStatus(r.room.status);
    setLeft(r.left);
    track("chamber-open");
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const busy = streaming !== null;
  const locked = status !== "draft" && status !== "rejected";

  function send(text: string, attach: string[] = []) {
    if (!text.trim() || busy) return;
    setError("");
    setMessages((m) => [...m, { role: "artist", text, at: new Date().toISOString(), assets: attach }]);
    setStreaming("");
    say(text, attach, (e) => {
      if (e.t === "delta") setStreaming((s) => (s ?? "") + e.text);
      else if (e.t === "done") {
        setStreaming(null);
        setMessages((m) => [...m, { role: "seeface", text: e.reply, at: new Date().toISOString() }]);
        setBp(e.blueprint);
        setLeft(e.left);
      } else {
        setStreaming(null);
        setError(ERR[e.error] ?? ERR.failed);
      }
    });
    track("chamber-say");
  }

  async function submit() {
    setSubmitting(true);
    const r = await submitRoom();
    setSubmitting(false);
    if (r.message) setMessages((m) => [...m, r.message!]);
    if (r.ok && r.status) {
      setStatus(r.status);
      track("chamber-submitted");
    }
    setView("chat");
  }

  if (need) return <Gate need={need} />;
  if (!state || !bp) return <main className="arch chamber" />;

  return (
    <main className={`arch chamber view-${view}`}>
      <header className="ch-top">
        <div className="ch-title">
          <span className="arch-small">the creation chamber</span>
          <b>{bp.title || "an unnamed room"}</b>
        </div>
        <div className="ch-toggle" role="tablist">
          <button role="tab" aria-selected={view === "chat"} onClick={() => setView("chat")}>
            chat
          </button>
          <button role="tab" aria-selected={view === "room"} onClick={() => setView("room")}>
            room
          </button>
        </div>
      </header>

      <div className="ch-split">
        <div className="ch-chat" aria-label="conversation with SeeFace">
          <div className="ch-log" ref={log} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`ch-msg ${m.role}`}>
                {m.assets?.length ? (
                  <div className="ch-attached">
                    {m.assets.map((id) => {
                      const a = assets.find((x) => x.id === id);
                      return a ? <Thumb key={id} asset={a} /> : null;
                    })}
                  </div>
                ) : null}
                {m.text}
              </div>
            ))}
            {streaming !== null && <p className="ch-msg seeface streaming">{streaming || <span className="ch-dots">· · ·</span>}</p>}
            {error && <p className="ch-msg system">{error}</p>}
            {status === "rejected" && state.room.admin_note && <p className="ch-msg system">From the labyrinth's keepers: {state.room.admin_note}</p>}
          </div>
          {locked ? (
            <p className="ch-locked">{status === "submitted" ? "Submitted. The labyrinth is reviewing your room." : status === "approved" || status === "live" ? "Your door is open." : ""}</p>
          ) : (
            <Composer disabled={busy} left={left} onSend={send} onUploaded={(a) => setAssets((x) => [...x, a])} assets={assets} />
          )}
        </div>

        <div className="ch-room" aria-label="your room">
          <Suspense fallback={<div className="ch-room-wait">the room is forming…</div>}>
            <RoomPreview blueprint={bp} walk={walk} onExit={() => setWalk(false)} />
          </Suspense>
          <div className="ch-actions">
            <button className="ch-btn" onClick={() => setWalk(true)}>
              Enter my room
            </button>
            {!locked && (
              <button className="ch-btn primary" onClick={submit} disabled={submitting || busy}>
                Submit to the labyrinth
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Not signed in / never applied / server down. */
function Gate({ need }: { need: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    await requestLink(email.trim());
    setSent(true);
  }
  return (
    <main className="arch">
      <div className="arch-wrap" style={{ paddingTop: 80 }}>
        <h1>The Creation Chamber</h1>
        {need === "offline" && <p>The chamber can't be reached right now. Try again in a minute.</p>}
        {need === "apply" && (
          <p>
            This account hasn't answered the call yet. <a href="/architects/join/">Answer it here →</a>
          </p>
        )}
        {need === "signin" &&
          (sent ? (
            <p>If {email} answered the call, a link to your chamber is on its way. Open it on this device.</p>
          ) : (
            <form className="arch-form" onSubmit={send}>
              <p>Already an Architect? Enter the email you applied with and we'll send you a way back in.</p>
              <label htmlFor="g-email">Email</label>
              <input id="g-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <button className="arch-cta" type="submit">
                send me a link
              </button>
              <p className="arch-small" style={{ marginTop: 30 }}>
                <a href="/architects/">not an architect yet? the call →</a>
              </p>
            </form>
          ))}
      </div>
    </main>
  );
}
