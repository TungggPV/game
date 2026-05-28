import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import { DEPTHS, Direction, GRAVITY, PLATFORM_Y } from "../config/gameConfig";
import { StatusType } from "../config/skills";
import { RectLike } from "../utils/geometry";
import type { Player } from "./Player";

export type EnemyKind = "crawler" | "horned_mutant" | "sky_hunter";

export type EnemyAction =
  | { type: "melee"; hitbox: RectLike; damage: number; source: Enemy }
  | { type: "leap"; hitbox: RectLike; damage: number; source: Enemy }
  | { type: "slam"; hitbox: RectLike; damage: number; source: Enemy; impactX: number }
  | { type: "shot"; source: Enemy; x: number; y: number; damage: number; facing: Direction };

type EnemyData = {
  displayName: string;
  idle: string;
  walk: string[];
  attack?: string;
  maxHp: number;
  damage: number;
  speed: number;
  stopDistance: number;
  attackRange: number;
  attackCooldown: number;
  leapDamage?: number;
  slamDamage?: number;
  targetHeight: number;
  score: number;
  flying?: boolean;
};

type StatusState = {
  type: StatusType;
  duration: number;
  tick: number;
};

const ENEMY_DATA: Record<EnemyKind, EnemyData> = {
  crawler: {
    displayName: "Crawler Drone",
    idle: AssetKeys.crawlerIdle,
    walk: [AssetKeys.crawlerIdle],
    maxHp: 70,
    damage: 10,
    speed: 95,
    stopDistance: 95,
    attackRange: 85,
    attackCooldown: 1.1,
    leapDamage: 14,
    targetHeight: 92,
    score: 130,
  },
  horned_mutant: {
    displayName: "Horned Mutant",
    idle: AssetKeys.bossMain,
    walk: [AssetKeys.bossMain],
    attack: AssetKeys.bossSlam,
    maxHp: 260,
    damage: 20,
    speed: 58,
    stopDistance: 130,
    attackRange: 115,
    attackCooldown: 1.1,
    slamDamage: 28,
    targetHeight: 238,
    score: 680,
  },
  sky_hunter: {
    displayName: "Sky Hunter",
    idle: AssetKeys.skyHunterIdle,
    walk: [AssetKeys.skyHunterIdle],
    attack: AssetKeys.skyHunterFire,
    maxHp: 100,
    damage: 14,
    speed: 74,
    stopDistance: 300,
    attackRange: 380,
    attackCooldown: 2,
    targetHeight: 112,
    score: 220,
    flying: true,
  },
};

export class Enemy {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly aura: Phaser.GameObjects.Ellipse;
  readonly statusText: Phaser.GameObjects.Text;
  readonly statusVisuals: Phaser.GameObjects.Graphics;
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
  private leapCooldown = 1.2 + Math.random();
  private slamCooldown = 2.2 + Math.random();
  private shotCooldown = 1.2 + Math.random();
  private leapWindup = 0;
  private slamWindup = 0;
  private damageScale = 1;
  private readonly statuses: StatusState[] = [];
  private readonly bob = Math.random() * Math.PI * 2;

  constructor(private readonly scene: Phaser.Scene, readonly kind: EnemyKind, x: number, waveLevel = 0) {
    this.data = ENEMY_DATA[kind];
    const hpScale = 1 + waveLevel * 0.1;
    this.damageScale = 1 + waveLevel * 0.05;
    this.maxHp = Math.round(this.data.maxHp * hpScale);
    this.hp = this.maxHp;
    this.scoreValue = Math.round(this.data.score * (1 + waveLevel * 0.15));
    this.shadow = scene.add
      .ellipse(x, PLATFORM_Y + 9, kind === "horned_mutant" ? 184 : 80, kind === "horned_mutant" ? 30 : 18, 0x000000, this.data.flying ? 0.16 : 0.32)
      .setDepth(DEPTHS.shadow);
    this.aura = scene.add
      .ellipse(
        x,
        this.data.flying ? PLATFORM_Y - 260 : PLATFORM_Y - this.data.targetHeight * 0.45,
        kind === "horned_mutant" ? 230 : 92,
        kind === "horned_mutant" ? 250 : 112,
        kind === "horned_mutant" ? 0x356dff : 0x18e6ff,
        kind === "horned_mutant" ? 0.11 : 0.06,
      )
      .setDepth(DEPTHS.enemy - 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add
      .image(x, this.data.flying ? PLATFORM_Y - 210 : PLATFORM_Y, this.data.idle)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.enemy);
    this.statusText = scene.add
      .text(x, this.sprite.y - this.data.targetHeight - 18, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#02070d",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 8)
      .setVisible(false);
    this.statusVisuals = scene.add.graphics().setDepth(DEPTHS.effect + 7);
    this.applyTexture(this.data.idle);
  }

  update(dt: number, targets: Player[]): EnemyAction[] {
    if (!this.alive) return [];

    this.updateStatuses(dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.leapCooldown = Math.max(0, this.leapCooldown - dt);
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);

    const target = this.nearestTarget(targets);
    if (!target) {
      this.refreshVisuals();
      return [];
    }

    const dx = target.sprite.x - this.sprite.x;
    const distance = Math.abs(dx);
    this.facing = dx >= 0 ? 1 : -1;

    const actions = this.isStunned()
      ? []
      : this.data.flying
        ? this.updateFlying(dt, target, distance)
        : this.updateGround(dt, distance);

    this.integrate(dt);
    this.refreshVisuals();
    return actions;
  }

  takeDamage(amount: number, knockDirection: Direction, knockback = 24) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.14;
    if (!this.data.flying) this.sprite.x += knockDirection * knockback;
    else this.sprite.x += knockDirection * knockback * 0.45;
    if (this.hp <= 0) {
      this.alive = false;
      this.statuses.length = 0;
      this.statusText.setVisible(false);
      this.statusVisuals.clear();
    }
  }

  applyStatus(type: StatusType, durationOverride?: number) {
    if (!this.alive) return false;
    const duration =
      durationOverride ??
      (type === "burn" ? 3 : type === "poison" ? 5 : type === "slow" ? 2 : this.kind === "horned_mutant" ? 0.2 : 0.4);
    const existing = this.statuses.find((status) => status.type === type);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.tick = Math.min(existing.tick, 0.5);
      return false;
    } else {
      this.statuses.push({ type, duration, tick: 0.5 });
      return true;
    }
  }

  launch(strength = 520) {
    if (!this.alive || this.data.flying) return;
    this.vy = Math.min(this.vy, -strength);
  }

  pullToward(x: number, amount: number) {
    if (!this.alive) return;
    const direction = x >= this.sprite.x ? 1 : -1;
    this.sprite.x += direction * Math.min(Math.abs(x - this.sprite.x), amount);
  }

  isStunned() {
    return this.statuses.some((status) => status.type === "stun" && status.duration > 0);
  }

  getSpeedMultiplier() {
    let multiplier = this.statuses.some((status) => status.type === "poison" && status.duration > 0) ? 0.85 : 1;
    if (this.statuses.some((status) => status.type === "slow" && status.duration > 0)) multiplier *= 0.6;
    if (this.isEnraged()) multiplier *= 1.12;
    if (this.kind === "sky_hunter" && this.hp < this.maxHp * 0.35) multiplier *= 1.28;
    return multiplier;
  }

  isBoss() {
    return this.kind === "horned_mutant";
  }

  isEnragedState() {
    return this.isEnraged();
  }

  getBounds(): RectLike {
    const width = this.sprite.displayWidth * (this.kind === "horned_mutant" ? 0.56 : this.kind === "sky_hunter" ? 0.52 : 0.56);
    const height = this.sprite.displayHeight * (this.kind === "horned_mutant" ? 0.76 : this.kind === "sky_hunter" ? 0.54 : 0.62);
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
    this.aura.destroy();
    this.shadow.destroy();
    this.sprite.destroy();
    this.statusText.destroy();
    this.statusVisuals.destroy();
  }

  private updateGround(dt: number, distance: number): EnemyAction[] {
    const actions: EnemyAction[] = [];
    const speed = this.data.speed * this.getSpeedMultiplier();
    const enrageScale = this.isEnraged() ? 1.25 : 1;
    const damage = this.data.damage * this.damageScale * enrageScale;

    if (this.kind === "crawler" && this.leapWindup > 0) {
      this.vx = Phaser.Math.Linear(this.vx, 0, 0.34);
      this.leapWindup -= dt;
      this.attackTimer = Math.max(this.attackTimer, 0.08);
      if (this.leapWindup <= 0) {
        this.vx = this.facing * 430;
        this.vy = -340;
        actions.push({
          type: "leap",
          hitbox: this.attackBounds(104, 76),
          damage: (this.data.leapDamage ?? 14) * this.damageScale,
          source: this,
        });
      }
      return actions;
    }

    if (this.kind === "horned_mutant" && this.slamWindup > 0) {
      this.vx = Phaser.Math.Linear(this.vx, 0, 0.42);
      this.slamWindup -= dt;
      this.attackTimer = Math.max(this.attackTimer, 0.1);
      if (this.slamWindup <= 0) {
        const impactX = this.sprite.x + this.facing * 118;
        actions.push({
          type: "slam",
          hitbox: {
            x: impactX - 92,
            y: PLATFORM_Y - 116,
            width: 184,
            height: 108,
          },
          damage: (this.data.slamDamage ?? 28) * this.damageScale * enrageScale,
          source: this,
          impactX,
        });
      }
      return actions;
    }

    if (this.kind === "crawler" && distance > 120 && distance < 280 && this.leapCooldown <= 0) {
      this.leapCooldown = 3;
      this.attackCooldown = 0.72;
      this.attackTimer = 0.26;
      this.leapWindup = 0.22;
      this.vx = -this.facing * 34;
      return actions;
    }

    if (this.kind === "horned_mutant" && distance < 215 && this.slamCooldown <= 0) {
      this.slamCooldown = 4 * (this.isEnraged() ? 0.8 : 1);
      this.attackCooldown = 0.94;
      this.attackTimer = 0.44;
      this.slamWindup = 0.36;
      this.vx = 0;
      return actions;
    }

    if (distance > this.data.stopDistance) {
      this.vx = Phaser.Math.Linear(this.vx, this.facing * speed, 0.08);
    } else if (distance < this.data.stopDistance * 0.62) {
      this.vx = Phaser.Math.Linear(this.vx, -this.facing * speed * 0.62, 0.1);
    } else {
      this.vx = Phaser.Math.Linear(this.vx, 0, 0.18);
      if (this.attackCooldown <= 0 && distance <= this.data.attackRange) {
        this.attackCooldown = this.data.attackCooldown * (this.isEnraged() ? 0.8 : 1);
        this.attackTimer = 0.22;
        actions.push({ type: "melee", hitbox: this.attackBounds(), damage, source: this });
      }
    }

    if (Math.abs(this.vx) > 8) this.step += dt * 8;
    return actions;
  }

  private updateFlying(dt: number, target: Player, distance: number): EnemyAction[] {
    const actions: EnemyAction[] = [];
    const speed = this.data.speed * this.getSpeedMultiplier();
    const desiredY = PLATFORM_Y - 210 + Math.sin(this.scene.time.now * 0.004 + this.bob) * 22;
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, desiredY, 0.045);

    if (distance > this.data.stopDistance) this.vx = Phaser.Math.Linear(this.vx, this.facing * speed, 0.05);
    else this.vx = Phaser.Math.Linear(this.vx, 0, 0.1);

    if (distance < this.data.attackRange && this.shotCooldown <= 0) {
      this.shotCooldown = 2;
      this.attackTimer = 0.18;
      actions.push({
        type: "shot",
        source: this,
        x: this.sprite.x + this.facing * 52,
        y: this.sprite.y - this.sprite.displayHeight * 0.46,
        damage: this.data.damage * this.damageScale,
        facing: this.facing,
      });
      this.facing = target.sprite.x >= this.sprite.x ? 1 : -1;
    }

    this.step += dt * 8;
    return actions;
  }

  private integrate(dt: number) {
    this.sprite.x += this.vx * dt;
    if (!this.data.flying) {
      this.vy += GRAVITY * dt;
      this.sprite.y += this.vy * dt;
      if (this.sprite.y >= PLATFORM_Y) {
        this.sprite.y = PLATFORM_Y;
        this.vy = 0;
      }
    }
  }

  private updateStatuses(dt: number) {
    for (const status of this.statuses) {
      status.duration -= dt;
      if (status.type !== "burn" && status.type !== "poison") continue;
      status.tick -= dt;
      if (status.tick <= 0) {
        status.tick += 0.5;
        this.hp = Math.max(0, this.hp - (status.type === "burn" ? 4 : 3));
        this.hurtTimer = Math.max(this.hurtTimer, 0.07);
        if (this.hp <= 0) {
          this.alive = false;
          this.statuses.length = 0;
          this.statusText.setVisible(false);
          this.statusVisuals.clear();
        }
      }
    }
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      if (this.statuses[i].duration <= 0) this.statuses.splice(i, 1);
    }
  }

  private refreshVisuals() {
    this.shadow.setPosition(this.sprite.x, PLATFORM_Y + 9);
    this.shadow.setScale(this.data.flying ? 0.76 : this.kind === "horned_mutant" ? 1.08 : 1, 1);
    const pulse = 0.5 + Math.sin(this.scene.time.now * 0.008 + this.bob) * 0.5;
    const auraColor = this.isEnraged() ? 0xff5b5b : this.statuses.some((status) => status.type === "poison") ? 0x58ff9c : 0x18e6ff;
    this.aura
      .setPosition(this.sprite.x, this.data.flying ? this.sprite.y - this.sprite.displayHeight * 0.38 : this.sprite.y - this.sprite.displayHeight * 0.46)
      .setSize(this.sprite.displayWidth * (this.kind === "horned_mutant" ? 0.82 : 0.68), this.sprite.displayHeight * (this.kind === "horned_mutant" ? 0.88 : 0.74))
      .setFillStyle(auraColor, this.hurtTimer > 0 ? 0.22 : this.isEnraged() ? 0.2 + pulse * 0.08 : 0.055 + pulse * 0.03);
    this.sprite.setFlipX(this.facing < 0);
    this.applyTexture(this.pickTexture());

    const primaryStatus = this.statuses[0];
    this.drawStatusVisuals();
    this.statusText
      .setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight - 16)
      .setVisible(Boolean(primaryStatus));
    if (primaryStatus) {
      const color =
        primaryStatus.type === "burn"
          ? "#ff7a32"
          : primaryStatus.type === "poison"
            ? "#4ef3a5"
            : primaryStatus.type === "slow"
              ? "#67f6ff"
              : "#ffef72";
      this.statusText.setText(primaryStatus.type.toUpperCase()).setColor(color);
    }

    if (this.hurtTimer > 0) {
      this.sprite.setTintFill(0xff5b5b);
      this.sprite.setAlpha(Math.floor(this.scene.time.now * 0.05) % 2 === 0 ? 0.62 : 1);
    } else if (this.isStunned()) {
      this.sprite.setTint(0xffef72);
      this.sprite.setAlpha(0.95);
    } else if (this.isEnraged()) {
      this.sprite.setTint(0xff6d57);
      this.sprite.setAlpha(1);
    } else if (this.statuses.some((status) => status.type === "poison")) {
      this.sprite.setTint(0x74ffb8);
      this.sprite.setAlpha(1);
    } else if (this.statuses.some((status) => status.type === "slow")) {
      this.sprite.setTint(0x8cf8ff);
      this.sprite.setAlpha(1);
    } else if (this.statuses.some((status) => status.type === "burn")) {
      this.sprite.setTint(0xff8a2a);
      this.sprite.setAlpha(1);
    } else {
      this.sprite.clearTint();
      this.sprite.setAlpha(1);
    }
  }

  private drawStatusVisuals() {
    this.statusVisuals.clear();
    const time = this.scene.time.now * 0.006;
    const topY = this.sprite.y - this.sprite.displayHeight * 0.72;
    const footY = this.data.flying ? this.sprite.y - 18 : PLATFORM_Y - 2;

    if (this.statuses.some((status) => status.type === "slow")) {
      this.statusVisuals.lineStyle(2, 0x67f6ff, 0.68);
      this.statusVisuals.strokeEllipse(this.sprite.x, footY, 74 + Math.sin(time) * 8, 18);
      this.statusVisuals.lineStyle(1, 0xc9fbff, 0.44);
      this.statusVisuals.strokeEllipse(this.sprite.x, footY, 48, 11);
    }

    if (this.isEnraged()) {
      const pulse = 0.5 + Math.sin(time * 2.2) * 0.18;
      this.statusVisuals.lineStyle(4, 0xff4c4c, 0.45 + pulse * 0.2);
      this.statusVisuals.strokeEllipse(this.sprite.x, footY - 2, 118 + pulse * 18, 24 + pulse * 5);
      this.statusVisuals.fillStyle(0xff2f2f, 0.09);
      this.statusVisuals.fillEllipse(this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.48, this.sprite.displayWidth * 0.78, this.sprite.displayHeight * 0.72);
    }

    if (this.statuses.some((status) => status.type === "burn")) {
      for (let i = 0; i < 3; i++) {
        const x = this.sprite.x - 18 + i * 18;
        const y = topY - 5 + Math.sin(time * 2 + i) * 5;
        this.statusVisuals.fillStyle(i === 1 ? 0xffd35a : 0xff6f22, 0.74);
        this.statusVisuals.fillTriangle(x, y + 16, x + 7, y - 7, x + 15, y + 16);
      }
    }

    if (this.statuses.some((status) => status.type === "poison")) {
      for (let i = 0; i < 4; i++) {
        const angle = time + i * 1.35;
        const x = this.sprite.x + Math.cos(angle) * 30;
        const y = topY + Math.sin(angle * 1.3) * 12;
        this.statusVisuals.fillStyle(0x58ff9c, 0.22);
        this.statusVisuals.fillCircle(x, y, 9 + Math.sin(time + i) * 2);
        this.statusVisuals.lineStyle(1, 0xb6ffd4, 0.35);
        this.statusVisuals.strokeCircle(x, y, 11);
      }
    }

    if (this.statuses.some((status) => status.type === "stun")) {
      this.statusVisuals.lineStyle(3, 0xffef72, 0.92);
      for (let i = 0; i < 3; i++) {
        const x = this.sprite.x - 24 + i * 24;
        const y = topY - 18 + Math.sin(time * 3 + i) * 5;
        this.statusVisuals.lineBetween(x, y, x + 9, y + 13);
        this.statusVisuals.lineBetween(x + 9, y + 13, x - 1, y + 25);
      }
    }
  }

  private nearestTarget(targets: Player[]) {
    const alive = targets.filter((target) => target.alive);
    if (alive.length === 0) return undefined;
    return alive.reduce((best, target) => {
      const currentDistance = Math.abs(target.sprite.x - this.sprite.x);
      const bestDistance = Math.abs(best.sprite.x - this.sprite.x);
      return currentDistance < bestDistance ? target : best;
    }, alive[0]);
  }

  private attackBounds(width = this.kind === "horned_mutant" ? 136 : 84, height = this.kind === "horned_mutant" ? 132 : 68): RectLike {
    return {
      x: this.sprite.x + this.facing * (width * 0.52) - width / 2,
      y: this.sprite.y - height - 18,
      width,
      height,
    };
  }

  private pickTexture() {
    if (this.attackTimer > 0 && this.data.attack) return this.data.attack;
    if (this.isEnraged() && this.scene.textures.exists(AssetKeys.bossRage)) return AssetKeys.bossRage;
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

  private isEnraged() {
    return this.kind === "horned_mutant" && this.hp <= this.maxHp * 0.4;
  }
}
