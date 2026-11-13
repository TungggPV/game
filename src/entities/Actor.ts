import Phaser from "phaser";
import { DEPTH, GRAVITY, GROUND_Y, type Team } from "../config/constants";
import type { StatusEffect, StatusKind } from "../config/heroes";
import type { GameScene } from "../scenes/GameScene";

export type Hit = {
  damage: number;
  dir: number;
  knock?: number;
  launch?: number;
  stun?: number;
  status?: StatusEffect;
  color: number;
  /** Ignore shields and super armour (skills, ultimates). */
  heavy?: boolean;
  source?: Actor;
};

const STATUS_TICK: Record<StatusKind, { every: number; damage: number; color: number }> = {
  burn: { every: 0.4, damage: 5, color: 0xff7a24 },
  poison: { every: 0.35, damage: 4, color: 0x7dff6a },
  slow: { every: 0, damage: 0, color: 0xffe14a },
  stun: { every: 0, damage: 0, color: 0xfff6a0 },
};

/** What an actor draws with: a plain image (enemies) or a skeletal rig (heroes). */
export interface ActorView {
  readonly depth: number;
  setTintFill(color: number): unknown;
  setTint(color: number): unknown;
  clearTint(): unknown;
  setAlpha(alpha: number): unknown;
  destroy(): void;
}

export abstract class Actor {
  abstract readonly view: ActorView;
  readonly shadow: Phaser.GameObjects.Ellipse;
  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing = 1;
  hp: number;
  maxHp: number;
  dead = false;
  invuln = 0;
  hitstun = 0;
  bodyW: number;
  bodyH: number;
  flying = false;
  /** Multiplies incoming knockback; heavy foes resist. */
  weight = 1;
  status: Partial<Record<StatusKind, { time: number; acc: number }>> = {};
  protected flashTime = 0;
  private statusAura?: Phaser.GameObjects.Image;

  abstract readonly team: Team;

  constructor(
    protected scene: GameScene,
    x: number,
    hp: number,
    body: { w: number; h: number },
  ) {
    this.x = x;
    this.hp = this.maxHp = hp;
    this.bodyW = body.w;
    this.bodyH = body.h;
    this.shadow = scene.add.ellipse(x, GROUND_Y + 2, body.w * 0.9, 16, 0x000000, 0.45).setDepth(DEPTH.shadow);
  }

  get onGround() {
    return !this.flying && this.y >= GROUND_Y - 0.5;
  }

  get cx() {
    return this.x;
  }

  get cy() {
    return this.y - this.bodyH / 2;
  }

  bounds() {
    return new Phaser.Geom.Rectangle(this.x - this.bodyW / 2, this.y - this.bodyH, this.bodyW, this.bodyH);
  }

  isSlowed() {
    return (this.status.slow?.time ?? 0) > 0;
  }

  isStunned() {
    return (this.status.stun?.time ?? 0) > 0;
  }

  applyStatus(effect: StatusEffect) {
    const cur = this.status[effect.kind];
    this.status[effect.kind] = { time: Math.max(cur?.time ?? 0, effect.time), acc: cur?.acc ?? 0 };
  }

  /** Returns damage actually dealt (0 if ignored). */
  takeHit(hit: Hit): number {
    if (this.dead || this.invuln > 0) return 0;
    const dealt = Math.max(1, Math.round(hit.damage));
    this.hp = Math.max(0, this.hp - dealt);
    this.flashTime = 0.09;
    const knock = (hit.knock ?? 120) * this.weight;
    this.vx = hit.dir * knock;
    if (hit.launch && !this.flying) this.vy = -hit.launch * this.weight;
    if (hit.status) this.applyStatus(hit.status);
    if (hit.stun) this.applyStatus({ kind: "stun", time: hit.stun });
    this.onHurt(hit, dealt);
    if (this.hp <= 0) this.die(hit);
    return dealt;
  }

  protected abstract onHurt(hit: Hit, dealt: number): void;
  protected abstract die(hit: Hit): void;

  protected physics(dt: number, friction: number) {
    if (!this.flying) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
      }
    }
    this.x += this.vx * dt;
    if (this.onGround || this.flying) this.vx *= Math.max(0, 1 - friction * dt);
    const [minX, maxX] = this.scene.arenaBounds();
    this.x = Phaser.Math.Clamp(this.x, minX + this.bodyW * 0.3, maxX - this.bodyW * 0.3);
  }

  protected updateStatus(dt: number) {
    let auraColor: number | null = null;
    for (const kind of Object.keys(this.status) as StatusKind[]) {
      const s = this.status[kind]!;
      s.time -= dt;
      if (s.time <= 0) {
        delete this.status[kind];
        continue;
      }
      auraColor ??= STATUS_TICK[kind].color;
      const tick = STATUS_TICK[kind];
      if (tick.every > 0) {
        s.acc += dt;
        while (s.acc >= tick.every && !this.dead) {
          s.acc -= tick.every;
          this.hp = Math.max(0, this.hp - tick.damage);
          this.scene.fx.number(this.cx, this.y - this.bodyH, tick.damage, tick.color);
          if (this.hp <= 0) this.die({ damage: 0, dir: this.facing, color: tick.color });
        }
      }
    }
    if (auraColor !== null && !this.dead) {
      this.statusAura ??= this.scene.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(this.view.depth - 1);
      this.statusAura
        .setPosition(this.cx, this.cy)
        .setTint(auraColor)
        .setScale((this.bodyW / 128) * 1.6, (this.bodyH / 128) * 1.3)
        .setAlpha(0.35 + Math.sin(this.scene.time.now / 90) * 0.15)
        .setVisible(true);
    } else {
      this.statusAura?.setVisible(false);
    }
  }

  protected renderCommon() {
    this.shadow.setPosition(this.x, GROUND_Y + 2);
    const height = Math.max(0, GROUND_Y - this.y);
    this.shadow.setScale(Math.max(0.35, 1 - height / 500)).setAlpha(this.flying ? 0.25 : 0.45);
    if (this.flashTime > 0) this.view.setTintFill(0xffffff);
    else if (this.isStunned()) this.view.setTint(0xfff6a0);
    else this.view.clearTint();
  }

  tickTimers(dt: number) {
    this.flashTime -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
  }

  destroy() {
    this.view.destroy();
    this.shadow.destroy();
    this.statusAura?.destroy();
  }
}
