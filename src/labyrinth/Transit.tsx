// The teleport transit (TELEPORT_DURATION_MS): you're between two places while
// the destination loads. Lost signal + redacted archive, in the teleport violet:
// a rift opening, the see/face mark flickering through tape noise, redaction
// bars sweeping past, and a packet bar filling up. No words (quiet-screen rule).
// Everything animates with transform/opacity only, so it costs weak phones
// almost nothing while the 3D view is paused behind it.
// `promo` is an optional slot (a tip or campaign card) under the mark.
import { useMemo, type ReactNode } from "react";
import { t as tr } from "../i18n";
import "./Transit.scss";

const PACKETS = 24;

let noiseUrl = "";
function noise() {
  if (noiseUrl) return noiseUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  const d = g.createImageData(96, 96);
  for (let k = 0; k < d.data.length; k += 4) {
    const v = Math.random() * 255;
    d.data[k] = d.data[k + 1] = d.data[k + 2] = v;
    d.data[k + 3] = 40 + Math.random() * 60;
  }
  g.putImageData(d, 0, 0);
  return (noiseUrl = c.toDataURL());
}

export default function Transit({ progress, promo }: { progress: number; promo?: ReactNode }) {
  const lit = Math.round(progress * PACKETS);
  // redaction bars: a few per trip, at random heights and speeds
  const bars = useMemo(() => Array.from({ length: 5 }, (_, k) => ({ top: 8 + Math.random() * 84, w: 18 + Math.random() * 40, d: 2.6 + Math.random() * 3, delay: k * 1.7 + Math.random() })), []);
  return (
    <div className="lab-transit" role="progressbar" aria-label={tr("teleport")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} style={{ ["--noise" as string]: `url(${noise()})`, ["--p" as string]: progress }}>
      <div className="lab-transit-noise" />
      <div className="lab-transit-rift">
        {[0, 1, 2, 3].map((k) => (
          <i key={k} style={{ animationDelay: `${k * 0.9}s` }} />
        ))}
      </div>
      <div className="lab-transit-mark">
        <img src="/imgs/seeface-logo-transparent.png" alt="" />
        <img src="/imgs/seeface-logo-transparent.png" alt="" aria-hidden />
      </div>
      {bars.map((b, k) => (
        <b key={k} className="lab-transit-redact" style={{ top: `${b.top}%`, width: `${b.w}%`, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }} />
      ))}
      <div className="lab-transit-scan" />
      {promo && <div className="lab-transit-promo">{promo}</div>}
      <div className="lab-transit-bar">
        {Array.from({ length: PACKETS }, (_, k) => (
          <span key={k} className={k < lit ? "on" : k === lit ? "now" : ""} />
        ))}
      </div>
    </div>
  );
}
