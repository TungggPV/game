import Phaser from "phaser";
import { DEPTHS, Direction, GRAVITY, PLATFORM_Y, PlayerInput, WORLD_WIDTH } from "../config/gameConfig";
import { HeroConfig, HeroSpriteName, heroTextureKey } from "../config/heroes";
import { BasicAttackConfig, SkillConfig, SkillInput } from "../config/skills";
import { RectLike } from "../utils/geometry";

export type SkillUseResult =
  | { ok: true }
  | { ok: false; reason: "cooldown" | "energy" | "dead"; remaining?: number };

export type SkillUiState = {
  cooldownRemaining: number;
  cooldownPct: number;
  enoughEnergy: boolean;
  glow: number;
};

type PlayerOptions = {
  maxHp?: number;
  maxEnergy?: number;
  energyRegen?: number;
  initialUltimateCooldown?: number;
};

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly aura: Phaser.GameObjects.Ellipse;
  readonly hero: HeroConfig;
  readonly maxHp: number;
  readonly maxEnergy: number;

  hp: number;
  energy: number;
  facing: Direction = 1;
  vx = 0;
  vy = 0;
  grounded = true;
  alive = true;

  private step = 0;
  private currentSprite: HeroSpriteName = "idle";
  private attackTimer = 0;
  private blastPoseTimer = 0;
  private ultimatePoseTimer = 0;
  private basicCooldown = 0;
  private basicCooldownMax = 1;
  private basicGlow = 0;
  private dashTimer = 0;
  private hurtTimer = 0;
  private invulnTimer = 0;
  private dashCooldown = 0;
  private energyRegen = 17;
  private boundsMin = 86;
  private boundsMax = WORLD_WIDTH - 52;
  private spriteBaseScale = 1;
  private readonly skillCooldowns: Record<SkillInput, number> = {
    skill1: 0,
    skill2: 0,
    ultimate: 0,
  };
  private readonly skillCooldownMax: Record<SkillInput, number> = {
    skill1: 1,
    skill2: 1,
    ultimate: 1,
  };
  private readonly skillGlow: Record<SkillInput, number> = {
    skill1: 0,
    skill2: 0,
    ultimate: 0,
  };

  constructor(
    private readonly scene: Phaser.Scene,
    readonly id: number,
    hero: HeroConfig,
    x: number,
    y = PLATFORM_Y,
    options: PlayerOptions = {},
  ) {
    this.hero = hero;
    this.maxHp = options.maxHp ?? 220;
    this.maxEnergy = options.maxEnergy ?? 120;
    this.energyRegen = options.energyRegen ?? 17;
    this.hp = this.maxHp;
    this.energy = this.maxEnergy;
    if (options.initialUltimateCooldown) {
      this.skillCooldowns.ultimate = options.initialUltimateCooldown;
      this.skillCooldownMax.ultimate = options.initialUltimateCooldown;
    }
    this.shadow = scene.add
      .ellipse(x, y + 9, 92, 20, 0x000000, 0.34)
      .setDepth(DEPTHS.shadow);
    this.aura = scene.add
      .ellipse(x, y - hero.targetHeight * 0.5, hero.targetHeight * 0.78, hero.targetHeight * 1.12, hero.themeColor, 0.1)
      .setDepth(DEPTHS.player + id - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add
      .image(x, y, heroTextureKey(hero, "idle"))
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.player + id);
    this.applySprite("idle");
  }

  update(dt: number, input: PlayerInput) {
    this.updateTimers(dt);
    if (!this.alive) {
      this.shadow.setAlpha(0.18);
      return;
    }

    this.energy = Math.min(this.maxEnergy, this.energy + dt * this.energyRegen);

    let targetVx = 0;
    if (input.left) targetVx -= 290 * this.hero.speed;
    if (input.right) targetVx += 290 * this.hero.speed;
    if (targetVx !== 0) this.facing = targetVx > 0 ? 1 : -1;
    if (this.dashTimer > 0) targetVx = this.facing * 760;

    this.vx = Phaser.Math.Linear(this.vx, targetVx, this.grounded ? 0.23 : 0.11);
    if (input.jump && this.grounded) {
      this.vy = -780;
      this.grounded = false;
    }

    this.vy += GRAVITY * dt;
    this.sprite.x = Phaser.Math.Clamp(this.sprite.x + this.vx * dt, this.boundsMin, this.boundsMax);
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
    this.refreshAura();
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setAlpha(this.invulnTimer > 0 && Math.floor(this.scene.time.now * 0.03) % 2 === 0 ? 0.58 : 1);
    this.applySprite(this.pickSprite());
    this.applyPoseSmoothing();
  }

  canUseSkill(skill: SkillConfig): SkillUseResult {
    if (!this.alive) return { ok: false, reason: "dead" };
    const cooldown = this.skillCooldowns[skill.input];
    if (cooldown > 0) return { ok: false, reason: "cooldown", remaining: cooldown };
    if (this.energy < skill.energyCost) return { ok: false, reason: "energy" };
    return { ok: true };
  }

  canUseBasicAttack(attack: BasicAttackConfig): SkillUseResult {
    if (!this.alive) return { ok: false, reason: "dead" };
    if (this.basicCooldown > 0) return { ok: false, reason: "cooldown", remaining: this.basicCooldown };
    this.basicCooldownMax = attack.cooldown;
    return { ok: true };
  }

  startBasicAttack(attack: BasicAttackConfig): SkillUseResult {
    const check = this.canUseBasicAttack(attack);
    if (!check.ok) return check;
    this.basicCooldown = attack.cooldown;
    this.basicCooldownMax = attack.cooldown;
    this.basicGlow = 0.22;
    this.attackTimer = 0.16;
    return { ok: true };
  }

  startSkill(skill: SkillConfig): SkillUseResult {
    const check = this.canUseSkill(skill);
    if (!check.ok) return check;

    this.energy = Math.max(0, this.energy - skill.energyCost);
    this.skillCooldowns[skill.input] = skill.cooldown;
    this.skillCooldownMax[skill.input] = skill.cooldown;
    this.skillGlow[skill.input] = 0.34;

    if (skill.input === "ultimate") {
      this.ultimatePoseTimer = 0.34;
      this.invulnTimer = Math.max(this.invulnTimer, 0.22);
    } else if (skill.type === "ranged") {
      this.attackTimer = 0.22;
      this.blastPoseTimer = 0.22;
    } else {
      this.attackTimer = 0.18;
    }

    return { ok: true };
  }

  tryDash(): boolean {
    if (!this.alive || this.dashCooldown > 0) return false;
    this.dashCooldown = 0.56;
    this.dashTimer = 0.18;
    this.invulnTimer = 0.18;
    return true;
  }

  setFacing(direction: Direction) {
    this.facing = direction;
    this.sprite.setFlipX(direction < 0);
  }

  setHorizontalBounds(min: number, max: number) {
    this.boundsMin = min;
    this.boundsMax = max;
    this.sprite.x = Phaser.Math.Clamp(this.sprite.x, min, max);
  }

  takeDamage(amount: number, direction: Direction) {
    if (!this.alive || this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.28;
    this.invulnTimer = 0.6;
    this.vx = direction * 360;
    this.vy = Math.min(this.vy, -120);
    if (this.hp <= 0) {
      this.alive = false;
      this.applySprite("hitReaction");
      this.sprite.setAlpha(0.7).setRotation(-0.55);
    }
    return true;
  }

  energize(amount: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  getSkillState(skill: SkillConfig): SkillUiState {
    const remaining = this.skillCooldowns[skill.input];
    const max = Math.max(0.01, this.skillCooldownMax[skill.input]);
    return {
      cooldownRemaining: remaining,
      cooldownPct: Phaser.Math.Clamp(remaining / max, 0, 1),
      enoughEnergy: this.energy >= skill.energyCost,
      glow: this.skillGlow[skill.input],
    };
  }

  getBasicAttackState(): SkillUiState {
    const max = Math.max(0.01, this.basicCooldownMax);
    return {
      cooldownRemaining: this.basicCooldown,
      cooldownPct: Phaser.Math.Clamp(this.basicCooldown / max, 0, 1),
      enoughEnergy: true,
      glow: this.basicGlow,
    };
  }

  getDashCooldownPct() {
    return Phaser.Math.Clamp(this.dashCooldown / 0.56, 0, 1);
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
    this.aura.destroy();
    this.shadow.destroy();
    this.sprite.destroy();
  }

  private updateTimers(dt: number) {
    this.basicCooldown = Math.max(0, this.basicCooldown - dt);
    this.basicGlow = Math.max(0, this.basicGlow - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.blastPoseTimer = Math.max(0, this.blastPoseTimer - dt);
    this.ultimatePoseTimer = Math.max(0, this.ultimatePoseTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    for (const input of Object.keys(this.skillCooldowns) as SkillInput[]) {
      this.skillCooldowns[input] = Math.max(0, this.skillCooldowns[input] - dt);
      this.skillGlow[input] = Math.max(0, this.skillGlow[input] - dt);
    }
  }

  private pickSprite(): HeroSpriteName {
    if (this.hurtTimer > 0) return "hitReaction";
    if (this.blastPoseTimer > 0) return "attackBlast";
    if (this.attackTimer > 0 || this.ultimatePoseTimer > 0) return "attackSlash";
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
    this.spriteBaseScale = this.hero.targetHeight / sourceHeight;
    this.sprite.setScale(this.spriteBaseScale);
  }

  private refreshAura() {
    const air = Phaser.Math.Clamp((PLATFORM_Y - this.sprite.y) / 320, 0, 1);
    const speed = Phaser.Math.Clamp(Math.abs(this.vx) / 760, 0, 1);
    const pulse = 0.5 + Math.sin(this.scene.time.now * 0.008 + this.id) * 0.5;
    const active = this.dashTimer > 0 || this.attackTimer > 0 || this.blastPoseTimer > 0 || this.ultimatePoseTimer > 0;
    this.aura
      .setPosition(this.sprite.x - this.facing * 8, this.sprite.y - this.hero.targetHeight * 0.52)
      .setScale(1 + speed * 0.18 + air * 0.12, 1 + pulse * 0.05)
      .setAlpha(active ? 0.28 : 0.08 + speed * 0.08 + air * 0.05);
    this.shadow.setFillStyle(this.hero.themeColor, this.grounded ? 0.18 : 0.08);
  }

  private applyPoseSmoothing() {
    const speed = Phaser.Math.Clamp(Math.abs(this.vx) / 760, 0, 1);
    const dash = this.dashTimer > 0 ? 1 : 0;
    const air = this.grounded ? 0 : 1;
    const squashX = 1 + speed * 0.025 + dash * 0.09 - air * 0.015;
    const squashY = 1 - speed * 0.012 - dash * 0.045 + air * 0.022;
    const targetRotation = this.grounded ? Phaser.Math.Clamp(this.vx / 6400, -0.045, 0.045) : this.facing * 0.035;
    this.sprite.setScale(this.spriteBaseScale * squashX, this.spriteBaseScale * squashY);
    this.sprite.setRotation(Phaser.Math.Linear(this.sprite.rotation, targetRotation, 0.16));
  }
}
