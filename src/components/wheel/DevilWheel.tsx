import { useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import { addCoins, collect, grantMissing, reveal, snapshot, spendCoin, subscribe, RARE_SIGIL } from "../cube/rewards";
import { maxTrance } from "../cube/trance";
import { newRoomSkin } from "../cube/alive";
import { track } from "../../analytics";
import "./DevilWheel.scss";

// The devil's wheel: spend a coin, spin, win in-game prizes. 12 equal slices
// and a uniform pick, so the odds are exactly what the wheel shows. No money,
// no purchases: coins only come from play (daily coin, code, eruption, rebirth).

type Prize = "jackpot" | "double" | "sigil" | "free" | "trance" | "skin" | "nothing";

const SLICES: { prize: Prize; glyph: string }[] = [
  { prize: "jackpot", glyph: "♔" },
  { prize: "nothing", glyph: "✕" },
  { prize: "sigil", glyph: "✶" },
  { prize: "skin", glyph: "◐" },
  { prize: "nothing", glyph: "✕" },
  { prize: "double", glyph: "⛧" },
  { prize: "sigil", glyph: "✶" },
  { prize: "nothing", glyph: "✕" },
  { prize: "free", glyph: "☾" },
  { prize: "sigil", glyph: "✶" },
  { prize: "trance", glyph: "▲" },
  { prize: "nothing", glyph: "✕" },
];
const SEG = 360 / SLICES.length;

const sfx = {
  tick: new Howl({ src: ["/sounds/SwitchCube1.mp3"], volume: 0.35, preload: true }),
  win: new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.6, preload: true }),
  jackpot: new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.7, preload: true }),
  lose: new Howl({ src: ["/sounds/CubeErrorCode.mp3"], volume: 0.45, preload: true }),
};

const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
const guards = {
  onMouseDown: swallow,
  onMouseUp: swallow,
  onPointerDown: swallow,
  onPointerUp: swallow,
  onTouchStart: swallow,
  onTouchEnd: swallow,
  onTouchMove: swallow,
  onClick: swallow,
};

function buzz(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    // unsupported
  }
}

function goldRain() {
  const rain = document.createElement("div");
  rain.className = "wheel-rain";
  for (let i = 0; i < 40; i++) {
    const c = document.createElement("span");
    c.textContent = ["⊙", "♔", "✶"][i % 3];
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDelay = Math.random() * 0.9 + "s";
    c.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    rain.appendChild(c);
  }
  document.body.appendChild(rain);
  setTimeout(() => rain.remove(), 4000);
}

function award(prize: Prize) {
  track(`wheel-${prize}`);
  switch (prize) {
    case "jackpot":
      if (!collect(RARE_SIGIL)) grantMissing();
      addCoins(2);
      sfx.jackpot.play();
      goldRain();
      setTimeout(() => reveal(false), 500);
      buzz([80, 50, 80, 50, 80, 50, 300]);
      break;
    case "double":
      grantMissing();
      setTimeout(grantMissing, 500);
      sfx.win.play();
      buzz([60, 40, 160]);
      break;
    case "sigil":
      grantMissing();
      sfx.win.play();
      buzz([40, 40, 120]);
      break;
    case "free":
      addCoins(1);
      sfx.win.play();
      buzz(60);
      break;
    case "trance":
      maxTrance();
      sfx.win.play();
      buzz([30, 30, 30, 30, 90]);
      break;
    case "skin":
      newRoomSkin();
      sfx.win.play();
      buzz(60);
      break;
    case "nothing":
      sfx.lose.play();
      buzz(180);
      break;
  }
}

export default function DevilWheel() {
  const [coins, setCoins] = useState(() => snapshot().coins);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => subscribe(() => setCoins(snapshot().coins)), []);
  useEffect(() => () => clearTimeout(tickTimer.current), []);

  const spin = () => {
    if (spinning || !spendCoin()) return;
    track("wheel-spin");
    setLanded(null);
    setSpinning(true);
    const pick = Math.floor(Math.random() * SLICES.length);
    // land the chosen slice under the pointer at the top, with a little jitter
    const jitter = (Math.random() - 0.5) * SEG * 0.7;
    const target = 360 * 6 + (360 - (pick * SEG + SEG / 2)) + jitter;
    const next = angle - (angle % 360) + target;
    setAngle(next);
    buzz(20);

    // ticking that slows down with the wheel
    let delay = 45;
    const tick = () => {
      sfx.tick.play();
      delay *= 1.11;
      if (delay < 600) tickTimer.current = setTimeout(tick, delay);
    };
    tick();

    setTimeout(() => {
      clearTimeout(tickTimer.current);
      setSpinning(false);
      setLanded(pick);
      award(SLICES[pick].prize);
    }, 5200);
  };

  const close = () => {
    if (spinning) return;
    setOpen(false);
    setLanded(null);
  };

  return (
    <>
      <button
        className={"wheel-coin" + (coins > 0 ? " has" : "")}
        aria-label="the devil's wheel"
        {...guards}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="coin-face">⊙</span>
        {coins > 0 && <span className="coin-count">{coins > 9 ? "9+" : coins}</span>}
      </button>

      {open && (
        <div className="wheel-overlay" {...guards} onClick={(e) => { e.stopPropagation(); close(); }}>
          <div className="wheel-stage" onClick={swallow}>
            <div className="wheel-pointer">▼</div>
            <div
              className="wheel"
              style={{ transform: `rotate(${angle}deg)`, transitionDuration: spinning ? "5s" : "0s" }}
            >
              <svg viewBox="-100 -100 200 200" aria-hidden="true">
                {SLICES.map((s, i) => {
                  const a0 = ((i * SEG - 90) * Math.PI) / 180;
                  const a1 = (((i + 1) * SEG - 90) * Math.PI) / 180;
                  const mid = (((i + 0.5) * SEG - 90) * Math.PI) / 180;
                  const path = `M0 0 L${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A96 96 0 0 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`;
                  return (
                    <g key={i} className={"slice " + s.prize + (landed === i ? " landed" : "")}>
                      <path d={path} />
                      <text
                        x={70 * Math.cos(mid)}
                        y={70 * Math.sin(mid)}
                        transform={`rotate(${(i + 0.5) * SEG} ${70 * Math.cos(mid)} ${70 * Math.sin(mid)})`}
                      >
                        {s.glyph}
                      </text>
                    </g>
                  );
                })}
                <circle r="97" className="rim" />
                <circle r="22" className="hub" />
                <text className="hub-glyph" y="1">⛧</text>
              </svg>
            </div>
            <button className="wheel-spin" onClick={spin} disabled={spinning || coins < 1}>
              {spinning ? "…" : coins < 1 ? "⊙ 0" : `spin ⊙ ${coins}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
