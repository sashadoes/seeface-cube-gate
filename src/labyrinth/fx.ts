// Light and effects, to make the labyrinth look like a moving artwork:
//   · glow (bloom): everything bright bleeds soft light, like film
//   · a film look: a touch of chromatic aberration at the edges, grain, vignette
//   · light shafts falling from the ceiling lights (god rays)
//   · dust motes sparkling in the air around you
//   · a light trail behind you as you walk, tinted by where you are
//   · aurora ribbons waving in the sky (the open, the hall, the ship)
// Off on "low" quality or when "glow & effects" is switched off in settings.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CELL, WALL_H, hasPanel } from "./maze";

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      // chromatic aberration grows towards the edges
      vec2 off = c * d * 0.018 * amount;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // grain + vignette
      col += (rand(vUv) - 0.5) * 0.045 * amount;
      col *= 1.0 - d * 0.9 * amount;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function dot(inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, inner);
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  // ---------------- post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.45, 0.72);
  composer.addPass(bloom);
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  composer.addPass(new OutputPass());
  let enabled = true;

  // ---------------- in-world light play
  const group = new THREE.Group();
  scene.add(group);
  const soft = dot();

  // dust motes around you
  const MOTES = 260;
  const mp = new Float32Array(MOTES * 3);
  for (let k = 0; k < MOTES; k++) mp.set([(Math.random() - 0.5) * 16, Math.random() * WALL_H, (Math.random() - 0.5) * 16], k * 3);
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: soft, size: 0.06, color: 0xfff6e2, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(motes);

  // god rays from the ceiling lights near you
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shafts = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.5, WALL_H, 20, 1, true), shaftMat);
    m.position.y = WALL_H / 2;
    m.visible = false;
    group.add(m);
    return m;
  });
  let lastCell = "";

  // your light trail
  const trail = Array.from({ length: 70 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.setScalar(0.35);
    s.userData.life = 0;
    group.add(s);
    return s;
  });
  let trailK = 0, lastDrop = { x: 0, z: 0 };

  // aurora ribbons for the sky places
  const aurora = new THREE.Group();
  const ribbons = Array.from({ length: 3 }, (_, k) => {
    const geo = new THREE.PlaneGeometry(90, 14, 60, 1);
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    const hue = [150, 280, 190][k];
    grad.addColorStop(0, `hsla(${hue},90%,60%,0)`);
    grad.addColorStop(0.6, `hsla(${hue},90%,60%,0.55)`);
    grad.addColorStop(1, `hsla(${hue + 40},90%,70%,0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(0, 34 + k * 6, -20 + k * 14);
    m.rotation.x = -0.3;
    m.userData.base = (geo.getAttribute("position") as THREE.BufferAttribute).array.slice();
    aurora.add(m);
    return m;
  });
  aurora.visible = false;
  group.add(aurora);

  const tint = new THREE.Color();

  return {
    setEnabled(on: boolean) {
      enabled = on;
      group.visible = on;
    },
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
    },
    update(dt: number, t: number, me: { x: number; z: number; moving: boolean; sky: boolean; zoneTint: number }) {
      if (!enabled) return;
      film.uniforms.time.value = t;
      // motes follow you, drifting and twinkling
      motes.position.set(me.x, 0, me.z);
      const a = mg.getAttribute("position") as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let k = 0; k < MOTES; k++) {
        arr[k * 3 + 1] += Math.sin(t * 0.7 + k) * dt * 0.08;
        arr[k * 3] += Math.cos(t * 0.3 + k * 1.7) * dt * 0.05;
        if (arr[k * 3 + 1] > WALL_H) arr[k * 3 + 1] = 0;
        if (arr[k * 3 + 1] < 0) arr[k * 3 + 1] = WALL_H;
      }
      a.needsUpdate = true;
      (motes.material as THREE.PointsMaterial).opacity = 0.4 + Math.sin(t * 2) * 0.15;
      // shafts under the nearest ceiling lights
      const ci = Math.floor(me.x / CELL), cj = Math.floor(me.z / CELL);
      const cell = `${ci}:${cj}`;
      if (cell !== lastCell) {
        lastCell = cell;
        let k = 0;
        for (let r = 0; r <= 4 && k < shafts.length; r++)
          for (let i = ci - r; i <= ci + r && k < shafts.length; i++)
            for (let j = cj - r; j <= cj + r && k < shafts.length; j++) {
              if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !hasPanel(i, j)) continue;
              shafts[k].position.set((i + 0.5) * CELL, WALL_H / 2, (j + 0.5) * CELL);
              shafts[k].visible = !me.sky;
              k++;
            }
        for (; k < shafts.length; k++) shafts[k].visible = false;
      }
      shaftMat.opacity = 0.055 + Math.sin(t * 0.9) * 0.02;
      // the trail
      tint.setHex(me.zoneTint);
      if (me.moving && Math.hypot(me.x - lastDrop.x, me.z - lastDrop.z) > 0.35) {
        lastDrop = { x: me.x, z: me.z };
        const s = trail[trailK++ % trail.length];
        s.position.set(me.x, 0.25 + Math.random() * 0.2, me.z);
        (s.material as THREE.SpriteMaterial).color.copy(tint).lerp(new THREE.Color(0xffffff), 0.4);
        s.userData.life = 1;
      }
      for (const s of trail) {
        if (s.userData.life <= 0) continue;
        s.userData.life -= dt / 4;
        (s.material as THREE.SpriteMaterial).opacity = Math.max(0, s.userData.life) * 0.7;
        s.position.y += dt * 0.15;
      }
      // aurora over open skies
      aurora.visible = me.sky;
      if (me.sky) {
        aurora.position.set(me.x, 0, me.z);
        ribbons.forEach((m, k) => {
          const p = m.geometry.getAttribute("position") as THREE.BufferAttribute;
          const base = m.userData.base as Float32Array;
          const arr2 = p.array as Float32Array;
          for (let v = 0; v < arr2.length; v += 3) arr2[v + 2] = base[v + 2] + Math.sin(base[v] * 0.08 + t * 0.6 + k) * 4 + Math.sin(base[v] * 0.21 + t * 0.9) * 1.5;
          p.needsUpdate = true;
        });
      }
    },
    render() {
      if (enabled) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
