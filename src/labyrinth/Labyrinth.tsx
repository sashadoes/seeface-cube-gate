import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Howl } from "howler";
import { createWorld } from "./world";
import { createInput, type Input } from "./controls";
import { createHunter } from "./hunter";
import { createResidents } from "./residents";
import { createRadio } from "./radio";
import { shareCard, type RunResult } from "./card";
import { free, spawn, roomOf, CELL } from "./maze";
import { loadWeather } from "../marks/weather";
import { track } from "../analytics";
import "./Labyrinth.scss";

// /labyrinth: survive the infinite seeface1 maze.
//   your lantern dies in the dark · working lights recharge it · rooms are safe
//   spin a new room's cube → a shard + full light · 6 shards → the labyrinth shifts deeper
//   the Hollow hunts you when your light is low · the radio crackles when it's near

const EYE = 1.62;
const WALK = 2.6;
const RUN = 5.0;
const SHARDS_PER_DEPTH = 6;
const GRACE = 15; // seconds before the Hollow starts moving
const BEST_KEY = "seeface-lab-best";

type Hud = { light: number; shards: number; depth: number; danger: number; near: boolean; dead: RunResult | null };

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

export default function Labyrinth() {
  const host = useRef<HTMLDivElement>(null);
  const restartRef = useRef<() => void>(() => {});
  const [stick, setStick] = useState({ active: false, ox: 0, oy: 0, x: 0, y: 0 });
  const [hud, setHud] = useState<Hud>({ light: 100, shards: 0, depth: 0, danger: 0, near: false, dead: null });
  const [shareState, setShareState] = useState<"" | "busy" | "done">("");

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    el.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
    const world = createWorld();
    const hunter = createHunter();
    const residents = createResidents();
    world.scene.add(hunter.object, residents.group, camera);
    const input: Input = createInput(renderer.domElement);
    const radio = createRadio();

    // the lantern you carry
    const lantern = new THREE.SpotLight(0xffe9c4, 6, 14, 0.62, 0.55, 1.2);
    lantern.position.set(0.18, -0.15, 0);
    lantern.target.position.set(0, -0.2, -3);
    camera.add(lantern, lantern.target);

    const spinSfx = new Howl({ src: ["/sounds/ShuffleCube.mp3"], volume: 0.5, preload: true });
    const shardSfx = new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.6, preload: true });
    const shiftSfx = new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.7, preload: true });
    const caughtSfx = new Howl({ src: ["/sounds/CubeErrorCode.mp3"], volume: 0.8, preload: true });
    const stepSfx = new Howl({ src: ["/sounds/SwitchCube1.mp3"], volume: 0.07, preload: true });

    const wake = () => radio.resume();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);

    loadWeather().then((w) => {
      world.setWeather(w);
      track(`weather-${w.kind}`);
    });

    // ---------------------------------------------------------------- run state
    const start = spawn();
    const pos = { x: 0, z: 0 };
    let light = 100, shards = 0, depth = 0, metres = 0, runTime = 0, alive = true;
    let claimed = new Set<string>();

    function newRun() {
      pos.x = start.x + 2.4;
      pos.z = start.z + 2.4;
      input.yaw = Math.PI / 4;
      input.pitch = 0;
      light = 100;
      shards = 0;
      depth = 0;
      metres = 0;
      runTime = 0;
      alive = true;
      claimed = new Set();
      world.setDepth(0);
      hunter.reset(pos.x, pos.z);
      setHud({ light: 100, shards: 0, depth: 0, danger: 0, near: false, dead: null });
      track("run-start");
    }
    restartRef.current = () => {
      setShareState("");
      newRun();
    };
    newRun();

    function die() {
      alive = false;
      caughtSfx.play();
      radio.set(0);
      try {
        navigator.vibrate?.([300, 80, 300]);
      } catch {
        // unsupported
      }
      const best = metres > readBest();
      if (best) {
        try {
          localStorage.setItem(BEST_KEY, String(Math.round(metres)));
        } catch {
          // ignore
        }
      }
      const bucket = metres < 50 ? "0-50" : metres < 150 ? "50-150" : metres < 400 ? "150-400" : metres < 1000 ? "400-1000" : "1000+";
      track(`caught-${bucket}m`);
      const result: RunResult = { metres, shards, depth, seconds: runTime, best };
      setTimeout(() => setHud((h) => ({ ...h, dead: result, danger: 0 })), 900);
    }

    // dev-only handle for debugging in the browser console
    if (import.meta.env.DEV)
      (window as unknown as { __lab: unknown }).__lab = {
        pos,
        input,
        camera,
        world,
        hunter,
        state: () => ({ light, shards, depth, metres, alive, runTime }),
        setLight: (v: number) => (light = v),
        skipGrace: () => (runTime = GRACE + 1),
      };

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let bob = 0, nextStep = 0, walkedSfx = 0, hudTimer = 0;
    let raf = 0;
    let lastDanger = 0;
    let wasNear = false;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      if (alive) {
        runTime += dt;

        // ---------------- move (slide along walls)
        const speed = (input.run ? RUN : WALK) * dt;
        const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
        const rx = Math.cos(input.yaw), rz = -Math.sin(input.yaw);
        const dx = (fx * input.move.z + rx * input.move.x) * speed;
        const dz = (fz * input.move.z + rz * input.move.x) * speed;
        const ox = pos.x, oz = pos.z;
        if (free(pos.x + dx, pos.z)) pos.x += dx;
        if (free(pos.x, pos.z + dz)) pos.z += dz;
        const moved = Math.hypot(pos.x - ox, pos.z - oz);
        if (moved > 0) {
          metres += moved;
          bob += moved * 3.2;
          walkedSfx += moved;
          if (walkedSfx > nextStep) {
            stepSfx.play();
            nextStep = walkedSfx + (input.run ? 1.1 : 0.8);
          }
        }

        // ---------------- light: dies in the dark, lives under working lights and in rooms
        const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL);
        const room = roomOf(ci, cj);
        if (room) light = Math.min(100, light + 25 * dt);
        else if (world.isLit(pos.x, pos.z)) light = Math.min(100, light + 14 * dt);
        else light = Math.max(0, light - (2.2 + depth * 0.3 + (input.run ? 0.8 : 0)) * dt);

        // lantern follows the light level, and stutters when it's nearly gone
        const lvl = light / 100;
        const stutter = light < 20 && Math.random() < 0.08 ? 0.15 : 1;
        lantern.intensity = 7 * Math.pow(lvl, 0.7) * stutter;
        lantern.distance = 5 + 10 * lvl;

        // ---------------- the Hollow
        const h = runTime > GRACE ? hunter.update(dt, t, { px: pos.x, pz: pos.z, light, depth, isLit: world.isLit }) : { dist: 99, hunting: false };
        const danger = Math.max(0, 1 - h.dist / (CELL * 5)) * (h.hunting ? 1 : 0.45);
        radio.set(danger);
        lastDanger = danger;
        if (h.dist < 1.0 && !room) die();
      }

      camera.position.set(pos.x, EYE + Math.sin(bob) * 0.035 + (lastDanger > 0.6 ? (Math.random() - 0.5) * 0.02 * lastDanger : 0), pos.z);
      camera.rotation.set(input.pitch, input.yaw, 0, "YXZ");

      world.update(pos.x, pos.z, t, dt);
      residents.update(dt, t, { px: pos.x, pz: pos.z, light });

      // ---------------- cubes: spin a new room's cube → shard + full light
      const c = world.nearestCube(pos.x, pos.z);
      const isNear = !!c && c.dist < CELL * 0.75 && alive;
      if (input.consumeTap() && c && isNear) {
        world.spinCube(c.mesh);
        spinSfx.play();
        light = 100;
        const roomKey = c.mesh.userData.key as string;
        if (!claimed.has(roomKey)) {
          claimed.add(roomKey);
          shards += 1;
          shardSfx.play();
          track(`shard-${Math.min(shards, 60)}`);
          try {
            navigator.vibrate?.([20, 40, 80]);
          } catch {
            // unsupported
          }
          if (shards % SHARDS_PER_DEPTH === 0) {
            depth += 1;
            world.setDepth(depth);
            shiftSfx.play();
            track(`depth-${Math.min(depth, 20)}`);
            el.classList.remove("shift");
            void el.offsetWidth;
            el.classList.add("shift");
          }
        }
      }

      setStick((s) => (s.active === input.joystick.active && s.x === input.joystick.x && s.y === input.joystick.y ? s : { ...input.joystick }));
      hudTimer -= dt;
      if (hudTimer <= 0 || isNear !== wasNear) {
        hudTimer = 0.1;
        wasNear = isNear;
        setHud((prev) => (prev.dead ? prev : { light, shards, depth, danger: lastDanger, near: isNear, dead: null }));
      }

      renderer.render(world.scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      renderer.dispose();
      el.innerHTML = "";
    };
  }, []);

  const share = async () => {
    if (!hud.dead || shareState === "busy") return;
    setShareState("busy");
    const how = await shareCard(hud.dead);
    track(`share-card-${how}`);
    setShareState("done");
  };

  const ring = 2 * Math.PI * 22;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <div className="labyrinth" ref={host} />

      {/* danger: the edges close in, colder and redder */}
      <div className="lab-vignette" style={{ opacity: hud.danger }} />

      {stick.active && (
        <div className="lab-stick" style={{ left: stick.ox, top: stick.oy }}>
          <span style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
        </div>
      )}
      <div className={"lab-reticle" + (hud.near ? " near" : "")} />

      {/* HUD: glyphs only. Light ring, shards, depth marks */}
      <div className="lab-hud">
        <svg className={"lab-light" + (hud.light < 25 ? " low" : "")} viewBox="0 0 54 54" aria-label="light">
          <circle cx="27" cy="27" r="22" className="track" />
          <circle cx="27" cy="27" r="22" className="fill" strokeDasharray={`${(hud.light / 100) * ring} ${ring}`} />
          <text x="27" y="31">✶</text>
        </svg>
        <div className="lab-shards">
          <span className="glyph">◆</span>
          {hud.shards}
        </div>
        <div className="lab-depth">
          {Array.from({ length: hud.depth + 1 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>

      {hud.dead && (
        <div className="lab-dead" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-dead-eyes">
            <span />
            <span />
          </div>
          <div className="lab-dead-metres">{Math.round(hud.dead.metres)} m</div>
          <div className="lab-dead-sub">
            ◆ {hud.dead.shards} · {"|".repeat(hud.dead.depth + 1)}
            {hud.dead.best && <span className="lab-best"> ✶</span>}
          </div>
          <div className="lab-dead-actions">
            <button onClick={() => restartRef.current()} aria-label="again">
              ↻
            </button>
            <button onClick={share} aria-label="share" disabled={shareState === "busy"}>
              {shareState === "done" ? "✓" : "⇪"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
