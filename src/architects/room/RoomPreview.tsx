// The room, live: an orbiting preview that rebuilds on every blueprint change,
// and (walk = true) a full-screen first-person walk with the room's welcome words,
// its ambience, and an on-screen stick on touch screens.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Blueprint } from "../types";
import { assetUrl } from "../api";
import type { Resolve } from "./build";
import { RoomView } from "./view";
import "./room.scss";

type Props = { blueprint: Blueprint; walk: boolean; onExit: () => void; resolve?: Resolve; seed?: string };

const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export default function RoomPreview({ blueprint, walk, onExit, resolve = (id) => assetUrl(id), seed = "room" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<RoomView | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      view.current = new RoomView(host.current!);
    } catch {
      setFailed(true); // no WebGL
    }
    return () => view.current?.dispose();
  }, []);

  useEffect(() => {
    view.current?.setBlueprint(blueprint, resolve, seed);
  }, [JSON.stringify(blueprint)]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (walk) {
      v.enterWalk();
      v.startAudio(blueprint, resolve);
      setWelcome(true);
      const id = setTimeout(() => setWelcome(false), 7000);
      const esc = (e: KeyboardEvent) => e.key === "Escape" && onExit();
      addEventListener("keydown", esc);
      return () => {
        clearTimeout(id);
        removeEventListener("keydown", esc);
      };
    }
    v.exitWalk();
  }, [walk]);

  if (failed) return <div className="room-fail">This device can't draw the room (WebGL is off). Your blueprint is still saved.</div>;

  return (
    <div className={`room-preview ${walk ? "walking" : ""}`}>
      <div className="room-canvas" ref={host} />
      {!blueprint.archetype && !walk && <div className="room-hint">the room takes shape as you talk</div>}
      {walk && (
        <>
          <button className="room-exit" onClick={onExit} aria-label="leave the room">
            ✕
          </button>
          <div className={`room-welcome ${welcome ? "on" : ""}`} onClick={() => setWelcome(false)}>
            {blueprint.title && <h2>{blueprint.title}</h2>}
            {blueprint.welcome_text && <p>{blueprint.welcome_text}</p>}
          </div>
          {touch ? <Stick onMove={(x, y) => view.current?.setStick(x, y)} /> : <div className="room-keys">drag to look · W A S D to walk · shift to run · esc to leave</div>}
        </>
      )}
    </div>
  );
}

/** a thumb stick, bottom left */
function Stick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 46;
  const set = (e: RPointerEvent) => {
    const b = base.current!.getBoundingClientRect();
    let x = e.clientX - (b.left + b.width / 2),
      y = e.clientY - (b.top + b.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) (x *= R / d), (y *= R / d);
    setKnob({ x, y });
    onMove(x / R, -y / R);
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      className="room-stick"
      ref={base}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
