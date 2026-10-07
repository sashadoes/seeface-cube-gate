// Other wanderers in the labyrinth: each is a ghostly demonic creature (style
// picked from their id, see demons.ts) carrying a lantern.
// From far away you only see their light moving in a distant corridor, which is
// how you find each other. A light signal makes them flare for a moment.
import * as THREE from "three";
import type { Emote, Peer, Presence } from "./net";
import { DEMONS, demonOf, demonTexture } from "./demons";

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

type View = { group: THREE.Group; body: THREE.Sprite; glow: THREE.Sprite; label: THREE.Sprite; nick: string; held: THREE.Mesh; x: number; z: number; flare: number; lantern: number; bubble: THREE.Sprite | null; bubbleLife: number; emote: Emote | null; emoteT: number };

/** What someone said, floating above them (canvas text: no HTML). */
function bubbleSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 110;
  const g = c.getContext("2d")!;
  g.font = "italic 30px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = text.split(" ");
  const lines = [""];
  for (const w of words) {
    const tryLine = (lines[lines.length - 1] + " " + w).trim();
    if (g.measureText(tryLine).width > 480 && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = tryLine;
  }
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.roundRect(6, lines.length === 1 ? 28 : 8, 500, lines.length === 1 ? 54 : 94, 20);
  g.fill();
  g.fillStyle = "#fff6e2";
  lines.forEach((l, k) => g.fillText(l, 256, lines.length === 1 ? 55 : 34 + k * 40));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(2.4, 0.52, 1);
  s.position.y = 3.25;
  return s;
}

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
  say: (id: string, text: string) => void;
  /** settings: show nicknames / speech bubbles above people */
  setShow: (names: boolean, chat: boolean) => void;
  emote: (id: string, kind: Emote) => void;
  update: (dt: number, t: number, px: number, pz: number) => { nearest: number; count: number };
};

export function createOthers(presence: Presence): Others {
  const group = new THREE.Group();
  const glowTex = glowTexture();
  const views = new Map<string, View>();
  let showNames = true, showChat = true;

  function viewFor(p: Peer): View {
    let v = views.get(p.id);
    if (v) return v;
    const g = new THREE.Group();
    const kind = demonOf(p.id);
    const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: demonTexture(kind), transparent: true, depthWrite: false }));
    body.scale.set(0.9, 2.8, 1);
    body.center.set(0.5, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: DEMONS[kind].aura, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0.25, 1.25, 0);
    glow.scale.set(0.9, 0.9, 1);
    const label = nameSprite(p.nick);
    // the relic they carry, glowing in their hand
    const held = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    held.position.set(-0.3, 1.15, 0.15);
    held.visible = false;
    g.add(body, glow, label, held);
    group.add(g);
    v = { group: g, body, glow, label, nick: p.nick, held, x: p.x, z: p.z, flare: 0, lantern: 1, bubble: null, bubbleLife: 0, emote: null, emoteT: 0 };
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
      v.held.visible = p.held > 0;
      if (p.held > 0) {
        (v.held.material as THREE.MeshBasicMaterial).color.setHex(p.held);
        v.held.rotation.set(t * 1.2, t * 1.7, 0);
      }
      if (p.nick !== v.nick) {
        v.group.remove(v.label);
        v.label = nameSprite(p.nick);
        v.group.add(v.label);
        v.nick = p.nick;
      }
      // names only readable up close, like in fog
      const d = Math.hypot(v.x - px, v.z - pz);
      (v.label.material as THREE.SpriteMaterial).opacity = showNames ? Math.max(0, Math.min(1, (14 - d) / 6)) : 0;
      v.glow.scale.setScalar(0.9 + v.flare * 2.4);
      // speech
      if (v.bubble) {
        v.bubbleLife -= dt;
        (v.bubble.material as THREE.SpriteMaterial).opacity = showChat ? Math.max(0, Math.min(1, v.bubbleLife)) * Math.max(0, Math.min(1, (24 - d) / 8)) : 0;
        if (v.bubbleLife <= 0) {
          v.group.remove(v.bubble);
          v.bubble = null;
        }
      }
      // weird interactions
      let sx = 0.9, sy = 2.8, rot = 0, lift = 0;
      if (v.emote) {
        v.emoteT += dt;
        const k = v.emoteT, e = Math.sin(Math.min(1, k / 3) * Math.PI); // 0 → 1 → 0 over 3 s
        if (v.emote === "stare") (sx *= 1 + e * 0.4), (sy *= 1 + e * 0.4), (v.flare = Math.max(v.flare, e * 0.6));
        if (v.emote === "spin") rot = k * 9;
        if (v.emote === "melt") (sy *= 1 - e * 0.85), (sx *= 1 + e * 0.6);
        if (v.emote === "float") lift = e * 1.6;
        if (v.emote === "scream") (sx *= 1 + Math.sin(k * 60) * 0.08 * e), (v.flare = Math.max(v.flare, e));
        if (k > 3) v.emote = null;
      }
      v.body.scale.set(sx, sy, 1);
      (v.body.material as THREE.SpriteMaterial).rotation = rot;
      v.body.position.y = lift;
      // ghostly: fades in and out, and now and then flickers almost away
      const flick = Math.sin(t * 13 + v.x * 3) > 0.97 ? 0.35 : 1;
      (v.body.material as THREE.SpriteMaterial).opacity = (0.62 + Math.sin(t * 2.2 + v.z) * 0.14) * flick;
      v.body.position.x = Math.sin(t * 1.3 + v.z) * 0.06;
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

  return {
    group,
    update,
    setShow(names, chat) {
      showNames = names;
      showChat = chat;
    },
    say(id, text) {
      const v = views.get(id);
      if (!v) return;
      if (v.bubble) v.group.remove(v.bubble);
      v.bubble = bubbleSprite(text);
      v.bubbleLife = 7;
      v.group.add(v.bubble);
    },
    emote(id, kind) {
      const v = views.get(id);
      if (!v) return;
      v.emote = kind;
      v.emoteT = 0;
    },
  };
}
