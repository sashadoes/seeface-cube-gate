// Blob avatars: a soft sphere whose vertex shader does squash-and-stretch and a jelly wobble,
// with a face drawn in the fragment shader (no textures). Six weird kinds.
import * as THREE from "three";

export const BLOBS = [
  { id: "moth", name: "moth", color: 0xd8c8ff, feature: "antennae" },
  { id: "imp", name: "imp", color: 0xff6f91, feature: "horns" },
  { id: "drip", name: "drip", color: 0x6cf0c2, feature: "drip" },
  { id: "eye", name: "eye", color: 0xffd36e, feature: "cyclops" },
  { id: "spike", name: "spike", color: 0x7aa8ff, feature: "spikes" },
  { id: "halo", name: "halo", color: 0xf4f0e8, feature: "halo" },
] as const;
export type BlobKind = (typeof BLOBS)[number]["id"];

const vert = /* glsl */ `
uniform float uSquash; uniform float uWobble; uniform float uTime; uniform float uLean;
varying vec3 vN; varying vec3 vL; varying vec3 vW;
void main(){
  vec3 p = position;
  float sq = uSquash;                         // + stretch, - squash
  p.y *= 1.0 + sq; p.xz *= 1.0 - sq*0.5;
  float w = uWobble * sin(uTime*22.0 + p.y*7.0) * 0.06;
  p.xz *= 1.0 + w;
  p.z += uLean * (p.y + 0.5) * 0.18;
  vL = position; vN = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(p,1.0); vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision mediump float;
uniform vec3 uColor; uniform float uBlink; uniform float uCyclops; uniform float uTalk; uniform vec3 uFogCol; uniform float uFogDensity; uniform vec3 uCam;
varying vec3 vN; varying vec3 vL; varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  vec3 l = normalize(vec3(0.3,0.9,0.4));
  float diff = max(dot(n,l),0.0);
  float rim = pow(1.0 - max(dot(n, normalize(uCam - vW)), 0.0), 2.5);
  vec3 col = uColor * (0.28 + diff*0.75) + rim * uColor * 0.7;
  // face on +z
  vec3 d = normalize(vL);
  if (d.z > 0.0) {
    vec2 f = d.xy / (d.z + 0.6);
    float eyeH = 0.09 * (1.0 - uBlink);
    float e;
    if (uCyclops > 0.5) e = length(vec2(f.x, (f.y-0.12)/max(eyeH*1.4,0.01)*0.12)) - 0.12;
    else e = min(length(vec2(f.x-0.13, (f.y-0.1)/max(eyeH,0.005)*0.09)), length(vec2(f.x+0.13,(f.y-0.1)/max(eyeH,0.005)*0.09))) - 0.07;
    if (e < 0.0) col = mix(vec3(0.02), vec3(1.0), step(e, -0.045) * 0.0) + vec3(0.02);
    float mouth = length(vec2(f.x*1.2, (f.y+0.12)/(0.02 + uTalk*0.06))) - 0.08;
    if (mouth < 0.0 && f.y < -0.04) col = vec3(0.05,0.01,0.03);
  }
  float dist = distance(vW, uCam); float fog = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);
  gl_FragColor = vec4(mix(col, uFogCol, clamp(fog,0.0,1.0)), 1.0);
}`;

export type Blob = {
  group: THREE.Group;
  /** squash from the controller, talk level 0..1, lean (speed) */
  animate: (t: number, dt: number, squash: number, talk: number, lean: number) => void;
  wobble: (amount: number) => void;
  setSpeaking: (level: number) => void;
  dispose: () => void;
};

const bodyGeo = new THREE.SphereGeometry(0.5, 22, 16);

export function createBlob(kind: BlobKind, fog: { color: THREE.Color; density: number; cam: THREE.Vector3 }): Blob {
  const def = BLOBS.find((b) => b.id === kind) ?? BLOBS[0];
  const uniforms = {
    uSquash: { value: 0 },
    uWobble: { value: 0 },
    uTime: { value: 0 },
    uLean: { value: 0 },
    uColor: { value: new THREE.Color(def.color) },
    uBlink: { value: 0 },
    uCyclops: { value: def.feature === "cyclops" ? 1 : 0 },
    uTalk: { value: 0 },
    uFogCol: { value: fog.color },
    uFogDensity: { value: fog.density },
    uCam: { value: fog.cam },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = 0.5;
  const group = new THREE.Group();
  group.add(body);

  // one small extra piece per kind (merged into the body's group, so it squashes along)
  const featMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(0.8) });
  const feat = new THREE.Group();
  if (def.feature === "antennae") for (const sx of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35), featMat);
    a.position.set(sx * 0.14, 0.62, 0.05);
    a.rotation.z = -sx * 0.4;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    tip.position.set(sx * 0.07, 0.17, 0);
    a.add(tip);
    feat.add(a);
  }
  if (def.feature === "horns") for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0x2a0d18 }));
    h.position.set(sx * 0.2, 0.5, 0.05);
    h.rotation.z = -sx * 0.5;
    feat.add(h);
  }
  if (def.feature === "drip") {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), featMat);
    d.position.set(0.25, -0.1, 0.3);
    d.scale.y = 1.6;
    feat.add(d);
  }
  if (def.feature === "spikes") for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), featMat);
    const a = -0.9 + k * 0.45;
    sp.position.set(Math.sin(a) * 0.38, 0.38 + Math.cos(a) * 0.12, -0.12);
    sp.rotation.z = -a * 0.9;
    feat.add(sp);
  }
  if (def.feature === "halo") {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    h.rotation.x = Math.PI / 2;
    h.position.y = 0.72;
    feat.add(h);
  }
  body.add(feat);

  // the speaking ring: pulses with the voice level
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.y = 0.03;
  group.add(ring);

  let wob = 0, blinkT = 2 + Math.random() * 3, speaking = 0;
  return {
    group,
    animate(t, dt, squash, talk, lean) {
      uniforms.uTime.value = t;
      uniforms.uSquash.value = squash;
      wob = Math.max(0, wob - dt * 2.2);
      uniforms.uWobble.value = wob;
      uniforms.uLean.value += (lean - uniforms.uLean.value) * Math.min(1, dt * 8);
      blinkT -= dt;
      uniforms.uBlink.value = blinkT < 0.12 ? 1 : 0;
      if (blinkT < 0) blinkT = 2 + Math.random() * 4;
      uniforms.uTalk.value += (Math.max(talk, speaking) - uniforms.uTalk.value) * Math.min(1, dt * 18);
      const lv = Math.max(talk, speaking);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, lv * 1.6);
      ring.scale.setScalar(1 + lv * 0.6);
      // feature pieces follow the squash too
      feat.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
      body.position.y = 0.5 * (1 + squash);
    },
    wobble(a) {
      wob = Math.min(1.5, wob + a);
    },
    setSpeaking(l) {
      speaking = l;
    },
    dispose() {
      mat.dispose();
      featMat.dispose();
    },
  };
}
