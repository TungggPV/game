import Phaser from "phaser";

/** Canvas painter helpers for rig parts. Parts are drawn at 2x in "design pixels". */

export type Ctx = CanvasRenderingContext2D;

export const RES = 2;

export const makeTexture = (scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) => {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w * RES), Math.ceil(h * RES));
  if (!tex) return;
  const c = tex.getContext();
  c.save();
  c.scale(RES, RES);
  c.lineJoin = "round";
  c.lineCap = "round";
  draw(c);
  c.restore();
  tex.refresh();
};

const OUTLINE = "#070b14";

const shade = (hex: string, amt: number) => {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(c.red)},${f(c.green)},${f(c.blue)})`;
};

/** Fill the current path as an armour plate: vertical gradient, outline and rim light. */
export const plate = (c: Ctx, path: () => void, color: string, opts: { light?: number; dark?: number; outline?: number; rim?: boolean; x0?: number; y0?: number; x1?: number; y1?: number } = {}) => {
  const g = c.createLinearGradient(opts.x0 ?? 0, opts.y0 ?? 0, opts.x1 ?? 10, opts.y1 ?? 40);
  g.addColorStop(0, shade(color, opts.light ?? 0.35));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, opts.dark ?? -0.45));
  c.beginPath();
  path();
  c.closePath();
  c.fillStyle = g;
  c.fill();
  c.lineWidth = opts.outline ?? 1.4;
  c.strokeStyle = OUTLINE;
  c.stroke();
  if (opts.rim !== false) {
    c.save();
    c.clip();
    c.beginPath();
    path();
    c.closePath();
    c.lineWidth = 1.6;
    c.strokeStyle = "rgba(255,255,255,0.28)";
    c.translate(0.9, 0.9);
    c.stroke();
    c.restore();
  }
};

export const glow = (c: Ctx, color: string, blur: number, draw: () => void) => {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  draw();
  c.restore();
};

export const glowShape = (c: Ctx, path: () => void, color: string, core = "#ffffff", blur = 6) => {
  glow(c, color, blur, () => {
    c.beginPath();
    path();
    c.closePath();
    c.fillStyle = color;
    c.fill();
  });
  c.save();
  c.globalAlpha = 0.85;
  c.beginPath();
  path();
  c.closePath();
  c.clip();
  const b = c.createLinearGradient(0, 0, 0, 100);
  b.addColorStop(0, core);
  b.addColorStop(1, color);
  c.fillStyle = core;
  c.globalAlpha = 0.45;
  c.fill();
  c.restore();
};

export const line = (c: Ctx, pts: [number, number][], color: string, width = 1) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) c.lineTo(x, y);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
};

export const roundRect = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
};

export { shade };
