import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { GameScene } from "../scenes/GameScene";
import type { Hero } from "./Hero";
import type { Enemy } from "./Enemy";
import { sfx } from "../systems/sfx";

export type PropType = "crate_energy" | "crate_health" | "crate_gold" | "crate" | "barrel" | "chest";

type PropDef = {
  texture: string;
  w: number;
  h: number;
  hp: number;
  shadowW: number;
  shadowH: number;
  coreColor?: number;
  shardsColor: { main: number; light: number; dark: number };
};

const PROP_CONFIGS: Record<PropType, PropDef> = {
  crate_energy: {
    texture: "crate_metal",
    w: 72,
    h: 72,
    hp: 2,
    shadowW: 88,
    shadowH: 22,
    coreColor: 0x18e6ff,
    shardsColor: { main: 0x18e6ff, light: 0xbdf7ff, dark: 0x09526b },
  },
  crate_health: {
    texture: "crate_metal",
    w: 72,
    h: 72,
    hp: 2,
    shadowW: 88,
    shadowH: 22,
    coreColor: 0x34d399,
    shardsColor: { main: 0x34d399, light: 0xd1fae5, dark: 0x065f46 },
  },
  crate_gold: {
    texture: "crate_metal",
    w: 72,
    h: 72,
    hp: 2,
    shadowW: 88,
    shadowH: 22,
    coreColor: 0xfbbf24,
    shardsColor: { main: 0xfbbf24, light: 0xfef3c7, dark: 0x78350f },
  },
  crate: {
    texture: "crate_metal",
    w: 72,
    h: 72,
    hp: 2,
    shadowW: 88,
    shadowH: 22,
    coreColor: 0x38bdf8,
    shardsColor: { main: 0x8a9bb0, light: 0xdde6f0, dark: 0x334155 },
  },
  barrel: {
    texture: "prop_barrel",
    w: 44,
    h: 50,
    hp: 1,
    shadowW: 56,
    shadowH: 18,
    coreColor: 0xf43f5e,
    shardsColor: { main: 0x718096, light: 0xcbd5e1, dark: 0x1e293b },
  },
  chest: {
    texture: "chest_scifi",
    w: 96,
    h: 64,
    hp: 3,
    shadowW: 112,
    shadowH: 26,
    coreColor: 0xa855f7,
    shardsColor: { main: 0xa855f7, light: 0xf3e8ff, dark: 0x581c87 },
  },
};

export class EnvironmentProp {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly coreGlow?: Phaser.GameObjects.Image;
  private hpBarBg?: Phaser.GameObjects.Rectangle;
  private hpBarFill?: Phaser.GameObjects.Rectangle;
  readonly cfg: PropDef;
  readonly maxHp: number;
  hp: number;
  dead = false;
  private lastHitAt = 0;

  constructor(
    private scene: GameScene,
    readonly x: number,
    readonly type: PropType = "crate_energy",
  ) {
    this.cfg = PROP_CONFIGS[type] ?? PROP_CONFIGS.crate_energy;
    this.maxHp = this.cfg.hp;
    this.hp = this.maxHp;

    // Contact shadow firmly on the ground surface
    this.shadow = scene.add
      .image(x, GROUND_Y, "contact_shadow")
      .setDisplaySize(this.cfg.shadowW, this.cfg.shadowH)
      .setAlpha(0.8)
      .setDepth(DEPTH.shadow);

    // Prop sprite rests flush on ground (origin 0.5, 1)
    this.sprite = scene.add
      .image(x, GROUND_Y, this.cfg.texture)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.shadow + 2);

    // Optional neon glowing reactor core in center of crate
    if (this.cfg.coreColor) {
      this.coreGlow = scene.add
        .image(x, this.cy, "core")
        .setScale(0.55)
        .setTint(this.cfg.coreColor)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.75)
        .setDepth(DEPTH.shadow + 3);

      scene.tweens.add({
        targets: this.coreGlow,
        scaleX: 0.68,
        scaleY: 0.68,
        alpha: 0.45,
        duration: 900 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  get y() {
    return GROUND_Y;
  }

  get cy() {
    return GROUND_Y - this.cfg.h / 2;
  }

  bounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.x - this.cfg.w / 2,
      GROUND_Y - this.cfg.h,
      this.cfg.w,
      this.cfg.h,
    );
  }

  takeHit(_hero: Hero): boolean {
    if (this.dead) return false;
    const now = this.scene.time.now;
    if (now - this.lastHitAt < 220) return false;
    this.lastHitAt = now;
    this.hp -= 1;

    // Flash hit reaction
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.sprite.clearTint();
    });

    sfx.hit();
    this.scene.fx.sparks(this.x, this.cy, this.cfg.coreColor ?? 0x18e6ff, 0.9, 8, 450);

    // Mini sci-fi HP bar appears when damaged
    if (this.hp > 0) {
      this.updateHpBar();
    } else {
      this.breakProp();
      return true;
    }
    return false;
  }

  private updateHpBar() {
    const barW = Math.min(48, this.cfg.w * 0.7);
    const barH = 4;
    const barY = GROUND_Y - this.cfg.h - 10;

    if (!this.hpBarBg) {
      this.hpBarBg = this.scene.add
        .rectangle(this.x, barY, barW, barH, 0x02070d, 0.8)
        .setStrokeStyle(1, 0x475569)
        .setDepth(DEPTH.shadow + 4);
    }
    if (!this.hpBarFill) {
      this.hpBarFill = this.scene.add
        .rectangle(this.x - barW / 2, barY, barW, barH - 1, this.cfg.coreColor ?? 0x18e6ff)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.shadow + 5);
    }

    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarFill.width = (barW - 2) * pct;
  }

  breakProp() {
    if (this.dead) return;
    this.dead = true;

    // Visual shards and debris explosion
    this.scene.fx.shards(this.x, this.cy, this.cfg.shardsColor, 18, 650);
    this.scene.fx.smoke(this.x, this.cy, 8, 70);
    this.scene.fx.ring(this.x, this.cy, this.cfg.coreColor ?? 0x18e6ff, 80, 240, 0.25);

    // Drop corresponding loot reward
    this.scene.dropLoot({
      isBoss: this.type === "chest",
      x: this.x,
      cy: this.cy,
    } as unknown as Enemy);

    this.destroy();
  }

  destroy() {
    this.dead = true;
    this.sprite.destroy();
    this.shadow.destroy();
    this.coreGlow?.destroy();
    this.hpBarBg?.destroy();
    this.hpBarFill?.destroy();
  }
}
