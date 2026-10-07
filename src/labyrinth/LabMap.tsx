import { t as tr, useLang } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { CELL, PLACE, placeAt, placeCentre, placeOf, roomOf, wallEast, wallSouth } from "./maze";
import { PLACE_NAMES } from "./places";
import { INCOGNITO_COST, MAX_CARDS, TELEPORT_COST, clock, landingSpot, nextCardIn, whereName } from "./cards";
import { levelAtX } from "./zones";
import type { Presence } from "./net";

// The map: the labyrinth around you, everyone online (with nicknames), wishes,
// places and recent teleports.
// Drag to look around, pinch / wheel / ± to zoom. Tap anything to pick it:
// a person (go and meet them), a place or any corridor (walk there, or spend
// a teleport card ⟡ to jump there; everyone is told, unless you travel incognito).

export type Trail = { nick: string; fx: number; fz: number; tx: number; tz: number; at: number; mine?: boolean };

export type MapSource = {
  getPos: () => { x: number; z: number; yaw: number };
  presence: Presence | null;
  wishList: () => { kind: string; x: number; z: number }[];
  edge?: () => { radius: number; centre: { x: number; z: number } };
  ai?: () => { name: string; x: number; z: number }[];
  /** recent teleports (yours and everyone else's) */
  trails?: () => Trail[];
  /** travel there; returns why not, or null when it worked */
  teleport?: (x: number, z: number, incognito: boolean) => string | null;
  /** an arrow that guides you to a spot */
  guide?: (x: number, z: number, name: string) => void;
};

type Pick = { kind: "peer"; id: string } | { kind: "spot"; x: number; z: number; name: string };

const RADIUS = 9; // cells shown around you at zoom 1
const TRAIL_S = 90; // teleports stay on the map this long
const WISH_GLYPH: Record<string, string> = { lantern: "☀", monolith: "▮", phototree: "❋", bigcube: "◼", statue: "☗" };

/** What's at a world spot, for the card: a place (snapped to its centre), a room or a corridor. */
function spotAt(x: number, z: number): { x: number; z: number; name: string } {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  const pl = placeOf(i, j);
  if (pl && pl.kind !== "dark") return { ...placeCentre(pl.I, pl.J), name: PLACE_NAMES[pl.kind] };
  if (roomOf(i, j)) return { x, z, name: "a room" };
  return { x, z, name: whereName(x, z) };
}

export default function LabMap({ source, nick, cards, onClose, onMeet, target }: { source: MapSource; nick: string; cards: number; onClose: () => void; onMeet: (id: string) => void; target: string | null }) {
  useLang();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wide, setWide] = useState(false);
  const wideRef = useRef(false);
  wideRef.current = wide;
  // the view: offset from you (metres) and zoom; follows you until you drag
  const view = useRef({ ox: 0, oz: 0, zoom: 1, scale: 1 });
  const [panned, setPanned] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const pickRef = useRef<Pick | null>(null);
  pickRef.current = pick;
  const [incognito, setIncognito] = useState(false);
  // the recharge countdown ticks while the map is open
  const [nextIn, setNextIn] = useState(nextCardIn);
  useEffect(() => {
    setNextIn(nextCardIn());
    const id = setInterval(() => setNextIn(nextCardIn()), 1000);
    return () => clearInterval(id);
  }, [cards]);
  const [why, setWhy] = useState("");
  // where each player was drawn, for tapping
  const hits = useRef<{ id: string; x: number; y: number }[]>([]);
  // keep the card's distance fresh while people move
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  // places near you (and inside the edge), nearest first
  const nearPlaces = useMemo(() => {
    const me = source.getPos();
    const e = source.edge?.();
    const lvl = levelAtX(me.x);
    const R = 22; // regions each way (~600 m)
    const I0 = Math.floor(me.x / CELL / 7), J0 = Math.floor(me.z / CELL / 7);
    const out: { x: number; z: number; name: string; d: number }[] = [];
    for (let I = I0 - R; I <= I0 + R; I++)
      for (let J = J0 - R; J <= J0 + R; J++) {
        const k = placeAt(I, J);
        if (!k || k === "dark") continue;
        const c = placeCentre(I, J);
        if (levelAtX(c.x) !== lvl) continue;
        if (e && Math.hypot(c.x - e.centre.x, c.z - e.centre.z) > e.radius) continue;
        out.push({ ...c, name: PLACE_NAMES[k], d: Math.hypot(c.x - me.x, c.z - me.z) });
      }
    return out.sort((a, b) => a.d - b.d).slice(0, 8);
  }, [source]);

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
      const now = performance.now();

      const me = source.getPos();
      const v = view.current;
      // people near you (exact) + everyone else in the labyrinth (their 5-second beacon)
      const near = source.presence ? [...source.presence.peers.values()] : [];
      const farOnes = source.presence ? [...source.presence.far.values()].filter((f) => !source.presence!.peers.has(f.id)) : [];
      const peersAll: { id: string; nick: string; x: number; z: number }[] = [...near, ...farOnes];
      let scale = (Math.min(W, H) / (RADIUS * 2 + 1) / CELL) * v.zoom; // px per metre
      let ox = v.ox, oz = v.oz;
      if (wideRef.current && peersAll.length) {
        // zoom out until everyone (on this level) fits
        const far = Math.max(...peersAll.filter((p) => Math.abs(p.x - me.x) < 50_000).map((p) => Math.max(Math.abs(p.x - me.x), Math.abs(p.z - me.z))), 1);
        scale = Math.min(scale, (Math.min(W, H) / 2 - 40) / far);
        ox = oz = 0;
      }
      v.scale = scale;
      const vx = me.x + ox, vz = me.z + oz; // the world point in the middle of the screen
      const cx = W / 2, cy = H / 2;
      const sx = (x: number) => cx + (x - vx) * scale;
      const sy = (z: number) => cy + (z - vz) * scale;
      const ci = Math.floor(vx / CELL), cj = Math.floor(vz / CELL);
      const R = Math.min(Math.ceil(Math.max(W, H) / 2 / scale / CELL) + 1, 60);

      // rooms (safe), then walls
      g.fillStyle = "rgba(255,240,210,0.07)";
      for (let i = ci - R; i <= ci + R; i++)
        for (let j = cj - R; j <= cj + R; j++)
          if (roomOf(i, j)) g.fillRect(sx(i * CELL), sy(j * CELL), CELL * scale + 0.5, CELL * scale + 0.5);
      g.strokeStyle = "rgba(233,228,218,0.55)";
      g.lineWidth = 1.5;
      g.globalAlpha = Math.min(1, (scale * CELL) / 10);
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
      g.textBaseline = "middle";
      for (let I = Math.floor((ci - R) / 7); I <= Math.floor((ci + R) / 7); I++)
        for (let J = Math.floor((cj - R) / 7); J <= Math.floor((cj + R) / 7); J++) {
          const k = placeAt(I, J);
          if (!k || k === "dark") continue;
          const x0 = sx((I * 7 + 1) * CELL), z0 = sy((J * 7 + 1) * CELL), w = PLACE * CELL * scale;
          g.fillStyle = "rgba(255,230,184,0.06)";
          g.fillRect(x0, z0, w, w);
          g.fillStyle = "rgba(255,230,184,0.75)";
          g.fillText(tr(PLACE_NAMES[k]), x0 + w / 2, z0 + w / 2);
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

      // teleports: a fading violet arc from where they left to where they appeared
      for (const tp of source.trails?.() ?? []) {
        const age = (now - tp.at) / 1000;
        if (age > TRAIL_S) continue;
        const a = 1 - age / TRAIL_S;
        const x0 = sx(tp.fx), y0 = sy(tp.fz), x1 = sx(tp.tx), y1 = sy(tp.tz);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.25;
        g.strokeStyle = `rgba(200,184,255,${0.6 * a})`;
        g.lineWidth = 1.5;
        g.setLineDash([3, 5]);
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(mx, my, x1, y1);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = `rgba(214,200,255,${a})`;
        g.font = "15px 'Times New Roman', serif";
        g.fillText("✧", x1, y1);
        g.font = "italic 11px 'Times New Roman', serif";
        g.fillText(tp.mine ? tr("you") : tp.nick, x1, y1 + 13);
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
        g.fillText(`◇ ${a.name}`, x, y - 12);
      }

      // wishes
      g.font = "14px 'Times New Roman', serif";
      g.fillStyle = "#ffcf8a";
      for (const w of source.wishList()) {
        const x = sx(w.x), y = sy(w.z);
        if (x > 0 && x < W && y > 0 && y < H) g.fillText(WISH_GLYPH[w.kind] ?? "✦", x, y);
      }

      // what you picked: a line from you and a pulsing ring
      const pk = pickRef.current;
      const pp = pk?.kind === "peer" ? peersAll.find((p) => p.id === pk.id) : pk;
      if (pp) {
        const x = sx(pp.x), y = sy(pp.z);
        g.strokeStyle = "rgba(200,184,255,0.7)";
        g.setLineDash([2, 6]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(sx(me.x), sy(me.z));
        g.lineTo(x, y);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.arc(x, y, 14 + Math.sin(now / 180) * 3, 0, Math.PI * 2);
        g.stroke();
      }

      // everyone else: inside the map, or an arrow at the edge with the distance
      const margin = 26;
      hits.current = [];
      for (const p of peersAll) {
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
          g.arc(x, y, 11 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = "rgba(255,244,222,0.95)";
        g.font = "italic 13px 'Times New Roman', serif";
        // canvas text: never HTML, so nicknames can't inject anything
        g.fillText(inside ? p.nick : `${p.nick} · ${dist} m`, x, y - 14);
      }

      // you
      g.save();
      g.translate(sx(me.x), sy(me.z));
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
      g.fillText(nick, sx(me.x), sy(me.z) + 22);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, nick, target]);

  // ---------------------------------------------------------------- touch: drag, pinch, tap
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });
  const toWorld = (px: number, py: number) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const me = source.getPos();
    const v = view.current;
    return { x: me.x + v.ox + (px - r.left - r.width / 2) / v.scale, z: me.z + v.oz + (py - r.top - r.height / 2) / v.scale };
  };
  const zoomBy = (k: number) => {
    view.current.zoom = Math.max(0.15, Math.min(4, view.current.zoom * k));
    setWide(false);
  };
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch) zoomBy(d / gesture.current.pinch);
      gesture.current.pinch = d;
      gesture.current.moved = 99;
    } else if (gesture.current.moved > 6) {
      const v = view.current;
      v.ox -= dx / v.scale;
      v.oz -= dy / v.scale;
      if (!panned) setPanned(true);
      if (wide) setWide(false);
    }
  };
  const up = (e: React.PointerEvent) => {
    e.stopPropagation();
    const had = pointers.current.delete(e.pointerId);
    if (!had || pointers.current.size > 0 || gesture.current.moved > 6) return;
    // a tap: a person nearby on screen, else the spot
    const r = canvas.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: string | null = null, bd = 28;
    for (const h of hits.current) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) (bd = d), (best = h.id);
    }
    setWhy("");
    if (best) return setPick({ kind: "peer", id: best });
    const w = toWorld(e.clientX, e.clientY);
    setPick({ kind: "spot", ...spotAt(w.x, w.z) });
  };
  const wheel = (e: React.WheelEvent) => zoomBy(Math.exp(-e.deltaY * 0.0015));
  const centre = () => {
    view.current.ox = view.current.oz = 0;
    setPanned(false);
  };
  const showPlace = (p: { x: number; z: number; name: string }) => {
    const me = source.getPos();
    view.current.ox = p.x - me.x;
    view.current.oz = p.z - me.z;
    view.current.zoom = Math.min(view.current.zoom, 1);
    setWide(false);
    setPanned(true);
    setWhy("");
    setPick({ kind: "spot", ...p });
  };

  // ---------------------------------------------------------------- the card for what you picked
  const me = source.getPos();
  const peer = pick?.kind === "peer" ? source.presence?.peers.get(pick.id) ?? source.presence?.far.get(pick.id) : null;
  const at = pick?.kind === "peer" ? (peer ? { x: peer.x, z: peer.z, name: peer.nick } : null) : pick;
  const dist = at ? Math.round(Math.hypot(at.x - me.x, at.z - me.z)) : 0;
  const cost = incognito ? INCOGNITO_COST : TELEPORT_COST;
  const canLand = at ? !!landingSpot(at.x, at.z) : false;
  const go = () => {
    if (!at) return;
    if (pick?.kind === "peer") onMeet(pick.id);
    else source.guide?.(at.x, at.z, at.name);
    onClose();
  };
  const jump = () => {
    if (!at || !source.teleport) return;
    const no = source.teleport(at.x, at.z, incognito);
    if (no) setWhy(no);
    else onClose();
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const others = source.presence?.peers.size ?? 0;
  return (
    <div className="lab-map" onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(e) => pointers.current.delete(e.pointerId)} onWheel={wheel} />
      <div className="lab-map-online">
        ◉ {source.presence?.online() ?? 1} {tr("inside")}
        <span className="lab-map-cards" title={tr("teleport cards")}>
          ⟡ {cards}/{MAX_CARDS}
          {cards < MAX_CARDS && <small> · {tr("next card in {t}", { t: clock(nextIn) })}</small>}
        </span>
      </div>
      <button
        className={"lab-map-wide" + (wide ? " on" : "")}
        onClick={() => {
          setWide((w) => !w);
          centre();
        }}
      >
        {wide ? tr("near me") : tr("everyone")}
      </button>
      <button className="lab-map-close" aria-label={tr("close map")} onClick={onClose}>
        ×
      </button>

      {nearPlaces.length > 0 && (
        <div className="lab-map-places">
          {nearPlaces.map((p) => (
            <button key={`${p.x},${p.z}`} onClick={() => showPlace(p)}>
              {tr(p.name)} <small>{Math.round(p.d)} m</small>
            </button>
          ))}
        </div>
      )}

      <div className="lab-map-zoom">
        <button aria-label={tr("zoom in")} onClick={() => zoomBy(1.5)}>
          +
        </button>
        <button aria-label={tr("zoom out")} onClick={() => zoomBy(1 / 1.5)}>
          −
        </button>
        {panned && (
          <button aria-label={tr("back to me")} onClick={centre}>
            ◎
          </button>
        )}
      </div>

      {at ? (
        <div className="lab-map-card">
          <div className="lab-map-card-title">
            {pick?.kind === "peer" ? at.name : tr(at.name)} <small>· {dist} m</small>
            <button className="lab-map-card-x" aria-label={tr("close")} onClick={() => setPick(null)}>
              ×
            </button>
          </div>
          <div className="lab-map-card-row">
            <button onClick={go}>{pick?.kind === "peer" ? tr("go and meet them") : tr("walk there")}</button>
            <button className="tp" disabled={cards < cost || !canLand} onClick={jump}>
              {tr("teleport")} · ⟡ {cost}
            </button>
          </div>
          <label className="lab-map-incog">
            <input type="checkbox" checked={incognito} onChange={(e) => setIncognito(e.target.checked)} />
            {tr("incognito")} <small>· {incognito ? tr("nobody is told") : tr("everyone sees where you appear")}</small>
          </label>
          <div className="lab-map-why">{why || (!canLand ? tr("nowhere to land there") : cards < cost ? tr("next card in {t}", { t: clock(nextIn) }) : "")}</div>
        </div>
      ) : (
        <div className="lab-map-hint">{cards > 0 ? tr("tap anywhere to travel there") : others ? tr("tap someone to go and meet them") : tr("drag to look around · tap a place")}</div>
      )}
    </div>
  );
}
