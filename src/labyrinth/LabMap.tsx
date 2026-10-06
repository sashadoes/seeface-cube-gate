import { useEffect, useRef } from "react";
import { CELL, roomOf, wallEast, wallSouth } from "./maze";
import type { Presence } from "./net";

// The map: the labyrinth around you, everyone online (with nicknames), and
// wishes. People beyond the edge show as arrows with their distance, so you
// can walk towards each other.

type Source = {
  getPos: () => { x: number; z: number; yaw: number };
  presence: Presence | null;
  wishList: () => { kind: string; x: number; z: number }[];
};

const RADIUS = 9; // cells shown around you
const WISH_GLYPH: Record<string, string> = { lantern: "☀", monolith: "▮", phototree: "❋", bigcube: "◼", statue: "☗" };

export default function LabMap({ source, nick, onClose }: { source: Source; nick: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    let raf = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== W * dpr) (c.width = W * dpr), (c.height = H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);

      const me = source.getPos();
      const scale = Math.min(W, H) / (RADIUS * 2 + 1) / CELL; // px per metre
      const cx = W / 2, cy = H / 2;
      const sx = (x: number) => cx + (x - me.x) * scale;
      const sy = (z: number) => cy + (z - me.z) * scale;
      const ci = Math.floor(me.x / CELL), cj = Math.floor(me.z / CELL);

      // rooms (safe), then walls
      g.fillStyle = "rgba(255,240,210,0.07)";
      for (let i = ci - RADIUS; i <= ci + RADIUS; i++)
        for (let j = cj - RADIUS; j <= cj + RADIUS; j++)
          if (roomOf(i, j)) g.fillRect(sx(i * CELL), sy(j * CELL), CELL * scale + 0.5, CELL * scale + 0.5);
      g.strokeStyle = "rgba(233,228,218,0.55)";
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = ci - RADIUS; i <= ci + RADIUS; i++)
        for (let j = cj - RADIUS; j <= cj + RADIUS; j++) {
          if (wallEast(i, j)) {
            g.moveTo(sx((i + 1) * CELL), sy(j * CELL));
            g.lineTo(sx((i + 1) * CELL), sy((j + 1) * CELL));
          }
          if (wallSouth(i, j)) {
            g.moveTo(sx(i * CELL), sy((j + 1) * CELL));
            g.lineTo(sx((i + 1) * CELL), sy((j + 1) * CELL));
          }
        }
      g.stroke();

      // wishes
      g.font = "14px 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffcf8a";
      for (const w of source.wishList()) {
        const x = sx(w.x), y = sy(w.z);
        if (x > 0 && x < W && y > 0 && y < H) g.fillText(WISH_GLYPH[w.kind] ?? "✦", x, y);
      }

      // everyone else: inside the map, or an arrow at the edge with the distance
      const peers = source.presence ? [...source.presence.peers.values()] : [];
      const margin = 26;
      for (const p of peers) {
        let x = sx(p.x), y = sy(p.z);
        const inside = x > margin && x < W - margin && y > margin && y < H - margin;
        const dist = Math.round(Math.hypot(p.x - me.x, p.z - me.z));
        if (!inside) {
          const ang = Math.atan2(y - cy, x - cx);
          const rx = (W / 2 - margin) / Math.abs(Math.cos(ang) || 1e-6);
          const ry = (H / 2 - margin) / Math.abs(Math.sin(ang) || 1e-6);
          const r = Math.min(rx, ry);
          x = cx + Math.cos(ang) * r;
          y = cy + Math.sin(ang) * r;
          g.save();
          g.translate(x, y);
          g.rotate(ang);
          g.fillStyle = "#ffe6b8";
          g.beginPath();
          g.moveTo(9, 0);
          g.lineTo(-6, -6);
          g.lineTo(-6, 6);
          g.closePath();
          g.fill();
          g.restore();
        } else {
          g.fillStyle = "#ffe6b8";
          g.shadowColor = "#ffe6b8";
          g.shadowBlur = 12;
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
        g.fillStyle = "rgba(255,244,222,0.95)";
        g.font = "italic 13px 'Times New Roman', serif";
        // canvas text: never HTML, so nicknames can't inject anything
        g.fillText(inside ? p.nick : `${p.nick} · ${dist} m`, x, y - 14);
      }

      // you
      g.save();
      g.translate(cx, cy);
      g.rotate(-me.yaw);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(6, 7);
      g.lineTo(0, 3);
      g.lineTo(-6, 7);
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = "#ffffff";
      g.font = "italic 13px 'Times New Roman', serif";
      g.fillText(nick, cx, cy + 22);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, nick]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="lab-map" onPointerDown={stop} onPointerUp={stop} onClick={onClose}>
      <canvas ref={canvas} />
      <div className="lab-map-online">◉ {(source.presence?.online() ?? 1)} inside</div>
      <button className="lab-map-close" aria-label="close map" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
