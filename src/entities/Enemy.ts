import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import { DEPTHS, Direction, GRAVITY, PLATFORM_Y } from "../config/gameConfig";
import { RectLike } from "../utils/geometry";

export type EnemyKind = "crawler" | "horned_mutant";

type EnemyData = {
  displayName: string;
  idle: string;
  walk: string[];
  attack?: string;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  targetHeight: number;
  score: number;
};

const ENEMY_DATA: Record<EnemyKind, EnemyData> = {
  crawler: {
    displayName: "Crawler",
    idle: AssetKeys.crawlerIdle,
    walk: [AssetKeys.crawlerWalk, AssetKeys.crawlerIdle],
    maxHp: 56,
    damage: 12,
    speed: 104,
    range: 58,
    targetHeight: 94,
    score: 120,
  },
  horned_mutant: {
    displayName: "Horned Mutant",
    idle: AssetKeys.mutantIdle,
    walk: [AssetKeys.mutantWalk1, AssetKeys.mutantWalk2],
    attack: AssetKeys.mutantAttack,
    maxHp: 126,
    damage: 18,
    speed: 76,
    range: 78,
    targetHeight: 154,
    score: 260,
  },
};

export class Enemy {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly data: EnemyData;
  readonly maxHp: number;
  readonly scoreValue: number;

  hp: number;
  facing: Direction = -1;
  alive = true;

  private vx = 0;
  private vy = 0;
  private step = 0;
  private hurtTimer = 0;
  private attackTimer = 0;
  private attackCooldown = 0.6 + Math.random() * 0.4;

  constructor(private readonly scene: Phaser.Scene, readonly kind: EnemyKind, x: number) {
    this.data = ENEMY_DATA[kind];
    this.maxHp = this.data.maxHp;
    this.hp = this.maxHp;
    this.scoreValue = this.data.score;
    this.shadow = scene.add
      .ellipse(x, PLATFORM_Y + 9, kind === "horned_mutant" ? 100 : 78, 18, 0x000000, 0.3)
      .setDepth(DEPTHS.shadow);
    this.sprite = scene.add
      .image(x, PLATFORM_Y, this.data.idle)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.enemy);
    this.applyTexture(this.data.idle);
  }

  update(dt: number, targetX: number): RectLike | undefined {
    if (!this.alive) return undefined;

    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx = targetX - this.sprite.x;
    const distance = Math.abs(dx);
    this.facing = dx >= 0 ? 1 : -1;

    let hitbox: RectLike | undefined;
    if (distance > this.data.range) {
      this.vx = Phaser.Math.Linear(this.vx, this.facing * this.data.speed, 0.08);
    } else {
      this.vx = Phaser.Math.Linear(this.vx, 0, 0.18);
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.kind === "horned_mutant" ? 1.08 : 1.25;
        this.attackTimer = 0.22;
        hitbox = this.attackBounds();
      }
    }

    this.vy += GRAVITY * dt;
    this.sprite.x += this.vx * dt;
    this.sprite.y += this.vy * dt;
    if (this.sprite.y >= PLATFORM_Y) {
      this.sprite.y = PLATFORM_Y;
      this.vy = 0;
    }
    if (Math.abs(this.vx) > 8) this.step += dt * 8;

    this.shadow.setPosition(this.sprite.x, PLATFORM_Y + 9);
    this.sprite.setFlipX(this.facing < 0);
    if (this.hurtTimer > 0) {
      this.sprite.setTintFill(0xff5b5b);
      this.sprite.setAlpha(Math.floor(this.scene.time.now * 0.05) % 2 === 0 ? 0.62 : 1);
    } else {
      this.sprite.clearTint();
      this.sprite.setAlpha(1);
    }

    this.applyTexture(this.pickTexture());
    return hitbox;
  }

  takeDamage(amount: number, knockDirection: Direction) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.14;
    this.sprite.x += knockDirection * (this.kind === "horned_mutant" ? 14 : 24);
    if (this.hp <= 0) this.alive = false;
  }

  getBounds(): RectLike {
    const width = this.sprite.displayWidth * (this.kind === "horned_mutant" ? 0.48 : 0.56);
    const height = this.sprite.displayHeight * (this.kind === "horned_mutant" ? 0.78 : 0.62);
    return {
      x: this.sprite.x - width / 2,
      y: this.sprite.y - height,
      width,
      height,
    };
  }

  getBarState() {
    return {
      name: this.data.displayName.toUpperCase(),
      hp: this.hp,
      maxHp: this.maxHp,
    };
  }

  destroy() {
    this.shadow.destroy();
    this.sprite.destroy();
  }

  private attackBounds(): RectLike {
    return {
      x: this.sprite.x + this.facing * 58 - 46,
      y: this.sprite.y - 118,
      width: 92,
      height: 104,
    };
  }

  private pickTexture() {
    if (this.attackTimer > 0 && this.data.attack) return this.data.attack;
    if (Math.abs(this.vx) > 8) return this.data.walk[Math.floor(this.step) % this.data.walk.length];
    return this.data.idle;
  }

  private applyTexture(key: string) {
    if (!this.scene.textures.exists(key)) return;
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    const source = this.scene.textures.get(key).getSourceImage() as { height?: number };
    const sourceHeight = source.height && source.height > 0 ? source.height : this.sprite.height;
    this.sprite.setScale(this.data.targetHeight / sourceHeight);
  }
}
