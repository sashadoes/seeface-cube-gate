// 🎙 MIC: hold to talk · swipe up to lock it open · tap to unlock · slide down while holding to
// whisper (only people within ~2 m hear you). A quick tap when not live opens the text bubble.
// Desktop: hold V.
import { useEffect, useRef } from "react";
import { useUi, type Session } from "../session.ts";

export function Mic({ session, onTap }: { session: Session; onTap: () => void }) {
  const live = useUi("live");
  const locked = useUi("locked");
  const g = useRef<{ y: number; t: number; moved: number; whisper: boolean; wasLive: boolean; id: number } | null>(null);

  useEffect(() => {
    // V = hold to talk on desktop
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && !e.repeat && !(e.target as HTMLElement).closest("input")) void session.talk(true);
    };
    const upV = (e: KeyboardEvent) => {
      if (e.code === "KeyV") void session.talk(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upV);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", upV);
    };
  }, [session]);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    g.current = { y: e.clientY, t: performance.now(), moved: 0, whisper: false, wasLive: !!live, id: e.pointerId };
    if (!live) void session.talk(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dy = e.clientY - s.y;
    s.moved = Math.max(s.moved, Math.abs(dy));
    if (dy < -55 && !locked && live) {
      session.setLocked(true);
      navigator.vibrate?.(15);
    }
    if (dy > 45 && !s.whisper && live === "talk") {
      s.whisper = true;
      void session.talk(true, true);
      navigator.vibrate?.(10);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return;
    const quick = performance.now() - s.t < 220 && s.moved < 10;
    if (s.wasLive && locked) {
      // tap while locked = unlock
      void session.talk(false);
      return;
    }
    if (locked) return; // just locked by the swipe: stay open
    void session.talk(false);
    if (quick && !s.wasLive) onTap();
  };

  return (
    <button
      className={`w-btn w-mic ${live ? "live" : ""} ${live === "whisper" ? "whisper" : ""} ${locked ? "locked" : ""}`}
      aria-label={live ? "talking" : "hold to talk"}
      data-testid="mic"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {live === "whisper" ? "🤫" : "🎙"}
      {locked && <span className="w-lock">🔒</span>}
    </button>
  );
}
