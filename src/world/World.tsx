// The whole screen: the 3D world plus exactly three buttons (📻 RADIO, 🎙 MIC, 👤 ME).
// Everything else lives IN the world (signs, names over heads) or in one-level overlays.
import { useEffect, useRef, useState } from "react";
import { createGame, type Game } from "./engine/game.ts";
import { getAudio } from "./audio/engine.ts";
import type { BlobKind } from "./avatar/blob.ts";
import { startSession, ui, useUi, type Session } from "./session.ts";
import { Mic } from "./ui/Mic.tsx";
import { Card } from "./ui/Card.tsx";
import { Composer } from "./ui/Composer.tsx";
import { Radio } from "./ui/Radio.tsx";
import { Onboarding } from "./ui/Onboarding.tsx";
import { Me } from "./ui/Me.tsx";
import { flag } from "./flags.ts";

const phone = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export function World() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [falling, setFalling] = useState(false);
  const [flash, setFlash] = useState(false);
  const [composer, setComposer] = useState(false);
  const [radio, setRadio] = useState(false);
  const [me, setMe] = useState(false);
  const [onboarding, setOnboarding] = useState(() => flag("onboarding") && !seen("sf1w.onboarded"));
  const quests = useUi("quests");
  const room = useUi("room");
  const card = useUi("card");
  const coins = useUi("coins");
  const notice = useUi("notice");
  const host = useUi("host");
  const reactions = useUi("reactions");
  const live = useUi("live");
  const blob = useUi("blob");

  useEffect(() => {
    const g = createGame(canvasRef.current!, { blob: (ui.get().blob as BlobKind) || "moth", phone });
    const s = startSession(g);
    setGame(g);
    setSession(s);
    g.start();
    performance.mark("world-playable");
    const offs = [
      g.on("fallStart", () => setFalling(true)),
      g.on("fallEnd", () => {
        setFlash(true);
        setTimeout(() => setFlash(false), 380);
        setFalling(false);
      }),
    ];
    g.input.onTap((x, y) => {
      const id = s.pick({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 });
      if (id) ui.set({ card: id });
      return !!id;
    });
    // the audio engine may only start on a gesture (mobile); the 3-note signature greets you
    let greeted = false;
    const unlock = () => {
      void getAudio().resume().then(() => {
        if (!greeted) ((greeted = true), getAudio().sfx2.logo());
      });
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    (window as unknown as { __world: unknown }).__world = { game: g, session: s, ui, stats: () => g.stats() };
    return () => {
      offs.forEach((o) => o());
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      s.dispose();
      g.dispose();
    };
  }, []);

  // auto-drop: fall into the busiest live room (once the room list has arrived)
  const dropped = useRef(false);
  useEffect(() => {
    if (!session || !game || onboarding || dropped.current) return;
    dropped.current = true;
    const go = () => {
      if (!game.room()) session.jumpTo(session.busiest());
    };
    if (ui.get().rooms.length) setTimeout(go, 300);
    else {
      const off = ui.subscribe(() => {
        if (ui.get().rooms.length) {
          off();
          setTimeout(go, 300);
        }
      });
      setTimeout(() => (off(), go()), 3500);
    }
  }, [session, game, onboarding]);

  const showNotice = notice && Date.now() - notice.at < 4000;
  const showHost = host && Date.now() - host.at < 9000;
  useTicker(!!(showNotice || showHost || reactions.length));

  return (
    <div className={`w-root ${live ? "is-live" : ""}`}>
      <canvas ref={canvasRef} className="w-canvas" />
      <div className={`w-fall ${falling ? "on" : ""}`} />
      <div className={`w-flash ${flash ? "on" : ""}`} />

      {showHost && (
        <div className="w-host" key={host.at}>
          <span className="w-ai">AI host</span> {host.text}
        </div>
      )}
      {showNotice && <div className="w-notice" key={notice.at}>{notice.text}</div>}
      <div className="w-reactions">
        {reactions.filter((r) => Date.now() - r.at < 2600).map((r) => (
          <span key={r.id} style={{ left: `${20 + ((r.id * 37) % 60)}%` }}>
            {r.emoji}
          </span>
        ))}
      </div>

      {!onboarding && room && !quests.sayHi && <div className="w-quest q-mic" data-testid="quest">Say hi · +20</div>}
      {!onboarding && quests.sayHi && !quests.spinRadio && !radio && <div className="w-quest q-radio" data-testid="quest">Spin the radio · +10</div>}

      <button className="w-btn w-me" aria-label="me" data-testid="me" onClick={() => setMe((m) => !m)}>
        <span className={`w-face blob-${blob}`}>◕‿◕</span>
        <span className="w-coins" data-testid="coins">{coins}</span>
      </button>
      <button className={`w-btn w-radio ${radio ? "on" : ""}`} aria-label="radio" data-testid="radio" onClick={() => setRadio((r) => !r)}>
        📻
      </button>
      {session && <Mic session={session} onTap={() => setComposer(true)} />}

      {session && card && <Card session={session} id={card} onClose={() => ui.set({ card: null })} />}
      {session && composer && <Composer session={session} onClose={() => setComposer(false)} />}
      {session && radio && <Radio session={session} onClose={() => setRadio(false)} />}
      {session && me && <Me session={session} onClose={() => setMe(false)} />}
      {session && onboarding && (
        <Onboarding
          session={session}
          onDone={() => {
            mark("sf1w.onboarded");
            setOnboarding(false);
          }}
        />
      )}
    </div>
  );
}

const seen = (k: string) => {
  try {
    return !!localStorage.getItem(k);
  } catch {
    return false;
  }
};
const mark = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {
    // private mode
  }
};

/** re-render while something time-based is on screen (fades) */
function useTicker(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [on]);
}
