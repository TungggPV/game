import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Hit } from "../entities/Actor";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";

export type FieldStyle = "cage" | "spiral";

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
}
