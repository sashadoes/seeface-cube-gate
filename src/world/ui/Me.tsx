// 👤 ME (one level): you, your coins, your room, Transcribe me, headphones/speakers, privacy.
import { useState } from "react";
import { getAudio } from "../audio/engine.ts";
import { useUi, type Session } from "../session.ts";
import { Library } from "./Library.tsx";

export function Me({ session, onClose, children }: { session: Session; onClose: () => void; children?: React.ReactNode }) {
  const name = useUi("name");
  const coins = useUi("coins");
  const transcribe = useUi("transcribe");
  const age = useUi("age");
  const [out, setOut] = useState(getAudio().output());
  const [confirm, setConfirm] = useState(false);
  const [lib, setLib] = useState(false);
  return (
    <div className="w-overlay w-me-panel" onPointerDown={(e) => e.stopPropagation()} data-testid="me-panel">
      <div className="w-card-name">
        {name} · <span data-testid="me-coins">{coins}</span> coins
      </div>
      {lib ? (
        <>
          <Library session={session} />
          <button className="w-back" onClick={() => setLib(false)}>
            back
          </button>
        </>
      ) : (
        <>
      {children}
      <div className="w-row">
        <button onClick={() => setLib(true)} data-testid="library">
          📚 the Library
        </button>
      </div>
      <label className="w-switch">
        <input type="checkbox" checked={transcribe} onChange={(e) => session.transcribe(e.target.checked)} data-testid="transcribe" />
        <span>
          Transcribe me
          <small>Off by default. When on, what you say becomes text for this room's owner (kept 90 days) and the Library's summary. Audio is never recorded.</small>
        </span>
      </label>
      <div className="w-row">
        {(["headphones", "speakers"] as const).map((m) => (
          <button
            key={m}
            className={out === m ? "on" : ""}
            onClick={() => {
              getAudio().setOutput(m);
              setOut(m);
            }}
          >
            {m === "headphones" ? "🎧 headphones" : "🔈 speakers"}
          </button>
        ))}
      </div>
      <div className="w-row small">
        <span className="w-dim">18+: {age === "verified" ? "checked ✓" : age === "unavailable" ? "checks not live yet" : "not checked"}</span>
      </div>
      <div className="w-row">
        <a className="w-link" href="/privacy/" target="_blank" rel="noreferrer">
          privacy
        </a>
        {!confirm ? (
          <button onClick={() => setConfirm(true)}>delete my data</button>
        ) : (
          <button
            className="danger"
            onClick={() => {
              session.forget();
              onClose();
            }}
          >
            yes, delete everything
          </button>
        )}
      </div>
        </>
      )}
      <button className="w-x" aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
