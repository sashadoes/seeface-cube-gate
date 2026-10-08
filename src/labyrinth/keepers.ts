// Keepers: characters with personalities who live in the labyrinth and keep a
// lonely player company. They are openly part of the game: masked, with a gold
// ✶ name ("✶ the cartographer"), they never use player-style nicknames, never
// appear on the map or in the online count, and they leave when a real person
// comes near (real people come first).
//   cartographer – gives directions to rifts and safe rooms
//   collector    – wants your relic; trades it for 3 ◈
//   jester       – dares you to jump; +1 ◈ if you do
//   mourner      – shares her light when yours is weak
import * as THREE from "three";
import { CELL, free, placeAt, roomCentre } from "./maze";
import { release } from "./gpu";

export type KeeperKind = "cartographer" | "collector" | "jester" | "mourner";

type Ctx = {
  px: number;
  pz: number;
  yaw: number;
  light: number;
  nick: string;
  place: string;
  holding: boolean;
  jumped: boolean;
  /** a real player within this many metres (Infinity if none) */
  realNearest: number;
  rift: { x: number; z: number } | null;
};

export type KeeperAction = { light?: number; takeRelic?: boolean; earn?: number; why?: string };

const KEEPERS: Record<KeeperKind, { name: string; robe: string; mask: string; halo: string; light: number }> = {
  cartographer: { name: "the cartographer", robe: "40,52,70", mask: "#e8e4da", halo: "#9cd8ff", light: 0x9cd8ff },
  collector: { name: "the collector", robe: "70,45,20", mask: "#f2e2b8", halo: "#ffc04a", light: 0xffc04a },
  jester: { name: "the jester", robe: "90,20,60", mask: "#ffffff", halo: "#ff5ad8", light: 0xff5ad8 },
  mourner: { name: "the mourner", robe: "25,25,30", mask: "#d8dce6", halo: "#e8f0ff", light: 0xe8f0ff },
};
const ORDER: KeeperKind[] = ["cartographer", "jester", "collector", "mourner"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function dirWord(ctx: Ctx, x: number, z: number) {
  // angle of the target relative to where you look (camera looks along -z at yaw 0)
  const a = Math.atan2(-(x - ctx.px), -(z - ctx.pz)) - ctx.yaw;
  const r = Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(r) < Math.PI / 4) return "ahead of you";
  if (Math.abs(r) > (3 * Math.PI) / 4) return "behind you";
  return r > 0 ? "to your left" : "to your right";
}

function nearestRoom(px: number, pz: number) {
  const I0 = Math.floor(px / CELL / 7), J0 = Math.floor(pz / CELL / 7);
  let best = roomCentre(I0, J0), bd = Infinity;
  for (let I = I0 - 1; I <= I0 + 1; I++)
    for (let J = J0 - 1; J <= J0 + 1; J++) {
      if (placeAt(I, J)) continue; // places are not safe rooms
      const c = roomCentre(I, J);
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd) (bd = d), (best = c);
    }
  return best;
}

function line(kind: KeeperKind, ctx: Ctx, first: boolean): string {
  const n = ctx.nick;
  switch (kind) {
    case "cartographer": {
      if (first) return pick([`ah, ${n}. lost already?`, `${n}. I've drawn every corridor but this one.`]);
      const opts = [`you're in ${ctx.place}. people get lost here on purpose.`, "every hundred metres pays one ◈. walk.", "the walls move when nobody looks. not much. enough."];
      const room = nearestRoom(ctx.px, ctx.pz);
      const rd = Math.round(Math.hypot(room.x - ctx.px, room.z - ctx.pz));
      if (rd > 6) opts.push(`a safe room, ${rd} metres ${dirWord(ctx, room.x, room.z)}.`);
      if (ctx.rift) {
        const d = Math.round(Math.hypot(ctx.rift.x - ctx.px, ctx.rift.z - ctx.pz));
        opts.push(`a rift breathes ${d} metres ${dirWord(ctx, ctx.rift.x, ctx.rift.z)}. the floor there is thin.`);
        opts.push(`${d} metres ${dirWord(ctx, ctx.rift.x, ctx.rift.z)} there's a way down. most don't come back the same.`);
      } else opts.push("no rifts near the entrance. go further.");
      return pick(opts);
    }
    case "collector":
      if (first) return ctx.holding ? `${n}… that thing in your hand. give it to me.` : `${n}… do you carry anything shiny?`;
      return ctx.holding
        ? pick(["come closer. give it.", "I'll pay. three ◈. closer."])
        : pick(["relics glow in corners. bring me one.", "I keep everything people drop. everything.", "a red one. I'm missing a red one."]);
    case "jester":
      if (first) return pick([`boo. no? tough crowd, ${n}.`, `${n}! finally someone to bother.`]);
      return pick(["jump. go on. jump.", "jump for me and I'll pay.", "the Hollow likes the dark. so do I.", "take a snapshot of my good side. both are good.", "it's lonely here. bring a friend. your snapshot is a door."]);
    case "mourner":
      if (first) return ctx.light < 60 ? `your light is so weak, ${n}. take some of mine.` : `${n}. you shouldn't be alone down here.`;
      return pick(["I lost someone here. maybe you'll find them.", "the walls remember every photo they were.", `don't stay long in ${ctx.place}.`, "send your snapshot to someone. nobody should walk this alone."]);
  }
}

function keeperTexture(kind: KeeperKind) {
  const k = KEEPERS[kind];
  const W = 128, H = 400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // halo
  g.strokeStyle = k.halo;
  g.shadowColor = k.halo;
  g.shadowBlur = 16;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(W / 2, 52, 30, 30, 0, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  // robe with a hood
  g.filter = "blur(1px)";
  const grad = g.createLinearGradient(0, 40, 0, H);
  grad.addColorStop(0, `rgba(${k.robe},0.95)`);
  grad.addColorStop(0.75, `rgba(${k.robe},0.7)`);
  grad.addColorStop(1, `rgba(${k.robe},0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(W / 2, 22);
  g.quadraticCurveTo(W / 2 + 34, 40, W / 2 + 30, 100);
  g.quadraticCurveTo(W / 2 + 46, 250, W / 2 + 34, H);
  g.lineTo(W / 2 - 34, H);
  g.quadraticCurveTo(W / 2 - 46, 250, W / 2 - 30, 100);
  g.quadraticCurveTo(W / 2 - 34, 40, W / 2, 22);
  g.fill();
  g.filter = "none";
  // porcelain mask
  g.fillStyle = k.mask;
  g.beginPath();
  g.ellipse(W / 2, 62, 15, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(W / 2 - 6, 58, 3.5, 2, 0, 0, Math.PI * 2);
  g.ellipse(W / 2 + 6, 58, 3.5, 2, 0, 0, Math.PI * 2);
  g.fill();
  if (kind === "jester") {
    g.strokeStyle = "#000";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(W / 2, 68, 7, 0.2, Math.PI - 0.2);
    g.stroke();
  } else if (kind === "mourner") {
    // a painted tear
    g.fillStyle = "#6a8cff";
    g.beginPath();
    g.ellipse(W / 2 + 7, 66, 1.5, 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(text: string, colour: string, font: string, w = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  // wrap into up to two lines
  const words = text.split(" ");
  const lines: string[] = [""];
  for (const word of words) {
    const tryLine = (lines[lines.length - 1] + " " + word).trim();
    if (g.measureText(tryLine).width > w - 30 && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = tryLine;
  }
  g.shadowColor = "rgba(0,0,0,0.95)";
  g.shadowBlur = 8;
  g.fillStyle = colour;
  lines.forEach((l, k) => g.fillText(l, w / 2, lines.length === 1 ? 48 : 30 + k * 36));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set((w / 96) * 0.5, 0.5, 1);
  return s;
}

export type Keepers = {
  group: THREE.Group;
  update: (dt: number, t: number, ctx: Ctx) => KeeperAction | null;
  /** name of the keeper with you right now (for snapshots), or null */
  present: () => string | null;
  /** make a keeper come now (used for recording trailers) */
  summon: (kind: KeeperKind) => void;
};

export function createKeepers(): Keepers {
  const group = new THREE.Group();
  const body = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
  body.scale.set(0.95, 2.95, 1);
  body.center.set(0.5, 0);
  const light = new THREE.PointLight(0xffffff, 0, 6, 1.6);
  light.position.y = 2.2;
  const holder = new THREE.Group();
  holder.add(body, light);
  holder.visible = false;
  group.add(holder);
  const textures = new Map<KeeperKind, THREE.CanvasTexture>();

  let kind: KeeperKind | null = null;
  let label: THREE.Sprite | null = null;
  let bubble: THREE.Sprite | null = null;
  let fade = 0;
  let leaving = false;
  let stay = 0; // seconds left
  let nextAt = 25; // seconds until the next keeper may come
  let clock = 0;
  let talkIn = 0;
  let spoken = 0;
  let bubbleLife = 0;
  let gaveLight = false, tradeDone = false, dareAt = -1, dared = false;
  let order = Math.floor(Math.random() * ORDER.length);

  function say(text: string) {
    release(bubble);
    bubble = textSprite(text, "#fff6e2", "italic 30px 'Times New Roman', serif");
    bubble.position.y = 3.25;
    holder.add(bubble);
    bubbleLife = 5.5;
  }

  function arrive(ctx: Ctx) {
    // a free spot 8–12 m away, roughly in front of you
    for (let k = 0; k < 24; k++) {
      const a = ctx.yaw + (Math.random() - 0.5) * 2.4; // around where you look
      const d = 8 + Math.random() * 4;
      const x = ctx.px - Math.sin(a) * d, z = ctx.pz - Math.cos(a) * d;
      if (!free(x, z)) continue;
      kind = ORDER[order++ % ORDER.length];
      const tex = textures.get(kind) ?? keeperTexture(kind);
      textures.set(kind, tex);
      (body.material as THREE.SpriteMaterial).map = tex;
      (body.material as THREE.SpriteMaterial).needsUpdate = true;
      light.color.setHex(KEEPERS[kind].light);
      release(label);
      label = textSprite(`✶ ${KEEPERS[kind].name}`, KEEPERS[kind].halo, "italic 30px 'Times New Roman', serif", 384);
      label.position.y = 2.85;
      holder.add(label);
      holder.position.set(x, 0, z);
      holder.visible = true;
      fade = 0;
      leaving = false;
      stay = 75;
      spoken = 0;
      talkIn = 0;
      gaveLight = tradeDone = dared = false;
      dareAt = -1;
      return;
    }
  }

  function leave(text?: string) {
    if (leaving) return;
    if (text) say(text);
    leaving = true;
  }

  function update(dt: number, t: number, ctx: Ctx): KeeperAction | null {
    clock += dt;
    let act: KeeperAction | null = null;

    if (!kind) {
      nextAt -= dt;
      // only when nobody real is around
      if (nextAt <= 0 && ctx.realNearest > 25) arrive(ctx);
      return null;
    }

    const d = Math.hypot(holder.position.x - ctx.px, holder.position.z - ctx.pz);
    stay -= dt;
    if (stay <= 0) leave(pick(["I have to go. the walls are calling.", "until the next corridor.", `goodbye, ${ctx.nick}.`]));
    // real people come first
    if (ctx.realNearest < 15) leave("someone real is near you. go to them.");

    // drift towards a point beside you (keepers pass through walls; they're not from here)
    if (!leaving) {
      const side = ctx.yaw + Math.PI / 2;
      const gx = ctx.px - Math.sin(ctx.yaw) * 3.6 + Math.sin(side) * 1.4;
      const gz = ctx.pz - Math.cos(ctx.yaw) * 3.6 + Math.cos(side) * 1.4;
      const k = d > 5 ? 1.2 : 0.6;
      holder.position.x += (gx - holder.position.x) * Math.min(1, dt * k);
      holder.position.z += (gz - holder.position.z) * Math.min(1, dt * k);
    }
    holder.position.y = Math.sin(t * 1.4) * 0.05 + (kind === "jester" && dareAt > 0 && clock - dareAt < 0.6 ? 0.5 : 0);

    fade += ((leaving ? 0 : 1) - fade) * Math.min(1, dt * (leaving ? 0.9 : 1.5));
    (body.material as THREE.SpriteMaterial).opacity = fade * 0.92;
    if (label) (label.material as THREE.SpriteMaterial).opacity = fade * Math.max(0, Math.min(1, (16 - d) / 6));
    light.intensity = fade * 2.2;

    // talking
    bubbleLife -= dt;
    if (bubble) (bubble.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, bubbleLife)) * fade;
    if (!leaving && d < 7) {
      talkIn -= dt;
      if (talkIn <= 0) {
        say(line(kind, ctx, spoken === 0));
        if (kind === "jester" && spoken > 0 && !dared && Math.random() < 0.6) {
          say("jump. right now. go on.");
          dareAt = clock;
        }
        spoken += 1;
        talkIn = 6 + Math.random() * 3;
      }
    }

    // personalities do things
    if (!leaving && d < 7) {
      if (kind === "mourner" && !gaveLight && ctx.light < 60 && spoken > 0) {
        gaveLight = true;
        act = { light: 45, why: "keeper-light" };
        say("there. a little of mine.");
      }
      if (kind === "collector" && !tradeDone && ctx.holding && d < 2.4) {
        tradeDone = true;
        act = { takeRelic: true, earn: 3, why: "keeper-trade" };
        say("mine now. three ◈ for your trouble.");
        talkIn = 7;
      }
      if (kind === "jester" && !dared && dareAt > 0 && ctx.jumped && clock - dareAt < 8) {
        dared = true;
        dareAt = clock; // hops with you
        act = { earn: 1, why: "keeper-dare" };
        say("ha! again! no, that's enough. one ◈.");
        talkIn = 7;
      }
    }

    if (leaving && fade < 0.02) {
      holder.visible = false;
      kind = null;
      release(bubble);
      bubble = null;
      nextAt = 70 + Math.random() * 70;
    }
    return act;
  }

  return {
    group,
    update,
    present: () => (kind && !leaving ? KEEPERS[kind].name : null),
    summon(k) {
      order = ORDER.indexOf(k);
      nextAt = 0;
    },
  };
}
