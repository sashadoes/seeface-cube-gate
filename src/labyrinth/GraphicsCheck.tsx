// First visit: a short screen that explains we tune the game to the device,
// runs the ~2.5 s check, then suggests a tier: "we detected <device>.
// recommended: medium. [use recommended] [choose manually]". Same dark minimal
// look as the other panels (settings, inventory). Also reachable from
// settings → graphics → "check my device again".
import { useState } from "react";
import { t as tr } from "../i18n";
import type { Tier } from "./tiers";
import { TIER_NAMES, TIER_NOTES } from "./tierNotes";
import "./GraphicsCheck.scss";

export type CheckState = { phase: "checking"; device: string } | { phase: "result"; device: string; recommended: Tier; fps: number };

export default function GraphicsCheck({ state, current, onPick }: { state: CheckState; current: Tier; onPick: (tier: Tier, how: "recommended" | "manual") => void }) {
  const [manual, setManual] = useState(false);
  return (
    <div className="lab-gfx" role="dialog" aria-modal="true" aria-label={tr("graphics")}>
      <div className="lab-gfx-card">
        <h2>{tr("tuning the after life™ for your device")}</h2>
        <p className="note">{tr("we lower what your device can't carry, so it stays smooth, cool and easy on the battery.")}</p>
        {state.phase === "checking" ? (
          <>
            <p className="lab-gfx-device">{tr("checking {device}…", { device: tr(state.device) })}</p>
            <div className="lab-gfx-scan" aria-hidden>
              <i />
            </div>
          </>
        ) : !manual ? (
          <>
            <p className="lab-gfx-device">{tr("we detected {device}.", { device: tr(state.device) })}</p>
            <p className="lab-gfx-rec">
              {tr("recommended")}: <b>{tr(TIER_NAMES[state.recommended])}</b>
            </p>
            <p className="note">{tr(TIER_NOTES[state.recommended])}</p>
            <div className="lab-gfx-actions">
              <button className="primary" onClick={() => onPick(state.recommended, "recommended")}>
                {tr("use recommended")}
              </button>
              <button onClick={() => setManual(true)}>{tr("choose manually")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="lab-gfx-tiers">
              {(["low", "medium", "high"] as const).map((k) => (
                <button key={k} className={k === state.recommended ? "rec" : ""} aria-pressed={k === current} onClick={() => onPick(k, k === state.recommended ? "recommended" : "manual")}>
                  <b>
                    {tr(TIER_NAMES[k])}
                    {k === state.recommended ? ` · ${tr("recommended")}` : ""}
                  </b>
                  <span>{tr(TIER_NOTES[k])}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="lab-gfx-later">{tr("you can change it any time: ⚙ settings → graphics")}</p>
      </div>
    </div>
  );
}
