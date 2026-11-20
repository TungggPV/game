import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Hit } from "../entities/Actor";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";

export type FieldStyle = "cage" | "spiral" | "blizzard";

export type Field = {
  owner: Hero;
  offset: number;
  x: number;
  y: number;
  radius: number;
  time: number;
  tick: number;
  acc: number;
  color: number;
  style: FieldStyle;
  hit: Hit;
  g: Phaser.GameObjects.Graphics;
  particles?: Phaser.GameObjects.Particles.ParticleEmitter;
  anchor?: { x: number; y: number };
};

export class FieldSystem {
  fields: Field[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    for (const f of this.fields) {
      f.time -= dt;
      f.acc += dt;
      if (f.style === "spiral") {
        f.x = f.owner.x + f.owner.facing * f.offset;
        f.y = f.owner.y - 70;
        if (f.anchor) {
          f.anchor.x = f.x;
          f.anchor.y = f.y;
        }
      }
      if (f.style === "blizzard") {
        for (const t of this.scene.targetsFor(f.owner)) {
          if (!t.dead && Math.abs(t.x - f.x) < f.radius * 1.15) {
            t.x += Math.sign(f.x - t.x) * 85 * dt;
          }
        }
      }
      this.drawField(f);
      if (f.acc >= f.tick) {
        f.acc = 0;
        const count = this.scene.areaHit(f.owner, f.x, f.y, f.radius, f.hit);
        if (count > 0 && f.style === "cage") {
          this.scene.fx.sparks(f.x, f.y, f.color, 1, 4, 300, 30);
          this.scene.fx.flashCore(f.x, f.y, 0.6);
        }
      }
      if (f.time <= 0) {
        f.g.destroy();
        this.scene.fx.stopTrail(f.particles, 500);
      }
    }
    this.fields = this.fields.filter((f) => f.time > 0);
  }

  clear() {
    this.fields.forEach((f) => {
      f.g.destroy();
      this.scene.fx.stopTrail(f.particles, 100);
    });
    this.fields = [];
  }

  spawnField(spec: Omit<Field, "g" | "acc" | "time"> & { duration: number }) {
    const pal = PALETTE[spec.owner.def.element];
    const g = this.scene.add.graphics().setDepth(DEPTH.fx - 1);
    let particles: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    const anchor = { x: spec.x, y: spec.y };
    if (spec.style === "spiral") {
      particles = this.scene.fx.trail(anchor, "leaf", {
        speed: { min: 60, max: 220 },
        lifespan: { min: 260, max: 480 },
        frequency: 18,
        scale: { start: 0.6, end: 0.1 },
        rotate: { start: 0, end: 360 },
        color: [pal.light, pal.main, pal.dark],
        blendMode: Phaser.BlendModes.ADD,
      });
    } else if (spec.style === "blizzard") {
      particles = this.scene.fx.trail(anchor, "shard", {
        emitZone: { type: "random", source: new Phaser.Geom.Circle(0, 0, spec.radius * 0.75) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        speedY: { min: 40, max: 160 },
        speedX: { min: -70, max: 70 },
        lifespan: { min: 320, max: 620 },
        frequency: 16,
        scale: { start: 0.7, end: 0.08 },
        rotate: { min: 0, max: 360 },
        color: [0xffffff, 0xe0faff, 0x38bdf8],
        blendMode: Phaser.BlendModes.ADD,
      });
    }
    this.fields.push({ ...spec, g, particles, anchor, time: spec.duration, acc: 0 });
  }

  private drawField(f: Field) {
    const g = f.g;
    g.clear();
    const pal = PALETTE[f.owner.def.element];
    const fade = Math.min(1, f.time * 2);
    if (f.style === "cage") {
      this.drawCage(f, fade);
      return;
    }
    if (f.style === "blizzard") {
      this.drawBlizzard(f, fade);
      return;
    }
    // Toxic Spiral: spinning vortex rings and particle orbit
    const t = this.scene.time.now / 1000;
    for (let i = 0; i < 3; i += 1) {
      const r = f.radius * (0.45 + i * 0.28);
      g.lineStyle(2 + i, i === 0 ? 0xffffff : pal.main, (0.55 - i * 0.1) * fade);
      g.strokeEllipse(f.x, f.y + Math.sin(t * 3 + i) * 6, r * 2, r * 0.55);
    }
  }

  private drawCage(f: Field, fade: number) {
    const g = f.g;
    const pal = PALETTE.volt;
    const top = f.y - 80;
    const bottom = GROUND_Y;
    const bars = 8;
    for (let i = 0; i < bars; i += 1) {
      const u = i / (bars - 1);
      const x = f.x - f.radius + u * f.radius * 2;
      const front = i % 2 === 0;
      g.lineStyle(front ? 4 : 2, front ? 0xffffff : pal.main, (front ? 0.9 : 0.45) * fade);
      g.beginPath();
      g.moveTo(x, top);
      for (let y = top; y < bottom; y += 26) g.lineTo(x + (Math.random() - 0.5) * 12, Math.min(bottom, y + 26));
      g.strokePath();
    }
    g.lineStyle(3, pal.main, 0.7 * fade).strokeEllipse(f.x, top, f.radius * 2, f.radius * 0.4);
    if (Math.random() < 0.35) {
      const a1 = Math.random() * Math.PI * 2;
      const a2 = a1 + Math.PI * (0.5 + Math.random());
      g.lineStyle(2, 0xffffff, 0.9 * fade);
      g.lineBetween(f.x + Math.cos(a1) * f.radius, f.y + Math.sin(a1) * 50, f.x + Math.cos(a2) * f.radius, f.y + Math.sin(a2) * 50);
    }
  }

  private drawBlizzard(f: Field, fade: number) {
    const g = f.g;
    const t = this.scene.time.now / 1000;
    const groundY = GROUND_Y - 2;
    g.setBlendMode(Phaser.BlendModes.ADD);
    // Rotating 6-point frost mandala at base
    g.lineStyle(2.4, 0x38bdf8, 0.72 * fade);
    g.strokeEllipse(f.x, groundY, f.radius * 2, f.radius * 0.42);
    g.lineStyle(1.6, 0xe0faff, 0.8 * fade);
    for (let i = 0; i < 6; i += 1) {
      const a = t * 1.6 + (i * Math.PI) / 3;
      const sx = f.x + Math.cos(a) * f.radius * 0.9;
      const sy = groundY + Math.sin(a) * f.radius * 0.19;
      g.lineBetween(f.x, groundY, sx, sy);
      // Crystalline ice spire around the dome perimeter
      const h = 34 + Math.sin(t * 7 + i * 1.3) * 8;
      g.fillStyle(0x7dd3fc, 0.48 * fade);
      g.fillTriangle(sx - 8, sy, sx + 8, sy, sx, sy - h);
    }
    // Cold dome halo arcs
    for (let r = 0; r < 2; r += 1) {
      g.lineStyle(1.8, r === 0 ? 0xffffff : 0x38bdf8, 0.35 * fade);
      g.strokeEllipse(f.x, f.y + 10 - r * 35, f.radius * (1.8 - r * 0.4), f.radius * 0.36);
    }
  }
}
