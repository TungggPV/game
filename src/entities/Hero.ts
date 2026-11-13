import Phaser from "phaser";
import { DEPTH, GROUND_Y, type SkillSlot } from "../config/constants";
import { baseMods, type HeroMods } from "../config/content";
import type { HeroDef, SkillDef } from "../config/heroes";
import { anchorX, artFacesLeft, heroKey, textureHeight, type HeroPose } from "../systems/assets";
import { ACTIONS, type Action, type PlayerControls } from "../systems/controls";
import { PALETTE, type Palette } from "../systems/Fx";
import { sfx } from "../systems/sfx";
import { castSkill } from "../systems/skills";
import type { GameScene } from "../scenes/GameScene";
import { Actor, type Hit } from "./Actor";

type State = "free" | "attack" | "cast" | "dash" | "hurt" | "sweep" | "down";

const HERO_HEIGHT = 150;
const BUFFER = 0.18;
const DASH_TIME = 0.18;
const DASH_SPEED = 1150;
const JUMP_SPEED = 1000;

export class Hero extends Actor {
  readonly team = "hero" as const;
  energy = 30;
  score = 0;
  kills = 0;
  mods: HeroMods = baseMods();
  cooldowns: Record<SkillSlot | "dash", number> = { basic: 0, skill1: 0, skill2: 0, ultimate: 0, dash: 0 };
  state: State = "free";
  locked = false;
  reviveTimer = 0;
  private stateTime = 0;
  private stateDuration = 0;
  private castPose: HeroPose = "attack_blast";
  private pendingCast?: { slot: SkillSlot; skill: SkillDef; at: number };
  private comboStep = 0;
  private comboWindow = 0;
  private queuedBasic = false;
  private meleeAt = -1;
  private jumpsLeft: number;
  private buffer = new Map<Action, number>();
  private scaleFactor: number;
  private ghostTimer = 0;
  private readonly pal: Palette;
  private readonly hasWalk: boolean;
  // Procedural animation state: spring-driven squash/stretch, smoothed lean and turn.
  private anim = { sx: 1, sy: 1, vx: 0, vy: 0, lean: 0, turn: 1, stride: 0, dust: 0, wasGround: true, lastKey: "" };

  constructor(
    scene: GameScene,
    x: number,
    readonly def: HeroDef,
    readonly index: 0 | 1,
    readonly controls: PlayerControls,
    hpOverride?: number,
  ) {
    super(scene, x, heroKey(def.id, "idle"), hpOverride ?? def.hp, { w: 70, h: 140 }, DEPTH.hero + index);
    this.scaleFactor = HERO_HEIGHT / textureHeight(heroKey(def.id, "idle"));
    this.jumpsLeft = def.jumps;
    this.pal = PALETTE[def.element];
    this.hasWalk = scene.textures.exists(heroKey(def.id, "walk_1"));
    this.facing = index === 0 ? 1 : -1;
  }

  get speed() {
    return this.def.speed * this.mods.speed * (this.isSlowed() ? 0.6 : 1);
  }

  get alive() {
    return !this.dead;
  }

  maxHpTotal() {
    return this.def.hp + this.mods.maxHp;
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

  canUse(slot: Exclude<SkillSlot, "basic">) {
    const s = this.skill(slot);
    return this.cooldowns[slot] <= 0 && this.energy >= s.cost;
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
    for (const k of Object.keys(this.cooldowns) as (SkillSlot | "dash")[]) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    for (const [a, t] of this.buffer) {
      if (t - dt <= 0) this.buffer.delete(a);
      else this.buffer.set(a, t - dt);
    }

    if (this.dead) {
      this.updateDown(dt);
      this.render(dt);
      return;
    }

    this.energy = Math.min(100, this.energy + dt * (this.scene.mode === "pk" ? 1 : 2) * this.mods.energyGain);
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
          this.scene.fx.afterimage(this.sprite, this.pal.main);
          this.ghostTimer = 0.03;
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
    const accel = this.onGround ? 18 : 10;
    this.vx += (target - this.vx) * Math.min(1, accel * this.scene.dt);
    if (dir !== 0) this.facing = dir;

    if (this.take("jump") && this.jumpsLeft > 0) {
      const air = !this.onGround;
      this.jumpsLeft -= 1;
      this.vy = -JUMP_SPEED * (air ? 0.85 : 1);
      this.y = Math.min(this.y, GROUND_Y - 1);
      this.impulse(0.8, 1.25);
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
    this.setState("dash", DASH_TIME);
    this.impulse(1.25, 0.82);
    this.scene.fx.dust(this.x, this.facing, 1.2);
    sfx.dash();
    return true;
  }

  private startBasic() {
    this.queuedBasic = false;
    this.comboStep += 1;
    this.comboWindow = 0.55;
    const b = this.def.basic;
    this.setState("attack", b.interval + (this.comboStep === 3 ? 0.14 : 0.06));
    this.meleeAt = 0.05;
    if (this.onGround) this.vx = this.facing * (this.comboStep === 3 ? 360 : 180);
    else this.vy = Math.min(this.vy, -120);
    sfx.swing();
    this.impulse(1.1, 0.94);
  }

  private doMelee() {
    const b = this.def.basic;
    const finisher = this.comboStep === 3;
    const range = b.range * (finisher ? 1.25 : 1);
    const rect = new Phaser.Geom.Rectangle(this.facing > 0 ? this.x - 10 : this.x - range + 10, this.y - 150, range, 140);
    const step = this.comboStep;
    const tilt = step === 1 ? 0.45 : step === 2 ? -0.45 : 0;
    this.scene.fx.slash(this.x + this.facing * range * 0.3, this.y - 82, this.facing, this.pal, {
      scale: finisher ? 1.5 : 1.1,
      tilt,
      sweep: finisher ? 1.8 : 1.3,
      duration: finisher ? 280 : 200,
      thin: !finisher,
    });
    if (finisher) this.scene.fx.dust(this.x, this.facing, 1);
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
    if (this.energy < skill.cost) {
      this.scene.fx.label(this.x, this.y - 170, "Thiếu năng lượng", "#9fb3c8");
      return;
    }
    this.energy -= skill.cost;
    this.cooldowns[slot] = skill.cooldown * (slot === "ultimate" ? 1 : this.mods.cooldown);
    this.castPose = skill.kind === "projectile" ? "attack_blast" : skill.kind === "sweep" || skill.kind === "burst" ? "attack_slash" : "attack_blast";
    const windup = slot === "ultimate" ? 0.32 : 0.08;
    this.pendingCast = { slot, skill, at: windup };
    this.setState("cast", windup + (slot === "ultimate" ? 0.35 : 0.24));
    this.impulse(0.9, 1.1);
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

  protected onHurt(hit: Hit, dealt: number) {
    sfx.hurt();
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
    this.state = "down";
    this.reviveTimer = 8;
    this.vy = -500;
    this.status = {};
    this.scene.onHeroDown(this);
  }

  revive(hpRatio: number) {
    this.dead = false;
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.invuln = 2;
    this.setState("free", 0);
    this.scene.fx.ring(this.x, this.y - 70, this.def.color, 140);
    this.scene.fx.label(this.x, this.y - 180, "HỒI SINH!", "#9ff8ff");
  }

  private updateDown(dt: number) {
    this.physics(dt, 6);
    if (this.scene.mode === "coop" && this.scene.anyHeroAlive()) {
      this.reviveTimer -= dt;
      if (this.reviveTimer <= 0) this.revive(0.5);
    }
  }

  private pose(): HeroPose {
    if (this.dead || this.state === "hurt") return "hit_reaction";
    if (this.state === "dash" || this.state === "sweep") return "dash";
    if (this.state === "attack") return "attack_slash";
    if (this.state === "cast") return this.castPose;
    if (!this.onGround) return "jump";
    if (this.hasWalk && Math.abs(this.vx) > 60) return `walk_${(Math.floor(this.anim.stride) % 4) + 1}` as HeroPose;
    return "idle";
  }

  /** Kick the squash/stretch spring; it settles back to 1 on its own. */
  impulse(sx: number, sy: number) {
    this.anim.sx = sx;
    this.anim.sy = sy;
    this.anim.vx = 0;
    this.anim.vy = 0;
  }

  private render(dt: number) {
    const a = this.anim;
    const grounded = this.onGround;
    const speed = Math.abs(this.vx);
    const running = grounded && speed > 60 && (this.state === "free" || this.state === "hurt");

    // Landing squash + dust.
    if (grounded && !a.wasGround && !this.dead) {
      this.impulse(1.22, 0.78);
      this.scene.fx.dust(this.x, 1, 0.7);
      this.scene.fx.dust(this.x, -1, 0.7);
    }
    a.wasGround = grounded;

    // Critically damped-ish spring toward scale 1.
    const k = 520;
    const c = 26;
    a.vx += ((1 - a.sx) * k - a.vx * c) * dt;
    a.vy += ((1 - a.sy) * k - a.vy * c) * dt;
    a.sx += a.vx * dt;
    a.sy += a.vy * dt;

    // Stride advances with distance covered so feet don't skate.
    if (running) a.stride += (speed * dt) / 34;
    else a.stride = 0;

    const pose = this.pose();
    const key = heroKey(this.def.id, pose);
    if (key !== a.lastKey) {
      this.sprite.setTexture(key);
      if (!pose.startsWith("walk") && !a.lastKey.includes("walk")) this.impulse(a.sx * 1.04, a.sy * 0.97);
      a.lastKey = key;
    }

    // Turning squeezes through zero width instead of snapping.
    a.turn += (this.facing - a.turn) * Math.min(1, dt * 28);
    const sign = a.turn >= 0 ? 1 : -1;
    const turnScale = Math.max(0.2, Math.abs(a.turn));

    const ax = pose === "jump" ? 0.5 : anchorX(key);
    const flip = (sign < 0) !== artFacesLeft(key);
    this.sprite.setFlipX(flip).setOrigin(flip ? 1 - ax : ax, 1);

    const t = this.scene.time.now / 1000;
    let leanTarget = 0;
    let yOff = 0;
    let breathe = 0;
    if (running) {
      leanTarget = (this.vx / (this.def.speed * 1.2)) * 0.1;
      const cycle = a.stride * Math.PI * (this.hasWalk ? 0.5 : 1);
      yOff = -Math.abs(Math.sin(cycle)) * (this.hasWalk ? 4 : 8);
      breathe = Math.cos(cycle * 2) * 0.03;
      a.dust -= dt;
      if (a.dust <= 0) {
        this.scene.fx.dust(this.x - this.facing * 20, this.facing, 0.45);
        a.dust = 0.16;
      }
    } else if (!grounded && !this.dead) {
      leanTarget = Phaser.Math.Clamp(this.vy / 1400, -0.5, 0.5) * 0.25 * this.facing + (this.vx / 2400);
    } else if (pose === "idle") {
      breathe = Math.sin(t * 3) * 0.018;
    } else if (this.state === "dash" || this.state === "sweep") {
      leanTarget = this.facing * 0.12;
    } else if (this.state === "hurt") {
      leanTarget = -this.facing * 0.15;
    }
    if (this.dead) leanTarget = -this.facing * 0.3;
    a.lean += (leanTarget - a.lean) * Math.min(1, dt * 14);

    const base = this.scaleFactor;
    const sx = base * a.sx * (1 - breathe * 0.5) * turnScale;
    const sy = base * a.sy * (1 + breathe) * (this.dead ? 0.9 : 1);
    this.sprite.setPosition(this.x, this.y + yOff).setScale(sx, sy).setRotation(a.lean);
    this.renderCommon();
    if (this.invuln > 0 && !this.dead && this.state !== "dash" && this.state !== "sweep" && this.state !== "cast") {
      this.sprite.setAlpha(0.55 + Math.sin(this.scene.time.now / 35) * 0.35);
    } else {
      this.sprite.setAlpha(this.dead ? 0.55 : 1);
    }
  }
}
