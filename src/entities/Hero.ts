import Phaser from "phaser";
import { DEPTH, GROUND_Y, type SkillSlot } from "../config/constants";
import { baseMods, POWERUPS, type HeroMods, type PowerUpId } from "../config/content";
import type { HeroDef, SkillDef } from "../config/heroes";
import { animateHero, HERO_LOOKS, heroBones, heroRibbonAnchor, trailPoints, type AnimState, type CastKind, type WeaponStyle } from "../rig/heroRig";
import { Ribbon, Rig, WeaponTrail } from "../rig/Rig";
import { ACTIONS, type Action, type PlayerControls } from "../systems/controls";
import { PALETTE, type Palette } from "../systems/Fx";
import { sfx } from "../systems/sfx";
import { castSkill } from "../systems/skills";
import type { GameScene } from "../scenes/GameScene";
import { Actor, type Hit } from "./Actor";

type State = "free" | "attack" | "cast" | "dash" | "hurt" | "sweep" | "down";

/** Permanent bonuses from hero level and the workshop, resolved by the game scene. */
export type HeroBonus = { hpMul: number; hpAdd: number; damage: number; energy: number; cooldown: number; crit: number; magnet: number; revives: number };

export const NO_BONUS: HeroBonus = { hpMul: 1, hpAdd: 0, damage: 1, energy: 0, cooldown: 1, crit: 0, magnet: 0, revives: 0 };

const BUFFER = 0.18;
const DASH_TIME = 0.18;
const DASH_SPEED = 1150;
const JUMP_SPEED = 1000;

export class Hero extends Actor {
  readonly team = "hero" as const;
  readonly view: Rig;
  energy = 30;
  score = 0;
  kills = 0;
  damageDealt = 0;
  damageTaken = 0;
  downs = 0;
  perfectDodges = 0;
  mods: HeroMods = baseMods();
  cooldowns: Record<SkillSlot | "dash", number> = { basic: 0, skill1: 0, skill2: 0, ultimate: 0, dash: 0 };
  buffs: Partial<Record<PowerUpId, number>> = {};
  shield = 0;
  revives: number;
  magnet: number;
  state: State = "free";
  locked = false;
  reviveTimer = 0;
  private baseHp: number;
  private stateTime = 0;
  private stateDuration = 0;
  private castKind: CastKind = "shoot";
  private pendingCast?: { slot: SkillSlot; skill: SkillDef; at: number };
  private comboStep = 0;
  private comboWindow = 0;
  private queuedBasic = false;
  private meleeAt = -1;
  private jumpsLeft: number;
  private buffer = new Map<Action, number>();
  private ghostTimer = 0;
  private dodgeUsed = false;
  readonly pal: Palette;
  readonly style: WeaponStyle;
  private ribbons: Ribbon[] = [];
  private trails: { trail: WeaponTrail; pts: [string, number, number][] }[] = [];
  private anim = { stride: 0, land: 0, wasGround: true, stepSign: 1 };

  constructor(
    scene: GameScene,
    x: number,
    readonly def: HeroDef,
    readonly index: 0 | 1,
    readonly controls: PlayerControls,
    bonus: HeroBonus = NO_BONUS,
    hpOverride?: number,
  ) {
    const baseHp = hpOverride ?? Math.round((def.hp + bonus.hpAdd) * bonus.hpMul);
    super(scene, x, baseHp, { w: 70, h: 140 });
    this.baseHp = baseHp;
    this.jumpsLeft = def.jumps;
    this.pal = PALETTE[def.element];
    this.facing = index === 0 ? 1 : -1;
    this.mods.damage *= bonus.damage;
    this.mods.cooldown *= bonus.cooldown;
    this.mods.crit += bonus.crit;
    this.energy = Math.min(100, 30 + bonus.energy);
    this.revives = bonus.revives;
    this.magnet = bonus.magnet;

    const look = HERO_LOOKS[def.id];
    this.style = look.weapon;
    const depth = DEPTH.hero + index * 2;
    this.view = new Rig(scene, heroBones(def.id), 1, depth);
    this.view.facing = this.facing;
    this.view.turn = this.facing;

    const r = look.ribbon;
    const mk = (segments: number, len: number, width: number, gravity: number, colors = r.colors) =>
      new Ribbon(scene, x, this.y - 110, segments, len, width, colors, depth - 0.5, gravity, !!r.glow);
    if (r.kind === "scarf") this.ribbons.push(mk(8, 8, 7, 700));
    if (r.kind === "plume") this.ribbons.push(mk(6, 6, 9, -900));
    if (r.kind === "cape") this.ribbons.push(mk(6, 10, 20, 1100));
    if (r.kind === "twin") this.ribbons.push(mk(9, 8, 6, 650), mk(8, 8, 5, 750, [0x169e6a, 0x7dffc0]));

    for (const pts of trailPoints(this.style)) {
      this.trails.push({ trail: new WeaponTrail(scene, [this.pal.main, this.pal.light], depth + 1, this.style === "fists" ? 0.1 : 0.13), pts });
    }
    this.render(0);
  }

  get speed() {
    return this.def.speed * this.mods.speed * (this.isSlowed() ? 0.6 : 1) * (this.buffs.haste ? 1.35 : 1);
  }

  /** Total outgoing damage multiplier (power, upgrades, level, rage). */
  get damageMul() {
    return this.def.power * this.mods.damage * (this.buffs.rage ? 1.6 : 1);
  }

  get alive() {
    return !this.dead;
  }

  maxHpTotal() {
    return this.baseHp + this.mods.maxHp;
  }

  applyMods() {
    const ratio = this.hp / this.maxHp;
    this.maxHp = this.maxHpTotal();
    this.hp = this.mods.healFull ? this.maxHp : Math.round(this.maxHp * ratio);
    this.mods.healFull = false;
  }

  gainEnergy(amount: number) {
    this.energy = Math.min(100, this.energy + amount * this.mods.energyGain);
  }

  heal(amount: number) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  skill(slot: Exclude<SkillSlot, "basic">) {
    return this.def.skills[slot];
  }

  skillCost(slot: Exclude<SkillSlot, "basic">) {
    if (this.buffs.overcharge) return 0;
    return slot === "ultimate" ? this.mods.ultCost : this.skill(slot).cost;
  }

  canUse(slot: Exclude<SkillSlot, "basic">) {
    return this.cooldowns[slot] <= 0 && this.energy >= this.skillCost(slot);
  }

  addPowerUp(id: PowerUpId) {
    const def = POWERUPS[id];
    this.buffs[id] = def.duration;
    if (id === "shield") this.shield = 80;
    this.scene.fx.ring(this.x, this.y - 70, def.color, 150, 500);
    this.scene.fx.label(this.x, this.y - 190, def.name.toUpperCase(), Phaser.Display.Color.IntegerToColor(def.color).rgba);
  }

  /** Runs every frame, including hitstop frames, so presses during freeze-frames aren't lost. */
  readInput() {
    this.controls.poll();
    if (this.locked || this.dead) return;
    for (const a of ACTIONS) if (this.controls.just(a)) this.buffer.set(a, BUFFER);
  }

  update(dt: number) {
    this.tickTimers(dt);
    this.stateTime += dt;
    const cdRate = this.buffs.haste ? 1.6 : 1;
    for (const k of Object.keys(this.cooldowns) as (SkillSlot | "dash")[]) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt * cdRate);
    for (const [a, t] of this.buffer) {
      if (t - dt <= 0) this.buffer.delete(a);
      else this.buffer.set(a, t - dt);
    }
    for (const id of Object.keys(this.buffs) as PowerUpId[]) {
      const left = (this.buffs[id] ?? 0) - dt;
      if (left <= 0) {
        delete this.buffs[id];
        if (id === "shield") this.shield = 0;
      } else this.buffs[id] = left;
    }

    if (this.dead) {
      this.updateDown(dt);
      this.render(dt);
      return;
    }

    this.energy = Math.min(100, this.energy + dt * (this.scene.mode === "pk" ? 1 : 2) * this.mods.energyGain);
    if (this.mods.regen > 0) this.heal(this.mods.regen * dt);
    this.updateStatus(dt);
    if (this.dead) return;

    if (this.isStunned() || this.locked) {
      if (this.state !== "hurt") this.setState("free", 0);
      this.vx *= 0.8;
    } else {
      this.think();
    }

    if (this.onGround) this.jumpsLeft = this.def.jumps;
    const friction = this.state === "free" ? 0 : 7;
    this.physics(dt, this.state === "dash" || this.state === "sweep" ? 0 : friction);
    this.render(dt);
  }

  private take(a: Action) {
    if (!this.buffer.has(a)) return false;
    this.buffer.delete(a);
    return true;
  }

  private setState(state: State, duration: number) {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = duration;
  }

  private think() {
    const done = this.stateTime >= this.stateDuration;
    switch (this.state) {
      case "hurt":
        if (this.hitstun <= 0) this.setState("free", 0);
        return;
      case "dash":
        this.vy = 0;
        this.ghostTimer -= this.scene.dt;
        if (this.ghostTimer <= 0) {
          this.view.ghost(this.pal.main, 0.4, 220);
          this.ghostTimer = 0.035;
        }
        if (done) {
          this.vx *= 0.3;
          this.setState("free", 0);
        }
        return;
      case "sweep":
        return; // driven by the ultimate timeline in skills.ts
      case "attack":
        if (this.meleeAt >= 0 && this.stateTime >= this.meleeAt) {
          this.meleeAt = -1;
          this.doMelee();
        }
        if (this.take("basic")) this.queuedBasic = true;
        if (this.tryDash()) return;
        if (done) {
          if (this.queuedBasic && this.comboStep < 3) this.startBasic();
          else this.setState("free", 0);
        }
        return;
      case "cast":
        if (this.pendingCast && this.stateTime >= this.pendingCast.at) {
          const { slot, skill } = this.pendingCast;
          this.pendingCast = undefined;
          castSkill(this.scene, this, slot, skill);
        }
        if (done) this.setState("free", 0);
        return;
      case "free":
        this.freeMove();
    }
  }

  private freeMove() {
    const dir = (this.controls.down("right") ? 1 : 0) - (this.controls.down("left") ? 1 : 0);
    const target = dir * this.speed;
    const accel = this.onGround ? 14 : 8;
    this.vx += (target - this.vx) * Math.min(1, accel * this.scene.dt);
    if (dir !== 0) this.facing = dir;

    if (this.take("jump") && this.jumpsLeft > 0) {
      const air = !this.onGround;
      this.jumpsLeft -= 1;
      this.vy = -JUMP_SPEED * (air ? 0.85 : 1);
      this.y = Math.min(this.y, GROUND_Y - 1);
      sfx.jump();
      if (air) {
        this.scene.fx.ring(this.x, this.y - 10, this.pal.main, 70, 300, 0.35);
        this.scene.fx.particles(this.x, this.y - 10, "streak", {
          speed: { min: 120, max: 260 }, angle: { min: 60, max: 120 }, lifespan: 240,
          scale: { start: 0.5, end: 0 }, color: [0xffffff, this.pal.main], blendMode: Phaser.BlendModes.ADD, rotate: 90,
        }, 6);
      } else {
        this.scene.fx.dust(this.x, 1, 0.8);
        this.scene.fx.dust(this.x, -1, 0.8);
      }
    }
    if (this.tryDash()) return;

    this.comboWindow -= this.scene.dt;
    if (this.comboWindow <= 0) this.comboStep = 0;

    if (this.take("ultimate")) this.tryCast("ultimate");
    else if (this.take("skill2")) this.tryCast("skill2");
    else if (this.take("skill1")) this.tryCast("skill1");
    else if (this.take("basic")) {
      if (this.comboStep >= 3) this.comboStep = 0;
      this.startBasic();
    }
  }

  private tryDash() {
    if (!this.take("dash") || this.cooldowns.dash > 0) return false;
    const dir = (this.controls.down("right") ? 1 : 0) - (this.controls.down("left") ? 1 : 0);
    if (dir !== 0) this.facing = dir;
    this.cooldowns.dash = 0.55 * this.mods.dashCooldown;
    this.invuln = Math.max(this.invuln, DASH_TIME + 0.06);
    this.vx = this.facing * DASH_SPEED;
    this.vy = 0;
    this.queuedBasic = false;
    this.dodgeUsed = false;
    this.pendingCast = undefined;
    this.setState("dash", DASH_TIME);
    this.scene.fx.dust(this.x, this.facing, 1.2);
    sfx.dash();
    return true;
  }

  /** True once per dash when an attack is avoided early in the dash. */
  tryPerfectDodge() {
    if (this.state !== "dash" || this.dodgeUsed || this.stateTime > this.mods.dodgeWindow + 0.04) return false;
    this.dodgeUsed = true;
    this.perfectDodges += 1;
    return true;
  }

  private startBasic() {
    this.queuedBasic = false;
    this.comboStep += 1;
    this.comboWindow = 0.6;
    const b = this.def.basic;
    this.setState("attack", b.interval + (this.comboStep === 3 ? 0.16 : 0.08));
    this.meleeAt = Math.min(0.06, this.stateDuration * 0.22);
    if (this.onGround) this.vx = this.facing * (this.comboStep === 3 ? 360 : 180);
    else this.vy = Math.min(this.vy, -120);
    sfx.swing();
  }

  private doMelee() {
    const b = this.def.basic;
    const finisher = this.comboStep === 3;
    const range = b.range * (finisher ? 1.25 : 1);
    const rect = new Phaser.Geom.Rectangle(this.facing > 0 ? this.x - 10 : this.x - range + 10, this.y - 150, range, 140);
    if (finisher) {
      this.scene.fx.slash(this.x + this.facing * range * 0.35, this.y - 80, this.facing, this.pal, { scale: 1.3, tilt: 0, sweep: 1.6, duration: 240, thin: true });
      this.scene.fx.dust(this.x, this.facing, 1);
    }
    const hits = this.scene.meleeHit(this, rect, {
      damage: b.combo[this.comboStep - 1],
      dir: this.facing,
      knock: finisher ? 480 : 140,
      launch: finisher ? 420 : 0,
      color: b.color,
      status: finisher ? b.finisherStatus : undefined,
      source: this,
    });
    if (hits > 0) this.gainEnergy(4 * hits);
  }

  private tryCast(slot: Exclude<SkillSlot, "basic">) {
    const skill = this.skill(slot);
    if (this.cooldowns[slot] > 0) return;
    const cost = this.skillCost(slot);
    if (this.energy < cost) {
      this.scene.fx.label(this.x, this.y - 170, "Thiếu năng lượng", "#9fb3c8");
      return;
    }
    this.energy -= cost;
    this.cooldowns[slot] = skill.cooldown * (slot === "ultimate" ? 1 : this.mods.cooldown);
    this.castKind =
      slot === "ultimate"
        ? skill.kind === "sweep" ? "sweep" : skill.kind === "strikes" ? "strikes" : "screen"
        : skill.kind === "projectile" ? "shoot" : skill.kind === "field" ? "field" : "burst";
    const windup = slot === "ultimate" ? 0.32 : skill.kind === "projectile" ? 0.08 : 0.1;
    this.pendingCast = { slot, skill, at: windup };
    this.setState("cast", windup + (slot === "ultimate" ? 0.35 : 0.26));
    if (slot === "ultimate") {
      this.invuln = Math.max(this.invuln, 0.9);
      this.scene.ultimateIntro(this, skill);
    }
    if (this.onGround) this.vx = 0;
    else this.vy = Math.min(this.vy, 0);
  }

  /** Used by the Emerald Mirage ultimate. */
  enterSweep(duration: number) {
    this.setState("sweep", duration);
    this.invuln = duration + 0.2;
  }

  endSweep() {
    this.setState("free", 0);
    this.vx = 0;
  }

  /** Snapshot for afterimages after the hero was teleported this frame. */
  ghostAt(x: number, color: number, alpha = 0.5, duration = 280) {
    this.view.container.setX(x);
    this.view.ghost(color, alpha, duration);
  }

  takeHit(hit: Hit) {
    if (this.dead || this.invuln > 0) return 0;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, hit.damage);
      this.shield -= absorbed;
      this.scene.fx.ring(this.cx, this.cy, POWERUPS.shield.color, 90, 240);
      if (this.shield <= 0) {
        delete this.buffs.shield;
        this.scene.fx.shards(this.cx, this.cy, { main: POWERUPS.shield.color, light: 0xffffff, dark: 0x2060a0 }, 14, 500);
      }
      if (hit.damage - absorbed <= 0) {
        this.invuln = 0.25;
        return 0;
      }
      hit = { ...hit, damage: hit.damage - absorbed };
    }
    return super.takeHit(hit);
  }

  protected onHurt(hit: Hit, dealt: number) {
    sfx.hurt();
    this.damageTaken += dealt;
    this.scene.fx.number(this.cx, this.y - 160, dealt, 0xff5a6a);
    this.gainEnergy(3);
    this.facing = -hit.dir || this.facing;
    if (this.state !== "cast" || dealt > 20) {
      this.pendingCast = undefined;
      this.hitstun = 0.28;
      this.setState("hurt", 0.28);
    }
    this.invuln = 0.45;
    this.scene.onHeroHurt(this, dealt);
  }

  protected die() {
    this.dead = true;
    this.hp = 0;
    this.downs += 1;
    this.state = "down";
    this.reviveTimer = this.revives > 0 ? 1.6 : 8;
    this.vy = -500;
    this.status = {};
    this.buffs = {};
    this.shield = 0;
    this.trails.forEach((t) => t.trail.clear());
    this.scene.onHeroDown(this);
  }

  revive(hpRatio: number) {
    this.dead = false;
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.invuln = 2;
    this.setState("free", 0);
    this.scene.fx.pillar(this.x, this.pal.main, 1.2, 1, 600);
    this.scene.fx.ring(this.x, this.y - 70, this.pal.light, 160);
    this.scene.fx.label(this.x, this.y - 190, "HỒI SINH!", "#9ff8ff");
  }

  private updateDown(dt: number) {
    this.physics(dt, 6);
    if (this.scene.phase === "over") return;
    if (this.revives > 0) {
      this.reviveTimer -= dt;
      if (this.reviveTimer <= 0) {
        this.revives -= 1;
        this.revive(0.5);
        this.scene.fx.label(this.x, this.y - 220, `Lõi Hồi Sinh (còn ${this.revives})`, "#ffe45c");
      }
    } else if (this.scene.coop && this.scene.anyHeroAlive()) {
      this.reviveTimer -= dt;
      if (this.reviveTimer <= 0) this.revive(0.5);
    }
  }

  // ---------- rendering ----------

  private animState(): AnimState {
    if (this.dead) return "down";
    if (this.isStunned()) return "stun";
    switch (this.state) {
      case "hurt":
        return "hurt";
      case "dash":
        return "dash";
      case "sweep":
        return "sweep";
      case "attack":
        return "attack";
      case "cast":
        return "cast";
    }
    if (!this.onGround) return "air";
    return Math.abs(this.vx) > 40 ? "run" : "idle";
  }

  private render(dt: number) {
    const a = this.anim;
    const grounded = this.onGround;
    if (grounded && !a.wasGround && !this.dead && dt > 0) {
      a.land = 1;
      this.scene.fx.dust(this.x, 1, 0.7);
      this.scene.fx.dust(this.x, -1, 0.7);
    }
    a.wasGround = grounded;
    a.land = Math.max(0, a.land - dt * 5);

    const state = this.animState();
    if (state === "run") {
      a.stride += (Math.abs(this.vx) * dt) / 40;
      const sign = Math.sin(a.stride) >= 0 ? 1 : -1;
      if (sign !== a.stepSign) {
        a.stepSign = sign;
        this.scene.fx.dust(this.x - this.facing * 10, this.facing, 0.4);
      }
    }

    const progress = this.stateDuration > 0 ? Math.min(1, this.stateTime / this.stateDuration) : 0;
    const out = animateHero(this.style, {
      state,
      progress,
      combo: this.comboStep,
      cast: this.castKind,
      vx: this.vx,
      vy: this.vy,
      speedRef: this.def.speed,
      stride: a.stride,
      time: this.scene.time.now / 1000,
      land: a.land,
    });

    const rig = this.view;
    // Commit to the new facing quickly during attacks so swings never play backwards.
    rig.facing = this.facing;
    if (dt === 0) rig.snap(out.pose, out.root);
    rig.update(dt, this.x, this.y, out.pose, out.root, out.stiffness, Math.min(out.stiffness, 30));

    const now = this.scene.time.now / 1000;
    for (const t of this.trails) {
      t.trail.active = out.trail && !this.dead;
      t.trail.update(now, rig.point(t.pts[0][0], t.pts[0][1], t.pts[0][2]), rig.point(t.pts[1][0], t.pts[1][1], t.pts[1][2]));
    }

    const [bone, lx, ly] = heroRibbonAnchor(HERO_LOOKS[this.def.id].ribbon.kind);
    this.ribbons.forEach((r, i) => {
      const p = rig.point(bone, lx + i * 3, ly + i * 4);
      r.update(dt || 1 / 60, p.x, p.y, -this.facing * 320 - this.vx * 0.8, now + i);
    });

    this.renderCommon();
    if (this.buffs.rage && this.flashTime <= 0) rig.setTint(0xffb0a0);
    let alpha = this.dead ? 0.6 : 1;
    if (this.invuln > 0 && !this.dead && this.state !== "dash" && this.state !== "sweep" && this.state !== "cast") {
      alpha = 0.55 + Math.sin(this.scene.time.now / 35) * 0.35;
    }
    rig.setAlpha(alpha);
    this.ribbons.forEach((r) => r.setAlpha(alpha));
  }

  destroy() {
    super.destroy();
    this.ribbons.forEach((r) => r.destroy());
    this.trails.forEach((t) => t.trail.destroy());
  }
}
