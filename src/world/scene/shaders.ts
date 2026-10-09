// Hand-written shaders: all lighting is computed here from small uniform arrays (door lights,
// rooms, wells) instead of three.js lights, so the frame stays at a few draw calls with no
// shader recompiles. Fog is exponential-squared toward the sky colour.

export const MAX_LIGHTS = 10;
export const MAX_ROOMS = 16;
export const MAX_WELLS = 10; // 9 chunk wells + 1 portal (the hole that opens under you for radio jumps)

const noise = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

const lights = /* glsl */ `
uniform vec4 uLights[${MAX_LIGHTS}];   // xyz position, w intensity
uniform vec3 uLightCol[${MAX_LIGHTS}];
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform vec3 uCam;
uniform vec3 uPlayer;
vec3 doorLight(vec3 p, vec3 n){
  // your own soft glow (so the maze reads around you) + a cold moonlight from above
  vec3 dp = uPlayer + vec3(0.0,1.6,0.0) - p; float pl = dot(dp,dp);
  vec3 acc = vec3(0.55,0.6,0.85) * (2.2 / (1.0 + pl*0.05)) * (max(dot(n, normalize(dp)),0.0)*0.7+0.3);
  acc += vec3(0.16,0.17,0.26) * (0.6 + 0.4*n.y);
  for (int i=0;i<${MAX_LIGHTS};i++){
    vec3 d = uLights[i].xyz - p; float l2 = dot(d,d);
    float fall = uLights[i].w / (1.0 + l2*0.09);
    float lam = max(dot(n, normalize(d)), 0.0)*0.8 + 0.2;
    acc += uLightCol[i] * fall * lam;
  }
  return acc;
}
vec3 fogit(vec3 c, vec3 p){ float d = distance(p, uCam); float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d); return mix(c, uFogCol, clamp(f,0.0,1.0)); }
`;

export const wallVert = /* glsl */ `
attribute vec4 aInfo;   // x: writing cell (-1 none), y: room tint index (-1 none), z: neon top (0/1), w: seed
attribute vec3 aTint;
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying vec4 vInfo; varying vec3 vTint; varying float vH;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vUv = uv; vInfo = aInfo; vTint = aTint; vH = position.y + 0.5;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const wallFrag = /* glsl */ `
precision mediump float;
${noise}
${lights}
uniform sampler2D uWriting;
uniform float uTime;
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying vec4 vInfo; varying vec3 vTint; varying float vH;
void main(){
  vec2 wp = vec2(vP.x + vP.z, vP.y);
  float stone = vnoise(wp*1.7)*0.55 + vnoise(wp*5.3)*0.3 + vnoise(wp*17.0)*0.15;
  // block courses
  float course = smoothstep(0.02,0.05, abs(fract(vP.y*1.25)-0.5)*2.0 - 0.9) ;
  vec3 base = vTint * (0.55 + stone*0.6) * (0.85 + 0.15*course);
  float ao = mix(0.35, 1.0, smoothstep(0.0, 0.7, vH));
  vec3 col = base * (vec3(0.10,0.10,0.14) + doorLight(vP, vN)) * ao;
  // cryptic writing on some walls, glitching now and then
  if (vInfo.x >= 0.0 && abs(vN.y) < 0.5) {
    vec2 cell = vec2(mod(vInfo.x,4.0), floor(vInfo.x/4.0));
    vec2 uv = vec2(vUv.x, clamp((vUv.y-0.3)/0.45,0.0,1.0));
    float g = step(0.985, h21(vec2(floor(uTime*8.0), vInfo.w)));
    uv.x += g * (h21(vec2(floor(vP.y*20.0), uTime)) - 0.5) * 0.15;
    float ink = texture2D(uWriting, (cell + uv) / 4.0).r * step(0.3,vUv.y) * step(vUv.y,0.75);
    col += ink * mix(vec3(0.35,0.95,0.85), vec3(1.0,0.35,0.75), step(0.5, fract(vInfo.w*7.0))) * (0.55 + 0.45*sin(uTime*1.3+vInfo.w*9.0));
  }
  // thin neon line along the top edge of some walls
  if (vInfo.z > 0.5) col += smoothstep(0.93, 0.99, vH) * vec3(0.5,0.25,0.9) * 1.4;
  gl_FragColor = vec4(fogit(col, vP), 1.0);
}`;

export const floorVert = /* glsl */ `
varying vec3 vP;
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

export const floorFrag = /* glsl */ `
precision mediump float;
${noise}
${lights}
uniform vec4 uRooms[${MAX_ROOMS}];     // x0 z0 x1 z1
uniform vec3 uRoomCol[${MAX_ROOMS}];
uniform vec3 uWells[${MAX_WELLS}];     // x z r
uniform float uTime;
varying vec3 vP;
void main(){
  vec2 p = vP.xz;
  for (int i=0;i<${MAX_WELLS};i++){ vec2 d = p - uWells[i].xy; if (dot(d,d) < uWells[i].z*uWells[i].z) discard; }
  vec2 tile = fract(p/2.0); float grout = smoothstep(0.0,0.04,min(min(tile.x,1.0-tile.x),min(tile.y,1.0-tile.y)));
  float stone = vnoise(p*0.9)*0.6 + vnoise(p*4.1)*0.4;
  vec3 base = vec3(0.16,0.15,0.17) * (0.6 + 0.5*stone) * (0.55 + 0.45*grout);
  for (int i=0;i<${MAX_ROOMS};i++){
    vec4 r = uRooms[i];
    if (p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) { float rug = vnoise(p*6.0); base = uRoomCol[i]*(0.8+0.4*rug); }
  }
  // glowing rim around wells
  float rim = 0.0;
  for (int i=0;i<${MAX_WELLS};i++){ float d = length(p - uWells[i].xy) - uWells[i].z; if (uWells[i].z > 0.0) rim += exp(-d*1.6) * (0.6+0.4*sin(uTime*2.0 - d*3.0)); }
  vec3 col = base * (vec3(0.08,0.08,0.11) + doorLight(vP, vec3(0.0,1.0,0.0))) + rim*vec3(0.25,0.55,1.0);
  gl_FragColor = vec4(fogit(col, vP), 1.0);
}`;

/** the shaft under a well: rings of light rushing past while you fall */
export const shaftVert = /* glsl */ `
varying vec2 vUv; varying vec3 vP;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
export const shaftFrag = /* glsl */ `
precision mediump float;
uniform float uTime; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vP;
void main(){
  float y = vP.y;
  float rings = pow(0.5+0.5*sin(y*1.4 + uTime*14.0), 12.0);
  float streak = pow(0.5+0.5*sin(vUv.x*62.83 + y*0.3), 30.0)*0.4;
  float depth = smoothstep(-120.0, -10.0, y);
  vec3 col = uColor * (0.15 + rings*1.6 + streak) * (0.25 + depth*0.75);
  col *= smoothstep(0.5, -6.0, y) * 0.9 + 0.1;
  gl_FragColor = vec4(col, 1.0);
}`;

export const toyVert = /* glsl */ `
attribute vec3 aTint;
varying vec2 vUv; varying vec3 vTint; varying vec3 vP;
void main(){ vUv = uv; vTint = aTint; vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
export const toyFrag = /* glsl */ `
precision mediump float;
uniform float uTime; uniform float uKind; uniform vec3 uFogCol; uniform float uFogDensity; uniform vec3 uCam;
varying vec2 vUv; varying vec3 vTint; varying vec3 vP;
void main(){
  vec2 c = vUv - 0.5; float r = length(c);
  float a = 0.0;
  if (uKind < 0.5) { a = smoothstep(0.5,0.45,r) * (0.35 + 0.65*pow(0.5+0.5*sin(r*30.0 - uTime*6.0), 4.0)); }      // pad
  else if (uKind < 1.5) { a = smoothstep(0.5,0.46,r) * step(0.5, fract(c.x*10.0)) * (0.6+0.4*sin(uTime*9.0)); }       // vent
  else { float chev = fract(vUv.y*3.0 - uTime*2.5 + abs(c.x)*1.2); a = step(0.6, chev) * step(abs(c.x), 0.4); }        // speed strip
  if (a < 0.02) discard;
  float d = distance(vP, uCam); float f = exp(-uFogDensity*uFogDensity*d*d);
  gl_FragColor = vec4(vTint * a * 1.6 * f, 1.0);
}`;
