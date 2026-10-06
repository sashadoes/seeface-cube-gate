import { useEffect, useState } from "react";
import { onOnline } from "../../online";
import "./OnlineCounter.scss";

/** A breathing dot and a number: how many are here right now. No words. */
export default function OnlineCounter() {
  const [n, setN] = useState(1);
  const [pulse, setPulse] = useState(false);

  useEffect(
    () =>
      onOnline((next) => {
        setN((prev) => {
          if (next > prev) {
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
          }
          return next;
        });
      }),
    []
  );

  return (
    <div className={"online-counter" + (pulse ? " joined" : "")} aria-label={`${n} online now`}>
      <span className="dot" />
      {n}
    </div>
  );
}
