import { useEffect, useRef } from "react";
import { t as tr, useLang } from "../i18n";
import { CELL, placeOf, roomOf, wallEast, wallSouth } from "./maze";
import type { MapSource } from "./LabMap";

// The radar: a small round window in the corner that turns with you (ahead is
// always up), with the corridors nearby, everyone within RANGE as warm dots,
// people further away as marks on the rim (pointing the way), the dreamed ones
// (◇) as small diamonds, and a slow sweep. Someone new coming into range makes
// it glow. Tap it for the full map.

const RANGE = 40; // metres from you to the rim
const FPS = 20;

export default function Radar({ source, onOpen }: { source: MapSource; onOpen: () => void }) {
  useLang();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    let raf = 0, last = 0, glow = 0;
    let inRange = new Set<string>();
    let first = true;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 1000 / FPS) return;
      const dt = Math.min((now - last) / 1000, 0.2);
      last = now;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const S = c.clientWidth;
      if (!S) return;
      if (c.width !== Math.round(S * dpr)) c.width = c.height = Math.round(S * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, S, S);
      const R = S / 2, k = (R - 6) / RANGE; // px per metre
      const me = source.getPos();

      g.save();
      g.beginPath();
      g.arc(R, R, R - 1, 0, Math.PI * 2);
      g.clip();
      const bg = g.createRadialGradient(R, R, 0, R, R, R);
      bg.addColorStop(0, "rgba(14,13,12,0.55)");
      bg.addColorStop(1, "rgba(4,4,5,0.82)");
      g.fillStyle = bg;
      g.fillRect(0, 0, S, S);

      // the world turns around you: ahead is up
      g.translate(R, R);
      g.rotate(me.yaw);
      const X = (x: number) => (x - me.x) * k, Y = (z: number) => (z - me.z) * k;

      // rooms and places (soft), then the walls
      const ci = Math.floor(me.x / CELL), cj = Math.floor(me.z / CELL), n = Math.ceil(RANGE / CELL) + 1;
      for (let i = ci - n; i <= ci + n; i++)
        for (let j = cj - n; j <= cj + n; j++) {
          const room = roomOf(i, j), place = !room && placeOf(i, j);
          if (!room && !place) continue;
          g.fillStyle = room ? "rgba(255,240,210,0.07)" : "rgba(255,230,184,0.05)";
          g.fillRect(X(i * CELL), Y(j * CELL), CELL * k + 0.5, CELL * k + 0.5);
        }
      g.strokeStyle = "rgba(233,228,218,0.3)";
      g.lineWidth = 1;
      g.beginPath();
      for (let i = ci - n; i <= ci + n; i++)
        for (let j = cj - n; j <= cj + n; j++) {
          if (wallEast(i, j)) g.moveTo(X((i + 1) * CELL), Y(j * CELL)), g.lineTo(X((i + 1) * CELL), Y((j + 1) * CELL));
          if (wallSouth(i, j)) g.moveTo(X(i * CELL), Y((j + 1) * CELL)), g.lineTo(X((i + 1) * CELL), Y((j + 1) * CELL));
        }
      g.stroke();

      // north: a small notch on the rim
      g.fillStyle = "rgba(255,230,184,0.7)";
      g.beginPath();
      g.moveTo(0, -R + 2), g.lineTo(3.5, -R + 9), g.lineTo(-3.5, -R + 9);
      g.fill();
      g.restore();

      // range rings + the sweep (screen space)
      g.strokeStyle = "rgba(255,240,210,0.09)";
      g.beginPath();
      g.arc(R, R, (R - 6) / 2, 0, Math.PI * 2);
      g.stroke();
      const sweep = ((now / 3200) % 1) * Math.PI * 2 - Math.PI / 2;
      if (g.createConicGradient) {
        const cg = g.createConicGradient(sweep - 1.1, R, R);
        cg.addColorStop(0, "rgba(255,230,184,0)");
        cg.addColorStop(1.1 / (Math.PI * 2), "rgba(255,230,184,0.16)");
        cg.addColorStop(1.1 / (Math.PI * 2) + 0.001, "rgba(255,230,184,0)");
        g.fillStyle = cg;
        g.beginPath();
        g.arc(R, R, R - 1, 0, Math.PI * 2);
        g.fill();
      }

      // world point -> screen (turned with you)
      const cos = Math.cos(me.yaw), sin = Math.sin(me.yaw);
      const toScreen = (x: number, z: number) => {
        const dx = (x - me.x) * k, dz = (z - me.z) * k;
        return { x: R + dx * cos - dz * sin, y: R + dx * sin + dz * cos };
      };
      // the sweep lights up what it passes
      const lit = (sx: number, sy: number) => {
        let d = sweep - Math.atan2(sy - R, sx - R);
        d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return d < 1.4 ? 1 - d / 1.4 : 0;
      };

      // the dreamed ones
      for (const a of source.ai?.() ?? []) {
        if (Math.hypot(a.x - me.x, a.z - me.z) > RANGE) continue;
        const s = toScreen(a.x, a.z);
        g.save();
        g.translate(s.x, s.y);
        g.rotate(Math.PI / 4);
        g.strokeStyle = `rgba(159,232,255,${0.45 + lit(s.x, s.y) * 0.5})`;
        g.strokeRect(-2.2, -2.2, 4.4, 4.4);
        g.restore();
      }

      // people: near ones exact, everyone else from their beacon
      const pr = source.presence;
      const people: { id: string; x: number; z: number; signal?: number }[] = pr
        ? [...pr.peers.values(), ...[...pr.far.values()].filter((f) => !pr.peers.has(f.id))]
        : [];
      const seen = new Set<string>();
      for (const p of people) {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (Math.abs(p.x - me.x) > 50_000) continue; // another level
        if (d <= RANGE) {
          seen.add(p.id);
          const s = toScreen(p.x, p.z);
          const l = lit(s.x, s.y);
          g.fillStyle = "#ffe6b8";
          g.shadowColor = "#ffe6b8";
          g.shadowBlur = 6 + l * 8;
          g.beginPath();
          g.arc(s.x, s.y, 2.8 + l * 0.8, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
          // a light signal: a ring spreading out
          const since = p.signal ? Date.now() - p.signal : Infinity;
          if (since < 1800) {
            g.strokeStyle = `rgba(255,230,184,${1 - since / 1800})`;
            g.beginPath();
            g.arc(s.x, s.y, 4 + (since / 1800) * 12, 0, Math.PI * 2);
            g.stroke();
          }
        } else {
          // further away: a mark on the rim, brighter when closer
          const ang = Math.atan2((p.x - me.x) * sin + (p.z - me.z) * cos, (p.x - me.x) * cos - (p.z - me.z) * sin);
          const a = Math.max(0.25, 1 - Math.log10(d / RANGE) / 2.5);
          g.strokeStyle = `rgba(255,230,184,${a})`;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(R, R, R - 3, ang - 0.09, ang + 0.09);
          g.stroke();
          g.lineWidth = 1;
        }
      }

      // you
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(R, R - 6), g.lineTo(R + 4, R + 4.5), g.lineTo(R, R + 2), g.lineTo(R - 4, R + 4.5);
      g.fill();

      // someone new came close: the rim glows for a moment
      if (!first) for (const id of seen) if (!inRange.has(id)) glow = 1;
      first = false;
      inRange = seen;
      glow = Math.max(0, glow - dt * 0.6);
      box.current?.style.setProperty("--glow", glow.toFixed(2));
      if (count.current) count.current.textContent = seen.size ? String(seen.size) : "";
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source]);

  return (
    <button ref={box} className="lab-radar" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} aria-label={tr("map")}>
      <canvas ref={canvas} />
      <span ref={count} className="n" />
    </button>
  );
}
