// The text bubble (for people who don't want to speak) + 5 one-tap reactions in rooms + raise
// hand in big rooms. One level, closes after sending.
import { useState } from "react";
import { EMOJIS, MAX_BUBBLE } from "../../../shared/world/protocol.ts";
import { useUi, type Session } from "../session.ts";

export function Composer({ session, onClose }: { session: Session; onClose: () => void }) {
  const [text, setText] = useState("");
  const room = useUi("room");
  const stage = useUi("stage");
  const canSpeak = useUi("canSpeak");
  const hand = useUi("hand");
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
