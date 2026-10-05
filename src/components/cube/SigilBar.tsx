import { useEffect, useRef, useState } from "react";
import { SIGILS, snapshot, subscribe } from "./rewards";
import "./Rewards.scss";

/** Seven faint sigil slots that light up as they're collected, plus streak notches. No text. */
export default function SigilBar() {
  const [s, setS] = useState(snapshot);
  const [fresh, setFresh] = useState<string | null>(null);
  const [burnt, setBurnt] = useState<string | null>(null);
  const prev = useRef(s.found);

  useEffect(
    () =>
      subscribe(() => {
        const next = snapshot();
        const gained = next.found.find((g) => !prev.current.includes(g));
        const lost = prev.current.find((g) => !next.found.includes(g));
        if (gained) {
          setFresh(gained);
          setTimeout(() => setFresh(null), 2200);
        }
        if (lost) {
          setBurnt(lost);
          setTimeout(() => setBurnt(null), 2400);
        }
        prev.current = next.found;
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
            className={"sigil" + (s.found.includes(g) ? " found" : "") + (fresh === g ? " fresh" : "") + (burnt === g ? " burnt" : "")}
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
