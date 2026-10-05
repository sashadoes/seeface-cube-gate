import { useEffect, useState } from "react";
import { getTrance, MAX_TRANCE, subscribeTrance } from "./trance";
import "./Trance.scss";

/** Five diamonds above the code line. They light up as the rhythm builds. No text. */
export default function TranceMeter() {
  const [level, setLevel] = useState(getTrance);
  useEffect(() => subscribeTrance(() => setLevel(getTrance())), []);

  return (
    <div className={"trance" + (level === MAX_TRANCE ? " max" : "")} aria-hidden="true">
      {Array.from({ length: MAX_TRANCE }, (_, i) => (
        <span key={i} className={"trance-gem" + (i < level ? " on" : "")} />
      ))}
    </div>
  );
}
