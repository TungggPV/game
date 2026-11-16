import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { GameScene } from "../scenes/GameScene";
import type { Hero } from "./Hero";
import type { Enemy } from "./Enemy";
import { sfx } from "../systems/sfx";

export type PropType = "crate" | "barrel" | "chest";

const PROP_CONFIGS: Record<PropType, { texture: string; w: number; h: number; hp: number; shadowW: number; shadowH: number; shardsColor: { main: number; light: number; dark: number } }> = {
  crate: {
    texture: "prop_crate",
    w: 72,
    h: 72,
    hp: 1,
    shadowW: 88,
    shadowH: 22,
    shardsColor: { main: 0x8a9bb0, light: 0xdde6f0, dark: 0x334155 },
  },
  barrel: {
    texture: "prop_barrel",
    w: 44,
    h: 50,
    hp: 1,
    shadowW: 56,
    shadowH: 18,
    shardsColor: { main: 0x718096, light: 0xcbd5e1, dark: 0x1e293b },
  },
  chest: {
    texture: "prop_chest",
    w: 118,
    h: 65,
    hp: 2,
    shadowW: 136,
    shadowH: 26,
    shardsColor: { main: 0x38bdf8, light: 0xbae6fd, dark: 0x0369a1 },
  },
};

export class EnvironmentProp {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly cfg: (typeof PROP_CONFIGS)[PropType];
  hp: number;
  dead = false;

  constructor(
    private scene: GameScene,
    readonly x: number,
    readonly type: PropType = "crate",
  ) {
    this.cfg = PROP_CONFIGS[type];
    this.hp = this.cfg.hp;

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

  takeHit(hero: Hero): boolean {
    if (this.dead) return false;
    this.hp -= 1;

    // Flash hit reaction
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.sprite.clearTint();
    });

    sfx.hit();
    this.scene.fx.sparks(this.x, this.cy, 0x18e6ff, 0.8, 6, 400);

    if (this.hp <= 0) {
      this.breakProp();
      return true;
    }
    return false;
  }

  breakProp() {
    if (this.dead) return;
    this.dead = true;

    // Visual shards explosion
    this.scene.fx.shards(this.x, this.cy, this.cfg.shardsColor, 16, 600);
    this.scene.fx.smoke(this.x, this.cy, 6, 60);

    // Drop loot reward
    this.scene.dropLoot({ isBoss: this.type === "chest", x: this.x, cy: this.cy } as unknown as Enemy);

    this.destroy();
  }

  destroy() {
    this.dead = true;
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
