// Hypnotic wallpaper: the walls are the biggest surfaces in the maze, so they
// carry the look. Everything that moves is done inside the walls' own shader
// (a few extra lines in MeshStandardMaterial), never as extra screen passes,
// video or per-frame canvas uploads:
//   · the see/face monogram in one of six patterns (grid, half-drop, diamond,
//     mirrored, a ticker band, one giant slowly turning crest), drifting slowly
//     like the cube page's walls
//   · a slow wave of light travels through the maze and the monograms glow as
//     it passes: the walls breathe, together (never said, only shown)
//   · op-art walls (owner reference, 2026-10-11: hex lattices on warped,
//     funnel-shaped rooms): a honeycomb in two strong colours with a monogram
//     in every cell and a bevel that is light on one side and dark on the
//     other. Still pictures like that seem to drift in the corner of your eye
//     (the peripheral drift illusion): motion the GPU never has to draw.
//   · weird forms: some walls bend their pattern (bulge, swirl, wave, funnel)
//   · each wall picks its own pattern, crop, mirror and tint from where it
//     stands, so 4 pictures per location look like dozens of rooms. The same
//     for everyone.
// Cost per wall pixel: one extra (tiny, mipmapped) texture read + a little math.
// Low quality and "reduce motion" keep the patterns but stop the motion.
import * as THREE from "three";

const shared = {
  sfTime: { value: 0 },
  /** 0 = still patterns, 1 = drifting */
  sfFlow: { value: 1 },
  /** strength of the travelling light wave */
  sfPulse: { value: 1 },
  sfLogo: { value: null as THREE.Texture | null },
  /** ?walls=<pattern> shows one pattern on every wall (to review them); -1 = mixed */
  sfForce: { value: forcedPattern() },
};

function forcedPattern() {
  const names = ["grid", "halfdrop", "diamond", "mirror", "ticker", "crest", "op", "funnel"];
  const w = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("walls");
  return w ? names.indexOf(w) : -1;
}

function logoTexture() {
  if (shared.sfLogo.value) return shared.sfLogo.value;
  const t = new THREE.TextureLoader().load("/imgs/seeface-logo-transparent.png");
  t.colorSpace = THREE.NoColorSpace; // only its alpha is used
  t.anisotropy = 4;
  shared.sfLogo.value = t;
  return t;
}

const VERT_HEAD = /* glsl */ `
varying vec2 vSfUv;
varying vec3 vSfWorld;
varying float vSfSeed;
float sfHash(vec2 c) { c = mod(c, 997.0); return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
`;

const VERT_BODY = /* glsl */ `
vSfUv = uv;
#ifdef USE_INSTANCING
  vec4 sfOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vSfWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
#else
  vec4 sfOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vSfWorld = (modelMatrix * vec4(position, 1.0)).xyz;
#endif
// the wall's own seed: from where it stands (half-metre grid), the same on every screen
vSfSeed = sfHash(floor(sfOrigin.xz * 2.0 + 0.5));
`;

const FRAG_HEAD = /* glsl */ `
varying vec2 vSfUv;
varying vec3 vSfWorld;
varying float vSfSeed;
uniform sampler2D sfLogo;
uniform float sfTime;
uniform float sfFlow;
uniform float sfPulse;
uniform vec3 sfGlow;
uniform vec3 sfAccent;
uniform float sfGlowAmt;
uniform float sfInk;
uniform float sfCover;
uniform float sfForce;
uniform vec3 sfOpA; // op-art lattice colour
uniform vec3 sfOpB; // op-art cell colour
// set by sfMono for op-art walls
vec3 sfOpCol = vec3(0.0);
float sfOpMix = 0.0;

// pointy-top honeycomb: local coords in the cell (inradius 0.5), cell id out
vec2 sfHex(vec2 p, out vec2 id) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  id = p - g;
  return g;
}

// weird forms: bend the wall's coordinates (metres in, metres out)
vec2 sfWarp(vec2 q, float seed, float kind) {
  vec2 c = vec2(2.15, 1.7);
  vec2 d = q - c;
  float r = length(d);
  float breathe = 1.0 + 0.15 * sin(sfTime * sfFlow * 0.25 + seed * 6.28);
  if (kind < 1.0) {            // bulge: the wall swells towards you
    return c + d * (0.55 + 0.45 * smoothstep(0.0, 2.4, r)) / breathe;
  } else if (kind < 2.0) {     // swirl: a slow whirlpool
    float a = (1.4 * breathe) * exp(-r * 0.7) + sfTime * sfFlow * 0.03;
    return c + mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
  } else if (kind < 3.0) {     // wave: the wall ripples like cloth
    return q + vec2(sin(q.y * 1.8 + seed * 9.0), sin(q.x * 1.3 + seed * 5.0)) * 0.22 * breathe;
  }
  // funnel: everything falls into a hole in the middle of the wall
  return c + normalize(d + 1e-4) * pow(r, 1.6) * 0.55 * breathe;
}

// op-art honeycomb with a monogram in every cell; returns the monogram's alpha
float sfOpArt(vec2 q, float s, float seed) {
  vec2 id;
  vec2 p = q / (s * 0.75);
  vec2 g = sfHex(p, id);
  // hex "distance": 0 in the middle, 0.5 on the border
  float d = max(abs(g.x), dot(abs(g), vec2(0.5, 0.8660254)));
  vec2 n = abs(g.x) > dot(abs(g), vec2(0.5, 0.8660254)) ? vec2(sign(g.x), 0.0) : vec2(0.5 * sign(g.x), 0.8660254 * sign(g.y));
  // the light comes from one side for the whole wall (that's what makes it drift)
  float la = fract(seed * 3.3) * 6.2832;
  float shade = dot(n, vec2(cos(la), sin(la)));
  float aa = fwidth(d) * 1.5;
  float lattice = smoothstep(0.42 - aa, 0.42 + aa, d);
  float ring = smoothstep(0.33 - aa, 0.33 + aa, d) * (1.0 - lattice);
  vec3 bevel = shade > 0.0 ? vec3(1.0) : vec3(0.02);
  sfOpCol = mix(mix(sfOpB, bevel, ring * smoothstep(0.0, 0.25, abs(shade))), sfOpA, lattice);
  sfOpMix = 0.88;
  // the monogram sits inside each cell
  vec2 cell = g / 0.62 + 0.5;
  vec2 gx = dFdx(p) / 0.62, gy = dFdy(p) / 0.62;
  return textureGrad(sfLogo, cell, gx, gy).a * (1.0 - smoothstep(0.3, 0.33, d));
}

// the monogram pattern on this wall: 0..1 coverage
float sfMono(vec2 uv, float seed) {
  if (sfForce < 0.0 && fract(seed * 2.917) > sfCover) return 0.0; // some walls are just the picture
  // the wall face in metres (4.3 m wide, 3.4 m tall; uv.y runs 0..0.85)
  vec2 q = vec2(uv.x * 4.3, uv.y * 4.0);
  float mode = sfForce >= 0.0 ? sfForce : floor(fract(seed * 13.71) * 8.0);
  float s = mix(0.75, 1.5, fract(seed * 5.31));
  // op-art honeycomb, flat or falling into a funnel
  if (mode >= 6.0) return sfOpArt(mode > 6.5 ? sfWarp(q, seed, 3.0) : q, s, seed);
  // about a third of the other walls bend their pattern
  if (fract(seed * 6.17) < 0.35) q = sfWarp(q, seed, floor(fract(seed * 8.53) * 3.0));
  float dir = fract(seed * 9.13) > 0.5 ? 1.0 : -1.0;
  float drift = sfTime * sfFlow * 0.06 * dir;
  vec2 p = q / s;
  // mip level from the smooth coordinate, so tile edges never draw a seam
  vec2 gx = dFdx(p), gy = dFdy(p);
  vec2 cell;
  if (mode < 1.0) {            // grid, sliding sideways
    p.x += drift;
    cell = fract(p);
  } else if (mode < 2.0) {     // half-drop, falling slowly
    p.y += drift + mod(floor(p.x), 2.0) * 0.5;
    cell = fract(p);
  } else if (mode < 3.0) {     // diamond lattice
    mat2 r = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    p = r * p;
    p.x += drift;
    gx = r * gx;
    gy = r * gy;
    cell = fract(p);
  } else if (mode < 4.0) {     // mirrored, kaleidoscopic
    p.y += drift;
    cell = fract(p);
    cell = mix(cell, 1.0 - cell, vec2(mod(floor(p.x), 2.0), mod(floor(p.y), 2.0)));
  } else if (mode < 5.0) {     // one ticker band across the middle
    p = vec2(q.x / s + drift * 2.0, (q.y - 1.6) / s + 0.5);
    if (p.y < 0.0 || p.y > 1.0) return 0.0;
    cell = vec2(fract(p.x), p.y);
  } else {                     // one giant crest, turning very slowly
    float a = sfTime * sfFlow * 0.04 * dir;
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    p = r * ((q - vec2(2.15, 1.65)) / 2.6) + 0.5;
    gx = r * dFdx(q) / 2.6;
    gy = r * dFdy(q) / 2.6;
    if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(1.0)))) return 0.0;
    cell = p;
  }
  return textureGrad(sfLogo, cell, gx, gy).a;
}

// a slow wave of light travelling through the whole maze (~2 m/s, every ~11 s)
float sfWave(vec3 w) {
  float a = 0.5 + 0.5 * sin(dot(w.xz, vec2(0.21, 0.13)) - sfTime * 0.55);
  float b = 0.5 + 0.5 * sin(w.y * 1.4 - sfTime * 0.9 + w.x * 0.05);
  return a * a * a * (0.75 + 0.25 * b);
}
`;

const FRAG_MAP = /* glsl */ `
// this wall's crop of the picture: shifted, sometimes mirrored, drifting slowly
vec2 sfImgUv = vSfUv;
sfImgUv.x = mix(sfImgUv.x, -sfImgUv.x, step(0.5, fract(vSfSeed * 7.13))) + fract(vSfSeed * 3.71);
sfImgUv.x += sfTime * sfFlow * 0.006 * (fract(vSfSeed * 9.13) > 0.5 ? 1.0 : -1.0);
#ifdef USE_MAP
  diffuseColor *= texture2D(map, sfImgUv);
#endif
// each wall leans a little towards the location's accent colour
diffuseColor.rgb *= mix(vec3(1.0), sfAccent, fract(vSfSeed * 4.13) * 0.5);
float sfA = sfMono(vSfUv, vSfSeed);
float sfW = sfWave(vSfWorld) * sfPulse;
diffuseColor.rgb *= 1.0 - sfA * sfInk * (1.0 - 0.6 * sfW) * (1.0 - sfOpMix);
// op-art walls: the honeycomb paints over the picture, the monogram in the lattice colour
diffuseColor.rgb = mix(diffuseColor.rgb, mix(sfOpCol, sfOpA, sfA), sfOpMix);
`;

const FRAG_EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= texture2D(emissiveMap, sfImgUv).rgb;
#endif
// faint at rest, glowing as the wave passes
totalEmissiveRadiance += sfGlow * sfA * sfGlowAmt * (0.08 + 0.9 * sfW) * (1.0 - sfOpMix * 0.6);
// op-art walls carry a little of their own light, so they read in the dark
totalEmissiveRadiance += sfOpCol * sfOpMix * (0.1 + 0.25 * sfW);
`;

export type WallpaperStyle = {
  /** colour the monograms glow in */
  glow: number;
  /** how strongly they glow (0 = never) */
  glowAmt: number;
  /** how much they darken the picture (0 = never) */
  ink: number;
  /** each wall's tint leans towards this */
  accent: number;
  /** share of walls with a pattern (the rest show only the picture) */
  cover: number;
  /** op-art pair: lattice colour, cell colour */
  op: [number, number];
};

/** Make a wall material hypnotic (call once, right after creating it). */
export function hypnotize(m: THREE.MeshStandardMaterial, style: WallpaperStyle) {
  logoTexture();
  const own = {
    sfGlow: { value: new THREE.Color(style.glow) },
    sfAccent: { value: new THREE.Color(style.accent) },
    sfGlowAmt: { value: style.glowAmt },
    sfInk: { value: style.ink },
    sfCover: { value: style.cover },
    sfOpA: { value: new THREE.Color(style.op[0]) },
    sfOpB: { value: new THREE.Color(style.op[1]) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <emissivemap_fragment>", FRAG_EMISSIVE);
  };
  // every hypnotic wall shares one program (per light/fog setup)
  m.customProgramCacheKey = () => "sf-wallpaper-2";
  return m;
}

const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Per frame. `still` = low quality: patterns stay, motion stops. */
export function tickWallpaper(t: number, still: boolean) {
  // wrapped every hour on the CPU so the GPU's float never loses precision
  shared.sfTime.value = t % 3600;
  const quiet = still || calm;
  shared.sfFlow.value = quiet ? 0 : 1;
  shared.sfPulse.value += ((quiet ? 0.35 : 1) - shared.sfPulse.value) * 0.05;
}
