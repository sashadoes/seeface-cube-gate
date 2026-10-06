import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Howl } from "howler";
import { createWorld } from "./world";
import { createInput, type Input } from "./controls";
import { free, spawn, CELL } from "./maze";
import { loadWeather } from "../marks/weather";
import { track } from "../analytics";
import "./Labyrinth.scss";

// /labyrinth: walk the infinite seeface1 maze. Stage 1 is single-player; the
// maze is identical for everyone so multiplayer can be layered on top.

const EYE = 1.62;
const WALK = 2.6;
const RUN = 5.2;

export default function Labyrinth() {
  const host = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ active: false, ox: 0, oy: 0, x: 0, y: 0 });
  const [near, setNear] = useState(false);

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
    const input: Input = createInput(renderer.domElement);
    const start = spawn();
    // arrive a few steps from the room's cube, facing it
    const pos = { x: start.x + 2.4, z: start.z + 2.4 };
    input.yaw = Math.PI / 4;

    // dev-only handle for debugging in the browser console
    if (import.meta.env.DEV) (window as unknown as { __lab: unknown }).__lab = { pos, input, camera, world };

    const spinSfx = new Howl({ src: ["/sounds/ShuffleCube.mp3"], volume: 0.5, preload: true });
    const stepSfx = new Howl({ src: ["/sounds/SwitchCube1.mp3"], volume: 0.08, preload: true });

    loadWeather().then((w) => {
      world.setWeather(w);
      track(`weather-${w.kind}`);
    });
    track("labyrinth-opened");

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let walked = 0;
    let bob = 0;
    let nextStep = 0;
    let milestone = 50;
    let raf = 0;
    let wasNear = false;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      // move, sliding along walls (x and z separately)
      const speed = (input.run ? RUN : WALK) * dt;
      const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
      const rx = Math.cos(input.yaw), rz = -Math.sin(input.yaw);
      const dx = (fx * input.move.z + rx * input.move.x) * speed;
      const dz = (fz * input.move.z + rz * input.move.x) * speed;
      const moving = Math.abs(dx) + Math.abs(dz) > 0.0001;
      if (free(pos.x + dx, pos.z)) pos.x += dx;
      if (free(pos.x, pos.z + dz)) pos.z += dz;

      if (moving) {
        const d = Math.hypot(dx, dz);
        walked += d;
        bob += d * 3.2;
        if (walked > nextStep) {
          stepSfx.play();
          nextStep = walked + (input.run ? 1.1 : 0.8);
        }
        if (walked > milestone) {
          track(`walked-${milestone}m`);
          milestone *= 2;
        }
      }

      camera.position.set(pos.x, EYE + Math.sin(bob) * 0.035, pos.z);
      camera.rotation.set(input.pitch, input.yaw, 0, "YXZ");

      world.update(pos.x, pos.z, t, dt);

      // a cube nearby can be spun (tap / E / Space)
      const c = world.nearestCube(pos.x, pos.z);
      const isNear = !!c && c.dist < CELL * 0.75;
      if (isNear !== wasNear) {
        wasNear = isNear;
        setNear(isNear);
      }
      if (input.consumeTap() && c && isNear) {
        world.spinCube(c.mesh);
        spinSfx.play();
        try {
          navigator.vibrate?.([20, 40, 60]);
        } catch {
          // unsupported
        }
        track("labyrinth-cube-spin");
      }

      setStick((s) =>
        s.active === input.joystick.active && s.x === input.joystick.x && s.y === input.joystick.y ? s : { ...input.joystick }
      );

      renderer.render(world.scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      el.innerHTML = "";
    };
  }, []);

  return (
    <div className="labyrinth" ref={host}>
      {stick.active && (
        <div className="lab-stick" style={{ left: stick.ox, top: stick.oy }}>
          <span style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
        </div>
      )}
      <div className={"lab-reticle" + (near ? " near" : "")} />
    </div>
  );
}
