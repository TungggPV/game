import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Actor, Hit } from "../entities/Actor";
import { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";

export type ProjectileStyle = "plasma" | "fire" | "volt" | "wind" | "earth" | "enemy";

export type ProjectileSpec = {
  owner: Actor;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  pierce: number;
  style: ProjectileStyle;
  explodeRadius?: number;
  chain?: number;
  hit: Hit;
};

export type Projectile = ProjectileSpec & {
  parts: Phaser.GameObjects.Image[];
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  crackle?: Phaser.GameObjects.Graphics;
  life: number;
  age: number;
  hitSet: Set<Actor>;
  anchor?: { x: number; y: number };
};

export class ProjectileSystem {
  projectiles: Projectile[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    for (const p of this.projectiles) {
      p.life -= dt;
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.anchor) {
        p.anchor.x = p.x;
        p.anchor.y = p.y;
      }
      const angle = Math.atan2(p.vy, p.vx);
      const pulse = 1 + Math.sin(p.age * 40) * 0.08;
      p.parts.forEach((o, i) => {
        o.setPosition(p.x, p.y);
        if (p.style === "wind") o.setRotation((p.vx < 0 ? Math.PI : 0) + Math.sin(p.age * 30) * 0.12);
        else if (p.style === "fire") o.setRotation(p.age * 8 * (i + 1));
        else if (p.style === "earth") o.setRotation(p.age * 12);
        else o.setRotation(angle);
        if (i === 0) o.setAlpha(0.75 + Math.sin(p.age * 50) * 0.25);
      });
      if (p.style === "enemy") p.parts[2]?.setScale((p.size / 20) * 0.22 * pulse * 1.4);
      if (p.crackle) this.drawCrackle(p);

      const box = new Phaser.Geom.Rectangle(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      for (const t of this.scene.targetsFor(p.owner)) {
        if (t.dead || p.hitSet.has(t) || p.pierce <= 0) continue;
        if (!Phaser.Geom.Intersects.RectangleToRectangle(box, t.bounds())) continue;
        p.hitSet.add(t);
        p.pierce -= 1;
        const dir = Math.sign(p.vx) || 1;
        if (p.explodeRadius) {
          this.explode(p.owner, p.x, p.y, p.explodeRadius, p.hit);
          p.pierce = 0;
        } else {
          this.scene.dealDamage(p.owner, t, { ...p.hit, dir });
        }
        if (p.chain) this.chainFrom(p.owner, t, p.chain, p.hit, p.color);
      }
      const [minX, maxX] = this.scene.arenaBounds();
      if (p.pierce <= 0 || p.life <= 0 || p.x < minX - 60 || p.x > maxX + 60 || p.y > GROUND_Y) {
        if (p.explodeRadius && p.pierce > 0) this.explode(p.owner, p.x, Math.min(p.y, GROUND_Y - 20), p.explodeRadius, p.hit);
        p.life = -1;
        const pal = this.scene.paletteFor(p.owner);
        this.scene.fx.flashCore(p.x, p.y, 0.6);
        this.scene.fx.ring(p.x, p.y, pal.main, 50, 220);
        this.scene.fx.sparks(p.x, p.y, pal.main, -Math.sign(p.vx) || 1, 5, 400, 80);
        p.parts.forEach((o) => o.destroy());
        p.crackle?.destroy();
        this.scene.fx.stopTrail(p.trail, 700);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  clear() {
    this.projectiles.forEach((p) => {
      p.parts.forEach((o) => o.destroy());
      p.crackle?.destroy();
      this.scene.fx.stopTrail(p.trail, 100);
    });
    this.projectiles = [];
  }

  spawnProjectile(spec: ProjectileSpec) {
    const pal = spec.owner instanceof Hero ? PALETTE[spec.owner.def.element] : PALETTE.enemy;
    const add = (tex: string, tint: number, sx: number, sy: number, depth = DEPTH.projectile) =>
      this.scene.add.image(spec.x, spec.y, tex).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sy).setDepth(depth);
    const s = spec.size / 20;
    const parts: Phaser.GameObjects.Image[] = [];
    let trail: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    let crackle: Phaser.GameObjects.Graphics | undefined;
    const p = { x: spec.x, y: spec.y };

    switch (spec.style) {
      case "plasma":
        parts.push(add("glow", pal.main, 1.4 * s, 0.9 * s), add("streak", pal.main, 2.2 * s, 3.2 * s), add("streak", 0xffffff, 1.5 * s, 1.6 * s, DEPTH.projectile + 1));
        trail = this.scene.fx.trail(p, "streak", {
          speed: 0, lifespan: 260, frequency: 12, scale: { start: 0.9 * s, end: 0 }, alpha: { start: 0.8, end: 0 },
          color: [pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD, rotate: Math.atan2(spec.vy, spec.vx) * (180 / Math.PI),
        });
        break;
      case "fire":
        parts.push(add("glow", pal.main, 1.8 * s, 1.8 * s), add("core", pal.light, 0.9 * s, 0.9 * s, DEPTH.projectile + 1));
        trail = this.scene.fx.trail(p, "flame", {
          speedX: { min: -spec.vx * 0.15, max: -spec.vx * 0.05 }, speedY: { min: -90, max: -20 },
          lifespan: { min: 220, max: 420 }, frequency: 14, quantity: 2,
          scale: { start: 0.75 * s, end: 0.1 }, alpha: { start: 0.9, end: 0 }, rotate: { min: -20, max: 20 },
          color: [0xffffff, pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "volt":
        parts.push(add("glow", pal.main, 1.2 * s, 0.8 * s), add("streak", 0xffffff, 2.6 * s, 2 * s, DEPTH.projectile + 1));
        crackle = this.scene.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
        trail = this.scene.fx.trail(p, "dot", {
          speed: { min: 40, max: 160 }, lifespan: { min: 120, max: 260 }, frequency: 10,
          scale: { start: 0.5, end: 0 }, color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "wind":
        parts.push(add("arc", pal.main, 0.55 * s, 0.85 * s), add("arc", 0xffffff, 0.42 * s, 0.6 * s, DEPTH.projectile + 1), add("glow", pal.main, 1.2 * s, 1.6 * s));
        parts.forEach((o) => o.setRotation(spec.vx < 0 ? Math.PI : 0));
        trail = this.scene.fx.trail(p, "leaf", {
          speedX: { min: -spec.vx * 0.2, max: -spec.vx * 0.05 }, speedY: { min: -120, max: 120 },
          lifespan: { min: 300, max: 600 }, frequency: 25, scale: { start: 0.8, end: 0.2 },
          rotate: { start: 0, end: 720 }, color: [pal.light, pal.main, pal.dark], alpha: { start: 1, end: 0 },
        });
        break;
      case "earth":
        parts.push(add("core", pal.dark, 1.4 * s, 1.4 * s), add("glow", pal.main, 1.2 * s, 1.2 * s), add("ring", pal.light, 0.8 * s, 0.8 * s, DEPTH.projectile + 1));
        trail = this.scene.fx.trail(p, "shard", {
          speed: { min: 30, max: 120 }, lifespan: { min: 180, max: 320 }, frequency: 12,
          scale: { start: 0.6 * s, end: 0 }, color: [pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "enemy":
        parts.push(add("glow", pal.main, 1.2 * s, 1.2 * s), add("core", pal.light, 0.6 * s, 0.6 * s, DEPTH.projectile + 1), add("ring", pal.main, 0.22 * s, 0.22 * s));
        trail = this.scene.fx.trail(p, "dot", {
          speed: 0, lifespan: 220, frequency: 16, scale: { start: 0.9 * s, end: 0 }, color: [pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
    }
    const proj: Projectile = { ...spec, parts, trail, crackle, life: 1.6, age: 0, hitSet: new Set(), anchor: p };
    this.projectiles.push(proj);
  }

  private drawCrackle(p: Projectile) {
    const g = p.crackle!;
    g.clear();
    const pal = this.scene.paletteFor(p.owner);
    for (let k = 0; k < 3; k += 1) {
      let x = p.x;
      let y = p.y;
      const ang = Math.random() * Math.PI * 2;
      const len = 14 + Math.random() * 20;
      g.lineStyle(1.5, k === 0 ? 0xffffff : pal.main, 0.9);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 3; s += 1) {
        x += Math.cos(ang) * (len / 3) + (Math.random() - 0.5) * 8;
        y += Math.sin(ang) * (len / 3) + (Math.random() - 0.5) * 8;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  explode(attacker: Actor, x: number, y: number, radius: number, hit: Hit) {
    const pal = this.scene.paletteFor(attacker);
    this.scene.fx.explosion(x, y, pal, radius * 1.6);
    this.scene.fx.ring(x, y, pal.main, radius * 1.4, 340);
    this.scene.fx.flashCore(x, y, 1.2);
    this.scene.areaHit(attacker, x, y, radius, hit);
  }

  chainFrom(attacker: Actor, origin: Actor, remaining: number, hit: Hit, color: number) {
    const next = this.scene
      .targetsFor(attacker)
      .filter((t) => !t.dead && t !== origin && Math.hypot(t.x - origin.x, t.y - origin.y) < 320)
      .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0];
    if (!next) return;
    this.scene.fx.lightning(origin.cx, origin.cy, next.cx, next.cy, color, 1.4, 2, 220);
    this.scene.dealDamage(attacker, next, { ...hit, damage: hit.damage * 0.75, knock: 80 });
    if (remaining > 1) {
      this.scene.time.delayedCall(90, () => this.chainFrom(attacker, next, remaining - 1, hit, color));
    }
  }
}
