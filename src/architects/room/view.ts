// RoomView: the renderer around a built room. Two modes:
//   orbit: the chamber preview, a slow turn around the room (drag to turn, pinch/wheel to zoom)
//   walk:  "Enter my room": first person; drag to look, WASD/arrows or the on-screen stick to move
// Kind to phones: pixel ratio ≤1.5, and the loop stops while the canvas is hidden or off screen.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Blueprint } from "../types";
import { buildRoom, type Resolve, type Room } from "./build";
import { playAmbience } from "./presets";

const EYE = 1.65;
const SPEED = 3.2;

export class RoomView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  room: Room | null = null;
  mode: "orbit" | "walk" = "orbit";
  private clock = new THREE.Clock();
  private orbit = { angle: 0.6, pitch: 0, zoom: 1, idle: 0 };
  private walker = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private visible = true;
  private onScreen = true;
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch = new Map<number, { x: number; y: number }>();
  private cleanup: (() => void)[] = [];
  private audio: { ctx: AudioContext; stop: () => void } | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const c = this.renderer.domElement;
    c.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    c.tabIndex = 0;
    host.appendChild(c);
    // a soft studio environment: metals and mirrors reflect something, nothing renders pitch black
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmrem.dispose();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      this.onScreen = e.isIntersecting;
      this.loop();
    });
    io.observe(host);
    const vis = () => {
      this.visible = !document.hidden;
      this.loop();
    };
    document.addEventListener("visibilitychange", vis);
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(ev, fn as EventListener);
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(c, "pointerdown", (e) => this.down(e));
    on(c, "pointermove", (e) => this.move(e));
    on(c, "pointerup", (e) => this.up(e));
    on(c, "pointercancel", (e) => this.up(e));
    on(c, "wheel", (e) => {
      e.preventDefault();
      this.orbit.zoom = THREE.MathUtils.clamp(this.orbit.zoom * (1 + e.deltaY * 0.001), 0.4, 1.6);
    });
    on(window, "keydown", (e) => this.mode === "walk" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) && this.keys.add(e.key.toLowerCase()));
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    this.cleanup.push(() => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    });
    this.resize();
    this.loop();
  }

  setBlueprint(bp: Blueprint, resolve: Resolve, seed: string) {
    const fresh = buildRoom(bp, resolve, () => this.renderOnce(), seed);
    if (this.room) {
      this.scene.remove(this.room.group);
      this.room.dispose();
    }
    this.room = fresh;
    this.scene.add(fresh.group);
    this.showCeiling(this.mode === "walk");
    this.scene.fog = fresh.fog;
    this.scene.background = fresh.background;
    this.exposure = fresh.exposure;
    this.applyExposure();
    if (this.mode === "walk") this.clampWalker();
    this.renderOnce();
  }

  enterWalk() {
    if (!this.room) return;
    this.mode = "walk";
    const s = this.room.shell.spawn;
    this.walker.pos.copy(s.pos);
    this.walker.yaw = s.yaw;
    this.walker.pitch = 0;
    this.showCeiling(true);
    this.renderer.domElement.focus();
  }
  exitWalk() {
    this.mode = "orbit";
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.showCeiling(false);
    this.stopAudio();
  }
  private exposure = 1;
  // the orbit preview is a little brighter than the walk, so the room reads at a glance
  private applyExposure() {
    this.renderer.toneMappingExposure = this.exposure * (this.mode === "orbit" ? 1.45 : 1);
  }
  private showCeiling(on: boolean) {
    this.applyExposure();
    this.room?.group.traverse((o) => o.userData.ceiling && (o.visible = on));
  }
  setStick(x: number, y: number) {
    this.stick = { x, y };
  }

  /** ambience: an uploaded loop (blob URL) or a synthesised preset; call from a tap (autoplay rules) */
  async startAudio(bp: Blueprint, resolve: Resolve) {
    this.stopAudio();
    const vol = bp.audio.volume ?? 0.5;
    if (bp.audio.ambient_asset_id) {
      const url = await resolve(bp.audio.ambient_asset_id);
      if (!url) return;
      const el = new Audio(url);
      el.loop = true;
      el.volume = vol;
      el.play().catch(() => {});
      this.audio = { ctx: null as unknown as AudioContext, stop: () => el.pause() };
      return;
    }
    if (!bp.audio.preset || bp.audio.preset === "silence") return;
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = vol * 0.6;
    out.connect(ctx.destination);
    const stop = playAmbience(ctx, bp.audio.preset, out);
    this.audio = {
      ctx,
      stop: () => {
        stop();
        ctx.close();
      },
    };
  }
  stopAudio() {
    this.audio?.stop();
    this.audio = null;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.stopAudio();
    this.cleanup.forEach((f) => f());
    this.room?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- input
  private down(e: PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.drag) this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.orbit.idle = 0;
  }
  private move(e: PointerEvent) {
    if (this.pinch.size === 2 && this.pinch.has(e.pointerId)) {
      const [a, b] = [...this.pinch.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...this.pinch.values()];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      if (before > 0) this.orbit.zoom = THREE.MathUtils.clamp(this.orbit.zoom * (before / after), 0.4, 1.6);
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x,
      dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.mode === "walk") {
      this.walker.yaw -= dx * 0.005;
      this.walker.pitch = THREE.MathUtils.clamp(this.walker.pitch - dy * 0.004, -1.2, 1.2);
    } else {
      this.orbit.angle -= dx * 0.006;
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 0.004, -0.5, 0.6);
    }
  }
  private up(e: PointerEvent) {
    this.pinch.delete(e.pointerId);
    if (this.drag?.id === e.pointerId) this.drag = null;
  }

  // ---------------------------------------------------------------- frame
  private resize() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }
  private loop() {
    const run = this.visible && this.onScreen;
    this.renderer.setAnimationLoop(run ? () => this.frame() : null);
  }
  renderOnce() {
    if (this.room) this.renderer.render(this.scene, this.camera);
  }
  private clampWalker() {
    const f = this.room!.shell.floor;
    const p = this.walker.pos;
    if (f.kind === "rect") {
      p.x = THREE.MathUtils.clamp(p.x, -f.w / 2 + 0.4, f.w / 2 - 0.4);
      p.z = THREE.MathUtils.clamp(p.z, -f.d / 2 + 0.4, f.d / 2 - 0.4);
    } else {
      const d = Math.hypot(p.x, p.z),
        max = f.r - 0.4;
      if (d > max) p.multiplyScalar(max / d);
    }
  }
  private frame() {
    if (!this.room) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.room.update(t);
    const cam = this.camera;
    if (this.mode === "walk") {
      const k = this.keys;
      let fwd = this.stick.y,
        side = this.stick.x;
      if (k.has("w") || k.has("arrowup")) fwd += 1;
      if (k.has("s") || k.has("arrowdown")) fwd -= 1;
      if (k.has("a") || k.has("arrowleft")) side -= 1;
      if (k.has("d") || k.has("arrowright")) side += 1;
      const len = Math.hypot(fwd, side);
      if (len > 1) (fwd /= len), (side /= len);
      const run = k.has("shift") ? 1.8 : 1;
      const yaw = this.walker.yaw;
      this.walker.pos.x += (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * SPEED * run * dt;
      this.walker.pos.z += (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * SPEED * run * dt;
      this.clampWalker();
      const bob = len > 0.1 ? Math.sin(t * 9) * 0.03 : 0;
      cam.position.set(this.walker.pos.x, EYE + bob, this.walker.pos.z);
      cam.rotation.set(this.walker.pitch, this.walker.yaw, 0, "YXZ");
    } else {
      const o = this.room.shell.orbit;
      this.orbit.idle += dt;
      if (!this.drag && this.orbit.idle > 1.5) this.orbit.angle += dt * 0.12; // a slow turn when left alone
      const rad = o.radius * this.orbit.zoom;
      const hgt = o.height * this.orbit.zoom + this.orbit.pitch * rad;
      cam.position.set(o.target.x + Math.sin(this.orbit.angle) * rad, Math.max(0.6, hgt), o.target.z + Math.cos(this.orbit.angle) * rad);
      cam.lookAt(o.target);
    }
    this.renderer.render(this.scene, cam);
  }
}
