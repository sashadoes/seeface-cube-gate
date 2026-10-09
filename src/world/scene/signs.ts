// Neon signs IN the world (room names, listener counts, who's speaking), drawn on a canvas.
// Redrawn only when the text changes.
import * as THREE from "three";

export type Sign = { mesh: THREE.Mesh; setSub: (s: string) => void; tick: (t: number, cam: THREE.Vector3) => void; dispose: () => void };

export function makeSign(title: string, neon: number, billboard = false): Sign {
  const W = 512, H = 160;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * (H / W)), mat);
  mesh.renderOrder = 2;
  const col = "#" + neon.toString(16).padStart(6, "0");
  let sub = "";

  const draw = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(6,5,10,0.72)";
    roundRect(g, 6, 6, W - 12, H - 12, 18);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.shadowColor = col;
    g.shadowBlur = 18;
    roundRect(g, 6, 6, W - 12, H - 12, 18);
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = col;
    g.font = `600 ${title.length > 20 ? 40 : 50}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(title, W / 2, sub ? 58 : H / 2);
    if (sub) {
      g.shadowBlur = 6;
      g.fillStyle = "#e8e4f4";
      g.font = `400 30px "Helvetica Neue", Arial, sans-serif`;
      g.fillText(sub, W / 2, 114);
    }
    tex.needsUpdate = true;
  };
  draw();

  return {
    mesh,
    setSub(s) {
      if (s === sub) return;
      sub = s;
      draw();
    },
    tick(t, cam) {
      // a neon buzz: rare flickers
      mat.opacity = Math.sin(t * 31 + title.length) > 0.995 ? 0.55 : 1;
      // well signs turn to face you (never mirrored)
      if (billboard) mesh.rotation.y = Math.atan2(cam.x - mesh.position.x, cam.z - mesh.position.z);
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
    },
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
