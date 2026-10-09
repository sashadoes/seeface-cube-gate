// 📻 The Radio: a big glowing dial over the world. Spin it with a thumb; it clicks between live
// rooms (haptics + tick), with analogue static and a filter sweep in between. When it locks on a
// station the static blooms into the room: you HEAR a 3-second live preview of whoever is
// speaking there. JUMP IN → you fall through a hole into that room.
// Stations are real rooms with real counts; the dial opens on the busiest one.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomSummary } from "../../../shared/world/protocol.ts";
import { getAudio } from "../audio/engine.ts";
import { useUi, type Session } from "../session.ts";

const TAU = Math.PI * 2;

export function Radio({ session, onClose }: { session: Session; onClose: () => void }) {
  const rooms = useUi("rooms");
  const room = useUi("room");
  const roomAudio = useUi("roomAudio");
  // order fixed while the dial is open (busiest first), counts update live
  const order = useMemo(() => [...rooms].sort((a, b) => b.people - a.people || b.speaking.length - a.speaking.length).map((r) => r.id), [rooms.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = order.map((id) => rooms.find((r) => r.id === id)).filter((r): r is RoomSummary => !!r);
  const n = Math.max(1, stations.length);
  const step = TAU / n;
  const [angle, setAngle] = useState(0); // dial rotation; station i sits at -i*step
  const drag = useRef<{ a: number; last: number; v: number; t: number } | null>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const audio = useRef<{ src: AudioScheduledSourceNode; band: BiquadFilterNode; gain: GainNode } | null>(null);
  const lastIdx = useRef(-1);
  const previewAt = useRef<{ id: string; at: number } | null>(null);
  const [settled, setSettled] = useState(0);

  // nearest station + how close (0 = right on it, 1 = halfway to the next)
  const raw = ((-angle / step) % n + n) % n;
  const idx = Math.round(raw) % n;
  const off = Math.min(1, Math.abs(raw - Math.round(raw)) * 2);
  const locked = off < 0.18;
  const st = stations[idx];

  // static: always there while the dial is open, gone when locked on a live station
  useEffect(() => {
    const a = getAudio();
    void a.resume();
    const src = a.sfx2.staticBurst(0);
    // re-route: staticBurst connects to sfx; add our own band + gain in front
    src.disconnect();
    const band = a.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.1;
    band.frequency.value = 1200;
    const gain = a.ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(band).connect(gain).connect(a.sfx);
    audio.current = { src, band, gain };
    return () => {
      gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
      setTimeout(() => src.stop(), 200);
      session.preview(null);
    };
  }, [session]);

  useEffect(() => {
    const a = getAudio(), au = audio.current;
    if (!au) return;
    const t = a.ctx.currentTime;
    // filter sweep follows the dial, static fades as you lock on
    au.band.frequency.setTargetAtTime(500 + ((raw / n) * 3000 + off * 1200), t, 0.03);
    const live = st && st.people > 0;
    au.gain.gain.setTargetAtTime(locked ? (live ? 0.015 : 0.06) : 0.06 + off * 0.16, t, 0.05);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      a.sfx2.tick();
      navigator.vibrate?.(8);
    }
  });

  // lock-in → bloom + 3 s live preview (once per station per lock)
  useEffect(() => {
    if (!locked || !st) return;
    if (drag.current) return; // wait until the thumb lets go or slows down
    const p = previewAt.current;
    if (p && p.id === st.id && Date.now() - p.at < 4000) return;
    previewAt.current = { id: st.id, at: Date.now() };
    const a = getAudio();
    a.sfx2.chime();
    if (st.id !== room) session.preview(st.id);
    session.spinQuest();
    const tm = setTimeout(() => session.preview(null), 3000);
    return () => clearTimeout(tm);
  }, [locked, st?.id, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  const center = () => {
    const r = dialRef.current!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const c = center();
    drag.current = { a: Math.atan2(e.clientY - c.y, e.clientX - c.x), last: angle, v: 0, t: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const c = center();
    const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    let da = a - d.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    d.a = a;
    const now = performance.now();
    d.v = da / Math.max(1, now - d.t);
    d.t = now;
    setAngle((x) => x + da);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    // a little momentum, then snap to the nearest station
    let target = angle + (d ? d.v * 220 : 0);
    target = Math.round(target / step) * step;
    const from = angle, t0 = performance.now();
    const anim = () => {
      const k = Math.min(1, (performance.now() - t0) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      setAngle(from + (target - from) * e);
      if (k < 1) requestAnimationFrame(anim);
      else setSettled((x) => x + 1);
    };
    requestAnimationFrame(anim);
  };

  const jump = () => {
    if (!st) return;
    session.preview(null);
    session.jumpTo(st.id);
    onClose();
  };

  return (
    <div className="w-radio-ui w-overlay-full" onPointerDown={(e) => e.stopPropagation()} data-testid="tuner">
      <div className="w-dial-wrap">
        <div className="w-dial" ref={dialRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ transform: `rotate(${angle}rad)` }}>
          {stations.map((s, i) => (
            <span key={s.id} className={`w-tick ${s.people ? "live" : ""} ${i === idx && locked ? "on" : ""}`} style={{ transform: `rotate(${i * step}rad) translateY(calc(min(84vw, 380px) * -0.42))` }} />
          ))}
        </div>
        <div className={`w-station ${locked ? "locked" : "static"}`}>
          {st ? (
            <>
              <div className="w-st-name">{st.name}</div>
              <div className="w-st-topic">{st.topic}</div>
              <div className="w-st-meta">
                {st.people ? `${st.people} listening` : "quiet right now"}
                {st.speaking.length ? ` · 🎙 ${st.speaking.slice(0, 2).join(", ")}` : ""}
                {st.transcribed ? " · TRANSCRIBED" : ""}
              </div>
            </>
          ) : (
            <div className="w-st-topic">no stations</div>
          )}
        </div>
        <div className="w-needle" />
      </div>
      <button className="w-jump" disabled={!st || !locked} onClick={jump} data-testid="jump-in">
        {st && st.id === room ? "you're here" : "JUMP IN"}
      </button>
      {room && (
        <button className="w-radio-off" onClick={() => session.setRoomAudio(!roomAudio)}>
          {roomAudio ? "radio off (stay, mute the room)" : "radio on"}
        </button>
      )}
      <button className="w-x w-x-big" aria-label="close radio" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
