import Phaser from "phaser";
import { DEPTHS, Direction, GRAVITY, PLATFORM_Y, PlayerInput, WORLD_WIDTH } from "../config/gameConfig";
import { HeroConfig, HeroSpriteName, heroTextureKey } from "../config/heroes";
import { RectLike } from "../utils/geometry";

export type BlastSpawn = {
  x: number;
  y: number;
  facing: Direction;
  damage: number;
  color: number;
};

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly hero: HeroConfig;
  readonly maxHp = 220;
  readonly maxEnergy = 120;

  hp = this.maxHp;
  energy = this.maxEnergy;
  facing: Direction = 1;
  vx = 0;
  vy = 0;
  grounded = true;
  alive = true;

  private step = 0;
  private currentSprite: HeroSpriteName = "idle";
  private attackTimer = 0;
  private blastPoseTimer = 0;
  private dashTimer = 0;
  private hurtTimer = 0;
  private invulnTimer = 0;
  private slashCooldown = 0;
  private blastCooldown = 0;
  private dashCooldown = 0;

  constructor(private readonly scene: Phaser.Scene, hero: HeroConfig, x: number, y = PLATFORM_Y) {
    this.hero = hero;
    this.shadow = scene.add
      .ellipse(x, y + 9, 92, 20, 0x000000, 0.34)
      .setDepth(DEPTHS.shadow);
    this.sprite = scene.add
      .image(x, y, heroTextureKey(hero, "idle"))
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.player);
    this.applySprite("idle");
  }

  update(dt: number, input: PlayerInput) {
    if (!this.alive) {
      this.shadow.setAlpha(0.18);
      return;
    }

    this.slashCooldown = Math.max(0, this.slashCooldown - dt);
    this.blastCooldown = Math.max(0, this.blastCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.blastPoseTimer = Math.max(0, this.blastPoseTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.energy = Math.min(this.maxEnergy, this.energy + dt * 18);

    let targetVx = 0;
    if (input.left) targetVx -= 290 * this.hero.speed;
    if (input.right) targetVx += 290 * this.hero.speed;
    if (targetVx !== 0) this.facing = targetVx > 0 ? 1 : -1;
    if (this.dashTimer > 0) targetVx = this.facing * 720;

    this.vx = Phaser.Math.Linear(this.vx, targetVx, this.grounded ? 0.22 : 0.11);
    if (input.jump && this.grounded) {
      this.vy = -780;
      this.grounded = false;
    }

    this.vy += GRAVITY * dt;
    this.sprite.x = Phaser.Math.Clamp(this.sprite.x + this.vx * dt, 52, WORLD_WIDTH - 52);
    this.sprite.y += this.vy * dt;
    if (this.sprite.y >= PLATFORM_Y) {
      this.sprite.y = PLATFORM_Y;
      this.vy = 0;
      this.grounded = true;
    }

    if (this.grounded && Math.abs(this.vx) > 35) this.step += dt * 12;

    this.shadow.setPosition(this.sprite.x, PLATFORM_Y + 9);
    this.shadow.setScale(Phaser.Math.Clamp(1 - Math.abs(this.sprite.y - PLATFORM_Y) / 360, 0.62, 1), 1);
    this.shadow.setAlpha(this.grounded ? 0.34 : 0.18);
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setAlpha(this.invulnTimer > 0 && Math.floor(this.scene.time.now * 0.03) % 2 === 0 ? 0.58 : 1);
    this.applySprite(this.pickSprite());
  }

  trySlash(): RectLike | undefined {
    if (!this.alive || this.slashCooldown > 0) return undefined;
    this.slashCooldown = 0.3;
    this.attackTimer = 0.18;
    return {
      x: this.sprite.x + this.facing * 78 - 74,
      y: this.sprite.y - 138,
      width: 148,
      height: 112,
    };
  }

  tryBlast(): BlastSpawn | undefined {
    if (!this.alive || this.blastCooldown > 0 || this.energy < 18) return undefined;
    this.energy -= 18;
    this.blastCooldown = 0.42;
    this.attackTimer = 0.22;
    this.blastPoseTimer = 0.22;
    return {
      x: this.sprite.x + this.facing * 76,
      y: this.sprite.y - 92,
      facing: this.facing,
      damage: this.hero.blastDamage,
      color: this.hero.themeColor,
    };
  }

  tryDash(): boolean {
    if (!this.alive || this.dashCooldown > 0 || this.energy < 12) return false;
    this.energy -= 12;
    this.dashCooldown = 0.62;
    this.dashTimer = 0.18;
    this.invulnTimer = 0.18;
    return true;
  }

  takeDamage(amount: number, direction: Direction) {
    if (!this.alive || this.invulnTimer > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.22;
    this.invulnTimer = 0.34;
    this.vx = direction * 360;
    this.vy = Math.min(this.vy, -120);
    if (this.hp <= 0) {
      this.alive = false;
      this.applySprite("hitReaction");
      this.sprite.setAlpha(0.7).setRotation(-0.55);
    }
  }

  energize(amount: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  getBounds(): RectLike {
    const width = Math.max(54, this.sprite.displayWidth * 0.44);
    const height = Math.max(118, this.sprite.displayHeight * 0.82);
    return {
      x: this.sprite.x - width / 2,
      y: this.sprite.y - height,
      width,
      height,
    };
  }

  destroy() {
    this.shadow.destroy();
    this.sprite.destroy();
  }

  private pickSprite(): HeroSpriteName {
    if (this.hurtTimer > 0) return "hitReaction";
    if (this.blastPoseTimer > 0) return "attackBlast";
    if (this.attackTimer > 0) return "attackSlash";
    if (this.dashTimer > 0) return "dash";
    if (!this.grounded) return "jump";
    if (Math.abs(this.vx) > 35) {
      const frame = (Math.floor(this.step) % 4) + 1;
      return `walk${frame}` as HeroSpriteName;
    }
    return "idle";
  }

  private applySprite(sprite: HeroSpriteName) {
    const key = heroTextureKey(this.hero, sprite);
    if (!this.scene.textures.exists(key)) return;
    if (this.currentSprite !== sprite || this.sprite.texture.key !== key) {
      this.sprite.setTexture(key);
      this.currentSprite = sprite;
    }
    const source = this.scene.textures.get(key).getSourceImage() as { height?: number };
    const sourceHeight = source.height && source.height > 0 ? source.height : this.sprite.height;
    this.sprite.setScale(this.hero.targetHeight / sourceHeight);
  }
}
