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
  chest_scifi: [96, 64, (c, w, h) => {
    // Ground base shadow & beveled armored chest body
    const bodyGrad = c.createLinearGradient(0, 10, 0, h);
    bodyGrad.addColorStop(0, "#3b4760");
    bodyGrad.addColorStop(0.35, "#232c40");
    bodyGrad.addColorStop(1, "#0f172a");
    c.fillStyle = bodyGrad;
    c.strokeStyle = "#94a3b8";
    c.lineWidth = 2;
    c.beginPath();
    const cut = 10;
    c.moveTo(cut, 10);
    c.lineTo(w - cut, 10);
    c.lineTo(w - 2, 22);
    c.lineTo(w - 2, h - 4);
    c.lineTo(w - 6, h);
    c.lineTo(6, h);
    c.lineTo(2, h - 4);
    c.lineTo(2, 22);
    c.closePath();
    c.fill();
    c.stroke();

    // Beveled armored lid top + horizontal seam
    const lidGrad = c.createLinearGradient(0, 10, 0, 28);
    lidGrad.addColorStop(0, "#64748b");
    lidGrad.addColorStop(1, "#334155");
    c.fillStyle = lidGrad;
    c.beginPath();
    c.moveTo(cut + 2, 12);
    c.lineTo(w - cut - 2, 12);
    c.lineTo(w - 4, 24);
    c.lineTo(4, 24);
    c.closePath();
    c.fill();
    c.fillStyle = "#020617";
    c.fillRect(3, 25, w - 6, 3);

    // Metallic corner brackets & side latches
    c.fillStyle = "#cbd5e1";
    c.fillRect(6, 20, 10, 14);
    c.fillRect(w - 16, 20, 10, 14);
    c.fillStyle = "#475569";
    c.fillRect(10, h - 12, 14, 10);
    c.fillRect(w - 24, h - 12, 14, 10);

    // Glowing violet/gold security core clasp in center
    c.fillStyle = "#0f172a";
    c.fillRect(w / 2 - 14, 20, 28, 22);
    c.strokeStyle = "#facc15";
    c.lineWidth = 2;
    c.strokeRect(w / 2 - 14, 20, 28, 22);
    const lockGlow = c.createRadialGradient(w / 2, 31, 1, w / 2, 31, 11);
    lockGlow.addColorStop(0, "#fef9c3");
    lockGlow.addColorStop(0.5, "#c084fc");
    lockGlow.addColorStop(1, "rgba(168, 85, 247, 0.2)");
    c.fillStyle = lockGlow;
    c.beginPath();
    c.arc(w / 2, 31, 9, 0, Math.PI * 2);
    c.fill();
  }],
  item_chip: [64, 64, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    // Gold connector pins on all 4 sides
    c.fillStyle = "#fbbf24";
    for (let i = -2; i <= 2; i++) {
      const off = i * 7;
      c.fillRect(cx + off - 2, 5, 4, 8);
      c.fillRect(cx + off - 2, h - 13, 4, 8);
      c.fillRect(5, cy + off - 2, 8, 4);
      c.fillRect(w - 13, cy + off - 2, 8, 4);
    }
    // Dark slate outer processor casing
    c.fillStyle = "#0f172a";
    c.strokeStyle = "#64748b";
    c.lineWidth = 2.5;
    c.beginPath();
    c.rect(12, 12, w - 24, h - 24);
    c.fill();
    c.stroke();

    // Inner beveled die + cyan circuit traces
    c.fillStyle = "#1e293b";
    c.strokeStyle = "#18e6ff";
    c.lineWidth = 1.5;
    c.fillRect(19, 19, w - 38, h - 38);
    c.strokeRect(19, 19, w - 38, h - 38);

    // Glowing cyan energy core
    const g = c.createRadialGradient(cx, cy, 1, cx, cy, 12);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#18e6ff");
    g.addColorStop(1, "rgba(24, 230, 255, 0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 12, 0, Math.PI * 2);
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
      if (this.textures.exists(key)) this.textures.remove(key);
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
    // 1. bg_void_singularity — ENHANCED with multi-ring accretion disk, lensing, nebula
    const bgTex = this.textures.createCanvas("bg_void_singularity", 1280, 720);
    if (bgTex) {
      const ctx = bgTex.getContext();

      // Deep space background with nebula colors
      const bgGrad = ctx.createRadialGradient(640, 360, 30, 640, 360, 900);
      bgGrad.addColorStop(0, "#1a082b");
      bgGrad.addColorStop(0.15, "#120620");
      bgGrad.addColorStop(0.35, "#0b0416");
      bgGrad.addColorStop(0.6, "#050210");
      bgGrad.addColorStop(1, "#020108");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1280, 720);

      // Nebula clouds – subtle colored gas regions
      ctx.globalAlpha = 0.08;
      const nebula1 = ctx.createRadialGradient(300, 200, 20, 300, 200, 250);
      nebula1.addColorStop(0, "#7c3aed"); nebula1.addColorStop(1, "transparent");
      ctx.fillStyle = nebula1; ctx.fillRect(0, 0, 1280, 720);
      const nebula2 = ctx.createRadialGradient(1000, 500, 20, 1000, 500, 300);
      nebula2.addColorStop(0, "#6366f1"); nebula2.addColorStop(1, "transparent");
      ctx.fillStyle = nebula2; ctx.fillRect(0, 0, 1280, 720);
      const nebula3 = ctx.createRadialGradient(800, 150, 10, 800, 150, 200);
      nebula3.addColorStop(0, "#ec4899"); nebula3.addColorStop(1, "transparent");
      ctx.fillStyle = nebula3; ctx.fillRect(0, 0, 1280, 720);
      ctx.globalAlpha = 1;

      // Dense starfield with varying sizes and brightness
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 350; i++) {
        const sx = (Math.sin(i * 997.3 + i * 0.1) * 0.5 + 0.5) * 1280;
        const sy = (Math.cos(i * 433.7 + i * 0.07) * 0.5 + 0.5) * 720;
        const sr = (i % 7 === 0) ? 2.2 : (i % 3 === 0) ? 1.4 : 0.7;
        ctx.globalAlpha = 0.2 + (i % 7) * 0.1;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      // A few colored stars
      const starColors = ["#a78bfa", "#818cf8", "#f9a8d4", "#67e8f9"];
      for (let i = 0; i < 20; i++) {
        const sx = (Math.sin(i * 1337.1) * 0.5 + 0.5) * 1280;
        const sy = (Math.cos(i * 773.3) * 0.5 + 0.5) * 720;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = starColors[i % starColors.length];
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      // Gravitational lensing effect – distorted ring of light around black hole
      ctx.globalAlpha = 0.12;
      for (let r = 180; r < 400; r += 8) {
        const distortion = 1 + 0.3 * Math.exp(-(r - 180) / 80);
        ctx.strokeStyle = `rgba(168,85,247,${0.15 * Math.exp(-(r - 180) / 120)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(640, 360, r * distortion, r * 0.42 * distortion, -0.15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Outer accretion disk ring (faint)
      const outerDisk = ctx.createRadialGradient(640, 360, 200, 640, 360, 500);
      outerDisk.addColorStop(0, "rgba(99,102,241,0)");
      outerDisk.addColorStop(0.3, "rgba(99,102,241,0.08)");
      outerDisk.addColorStop(0.5, "rgba(168,85,247,0.15)");
      outerDisk.addColorStop(0.7, "rgba(139,92,246,0.06)");
      outerDisk.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = outerDisk;
      ctx.beginPath();
      ctx.ellipse(640, 360, 520, 200, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Middle accretion disk ring (medium brightness)
      const midDisk = ctx.createRadialGradient(640, 360, 80, 640, 360, 350);
      midDisk.addColorStop(0, "rgba(0,0,0,1)");
      midDisk.addColorStop(0.15, "rgba(0,0,0,0.95)");
      midDisk.addColorStop(0.22, "rgba(217,70,239,0.5)");
      midDisk.addColorStop(0.35, "rgba(192,132,252,0.4)");
      midDisk.addColorStop(0.5, "rgba(99,102,241,0.2)");
      midDisk.addColorStop(0.7, "rgba(168,85,247,0.08)");
      midDisk.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = midDisk;
      ctx.beginPath();
      ctx.ellipse(640, 360, 420, 160, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Inner accretion disk (brightest – hot plasma)
      const innerDisk = ctx.createRadialGradient(640, 360, 40, 640, 360, 200);
      innerDisk.addColorStop(0, "rgba(0,0,0,1)");
      innerDisk.addColorStop(0.18, "rgba(0,0,0,1)");
      innerDisk.addColorStop(0.24, "rgba(255,255,255,0.95)");
      innerDisk.addColorStop(0.3, "rgba(253,186,116,0.85)");
      innerDisk.addColorStop(0.4, "rgba(217,70,239,0.7)");
      innerDisk.addColorStop(0.55, "rgba(139,92,246,0.4)");
      innerDisk.addColorStop(0.75, "rgba(99,102,241,0.15)");
      innerDisk.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = innerDisk;
      ctx.beginPath();
      ctx.ellipse(640, 360, 300, 110, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Black hole event horizon core
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(640, 360, 48, 0, Math.PI * 2);
      ctx.fill();

      // Bright photon ring (innermost stable orbit)
      ctx.strokeStyle = "rgba(255, 240, 255, 1)";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#e879f9";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(640, 360, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Secondary photon ring
      ctx.strokeStyle = "rgba(232, 121, 249, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(640, 360, 56, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Jet beams (faint relativistic jets above/below)
      ctx.globalAlpha = 0.06;
      const jetGrad1 = ctx.createLinearGradient(640, 360, 640, 0);
      jetGrad1.addColorStop(0, "#a855f7"); jetGrad1.addColorStop(1, "transparent");
      ctx.fillStyle = jetGrad1;
      ctx.beginPath();
      ctx.moveTo(632, 360); ctx.lineTo(620, 0); ctx.lineTo(660, 0); ctx.lineTo(648, 360);
      ctx.closePath(); ctx.fill();
      const jetGrad2 = ctx.createLinearGradient(640, 360, 640, 720);
      jetGrad2.addColorStop(0, "#a855f7"); jetGrad2.addColorStop(1, "transparent");
      ctx.fillStyle = jetGrad2;
      ctx.beginPath();
      ctx.moveTo(632, 360); ctx.lineTo(620, 720); ctx.lineTo(660, 720); ctx.lineTo(648, 360);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      // Obsidian Void Platform Deck (y=564..720 so groundY=568 aligns flush on solid floor)
      const deckG = ctx.createLinearGradient(0, 564, 0, 720);
      deckG.addColorStop(0, "#24113d");
      deckG.addColorStop(0.08, "#160929");
      deckG.addColorStop(0.4, "#0d041a");
      deckG.addColorStop(1, "#05010a");
      ctx.fillStyle = deckG;
      ctx.fillRect(0, 564, 1280, 156);
      ctx.fillStyle = "#4c1d95";
      ctx.fillRect(0, 564, 1280, 5);
      ctx.fillStyle = "rgba(217, 70, 239, 0.7)";
      ctx.fillRect(0, 578, 1280, 2);
      ctx.strokeStyle = "rgba(139, 92, 246, 0.35)";
      ctx.lineWidth = 2;
      for (let px = 0; px < 1280; px += 160) {
        ctx.beginPath();
        ctx.moveTo(px, 569);
        ctx.lineTo(px, 720);
        ctx.stroke();
        ctx.fillStyle = "rgba(192, 132, 252, 0.35)";
        ctx.fillRect(px + 24, 608, 112, 10);
      }

      bgTex.refresh();
    }

    // 1b. bg_void_singularity_mirrored (2560x720) — mirrored tiling version
    const mirrorSing = this.textures.createCanvas("bg_void_singularity_mirrored", 2560, 720);
    if (mirrorSing) {
      const mc = mirrorSing.getContext();
      // Draw the singularity bg if it exists, then mirror it
      const srcCanvas = bgTex?.getCanvas();
      if (srcCanvas) {
        mc.drawImage(srcCanvas, 0, 0);
        mc.save();
        mc.translate(2560, 0);
        mc.scale(-1, 1);
        mc.drawImage(srcCanvas, 0, 0);
        mc.restore();
      }
      mirrorSing.refresh();
    }

    // 1c. bg_orbit (1280x720) & bg_orbit_mirrored (2560x720) — Earth orbit space station deck
    const singleOrbit = this.textures.createCanvas("bg_orbit", 1280, 720);
    if (singleOrbit) {
      const oc = singleOrbit.getContext();
      const halfW = 1280;

      // Deep space background
      const spaceG = oc.createLinearGradient(0, 0, 0, 720);
      spaceG.addColorStop(0, "#020617");
      spaceG.addColorStop(0.3, "#0f172a");
      spaceG.addColorStop(0.6, "#1e1b4b");
      spaceG.addColorStop(1, "#020617");
      oc.fillStyle = spaceG;
      oc.fillRect(0, 0, halfW, 720);

      // Stars
      oc.fillStyle = "#ffffff";
      for (let i = 0; i < 400; i++) {
        const sx = (Math.sin(i * 1234.5) * 0.5 + 0.5) * halfW;
        const sy = (Math.cos(i * 567.8) * 0.5 + 0.5) * 720;
        const sr = (i % 5 === 0) ? 1.8 : (i % 3 === 0) ? 1.1 : 0.6;
        oc.globalAlpha = 0.25 + (i % 6) * 0.12;
        oc.beginPath();
        oc.arc(sx, sy, sr, 0, Math.PI * 2);
        oc.fill();
      }
      oc.globalAlpha = 1;

      // Earth in the distance (right side)
      const earthX = 950, earthY = 390, earthR = 110;
      oc.globalAlpha = 0.15;
      const atmoG = oc.createRadialGradient(earthX, earthY, earthR, earthX, earthY, earthR + 40);
      atmoG.addColorStop(0, "#38bdf8"); atmoG.addColorStop(1, "transparent");
      oc.fillStyle = atmoG;
      oc.beginPath(); oc.arc(earthX, earthY, earthR + 40, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;
      const earthG = oc.createRadialGradient(earthX - 20, earthY - 20, 10, earthX, earthY, earthR);
      earthG.addColorStop(0, "#1e40af");
      earthG.addColorStop(0.3, "#1d4ed8");
      earthG.addColorStop(0.5, "#166534");
      earthG.addColorStop(0.65, "#1e40af");
      earthG.addColorStop(0.8, "#1e3a5f");
      earthG.addColorStop(1, "#0c1426");
      oc.fillStyle = earthG;
      oc.beginPath(); oc.arc(earthX, earthY, earthR, 0, Math.PI * 2); oc.fill();
      oc.fillStyle = "#166534";
      oc.globalAlpha = 0.4;
      oc.beginPath(); oc.ellipse(earthX - 30, earthY - 20, 25, 18, 0.3, 0, Math.PI * 2); oc.fill();
      oc.beginPath(); oc.ellipse(earthX + 20, earthY + 15, 20, 30, -0.2, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;
      oc.globalAlpha = 0.2;
      oc.fillStyle = "#e2e8f0";
      oc.beginPath(); oc.ellipse(earthX - 15, earthY - 35, 30, 6, 0.2, 0, Math.PI * 2); oc.fill();
      oc.beginPath(); oc.ellipse(earthX + 25, earthY + 5, 25, 5, -0.3, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;

      // Satellite debris scattered above the deck
      const debrisData: [number, number, number, number, number][] = [
        [200, 150, 20, 8, 0.4],
        [350, 280, 15, 6, -0.3],
        [500, 100, 25, 5, 0.7],
        [700, 340, 18, 7, -0.5],
        [150, 420, 12, 5, 0.2],
        [600, 450, 22, 6, -0.6],
        [1050, 180, 16, 5, 0.8],
        [820, 490, 14, 4, -0.2],
      ];
      for (const [dx, dy, dw, dh, dr] of debrisData) {
        oc.save();
        oc.translate(dx, dy);
        oc.rotate(dr);
        oc.fillStyle = "#475569";
        oc.fillRect(-dw / 2, -dh / 2, dw, dh);
        oc.fillStyle = "#1e3a5f";
        oc.fillRect(-dw / 2 - 10, -2, 10, 4);
        oc.fillRect(dw / 2, -2, 10, 4);
        oc.fillStyle = "rgba(255,255,255,0.4)";
        oc.fillRect(-dw / 2 + 2, -dh / 2 + 1, 4, 3);
        oc.restore();
      }

      // Space Station Catwalk Guardrail + Platform Deck (y=564..720 matching GROUND_Y=568)
      oc.strokeStyle = "rgba(100, 116, 139, 0.55)";
      oc.lineWidth = 3;
      oc.beginPath();
      oc.moveTo(0, 514); oc.lineTo(halfW, 514);
      oc.moveTo(0, 538); oc.lineTo(halfW, 538);
      for (let gx = 40; gx < halfW; gx += 120) {
        oc.moveTo(gx, 514); oc.lineTo(gx, 564);
      }
      oc.stroke();

      const deckGrad = oc.createLinearGradient(0, 564, 0, 720);
      deckGrad.addColorStop(0, "#334155");
      deckGrad.addColorStop(0.08, "#1e293b");
      deckGrad.addColorStop(0.35, "#0f172a");
      deckGrad.addColorStop(1, "#020617");
      oc.fillStyle = deckGrad;
      oc.fillRect(0, 564, halfW, 156);
      oc.fillStyle = "#64748b";
      oc.fillRect(0, 564, halfW, 5);
      oc.fillStyle = "rgba(56, 189, 248, 0.75)";
      oc.fillRect(0, 580, halfW, 3);
      for (let px = 0; px < halfW; px += 160) {
        oc.fillStyle = "#0f172a";
        oc.fillRect(px, 569, 4, 151);
        oc.fillStyle = "rgba(129, 140, 248, 0.35)";
        oc.fillRect(px + 20, 610, 118, 12);
      }

      singleOrbit.refresh();

      const orbitTex = this.textures.createCanvas("bg_orbit_mirrored", 2560, 720);
      if (orbitTex) {
        const mc = orbitTex.getContext();
        const src = singleOrbit.getCanvas();
        if (src) {
          mc.drawImage(src, 0, 0);
          mc.save();
          mc.translate(2560, 0);
          mc.scale(-1, 1);
          mc.drawImage(src, 0, 0);
          mc.restore();
        }
        orbitTex.refresh();
      }
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
