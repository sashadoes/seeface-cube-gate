// The first 30 seconds: 🎧 headphones → 18+ check + a name + one of 6 blobs → three swipeable
// one-line cards → auto-drop into the busiest live room. No tutorials beyond this.
import { useRef, useState } from "react";
import { BLOBS } from "../avatar/blob.ts";
import { getAudio } from "../audio/engine.ts";
import { funnel } from "../analytics.ts";
import { useUi, type Session } from "../session.ts";

const CARDS = [
  { text: "You found the hidden side of the internet. Real people are talking right now." },
  { text: "Every room is a live radio. Tune in, listen, hold the mic to talk.", small: "Audio is never recorded. Rooms only keep text if you switch on “Transcribe me” in 👤 (rooms with it show TRANSCRIBED over the door)." },
  { text: "Here are 100 coins. Show up, talk, earn more. 500 buys you your own room." },
];

export function Onboarding({ session, onDone }: { session: Session; onDone: () => void }) {
  const [step, setStep] = useState<"phones" | "who" | "cards">("phones");
  const [card, setCard] = useState(0);
  const age = useUi("age");
  const ageMock = useUi("ageMock");
  const connected = useUi("connected");
  const savedName = useUi("name");
  const savedBlob = useUi("blob");
  const [name, setName] = useState(savedName.startsWith("blob_") ? "" : savedName);
  const [blob, setBlob] = useState(savedBlob || "moth");
  const swipe = useRef<number | null>(null);

  const nameOk = /^[\p{L}\p{N}_. ]{2,16}$/u.test(name.trim());
  const next = () => {
    if (card < CARDS.length - 1) setCard(card + 1);
    else {
      funnel("onboarded");
      onDone();
    }
  };

  if (step === "phones")
    return (
      <div className="w-onb" data-testid="onb-phones">
        <button
          className="w-onb-phones"
          onClick={() => {
            void getAudio().resume().then(() => getAudio().sfx2.logo());
            setStep("who");
          }}
        >
          <span className="w-big">🎧</span>
          <span>Put your headphones on.</span>
          <span className="w-onb-tap">tap</span>
        </button>
      </div>
    );

  if (step === "who")
    return (
      <div className="w-onb">
        <div className="w-onb-panel">
          <div className="w-onb-q">who are you tonight?</div>
          <input data-testid="onb-name" className="w-onb-name" maxLength={16} placeholder="a name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <div className="w-blobs">
            {BLOBS.map((b) => (
              <button key={b.id} data-testid={`blob-${b.id}`} className={`w-blob-pick ${blob === b.id ? "on" : ""}`} onClick={() => setBlob(b.id)} style={{ ["--c" as string]: "#" + b.color.toString(16).padStart(6, "0") }} aria-label={b.name}>
                <span className={`w-blob-face f-${b.feature}`}>• •</span>
              </button>
            ))}
          </div>
          <div className="w-age">
            {age === "verified" ? (
              <div className="w-age-ok">✓ 18+ checked</div>
            ) : age === "unavailable" ? (
              <div className="w-age-note">Voice rooms are 18+. Age checks aren't switched on yet, so for now you can walk the labyrinth, but not hear or talk.</div>
            ) : ageMock ? (
              <button data-testid="onb-age" className="w-age-btn" onClick={() => session.ageMock()} disabled={!connected}>
                I'm 18+ · check (dev mock)
              </button>
            ) : (
              <button data-testid="onb-age" className="w-age-btn" onClick={() => session.ageStart()} disabled={!connected}>
                check I'm 18+
              </button>
            )}
          </div>
          <button
            data-testid="onb-go"
            className="w-onb-go"
            disabled={!nameOk || (age !== "verified" && age !== "unavailable")}
            onClick={() => {
              session.profile(name.trim(), blob);
              setStep("cards");
            }}
          >
            enter
          </button>
        </div>
      </div>
    );

  const c = CARDS[card];
  return (
    <div
      className="w-onb"
      data-testid="onb-cards"
      onPointerDown={(e) => (swipe.current = e.clientX)}
      onPointerUp={(e) => {
        const dx = swipe.current === null ? 0 : e.clientX - swipe.current;
        swipe.current = null;
        if (dx < -40 || Math.abs(dx) < 8) next();
        else if (dx > 40 && card > 0) setCard(card - 1);
      }}
    >
      <div className="w-onb-card" key={card}>
        <p>{c.text}</p>
        {c.small && <small>{c.small}</small>}
        <div className="w-dots">
          {CARDS.map((_, i) => (
            <span key={i} className={i === card ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
