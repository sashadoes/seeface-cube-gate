import { useEffect, useState } from "react";
import { getRank, subscribe } from "../cube/rewards";
import { SITE_URL, WEB3FORMS_ACCESS_KEY } from "../../config/form";
import { track } from "../../analytics";
import "./Seal.scss";

// A living seal in the corner: a slowly turning ring of glyphs around a
// breathing eye. Tapping it opens a small altar:
//   summon a friend → native share sheet (or copy the link)
//   speak           → contact form, emailed via Web3Forms (hidden until a key is set)

type View = "closed" | "altar" | "speak" | "sent";
type Status = "idle" | "sending" | "error";

const RING = "☽ ✶ ◐ ♖ ▲ ☾ ⛧ ✶ ◐ ☽ ♔ ▲ ";

// The seal must never spin the cube or enter a digit.
const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
const guards = {
  onMouseDown: swallow,
  onMouseUp: swallow,
  onPointerDown: swallow,
  onPointerUp: swallow,
  onTouchStart: swallow,
  onTouchEnd: swallow,
};

export default function Seal() {
  const [view, setView] = useState<View>("closed");
  const [copied, setCopied] = useState(false);
  const [who, setWho] = useState("");
  const [words, setWords] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const canSpeak = WEB3FORMS_ACCESS_KEY.length > 0;
  const [rank, setRank] = useState(getRank);
  useEffect(() => subscribe(() => setRank(getRank())), []);

  const summon = async () => {
    track("share-opened");
    const data = { title: "seeface1", url: SITE_URL };
    try {
      if (navigator.share) {
        await navigator.share(data);
        track("share-sent");
        return;
      }
    } catch {
      return; // the visitor closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(SITE_URL);
      track("share-copied");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard blocked: nothing else to do
    }
  };

  const speak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!words.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: "seeface1.world: someone spoke to the cube",
          from_name: "seeface1 cube",
          who: who.trim() || "(nameless)",
          message: words.trim(),
        }),
      });
      const out = await res.json();
      if (!out.success) throw new Error("not sent");
      track("contact-sent");
      setStatus("idle");
      setWho("");
      setWords("");
      setView("sent");
      setTimeout(() => setView("closed"), 3200);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className={"seal-root view-" + view} {...guards} onClick={swallow}>
      {view !== "closed" && (
        <div className="altar">
          <button className="altar-close" onClick={() => setView("closed")} aria-label="close">
            ×
          </button>

          {view === "altar" && (
            <div className="altar-choices">
              <button onClick={summon}>{copied ? "the link is yours" : "summon a friend"}</button>
              {canSpeak && <button onClick={() => setView("speak")}>speak</button>}
            </div>
          )}

          {view === "speak" && (
            <form className="altar-form" onSubmit={speak}>
              <input
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="your name or @"
                maxLength={60}
                autoComplete="off"
              />
              <textarea
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="your words"
                maxLength={1000}
                rows={4}
              />
              <button type="submit" disabled={!words.trim() || status === "sending"}>
                {status === "sending" ? "…" : "offer ⛧"}
              </button>
              {status === "error" && <span className="altar-error">✕</span>}
            </form>
          )}

          {view === "sent" && <div className="altar-sent">⛧</div>}
        </div>
      )}

      <button
        className="seal"
        onClick={() => setView((v) => (v === "closed" ? "altar" : "closed"))}
        aria-label="the seal"
      >
        <svg className="seal-ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path id="seal-circle" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
          </defs>
          <circle cx="50" cy="50" r="46" />
          <circle cx="50" cy="50" r="30" />
          <text>
            <textPath href="#seal-circle">{RING + RING}</textPath>
          </text>
        </svg>
        {rank > 0 && (
          <svg className="seal-ranks" viewBox="0 0 100 100" aria-hidden="true">
            {Array.from({ length: Math.min(rank, 12) }, (_, i) => {
              const a = (i / Math.min(rank, 12)) * Math.PI * 2 - Math.PI / 2;
              return <circle key={i} cx={50 + Math.cos(a) * 52} cy={50 + Math.sin(a) * 52} r="3" />;
            })}
          </svg>
        )}
        <span className="seal-eye">
          <span className="seal-pupil" />
        </span>
      </button>
    </div>
  );
}
