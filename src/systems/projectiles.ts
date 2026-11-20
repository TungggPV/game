import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Actor, Hit } from "../entities/Actor";
import { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { fxSeq, PALETTE } from "./Fx";

export type ProjectileStyle = "plasma" | "fire" | "volt" | "wind" | "earth" | "cryo" | "void" | "enemy";

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
  animKeys?: string[];
  animFps?: number;
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
      if (p.animKeys?.length && p.parts[0]) {
        const idx = Math.floor(p.age * (p.animFps ?? 20)) % p.animKeys.length;
        const tk = p.animKeys[idx];
        if (p.parts[0].texture.key !== tk && this.scene.textures.exists(tk)) p.parts[0].setTexture(tk);
      }
      const angle = Math.atan2(p.vy, p.vx);
      const pulse = 1 + Math.sin(p.age * 40) * 0.08;
      p.parts.forEach((o, i) => {
        o.setPosition(p.x, p.y);
        if (i === 0 && p.animKeys?.length) {
          if (p.style === "void") o.setRotation(Math.sin(p.age * 8) * 0.14);
          else if (p.style === "fire") o.setRotation(angle - Math.PI * 0.25);
          else if (p.style === "volt" || p.style === "earth" || p.style === "cryo") o.setRotation(angle + Math.PI * 0.5);
          else o.setRotation(angle);
          o.setAlpha(0.88 + Math.sin(p.age * 42) * 0.12);
        } else if (p.style === "enemy") {
          o.setRotation(angle);
          if (i === 0) o.setAlpha(0.75 + Math.sin(p.age * 50) * 0.25);
        }
      });
      if (p.style === "enemy") p.parts[2]?.setScale((p.size / 20) * 0.22 * pulse * 1.4);
      if (p.crackle) this.drawProjectileFx(p);

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

  deflectAt(rect: Phaser.Geom.Rectangle, hero: Hero): boolean {
    let deflected = false;
    for (const p of this.projectiles) {
      if (p.owner.team !== "hero") {
        const box = new Phaser.Geom.Rectangle(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, box)) {
          p.owner = hero;
          p.vx = -p.vx * 1.5;
          p.vy = -p.vy;
          p.hit.damage *= 1.8;
          p.hit.color = hero.def.color;
          p.hitSet.clear();
          p.parts.forEach((part) => part.setTint(hero.def.color));
          deflected = true;
          this.scene.fx.clashSpark(p.x, p.y, hero.facing);
        }
      }
    }
    return deflected;
  }

  spawnProjectile(spec: ProjectileSpec) {
    const pal = spec.owner instanceof Hero ? PALETTE[spec.owner.def.element] : PALETTE.enemy;
    const add = (tex: string, tint: number, sx: number, sy: number, depth = DEPTH.projectile) =>
      this.scene.add.image(spec.x, spec.y, tex).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sy).setDepth(depth);
    const s = spec.size / 20;
    const parts: Phaser.GameObjects.Image[] = [];
    let animKeys: string[] | undefined;
    let animFps = 20;
    let trail: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    let crackle: Phaser.GameObjects.Graphics | undefined;
    const p = { x: spec.x, y: spec.y };

    const pickTex = (keys: string[]) => {
      animKeys = keys;
      return this.scene.textures.exists(keys[0]) ? keys[0] : "streak";
    };

    switch (spec.style) {
      case "plasma":
        parts.push(
          add(pickTex(fxSeq("fx_blast_anim", 8)), pal.main, 0.44 * s, 0.36 * s, DEPTH.projectile + 1),
          add("glow", pal.main, 1.3 * s, 0.9 * s),
        );
        animFps = 28;
        trail = this.scene.fx.trail(p, "streak", {
          speed: 0, lifespan: 260, frequency: 12, scale: { start: 0.9 * s, end: 0 }, alpha: { start: 0.8, end: 0 },
          color: [pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD, rotate: Math.atan2(spec.vy, spec.vx) * (180 / Math.PI),
        });
        break;
      case "fire":
        parts.push(
          add(pickTex(fxSeq("fx_meteor", 8)), 0xffffff, 0.48 * s, 0.48 * s, DEPTH.projectile + 1),
          add("glow", pal.main, 1.7 * s, 1.7 * s),
        );
        animFps = 28;
        trail = this.scene.fx.trail(p, "flame", {
          speedX: { min: -spec.vx * 0.15, max: -spec.vx * 0.05 }, speedY: { min: -90, max: -20 },
          lifespan: { min: 220, max: 420 }, frequency: 14, quantity: 2,
          scale: { start: 0.75 * s, end: 0.1 }, alpha: { start: 0.9, end: 0 }, rotate: { min: -20, max: 20 },
          color: [0xffffff, pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "volt":
        parts.push(
          add(pickTex(fxSeq("fx_volt_bolt", 8)), pal.light, 0.36 * s, 0.46 * s, DEPTH.projectile + 1),
          add("glow", pal.main, 1.15 * s, 0.8 * s),
        );
        animFps = 30;
        crackle = this.scene.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
        trail = this.scene.fx.trail(p, "dot", {
          speed: { min: 40, max: 160 }, lifespan: { min: 120, max: 260 }, frequency: 10,
          scale: { start: 0.5, end: 0 }, color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "wind":
        parts.push(
          add(pickTex(fxSeq("fx_slash_anim", 8)), pal.main, 0.48 * s, 0.62 * s, DEPTH.projectile + 1),
          add("glow", pal.main, 1.2 * s, 1.6 * s),
        );
        animFps = 26;
        trail = this.scene.fx.trail(p, "leaf", {
          speedX: { min: -spec.vx * 0.2, max: -spec.vx * 0.05 }, speedY: { min: -120, max: 120 },
          lifespan: { min: 300, max: 600 }, frequency: 25, scale: { start: 0.8, end: 0.2 },
          rotate: { start: 0, end: 720 }, color: [pal.light, pal.main, pal.dark], alpha: { start: 1, end: 0 },
        });
        break;
      case "earth":
        parts.push(
          add(pickTex(fxSeq("fx_earth_spire", 8)), 0xffffff, 0.45 * s, 0.45 * s, DEPTH.projectile + 1).setBlendMode(Phaser.BlendModes.NORMAL),
          add("glow", pal.main, 1.2 * s, 1.2 * s),
        );
        animFps = 26;
        trail = this.scene.fx.trail(p, "shard", {
          speed: { min: 30, max: 120 }, lifespan: { min: 180, max: 320 }, frequency: 12,
          scale: { start: 0.6 * s, end: 0 }, color: [pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "cryo":
        parts.push(
          add(pickTex(fxSeq("fx_ice_monolith", 8)), 0xffffff, 0.45 * s, 0.5 * s, DEPTH.projectile + 1).setBlendMode(Phaser.BlendModes.NORMAL),
          add("glow", pal.main, 1.5 * s, 1.1 * s),
        );
        animFps = 26;
        trail = this.scene.fx.trail(p, "shard", {
          speed: { min: 30, max: 140 }, lifespan: { min: 200, max: 380 }, frequency: 12,
          scale: { start: 0.7 * s, end: 0.05 }, rotate: { min: 0, max: 360 }, color: [0xffffff, pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "void":
        parts.push(
          add(pickTex(fxSeq("fx_void_orb", 8)), 0xffffff, 0.52 * s, 0.52 * s, DEPTH.projectile + 1),
          add("glow", pal.main, 1.7 * s, 1.7 * s),
        );
        animFps = 28;
        trail = this.scene.fx.trail(p, "dot", {
          speed: { min: 20, max: 120 }, lifespan: { min: 200, max: 360 }, frequency: 12,
          scale: { start: 0.75 * s, end: 0 }, color: [pal.light, pal.main, 0x3b0764], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "enemy":
        parts.push(add("glow", pal.main, 1.2 * s, 1.2 * s), add("core", pal.light, 0.6 * s, 0.6 * s, DEPTH.projectile + 1), add("ring", pal.main, 0.22 * s, 0.22 * s));
        trail = this.scene.fx.trail(p, "dot", {
          speed: 0, lifespan: 220, frequency: 16, scale: { start: 0.9 * s, end: 0 }, color: [pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
    }
    const proj: Projectile = { ...spec, parts, animKeys, animFps, trail, crackle, life: 1.6, age: 0, hitSet: new Set(), anchor: p };
    this.projectiles.push(proj);
  }

  private drawProjectileFx(p: Projectile) {
    const g = p.crackle!;
    g.clear();
    const pal = this.scene.paletteFor(p.owner);
    const dir = Math.sign(p.vx) || 1;
    const t = p.age;
    const s = p.size / 20;

    if (p.style === "volt") {
      for (let k = 0; k < 3; k += 1) {
        let x = p.x;
        let y = p.y;
        const ang = Math.random() * Math.PI * 2;
        const len = 14 + Math.random() * 20;
        g.lineStyle(1.5, k === 0 ? 0xffffff : pal.main, 0.9);
        g.beginPath();
        g.moveTo(x, y);
        for (let step = 0; step < 3; step += 1) {
          x += Math.cos(ang) * (len / 3) + (Math.random() - 0.5) * 8;
          y += Math.sin(ang) * (len / 3) + (Math.random() - 0.5) * 8;
          g.lineTo(x, y);
        }
        g.strokePath();
      }
      return;
    }

    if (p.style === "cryo") {
      // Rotating 6-point ice crystal + sharp forward lance triangle
      const r = 16 * s;
      g.lineStyle(2, 0xe0faff, 0.92);
      for (let i = 0; i < 3; i += 1) {
        const a = t * 6 + (i * Math.PI) / 3;
        g.lineBetween(p.x - Math.cos(a) * r, p.y - Math.sin(a) * r, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(p.x + dir * r * 1.4, p.y, p.x - dir * r * 0.4, p.y - 6 * s, p.x - dir * r * 0.4, p.y + 6 * s);
      return;
    }

    if (p.style === "void") {
      // Black-hole core + rotating magenta accretion rings + orbiting satellites
      const r = 15 * s;
      g.fillStyle(0x050210, 0.95);
      g.fillCircle(p.x, p.y, r * 0.72);
      g.lineStyle(2.4, 0xd946ef, 0.95);
      g.strokeCircle(p.x, p.y, r * 0.85);
      g.lineStyle(1.6, 0xffffff, 0.85);
      g.strokeEllipse(p.x, p.y, r * 2.6, r * 0.85);
      for (let i = 0; i < 3; i += 1) {
        const a = t * 11 + (i * Math.PI * 2) / 3;
        g.fillStyle(0xfdf4ff, 0.9);
        g.fillCircle(p.x + Math.cos(a) * r * 1.15, p.y + Math.sin(a) * r * 0.45, 2.8 * s);
      }
      return;
    }

    if (p.style === "plasma") {
      // Twin phase helix rings trailing along velocity
      for (let i = 0; i < 2; i += 1) {
        const px = p.x - dir * (8 + i * 11) * s;
        g.lineStyle(2, i === 0 ? 0xffffff : pal.main, 0.85 - i * 0.25);
        g.strokeEllipse(px, p.y, 10 * s, (22 - i * 4) * s);
      }
      return;
    }

    if (p.style === "fire") {
      // Spinning 3-blade flame vortex
      for (let i = 0; i < 3; i += 1) {
        const a = t * 14 + (i * Math.PI * 2) / 3;
        const fx = p.x + Math.cos(a) * 14 * s;
        const fy = p.y + Math.sin(a) * 14 * s;
        g.fillStyle(i === 0 ? 0xfff0a0 : pal.main, 0.85);
        g.fillCircle(fx, fy, 5 * s);
      }
      return;
    }

    if (p.style === "wind") {
      g.lineStyle(2.2, 0xffffff, 0.85);
      g.beginPath();
      g.arc(p.x, p.y, 20 * s, dir < 0 ? Math.PI - 0.8 : -0.8, dir < 0 ? Math.PI + 0.8 : 0.8);
      g.strokePath();
      return;
    }

    if (p.style === "earth") {
      const r = 14 * s;
      g.lineStyle(2.2, 0xffe6a8, 0.9);
      g.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const a = t * 9 + (i * Math.PI) / 3;
        const rx = p.x + Math.cos(a) * r;
        const ry = p.y + Math.sin(a) * r;
        if (i === 0) g.moveTo(rx, ry);
        else g.lineTo(rx, ry);
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
