import { useEffect, useRef, useState } from "react";
import { SIGILS, snapshot, subscribe } from "./rewards";
import "./Rewards.scss";

/** Seven faint sigil slots that light up as they're collected, plus streak notches. No text. */
export default function SigilBar() {
  const [s, setS] = useState(snapshot);
  const [fresh, setFresh] = useState<string | null>(null);
  const prev = useRef(s.found.length);

  useEffect(
    () =>
      subscribe(() => {
        const next = snapshot();
        if (next.found.length > prev.current) {
          setFresh(next.found[next.found.length - 1]);
          setTimeout(() => setFresh(null), 2200);
        }
        prev.current = next.found.length;
        setS(next);
      }),
    []
  );

  return (
    <div className={"sigil-bar" + (s.complete ? " complete" : "")} aria-hidden="true">
      <div className="sigils">
        {SIGILS.map((g) => (
          <span
            key={g}
            className={"sigil" + (s.found.includes(g) ? " found" : "") + (fresh === g ? " fresh" : "")}
          >
            {g}
          </span>
        ))}
      </div>
      <div className="streak">
        {Array.from({ length: Math.min(s.streak, 14) }, (_, i) => (
          <span key={i} className="notch" />
        ))}
        {s.crackedToday && <span className="cracked">✦</span>}
      </div>
    </div>
  );
}
