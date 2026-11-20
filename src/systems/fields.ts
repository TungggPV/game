import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Hit } from "../entities/Actor";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { fxSeq, PALETTE } from "./Fx";

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
  sprite?: Phaser.GameObjects.Image;
  blendSprite?: Phaser.GameObjects.Image;
  animKeys?: string[];
  animFps?: number;
  age: number;
  particles?: Phaser.GameObjects.Particles.ParticleEmitter;
  anchor?: { x: number; y: number };
};

export class FieldSystem {
  fields: Field[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    for (const f of this.fields) {
      f.time -= dt;
      f.age += dt;
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
        f.sprite?.destroy();
        f.blendSprite?.destroy();
        this.scene.fx.stopTrail(f.particles, 500);
      }
    }
    this.fields = this.fields.filter((f) => f.time > 0);
  }

  clear() {
    this.fields.forEach((f) => {
      f.g.destroy();
      f.sprite?.destroy();
      f.blendSprite?.destroy();
      this.scene.fx.stopTrail(f.particles, 100);
    });
    this.fields = [];
  }

  spawnField(spec: Omit<Field, "g" | "acc" | "time" | "age"> & { duration: number }) {
    const pal = PALETTE[spec.owner.def.element];
    const g = this.scene.add.graphics().setDepth(DEPTH.fx - 1);
    const animKeys =
      spec.style === "cage"
        ? fxSeq("fx_volt_dome", 8)
        : spec.style === "blizzard"
        ? fxSeq("fx_cryo_blizzard", 8)
        : fxSeq("fx_wind_tornado", 8);
    const animFps = spec.style === "spiral" ? 22 : 20;
    const isBliz = spec.style === "blizzard";
    const mk = (depth: number) =>
      this.scene.textures.exists(animKeys[0])
        ? this.scene.add
            .image(spec.x, isBliz ? GROUND_Y - 12 : GROUND_Y + 6, animKeys[0])
            .setOrigin(0.5, isBliz ? 0.5 : 1)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(depth)
        : undefined;
    const sprite = mk(DEPTH.fx);
    const blendSprite = mk(DEPTH.fx + 1);
    if (isBliz) {
      sprite?.setScale((spec.radius * 2.1) / 196, ((spec.radius * 2.1) / 196) * 0.42);
      blendSprite?.setScale((spec.radius * 2.1) / 196, ((spec.radius * 2.1) / 196) * 0.42);
    } else {
      const sc = Math.max(0.85, (spec.radius * 1.4) / 180);
      sprite?.setScale(sc);
      blendSprite?.setScale(sc);
    }

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
    this.fields.push({ ...spec, g, sprite, blendSprite, animKeys, animFps, age: 0, particles, anchor, time: spec.duration, acc: 0 });
  }

  private drawField(f: Field) {
    const fade = Math.min(1, f.time * 2);
    if (f.sprite && f.animKeys?.length) {
      const phase = f.age * (f.animFps ?? 14);
      const curIdx = Math.floor(phase) % f.animKeys.length;
      const nextIdx = (curIdx + 1) % f.animKeys.length;
      const frac = phase - Math.floor(phase);
      const kCur = f.animKeys[curIdx];
      const kNext = f.animKeys[nextIdx];
      if (f.sprite.texture.key !== kCur && this.scene.textures.exists(kCur)) f.sprite.setTexture(kCur);
      if (f.style === "blizzard") {
        f.sprite.rotation += 0.03;
        f.blendSprite?.setRotation(f.sprite.rotation);
      } else if (f.style === "spiral") {
        f.sprite.setPosition(f.x, GROUND_Y + 6);
        f.blendSprite?.setPosition(f.x, GROUND_Y + 6);
      }
      const pulse = 1 + Math.sin(f.age * 10) * 0.04;
      const baseSc = f.style === "blizzard" ? (f.radius * 2.1) / 196 : Math.max(0.85, (f.radius * 1.4) / 180);
      f.sprite
        .setScale(baseSc * pulse, (f.style === "blizzard" ? baseSc * 0.42 : baseSc) * pulse)
        .setAlpha(0.92 * fade * (1 - frac));
      if (f.blendSprite) {
        if (f.blendSprite.texture.key !== kNext && this.scene.textures.exists(kNext)) f.blendSprite.setTexture(kNext);
        f.blendSprite
          .setScale(f.sprite.scaleX, f.sprite.scaleY)
          .setAlpha(0.92 * fade * frac);
      }
    }

    const g = f.g;
    g.clear();
    if (f.style === "blizzard") {
      g.lineStyle(1.6, 0x7dd3fc, 0.38 * fade).strokeEllipse(f.x, GROUND_Y - 4, f.radius * 2, f.radius * 0.34);
    } else if (f.style === "cage") {
      g.lineStyle(2, PALETTE.volt.main, 0.45 * fade).strokeEllipse(f.x, GROUND_Y - 2, f.radius * 1.9, f.radius * 0.34);
    }
  }
}
