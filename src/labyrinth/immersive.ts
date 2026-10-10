// Immersive mode: extra depth, only for devices that can carry it.
//   · your lantern casts real shadows (walls, cubes, objects throw them as you move)
//   · 3D sound for gramophones (HRTF: you hear where the music is, even behind you)
//   · a heartbeat you feel more than hear as the dark king comes near
// It switches on by itself when quality is "high" and the device has kept a
// smooth frame for a few seconds; if the device starts to struggle it switches
// off for the rest of the visit (no flapping on and off).
import * as THREE from "three";

let hrtf = false;
/** gramophones ask this when they start a record */
export const useHrtf = () => hrtf;

export function createImmersive(renderer: THREE.WebGLRenderer, scene: THREE.Scene, lantern: THREE.SpotLight, audio: { ctx: AudioContext; out: AudioNode }) {
  let on = false;
  let allowed = false; // quality says yes
  let smoothFor = 0, struggleFor = 0, gaveUp = false, scanT = 0;
  let beatT = 0;

  lantern.shadow.mapSize.set(1024, 1024);
  lantern.shadow.camera.near = 0.2;
  lantern.shadow.camera.far = 16;
  lantern.shadow.bias = -0.0008;
  lantern.shadow.normalBias = 0.03;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // opaque things throw shadows; big floor/ceiling planes only receive them
  const tag = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.shadowTagged) return;
      m.userData.shadowTagged = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const opaque = mats.every((x) => x && !x.transparent && x.blending === THREE.NormalBlending);
      if (!opaque) return;
      m.receiveShadow = true;
      m.castShadow = !(m.geometry instanceof THREE.PlaneGeometry);
    });
  };

  function set(v: boolean) {
    if (on === v) return;
    on = v;
    hrtf = v;
    renderer.shadowMap.enabled = v;
    lantern.castShadow = v;
    // materials compile with or without shadows: tell them once
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x && (x.needsUpdate = true));
    });
    if (v) tag();
  }

  function thump(gain: number) {
    const t = audio.ctx.currentTime;
    for (const [at, f, g] of [[0, 55, 1], [0.16, 48, 0.7]] as const) {
      const o = audio.ctx.createOscillator();
      const v = audio.ctx.createGain();
      o.frequency.setValueAtTime(f, t + at);
      o.frequency.exponentialRampToValueAtTime(30, t + at + 0.18);
      v.gain.setValueAtTime(0.0001, t + at);
      v.gain.exponentialRampToValueAtTime(gain * g, t + at + 0.02);
      v.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.25);
      o.connect(v).connect(audio.out);
      o.start(t + at);
      o.stop(t + at + 0.3);
    }
  }

  return {
    isOn: () => on,
    /** the player's quality setting */
    setAllowed(v: boolean) {
      allowed = v;
      if (!v) set(false);
    },
    /** once per frame: real frame time, the dynamic-resolution scale, how near the dark king is (0..1) */
    update(dtReal: number, resScale: number, danger: number) {
      if (allowed && !gaveUp) {
        const smooth = resScale >= 0.99 && dtReal < 0.022;
        smoothFor = smooth ? smoothFor + dtReal : 0;
        struggleFor = on && resScale < 0.8 ? struggleFor + dtReal : 0;
        if (!on && smoothFor > 4) set(true);
        if (on && struggleFor > 3) {
          set(false);
          gaveUp = true;
        }
      }
      if (!on) return;
      // new rooms and objects appear as you walk: tag them now and then
      scanT -= dtReal;
      if (scanT <= 0) {
        scanT = 2;
        tag();
      }
      // heartbeat: faster and stronger as he nears
      if (danger > 0.15) {
        beatT -= dtReal;
        if (beatT <= 0) {
          beatT = 1.1 - danger * 0.6;
          thump(0.08 + danger * 0.22);
        }
      } else beatT = 0;
    },
  };
}
