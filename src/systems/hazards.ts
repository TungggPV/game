import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Actor, Hit } from "../entities/Actor";
import type { Enemy } from "../entities/Enemy";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";
import { sfx } from "./sfx";

export type Hazard = {
  owner: Enemy;
  rect: Phaser.Geom.Rectangle;
  vx: number;
  life: number;
  maxLife: number;
  hitSet: Set<Actor>;
  damage: number;
  parts: Phaser.GameObjects.Image[];
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  kind: "shock" | "beam";
  anchor?: { x: number; y: number };
};

export class HazardSystem {
  hazards: Hazard[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    for (const h of this.hazards) {
      h.life -= dt;
      h.rect.x += h.vx * dt;
      if (h.kind === "shock") {
        if (h.anchor) h.anchor.x = h.rect.centerX;
        h.parts.forEach((o, i) =>
          o.setPosition(h.rect.centerX, GROUND_Y - (i === 2 ? 30 : 6)).setScale(
            (i === 0 ? 1.4 : i === 1 ? 0.7 : 1.6) * (0.9 + Math.random() * 0.2),
            (i === 0 ? 1.4 : i === 1 ? 0.9 : 1.0) * (0.85 + Math.random() * 0.3),
          ),
        );
        if (Math.random() < 0.5) this.scene.fx.dust(h.rect.centerX, Math.sign(h.vx), 0.8);
      } else {
        const t = 1 - h.life / h.maxLife;
        const thick = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
        const sizes = [2.2, 1.2, 0.45];
        h.parts.forEach((o, i) =>
          o.setDisplaySize(h.rect.width, h.rect.height * sizes[i] * thick * (0.85 + Math.random() * 0.3)),
        );
      }
      for (const hero of this.scene.heroes) {
        if (hero.dead || h.hitSet.has(hero)) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(h.rect, hero.bounds())) {
          if (
            this.scene.dealDamage(h.owner, hero, {
              damage: h.damage,
              dir: Math.sign(hero.x - h.owner.x) || 1,
              knock: 460,
              launch: 420,
              color: 0x6fb6ff,
            }) > 0
          ) {
            h.hitSet.add(hero);
          }
        }
      }
      const [minX, maxX] = this.scene.arenaBounds();
      if (h.life <= 0 || h.rect.right < minX || h.rect.left > maxX) {
        h.life = -1;
        h.parts.forEach((o) => o.destroy());
        this.scene.fx.stopTrail(h.trail, 700);
      }
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  clear() {
    this.hazards.forEach((h) => {
      h.parts.forEach((o) => o.destroy());
      this.scene.fx.stopTrail(h.trail, 100);
    });
    this.hazards = [];
  }

  spawnShockwave(owner: Enemy, x: number, dir: number, speed: number, damage: number) {
    const pal = PALETTE.boss;
    const mk = (tex: string, tint: number, sx: number, sy: number, d: number) =>
      this.scene.add
        .image(x, GROUND_Y - 10, tex)
        .setOrigin(0.5, 1)
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(sx, sy)
        .setDepth(d);
    const parts = [mk("flame", pal.main, 1.4, 1.4, DEPTH.fx), mk("flame", pal.light, 0.7, 0.9, DEPTH.fx + 1), mk("glow", pal.main, 1.6, 1.0, DEPTH.fx - 1)];
    const anchor = { x, y: GROUND_Y - 10 };
    const trail = this.scene.fx.trail(
      anchor,
      "shard",
      {
        speedY: { min: -420, max: -160 },
        speedX: { min: -80, max: 80 },
        gravityY: 1200,
        lifespan: { min: 300, max: 600 },
        frequency: 25,
        scale: { start: 0.7, end: 0.2 },
        rotate: { start: 0, end: 360 },
        color: [pal.light, 0x7a86a0],
      },
      DEPTH.fx,
    );
    this.hazards.push({
      owner,
      rect: new Phaser.Geom.Rectangle(x - 30, GROUND_Y - 60, 60, 60),
      vx: dir * speed,
      life: 2.2,
      maxLife: 2.2,
      hitSet: new Set(),
      damage,
      parts,
      trail,
      kind: "shock",
      anchor,
    });
  }

  spawnBeam(owner: Enemy, x0: number, x1: number, y: number, height: number, damage: number) {
    sfx.boom();
    this.scene.fx.shake(0.014, 450);
    const pal = PALETTE.boss;
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const mk = (tint: number, sy: number, d: number) =>
      this.scene.add
        .image(cx, y, "beam")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(w, height * sy)
        .setDepth(d);
    const parts = [mk(pal.dark, 2.2, DEPTH.fx - 1), mk(pal.main, 1.2, DEPTH.fx), mk(0xffffff, 0.45, DEPTH.fx + 1)];
    const muzzleX = owner.facing > 0 ? x0 : x1;
    this.scene.fx.flashCore(muzzleX, y, 2);
    this.scene.fx.glow(muzzleX, y, pal.main, 4, 500);
    const anchor = { x: owner.facing > 0 ? x1 : x0, y };
    const trail = this.scene.fx.trail(
      anchor,
      "streak",
      {
        speed: { min: 200, max: 600 },
        angle: owner.facing > 0 ? { min: 120, max: 240 } : { min: -60, max: 60 },
        lifespan: 300,
        frequency: 20,
        quantity: 3,
        scale: { start: 0.7, end: 0 },
        rotate: {
          onEmit: () => 0,
          onUpdate: (p: Phaser.GameObjects.Particles.Particle) =>
            Math.atan2(p.velocityY, p.velocityX) * (180 / Math.PI),
        },
        color: [0xffffff, pal.main],
        blendMode: Phaser.BlendModes.ADD,
      },
      DEPTH.fx + 2,
    );
    this.hazards.push({
      owner,
      rect: new Phaser.Geom.Rectangle(x0, y - height / 2, w, height),
      vx: 0,
      life: 0.55,
      maxLife: 0.55,
      hitSet: new Set(),
      damage,
      parts,
      trail,
      kind: "beam",
    });
  }

  spawnMeteor(owner: Hero, x: number, radius: number, hit: Hit) {
    const pal = PALETTE[owner.def.element];
    const mark = this.scene.add
      .image(x, GROUND_Y - 4, "glyph")
      .setTint(pal.main)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(radius / 120, (radius / 120) * 0.26)
      .setAlpha(0)
      .setDepth(DEPTH.shadow + 1);
    this.scene.tweens.add({ targets: mark, alpha: 0.9, rotation: 2, duration: 420 });
    const startX = x - 320;
    const startY = this.scene.cameras.main.worldView.y - 100;
    const rock = { x: startX, y: startY };
    const head = this.scene.add
      .image(startX, startY, "glow")
      .setTint(pal.main)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(2.2)
      .setDepth(DEPTH.projectile);
    const core = this.scene.add
      .image(startX, startY, "core")
      .setTint(pal.light)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.3)
      .setDepth(DEPTH.projectile + 1);
    const angle = Math.atan2(GROUND_Y - 40 - startY, x - startX) * (180 / Math.PI);
    const tail = this.scene.fx.trail(rock, "flame", {
      speed: { min: 20, max: 80 },
      lifespan: { min: 260, max: 480 },
      frequency: 8,
      quantity: 2,
      scale: { start: 1.3, end: 0.1 },
      alpha: { start: 1, end: 0 },
      rotate: angle + 90,
      color: [0xffffff, pal.light, pal.main, pal.dark],
      blendMode: Phaser.BlendModes.ADD,
    });
    const smoke = this.scene.fx.trail(
      rock,
      "smoke",
      { speed: 20, lifespan: 600, frequency: 40, scale: { start: 0.4, end: 1.2 }, alpha: { start: 0.4, end: 0 }, tint: 0x30262a },
      DEPTH.projectile - 2,
    );
    this.scene.tweens.add({
      targets: [head, core, rock],
      x,
      y: GROUND_Y - 40,
      delay: 120,
      duration: 360,
      ease: "Quad.easeIn",
      onComplete: () => {
        head.destroy();
        core.destroy();
        mark.destroy();
        this.scene.fx.stopTrail(tail, 500);
        this.scene.fx.stopTrail(smoke, 700);
        this.scene.fx.pillar(x, pal.main, 1.4, 0.8, 500);
        this.scene.explode(owner, x, GROUND_Y - 60, radius, hit);
      },
    });
  }
}
