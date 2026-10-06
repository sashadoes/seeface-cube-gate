// The Pop Queen: an original villain of the labyrinth (not any real person).
// Platinum spiky pixie cut, a cracked porcelain face, a blood-red smile, gold
// dripping-star earrings, a violet-blue sequinned gown that melts into shadow,
// and a spinning halo of stage lights behind her.
// She comes during "the Pop Queen's show" (a world event, same moment for
// everyone): she glides after you singing; if she reaches you she takes a bow
// and steals ◈. Hide in a room (she never enters), or take her photo: a
// snapshot up close makes her shriek "no photos!" and drop ◈.
import * as THREE from "three";
import { CELL, free, roomOf } from "./maze";

const W = 256, H = 720;

function queenTexture() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const cx = W / 2;

  // gown: violet-blue sequins, melting into shadow
  const gown = g.createLinearGradient(0, 200, 0, H);
  gown.addColorStop(0, "rgba(60,50,190,1)");
  gown.addColorStop(0.5, "rgba(40,30,140,0.9)");
  gown.addColorStop(1, "rgba(10,5,40,0)");
  g.fillStyle = gown;
  g.beginPath();
  g.moveTo(cx - 34, 205);
  g.quadraticCurveTo(cx - 70, 420, cx - 88, H);
  for (let x = -88; x <= 88; x += 11) g.lineTo(cx + x, H - (x % 22 === 0 ? 60 : 10)); // melting drips
  g.quadraticCurveTo(cx + 70, 420, cx + 34, 205);
  g.closePath();
  g.fill();
  // sequins
  for (let k = 0; k < 420; k++) {
    const y = 210 + Math.random() * 380;
    const spread = 30 + ((y - 210) / 380) * 60;
    g.fillStyle = `rgba(${150 + Math.random() * 105},${150 + Math.random() * 105},255,${0.3 + Math.random() * 0.6})`;
    g.fillRect(cx + (Math.random() - 0.5) * spread * 2, y, 2.5, 2.5);
  }
  // halter straps + shoulders
  g.fillStyle = "#f1e6dc";
  g.beginPath();
  g.ellipse(cx, 200, 46, 18, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = "rgba(60,50,190,1)";
  g.beginPath();
  g.moveTo(cx - 20, 205);
  g.lineTo(cx - 6, 150);
  g.lineTo(cx + 6, 150);
  g.lineTo(cx + 20, 205);
  g.fill();
  // neck
  g.fillStyle = "#efe2d6";
  g.fillRect(cx - 12, 130, 24, 30);

  // porcelain face
  g.fillStyle = "#f6ece4";
  g.beginPath();
  g.ellipse(cx, 100, 38, 48, 0, 0, Math.PI * 2);
  g.fill();
  // a crack running down from the hairline
  g.strokeStyle = "rgba(70,40,40,0.75)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx + 14, 54);
  g.lineTo(cx + 9, 74);
  g.lineTo(cx + 17, 88);
  g.lineTo(cx + 11, 106);
  g.lineTo(cx + 19, 124);
  g.stroke();
  // eyes: heavy winged liner, too-bright irises
  for (const s of [-1, 1]) {
    g.fillStyle = "#1a1420";
    g.beginPath();
    g.moveTo(cx + s * 6, 92);
    g.quadraticCurveTo(cx + s * 16, 84, cx + s * 30, 86);
    g.lineTo(cx + s * 34, 80); // the wing
    g.quadraticCurveTo(cx + s * 22, 96, cx + s * 6, 95);
    g.fill();
    g.fillStyle = "#9fe8ff";
    g.shadowColor = "#9fe8ff";
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(cx + s * 17, 91, 3.6, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  // the smile: blood red, a little too wide
  g.fillStyle = "#d4101c";
  g.beginPath();
  g.moveTo(cx - 20, 118);
  g.quadraticCurveTo(cx, 112, cx + 20, 118);
  g.quadraticCurveTo(cx, 136, cx - 20, 118);
  g.fill();
  g.fillStyle = "#fff";
  g.fillRect(cx - 12, 119, 24, 3);

  // platinum spiky pixie cut
  g.fillStyle = "#efe4c4";
  g.beginPath();
  g.ellipse(cx, 66, 42, 26, 0, Math.PI, 0);
  g.fill();
  for (let k = 0; k < 22; k++) {
    const a = Math.PI + (k / 21) * Math.PI;
    const bx = cx + Math.cos(a) * 38, by = 70 + Math.sin(a) * 24;
    // short, messy spikes; swept to one side, never two tall "ears" on top
    const len = 7 + Math.abs(Math.cos(a)) * 9 + Math.random() * 5;
    g.beginPath();
    g.moveTo(bx - 7, by + 5);
    g.lineTo(bx + Math.cos(a) * len + 7, by + Math.sin(a) * len - 2);
    g.lineTo(bx + 7, by + 5);
    g.fill();
  }

  // gold dripping-star earrings
  g.fillStyle = "#e8b84a";
  g.shadowColor = "#ffd27a";
  g.shadowBlur = 12;
  for (const s of [-1, 1]) {
    const ex = cx + s * 40, ey = 116;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 4 : 10, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
    }
    g.fill();
    g.fillRect(ex - 1.5, ey + 8, 3, 22);
    g.beginPath();
    g.ellipse(ex, ey + 32, 3, 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the spinning halo of stage lights behind her */
function haloTexture() {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.translate(s / 2, s / 2);
  for (let k = 0; k < 28; k++) {
    g.rotate((Math.PI * 2) / 28);
    const grad = g.createLinearGradient(60, 0, 250, 0);
    grad.addColorStop(0, "rgba(160,220,255,0)");
    grad.addColorStop(0.3, "rgba(170,225,255,0.9)");
    grad.addColorStop(1, "rgba(120,160,255,0)");
    g.fillStyle = grad;
    g.fillRect(60, -6, 190, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function lineSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.font = "italic 34px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.95)";
  g.shadowBlur = 8;
  g.fillStyle = "#ffd0e8";
  g.fillText(text, 256, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(2.6, 0.4, 1);
  sp.position.y = 3.55;
  return sp;
}

const LINES = ["darling, you're late", "smile for me", "everyone is watching", "one more song", "you'll love the encore", "don't you dare leave"];

export type QueenAction = { steal?: number; flashed?: number; line?: string; vanished?: boolean };

export function createPopQueen() {
  const group = new THREE.Group();
  const holder = new THREE.Group();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.scale.set(4.2, 4.2, 1);
  halo.position.y = 2.1;
  const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: queenTexture(), transparent: true, depthWrite: false, opacity: 0 }));
  body.scale.set(1.2, 3.4, 1);
  body.center.set(0.5, 0);
  const spot = new THREE.PointLight(0xc8b0ff, 0, 9, 1.4);
  spot.position.y = 3;
  holder.add(halo, body, spot);
  holder.visible = false;
  group.add(holder);

  let on = false, fade = 0, gone = false, talk = 2, bubble: THREE.Sprite | null = null, bubbleT = 0, cooldown = 0;

  function say(text: string) {
    if (bubble) holder.remove(bubble);
    bubble = lineSprite(text);
    holder.add(bubble);
    bubbleT = 3.5;
  }

  function appear(px: number, pz: number, yaw: number) {
    // somewhere ahead-ish, 10–14 m away, in a corridor
    for (let k = 0; k < 30; k++) {
      const a = yaw + (Math.random() - 0.5) * 2.2, d = 10 + Math.random() * 4;
      const x = px - Math.sin(a) * d, z = pz - Math.cos(a) * d;
      if (free(x, z)) {
        holder.position.set(x, 0, z);
        holder.visible = true;
        gone = false;
        fade = 0;
        say("it's showtime, darling");
        return;
      }
    }
  }

  function vanish() {
    gone = true;
    cooldown = 8; // back for an encore later in the show
  }

  return {
    group,
    /** active = the show is on */
    update(dt: number, t: number, ctx: { px: number; pz: number; yaw: number; active: boolean }): QueenAction | null {
      let act: QueenAction | null = null;
      if (ctx.active && !on) {
        on = true;
        appear(ctx.px, ctx.pz, ctx.yaw);
      }
      if (!ctx.active && on) {
        on = false;
        vanish();
      }
      if (on && gone) {
        cooldown -= dt;
        if (cooldown <= 0) appear(ctx.px, ctx.pz, ctx.yaw);
      }

      fade += ((on && !gone ? 1 : 0) - fade) * Math.min(1, dt * (gone ? 3 : 1.2));
      (body.material as THREE.SpriteMaterial).opacity = fade;
      (halo.material as THREE.SpriteMaterial).opacity = fade * 0.55;
      (halo.material as THREE.SpriteMaterial).rotation = t * 0.6;
      spot.intensity = fade * 6;
      if (fade < 0.01 && (gone || !on)) holder.visible = false;
      if (!holder.visible) return null;

      // she glides towards you, swaying; she won't enter rooms (pass through walls: she's the show)
      const dx = ctx.px - holder.position.x, dz = ctx.pz - holder.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const inRoom = roomOf(Math.floor(ctx.px / CELL), Math.floor(ctx.pz / CELL)) !== null;
      if (!gone && !inRoom) {
        const speed = 2.6 + Math.sin(t * 0.7) * 0.8;
        holder.position.x += (dx / d) * speed * dt;
        holder.position.z += (dz / d) * speed * dt;
      }
      holder.position.y = Math.sin(t * 2.2) * 0.08;
      body.position.x = Math.sin(t * 1.6) * 0.1;

      // she talks
      bubbleT -= dt;
      if (bubble) (bubble.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, bubbleT)) * fade;
      talk -= dt;
      if (!gone && talk <= 0 && d < 16) {
        talk = 4 + Math.random() * 3;
        const l = inRoom ? "hiding? how rude." : LINES[Math.floor(Math.random() * LINES.length)];
        say(l);
        act = { line: l };
      }

      // she reached you: a bow, and your ◈ is hers
      if (!gone && !inRoom && d < 1.4) {
        say("thank you, darling");
        vanish();
        act = { steal: 3 };
      }
      return act;
    },
    /** a snapshot was taken: up close and in front of you, she can't stand it */
    flash(px: number, pz: number, yaw: number): QueenAction | null {
      if (!holder.visible || gone) return null;
      const dx = holder.position.x - px, dz = holder.position.z - pz;
      const d = Math.hypot(dx, dz);
      const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (d || 1);
      if (d > 9 || facing < 0.6) return null;
      say("NO PHOTOS!");
      vanish();
      return { flashed: 5 };
    },
    position: () => holder.position,
    near: (px: number, pz: number) => (holder.visible && !gone ? Math.hypot(holder.position.x - px, holder.position.z - pz) : Infinity),
  };
}
