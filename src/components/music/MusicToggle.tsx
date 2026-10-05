import { useEffect, useRef, useState } from "react";
import { getMood } from "../cube/alive";
import "./MusicToggle.scss";

// Background music: "1 Hour of Twin Peaks Ambient Music" (The Dream Sequencer)
// played through the official YouTube IFrame API, looping forever.
// To use your own licensed track instead, swap this player for a looping Howl.
const VIDEO_ID = "weNv-XNeKDE";
const START_AT = 926; // seconds, where the shared link started
const VOLUME = 55;
const STORAGE_KEY = "seeface-music";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<any> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

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

// Keep clicks on the switch from spinning the cube or entering a digit.
const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

export default function MusicToggle() {
  const [on, setOn] = useState(readPref);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);
  const onRef = useRef(on);
  // the visitor pressed before the YouTube player finished loading
  const wantsStart = useRef(false);
  onRef.current = on;

  // Create the hidden player once.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player("bg-music-player", {
        videoId: VIDEO_ID,
        width: 200,
        height: 200,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          start: START_AT,
          loop: 1,
          playlist: VIDEO_ID, // required for loop=1 on a single video
          playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(VOLUME);
            if (wantsStart.current && onRef.current && !document.hidden) e.target.playVideo();
          },
          onStateChange: (e: any) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            // Belt and braces: restart if the loop ever stops at the end.
            if (e.data === YT.PlayerState.ENDED && onRef.current) {
              e.target.seekTo(0);
              e.target.playVideo();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Browsers only allow sound after the visitor interacts, so start the music
  // on the first press anywhere (the same press that spins the cube).
  useEffect(() => {
    const start = () => {
      const p = playerRef.current;
      if (p?.playVideo && p.getPlayerState) {
        if (onRef.current) p.playVideo();
      } else {
        wantsStart.current = true; // start as soon as the player is ready
      }
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("touchstart", start, true);
      window.removeEventListener("keydown", start, true);
    };
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("touchstart", start, true);
    window.addEventListener("keydown", start, true);
    return () => {
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("touchstart", start, true);
      window.removeEventListener("keydown", start, true);
    };
  }, []);

  // Silence when the page isn't open on screen; pick up again on return.
  useEffect(() => {
    let wasPlaying = false;
    const onVisibility = () => {
      const p = playerRef.current;
      if (!p?.getPlayerState) return;
      if (document.hidden) {
        wasPlaying = p.getPlayerState() === 1;
        if (wasPlaying) p.pauseVideo();
      } else if (wasPlaying && onRef.current) {
        p.playVideo();
      }
    };
    const onHide = () => playerRef.current?.pauseVideo?.();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // The music follows the cube: it swells when people spin hard, slows and
  // fades when the cube is ignored.
  useEffect(() => {
    let rate = 1;
    let vol = VOLUME;
    const timer = setInterval(() => {
      const p = playerRef.current;
      if (!onRef.current || !p?.getPlayerState || p.getPlayerState() !== 1) return;
      const { energy, idle } = getMood();
      const targetVol = Math.round(idle > 0.5 ? 22 : VOLUME + energy * 40);
      if (Math.abs(targetVol - vol) >= 3) {
        vol += Math.sign(targetVol - vol) * 3; // fade gently
        p.setVolume(vol);
      }
      const targetRate = idle > 0.6 ? 0.75 : energy > 0.7 ? 1.25 : 1;
      if (targetRate !== rate) {
        rate = targetRate;
        p.setPlaybackRate?.(rate);
      }
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const set = (next: boolean) => {
    setOn(next);
    writePref(next);
    const p = playerRef.current;
    if (!p?.playVideo) return;
    if (next) p.playVideo();
    else p.pauseVideo();
  };

  return (
    <>
      <div className="bg-music-hidden" aria-hidden="true">
        <div id="bg-music-player" />
      </div>

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
            <span>
              ♫ now playing: twin peaks ambient ~ the dream sequencer ~
            </span>
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
    </>
  );
}
