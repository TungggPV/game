import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Palette } from "./Fx";
import { loadSettings } from "./settings";

/** Frame rate independent exponential decay smoothing */
export const expDecay = (current: number, target: number, decayRate: number, dt: number): number => {
  return target + (current - target) * Math.exp(-decayRate * dt);
};

export const expDecayFactor = (k: number, dt: number): number => {
  return 1 - Math.exp(-k * dt);
};

export type AfterimageSnapshot = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  texture: string;
  tint: number;
  alpha: number;
  life: number;
  maxLife: number;
  flipX: boolean;
  originX: number;
  originY: number;
  active: boolean;
};

/** Pre-allocated Ring Buffer for 8 Afterimages per Actor (Zero-GC) */
export class AfterimageRingBuffer {
  readonly pool: AfterimageSnapshot[] = [];
  private poolSize = 8;
  private head = 0;
  private ghosts: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, private depth: number) {
    for (let i = 0; i < this.poolSize; i += 1) {
      this.pool.push({
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        texture: "",
        tint: 0xffffff,
        alpha: 0,
        life: 0,
        maxLife: 0.18,
        flipX: false,
        originX: 0.5,
        originY: 1,
        active: false,
      });
      const img = this.scene.add.image(0, 0, "__WHITE").setVisible(false).setDepth(this.depth);
      img.setBlendMode(Phaser.BlendModes.ADD);
      this.ghosts.push(img);
    }
  }

  emitIntermediate(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    texture: string,
    tint: number,
    scaleX: number,
    scaleY: number,
    rotation: number,
    steps = 2,
    flipX = false,
    originX = 0.5,
    originY = 1,
  ) {
    for (let s = 1; s <= steps; s += 1) {
      const t = s / (steps + 1);
      const ix = fromX + (toX - fromX) * t;
      const iy = fromY + (toY - fromY) * t;
      this.push(ix, iy, texture, tint, scaleX, scaleY, rotation, 0.45, flipX, originX, originY);
    }
  }

  push(
    x: number,
    y: number,
    texture: string,
    tint: number,
    scaleX: number,
    scaleY: number,
    rotation: number,
    startAlpha = 0.5,
    flipX = false,
    originX = 0.5,
    originY = 1,
  ) {
    const snap = this.pool[this.head];
    snap.x = x;
    snap.y = y;
    snap.texture = texture;
    snap.tint = tint;
    snap.scaleX = scaleX;
    snap.scaleY = scaleY;
    snap.rotation = rotation;
    snap.alpha = startAlpha;
    snap.life = snap.maxLife;
    snap.flipX = flipX;
    snap.originX = originX;
    snap.originY = originY;
    snap.active = true;

    this.head = (this.head + 1) % this.poolSize;
  }

  update(dt: number) {
    for (let i = 0; i < this.poolSize; i += 1) {
      const snap = this.pool[i];
      const ghost = this.ghosts[i];
      if (!snap.active) {
        ghost.setVisible(false);
        continue;
      }
      snap.life -= dt;
      if (snap.life <= 0) {
        snap.active = false;
        ghost.setVisible(false);
        continue;
      }
      const progress = snap.life / snap.maxLife;
      ghost.setVisible(true);
      if (ghost.texture.key !== snap.texture && this.scene.textures.exists(snap.texture)) {
        ghost.setTexture(snap.texture);
      }
      ghost.setFlipX(snap.flipX);
      ghost.setOrigin(snap.originX, snap.originY);
      ghost.setPosition(snap.x, snap.y);
      ghost.setScale(snap.scaleX, snap.scaleY);
      ghost.setRotation(snap.rotation);
      ghost.setTint(snap.tint);
      ghost.setAlpha(snap.alpha * progress);
    }
  }

  destroy() {
    this.ghosts.forEach((g) => g.destroy());
    this.ghosts = [];
  }
}

/** Procedural Smear Arc Generator for Melee Attacks (Zero-GC) */
export class ProceduralSmearArc {
  private graphics: Phaser.GameObjects.Graphics;
  private life = 0;
  private maxLife = 0.12;
  private pal: Palette = { main: 0x18e6ff, light: 0xb5f6ff, dark: 0x054a6b, glow: 0x00f0ff };

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.fx + 2);
    this.graphics.setBlendMode(Phaser.BlendModes.ADD);
  }

  trigger(
    cx: number,
    cy: number,
    facing: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    pal: Palette,
  ) {
    this.pal = pal;
    this.life = this.maxLife;

    this.graphics.clear();
    const f = facing > 0 ? 1 : -1;

    // 1. Outer elemental arc (pal.main, alpha 0.45, thick)
    this.graphics.lineStyle(22, this.pal.main, 0.45);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius, startAngle, endAngle, f < 0);
    this.graphics.strokePath();

    // 2. Mid glow arc (pal.glow, alpha 0.75)
    this.graphics.lineStyle(12, this.pal.glow ?? this.pal.light, 0.75);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius + 2, startAngle, endAngle, f < 0);
    this.graphics.strokePath();

    // 3. Sharp white core (#ffffff, alpha 0.95, thin edge)
    this.graphics.lineStyle(4, 0xffffff, 0.95);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius + 4, startAngle, endAngle, f < 0);
    this.graphics.strokePath();
  }

  update(dt: number) {
    if (this.life <= 0) {
      this.graphics.clear();
      return;
    }
    this.life -= dt;
    const alpha = Math.max(0, this.life / this.maxLife);
    this.graphics.setAlpha(alpha);
  }

  destroy() {
    this.graphics.destroy();
  }
}

/** Frame Pacer for 60-144FPS Dynamic Optimization */
export class FramePacer {
  private frameTimes = new Float32Array(30);
  private head = 0;
  private count = 0;
  particleBudgetScale = 1.0;
  avgFps = 60;

  record(deltaMs: number) {
    this.frameTimes[this.head] = deltaMs;
    this.head = (this.head + 1) % 30;
    if (this.count < 30) this.count += 1;

    let sum = 0;
    for (let i = 0; i < this.count; i += 1) {
      sum += this.frameTimes[i];
    }
    const avgMs = sum / this.count;
    this.avgFps = avgMs > 0 ? 1000 / avgMs : 60;

    const settings = loadSettings();
    if (settings.graphicsQuality === "balanced" || avgMs > 16.2) {
      // Scale down particle budget if frame time dips below 60FPS
      this.particleBudgetScale = 0.55;
    } else {
      this.particleBudgetScale = 1.0;
    }
  }
}
