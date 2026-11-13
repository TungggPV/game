import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import { ENEMIES, type EnemyDef, type EnemyType } from "../config/content";
import { anchorX, textureHeight } from "../systems/assets";
import { sfx } from "../systems/sfx";
import type { GameScene } from "../scenes/GameScene";
import { Actor, type Hit } from "./Actor";
import type { Hero } from "./Hero";

type State = "idle" | "move" | "windup" | "active" | "recover" | "hurt" | "dying";
type Move = "leap" | "punch" | "charge" | "shoot" | "bash" | "slam" | "beam" | "whip" | "summon";

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

  constructor(scene: GameScene, type: EnemyType, x: number, hpScale: number) {
    const def = ENEMIES[type];
    super(scene, x, def.sprite, Math.round(def.hp * hpScale), def.body, DEPTH.enemy);
    this.def = def;
    this.flying = !!def.flying;
    this.baseScale = def.height / textureHeight(def.sprite);
    this.weight = type === "boss" ? 0.1 : type === "mutant" ? 0.35 : type === "aegis" ? 0.5 : 1;
    if (this.flying) this.y = GROUND_Y - 280;
    this.sprite.setOrigin(anchorX(def.sprite), 1).setScale(this.baseScale);
    // Spawn in from the edge with a short fade so waves read clearly.
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300 });
  }

  get isBoss() {
    return this.def.type === "boss";
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
    const speedMul = (this.isSlowed() ? 0.5 : 1) * (this.enraged ? 1.35 : 1);
    this.timer -= dt * (this.isSlowed() ? 0.6 : 1);
    this.cooldown -= dt * speedMul;

    if (this.isStunned()) {
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
      case "boss": {
        const cycle: Move[] = this.enraged ? ["slam", "beam", "whip", "summon", "beam", "slam"] : ["slam", "beam", "whip", "summon"];
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
    const windups: Record<Move, number> = {
      leap: 0.42, punch: 0.55, charge: 0.6, shoot: 0.55, bash: 0.45, slam: 0.95, beam: 1.05, whip: 0.6, summon: 0.6,
    };
    this.setState("windup", windups[move] * fast);
    this.telegraphFor(move);
  }

  private telegraphFor(move: Move) {
    const color = 0xff3355;
    this.scene.fx.glow(this.cx, this.cy, color, this.isBoss ? 6 : 2.5, this.timer * 1000);
    if (move === "beam") {
      const y = GROUND_Y - 75;
      const [minX, maxX] = this.scene.arenaBounds();
      const x0 = this.facing > 0 ? this.x : minX;
      const x1 = this.facing > 0 ? maxX : this.x;
      const line = this.scene.add.rectangle((x0 + x1) / 2, y, x1 - x0, 6, color, 0.7).setDepth(DEPTH.fx);
      this.scene.tweens.add({ targets: line, alpha: 0.15, yoyo: true, repeat: -1, duration: 90 });
      this.telegraph = line;
      sfx.warn();
    } else if (move === "slam") {
      const zone = this.scene.add.rectangle(this.x, GROUND_Y - 6, 260, 12, color, 0.6).setDepth(DEPTH.fx);
      this.scene.tweens.add({ targets: zone, scaleX: 1.4, alpha: 0.2, yoyo: true, repeat: -1, duration: 160 });
      this.telegraph = zone;
      sfx.warn();
    } else if (move !== "shoot" && move !== "summon") {
      const mark = this.scene.add
        .text(this.x, this.y - this.bodyH - 26, "!", { fontFamily: "Arial", fontSize: "38px", fontStyle: "900", color: "#ff3355", stroke: "#000", strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(DEPTH.text);
      this.scene.tweens.add({ targets: mark, scale: 1.3, yoyo: true, repeat: -1, duration: 120 });
      this.telegraph = mark;
    }
  }

  private clearTelegraph() {
    this.telegraph?.destroy();
    this.telegraph = undefined;
  }

  private release(target: Hero) {
    this.clearTelegraph();
    const d = this.def.damage;
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
        this.scene.fx.slash(this.x + this.facing * range * 0.55, this.y - this.bodyH * 0.5, this.facing, 0xff4466, this.move === "whip" ? 2.4 : 1.3);
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
          owner: this, x: sx, y: sy, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, size: 16, color: 0xff4d6d, pierce: 1,
          hit: { damage: d, dir: this.facing, knock: 220, color: 0xff4d6d },
        });
        sfx.enemyShot();
        this.setState("active", 0.15);
        break;
      }
      case "slam": {
        this.scene.fx.shake(0.018, 280);
        sfx.boom();
        this.scene.fx.burst(this.x, GROUND_Y - 10, 0x6fb6ff, 24, 700, 1);
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
        for (let i = 0; i < (this.enraged ? 3 : 2); i += 1) this.scene.time.delayedCall(i * 200, () => this.scene.spawnEnemy("crawler", i % 2 ? "left" : "right"));
        this.setState("active", 0.3);
        break;
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
        this.scene.dealDamage(this, h, { damage: this.def.damage, dir: this.facing, knock: 420, launch: 300, color: 0xff3355 });
      }
    }
    if (this.move === "leap" && this.onGround && this.timer < 0.4) this.timer = 0;
  }

  /** Aegis shield blocks light frontal hits. Returns the damage multiplier. */
  shieldFactor(hit: Hit) {
    if (this.def.type !== "aegis" || hit.heavy || this.isStunned() || this.state === "hurt") return 1;
    const attackerX = hit.source?.x ?? this.x - hit.dir;
    const fromFront = Math.sign(attackerX - this.x) === this.facing;
    return fromFront ? 0.15 : 1;
  }

  takeHit(hit: Hit) {
    if (this.state === "dying") return 0;
    return super.takeHit(hit);
  }

  protected onHurt(hit: Hit, dealt: number) {
    // Light enemies get interrupted; heavy ones only flinch from big hits.
    const threshold = this.isBoss ? Infinity : this.def.type === "mutant" ? 34 : this.def.type === "aegis" ? 24 : 0;
    if (dealt > threshold && this.state !== "dying") {
      this.clearTelegraph();
      this.hitstun = 0.32;
      this.setState("hurt", 0);
    }
    if (this.isBoss && !this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      this.scene.onBossEnrage(this);
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

  private render() {
    let tex = this.def.sprite;
    if (this.isBoss) {
      if (this.enraged && this.state !== "active") tex = "boss_rage";
      if (this.state === "windup" && this.move === "slam") tex = "boss_slam";
      if (this.state === "active" && this.move === "whip") tex = "boss_whip";
      if (this.state === "active" && this.move === "beam") tex = "boss_idle";
    } else if (this.def.type === "mutant" && (this.state === "windup" || this.state === "active")) {
      tex = "mutant_punch";
    }
    if (this.sprite.texture.key !== tex) {
      this.sprite.setTexture(tex);
      this.baseScale = (tex === this.def.sprite ? this.def.height : this.def.height * 0.95) / textureHeight(tex);
    }
    const flip = this.facing !== this.def.artFacing;
    const ax = anchorX(tex);
    this.sprite.setFlipX(flip).setOrigin(flip ? 1 - ax : ax, 1);

    let sx = this.baseScale;
    let sy = this.baseScale;
    const t = this.scene.time.now / 1000;
    if (this.state === "windup") {
      sx *= 1 + Math.sin(t * 50) * 0.03;
      sy *= 0.95;
    } else if (this.state === "move" && Math.abs(this.vx) > 20) {
      sy *= 1 + Math.sin(t * 16) * 0.03;
    }
    this.sprite.setPosition(this.x + (this.state === "windup" ? Math.sin(t * 80) * 2 : 0), this.y).setScale(sx, sy);
    this.renderCommon();
    if (this.state === "windup" && this.flashTime <= 0 && !this.isStunned()) this.sprite.setTint(0xffc4cc);
  }

  destroy() {
    this.clearTelegraph();
    super.destroy();
  }
}
