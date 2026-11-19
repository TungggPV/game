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

  /* ================================================================
   *  A) CRIMSON FLARE WALK FRAMES (walk_1 – walk_4)
   * ================================================================ */
  crimson_flare_walk_1: [100, 115, (c, w, h) => {
    // Standing / neutral stride – feet together
    const cx = w / 2;
    // Leg shadows
    c.fillStyle = "#4a0a0a";
    c.fillRect(cx - 14, h * 0.65, 10, h * 0.28);
    c.fillRect(cx + 4, h * 0.65, 10, h * 0.28);
    // Boots
    c.fillStyle = "#8b1a1a";
    c.fillRect(cx - 16, h * 0.88, 14, 10);
    c.fillRect(cx + 2, h * 0.88, 14, 10);
    // Torso armor
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#e63946");
    tg.addColorStop(0.5, "#b91c1c");
    tg.addColorStop(1, "#7f1d1d");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35);
    c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65);
    c.lineTo(cx - 18, h * 0.65);
    c.closePath();
    c.fill();
    // Shoulder pads
    c.fillStyle = "#dc2626";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 12, 8, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 12, 8, 0.3, 0, Math.PI * 2); c.fill();
    // Helmet
    c.fillStyle = "#991b1b";
    c.beginPath();
    c.arc(cx, h * 0.2, 16, 0, Math.PI * 2);
    c.fill();
    // Visor
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    // Glowing accent lines on torso
    c.strokeStyle = "#fb923c";
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - 8, h * 0.4); c.lineTo(cx - 8, h * 0.58); c.stroke();
    c.beginPath(); c.moveTo(cx + 8, h * 0.4); c.lineTo(cx + 8, h * 0.58); c.stroke();
    // Arms
    c.fillStyle = "#b91c1c";
    c.fillRect(cx - 34, h * 0.37, 12, 24);
    c.fillRect(cx + 22, h * 0.37, 12, 24);
    // Glow
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#ff6b35");
    gg.addColorStop(1, "transparent");
    c.fillStyle = gg;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  crimson_flare_walk_2: [100, 115, (c, w, h) => {
    // Mid stride – left leg forward, right leg back
    const cx = w / 2;
    // Right leg (back)
    c.fillStyle = "#4a0a0a";
    c.save(); c.translate(cx + 6, h * 0.65); c.rotate(0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Left leg (forward)
    c.fillStyle = "#6b0f0f";
    c.save(); c.translate(cx - 6, h * 0.65); c.rotate(-0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Boots
    c.fillStyle = "#8b1a1a";
    c.fillRect(cx - 20, h * 0.88, 14, 10);
    c.fillRect(cx + 10, h * 0.88, 14, 10);
    // Torso
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#e63946");
    tg.addColorStop(0.5, "#b91c1c");
    tg.addColorStop(1, "#7f1d1d");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35);
    c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65);
    c.lineTo(cx - 18, h * 0.65);
    c.closePath();
    c.fill();
    // Shoulders
    c.fillStyle = "#dc2626";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 12, 8, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 12, 8, 0.3, 0, Math.PI * 2); c.fill();
    // Helmet
    c.fillStyle = "#991b1b";
    c.beginPath(); c.arc(cx, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    // Arms swinging
    c.fillStyle = "#b91c1c";
    c.save(); c.translate(cx - 30, h * 0.38); c.rotate(0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 30, h * 0.38); c.rotate(-0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    // Accent lines
    c.strokeStyle = "#fb923c"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - 8, h * 0.4); c.lineTo(cx - 8, h * 0.58); c.stroke();
    c.beginPath(); c.moveTo(cx + 8, h * 0.4); c.lineTo(cx + 8, h * 0.58); c.stroke();
    // Glow
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#ff6b35"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  crimson_flare_walk_3: [100, 115, (c, w, h) => {
    // Full stride – legs wide apart
    const cx = w / 2;
    // Left leg (far forward)
    c.fillStyle = "#6b0f0f";
    c.save(); c.translate(cx - 8, h * 0.65); c.rotate(-0.4);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Right leg (far back)
    c.fillStyle = "#4a0a0a";
    c.save(); c.translate(cx + 8, h * 0.65); c.rotate(0.4);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Boots
    c.fillStyle = "#8b1a1a";
    c.fillRect(cx - 24, h * 0.86, 14, 10);
    c.fillRect(cx + 14, h * 0.86, 14, 10);
    // Torso slight lean
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#e63946");
    tg.addColorStop(0.5, "#b91c1c");
    tg.addColorStop(1, "#7f1d1d");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 21, h * 0.34);
    c.lineTo(cx + 23, h * 0.36);
    c.lineTo(cx + 19, h * 0.65);
    c.lineTo(cx - 17, h * 0.65);
    c.closePath();
    c.fill();
    // Shoulders
    c.fillStyle = "#dc2626";
    c.beginPath(); c.ellipse(cx - 23, h * 0.33, 12, 8, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 25, h * 0.35, 12, 8, 0.3, 0, Math.PI * 2); c.fill();
    // Helmet
    c.fillStyle = "#991b1b";
    c.beginPath(); c.arc(cx + 1, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 9, h * 0.17, 20, 5);
    // Arms wide swing
    c.fillStyle = "#b91c1c";
    c.save(); c.translate(cx - 28, h * 0.38); c.rotate(0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 28, h * 0.38); c.rotate(-0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    // Accent lines
    c.strokeStyle = "#fb923c"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - 7, h * 0.4); c.lineTo(cx - 7, h * 0.57); c.stroke();
    c.beginPath(); c.moveTo(cx + 9, h * 0.4); c.lineTo(cx + 9, h * 0.57); c.stroke();
    // Glow
    c.globalAlpha = 0.3;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 45);
    gg.addColorStop(0, "#ff6b35"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  crimson_flare_walk_4: [100, 115, (c, w, h) => {
    // Returning stride – right leg forward, mirror of walk_2
    const cx = w / 2;
    // Left leg (back)
    c.fillStyle = "#4a0a0a";
    c.save(); c.translate(cx - 6, h * 0.65); c.rotate(0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Right leg (forward)
    c.fillStyle = "#6b0f0f";
    c.save(); c.translate(cx + 6, h * 0.65); c.rotate(-0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Boots
    c.fillStyle = "#8b1a1a";
    c.fillRect(cx - 10, h * 0.88, 14, 10);
    c.fillRect(cx + 4, h * 0.88, 14, 10);
    // Torso
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#e63946");
    tg.addColorStop(0.5, "#b91c1c");
    tg.addColorStop(1, "#7f1d1d");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35);
    c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65);
    c.lineTo(cx - 18, h * 0.65);
    c.closePath();
    c.fill();
    // Shoulders
    c.fillStyle = "#dc2626";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 12, 8, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 12, 8, 0.3, 0, Math.PI * 2); c.fill();
    // Helmet
    c.fillStyle = "#991b1b";
    c.beginPath(); c.arc(cx, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    // Arms swinging opposite
    c.fillStyle = "#b91c1c";
    c.save(); c.translate(cx - 30, h * 0.38); c.rotate(-0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 30, h * 0.38); c.rotate(0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    // Accent lines
    c.strokeStyle = "#fb923c"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - 8, h * 0.4); c.lineTo(cx - 8, h * 0.58); c.stroke();
    c.beginPath(); c.moveTo(cx + 8, h * 0.4); c.lineTo(cx + 8, h * 0.58); c.stroke();
    // Glow
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#ff6b35"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],

  /* ================================================================
   *  A) VOLT SENTINEL WALK FRAMES (walk_1 – walk_4)
   * ================================================================ */
  volt_sentinel_walk_1: [100, 115, (c, w, h) => {
    const cx = w / 2;
    // Legs – neutral
    c.fillStyle = "#4a3800";
    c.fillRect(cx - 14, h * 0.65, 10, h * 0.28);
    c.fillRect(cx + 4, h * 0.65, 10, h * 0.28);
    // Boots
    c.fillStyle = "#a16207";
    c.fillRect(cx - 16, h * 0.88, 14, 10);
    c.fillRect(cx + 2, h * 0.88, 14, 10);
    // Torso
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#fbbf24");
    tg.addColorStop(0.5, "#d97706");
    tg.addColorStop(1, "#92400e");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35);
    c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65);
    c.lineTo(cx - 18, h * 0.65);
    c.closePath();
    c.fill();
    // Shoulder pads
    c.fillStyle = "#f59e0b";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 13, 9, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 13, 9, 0.3, 0, Math.PI * 2); c.fill();
    // Helmet
    c.fillStyle = "#b45309";
    c.beginPath(); c.arc(cx, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    // Visor – electric blue
    c.fillStyle = "#38bdf8";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    // Lightning bolt accent on chest
    c.strokeStyle = "#fef08a";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx - 2, h * 0.4);
    c.lineTo(cx + 4, h * 0.48);
    c.lineTo(cx - 1, h * 0.5);
    c.lineTo(cx + 5, h * 0.58);
    c.stroke();
    // Arms
    c.fillStyle = "#d97706";
    c.fillRect(cx - 34, h * 0.37, 12, 24);
    c.fillRect(cx + 22, h * 0.37, 12, 24);
    // Glow
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#facc15"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  volt_sentinel_walk_2: [100, 115, (c, w, h) => {
    const cx = w / 2;
    // Right leg (back)
    c.fillStyle = "#4a3800";
    c.save(); c.translate(cx + 6, h * 0.65); c.rotate(0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Left leg (forward)
    c.fillStyle = "#6b4f00";
    c.save(); c.translate(cx - 6, h * 0.65); c.rotate(-0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    c.fillStyle = "#a16207";
    c.fillRect(cx - 20, h * 0.88, 14, 10);
    c.fillRect(cx + 10, h * 0.88, 14, 10);
    // Torso
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#fbbf24"); tg.addColorStop(0.5, "#d97706"); tg.addColorStop(1, "#92400e");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35); c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65); c.lineTo(cx - 18, h * 0.65);
    c.closePath(); c.fill();
    c.fillStyle = "#f59e0b";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 13, 9, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 13, 9, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#b45309";
    c.beginPath(); c.arc(cx, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#38bdf8";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    c.strokeStyle = "#fef08a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - 2, h * 0.4); c.lineTo(cx + 4, h * 0.48);
    c.lineTo(cx - 1, h * 0.5); c.lineTo(cx + 5, h * 0.58); c.stroke();
    c.fillStyle = "#d97706";
    c.save(); c.translate(cx - 30, h * 0.38); c.rotate(0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 30, h * 0.38); c.rotate(-0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#facc15"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  volt_sentinel_walk_3: [100, 115, (c, w, h) => {
    const cx = w / 2;
    // Left leg (far forward)
    c.fillStyle = "#6b4f00";
    c.save(); c.translate(cx - 8, h * 0.65); c.rotate(-0.4);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    // Right leg (far back)
    c.fillStyle = "#4a3800";
    c.save(); c.translate(cx + 8, h * 0.65); c.rotate(0.4);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    c.fillStyle = "#a16207";
    c.fillRect(cx - 24, h * 0.86, 14, 10);
    c.fillRect(cx + 14, h * 0.86, 14, 10);
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#fbbf24"); tg.addColorStop(0.5, "#d97706"); tg.addColorStop(1, "#92400e");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 21, h * 0.34); c.lineTo(cx + 23, h * 0.36);
    c.lineTo(cx + 19, h * 0.65); c.lineTo(cx - 17, h * 0.65);
    c.closePath(); c.fill();
    c.fillStyle = "#f59e0b";
    c.beginPath(); c.ellipse(cx - 23, h * 0.33, 13, 9, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 25, h * 0.35, 13, 9, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#b45309";
    c.beginPath(); c.arc(cx + 1, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#38bdf8";
    c.fillRect(cx - 9, h * 0.17, 20, 5);
    c.strokeStyle = "#fef08a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - 1, h * 0.4); c.lineTo(cx + 5, h * 0.48);
    c.lineTo(cx, h * 0.5); c.lineTo(cx + 6, h * 0.58); c.stroke();
    c.fillStyle = "#d97706";
    c.save(); c.translate(cx - 28, h * 0.38); c.rotate(0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 28, h * 0.38); c.rotate(-0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.globalAlpha = 0.3;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 45);
    gg.addColorStop(0, "#facc15"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  volt_sentinel_walk_4: [100, 115, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#4a3800";
    c.save(); c.translate(cx - 6, h * 0.65); c.rotate(0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    c.fillStyle = "#6b4f00";
    c.save(); c.translate(cx + 6, h * 0.65); c.rotate(-0.25);
    c.fillRect(-5, 0, 10, h * 0.26); c.restore();
    c.fillStyle = "#a16207";
    c.fillRect(cx - 10, h * 0.88, 14, 10);
    c.fillRect(cx + 4, h * 0.88, 14, 10);
    const tg = c.createLinearGradient(cx - 20, h * 0.25, cx + 20, h * 0.65);
    tg.addColorStop(0, "#fbbf24"); tg.addColorStop(0.5, "#d97706"); tg.addColorStop(1, "#92400e");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 22, h * 0.35); c.lineTo(cx + 22, h * 0.35);
    c.lineTo(cx + 18, h * 0.65); c.lineTo(cx - 18, h * 0.65);
    c.closePath(); c.fill();
    c.fillStyle = "#f59e0b";
    c.beginPath(); c.ellipse(cx - 24, h * 0.34, 13, 9, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 24, h * 0.34, 13, 9, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#b45309";
    c.beginPath(); c.arc(cx, h * 0.2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#38bdf8";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    c.strokeStyle = "#fef08a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - 2, h * 0.4); c.lineTo(cx + 4, h * 0.48);
    c.lineTo(cx - 1, h * 0.5); c.lineTo(cx + 5, h * 0.58); c.stroke();
    c.fillStyle = "#d97706";
    c.save(); c.translate(cx - 30, h * 0.38); c.rotate(-0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 30, h * 0.38); c.rotate(0.3);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 40);
    gg.addColorStop(0, "#facc15"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],

  /* ================================================================
   *  A) EMERALD PHANTOM WALK FRAMES (walk_1 – walk_4)
   * ================================================================ */
  emerald_phantom_walk_1: [100, 115, (c, w, h) => {
    const cx = w / 2;
    // Legs – ninja stance
    c.fillStyle = "#064e3b";
    c.fillRect(cx - 12, h * 0.66, 8, h * 0.27);
    c.fillRect(cx + 4, h * 0.66, 8, h * 0.27);
    // Boots – sleek
    c.fillStyle = "#047857";
    c.fillRect(cx - 14, h * 0.89, 12, 8);
    c.fillRect(cx + 2, h * 0.89, 12, 8);
    // Torso – lean ninja armor
    const tg = c.createLinearGradient(cx - 18, h * 0.26, cx + 18, h * 0.64);
    tg.addColorStop(0, "#10b981");
    tg.addColorStop(0.5, "#059669");
    tg.addColorStop(1, "#064e3b");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 18, h * 0.34);
    c.lineTo(cx + 18, h * 0.34);
    c.lineTo(cx + 15, h * 0.64);
    c.lineTo(cx - 15, h * 0.64);
    c.closePath();
    c.fill();
    // Shoulder guards – angular
    c.fillStyle = "#34d399";
    c.beginPath(); c.moveTo(cx - 30, h * 0.34); c.lineTo(cx - 18, h * 0.3);
    c.lineTo(cx - 18, h * 0.38); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + 30, h * 0.34); c.lineTo(cx + 18, h * 0.3);
    c.lineTo(cx + 18, h * 0.38); c.closePath(); c.fill();
    // Helmet – angular ninja
    c.fillStyle = "#065f46";
    c.beginPath();
    c.moveTo(cx, h * 0.08);
    c.lineTo(cx + 18, h * 0.2);
    c.lineTo(cx + 14, h * 0.28);
    c.lineTo(cx - 14, h * 0.28);
    c.lineTo(cx - 18, h * 0.2);
    c.closePath();
    c.fill();
    // Visor – teal glow
    c.fillStyle = "#5eead4";
    c.fillRect(cx - 11, h * 0.19, 22, 4);
    // Scarf/cloak trailing
    c.fillStyle = "rgba(16,185,129,0.4)";
    c.beginPath();
    c.moveTo(cx - 15, h * 0.64);
    c.quadraticCurveTo(cx, h * 0.72, cx + 15, h * 0.64);
    c.lineTo(cx + 10, h * 0.76);
    c.quadraticCurveTo(cx, h * 0.8, cx - 10, h * 0.76);
    c.closePath();
    c.fill();
    // Arms – thin ninja
    c.fillStyle = "#059669";
    c.fillRect(cx - 28, h * 0.37, 10, 22);
    c.fillRect(cx + 18, h * 0.37, 10, 22);
    // Glow
    c.globalAlpha = 0.2;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 38);
    gg.addColorStop(0, "#6ee7b7"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  emerald_phantom_walk_2: [100, 115, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#064e3b";
    c.save(); c.translate(cx + 5, h * 0.66); c.rotate(0.25);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#065f46";
    c.save(); c.translate(cx - 5, h * 0.66); c.rotate(-0.25);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#047857";
    c.fillRect(cx - 18, h * 0.88, 12, 8);
    c.fillRect(cx + 8, h * 0.88, 12, 8);
    const tg = c.createLinearGradient(cx - 18, h * 0.26, cx + 18, h * 0.64);
    tg.addColorStop(0, "#10b981"); tg.addColorStop(0.5, "#059669"); tg.addColorStop(1, "#064e3b");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 18, h * 0.34); c.lineTo(cx + 18, h * 0.34);
    c.lineTo(cx + 15, h * 0.64); c.lineTo(cx - 15, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#34d399";
    c.beginPath(); c.moveTo(cx - 30, h * 0.34); c.lineTo(cx - 18, h * 0.3);
    c.lineTo(cx - 18, h * 0.38); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + 30, h * 0.34); c.lineTo(cx + 18, h * 0.3);
    c.lineTo(cx + 18, h * 0.38); c.closePath(); c.fill();
    c.fillStyle = "#065f46";
    c.beginPath();
    c.moveTo(cx, h * 0.08); c.lineTo(cx + 18, h * 0.2);
    c.lineTo(cx + 14, h * 0.28); c.lineTo(cx - 14, h * 0.28);
    c.lineTo(cx - 18, h * 0.2); c.closePath(); c.fill();
    c.fillStyle = "#5eead4";
    c.fillRect(cx - 11, h * 0.19, 22, 4);
    c.fillStyle = "#059669";
    c.save(); c.translate(cx - 26, h * 0.38); c.rotate(0.3);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.save(); c.translate(cx + 26, h * 0.38); c.rotate(-0.3);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.globalAlpha = 0.2;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 38);
    gg.addColorStop(0, "#6ee7b7"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  emerald_phantom_walk_3: [100, 115, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#065f46";
    c.save(); c.translate(cx - 7, h * 0.66); c.rotate(-0.4);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#064e3b";
    c.save(); c.translate(cx + 7, h * 0.66); c.rotate(0.4);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#047857";
    c.fillRect(cx - 22, h * 0.86, 12, 8);
    c.fillRect(cx + 12, h * 0.86, 12, 8);
    const tg = c.createLinearGradient(cx - 18, h * 0.26, cx + 18, h * 0.64);
    tg.addColorStop(0, "#10b981"); tg.addColorStop(0.5, "#059669"); tg.addColorStop(1, "#064e3b");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 17, h * 0.33); c.lineTo(cx + 19, h * 0.35);
    c.lineTo(cx + 16, h * 0.64); c.lineTo(cx - 14, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#34d399";
    c.beginPath(); c.moveTo(cx - 29, h * 0.33); c.lineTo(cx - 17, h * 0.29);
    c.lineTo(cx - 17, h * 0.37); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + 31, h * 0.35); c.lineTo(cx + 19, h * 0.31);
    c.lineTo(cx + 19, h * 0.39); c.closePath(); c.fill();
    c.fillStyle = "#065f46";
    c.beginPath();
    c.moveTo(cx + 1, h * 0.08); c.lineTo(cx + 19, h * 0.2);
    c.lineTo(cx + 15, h * 0.28); c.lineTo(cx - 13, h * 0.28);
    c.lineTo(cx - 17, h * 0.2); c.closePath(); c.fill();
    c.fillStyle = "#5eead4";
    c.fillRect(cx - 10, h * 0.19, 22, 4);
    c.fillStyle = "#059669";
    c.save(); c.translate(cx - 25, h * 0.38); c.rotate(0.5);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.save(); c.translate(cx + 25, h * 0.38); c.rotate(-0.5);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.globalAlpha = 0.25;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 42);
    gg.addColorStop(0, "#6ee7b7"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],
  emerald_phantom_walk_4: [100, 115, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#064e3b";
    c.save(); c.translate(cx - 5, h * 0.66); c.rotate(0.25);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#065f46";
    c.save(); c.translate(cx + 5, h * 0.66); c.rotate(-0.25);
    c.fillRect(-4, 0, 8, h * 0.25); c.restore();
    c.fillStyle = "#047857";
    c.fillRect(cx - 8, h * 0.88, 12, 8);
    c.fillRect(cx + 2, h * 0.88, 12, 8);
    const tg = c.createLinearGradient(cx - 18, h * 0.26, cx + 18, h * 0.64);
    tg.addColorStop(0, "#10b981"); tg.addColorStop(0.5, "#059669"); tg.addColorStop(1, "#064e3b");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 18, h * 0.34); c.lineTo(cx + 18, h * 0.34);
    c.lineTo(cx + 15, h * 0.64); c.lineTo(cx - 15, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#34d399";
    c.beginPath(); c.moveTo(cx - 30, h * 0.34); c.lineTo(cx - 18, h * 0.3);
    c.lineTo(cx - 18, h * 0.38); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + 30, h * 0.34); c.lineTo(cx + 18, h * 0.3);
    c.lineTo(cx + 18, h * 0.38); c.closePath(); c.fill();
    c.fillStyle = "#065f46";
    c.beginPath();
    c.moveTo(cx, h * 0.08); c.lineTo(cx + 18, h * 0.2);
    c.lineTo(cx + 14, h * 0.28); c.lineTo(cx - 14, h * 0.28);
    c.lineTo(cx - 18, h * 0.2); c.closePath(); c.fill();
    c.fillStyle = "#5eead4";
    c.fillRect(cx - 11, h * 0.19, 22, 4);
    c.fillStyle = "#059669";
    c.save(); c.translate(cx - 26, h * 0.38); c.rotate(-0.3);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.save(); c.translate(cx + 26, h * 0.38); c.rotate(0.3);
    c.fillRect(-5, 0, 10, 20); c.restore();
    c.globalAlpha = 0.2;
    const gg = c.createRadialGradient(cx, h * 0.5, 5, cx, h * 0.5, 38);
    gg.addColorStop(0, "#6ee7b7"); gg.addColorStop(1, "transparent");
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],

  /* ================================================================
   *  B) UNIQUE ENEMY TEXTURES
   * ================================================================ */
  bomber_body: [165, 85, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    // Main round body
    const bg = c.createRadialGradient(cx, cy, 10, cx, cy, cx * 0.7);
    bg.addColorStop(0, "#ff6b35");
    bg.addColorStop(0.4, "#c2410c");
    bg.addColorStop(0.8, "#7c2d12");
    bg.addColorStop(1, "#431407");
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(cx, cy, cx * 0.55, cy * 0.75, 0, 0, Math.PI * 2);
    c.fill();
    // Heavy armor plates – left/right
    c.fillStyle = "#57534e";
    c.beginPath();
    c.moveTo(cx - 50, cy - 20);
    c.lineTo(cx - 35, cy - 32);
    c.lineTo(cx - 20, cy - 20);
    c.lineTo(cx - 20, cy + 20);
    c.lineTo(cx - 35, cy + 32);
    c.lineTo(cx - 50, cy + 20);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(cx + 50, cy - 20);
    c.lineTo(cx + 35, cy - 32);
    c.lineTo(cx + 20, cy - 20);
    c.lineTo(cx + 20, cy + 20);
    c.lineTo(cx + 35, cy + 32);
    c.lineTo(cx + 50, cy + 20);
    c.closePath();
    c.fill();
    // Glowing core
    const coreG = c.createRadialGradient(cx, cy, 2, cx, cy, 18);
    coreG.addColorStop(0, "#fff7ed");
    coreG.addColorStop(0.3, "#fdba74");
    coreG.addColorStop(0.7, "#ea580c");
    coreG.addColorStop(1, "rgba(234,88,12,0)");
    c.fillStyle = coreG;
    c.beginPath();
    c.arc(cx, cy, 18, 0, Math.PI * 2);
    c.fill();
    // Eye slit
    c.fillStyle = "#fef3c7";
    c.fillRect(cx - 14, cy - 3, 28, 6);
    // Bomb racks (small circles on bottom)
    c.fillStyle = "#78716c";
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.arc(cx + i * 14, cy + 28, 5, 0, Math.PI * 2);
      c.fill();
    }
    // Glow aura
    c.globalAlpha = 0.15;
    const ag = c.createRadialGradient(cx, cy, 20, cx, cy, cx * 0.8);
    ag.addColorStop(0, "#fb923c"); ag.addColorStop(1, "transparent");
    c.fillStyle = ag; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }],

  sniper_body: [189, 96, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    // Sleek elongated body
    const bg = c.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, "#1e1b4b");
    bg.addColorStop(0.3, "#4c1d95");
    bg.addColorStop(0.6, "#6d28d9");
    bg.addColorStop(1, "#3b0764");
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(10, cy);
    c.quadraticCurveTo(30, cy - 30, cx, cy - 24);
    c.quadraticCurveTo(w - 20, cy - 18, w - 5, cy);
    c.quadraticCurveTo(w - 20, cy + 18, cx, cy + 24);
    c.quadraticCurveTo(30, cy + 30, 10, cy);
    c.closePath();
    c.fill();
    // Scope / barrel extending forward
    c.fillStyle = "#7c3aed";
    c.fillRect(w - 40, cy - 4, 38, 8);
    // Scope lens
    c.fillStyle = "#a78bfa";
    c.beginPath();
    c.arc(w - 5, cy, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e9d5ff";
    c.beginPath();
    c.arc(w - 5, cy, 3, 0, Math.PI * 2);
    c.fill();
    // Rear stabilizer fins
    c.fillStyle = "#5b21b6";
    c.beginPath();
    c.moveTo(15, cy - 10);
    c.lineTo(5, cy - 35);
    c.lineTo(30, cy - 15);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(15, cy + 10);
    c.lineTo(5, cy + 35);
    c.lineTo(30, cy + 15);
    c.closePath();
    c.fill();
    // Eye
    c.fillStyle = "#c084fc";
    c.beginPath();
    c.ellipse(cx - 10, cy, 8, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f5f3ff";
    c.beginPath();
    c.arc(cx - 10, cy, 2.5, 0, Math.PI * 2);
    c.fill();
    // Hull detail lines
    c.strokeStyle = "#a78bfa";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(40, cy - 18); c.lineTo(w - 50, cy - 16);
    c.moveTo(40, cy + 18); c.lineTo(w - 50, cy + 16);
    c.stroke();
    // Laser sight beam hint
    c.globalAlpha = 0.3;
    c.strokeStyle = "#e879f9";
    c.lineWidth = 1.5;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.moveTo(w - 2, cy);
    c.lineTo(w + 20, cy);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }],

  drone_body: [189, 96, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    // Central body – compact
    const bg = c.createRadialGradient(cx, cy, 5, cx, cy, 30);
    bg.addColorStop(0, "#166534");
    bg.addColorStop(0.6, "#14532d");
    bg.addColorStop(1, "#052e16");
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(cx, cy, 24, 18, 0, 0, Math.PI * 2);
    c.fill();
    // Quad rotor arms
    c.strokeStyle = "#15803d";
    c.lineWidth = 4;
    const rotorPositions: [number, number][] = [
      [cx - 50, cy - 24], [cx + 50, cy - 24],
      [cx - 50, cy + 24], [cx + 50, cy + 24],
    ];
    for (const [rx, ry] of rotorPositions) {
      c.beginPath();
      c.moveTo(cx + (rx < cx ? -20 : 20), cy + (ry < cy ? -14 : 14));
      c.lineTo(rx, ry);
      c.stroke();
    }
    // Rotors – spinning discs
    c.globalAlpha = 0.5;
    c.fillStyle = "#4ade80";
    for (const [rx, ry] of rotorPositions) {
      c.beginPath();
      c.ellipse(rx, ry, 22, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // Energy wings (connecting rotors with glow)
    c.globalAlpha = 0.2;
    c.fillStyle = "#86efac";
    c.beginPath();
    c.moveTo(cx - 50, cy - 24);
    c.lineTo(cx, cy);
    c.lineTo(cx - 50, cy + 24);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(cx + 50, cy - 24);
    c.lineTo(cx, cy);
    c.lineTo(cx + 50, cy + 24);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    // Central eye
    c.fillStyle = "#22c55e";
    c.beginPath();
    c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#bbf7d0";
    c.beginPath();
    c.arc(cx, cy, 3, 0, Math.PI * 2);
    c.fill();
    // Hull lines
    c.strokeStyle = "#16a34a";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(cx, cy, 30, 22, 0, 0, Math.PI * 2);
    c.stroke();
  }],

  /* ================================================================
   *  E) AEGIS PRIME – large armored sentinel
   * ================================================================ */
  aegis_prime_body: [177, 180, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    // Main body – hexagonal heavy armor
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#0e7490");
    bg.addColorStop(0.5, "#155e75");
    bg.addColorStop(1, "#164e63");
    c.fillStyle = bg;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + 55 * Math.cos(a);
      const py = cy + 60 * Math.sin(a);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    // Outer armor shell
    c.strokeStyle = "#22d3ee";
    c.lineWidth = 3;
    c.stroke();
    // Inner hex
    c.strokeStyle = "#67e8f9";
    c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + 38 * Math.cos(a);
      const py = cy + 42 * Math.sin(a);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
    // Energy shield glow surrounding
    c.globalAlpha = 0.15;
    const sg = c.createRadialGradient(cx, cy, 40, cx, cy, 85);
    sg.addColorStop(0, "#06b6d4");
    sg.addColorStop(1, "transparent");
    c.fillStyle = sg;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
    // Shield arcs – left and right
    c.strokeStyle = "rgba(34,211,238,0.6)";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx - 65, cy, 30, -0.8, 0.8);
    c.stroke();
    c.beginPath();
    c.arc(cx + 65, cy, 30, Math.PI - 0.8, Math.PI + 0.8);
    c.stroke();
    // Central eye / core
    const eg = c.createRadialGradient(cx, cy - 8, 2, cx, cy - 8, 16);
    eg.addColorStop(0, "#ecfeff");
    eg.addColorStop(0.4, "#22d3ee");
    eg.addColorStop(1, "rgba(34,211,238,0)");
    c.fillStyle = eg;
    c.beginPath();
    c.arc(cx, cy - 8, 16, 0, Math.PI * 2);
    c.fill();
    // Legs – heavy
    c.fillStyle = "#0e7490";
    c.fillRect(cx - 28, cy + 50, 16, 35);
    c.fillRect(cx + 12, cy + 50, 16, 35);
    // Feet
    c.fillStyle = "#155e75";
    c.fillRect(cx - 32, h - 10, 24, 10);
    c.fillRect(cx + 8, h - 10, 24, 10);
    // Shoulder turrets
    c.fillStyle = "#0891b2";
    c.beginPath(); c.arc(cx - 50, cy - 30, 14, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 50, cy - 30, 14, 0, Math.PI * 2); c.fill();
    // Turret barrels
    c.fillStyle = "#155e75";
    c.fillRect(cx - 54, cy - 50, 8, 20);
    c.fillRect(cx + 46, cy - 50, 8, 20);
    // Detail accents
    c.strokeStyle = "#67e8f9";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - 20, cy + 10); c.lineTo(cx - 20, cy + 45);
    c.moveTo(cx + 20, cy + 10); c.lineTo(cx + 20, cy + 45);
    c.stroke();
  }],

  /* ================================================================
   *  F) ARCHON ZERO – massive cosmic horror entity
   * ================================================================ */
  archon_zero_body: [260, 320, (c, w, h) => {
    const cx = w / 2, cy = h * 0.4;
    // Void aura background
    c.globalAlpha = 0.3;
    const aura = c.createRadialGradient(cx, cy, 20, cx, cy, 150);
    aura.addColorStop(0, "#a855f7");
    aura.addColorStop(0.5, "#6b21a8");
    aura.addColorStop(1, "transparent");
    c.fillStyle = aura;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
    // Tentacles / tendrils – 8 of them spreading down
    c.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const baseAngle = (i / 8) * Math.PI * 0.8 + Math.PI * 0.6;
      const tg = c.createLinearGradient(cx, cy + 40, cx + Math.cos(baseAngle) * 120, h);
      tg.addColorStop(0, "#a855f7");
      tg.addColorStop(0.5, "#7e22ce");
      tg.addColorStop(1, "#3b0764");
      c.strokeStyle = tg;
      c.lineWidth = 6 - i * 0.3;
      c.beginPath();
      c.moveTo(cx + (i - 4) * 10, cy + 50);
      const cp1x = cx + (i - 4) * 25 + Math.sin(i * 1.5) * 20;
      const cp1y = cy + 100 + Math.cos(i * 2) * 20;
      const endX = cx + (i - 4) * 28 + Math.sin(i * 2.3) * 30;
      const endY = h - 10 + Math.sin(i) * 15;
      c.quadraticCurveTo(cp1x, cp1y, endX, endY);
      c.stroke();
    }
    // Main body mass – upper
    const bodyG = c.createRadialGradient(cx, cy, 15, cx, cy, 80);
    bodyG.addColorStop(0, "#0a0a0a");
    bodyG.addColorStop(0.3, "#1e1b4b");
    bodyG.addColorStop(0.6, "#581c87");
    bodyG.addColorStop(1, "#3b0764");
    c.fillStyle = bodyG;
    c.beginPath();
    c.ellipse(cx, cy, 75, 60, 0, 0, Math.PI * 2);
    c.fill();
    // Shoulder/crown spikes
    c.fillStyle = "#7c3aed";
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 55, cy + Math.sin(a) * 44);
      c.lineTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 72 - 15);
      c.lineTo(cx + Math.cos(a + 0.15) * 50, cy + Math.sin(a + 0.15) * 40);
      c.closePath();
      c.fill();
    }
    // Event horizon core
    const ehG = c.createRadialGradient(cx, cy, 3, cx, cy, 32);
    ehG.addColorStop(0, "#000000");
    ehG.addColorStop(0.5, "#0a0a0a");
    ehG.addColorStop(0.7, "#6b21a8");
    ehG.addColorStop(0.85, "#d946ef");
    ehG.addColorStop(1, "rgba(217,70,239,0)");
    c.fillStyle = ehG;
    c.beginPath();
    c.arc(cx, cy, 32, 0, Math.PI * 2);
    c.fill();
    // Photon ring around core
    c.strokeStyle = "#e879f9";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(cx, cy, 28, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "#f0abfc";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, 34, 0, Math.PI * 2);
    c.stroke();
    // Eyes – three menacing eyes
    c.fillStyle = "#d946ef";
    c.beginPath(); c.ellipse(cx - 22, cy - 8, 7, 4, -0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 22, cy - 8, 7, 4, 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx, cy - 28, 5, 3, 0, 0, Math.PI * 2); c.fill();
    // Eye pupils
    c.fillStyle = "#faf5ff";
    c.beginPath(); c.arc(cx - 22, cy - 8, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 22, cy - 8, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx, cy - 28, 1.5, 0, Math.PI * 2); c.fill();
    // Energy particles floating around
    c.globalAlpha = 0.6;
    c.fillStyle = "#c084fc";
    for (let i = 0; i < 15; i++) {
      const px = cx + Math.sin(i * 2.7) * (60 + i * 5);
      const py = cy + Math.cos(i * 3.1) * (50 + i * 4);
      c.beginPath();
      c.arc(px, py, 1.5 + (i % 3), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }],

  /* ================================================================
   *  G) OBSIDIAN WARDEN TEXTURES (10 total)
   * ================================================================ */
  ow_idle: [88, 108, (c, w, h) => {
    const cx = w / 2;
    // Legs – thick stone
    c.fillStyle = "#57534e";
    c.fillRect(cx - 14, h * 0.65, 12, h * 0.28);
    c.fillRect(cx + 2, h * 0.65, 12, h * 0.28);
    // Stone boots
    c.fillStyle = "#78716c";
    c.fillRect(cx - 16, h * 0.88, 16, 10);
    c.fillRect(cx, h * 0.88, 16, 10);
    // Torso – massive stone armor
    const tg = c.createLinearGradient(cx - 24, h * 0.25, cx + 24, h * 0.65);
    tg.addColorStop(0, "#a16207");
    tg.addColorStop(0.3, "#78716c");
    tg.addColorStop(0.7, "#57534e");
    tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 26, h * 0.32);
    c.lineTo(cx + 26, h * 0.32);
    c.lineTo(cx + 22, h * 0.65);
    c.lineTo(cx - 22, h * 0.65);
    c.closePath();
    c.fill();
    // Stone plate cracks
    c.strokeStyle = "#292524";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - 10, h * 0.38); c.lineTo(cx - 5, h * 0.5);
    c.lineTo(cx - 12, h * 0.6);
    c.moveTo(cx + 8, h * 0.4); c.lineTo(cx + 14, h * 0.52);
    c.stroke();
    // Shoulder boulders
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 28, h * 0.32, 14, 10, -0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 28, h * 0.32, 14, 10, 0.2, 0, Math.PI * 2); c.fill();
    // Head – blocky stone helmet
    c.fillStyle = "#57534e";
    c.fillRect(cx - 14, h * 0.1, 28, 24);
    // Visor – gold glow
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, h * 0.17, 20, 5);
    // Gold accent line
    c.strokeStyle = "#d97706";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, h * 0.37); c.lineTo(cx, h * 0.6);
    c.stroke();
    // Arms – stone gauntlets
    c.fillStyle = "#78716c";
    c.fillRect(cx - 38, h * 0.35, 14, 26);
    c.fillRect(cx + 24, h * 0.35, 14, 26);
  }],

  ow_jump: [107, 112, (c, w, h) => {
    const cx = w / 2;
    // Legs tucked up
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx - 10, h * 0.65); c.rotate(-0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    c.save(); c.translate(cx + 10, h * 0.65); c.rotate(0.5);
    c.fillRect(-6, 0, 12, 22); c.restore();
    // Torso
    const tg = c.createLinearGradient(cx - 24, h * 0.2, cx + 24, h * 0.6);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.4, "#78716c");
    tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 26, h * 0.3); c.lineTo(cx + 26, h * 0.3);
    c.lineTo(cx + 22, h * 0.63); c.lineTo(cx - 22, h * 0.63);
    c.closePath(); c.fill();
    // Crack details
    c.strokeStyle = "#292524"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - 8, h * 0.36); c.lineTo(cx - 3, h * 0.48); c.stroke();
    // Shoulders
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 28, h * 0.3, 14, 10, -0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 28, h * 0.3, 14, 10, 0.2, 0, Math.PI * 2); c.fill();
    // Arms raised – stone gauntlets up
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx - 34, h * 0.28); c.rotate(-0.8);
    c.fillRect(-7, -20, 14, 26); c.restore();
    c.save(); c.translate(cx + 34, h * 0.28); c.rotate(0.8);
    c.fillRect(-7, -20, 14, 26); c.restore();
    // Head
    c.fillStyle = "#57534e";
    c.fillRect(cx - 14, h * 0.08, 28, 24);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, h * 0.15, 20, 5);
    // Gold accent
    c.strokeStyle = "#d97706"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, h * 0.35); c.lineTo(cx, h * 0.58); c.stroke();
  }],

  ow_attack_slash: [154, 158, (c, w, h) => {
    const cx = w * 0.4, cy = h * 0.5;
    // Legs braced
    c.fillStyle = "#57534e";
    c.fillRect(cx - 14, cy + 20, 12, 40);
    c.fillRect(cx + 4, cy + 20, 12, 40);
    c.fillStyle = "#78716c";
    c.fillRect(cx - 16, cy + 55, 16, 10);
    c.fillRect(cx + 2, cy + 55, 16, 10);
    // Torso
    const tg = c.createLinearGradient(cx - 26, cy - 40, cx + 26, cy + 20);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.5, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 26, cy - 28); c.lineTo(cx + 26, cy - 28);
    c.lineTo(cx + 22, cy + 20); c.lineTo(cx - 22, cy + 20);
    c.closePath(); c.fill();
    // Head
    c.fillStyle = "#57534e";
    c.fillRect(cx - 14, cy - 52, 28, 24);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 10, cy - 45, 20, 5);
    // Shoulders
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 28, cy - 28, 14, 10, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 28, cy - 28, 14, 10, 0, 0, Math.PI * 2); c.fill();
    // Right arm extended with rock mace – wide swing
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx + 30, cy - 20); c.rotate(-0.6);
    c.fillRect(0, -5, 50, 10);
    // Mace head
    c.fillStyle = "#92400e";
    c.beginPath(); c.arc(55, 0, 14, 0, Math.PI * 2); c.fill();
    // Mace spikes
    c.fillStyle = "#a16207";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(55 + Math.cos(a) * 12, Math.sin(a) * 12);
      c.lineTo(55 + Math.cos(a) * 20, Math.sin(a) * 20);
      c.lineTo(55 + Math.cos(a + 0.3) * 12, Math.sin(a + 0.3) * 12);
      c.closePath(); c.fill();
    }
    c.restore();
    // Left arm guard
    c.fillStyle = "#78716c";
    c.fillRect(cx - 42, cy - 22, 14, 26);
    // Slash trail
    c.globalAlpha = 0.3;
    c.strokeStyle = "#fbbf24"; c.lineWidth = 3;
    c.beginPath();
    c.arc(cx + 60, cy - 20, 50, -1.2, 0.8);
    c.stroke();
    c.globalAlpha = 1;
  }],

  ow_attack_blast: [217, 135, (c, w, h) => {
    const cx = w * 0.3, cy = h / 2;
    // Legs
    c.fillStyle = "#57534e";
    c.fillRect(cx - 12, cy + 15, 11, 32);
    c.fillRect(cx + 3, cy + 15, 11, 32);
    c.fillStyle = "#78716c";
    c.fillRect(cx - 14, cy + 42, 15, 8);
    c.fillRect(cx + 1, cy + 42, 15, 8);
    // Torso – leaning forward
    const tg = c.createLinearGradient(cx - 24, cy - 36, cx + 24, cy + 15);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.5, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 24, cy - 24); c.lineTo(cx + 24, cy - 24);
    c.lineTo(cx + 20, cy + 15); c.lineTo(cx - 20, cy + 15);
    c.closePath(); c.fill();
    // Head
    c.fillStyle = "#57534e";
    c.fillRect(cx - 12, cy - 46, 26, 22);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 8, cy - 40, 18, 5);
    // Shoulders
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 26, cy - 24, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 26, cy - 24, 13, 9, 0, 0, Math.PI * 2); c.fill();
    // Arms thrusting forward
    c.fillStyle = "#78716c";
    c.fillRect(cx + 24, cy - 16, 40, 10);
    // Earth spike extending forward
    const spikeG = c.createLinearGradient(cx + 60, cy, w, cy);
    spikeG.addColorStop(0, "#92400e"); spikeG.addColorStop(0.5, "#a16207"); spikeG.addColorStop(1, "#d97706");
    c.fillStyle = spikeG;
    c.beginPath();
    c.moveTo(cx + 64, cy - 20);
    c.lineTo(w - 5, cy - 4);
    c.lineTo(w, cy);
    c.lineTo(w - 5, cy + 4);
    c.lineTo(cx + 64, cy + 10);
    c.closePath();
    c.fill();
    // Spike fragments
    c.fillStyle = "#78716c";
    for (let i = 0; i < 4; i++) {
      const fx = cx + 80 + i * 25;
      const fy = cy - 24 - i * 3;
      c.beginPath();
      c.moveTo(fx, fy); c.lineTo(fx + 8, fy - 10); c.lineTo(fx + 10, fy + 2);
      c.closePath(); c.fill();
    }
    // Impact glow
    c.globalAlpha = 0.25;
    const ig = c.createRadialGradient(w - 10, cy, 3, w - 10, cy, 30);
    ig.addColorStop(0, "#fbbf24"); ig.addColorStop(1, "transparent");
    c.fillStyle = ig; c.fillRect(w - 40, cy - 30, 40, 60);
    c.globalAlpha = 1;
  }],

  ow_dash: [196, 118, (c, w, h) => {
    const cx = w * 0.45, cy = h / 2;
    // Motion blur lines behind
    c.globalAlpha = 0.2;
    c.strokeStyle = "#a8a29e";
    c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(5, cy - 20 + i * 10);
      c.lineTo(cx - 40, cy - 18 + i * 9);
      c.stroke();
    }
    c.globalAlpha = 1;
    // Legs – running low
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx - 5, cy + 15); c.rotate(-0.6);
    c.fillRect(-6, 0, 12, 30); c.restore();
    c.save(); c.translate(cx + 10, cy + 15); c.rotate(0.3);
    c.fillRect(-6, 0, 12, 30); c.restore();
    // Torso – low charging
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.2);
    const tg = c.createLinearGradient(-26, -28, 26, 15);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.5, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-26, -24); c.lineTo(26, -24);
    c.lineTo(22, 15); c.lineTo(-22, 15);
    c.closePath(); c.fill();
    c.restore();
    // Head ducked
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx + 5, cy - 30); c.rotate(-0.2);
    c.fillRect(-12, -10, 26, 20); c.restore();
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 5, cy - 36, 18, 4);
    // Shoulder armor – prominent forward shoulder
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx + 32, cy - 18, 18, 12, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx - 24, cy - 14, 12, 9, 0, 0, Math.PI * 2); c.fill();
    // Arms
    c.fillStyle = "#78716c";
    c.fillRect(cx + 26, cy - 10, 30, 10);
    c.fillRect(cx - 36, cy - 8, 14, 22);
    // Dust cloud
    c.globalAlpha = 0.3;
    c.fillStyle = "#a8a29e";
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.arc(15 + i * 8, cy + 20 + Math.sin(i) * 8, 6 + i, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }],

  ow_hit_reaction: [116, 129, (c, w, h) => {
    const cx = w / 2, cy = h * 0.45;
    // Legs stumbling
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx - 10, cy + 25); c.rotate(0.15);
    c.fillRect(-6, 0, 12, 34); c.restore();
    c.save(); c.translate(cx + 10, cy + 25); c.rotate(-0.3);
    c.fillRect(-6, 0, 12, 34); c.restore();
    c.fillStyle = "#78716c";
    c.fillRect(cx - 18, h - 12, 15, 10);
    c.fillRect(cx + 6, h - 14, 15, 10);
    // Torso recoiling back
    c.save();
    c.translate(cx, cy);
    c.rotate(0.15);
    const tg = c.createLinearGradient(-24, -26, 24, 20);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.5, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-24, -22); c.lineTo(24, -22);
    c.lineTo(20, 20); c.lineTo(-20, 20);
    c.closePath(); c.fill();
    c.restore();
    // Crack effects on armor
    c.strokeStyle = "#fbbf24"; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx - 5, cy - 10); c.lineTo(cx - 15, cy + 5);
    c.lineTo(cx - 8, cy + 15);
    c.moveTo(cx + 3, cy - 8); c.lineTo(cx + 12, cy + 10);
    c.stroke();
    // Head tilted back
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx - 2, cy - 28); c.rotate(0.2);
    c.fillRect(-13, -10, 26, 22); c.restore();
    c.fillStyle = "#fbbf24";
    c.save(); c.translate(cx - 2, cy - 28); c.rotate(0.2);
    c.fillRect(-9, -4, 18, 4); c.restore();
    // Shoulders
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 26, cy - 16, 13, 9, 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 28, cy - 18, 13, 9, -0.1, 0, Math.PI * 2); c.fill();
    // Arms flailing
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx - 30, cy - 10); c.rotate(0.6);
    c.fillRect(-6, 0, 12, 24); c.restore();
    c.save(); c.translate(cx + 30, cy - 12); c.rotate(-0.4);
    c.fillRect(-6, 0, 12, 24); c.restore();
    // Stone debris particles
    c.fillStyle = "#a8a29e";
    c.globalAlpha = 0.6;
    for (let i = 0; i < 8; i++) {
      const px = cx + Math.sin(i * 3.7) * 35;
      const py = cy + Math.cos(i * 2.3) * 30;
      c.fillRect(px - 2, py - 2, 4 + (i % 3), 3 + (i % 2));
    }
    c.globalAlpha = 1;
  }],

  ow_walk_1: [99, 108, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#57534e";
    c.fillRect(cx - 13, h * 0.65, 11, h * 0.27);
    c.fillRect(cx + 2, h * 0.65, 11, h * 0.27);
    c.fillStyle = "#78716c";
    c.fillRect(cx - 15, h * 0.88, 15, 9);
    c.fillRect(cx, h * 0.88, 15, 9);
    const tg = c.createLinearGradient(cx - 24, h * 0.25, cx + 24, h * 0.65);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.4, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 24, h * 0.33); c.lineTo(cx + 24, h * 0.33);
    c.lineTo(cx + 20, h * 0.64); c.lineTo(cx - 20, h * 0.64);
    c.closePath(); c.fill();
    c.strokeStyle = "#292524"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - 8, h * 0.38); c.lineTo(cx - 3, h * 0.5); c.stroke();
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#57534e";
    c.fillRect(cx - 13, h * 0.1, 26, 22);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 9, h * 0.17, 18, 4);
    c.fillStyle = "#78716c";
    c.fillRect(cx - 36, h * 0.36, 13, 24);
    c.fillRect(cx + 23, h * 0.36, 13, 24);
    c.strokeStyle = "#d97706"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx, h * 0.37); c.lineTo(cx, h * 0.59); c.stroke();
  }],

  ow_walk_2: [99, 108, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx + 5, h * 0.65); c.rotate(0.22);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#4a3f35";
    c.save(); c.translate(cx - 5, h * 0.65); c.rotate(-0.22);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#78716c";
    c.fillRect(cx - 18, h * 0.87, 15, 9);
    c.fillRect(cx + 8, h * 0.87, 15, 9);
    const tg = c.createLinearGradient(cx - 24, h * 0.25, cx + 24, h * 0.65);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.4, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 24, h * 0.33); c.lineTo(cx + 24, h * 0.33);
    c.lineTo(cx + 20, h * 0.64); c.lineTo(cx - 20, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#57534e";
    c.fillRect(cx - 13, h * 0.1, 26, 22);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 9, h * 0.17, 18, 4);
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx - 32, h * 0.37); c.rotate(0.25);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.save(); c.translate(cx + 32, h * 0.37); c.rotate(-0.25);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.strokeStyle = "#d97706"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx, h * 0.37); c.lineTo(cx, h * 0.59); c.stroke();
  }],

  ow_walk_3: [99, 108, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#4a3f35";
    c.save(); c.translate(cx - 7, h * 0.65); c.rotate(-0.35);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx + 7, h * 0.65); c.rotate(0.35);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#78716c";
    c.fillRect(cx - 22, h * 0.85, 15, 9);
    c.fillRect(cx + 12, h * 0.85, 15, 9);
    const tg = c.createLinearGradient(cx - 24, h * 0.25, cx + 24, h * 0.65);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.4, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 23, h * 0.32); c.lineTo(cx + 25, h * 0.34);
    c.lineTo(cx + 21, h * 0.64); c.lineTo(cx - 19, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 25, h * 0.32, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 27, h * 0.34, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#57534e";
    c.fillRect(cx - 12, h * 0.1, 26, 22);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 8, h * 0.17, 18, 4);
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx - 30, h * 0.37); c.rotate(0.45);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.save(); c.translate(cx + 30, h * 0.37); c.rotate(-0.45);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.strokeStyle = "#d97706"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx + 1, h * 0.37); c.lineTo(cx + 1, h * 0.59); c.stroke();
  }],

  ow_walk_4: [99, 108, (c, w, h) => {
    const cx = w / 2;
    c.fillStyle = "#57534e";
    c.save(); c.translate(cx - 5, h * 0.65); c.rotate(0.22);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#4a3f35";
    c.save(); c.translate(cx + 5, h * 0.65); c.rotate(-0.22);
    c.fillRect(-5, 0, 11, h * 0.25); c.restore();
    c.fillStyle = "#78716c";
    c.fillRect(cx - 8, h * 0.87, 15, 9);
    c.fillRect(cx + 2, h * 0.87, 15, 9);
    const tg = c.createLinearGradient(cx - 24, h * 0.25, cx + 24, h * 0.65);
    tg.addColorStop(0, "#a16207"); tg.addColorStop(0.4, "#78716c"); tg.addColorStop(1, "#44403c");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(cx - 24, h * 0.33); c.lineTo(cx + 24, h * 0.33);
    c.lineTo(cx + 20, h * 0.64); c.lineTo(cx - 20, h * 0.64);
    c.closePath(); c.fill();
    c.fillStyle = "#92400e";
    c.beginPath(); c.ellipse(cx - 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 26, h * 0.33, 13, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#57534e";
    c.fillRect(cx - 13, h * 0.1, 26, 22);
    c.fillStyle = "#fbbf24";
    c.fillRect(cx - 9, h * 0.17, 18, 4);
    c.fillStyle = "#78716c";
    c.save(); c.translate(cx - 32, h * 0.37); c.rotate(-0.25);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.save(); c.translate(cx + 32, h * 0.37); c.rotate(0.25);
    c.fillRect(-6, 0, 13, 22); c.restore();
    c.strokeStyle = "#d97706"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx, h * 0.37); c.lineTo(cx, h * 0.59); c.stroke();
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

    // 1c. bg_orbit_mirrored (2560x720) — Earth orbit space scene
    const orbitTex = this.textures.createCanvas("bg_orbit_mirrored", 2560, 720);
    if (orbitTex) {
      const oc = orbitTex.getContext();
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
      const earthX = 950, earthY = 420, earthR = 110;
      // Earth atmosphere glow
      oc.globalAlpha = 0.15;
      const atmoG = oc.createRadialGradient(earthX, earthY, earthR, earthX, earthY, earthR + 40);
      atmoG.addColorStop(0, "#38bdf8"); atmoG.addColorStop(1, "transparent");
      oc.fillStyle = atmoG;
      oc.beginPath(); oc.arc(earthX, earthY, earthR + 40, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;
      // Earth body
      const earthG = oc.createRadialGradient(earthX - 20, earthY - 20, 10, earthX, earthY, earthR);
      earthG.addColorStop(0, "#1e40af");
      earthG.addColorStop(0.3, "#1d4ed8");
      earthG.addColorStop(0.5, "#166534");
      earthG.addColorStop(0.65, "#1e40af");
      earthG.addColorStop(0.8, "#1e3a5f");
      earthG.addColorStop(1, "#0c1426");
      oc.fillStyle = earthG;
      oc.beginPath(); oc.arc(earthX, earthY, earthR, 0, Math.PI * 2); oc.fill();
      // Continent hints
      oc.fillStyle = "#166534";
      oc.globalAlpha = 0.4;
      oc.beginPath(); oc.ellipse(earthX - 30, earthY - 20, 25, 18, 0.3, 0, Math.PI * 2); oc.fill();
      oc.beginPath(); oc.ellipse(earthX + 20, earthY + 15, 20, 30, -0.2, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;
      // Cloud wisps
      oc.globalAlpha = 0.2;
      oc.fillStyle = "#e2e8f0";
      oc.beginPath(); oc.ellipse(earthX - 15, earthY - 35, 30, 6, 0.2, 0, Math.PI * 2); oc.fill();
      oc.beginPath(); oc.ellipse(earthX + 25, earthY + 5, 25, 5, -0.3, 0, Math.PI * 2); oc.fill();
      oc.globalAlpha = 1;

      // Satellite debris scattered
      oc.fillStyle = "#64748b";
      const debrisData: [number, number, number, number, number][] = [
        [200, 150, 20, 8, 0.4],
        [350, 280, 15, 6, -0.3],
        [500, 100, 25, 5, 0.7],
        [700, 350, 18, 7, -0.5],
        [150, 450, 12, 5, 0.2],
        [600, 500, 22, 6, -0.6],
        [1050, 180, 16, 5, 0.8],
        [850, 550, 14, 4, -0.2],
      ];
      for (const [dx, dy, dw, dh, dr] of debrisData) {
        oc.save();
        oc.translate(dx, dy);
        oc.rotate(dr);
        // Main panel
        oc.fillStyle = "#475569";
        oc.fillRect(-dw / 2, -dh / 2, dw, dh);
        // Solar panel wings
        oc.fillStyle = "#1e3a5f";
        oc.fillRect(-dw / 2 - 10, -2, 10, 4);
        oc.fillRect(dw / 2, -2, 10, 4);
        // Glint
        oc.fillStyle = "rgba(255,255,255,0.4)";
        oc.fillRect(-dw / 2 + 2, -dh / 2 + 1, 4, 3);
        oc.restore();
      }

      // Mirror the left half to the right half
      oc.save();
      oc.translate(2560, 0);
      oc.scale(-1, 1);
      const halfCanvas = oc.getImageData(0, 0, halfW, 720);
      oc.restore();
      // We need to draw the left half first completely, then flip
      // Actually, re-draw mirrored: use the canvas itself
      const tempCanvas = oc.getImageData(0, 0, halfW, 720);
      oc.putImageData(tempCanvas, halfW, 0);
      // Now manually mirror the right half
      oc.save();
      oc.translate(halfW, 0);
      oc.scale(1, 1);
      // Draw left-to-right mirrored
      oc.translate(halfW, 0);
      oc.scale(-1, 1);
      oc.putImageData(tempCanvas, 0, 0);
      oc.restore();

      orbitTex.refresh();

      // Also create base non-mirrored bg_orbit (1280x720) for standard texture lookups
      const singleOrbit = this.textures.createCanvas("bg_orbit", 1280, 720);
      if (singleOrbit) {
        const soc = singleOrbit.getContext();
        const src = orbitTex.getCanvas();
        if (src) {
          soc.drawImage(src, 0, 0, halfW, 720, 0, 0, halfW, 720);
        }
        singleOrbit.refresh();
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
