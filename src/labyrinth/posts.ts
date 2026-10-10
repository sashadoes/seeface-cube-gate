// Posts: like Instagram, but in the labyrinth. You hang a photo (or a drawing)
// with a caption on the wall in front of you; everyone walking past sees it,
// can open it and ♥ it.
// Moderation: a post is visible to its author at once, and to everyone else
// only after the owner approves it on /the-eye. Approvals are signed with the
// moderator's key (ECDSA, kept only in the owner's browser); every client
// checks the signature with the public key below, so approvals can't be faked
// even on the public relay.
import * as THREE from "three";
import { CELL, wallEast, wallSouth } from "./maze";
import type { Presence } from "./net";
import { cleanNick } from "./nick";
import { filterMark } from "../marks/filter";
import { playerId } from "./champions";

/** The moderator's PUBLIC key (JWK). Set it after creating the key on /the-eye. */
export const MOD_PUBLIC_KEY: JsonWebKey | null = null;

/** the artist accepted /artists (own work + free permission to show it) */
export type Post = { id: string; img: string; cap: string; nick: string; by: string; x: number; z: number; ry: number; t: number; agreed?: number };

export async function verifyApproval(post: Post, sig: string) {
  return verifySigned(approvalText(post), sig);
}

/** was this text signed by the moderator? */
export async function verifySigned(text: string, sig: string) {
  if (!MOD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", MOD_PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const raw = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, new TextEncoder().encode(text));
  } catch {
    return false;
  }
}

/** a short digest of a picture (what the moderator's signature covers) */
export function imgDigest(img: string) {
  let h = 0;
  for (let k = 0; k < img.length; k += 7) h = (Math.imul(h, 31) + img.charCodeAt(k)) | 0;
  return h;
}

/** what the moderator signs: the post id + a digest of its picture and words */
export function approvalText(p: Post) {
  return `${p.id}|${imgDigest(p.img)}|${p.cap}`;
}

/** a picture file → a small JPEG (max 320 px) as a data URL */
export async function shrink(source: Blob | HTMLCanvasElement, max = 320) {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

/** where a post would hang: the maze wall straight ahead (within 4 m), never on furniture */
export function wallAhead(px: number, pz: number, yaw: number) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
  for (let d = 0.2; d < 4; d += 0.05) {
    const x = px + fx * d, z = pz + fz * d;
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (i === ci && j === cj) continue;
    // crossing into the next cell: is there a wall on that edge?
    let hit: { x: number; z: number; ry: number } | null = null;
    if (i !== ci) {
      const wall = i > ci ? wallEast(ci, cj) : wallEast(i, cj);
      const ex = (i > ci ? ci + 1 : ci) * CELL;
      if (wall) hit = { x: ex - Math.sign(fx) * 0.18, z, ry: fx > 0 ? -Math.PI / 2 : Math.PI / 2 };
    } else if (j !== cj) {
      const wall = j > cj ? wallSouth(ci, cj) : wallSouth(ci, j);
      const ez = (j > cj ? cj + 1 : cj) * CELL;
      if (wall) hit = { x, z: ez - Math.sign(fz) * 0.18, ry: fz > 0 ? Math.PI : 0 };
    }
    if (hit) return hit;
    ci = i;
    cj = j;
  }
  return null;
}

function frameTexture(post: Post, likes: number) {
  return new Promise<THREE.CanvasTexture>((res) => {
    const img = new Image();
    img.onload = () => {
      const W = 360, pad = 20;
      const h = Math.round((img.height / img.width) * (W - pad * 2));
      const H = h + pad * 2 + 70;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0b0b0b";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.lineWidth = 2;
      g.strokeRect(1, 1, W - 2, H - 2);
      g.drawImage(img, pad, pad, W - pad * 2, h);
      g.fillStyle = "#e9e4da";
      g.font = "italic 20px 'Times New Roman', serif";
      g.fillText(`@${post.nick}`, pad, h + pad + 28);
      g.fillStyle = "#a9a293";
      g.font = "italic 16px 'Times New Roman', serif";
      g.fillText(post.cap.slice(0, 40), pad, h + pad + 52, W - pad * 2 - 50);
      g.fillStyle = "#ff8aa8";
      g.textAlign = "right";
      g.fillText(`♥ ${likes}`, W - pad, h + pad + 28);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.userData = { aspect: H / W };
      res(t);
    };
    img.src = post.img;
  });
}

export function createPosts(presence: Presence, myNick: () => string) {
  const group = new THREE.Group();
  const posts = new Map<string, Post>();
  const approved = new Set<string>();
  const likes = new Map<string, Set<string>>();
  const meshes = new Map<string, THREE.Mesh>();
  const me = playerId();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());

  const visible = (p: Post) => approved.has(p.id) || p.by === me;

  presence.onWorld((path, d) => {
    const [kind, id, who] = path.split("/");
    if (!id || !/^[\w-]{4,32}$/.test(id)) return;
    if (kind === "post") {
      if (typeof d.img !== "string" || !d.img.startsWith("data:image/jpeg;base64,") || d.img.length > 120_000) return;
      const cap = typeof d.cap === "string" ? filterMark(d.cap) ?? "" : "";
      const nick = cleanNick(d.nick) ?? "someone";
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
      const p: Post = { id, img: d.img, cap, nick, by: typeof d.by === "string" ? d.by.slice(0, 24) : "", x: num(d.x), z: num(d.z), ry: num(d.ry), t: num(d.t) };
      if ([p.x, p.z, p.ry, p.t].some(Number.isNaN)) return;
      posts.set(id, p);
      changed();
    }
    if (kind === "ok" && typeof d.sig === "string") {
      const p = posts.get(id);
      const check = () => {
        const q = posts.get(id);
        if (q) void verifyApproval(q, d.sig as string).then((ok) => ok && (approved.add(id), redraw(id), changed()));
      };
      if (p) check();
      else setTimeout(check, 3000); // the post may arrive after its approval
    }
    if (kind === "like" && who && /^[\w-]{1,24}$/.test(who)) {
      const s = likes.get(id) ?? new Set();
      if (d.v === 1) s.add(who);
      else s.delete(who);
      likes.set(id, s);
      redraw(id);
      changed();
    }
  });

  function redraw(id: string) {
    const m = meshes.get(id);
    const p = posts.get(id);
    if (!m || !p) return;
    void frameTexture(p, likes.get(id)?.size ?? 0).then((t) => {
      (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.MeshBasicMaterial).map = t;
      (m.material as THREE.MeshBasicMaterial).needsUpdate = true;
    });
  }

  return {
    group,
    onChange(fn: () => void) {
      listeners.add(fn);
    },
    /** hang a new post on the wall ahead */
    publish(img: string, cap: string, at: { x: number; z: number; ry: number }) {
      const id = `${me}-${Date.now().toString(36)}`;
      const post: Post = { id, img, cap: filterMark(cap) ?? "", nick: myNick(), by: me, x: +at.x.toFixed(2), z: +at.z.toFixed(2), ry: +at.ry.toFixed(3), t: Date.now(), agreed: Date.now() };
      presence.publishWorld(`post/${id}`, post);
      posts.set(id, post);
      changed();
      return post;
    },
    like(id: string, on: boolean) {
      presence.publishWorld(`like/${id}/${me}`, { v: on ? 1 : 0 });
    },
    liked: (id: string) => likes.get(id)?.has(me) ?? false,
    likeCount: (id: string) => likes.get(id)?.size ?? 0,
    isPending: (id: string) => !approved.has(id),
    /** the post you're looking at (within 3.5 m, roughly ahead) */
    lookingAt(px: number, pz: number, yaw: number) {
      let best: Post | null = null, bd = 3.5;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const p of posts.values()) {
        if (!visible(p)) continue;
        const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.6) (bd = d), (best = p);
      }
      return best;
    },
    update(px: number, pz: number) {
      // show the visible posts within 30 m
      for (const p of posts.values()) {
        const near = visible(p) && Math.hypot(p.x - px, p.z - pz) < 30;
        let m = meshes.get(p.id);
        if (near && !m) {
          m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshBasicMaterial({ toneMapped: false }));
          m.position.set(p.x, 1.75, p.z);
          m.rotation.y = p.ry;
          meshes.set(p.id, m);
          group.add(m);
          void frameTexture(p, likes.get(p.id)?.size ?? 0).then((t) => {
            (m!.material as THREE.MeshBasicMaterial).map = t;
            (m!.material as THREE.MeshBasicMaterial).needsUpdate = true;
            m!.scale.y = (t.userData.aspect * 1.3) / 1.6;
          });
        }
        if (!near && m) {
          group.remove(m);
          (m.material as THREE.MeshBasicMaterial).map?.dispose();
          meshes.delete(p.id);
        }
      }
    },
    /** approved posts only (never someone's pending one), oldest first: shown around the world too */
    approvedArt: () => [...posts.values()].filter((p) => approved.has(p.id)).sort((a, b) => a.t - b.t),
    /** for the owner's moderation page */
    all: () => [...posts.values()],
  };
}
