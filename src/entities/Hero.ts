import Phaser from "phaser";
import { DEPTH, GROUND_Y, type SkillSlot } from "../config/constants";
import { baseMods, type HeroMods } from "../config/content";
import type { HeroDef, SkillDef } from "../config/heroes";
import { getSelectedSkin, getSkinDef } from "../config/heroes";
import { anchorX, artFacesLeft, heroKey, textureHeight, type HeroPose } from "../systems/assets";
import { ACTIONS, type Action, type Controls } from "../systems/controls";
import { getDifficultyModifiers } from "../systems/difficulty";
import { PALETTE, type Palette } from "../systems/Fx";
import { AfterimageRingBuffer, expDecay, ProceduralSmearArc } from "../systems/motionSynth";
import type { ArmorCore } from "../systems/armorCores";
import { sfx } from "../systems/sfx";
import { castSkill } from "../systems/skills";
import type { GameScene } from "../scenes/GameScene";
import { Actor, type Hit } from "./Actor";

type State = "free" | "attack" | "cast" | "dash" | "hurt" | "sweep" | "down";

const HERO_HEIGHT = 178;
const BUFFER = 0.22;
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
  equippedCores: ArmorCore[] = [];
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
  readonly afterimages: AfterimageRingBuffer;
  readonly smearArc: ProceduralSmearArc;
  private comboAura?: Phaser.GameObjects.Image;
  private hexShield?: Phaser.GameObjects.Image;
  private energyScarf: Phaser.GameObjects.Graphics;
  private armorOverlayGfx: Phaser.GameObjects.Graphics;
  private weaponGlow?: Phaser.GameObjects.Image;
  overdriveTimer = 0;

  constructor(
    scene: GameScene,
    x: number,
    readonly def: HeroDef,
    readonly index: 0 | 1,
    readonly controls: Controls,
    hpOverride?: number,
  ) {
    super(scene, x, heroKey(def.id, "idle"), hpOverride ?? def.hp, { w: 84, h: 168 }, DEPTH.hero + index);
    this.scaleFactor = HERO_HEIGHT / textureHeight(heroKey(def.id, "idle"));
    this.jumpsLeft = def.jumps;
    this.pal = PALETTE[def.element];
    this.hasWalk = scene.textures.exists(heroKey(def.id, "walk_1"));
    this.facing = index === 0 ? 1 : -1;
    this.applyMods();
    const upEnergy = (this.mods.energyGain - 1) * 100;
    this.energy = 30 + Math.max(0, Math.round(upEnergy));
    this.afterimages = new AfterimageRingBuffer(scene, DEPTH.hero - 1);
    this.smearArc = new ProceduralSmearArc(scene);
    this.comboAura = scene.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.hero - 1).setVisible(false);
    this.energyScarf = scene.add.graphics().setDepth(DEPTH.hero + index - 1);
    this.energyScarf.setBlendMode(Phaser.BlendModes.ADD);
    this.armorOverlayGfx = scene.add.graphics().setDepth(DEPTH.hero + index + 1);
    this.armorOverlayGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.weaponGlow = scene.add.image(0, 0, "core").setScale(0.45).setTint(this.pal.main).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.hero + index + 2).setVisible(false);

    if (def.id === "obsidian_warden") {
      this.hexShield = scene.add
        .image(x, this.cy, "hex_shield")
        .setScale(0.85)
        .setTint(0xffb74d)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.hero + index + 1);
    }
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

  get dodging() {
    return this.state === "dash";
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
    this.capturePrevTransform();
    this.afterimages.update(dt);
    this.smearArc.update(dt);
    if (this.overdriveTimer > 0) this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);

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

    const disp = Math.hypot(this.x - this.prevX, this.y - this.prevY);
    if (disp > 16 && (this.state === "dash" || this.state === "sweep" || this.overdriveTimer > 0)) {
      this.afterimages.emitIntermediate(
        this.prevX,
        this.prevY,
        this.x,
        this.y,
        this.sprite.texture.key,
        this.pal.main,
        this.sprite.scaleX,
        this.sprite.scaleY,
        this.sprite.rotation,
        3,
      );
    }

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
        if (this.buffer.has("ultimate")) {
          this.tryCast("ultimate");
        }
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
        if (this.meleeAt < 0 && this.stateTime >= 0.09) {
          if (this.take("skill1")) {
            this.tryCast("skill1");
            return;
          }
          if (this.take("skill2")) {
            this.tryCast("skill2");
            return;
          }
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
        if (this.stateTime >= 0.15 && this.tryDash()) return;
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
    this.invuln = Math.max(this.invuln, (DASH_TIME + 0.06) * getDifficultyModifiers().dodgeWindowMult);
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
    const tilt = step === 1 ? -0.18 : step === 2 ? 0.18 : 0;
    this.scene.fx.slash(this.x + this.facing * range * 0.42, this.y - 88, this.facing, this.pal, {
      scale: finisher ? 1.45 : 1.1,
      tilt,
      sweep: finisher ? 0.82 : 0.6,
      duration: finisher ? 280 : 200,
      thin: !finisher,
    });
    if (finisher) this.scene.fx.dust(this.x, this.facing, 1);
    if (finisher && !this.onGround) {
      this.vy = Math.max(this.vy, 900);
    }
    const hits = this.scene.meleeHit(this, rect, {
      damage: b.combo[this.comboStep - 1],
      dir: this.facing,
      knock: finisher ? (this.onGround ? 480 : 260) : 140,
      launch: finisher ? (this.onGround ? 420 : 0) : 0,
      color: b.color,
      status: finisher ? b.finisherStatus : undefined,
      source: this,
    });
    if (hits > 0) this.gainEnergy(4 * hits);
    if (this.overdriveTimer > 0) {
      const pStyle = this.def.element === "earth" ? "earth" : this.def.element === "fire" ? "fire" : this.def.element === "volt" ? "volt" : "plasma";
      this.scene.spawnProjectile({
        owner: this,
        x: this.x + this.facing * 40,
        y: this.cy,
        vx: this.facing * 750,
        vy: 0,
        size: 20,
        color: this.pal.main,
        pierce: 2,
        style: pStyle,
        hit: { damage: 28, dir: this.facing, knock: 240, color: this.pal.main, heavy: true },
      });
    }
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
    if (slot === "ultimate") this.overdriveTimer = 6.0;
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
      this.scene.fx.ring(this.x, GROUND_Y - 4, this.pal.main, 100, 260, 0.25);
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
    a.turn = expDecay(a.turn, this.facing, 28, dt);
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
      leanTarget = (this.vx / (this.def.speed * 1.2)) * 0.15;
      const cycle = a.stride * Math.PI * (this.hasWalk ? 0.5 : 1);
      yOff = -Math.abs(Math.sin(cycle)) * 6;
      breathe = Math.cos(cycle * 2) * 0.03;
      a.dust -= dt;
      if (a.dust <= 0) {
        this.scene.fx.dust(this.x - this.facing * 24, this.facing, 0.45);
        a.dust = 0.16;
      }
    } else if (!grounded && !this.dead) {
      leanTarget = Phaser.Math.Clamp(this.vy / 1400, -0.5, 0.5) * 0.25 * this.facing + (this.vx / 2400);
    } else if (pose === "idle") {
      breathe = Math.sin(t * 3) * 0.018;
    } else if (this.state === "dash" || this.state === "sweep") {
      leanTarget = this.facing * 0.15;
    } else if (this.state === "hurt") {
      leanTarget = -this.facing * 0.18;
    }
    if (this.dead) leanTarget = -this.facing * 0.3;
    a.lean = expDecay(a.lean, leanTarget, 16, dt);

    const base = this.scaleFactor;
    // Velocity-driven deformation
    const stretchY = 1 + Math.min(0.25, Math.abs(this.vy) * 0.00015);
    const squashX = 1 / Math.sqrt(stretchY);
    const sx = base * a.sx * squashX * (1 - breathe * 0.5) * turnScale;
    const sy = base * a.sy * stretchY * (1 + breathe) * (this.dead ? 0.9 : 1);
    this.sprite.setPosition(this.x, this.y + yOff).setScale(sx, sy).setRotation(a.lean);
    this.renderCommon();

    // 60FPS Procedural Energy Cape + Front/Back Armor Sub-Rig (Reactor, Visor Glint, Thrusters, Orbiting Shards, Weapon Aura)
    this.drawProceduralRig(t, yOff, running, grounded);

    // 2. Weapon Glow streak at hand during attack
    if (this.state === "attack" && !this.dead) {
      const wx = this.x + this.facing * 38;
      const wy = this.y - 70;
      this.weaponGlow?.setVisible(true).setPosition(wx, wy).setScale(0.5 + Math.sin(this.scene.time.now / 80) * 0.15);
    } else {
      this.weaponGlow?.setVisible(false);
    }

    if (this.scene.combo >= 15 && !this.dead) {
      const pulse = 1.4 + Math.sin(this.scene.time.now / 110) * 0.2;
      this.comboAura
        ?.setVisible(true)
        .setPosition(this.cx, this.cy)
        .setTint(this.pal.main)
        .setScale(pulse * (this.bodyW / 110), pulse * (this.bodyH / 110))
        .setAlpha(0.45);
    } else {
      this.comboAura?.setVisible(false);
    }

    if (this.invuln > 0 && !this.dead && this.state !== "dash" && this.state !== "sweep" && this.state !== "cast") {
      this.sprite.setAlpha(0.55 + Math.sin(this.scene.time.now / 35) * 0.35);
    } else {
      this.sprite.setAlpha(this.dead ? 0.55 : 1);
    }

    if (this.hexShield) {
      this.hexShield.setPosition(this.x + this.facing * 34, this.y - 75);
      const pulse = 0.7 + 0.25 * Math.sin(this.scene.time.now / 240);
      this.hexShield.setScale(0.85 * pulse, 0.85 * pulse).setAlpha(this.dead ? 0 : 0.65 + 0.3 * pulse);
    }
  }

  /** Draws continuous 60FPS procedural sub-rig layers behind and in front of the sprite. */
  private drawProceduralRig(t: number, yOff: number, running: boolean, grounded: boolean) {
    const back = this.energyScarf;
    const front = this.armorOverlayGfx;
    back.clear();
    front.clear();
    if (this.dead) return;

    const dir = this.facing;
    const skinId = getSelectedSkin();
    const skinDef = getSkinDef(skinId);
    const nebulaShift = Math.sin(t * 3) > 0 ? 0xc084fc : 0x38bdf8;
    const main = skinId === "nebula" ? nebulaShift : (skinDef.accent ?? this.pal.main);
    const light = skinDef.light ?? this.pal.light;

    // 0. Hero & Armor Skin Back Signatures (Ice Wings, Void Tendrils, Seraph Blades, Chakra Ring)
    this.drawHeroAndSkinWings(t, yOff, dir, main, light, skinId);

    // 1. Ground Bounce Rim-Light on the floor deck
    const hRatio = Math.max(0.2, 1 - Math.max(0, GROUND_Y - this.y) / 380);
    const rimPulse = (0.14 + 0.06 * Math.sin(t * 5.2)) * hRatio;
    back.fillStyle(main, rimPulse);
    back.fillEllipse(this.x, GROUND_Y + 2, 74 * hRatio, 10 * hRatio);

    // 2. 6-point Tapered Polygon Energy Scarf + Trailing Motes
    const ox = this.x - dir * 14;
    const oy = this.y - 110 + yOff;
    const speedMag = Math.hypot(this.vx, this.vy);
    const windBoost = Math.min(1.6, 1 + speedMag / 700);
    const pts: Array<{ x: number; y: number }> = [{ x: ox, y: oy }];
    for (let i = 1; i <= 5; i += 1) {
      const sway = Math.sin(t * 8.5 - i * 1.1) * (4.2 * i);
      const tx = ox - dir * (i * 15 * windBoost) - this.vx * 0.015 * i;
      const ty = oy + i * 7.5 + sway - this.vy * 0.01 * i;
      pts.push({ x: tx, y: ty });
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;
      const w1 = (1 - i / pts.length) * 10;
      const w2 = (1 - (i + 1) / pts.length) * 10;
      const poly = [
        { x: p1.x + nx * w1, y: p1.y + ny * w1 },
        { x: p2.x + nx * w2, y: p2.y + ny * w2 },
        { x: p2.x - nx * w2, y: p2.y - ny * w2 },
        { x: p1.x - nx * w1, y: p1.y - ny * w1 },
      ];
      back.fillStyle(main, 0.42 - i * 0.068);
      back.fillPoints(poly, true);
      back.lineStyle(Math.max(1.2, 3.2 - i * 0.45), light, 0.8 - i * 0.14);
      back.beginPath();
      back.moveTo(p1.x, p1.y);
      back.lineTo(p2.x, p2.y);
      back.strokePath();
    }
    for (const m of [1, 3, 5]) {
      const mp = pts[m];
      const pulseR = 2.2 + Math.sin(t * 10 + m) * 0.8;
      back.fillStyle(light, 0.72);
      back.fillCircle(mp.x, mp.y + Math.sin(t * 9 + m * 2) * 3, Math.max(1, pulseR));
    }

    // 3. Thruster Jet Cones during sprint, airbone, dash, or Overdrive
    if (running || !grounded || this.state === "dash" || this.state === "sweep" || this.overdriveTimer > 0) {
      const flicker = 0.75 + Math.sin(t * 48) * 0.25;
      const jetLen = (this.state === "dash" || this.overdriveTimer > 0 ? 34 : 20) * flicker;
      const jx = this.x - dir * 18;
      const jy = this.y - 82 + yOff;
      back.fillStyle(main, 0.55);
      back.fillTriangle(jx, jy - 6, jx, jy + 6, jx - dir * jetLen, jy + (this.vy * 0.015));
      back.fillStyle(0xffffff, 0.7);
      back.fillTriangle(jx, jy - 3, jx, jy + 3, jx - dir * jetLen * 0.58, jy + (this.vy * 0.008));
      if (!grounded) {
        for (const bxOff of [-12, 10]) {
          const bx = this.x + bxOff;
          const by = this.y - 6 + yOff;
          front.fillStyle(main, 0.5);
          front.fillTriangle(bx - 5, by, bx + 5, by, bx, by + 18 * flicker);
        }
      }
    }

    // 4. Breathing Chest Reactor & Periodic Visor Glint Streak
    const rx = this.x + dir * 6;
    const ry = this.y - 92 + yOff;
    const beat = 0.5 + 0.5 * Math.sin(t * 5.5);
    front.fillStyle(main, 0.26 + beat * 0.16);
    front.fillCircle(rx, ry, 10 + beat * 4);
    front.fillStyle(0xffffff, 0.45 + beat * 0.25);
    front.fillCircle(rx, ry, 3.2 + beat * 1.4);
    const hexAng = t * 2.2;
    const hr = 12 + beat * 2;
    front.lineStyle(1.3, light, 0.45);
    front.beginPath();
    for (let i = 0; i <= 4; i += 1) {
      const ha = hexAng + (i * Math.PI) / 2;
      const hx = rx + Math.cos(ha) * hr;
      const hy = ry + Math.sin(ha) * hr;
      if (i === 0) front.moveTo(hx, hy);
      else front.lineTo(hx, hy);
    }
    front.strokePath();

    // Diagonal visor glint sweep once every ~2.4s
    const glintPhase = (t * 0.42) % 1;
    if (glintPhase < 0.22) {
      const p = glintPhase / 0.22;
      const vx = this.x + dir * 10 + (p - 0.5) * 22 * dir;
      const vy = this.y - 132 + yOff;
      front.lineStyle(2.4, 0xffffff, (1 - Math.abs(p - 0.5) * 2) * 0.85);
      front.beginPath();
      front.moveTo(vx - 6, vy - 5);
      front.lineTo(vx + 6, vy + 5);
      front.strokePath();
    }

    // 5. 3D Orbiting Elemental Shards (split back/front by depth sin(angle))
    const orbitCy = this.y - 84 + yOff;
    for (let i = 0; i < 3; i += 1) {
      const ang = t * 2.8 + (i * Math.PI * 2) / 3;
      const sx = this.x + Math.cos(ang) * 46;
      const sy = orbitCy + Math.sin(ang) * 16;
      const target = Math.sin(ang) < 0 ? back : front;
      const sz = Math.sin(ang) < 0 ? 4.2 : 6.2;
      const alphaScale = Math.sin(ang) < 0 ? 0.45 : 0.82;
      target.fillStyle(main, alphaScale * 0.45);
      target.fillCircle(sx, sy, sz * 1.45);
      target.fillStyle(light, alphaScale);
      target.fillPoints([
        { x: sx, y: sy - sz },
        { x: sx + sz * 0.65, y: sy },
        { x: sx, y: sy + sz },
        { x: sx - sz * 0.65, y: sy },
      ], true);
    }

    // 6. Element-Specific Weapon Aura at Hand
    const wx = this.x + dir * 32;
    const wy = this.y - 78 + yOff;
    const el = this.def.element;
    if (el === "volt") {
      front.lineStyle(1.8, 0xfff6a0, 0.8);
      front.beginPath();
      front.moveTo(wx - 8, wy - 4);
      front.lineTo(wx + Math.sin(t * 37) * 6, wy + Math.cos(t * 29) * 7);
      front.lineTo(wx + dir * 12, wy - 6 + Math.sin(t * 43) * 6);
      front.strokePath();
    } else if (el === "fire") {
      for (let f = 0; f < 2; f += 1) {
        const lift = ((t * 42 + f * 9) % 18);
        const fx = wx + Math.sin(t * 11 + f * 3) * 5;
        const fy = wy - lift;
        const r = Math.max(1, 5.5 * (1 - lift / 18));
        front.fillStyle(f === 0 ? main : 0xfff0a0, 0.72 * (1 - lift / 18));
        front.fillCircle(fx, fy, r);
      }
    } else if (el === "wind") {
      front.lineStyle(1.8, light, 0.65);
      front.beginPath();
      front.arc(wx, wy, 13, t * 5, t * 5 + Math.PI * 1.15);
      front.strokePath();
    } else if (el === "earth") {
      const rot = t * 2.4;
      front.lineStyle(1.8, 0xffe6a8, 0.75);
      front.beginPath();
      for (let i = 0; i <= 4; i += 1) {
        const a = rot + (i * Math.PI) / 2;
        const px = wx + Math.cos(a) * 11;
        const py = wy + Math.sin(a) * 11;
        if (i === 0) front.moveTo(px, py);
        else front.lineTo(px, py);
      }
      front.strokePath();
    } else if (el === "cryo") {
      const rx = 12;
      front.lineStyle(1.8, 0xe0faff, 0.85);
      for (let i = 0; i < 3; i += 1) {
        const a = t * 4.5 + (i * Math.PI) / 3;
        front.lineBetween(wx - Math.cos(a) * rx, wy - Math.sin(a) * rx, wx + Math.cos(a) * rx, wy + Math.sin(a) * rx);
      }
      front.fillStyle(main, 0.65);
      front.fillCircle(wx, wy, 4.2);
    } else if (el === "void") {
      front.fillStyle(0x090214, 0.85);
      front.fillCircle(wx, wy, 6.5);
      front.lineStyle(2, main, 0.9);
      front.strokeEllipse(wx, wy, 20, 7.5);
      front.fillStyle(0xffffff, 0.75);
      front.fillCircle(wx + Math.cos(t * 9) * 9, wy + Math.sin(t * 9) * 3.5, 2.2);
    } else {
      const pr = 7 + Math.sin(t * 9) * 2.5;
      front.lineStyle(1.6, main, 0.65);
      front.strokeCircle(wx, wy, pr);
      front.fillStyle(0xffffff, 0.55);
      front.fillCircle(wx, wy, 3.2);
    }
  }

  private drawHeroAndSkinWings(
    t: number,
    yOff: number,
    dir: number,
    main: number,
    light: number,
    skinId: ReturnType<typeof getSelectedSkin>,
  ) {
    const back = this.energyScarf;
    const front = this.armorOverlayGfx;
    const sx = this.x - dir * 18;
    const sy = this.y - 102 + yOff;

    // New Hero Procedural Signatures
    if (this.def.id === "cryo_archon") {
      const flap = Math.sin(t * 3.2) * 5;
      for (let i = 0; i < 3; i += 1) {
        const ang = (-0.95 + i * 0.42) * dir;
        const len = 46 - i * 8;
        const tx = sx + Math.sin(ang) * len;
        const ty = sy - Math.cos(ang) * len + flap * (i + 1) * 0.35;
        back.fillStyle(0x38bdf8, 0.48 - i * 0.08);
        back.fillTriangle(sx, sy - 6 + i * 6, sx - dir * 8, sy + 6 + i * 6, tx, ty);
        back.lineStyle(1.4, 0xe0faff, 0.75 - i * 0.14);
        back.lineBetween(sx, sy + i * 4, tx, ty);
      }
    } else if (this.def.id === "void_reaper") {
      // Floating Void Eye Singularity + Shadow Wing Tendrils
      const ex = this.x - dir * 24;
      const ey = this.y - 134 + yOff + Math.sin(t * 3.8) * 4;
      back.fillStyle(0x050210, 0.9);
      back.fillCircle(ex, ey, 9);
      back.lineStyle(1.8, 0xd946ef, 0.85);
      back.strokeEllipse(ex, ey, 26, 9);
      back.fillStyle(0xffffff, 0.9);
      back.fillCircle(ex, ey, 3.2);
      for (let i = 0; i < 2; i += 1) {
        const wave = Math.sin(t * 6.5 + i * 2) * 8;
        back.lineStyle(3.2 - i, 0xd946ef, 0.55);
        back.beginPath();
        back.moveTo(sx, sy + i * 8);
        back.lineTo(sx - dir * 32, sy - 12 + i * 16 + wave);
        back.lineTo(sx - dir * 56, sy - 4 + i * 24 - wave * 0.7);
        back.strokePath();
      }
    }

    // Equip-able Procedural Armor Skins
    if (skinId === "gold") {
      // Golden Seraph Halo Crown + Twin Golden Cyber Wing Blades
      const hy = this.y - 166 + yOff + Math.sin(t * 4) * 2;
      front.lineStyle(2.4, 0xfbbf24, 0.85);
      front.strokeEllipse(this.x, hy, 38, 10);
      front.lineStyle(1.2, 0xfff8d6, 0.9);
      front.strokeEllipse(this.x, hy, 30, 7);
      for (const side of [-1, 1]) {
        const spread = 32 + Math.sin(t * 4.5 + side) * 5;
        back.fillStyle(0xfbbf24, 0.42);
        back.fillTriangle(sx, sy, sx + side * spread, sy - 38, sx + side * (spread * 0.55), sy - 10);
        back.lineStyle(1.4, 0xfff8d6, 0.8);
        back.strokeTriangle(sx, sy, sx + side * spread, sy - 38, sx + side * (spread * 0.55), sy - 10);
      }
    } else if (skinId === "blood_moon") {
      // Spinning 6-node Crimson Chakra Ring behind Hero
      const cr = 54;
      const cy = this.y - 92 + yOff;
      back.lineStyle(2.2, 0xff2255, 0.48);
      back.strokeCircle(this.x, cy, cr);
      for (let i = 0; i < 6; i += 1) {
        const a = t * 1.9 + (i * Math.PI) / 3;
        const nx = this.x + Math.cos(a) * cr;
        const ny = cy + Math.sin(a) * cr;
        back.fillStyle(0xff2255, 0.7);
        back.fillCircle(nx, ny, 5.5);
        back.fillStyle(0xffc2d1, 0.9);
        back.fillCircle(nx, ny, 2.5);
      }
    } else if (skinId === "nebula") {
      // Prismatic Holographic Hex Wings pulsing across cyan & amethyst
      for (let i = 0; i < 2; i += 1) {
        const col = i === 0 ? main : 0x38bdf8;
        const wx = sx - dir * (22 + i * 14);
        const wy = sy - 16 + i * 16 + Math.sin(t * 4 + i) * 4;
        const r = 18 - i * 4;
        back.lineStyle(2, col, 0.65);
        back.beginPath();
        for (let k = 0; k <= 6; k += 1) {
          const a = t * 1.4 + (k * Math.PI) / 3;
          const px = wx + Math.cos(a) * r;
          const py = wy + Math.sin(a) * r;
          if (k === 0) back.moveTo(px, py);
          else back.lineTo(px, py);
        }
        back.strokePath();
        back.fillStyle(light, 0.2);
        back.fillCircle(wx, wy, r * 0.6);
      }
    }
  }

  override destroy() {
    this.hexShield?.destroy();
    this.energyScarf.destroy();
    this.armorOverlayGfx.destroy();
    this.weaponGlow?.destroy();
    this.afterimages.destroy();
    this.smearArc.destroy();
    this.comboAura?.destroy();
    super.destroy();
  }
}
