import { useEffect, useRef, useState } from "react";
import { CELL, PLACE, placeAt, roomOf, wallEast, wallSouth } from "./maze";
import { PLACE_NAMES } from "./places";
import type { Presence } from "./net";

// The map: the labyrinth around you, everyone online (with nicknames), and
// wishes. People beyond the edge show as arrows with their distance. "everyone"
// zooms out to fit all players. Tap someone to go and meet them: an arrow
// guides you and they're told you're coming.

type Source = {
  getPos: () => { x: number; z: number; yaw: number };
  presence: Presence | null;
  wishList: () => { kind: string; x: number; z: number }[];
  edge?: () => { radius: number; centre: { x: number; z: number } };
  ai?: () => { name: string; x: number; z: number }[];
};

const RADIUS = 9; // cells shown around you
const WISH_GLYPH: Record<string, string> = { lantern: "☀", monolith: "▮", phototree: "❋", bigcube: "◼", statue: "☗" };

export default function LabMap({ source, nick, onClose, onMeet, target }: { source: Source; nick: string; onClose: () => void; onMeet: (id: string) => void; target: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wide, setWide] = useState(false);
  const wideRef = useRef(false);
  wideRef.current = wide;
  // where each player was drawn, for tapping
  const hits = useRef<{ id: string; x: number; y: number }[]>([]);

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
      const peersAll = source.presence ? [...source.presence.peers.values()] : [];
      let scale = Math.min(W, H) / (RADIUS * 2 + 1) / CELL; // px per metre
      if (wideRef.current && peersAll.length) {
        // zoom out until everyone (on this level) fits
        const far = Math.max(...peersAll.filter((p) => Math.abs(p.x - me.x) < 50_000).map((p) => Math.max(Math.abs(p.x - me.x), Math.abs(p.z - me.z))), 1);
        scale = Math.min(scale, (Math.min(W, H) / 2 - 40) / far);
      }
      const cx = W / 2, cy = H / 2;
      const sx = (x: number) => cx + (x - me.x) * scale;
      const sy = (z: number) => cy + (z - me.z) * scale;
      const ci = Math.floor(me.x / CELL), cj = Math.floor(me.z / CELL);
      const R = Math.min(Math.ceil(Math.max(W, H) / 2 / scale / CELL) + 1, 60);

      // rooms (safe), then walls
      g.fillStyle = "rgba(255,240,210,0.07)";
      for (let i = ci - R; i <= ci + R; i++)
        for (let j = cj - R; j <= cj + R; j++)
          if (roomOf(i, j)) g.fillRect(sx(i * CELL), sy(j * CELL), CELL * scale + 0.5, CELL * scale + 0.5);
      g.strokeStyle = "rgba(233,228,218,0.55)";
      g.lineWidth = 1.5;
      g.globalAlpha = Math.min(1, scale * CELL / 10);
      g.beginPath();
      for (let i = ci - R; i <= ci + R; i++)
        for (let j = cj - R; j <= cj + R; j++) {
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
      g.globalAlpha = 1;

      // places (the dark room stays secret)
      g.font = "italic 13px 'Times New Roman', serif";
      g.textAlign = "center";
      for (let I = Math.floor((ci - R) / 7); I <= Math.floor((ci + R) / 7); I++)
        for (let J = Math.floor((cj - R) / 7); J <= Math.floor((cj + R) / 7); J++) {
          const k = placeAt(I, J);
          if (!k || k === "dark") continue;
          const x0 = sx((I * 7 + 1) * CELL), z0 = sy((J * 7 + 1) * CELL), w = PLACE * CELL * scale;
          g.fillStyle = "rgba(255,230,184,0.06)";
          g.fillRect(x0, z0, w, w);
          g.fillStyle = "rgba(255,230,184,0.75)";
          g.fillText(PLACE_NAMES[k], x0 + w / 2, z0 + w / 2);
        }

      // the edge of the labyrinth (it grows with the crowd)
      const e = source.edge?.();
      if (e) {
        g.strokeStyle = "rgba(200,190,255,0.55)";
        g.setLineDash([6, 6]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sx(e.centre.x), sy(e.centre.z), e.radius * scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }

      // the dreamed ones (◇): small diamonds (not people)
      for (const a of source.ai?.() ?? []) {
        const x = sx(a.x), y = sy(a.z);
        if (x < 0 || x > W || y < 0 || y > H) continue;
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 4);
        g.strokeStyle = "rgba(159,232,255,0.8)";
        g.strokeRect(-4, -4, 8, 8);
        g.restore();
        g.fillStyle = "rgba(159,232,255,0.7)";
        g.font = "italic 11px 'Times New Roman', serif";
        g.textAlign = "center";
        g.fillText(`◇ ${a.name}`, x, y - 10);
      }

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
      const peers = peersAll;
      const margin = 26;
      hits.current = [];
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
        hits.current.push({ id: p.id, x, y });
        if (p.id === target) {
          g.strokeStyle = "#ffe6b8";
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, 11 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2);
          g.stroke();
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
  }, [source, nick, target]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const tap = (e: React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: string | null = null, bd = 30;
    for (const h of hits.current) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) (bd = d), (best = h.id);
    }
    if (best) onMeet(best);
    onClose();
  };
  const others = source.presence?.peers.size ?? 0;
  return (
    <div className="lab-map" onPointerDown={stop} onPointerUp={stop} onClick={tap}>
      <canvas ref={canvas} />
      <div className="lab-map-online">◉ {(source.presence?.online() ?? 1)} inside</div>
      <button
        className={"lab-map-wide" + (wide ? " on" : "")}
        onClick={(e) => {
          e.stopPropagation();
          setWide((w) => !w);
        }}
      >
        {wide ? "near me" : "everyone"}
      </button>
      <div className="lab-map-hint">{others ? "tap someone to go and meet them" : "nobody else inside right now · invite a friend ⊕"}</div>
      <button className="lab-map-close" aria-label="close map" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
