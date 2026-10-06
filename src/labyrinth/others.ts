// Other wanderers in the labyrinth: each is a soft figure carrying a lantern.
// From far away you only see their light moving in a distant corridor, which is
// how you find each other. A light signal makes them flare for a moment.
import * as THREE from "three";
import type { Peer, Presence } from "./net";

function wandererTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 300;
  const g = c.getContext("2d")!;
  g.filter = "blur(3px)";
  const grad = g.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, "rgba(255,244,222,0.9)");
  grad.addColorStop(0.7, "rgba(200,190,175,0.55)");
  grad.addColorStop(1, "rgba(200,190,175,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(48, 32, 16, 19, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(30, 58);
  g.quadraticCurveTo(14, 160, 26, 300);
  g.lineTo(70, 300);
  g.quadraticCurveTo(82, 160, 66, 58);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,240,205,1)");
  r.addColorStop(0.35, "rgba(255,225,170,0.45)");
  r.addColorStop(1, "rgba(255,220,160,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type View = { group: THREE.Group; body: THREE.Sprite; glow: THREE.Sprite; label: THREE.Sprite; nick: string; x: number; z: number; flare: number; lantern: number };

/** Nickname floating above a wanderer (canvas text sprite). */
function nameSprite(nick: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "italic 30px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)";
  g.shadowBlur = 8;
  g.fillStyle = "rgba(255,244,222,0.95)";
  g.fillText(nick, 128, 32); // canvas text: no HTML, safe for user names
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(1.6, 0.4, 1);
  s.position.y = 2.75;
  return s;
}

export type Others = {
  group: THREE.Group;
  update: (dt: number, t: number, px: number, pz: number) => { nearest: number; count: number };
};

export function createOthers(presence: Presence): Others {
  const group = new THREE.Group();
  const bodyTex = wandererTexture();
  const glowTex = glowTexture();
  const views = new Map<string, View>();

  function viewFor(p: Peer): View {
    let v = views.get(p.id);
    if (v) return v;
    const g = new THREE.Group();
    const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: bodyTex, transparent: true, depthWrite: false }));
    body.scale.set(0.8, 2.5, 1);
    body.center.set(0.5, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0.25, 1.25, 0);
    glow.scale.set(0.9, 0.9, 1);
    const label = nameSprite(p.nick);
    g.add(body, glow, label);
    group.add(g);
    v = { group: g, body, glow, label, nick: p.nick, x: p.x, z: p.z, flare: 0, lantern: 1 };
    views.set(p.id, v);
    return v;
  }

  // a fixed pool of real lights goes to the nearest wanderers (a changing light
  // count would make three.js recompile shaders and stutter)
  const pool = Array.from({ length: 4 }, () => {
    const l = new THREE.PointLight(0xffe6b8, 0, 9, 1.5);
    group.add(l);
    return l;
  });

  presence.onSignal((p) => {
    const v = views.get(p.id);
    if (v) v.flare = 1;
  });

  function update(dt: number, t: number, px: number, pz: number) {
    let nearest = Infinity;
    for (const [id, v] of views) {
      if (!presence.peers.has(id)) {
        group.remove(v.group);
        views.delete(id);
      }
    }
    for (const p of presence.peers.values()) {
      const v = viewFor(p);
      // smooth between network updates
      v.x += (p.x - v.x) * Math.min(1, dt * 8);
      v.z += (p.z - v.z) * Math.min(1, dt * 8);
      v.group.position.set(v.x, Math.sin(t * 2 + v.x) * 0.03, v.z);
      v.flare = Math.max(0, v.flare - dt * 0.8);
      v.lantern = 0.35 + (p.light / 100) * 0.65;
      if (p.nick !== v.nick) {
        v.group.remove(v.label);
        v.label = nameSprite(p.nick);
        v.group.add(v.label);
        v.nick = p.nick;
      }
      // names only readable up close, like in fog
      const d = Math.hypot(v.x - px, v.z - pz);
      (v.label.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (14 - d) / 6));
      v.glow.scale.setScalar(0.9 + v.flare * 2.4);
      (v.body.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 6 + v.z) * 0.08;
      nearest = Math.min(nearest, Math.hypot(v.x - px, v.z - pz));
    }
    // real lanterns for the nearest four
    const near = [...views.values()].sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    pool.forEach((l, k) => {
      const v = near[k];
      if (!v) return (l.intensity = 0);
      l.position.set(v.x + 0.25, 1.3, v.z);
      l.intensity = 3 * v.lantern + v.flare * 14;
      l.distance = 7 + v.flare * 12;
    });
    return { nearest, count: presence.peers.size };
  }

  return { group, update };
}
