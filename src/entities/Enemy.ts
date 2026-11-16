import Phaser from "phaser";
import { DEPTH, FONT, GROUND_Y } from "../config/constants";
import { ENEMIES, type EnemyDef, type EnemyType } from "../config/content";
import { anchorX, textureHeight } from "../systems/assets";
import { getDifficultyModifiers } from "../systems/difficulty";
import { PALETTE } from "../systems/Fx";
import { AfterimageRingBuffer } from "../systems/motionSynth";
import { sfx } from "../systems/sfx";
import type { GameScene } from "../scenes/GameScene";
import { Actor, type Hit } from "./Actor";
import type { Hero } from "./Hero";

export type EliteAffix = "vampiric" | "orbit_shield" | "teleporter" | "molten_trail";

type State = "idle" | "move" | "windup" | "active" | "recover" | "hurt" | "dying" | "selfDestruct";
type Move = "leap" | "punch" | "charge" | "shoot" | "bash" | "slam" | "beam" | "whip" | "summon" | "explode" | "snipe" | "buff" | "clone_cross" | "dimension_slash";

export class Enemy extends Actor {
  readonly team = "enemy" as const;
  readonly def: EnemyDef;
  state: State = "idle";
  private timer = 0.6 + Math.random() * 0.5;
  private move: Move | null = null;
  private moveHit = new Set<Actor>();
  private cooldown = 1 + Math.random();
  private baseScale: number;
  private telegraph?: Phaser.GameObjects.GameObject;
  private turnDelay = 0;
  private hoverSeed = Math.random() * 10;
  private attackIndex = 0;
  enraged = false;
  phase: 1 | 2 | 3 = 1;
  shieldHp = 0;
  maxShieldHp = 0;
  readonly afterimages: AfterimageRingBuffer;

  // Elite Affixes
  isElite = false;
  affixes: EliteAffix[] = [];
  eliteAura?: Phaser.GameObjects.Arc;
  orbitSpheres: Phaser.GameObjects.Arc[] = [];
  orbitAngle = 0;
  teleportTimer = 4.5;
  moltenTimer = 0;
  dimensionSafeX?: number;

  constructor(scene: GameScene, type: EnemyType, x: number, hpScale: number) {
    const def = ENEMIES[type];
    const diff = getDifficultyModifiers();
    const finalHpScale = hpScale * diff.hpMult;
    super(scene, x, def.sprite, Math.round(def.hp * finalHpScale), def.body, DEPTH.enemy);
    this.def = def;
    this.flying = !!def.flying;
    this.baseScale = (def.height / textureHeight(def.sprite)) * (def.scale ?? 1);
    this.weight = type === "archon_zero" ? 0.05 : type === "boss" ? 0.1 : type === "aegis_prime" ? 0.2 : type === "mutant" ? 0.35 : type === "aegis" ? 0.5 : 1;
    if (type === "aegis_prime") {
      this.shieldHp = this.maxShieldHp = Math.round(300 * finalHpScale);
      this.maxPosture = this.posture = 500;
    } else if (type === "boss") {
      this.maxPosture = this.posture = 1000;
    } else if (type === "archon_zero") {
      this.maxPosture = this.posture = 1500;
    }
    this.afterimages = new AfterimageRingBuffer(scene, DEPTH.enemy - 1);
    if (def.tint) {
      this.sprite.setTint(def.tint);
    }
    if (this.flying) this.y = GROUND_Y - 280;
    this.sprite.setOrigin(anchorX(def.sprite), 1).setScale(this.baseScale);
    // Spawn in from the edge with a short fade so waves read clearly.
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300 });
  }

  get isBoss() {
    return this.def.type === "boss" || this.def.type === "archon_zero";
  }

  makeElite(affixes?: EliteAffix[]) {
    this.isElite = true;
    const POOL: EliteAffix[] = ["vampiric", "orbit_shield", "teleporter", "molten_trail"];
    if (affixes && affixes.length > 0) {
      this.affixes = affixes;
    } else {
      const count = Math.random() < 0.35 ? 2 : 1;
      Phaser.Utils.Array.Shuffle(POOL);
      this.affixes = POOL.slice(0, count);
    }
    this.baseScale *= 1.22;
    this.maxHp = Math.round(this.maxHp * 1.6);
    this.hp = this.maxHp;
    this.maxPosture = this.posture = 250;
    this.weight *= 0.5;

    // Glowing elite aura
    this.eliteAura = this.scene.add.circle(this.x, this.y, 45, 0xffbb00, 0.25)
      .setStrokeStyle(3, 0xffbb00, 0.8)
      .setDepth(DEPTH.shadow + 1);
    this.scene.tweens.add({
      targets: this.eliteAura,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0.5,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    if (this.affixes.includes("orbit_shield")) {
      for (let i = 0; i < 2; i++) {
        const s = this.scene.add.circle(this.x, this.cy, 12, 0x18e6ff, 0.9)
          .setStrokeStyle(2, 0xffffff, 0.9)
          .setDepth(DEPTH.enemy + 1);
        this.orbitSpheres.push(s);
      }
    }
  }

  doTeleport() {
    const target = this.target();
    if (!target) return;
    this.scene.fx.sparks(this.x, this.cy, 0xaa44ff, 1, 14);
    sfx.dash();
    const side = Math.random() < 0.5 ? 1 : -1;
    this.x = Phaser.Math.Clamp(target.x + side * 90, this.scene.arenaMin + 50, this.scene.arenaMax - 50);
    this.facing = this.x < target.x ? 1 : -1;
    this.scene.fx.sparks(this.x, this.cy, 0xaa44ff, 1, 14);
  }

  private target(): Hero | undefined {
    let best: Hero | undefined;
    let bestD = Infinity;
    for (const h of this.scene.heroes) {
      if (h.dead) continue;
      const d = Math.abs(h.x - this.x);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  update(dt: number) {
    this.capturePrevTransform();
    this.afterimages.update(dt);
    this.tickTimers(dt);
    if (this.state === "dying") {
      this.timer -= dt;
      this.physics(dt, 4);
      this.sprite.setPosition(this.x, this.y);
      return;
    }
    this.updateStatus(dt);
    if (this.dead) return;

    const target = this.target();
    const modSpeed = this.scene.activeModifier === "fast" ? 1.35 : 1;
    const speedMul = (this.isSlowed() ? 0.5 : 1) * (this.enraged ? 1.35 : 1) * modSpeed;
    this.timer -= dt * (this.isSlowed() ? 0.6 : 1);
    this.cooldown -= dt * speedMul;

    if (this.isStunned() || this.isBroken()) {
      this.clearTelegraph();
      if (this.state === "windup" || this.state === "active") this.setState("recover", 0.3);
    } else if (this.state === "hurt") {
      if (this.hitstun <= 0) this.setState("move", 0);
    } else if (target) {
      this.ai(target, dt, speedMul);
    }

    if (this.flying) {
      const hoverY = GROUND_Y - 270 + Math.sin(this.scene.time.now / 500 + this.hoverSeed) * 30;
      if (this.state !== "active") this.y += (hoverY - this.y) * Math.min(1, dt * 3);
    }
    this.physics(dt, this.state === "active" ? 1 : 8);
    if (!this.flying) this.separate();

    if (this.isElite) {
      this.eliteAura?.setPosition(this.x, this.y);
      if (this.orbitSpheres.length > 0) {
        this.orbitAngle += dt * 3.5;
        for (let i = 0; i < this.orbitSpheres.length; i++) {
          const a = this.orbitAngle + (i * Math.PI * 2) / this.orbitSpheres.length;
          const ox = this.x + Math.cos(a) * 65;
          const oy = this.y - this.bodyH * 0.5 + Math.sin(a) * 35;
          this.orbitSpheres[i].setPosition(ox, oy);

          for (const h of this.scene.heroes) {
            if (!h.dead && Math.hypot(h.x - ox, (h.y - h.bodyH * 0.5) - oy) < 32) {
              this.scene.dealDamage(this, h, { damage: 15, dir: Math.sign(h.x - this.x) || 1, knock: 160, color: 0x18e6ff });
            }
          }
        }
      }

      if (this.affixes.includes("teleporter")) {
        this.teleportTimer -= dt;
        if (this.teleportTimer <= 0) {
          this.teleportTimer = 4.5 + Math.random() * 2;
          this.doTeleport();
        }
      }

      if (this.affixes.includes("molten_trail") && this.onGround && Math.abs(this.vx) > 30) {
        this.moltenTimer -= dt;
        if (this.moltenTimer <= 0) {
          this.moltenTimer = 0.45;
          const mx = this.x;
          this.scene.fx.ring(mx, GROUND_Y - 4, 0xff5511, 40, 1800, 0.4);
          this.scene.time.delayedCall(400, () => {
            for (const h of this.scene.heroes) {
              if (!h.dead && Math.abs(h.x - mx) < 40 && h.onGround) {
                this.scene.dealDamage(this, h, { damage: 10, dir: 1, knock: 50, color: 0xff5511 });
              }
            }
          });
        }
      }
    }

    const disp = Math.hypot(this.x - this.prevX, this.y - this.prevY);
    if (disp > 16 && (this.state === "active" || this.move === "charge" || this.move === "leap")) {
      this.afterimages.emitIntermediate(
        this.prevX,
        this.prevY,
        this.x,
        this.y,
        this.sprite.texture.key,
        this.isBoss ? 0xff3355 : 0xaa44ff,
        this.sprite.scaleX,
        this.sprite.scaleY,
        this.sprite.rotation,
        2,
      );
    }

    this.render();
  }

  private setState(state: State, time: number) {
    this.state = state;
    this.timer = time;
  }

  private face(target: Hero, dt: number) {
    const want = target.x >= this.x ? 1 : -1;
    if (want === this.facing) {
      this.turnDelay = 0;
      return;
    }
    // Shield bearers and the boss turn slowly so the player can punish from behind.
    const delay = this.def.type === "aegis" ? 0.7 : this.isBoss ? 0.5 : 0.1;
    this.turnDelay += dt;
    if (this.turnDelay >= delay) {
      this.facing = want;
      this.turnDelay = 0;
    }
  }

  private ai(target: Hero, dt: number, speedMul: number) {
    const dx = target.x - this.x;
    const dist = Math.abs(dx);

    if (this.state === "windup") {
      if (this.timer <= 0) this.release(target);
      return;
    }
    if (this.state === "active") {
      this.activeHits();
      if (this.timer <= 0) {
        this.clearTelegraph();
        this.setState("recover", this.isBoss ? 0.7 : 0.55);
      }
      return;
    }
    if (this.state === "recover") {
      if (this.timer <= 0) this.setState("move", 0);
      return;
    }

    this.face(target, dt);
    const choice = this.cooldown <= 0 ? this.pickMove(dist, target) : null;
    if (choice) {
      this.startWindup(choice, target);
      return;
    }

    const preferred = this.def.type === "hunter" ? 330 : this.def.type === "aegis" ? 240 : this.isBoss ? 230 : 90;
    const speed = this.def.speed * speedMul;
    if (dist > preferred + 20) this.vx = Math.sign(dx) * speed;
    else if (dist < preferred - 60 && (this.def.type === "hunter" || this.def.type === "aegis")) this.vx = -Math.sign(dx) * speed * 0.7;
    else this.vx *= 0.8;
  }

  private pickMove(dist: number, target: Hero): Move | null {
    switch (this.def.type) {
      case "crawler":
        return dist < 260 ? "leap" : null;
      case "mutant":
        if (dist < 170) return "punch";
        return dist > 380 && dist < 800 ? "charge" : null;
      case "hunter":
        return dist < 700 ? "shoot" : null;
      case "aegis":
        if (dist < 150) return "bash";
        return dist < 650 ? "shoot" : null;
      case "aegis_prime":
        if (dist < 200) return "bash";
        return dist < 700 ? "shoot" : null;
      case "bomber":
        return dist < 220 ? "explode" : null;
      case "sniper":
        return dist < 950 ? "snipe" : null;
      case "drone":
        return "buff";
      case "archon_zero": {
        const cycle: Move[] = this.phase === 3
          ? ["dimension_slash", "clone_cross", "slam", "dimension_slash"]
          : this.phase === 2
          ? ["clone_cross", "charge", "beam", "whip"]
          : ["charge", "whip", "slam", "beam"];
        const m = cycle[this.attackIndex % cycle.length];
        this.attackIndex += 1;
        void target;
        return m;
      }
      case "boss": {
        const cycle: Move[] = this.phase === 3
          ? ["slam", "charge", "beam", "whip", "summon"]
          : this.phase === 2
          ? ["charge", "slam", "beam", "summon"]
          : this.enraged
          ? ["slam", "beam", "whip", "summon", "beam", "slam"]
          : ["slam", "beam", "whip", "summon"];
        let m = cycle[this.attackIndex % cycle.length];
        this.attackIndex += 1;
        if (m === "whip" && dist > 380) m = "beam";
        if (m === "summon" && this.scene.enemies.filter((e) => !e.dead && !e.isBoss).length > 2) m = "slam";
        void target;
        return m;
      }
    }
  }

  private startWindup(move: Move, target: Hero) {
    this.move = move;
    this.moveHit.clear();
    this.vx = 0;
    this.facing = target.x >= this.x ? 1 : -1;
    const fast = this.enraged ? 0.75 : 1;
    const diff = getDifficultyModifiers();
    const windups: Record<Move, number> = {
      leap: 0.42, punch: 0.55, charge: 0.6, shoot: 0.55, bash: 0.45, slam: 0.95, beam: 1.05, whip: 0.6, summon: 0.6,
      explode: 1.2, snipe: 1.3, buff: 0.8, clone_cross: 0.85, dimension_slash: 1.25,
    };
    this.setState("windup", windups[move] * fast * diff.telegraphMult);
    this.telegraphFor(move);
  }

  private telegraphFor(move: Move) {
    const pal = this.isBoss ? PALETTE.boss : PALETTE.enemy;
    const color = PALETTE.enemy.main;
    this.scene.fx.glow(this.cx, this.cy, color, this.isBoss ? 5 : 2.2, this.timer * 1000);
    if (move === "beam") {
      const y = GROUND_Y - 75;
      const [minX, maxX] = this.scene.arenaBounds();
      const x0 = this.facing > 0 ? this.x : minX;
      const x1 = this.facing > 0 ? maxX : this.x;
      const line = this.scene.add.image((x0 + x1) / 2, y, "beam").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(x1 - x0, 10).setDepth(DEPTH.fx);
      this.scene.tweens.add({ targets: line, alpha: 0.25, yoyo: true, repeat: -1, duration: 80 });
      this.telegraph = line;
      this.scene.fx.charge(this.x + this.facing * 60, y, pal, this.timer * 1000, 220, 30);
      sfx.warn();
    } else if (move === "slam") {
      const zone = this.scene.add.image(this.x, GROUND_Y - 4, "glyph").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 0.6).setAlpha(0.8).setDepth(DEPTH.shadow + 1);
      this.scene.tweens.add({ targets: zone, rotation: 3, scaleX: 3, alpha: 0.35, yoyo: true, repeat: -1, duration: 300 });
      this.telegraph = zone;
      sfx.warn();
    } else if (move === "explode") {
      const mark = this.scene.add
        .text(this.x, this.y - this.bodyH - 26, "💣 NỔ!", { fontFamily: "Arial", fontSize: "28px", fontStyle: "900", color: "#ff8800", stroke: "#000", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(DEPTH.text);
      this.scene.tweens.add({ targets: mark, scale: 1.3, yoyo: true, repeat: -1, duration: 150 });
      this.telegraph = mark;
      this.scene.fx.ring(this.x, this.y - 30, 0xff4400, 180, this.timer * 1000);
      sfx.warn();
    } else if (move === "snipe") {
      const [minX, maxX] = this.scene.arenaBounds();
      const aimY = this.y - 20;
      const x0 = this.facing > 0 ? this.x : minX;
      const x1 = this.facing > 0 ? maxX : this.x;
      const line = this.scene.add.image((x0 + x1) / 2, aimY, "beam").setTint(0xaa44ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(x1 - x0, 2).setDepth(DEPTH.fx);
      this.scene.tweens.add({ targets: line, alpha: 0.8, yoyo: true, repeat: -1, duration: 90 });
      this.telegraph = line;
      sfx.warn();
    } else if (move === "buff") {
      this.scene.fx.ring(this.x, this.y - 20, 0x33ffaa, 220, this.timer * 1000);
    } else if (move === "shoot") {
      this.scene.fx.charge(this.x + this.facing * this.bodyW * 0.45, this.flying ? this.y - 20 : this.y - this.bodyH * 0.55, pal, this.timer * 1000, 70, 10);
    } else if (move === "clone_cross") {
      const leftX = this.scene.arenaMin + 80;
      const rightX = this.scene.arenaMax - 80;
      this.scene.fx.ring(leftX, this.cy, 0x8844ff, 120, this.timer * 1000);
      this.scene.fx.ring(rightX, this.cy, 0x8844ff, 120, this.timer * 1000);
      sfx.warn();
    } else if (move === "dimension_slash") {
      sfx.warn();
      const [minX, maxX] = this.scene.arenaBounds();
      const safeX = minX + 220 + Math.random() * (maxX - minX - 440);
      this.dimensionSafeX = safeX;

      const container = this.scene.add.container(0, 0).setDepth(DEPTH.fx);
      const w = maxX - minX;
      const d1 = this.scene.add.rectangle((minX + maxX) / 2, GROUND_Y - 200, w, 60, 0xd946ef, 0.45);
      const d2 = this.scene.add.rectangle((minX + maxX) / 2, GROUND_Y - 120, w, 60, 0xd946ef, 0.45);
      const d3 = this.scene.add.rectangle((minX + maxX) / 2, GROUND_Y - 40, w, 60, 0xd946ef, 0.45);
      const safeBox = this.scene.add.rectangle(safeX, GROUND_Y - 120, 160, 240, 0x37ffb0, 0.25).setStrokeStyle(3, 0x37ffb0, 0.9);
      const safeText = this.scene.add.text(safeX, GROUND_Y - 230, "VÙNG AN TOÀN", {
        fontFamily: FONT,
        fontSize: "18px",
        fontStyle: "bold",
        color: "#37ffb0",
        stroke: "#000",
        strokeThickness: 4,
      }).setOrigin(0.5);

      container.add([d1, d2, d3, safeBox, safeText]);
      this.scene.tweens.add({ targets: [d1, d2, d3], alpha: 0.15, yoyo: true, repeat: -1, duration: 120 });
      this.telegraph = container;
    } else if (move !== "summon") {
      const mark = this.scene.add
        .text(this.x, this.y - this.bodyH - 26, "!", { fontFamily: "Arial", fontSize: "38px", fontStyle: "900", color: "#ff3355", stroke: "#000", strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(DEPTH.text)
        .setScale(0.2);
      this.scene.tweens.add({ targets: mark, scale: 1.2, duration: 140, ease: "Back.easeOut" });
      this.telegraph = mark;
    }
  }

  private clearTelegraph() {
    this.telegraph?.destroy();
    this.telegraph = undefined;
  }

  private release(target: Hero) {
    this.impulse(1.16, 0.88);
    this.clearTelegraph();
    const d = Math.round(this.def.damage * getDifficultyModifiers().damageMult);
    switch (this.move) {
      case "leap":
        this.vx = this.facing * 640;
        this.vy = -560;
        this.setState("active", 0.55);
        break;
      case "charge":
        this.vx = this.facing * 760;
        this.setState("active", 0.65);
        sfx.dash();
        break;
      case "punch":
      case "bash":
      case "whip": {
        const range = this.move === "whip" ? 420 : this.move === "punch" ? 190 : 170;
        const rect = new Phaser.Geom.Rectangle(this.facing > 0 ? this.x : this.x - range, this.y - this.bodyH * 0.9, range, this.bodyH * 0.9);
        this.scene.enemyAttack(this, rect, { damage: this.move === "whip" ? d * 1.1 : d, dir: this.facing, knock: 560, launch: 380, color: 0xff3355 });
        this.scene.fx.slash(this.x + this.facing * range * 0.4, this.y - this.bodyH * 0.5, this.facing, this.isBoss ? PALETTE.boss : PALETTE.enemy, { scale: this.move === "whip" ? 2.6 : 1.4, tilt: this.move === "whip" ? 0.3 : 0.5, sweep: 1.5, duration: 260 });
        this.vx = this.facing * 200;
        sfx.swing();
        this.setState("active", 0.2);
        break;
      }
      case "shoot": {
        const sx = this.x + this.facing * this.bodyW * 0.45;
        const sy = this.flying ? this.y - 20 : this.y - this.bodyH * 0.55;
        const angle = Phaser.Math.Angle.Between(sx, sy, target.x, target.y - 70);
        const speed = 520;
        const aim = this.flying ? angle : this.facing > 0 ? 0 : Math.PI;
        this.scene.spawnProjectile({
          owner: this, x: sx, y: sy, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, size: 16, color: 0xff4d6d, pierce: 1, style: "enemy",
          hit: { damage: d, dir: this.facing, knock: 220, color: 0xff4d6d },
        });
        if (this.scene.activeModifier === "double_shot") {
          const aim2 = aim + (this.flying ? 0.2 : 0.08);
          this.scene.spawnProjectile({
            owner: this, x: sx, y: sy, vx: Math.cos(aim2) * speed, vy: Math.sin(aim2) * speed, size: 14, color: 0xff4d6d, pierce: 1, style: "enemy",
            hit: { damage: Math.round(d * 0.8), dir: this.facing, knock: 200, color: 0xff4d6d },
          });
        }
        sfx.enemyShot();
        this.setState("active", 0.15);
        break;
      }
      case "slam": {
        this.scene.fx.shake(0.018, 280);
        sfx.boom();
        this.scene.fx.flashCore(this.x, GROUND_Y - 20, 2.2, 220);
        this.scene.fx.ring(this.x, GROUND_Y - 4, PALETTE.boss.main, 420, 600, 0.22);
        this.scene.fx.shards(this.x, GROUND_Y - 20, { main: 0x7a86a0, light: 0xcfd8ea, dark: 0x30384a }, 18, 800);
        this.scene.fx.dust(this.x, 1, 2);
        this.scene.fx.dust(this.x, -1, 2);
        for (const dir of [-1, 1]) this.scene.spawnShockwave(this, this.x + dir * 120, dir, this.enraged ? 620 : 520, d);
        this.setState("active", 0.3);
        break;
      }
      case "beam": {
        const [minX, maxX] = this.scene.arenaBounds();
        const x0 = this.facing > 0 ? this.x + 60 : minX;
        const x1 = this.facing > 0 ? maxX : this.x - 60;
        this.scene.spawnBeam(this, x0, x1, GROUND_Y - 75, 80, d * 1.2);
        this.setState("active", 0.5);
        break;
      }
      case "summon":
        sfx.warn();
        const summonType = this.phase >= 2 ? "bomber" : "crawler";
        for (let i = 0; i < (this.enraged ? 3 : 2); i += 1) {
          this.scene.time.delayedCall(i * 200, () => this.scene.spawnEnemy(summonType, i % 2 ? "left" : "right"));
        }
        this.setState("active", 0.3);
        break;
      case "explode":
        sfx.boom();
        this.scene.fx.explosion(this.cx, this.cy, { main: 0xff4400, light: 0xffffaa, dark: 0x991100 }, 220);
        this.scene.areaHit(this, this.cx, this.cy, 200, { damage: d, dir: this.facing, knock: 550, color: 0xff4400 });
        for (const e of this.scene.enemies) {
          if (e !== this && !e.dead && Phaser.Math.Distance.Between(this.cx, this.cy, e.cx, e.cy) < 220) {
            e.takeHit({ damage: Math.round(d * 0.75), dir: Math.sign(e.x - this.x) || 1, knock: 300, color: 0xff4400 });
          }
        }
        this.die({ damage: 9999, dir: this.facing, color: 0xff4400 });
        break;
      case "snipe": {
        sfx.shoot();
        const [minX, maxX] = this.scene.arenaBounds();
        const aimY = this.y - 20;
        const x0 = this.facing > 0 ? this.x : minX;
        const x1 = this.facing > 0 ? maxX : this.x;
        this.scene.spawnBeam(this, x0, x1, aimY, 30, d * 1.5);
        this.setState("active", 0.3);
        break;
      }
      case "buff":
        sfx.zap();
        this.scene.fx.ring(this.x, this.y - 20, 0x33ffaa, 260, 400);
        for (const e of this.scene.enemies) {
          if (e !== this && !e.dead && Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) < 360) {
            e.vx *= 1.3;
            this.scene.fx.label(e.x, e.y - e.bodyH - 10, "BUFF!", "#33ffaa");
          }
        }
        this.setState("active", 0.4);
        break;
      case "clone_cross": {
        sfx.dash();
        this.scene.fx.shockRing(this.x, this.cy, 220, 0x8844ff);
        const leftX = this.scene.arenaMin + 80;
        const rightX = this.scene.arenaMax - 80;
        this.scene.fx.slash(leftX + 120, this.cy, 1, PALETTE.volt, { scale: 2.8, duration: 300 });
        this.scene.fx.slash(rightX - 120, this.cy, -1, PALETTE.volt, { scale: 2.8, duration: 300 });
        this.scene.areaHit(this, this.x, this.cy, 360, { damage: Math.round(d * 0.9), dir: this.facing, knock: 350, color: 0x8844ff });
        this.setState("active", 0.4);
        break;
      }
      case "dimension_slash": {
        this.scene.fx.shake(0.035, 550);
        sfx.boom();
        this.scene.fx.dualImpactFlash(0xd946ef, 0x18e6ff, 350);
        this.scene.fx.shockRing(this.x, this.cy, 450, 0xd946ef);

        const safeX = this.dimensionSafeX ?? this.x;
        for (const h of this.scene.heroes) {
          if (h.dead) continue;
          if (Math.abs(h.x - safeX) > 90) {
            this.scene.dealDamage(this, h, {
              damage: Math.round(d * 1.4),
              dir: Math.sign(h.x - this.x) || 1,
              knock: 550,
              launch: 300,
              color: 0xd946ef,
            });
            this.scene.fx.slash(h.x, h.cy, 1, PALETTE.boss, { scale: 2.5, duration: 250 });
          } else {
            this.scene.fx.label(h.x, h.y - h.bodyH - 30, "NÉ THÀNH CÔNG!", "#7dffb0");
            h.gainEnergy(30);
          }
        }
        this.setState("active", 0.5);
        break;
      }
    }
  }

  /** Contact damage while leaping/charging. */
  private activeHits() {
    if (this.move !== "leap" && this.move !== "charge") return;
    const rect = this.bounds();
    for (const h of this.scene.heroes) {
      if (h.dead || this.moveHit.has(h)) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, h.bounds())) {
        this.moveHit.add(h);
        this.scene.dealDamage(this, h, { damage: Math.round(this.def.damage * getDifficultyModifiers().damageMult), dir: this.facing, knock: 420, launch: 300, color: 0xff3355 });
      }
    }
    if (this.move === "leap" && this.onGround && this.timer < 0.4) this.timer = 0;
  }

  /** Aegis and Aegis Prime shield blocks light frontal hits or absorbs shield HP. */
  shieldFactor(hit: Hit) {
    if (this.def.type === "aegis_prime" && this.shieldHp > 0) {
      this.shieldHp = Math.max(0, this.shieldHp - hit.damage);
      if (this.shieldHp <= 0) {
        this.scene.fx.flashCore(this.cx, this.cy, 1.5);
        this.scene.fx.label(this.x, this.y - this.bodyH - 20, "VỠ KHIÊN!", "#ffdd55");
        sfx.boom();
      }
      return 0.1;
    }
    if ((this.def.type !== "aegis" && this.def.type !== "aegis_prime") || hit.heavy || this.isStunned() || this.state === "hurt") return 1;
    const attackerX = hit.source?.x ?? this.x - hit.dir;
    const fromFront = Math.sign(attackerX - this.x) === this.facing;
    return fromFront ? 0.15 : 1;
  }

  takeHit(hit: Hit) {
    if (this.state === "dying") return 0;
    return super.takeHit(hit);
  }

  protected onHurt(hit: Hit, dealt: number) {
    this.impulse(0.9, 1.08);
    // Light enemies get interrupted; heavy ones only flinch from big hits.
    const threshold = this.isBoss ? Infinity : this.def.type === "mutant" ? 34 : this.def.type === "aegis" ? 24 : 0;
    if (dealt > threshold && this.state !== "dying") {
      this.clearTelegraph();
      this.hitstun = 0.32;
      this.setState("hurt", 0);
    }
    if (this.isBoss) {
      if (this.def.type === "archon_zero") {
        if (this.hp < this.maxHp * 0.35 && this.phase < 3) {
          this.phase = 3;
          this.enraged = true;
          this.sprite.setTint(0xd946ef);
          this.scene.onBossEnrage(this);
          this.scene.events.emit("toast", "Archon Zero chuyển dạng: Lõi Hư Không — Trảm Không Gian!");
          this.scene.fx.dualImpactFlash(0xd946ef, 0x18e6ff, 320);
          this.scene.fx.shockRing(this.x, this.cy, 380, 0xd946ef);
        } else if (this.hp < this.maxHp * 0.7 && this.phase < 2) {
          this.phase = 2;
          this.sprite.setTint(0x8844ff);
          this.scene.onBossEnrage(this);
          this.scene.events.emit("toast", "Archon Zero chuyển dạng: Lôi Điện Phân Thân!");
          this.scene.fx.dualImpactFlash(0x8844ff, 0xffe45c, 300);
        }
      } else {
        if (this.hp < this.maxHp * 0.33 && this.phase < 3) {
          this.phase = 3;
          this.enraged = true;
          this.scene.onBossEnrage(this);
          this.scene.events.emit("toast", "Colossus bước vào Pha 3: Nộ Khí Cuồng Nộ!");
        } else if (this.hp < this.maxHp * 0.66 && this.phase < 2) {
          this.phase = 2;
          this.scene.onBossEnrage(this);
          this.scene.events.emit("toast", "Colossus bước vào Pha 2: Thiết Giáp Phá!");
        } else if (!this.enraged && this.hp < this.maxHp * 0.5) {
          this.enraged = true;
          this.scene.onBossEnrage(this);
        }
      }
    }
    void hit;
  }

  protected die(hit: Hit) {
    this.dead = true;
    this.clearTelegraph();
    this.state = "dying";
    this.timer = this.isBoss ? 2 : 0.5;
    this.vx = hit.dir * (this.isBoss ? 0 : 380);
    if (!this.flying && !this.isBoss) this.vy = -420;
    this.flying = false;
    this.scene.onEnemyKilled(this, hit);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      angle: this.isBoss ? 0 : hit.dir * 40,
      delay: this.isBoss ? 1400 : 200,
      duration: this.isBoss ? 600 : 300,
    });
    this.shadow.setVisible(false);
  }

  get removable() {
    return this.state === "dying" && this.timer <= 0;
  }

  private separate() {
    for (const other of this.scene.enemies) {
      if (other === this || other.dead || other.flying) continue;
      const dx = this.x - other.x;
      const min = (this.bodyW + other.bodyW) * 0.3;
      if (Math.abs(dx) < min) this.x += Math.sign(dx || Math.random() - 0.5) * (min - Math.abs(dx)) * 0.1;
    }
  }

  private anim = { sx: 1, sy: 1, vx: 0, vy: 0, lean: 0, turn: 1, stride: 0, wasGround: true, lastTex: "" };

  impulse(sx: number, sy: number) {
    this.anim.sx = sx;
    this.anim.sy = sy;
    this.anim.vx = 0;
    this.anim.vy = 0;
  }

  private render() {
    const dt = this.scene.dt || 1 / 60;
    const a = this.anim;
    const moving = this.state === "move" && Math.abs(this.vx) > 20;

    let tex = this.def.sprite;
    if (this.isBoss) {
      if (this.enraged && this.state !== "active") tex = "boss_rage";
      if (this.state === "windup" && this.move === "slam") tex = "boss_slam";
      if (this.state === "active" && this.move === "whip") tex = "boss_whip";
      if (this.state === "active" && this.move === "beam") tex = "boss_idle";
    } else if (this.def.type === "mutant") {
      if (this.state === "windup" || this.state === "active") tex = "mutant_punch";
      else if (moving) tex = Math.floor(a.stride) % 2 ? "mutant_walk1" : "mutant";
    }
    if (tex !== a.lastTex) {
      this.sprite.setTexture(tex);
      this.baseScale = (tex === this.def.sprite ? this.def.height : this.def.height * 0.95) / textureHeight(tex);
      a.lastTex = tex;
    }

    if (this.onGround && !a.wasGround) {
      this.impulse(1.2, 0.8);
      this.scene.fx.dust(this.x, 1, this.bodyW / 140);
      this.scene.fx.dust(this.x, -1, this.bodyW / 140);
    }
    a.wasGround = this.onGround;

    const k = 420;
    const c = 22;
    a.vx += ((1 - a.sx) * k - a.vx * c) * dt;
    a.vy += ((1 - a.sy) * k - a.vy * c) * dt;
    a.sx += a.vx * dt;
    a.sy += a.vy * dt;
    if (moving) a.stride += (Math.abs(this.vx) * dt) / (this.isBoss ? 60 : 40);

    a.turn += (this.facing - a.turn) * Math.min(1, dt * (this.isBoss ? 10 : 18));
    const sign = a.turn >= 0 ? 1 : -1;
    const flip = sign !== this.def.artFacing;
    const ax = anchorX(tex);
    this.sprite.setFlipX(flip).setOrigin(flip ? 1 - ax : ax, 1);

    const t = this.scene.time.now / 1000;
    let lean = 0;
    let yOff = 0;
    let sx = 1;
    let sy = 1;
    if (this.state === "windup") {
      // Anticipation: lean back and crouch, building toward the strike.
      const p = 1 - Math.max(0, this.timer) / 0.6;
      lean = -this.facing * 0.1 * Math.min(1, p);
      sy = 1 - 0.07 * Math.min(1, p);
      sx = 1 + 0.05 * Math.min(1, p);
      yOff = 0;
    } else if (this.state === "active") {
      lean = this.facing * 0.12;
    } else if (this.state === "hurt") {
      lean = -this.facing * 0.18;
    } else if (moving) {
      const cyc = a.stride * Math.PI;
      yOff = this.flying ? 0 : -Math.abs(Math.sin(cyc)) * (this.def.type === "crawler" ? 3 : 6);
      sy = 1 + Math.cos(cyc * 2) * 0.03;
      lean = (this.vx / (this.def.speed * 1.5)) * 0.08;
    } else {
      sy = 1 + Math.sin(t * 2.6 + this.hoverSeed) * 0.015;
    }
    if (this.flying) lean = Phaser.Math.Clamp(this.vx / 900, -0.25, 0.25) + Math.sin(t * 3 + this.hoverSeed) * 0.04;
    if (this.state === "dying") lean = a.lean + (this.isBoss ? 0 : dt * 2 * this.facing);
    a.lean += (lean - a.lean) * Math.min(1, dt * 12);

    const scale = this.baseScale;
    this.sprite
      .setPosition(this.x, this.y + yOff)
      .setScale(scale * a.sx * sx * Math.max(0.25, Math.abs(a.turn)), scale * a.sy * sy)
      .setRotation(a.lean);
    this.renderCommon();
    if (this.state === "windup" && this.flashTime <= 0 && !this.isStunned()) {
      const pulse = 0.5 + Math.sin(t * 30) * 0.5;
      this.sprite.setTint(Phaser.Display.Color.GetColor(255, 196 + pulse * 59, 204 + pulse * 51));
    }
  }

  override destroy() {
    this.eliteAura?.destroy();
    this.orbitSpheres.forEach((s) => s.destroy());
    this.orbitSpheres = [];
    this.afterimages.destroy();
    this.clearTelegraph();
    super.destroy();
  }
}
