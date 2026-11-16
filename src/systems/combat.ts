import Phaser from "phaser";
import { STAGE_POWER } from "../config/content";
import type { Actor, Hit } from "../entities/Actor";
import { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE, type Palette } from "./Fx";
import { unlockEntry } from "./progress";
import { sfx } from "./sfx";

export class CombatSystem {
  combo = 0;
  comboTimer = 0;
  hitstop = 0;

  constructor(private scene: GameScene) {}

  update(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
    }
  }

  clear() {
    this.combo = 0;
    this.comboTimer = 0;
    this.hitstop = 0;
  }

  targetsFor(actor: Actor): Actor[] {
    if (actor instanceof Hero) return this.scene.mode === "pk" ? this.scene.heroes.filter((h) => h !== actor) : this.scene.enemies;
    return this.scene.heroes;
  }

  paletteFor(actor: Actor | undefined): Palette {
    if (actor instanceof Hero) return PALETTE[actor.def.element];
    if (actor instanceof Enemy && actor.isBoss) return PALETTE.boss;
    return PALETTE.enemy;
  }

  dealDamage(attacker: Actor | undefined, target: Actor, hit: Hit): number {
    if (target instanceof Hero && target.invuln > 0 && target.dodging && attacker instanceof Enemy) {
      this.scene.onPerfectDodge(target);
    }
    if (target.dead || target.invuln > 0) return 0;
    let damage = hit.damage;
    let crit = false;
    if (attacker instanceof Hero) {
      damage *= attacker.def.power * attacker.mods.damage;
      if (Math.random() < attacker.mods.crit) {
        damage *= 2;
        crit = true;
      }
      if (this.scene.mode === "pk") damage *= hit.heavy ? 0.6 : 0.65;
    } else if (attacker instanceof Enemy) {
      const pwr = STAGE_POWER[this.scene.stageIndex] ?? 1.75;
      damage *= pwr;
    }

    let knock = hit.knock;
    let blocked = false;
    if (target instanceof Enemy) {
      const shield = target.shieldFactor(hit);
      if (shield < 1) {
        blocked = true;
        damage *= shield;
        knock = (knock ?? 100) * 0.2;
        const sx = target.x + target.facing * target.bodyW * 0.45;
        this.scene.fx.flashCore(sx, target.cy, 0.8);
        this.scene.fx.ring(sx, target.cy, 0x9fe8ff, 60, 220);
        this.scene.fx.sparks(sx, target.cy, 0x9fe8ff, target.facing, 10, 700);
        this.scene.fx.label(target.x, target.y - target.bodyH - 20, "CHẶN", "#9fe8ff");
      }
    }

    const dealt = target.takeHit({ ...hit, damage, knock, source: attacker });
    if (dealt <= 0) return 0;

    const heavy = crit || !!hit.heavy;
    if (!blocked) this.scene.fx.hit(target.cx - hit.dir * target.bodyW * 0.15, target.cy - 10, hit.dir, this.paletteFor(attacker), heavy);
    if (target instanceof Enemy || this.scene.mode === "pk") this.scene.fx.number(target.cx, target.y - target.bodyH - 10, dealt, 0xffffff, crit);
    if (crit) sfx.crit();
    else sfx.hit();
    this.hitstop = Math.max(this.hitstop, heavy ? 0.075 : 0.04);
    if (heavy) {
      this.scene.fx.shake(0.006, 110);
      this.scene.fx.zoomPunch(0.025, 180);
    }

    if (attacker instanceof Hero) {
      this.combo += 1;
      this.comboTimer = 2.2;
      attacker.gainEnergy(1);
      if (this.combo >= 20 && unlockEntry("achievements", "combo_20")) {
        this.scene.events.emit("toast", "Thành tựu: Lưỡi Kiếm Liền Mạch (20 Combo)!");
      }
      if (this.combo >= 50 && unlockEntry("achievements", "combo_50")) {
        this.scene.events.emit("toast", "Thành tựu: Vũ Điệu Hào Quang (50 Combo)!");
      }
    }
    return dealt;
  }

  meleeHit(attacker: Actor, rect: Phaser.Geom.Rectangle, hit: Hit): number {
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, t.bounds()) && this.dealDamage(attacker, t, hit) > 0) count += 1;
    }
    return count;
  }

  areaHit(attacker: Actor, cx: number, cy: number, radius: number, hit: Hit, everywhere = false): number {
    const circle = new Phaser.Geom.Circle(cx, cy, radius);
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (everywhere || Phaser.Geom.Intersects.CircleToRectangle(circle, t.bounds())) {
        const dir = Math.sign(t.x - attacker.x) || attacker.facing;
        if (this.dealDamage(attacker, t, { ...hit, dir }) > 0) count += 1;
      }
    }
    return count;
  }

  enemyAttack(enemy: Enemy, rect: Phaser.Geom.Rectangle, hit: Hit) {
    this.meleeHit(enemy, rect, { ...hit, source: enemy });
  }
}
