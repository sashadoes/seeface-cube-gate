// The game: renderer, scene, third-person camera, the player's body + blob, falling through
// holes, and the frame loop with dynamic resolution. React only talks to it through this API.
import * as THREE from "three";
import { CELL, WELL_R, curatedRoomPlace, districtAt, roomAtPoint, roomGeometry, SPAWN, type Well } from "../../../shared/world/maze.ts";
import { createLabyrinth } from "../scene/labyrinth.ts";
import { createBlob, type BlobKind } from "../avatar/blob.ts";
import { createBody, dropAt, step, type StepEvent } from "../player/controller.ts";
import { createInput } from "../player/input.ts";
import { getAudio, type Surface } from "../audio/engine.ts";

export const FALL_SECS = 2.6;

export type GameEvents = {
  fallStart: (to: string) => void;
  fallEnd: (roomId: string | null) => void;
  room: (roomId: string | null) => void;
  frame: (t: number) => void;
};

export type Game = ReturnType<typeof createGame>;

export function createGame(canvas: HTMLCanvasElement, opts: { blob: BlobKind; phone: boolean }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.phone, powerPreference: "high-performance", stencil: false });
  const basePR = Math.min(devicePixelRatio || 1, opts.phone ? 1.5 : 2);
  let prScale = 1;
  renderer.setPixelRatio(basePR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const lab = createLabyrinth();
  scene.background = lab.fog.color;
  scene.add(lab.group);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 140);
  const input = createInput(canvas);

  const body = createBody(SPAWN.x, SPAWN.z);
  let me = createBlob(opts.blob, { color: lab.fog.color, density: lab.fog.density, cam: camera.position });
  scene.add(me.group);
  let facing = 0;

  const listeners: { [K in keyof GameEvents]: GameEvents[K][] } = { fallStart: [], fallEnd: [], room: [], frame: [] };
  const emit = <K extends keyof GameEvents>(k: K, ...a: Parameters<GameEvents[K]>) => listeners[k].forEach((f) => (f as (...x: unknown[]) => void)(...a));

  // falling
  let fall: { t: number; target: string; landed: boolean } | null = null;
  let justLanded = 0;
  let currentRoom: string | null = null;

  const destinationOf = (roomId: string) => {
    const p = curatedRoomPlace(roomId) ?? curatedRoomPlace("first-words")!;
    const g = roomGeometry(p);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
    return { x: g.center.x + Math.cos(a) * r, z: g.center.z + Math.sin(a) * r, id: p.id };
  };

  function startFall(well: Well) {
    if (fall) return;
    fall = { t: 0, target: well.target, landed: false };
    const a = getAudio();
    a.sfx2.whoosh(FALL_SECS);
    emit("fallStart", well.target);
  }

  /** drop through a hole that opens right under you (radio JUMP IN, onboarding auto-drop) */
  function fallTo(roomId: string) {
    if (fall) return;
    const portal = { id: "portal", x: body.x, z: body.z, target: roomId };
    lab.portal({ x: body.x, z: body.z, r: 1.6 });
    body.inWell = portal;
    body.vy = Math.min(body.vy, -4);
    body.y = Math.min(body.y, -0.2);
    startFall(portal);
  }

  // camera
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const CAM_DIST = 6.8;

  function updateCamera(dt: number) {
    const { yaw, pitch } = input.look;
    if (fall && !fall.landed) {
      // looking down the shaft over your shoulder
      camTarget.set(body.x, body.y, body.z);
      camPos.set(body.x + Math.sin(yaw) * 1.2, body.y + 7, body.z + Math.cos(yaw) * 1.2);
      camera.position.lerp(camPos, Math.min(1, dt * 10));
      camera.lookAt(camTarget);
      return;
    }
    camTarget.set(body.x, Math.max(0, body.y) + 1.1, body.z);
    const h = Math.sin(pitch) * CAM_DIST, d = Math.cos(pitch) * CAM_DIST;
    camPos.set(body.x + Math.sin(yaw) * d, Math.max(4.1, camTarget.y + h), body.z + Math.cos(yaw) * d);
    camera.position.lerp(camPos, Math.min(1, dt * 9));
    camera.lookAt(camTarget);
  }

  // frame loop
  const clock = new THREE.Clock();
  let raf = 0, t = 0, fpsAcc = 0, fpsFrames = 0, fps = 60, slow = 0, fast = 0;
  const events: StepEvent[] = [];
  const surfaceAt = (x: number, z: number): Surface => (roomAtPoint(x, z) ? "carpet" : districtAt(x, z) === "market" || districtAt(x, z) === "music" ? "metal" : "stone");

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;

    // move relative to the camera
    const yaw = input.look.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const mx = input.move.x * -fz + input.move.y * fx;
    const mz = input.move.x * fx + input.move.y * fz;
    events.length = 0;
    const falling = !!fall && !fall.landed;
    step(body, { mx: falling ? 0 : mx, mz: falling ? 0 : mz, jump: input.consumeJump() }, dt, events);
    if (falling) body.vy = Math.max(body.vy, -30);

    const a = getAudio();
    for (const e of events) {
      if (e.t === "step") a.sfx2.step(surfaceAt(body.x, body.z), Math.min(1, e.speed / 6));
      else if (e.t === "jump") a.sfx2.jump();
      else if (e.t === "double") (a.sfx2.jump(true), me.wobble(0.4));
      else if (e.t === "land") {
        if (justLanded > 0) {
          a.sfx2.bassHit();
          me.wobble(1.4);
          justLanded = 0;
        } else {
          a.sfx2.land(e.impact);
          me.wobble(0.3 + e.impact);
        }
      } else if (e.t === "pad") (a.sfx2.pad(), me.wobble(0.8));
      else if (e.t === "vent") a.sfx2.vent();
      else if (e.t === "bump") (a.sfx2.boop(), me.wobble(0.5));
      else if (e.t === "well") startFall(e.well);
    }

    if (fall && !fall.landed) {
      fall.t += dt;
      if (fall.t >= FALL_SECS) {
        const d = destinationOf(fall.target);
        lab.portal(null);
        dropAt(body, d.x, d.z);
        fall.landed = true;
        justLanded = 1;
        // the camera jumps with you (hidden by the flash)
        camera.position.set(d.x + Math.sin(yaw) * 5, 9, d.z + Math.cos(yaw) * 5);
        emit("fallEnd", d.id);
      }
    } else if (fall?.landed && body.onGround) fall = null;

    // facing follows movement
    const sp = Math.hypot(body.vx, body.vz);
    if (sp > 0.5) {
      const want = Math.atan2(body.vx, body.vz);
      let d = want - facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing += d * Math.min(1, dt * 12);
    }
    me.group.position.set(body.x, Math.max(body.y, body.inWell ? body.y : 0), body.z);
    me.group.rotation.y = facing;
    me.animate(t, dt, body.squash, 0, Math.min(1, sp / 7));

    const room = roomAtPoint(body.x, body.z)?.id ?? null;
    if (room !== currentRoom) {
      currentRoom = room;
      emit("room", room);
    }

    updateCamera(dt);
    lab.update(body.x, body.z, camera.position, t);
    emit("frame", t);
    renderer.render(scene, camera);

    // dynamic resolution: keep the frame rate, give up sharpness first
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
      if (fps < 50) ((slow++), (fast = 0));
      else if (fps > 58) ((fast++), (slow = 0));
      if (slow >= 2 && prScale > 0.55) ((prScale = Math.max(0.55, prScale * 0.85)), renderer.setPixelRatio(basePR * prScale), (slow = 0));
      if (fast >= 8 && prScale < 1) ((prScale = Math.min(1, prScale * 1.1)), renderer.setPixelRatio(basePR * prScale), (fast = 0));
    }
  }

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);

  const game = {
    scene,
    camera,
    body,
    input,
    lab,
    get me() {
      return me;
    },
    setBlob(kind: BlobKind) {
      scene.remove(me.group);
      me.dispose();
      me = createBlob(kind, { color: lab.fog.color, density: lab.fog.density, cam: camera.position });
      scene.add(me.group);
      me.wobble(1.2);
    },
    start() {
      clock.start();
      frame();
    },
    on<K extends keyof GameEvents>(k: K, fn: GameEvents[K]) {
      listeners[k].push(fn);
      return () => (listeners[k] = listeners[k].filter((f) => f !== fn) as never);
    },
    fallTo,
    falling: () => !!fall,
    room: () => currentRoom,
    position: () => ({ x: body.x, y: body.y, z: body.z, facing }),
    stats: () => ({ fps: Math.round(fps), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr: +(basePR * prScale).toFixed(2), walls: lab.drawInfo().walls }),
    cellSize: CELL,
    wellRadius: WELL_R,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      input.dispose();
      renderer.dispose();
    },
  };
  return game;
}
