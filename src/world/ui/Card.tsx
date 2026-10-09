// Tap someone → a tiny card: Follow · Mute · Report · Block. That's all (hosts also see "bring up"
// for raised hands, and owners/hosts can ask someone to leave).
import { useState } from "react";
import { useUi, type Session } from "../session.ts";

const REASONS = ["harassment", "hate", "sexual content", "seems under 18", "spam"];

export function Card({ session, id, onClose }: { session: Session; id: string; onClose: () => void }) {
  const follows = useUi("follows");
  const mutes = useUi("mutes");
  const role = useUi("role");
  const stage = useUi("stage");
  const [reporting, setReporting] = useState(false);
  const v = session.others.view(id);
  if (!v) return null;
  const host = role === "owner" || role === "host" || role === "moderator";
  return (
    <div className="w-overlay w-card" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-card-name">{v.name}</div>
      {!reporting ? (
        <div className="w-row">
          <button onClick={() => session.follow(id)}>{follows.includes(id) ? "following" : "follow"}</button>
          <button onClick={() => session.mute(id)}>{mutes.includes(id) ? "unmute" : "mute"}</button>
          <button onClick={() => setReporting(true)}>report</button>
          <button
            onClick={() => {
              session.block(id);
              onClose();
            }}
          >
            block
          </button>
        </div>
      ) : (
        <div className="w-row wrap">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                session.report(id, r);
                onClose();
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {host && (
        <div className="w-row">
          {stage && <button onClick={() => session.promote(id, v.role === "member")}>{v.role === "member" ? "bring up" : "back to listeners"}</button>}
          <button
            onClick={() => {
              session.kick(id);
              onClose();
            }}
          >
            ask to leave
          </button>
        </div>
      )}
      <button className="w-x" aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
