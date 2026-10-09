// The whole screen: the 3D world plus exactly three buttons (📻 RADIO, 🎙 MIC, 👤 ME).
// Everything else lives IN the world (signs, names over heads) or in one-level overlays.
import { useEffect, useRef, useState } from "react";
import { createGame, type Game } from "./engine/game.ts";
import { getAudio } from "./audio/engine.ts";
import type { BlobKind } from "./avatar/blob.ts";

const phone = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export function World() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [falling, setFalling] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const blob = (localStorage.getItem("sf1w.blob") as BlobKind) || "moth";
    const game = createGame(canvasRef.current!, { blob, phone });
    gameRef.current = game;
    game.start();
    performance.mark("world-playable");
    const offs = [
      game.on("fallStart", () => setFalling(true)),
      game.on("fallEnd", () => {
        setFlash(true);
        setTimeout(() => setFlash(false), 380);
        setFalling(false);
      }),
    ];
    // the audio engine may only start on a gesture (mobile)
    const unlock = () => getAudio().resume();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    (window as unknown as { __world: unknown }).__world = { game, stats: () => game.stats() };
    return () => {
      offs.forEach((o) => o());
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      game.dispose();
    };
  }, []);

  return (
    <div className="w-root">
      <canvas ref={canvasRef} className="w-canvas" />
      <div className={`w-fall ${falling ? "on" : ""}`} />
      <div className={`w-flash ${flash ? "on" : ""}`} />

      <button className="w-btn w-me" aria-label="me">
        <span className="w-face">◕‿◕</span>
      </button>
      <button className="w-btn w-radio" aria-label="radio">📻</button>
      <button className="w-btn w-mic" aria-label="hold to talk">🎙</button>
    </div>
  );
}
