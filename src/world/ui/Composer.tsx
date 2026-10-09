// The text bubble (for people who don't want to speak) + 5 one-tap reactions in rooms + raise
// hand in big rooms. One level, closes after sending.
import { useState } from "react";
import { EMOJIS, MAX_BUBBLE } from "../../../shared/world/protocol.ts";
import { GIFTS } from "../../../shared/world/ledger.ts";
import { useUi, type Session } from "../session.ts";

export function Composer({ session, onClose }: { session: Session; onClose: () => void }) {
  const [text, setText] = useState("");
  const room = useUi("room");
  const stage = useUi("stage");
  const canSpeak = useUi("canSpeak");
  const hand = useUi("hand");
  const rooms = useUi("rooms");
  const me = useUi("me");
  // gifts go to whoever is speaking right now (the loudest voice in your room)
  const speaker = (() => {
    if (!room) return null;
    let best: { id: string; name: string; lv: number } | null = null;
    for (const [id, p] of session.others.poses()) {
      if (p.room !== room || !p.talking || id === me) continue;
      const lv = session.voices.level(id);
      if (!best || lv > best.lv) best = { id, name: session.others.view(id)?.name ?? "", lv };
    }
    return best;
  })();
  void rooms;
  const send = () => {
    const t = text.trim();
    if (t) session.bubble(t);
    onClose();
  };
  return (
    <div className="w-overlay w-composer" onPointerDown={(e) => e.stopPropagation()}>
      {room && (
        <div className="w-row">
          {EMOJIS.map((e) => (
            <button key={e} className="w-emoji" onClick={() => (session.react(e), onClose())}>
              {e}
            </button>
          ))}
          {stage && !canSpeak && (
            <button className={hand ? "on" : ""} onClick={() => session.hand(!hand)}>
              ✋
            </button>
          )}
        </div>
      )}
      {speaker && (
        <div className="w-row">
          <span className="w-dim small" style={{ flex: 2 }}>gift {speaker.name}</span>
          {Object.entries(GIFTS).map(([k, g]) => (
            <button key={k} onClick={() => (session.gift(speaker.id, k), onClose())}>
              {g.emoji} {g.price}
            </button>
          ))}
        </div>
      )}
      <form
        className="w-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input autoFocus maxLength={MAX_BUBBLE} value={text} onChange={(e) => setText(e.target.value)} placeholder="say it in a bubble…" enterKeyHint="send" />
        <button type="submit">➝</button>
      </form>
      <button className="w-x" aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
