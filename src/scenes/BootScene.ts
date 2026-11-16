import Phaser from "phaser";
import { FONT, GAME_HEIGHT, GAME_WIDTH } from "../config/constants";
import { MANIFEST, spriteUrl } from "../systems/assets";

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const radial = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, number][]) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([at, a]) => g.addColorStop(at, `rgba(255,255,255,${a})`));
  return g;
};

/** All effect textures are white so they can be tinted per element at runtime. */
const TEXTURES: Record<string, [number, number, Draw]> = {
  glow: [128, 128, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 1], [0.2, 0.75], [0.5, 0.25], [1, 0]]);
    c.fillRect(0, 0, w, w);
  }],
  core: [64, 64, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 1], [0.35, 0.95], [0.6, 0.35], [1, 0]]);
    c.fillRect(0, 0, w, w);
  }],
  dot: [16, 16, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 1], [0.6, 0.9], [1, 0]]);
    c.fillRect(0, 0, w, w);
  }],
  streak: [96, 12, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0, 0, Math.PI * 2);
    c.fill();
  }],
  ring: [256, 256, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 0], [0.62, 0], [0.86, 0.95], [0.93, 0.5], [1, 0]]);
    c.fillRect(0, 0, w, w);
  }],
  softring: [256, 256, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 0], [0.35, 0.05], [0.8, 0.6], [1, 0]]);
    c.fillRect(0, 0, w, w);
  }],
  smoke: [96, 96, (c, w) => {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      const r = w * (0.16 + (i % 3) * 0.05);
      const x = w / 2 + Math.cos(a) * w * 0.16;
      const y = w / 2 + Math.sin(a) * w * 0.16;
      c.fillStyle = radial(c, x, y, r, [[0, 0.45], [1, 0]]);
      c.fillRect(0, 0, w, w);
    }
  }],
  flame: [64, 96, (c, w, h) => {
    c.fillStyle = radial(c, w / 2, h * 0.65, w * 0.5, [[0, 1], [0.4, 0.7], [1, 0]]);
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.bezierCurveTo(w * 0.95, h * 0.45, w, h * 0.95, w / 2, h);
    c.bezierCurveTo(0, h * 0.95, w * 0.05, h * 0.45, w / 2, 0);
    c.fill();
  }],
  star: [64, 64, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w * 0.18, [[0, 1], [1, 0]]);
    c.fillRect(0, 0, w, w);
    for (const [sx, sy] of [[1, 0.09], [0.09, 1]]) {
      c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 1], [0.5, 0.5], [1, 0]]);
      c.beginPath();
      c.ellipse(w / 2, w / 2, (w / 2) * sx, (w / 2) * sy, 0, 0, Math.PI * 2);
      c.fill();
    }
  }],
  shard: [24, 40, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0.45)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w, h * 0.55);
    c.lineTo(w / 2, h);
    c.lineTo(0, h * 0.55);
    c.closePath();
    c.fill();
  }],
  leaf: [40, 20, (c, w, h) => {
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.beginPath();
    c.moveTo(0, h / 2);
    c.quadraticCurveTo(w / 2, -h * 0.3, w, h / 2);
    c.quadraticCurveTo(w / 2, h * 1.3, 0, h / 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(2, h / 2);
    c.lineTo(w - 2, h / 2);
    c.stroke();
  }],
  bubble: [48, 48, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, 0.15], [0.75, 0.35], [0.9, 0.95], [1, 0]]);
    c.fillRect(0, 0, w, w);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.beginPath();
    c.arc(w * 0.36, w * 0.34, w * 0.08, 0, Math.PI * 2);
    c.fill();
  }],
  // Crescent slash: stacked arcs, brightest on the outer edge, tapered toward both tips.
  arc: [256, 256, (c, w) => {
    const cx = w / 2;
    const cy = w / 2;
    c.lineCap = "round";
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      const r = w * 0.46 - t * w * 0.22;
      const span = Math.PI * (0.8 - t * 0.45);
      c.strokeStyle = `rgba(255,255,255,${(1 - t) ** 1.3 * 0.8})`;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(cx, cy, r, -span / 2, span / 2);
      c.stroke();
    }
    c.strokeStyle = "rgba(255,255,255,1)";
    c.lineWidth = 12;
    c.beginPath();
    c.arc(cx, cy, w * 0.45, -Math.PI * 0.36, Math.PI * 0.36);
    c.stroke();
  }],
  glyph: [256, 256, (c, w) => {
    const r = w / 2;
    c.translate(r, r);
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, r - 6, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, r - 26, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 24; i += 1) {
      c.save();
      c.rotate((i / 24) * Math.PI * 2);
      c.fillStyle = `rgba(255,255,255,${i % 3 === 0 ? 0.95 : 0.5})`;
      c.fillRect(-2, -(r - 10), 4, i % 3 === 0 ? 14 : 8);
      c.restore();
    }
    c.lineWidth = 3;
    for (const rot of [0, Math.PI / 6]) {
      c.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const a = rot + (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * (r - 32);
        const py = Math.sin(a) * (r - 32);
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
    c.fillStyle = radial(c, 0, 0, r * 0.4, [[0, 0.6], [1, 0]]);
    c.fillRect(-r, -r, w, w);
  }],
  pillar: [64, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.35, "rgba(255,255,255,0.6)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(0.65, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const fade = c.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.35, "rgba(0,0,0,0)");
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = fade;
    c.fillRect(0, 0, w, h);
  }],
  beam: [32, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.3, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(0.7, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }],
  vignette: [256, 144, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }],
  contact_shadow: [128, 64, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.48);
    g.addColorStop(0, "rgba(0, 0, 0, 0.72)");
    g.addColorStop(0.35, "rgba(0, 0, 0, 0.52)");
    g.addColorStop(0.7, "rgba(0, 0, 0, 0.18)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, w * 0.48, h * 0.44, 0, 0, Math.PI * 2);
    c.fill();
  }],
  crate_metal: [72, 72, (c, w, h) => {
    // Sci-fi chamfered crate body
    c.fillStyle = "#1e293b";
    c.strokeStyle = "#475569";
    c.lineWidth = 3;
    c.beginPath();
    const r = 8;
    c.moveTo(r, 0);
    c.lineTo(w - r, 0);
    c.lineTo(w, r);
    c.lineTo(w, h - r);
    c.lineTo(w - r, h);
    c.lineTo(r, h);
    c.lineTo(0, h - r);
    c.lineTo(0, r);
    c.closePath();
    c.fill();
    c.stroke();

    // Inner plate
    c.fillStyle = "#0f172a";
    c.strokeStyle = "#334155";
    c.lineWidth = 2;
    c.beginPath();
    c.rect(10, 10, w - 20, h - 20);
    c.fill();
    c.stroke();

    // Corner reinforcement brackets
    c.fillStyle = "#64748b";
    for (const [bx, by] of [[4, 4], [w - 14, 4], [4, h - 14], [w - 14, h - 14]]) {
      c.fillRect(bx, by, 10, 10);
    }
    // Rivets
    c.fillStyle = "#94a3b8";
    for (const [rx, ry] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) {
      c.beginPath();
      c.arc(rx, ry, 2, 0, Math.PI * 2);
      c.fill();
    }
  }],
  hex_shield: [64, 64, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.45;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = "rgba(255, 255, 255, 0.22)";
    c.fill();
    c.strokeStyle = "rgba(255, 255, 255, 0.95)";
    c.lineWidth = 3;
    c.stroke();
    // Inner hex
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const x = cx + r * 0.62 * Math.cos(a);
      const y = cy + r * 0.62 * Math.sin(a);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.strokeStyle = "rgba(255, 255, 255, 0.65)";
    c.lineWidth = 1.5;
    c.stroke();
  }],
  laser_reticle: [32, 32, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    c.strokeStyle = "rgba(255, 255, 255, 0.95)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 10, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 1)";
    c.beginPath();
    c.arc(cx, cy, 3, 0, Math.PI * 2);
    c.fill();
    // 4 crosshair ticks
    c.beginPath();
    c.moveTo(cx - 14, cy); c.lineTo(cx - 8, cy);
    c.moveTo(cx + 8, cy); c.lineTo(cx + 14, cy);
    c.moveTo(cx, cy - 14); c.lineTo(cx, cy - 8);
    c.moveTo(cx, cy + 8); c.lineTo(cx, cy + 14);
    c.stroke();
  }],
  lamp_cone: [128, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255, 235, 180, 0.45)");
    g.addColorStop(0.35, "rgba(255, 225, 150, 0.25)");
    g.addColorStop(0.8, "rgba(255, 215, 120, 0.08)");
    g.addColorStop(1, "rgba(255, 200, 100, 0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w * 0.45, 0);
    c.lineTo(w * 0.55, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
  }],
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const bar = this.add.rectangle(GAME_WIDTH / 2 - 240, GAME_HEIGHT / 2, 0, 10, 0x18e6ff).setOrigin(0, 0.5);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 484, 16).setStrokeStyle(2, 0x18e6ff, 0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "ĐANG KHỞI ĐỘNG GIÁP...", { fontFamily: FONT, fontSize: "20px", color: "#9ff8ff", fontStyle: "bold" })
      .setOrigin(0.5);
    this.load.on("progress", (p: number) => (bar.width = 480 * p));

    for (const key of Object.keys(MANIFEST)) this.load.image(key, spriteUrl(key));
  }

  create() {
    for (const [key, [w, h, draw]] of Object.entries(TEXTURES)) {
      const tex = this.textures.createCanvas(key, w, h);
      if (!tex) continue;
      draw(tex.getContext(), w, h);
      tex.refresh();
    }
    this.makeFloor();
    this.makeVoidTextures();
    this.scene.start("menu");
  }

  private makeVoidTextures() {
    // 1. bg_void_singularity
    const bgTex = this.textures.createCanvas("bg_void_singularity", 1280, 720);
    if (bgTex) {
      const ctx = bgTex.getContext();
      const bgGrad = ctx.createRadialGradient(640, 360, 50, 640, 360, 800);
      bgGrad.addColorStop(0, "#1a082b");
      bgGrad.addColorStop(0.4, "#0b0416");
      bgGrad.addColorStop(1, "#030108");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1280, 720);

      // Starfield
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 180; i++) {
        const sx = (Math.sin(i * 997.3) * 0.5 + 0.5) * 1280;
        const sy = (Math.cos(i * 433.7) * 0.5 + 0.5) * 720;
        const sr = (i % 3 === 0) ? 1.8 : 0.9;
        ctx.globalAlpha = 0.3 + (i % 5) * 0.14;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Accretion disk glow & rings
      ctx.globalAlpha = 1;
      const diskGrad = ctx.createRadialGradient(640, 360, 40, 640, 360, 340);
      diskGrad.addColorStop(0, "rgba(0,0,0,1)");
      diskGrad.addColorStop(0.12, "rgba(0,0,0,1)");
      diskGrad.addColorStop(0.16, "rgba(255,255,255,0.95)");
      diskGrad.addColorStop(0.24, "rgba(217,70,239,0.7)");
      diskGrad.addColorStop(0.45, "rgba(99,102,241,0.35)");
      diskGrad.addColorStop(0.7, "rgba(168,85,247,0.12)");
      diskGrad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.ellipse(640, 360, 480, 180, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Black hole event horizon core
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(640, 360, 45, 0, Math.PI * 2);
      ctx.fill();

      // Photon ring
      ctx.strokeStyle = "rgba(255, 230, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(640, 360, 47, 0, Math.PI * 2);
      ctx.stroke();

      bgTex.refresh();
    }

    // 2. floor_void
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0a0314).fillRect(0, 0, 160, 110);
    g.fillStyle(0x150826).fillRect(0, 0, 160, 18);
    g.fillStyle(0x05010a).fillRect(0, 18, 160, 4).fillRect(158, 0, 2, 110).fillRect(0, 64, 160, 2);
    g.fillStyle(0x280e45).fillRect(6, 30, 66, 26).fillRect(84, 30, 66, 26).fillRect(6, 74, 144, 28);
    g.fillStyle(0xd946ef).fillRect(8, 41, 62, 2).fillRect(86, 41, 62, 2).fillRect(8, 87, 140, 2);
    g.fillStyle(0x818cf8).fillCircle(10, 9, 2.5).fillCircle(150, 9, 2.5);
    g.generateTexture("floor_void", 160, 110);
    g.destroy();
  }

  private makeFloor() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1a2433).fillRect(0, 0, 160, 110);
    g.fillStyle(0x222f42).fillRect(0, 0, 160, 18);
    g.fillStyle(0x0d141e).fillRect(0, 18, 160, 4).fillRect(158, 0, 2, 110).fillRect(0, 64, 160, 2);
    g.fillStyle(0x2c3b52).fillRect(6, 30, 66, 26).fillRect(84, 30, 66, 26).fillRect(6, 74, 144, 28);
    g.fillStyle(0x3e5068).fillCircle(10, 9, 2).fillCircle(150, 9, 2);
    g.generateTexture("floor", 160, 110);
    g.destroy();
  }
}
