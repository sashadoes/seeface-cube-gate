import { useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import "./MusicToggle.scss";

// Background music: the owner's own track, looping forever, played exactly as
// it is (owner rule: never change its volume, speed or sound). Only paused
// while the page isn't open on screen.
// Played with Howler (HTML5 audio, streamed), so it also works on iPhone/iPad
// once the visitor touches the page.
const TRACK = "/music/girl_on_the_line_v1.mp3";
const TRACK_NAME = "girl on the line";
const VOLUME = 0.6;
const STORAGE_KEY = "seeface-music";

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // storage blocked (private mode etc.): the switch still works for this visit
  }
}

// Keep taps on the switch from spinning the cube or entering a digit.
const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

export default function MusicToggle() {
  const [on, setOn] = useState(readPref);
  const [playing, setPlaying] = useState(false);
  const musicRef = useRef<Howl | null>(null);
  const onRef = useRef(on);
  onRef.current = on;

  // One looping track for the whole visit.
  useEffect(() => {
    const music = new Howl({
      src: [TRACK],
      html5: true, // stream: starts fast, no 8 MB decode
      loop: true,
      volume: VOLUME,
      preload: true,
      onplay: () => setPlaying(true),
      onpause: () => setPlaying(false),
      onstop: () => setPlaying(false),
    });
    musicRef.current = music;
    return () => {
      music.unload();
    };
  }, []);

  // Browsers only allow sound after the visitor interacts, so start on the
  // first touch / press anywhere. touchend + click are what iOS accepts.
  useEffect(() => {
    const events = ["pointerdown", "touchend", "click", "keydown"];
    const start = () => {
      const m = musicRef.current;
      if (onRef.current && m && !m.playing() && !document.hidden) m.play();
      events.forEach((t) => window.removeEventListener(t, start, true));
    };
    events.forEach((t) => window.addEventListener(t, start, true));
    return () => events.forEach((t) => window.removeEventListener(t, start, true));
  }, []);

  // Silent when the page isn't open on screen; pick up again on return.
  useEffect(() => {
    let wasPlaying = false;
    const onVisibility = () => {
      const m = musicRef.current;
      if (!m) return;
      if (document.hidden) {
        wasPlaying = m.playing();
        if (wasPlaying) m.pause();
      } else if (wasPlaying && onRef.current) {
        m.play();
      }
    };
    const onHide = () => musicRef.current?.pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const set = (next: boolean) => {
    setOn(next);
    writePref(next);
    const m = musicRef.current;
    if (!m) return;
    if (next) {
      if (!m.playing()) m.play();
    } else {
      m.pause();
    }
  };

  return (
    <div
      className={"music-box" + (on && playing ? " is-playing" : "")}
      onMouseDown={swallow}
      onMouseUp={swallow}
      onPointerDown={swallow}
      onPointerUp={swallow}
      onTouchStart={swallow}
      onTouchEnd={swallow}
      onClick={swallow}
    >
      <div className="music-head">
        <span className="music-disc" />
        <div className="music-marquee">
          <span>♫ now playing: {TRACK_NAME} ~ seeface1 ~</span>
        </div>
      </div>
      <div className="music-switch" role="group" aria-label="background music">
        <span className="music-label">music:</span>
        <button className={on ? "active" : ""} onClick={() => set(true)}>
          on
        </button>
        <span className="music-sep">/</span>
        <button className={!on ? "active" : ""} onClick={() => set(false)}>
          off
        </button>
      </div>
    </div>
  );
}
