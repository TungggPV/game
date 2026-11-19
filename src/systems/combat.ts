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

  damagePosture(target: Actor, amount: number) {
    if (target.maxPosture <= 0 || target.isBroken()) return;
    target.posture = Math.max(0, target.posture - amount);
    if (target.posture <= 0) {
      target.brokenTimer = 3.5;
      sfx.break();
      this.scene.fx.shockRing(target.cx, target.cy, 260, 0xffbb00);
      this.scene.fx.dualImpactFlash(0xffe45c, 0xff5511, 240);
      this.scene.fx.label(target.cx, target.y - target.bodyH - 40, "PHÁ GIÁP!", "#ffe45c");
      if (unlockEntry("achievements", "break_master")) {
        this.scene.events.emit("toast", "Thành tựu: Phá Giáp Thần Tốc!");
      }
    }
  }

  private handleElementalReaction(attacker: Hero, target: Actor, element: "pyro" | "cryo" | "electro" | "geo" | "void") {
    if (!target.elementalStatus) {
      target.elementalStatus = element;
      target.elementalStatusTimer = 4.5;
      return;
    }

    const prev = target.elementalStatus;
    if (prev === element) {
      target.elementalStatusTimer = 4.5;
      return;
    }

    // Reaction happened!
    target.elementalStatus = undefined;
    target.elementalStatusTimer = 0;
    unlockEntry("achievements", "elemental_master");

    // 1. Quá Tải (Pyro + Electro)
    if ((prev === "pyro" && element === "electro") || (prev === "electro" && element === "pyro")) {
      this.scene.explode(attacker, target.cx, target.cy, 140, { damage: 70, dir: 1, knock: 450, color: 0xff6a1a });
      this.scene.fx.label(target.cx, target.y - target.bodyH - 45, "QUÁ TẢI!", "#ff6a1a");
      sfx.reaction();
      return;
    }

    // 2. Siêu Dẫn (Cryo + Electro)
    if ((prev === "cryo" && element === "electro") || (prev === "electro" && element === "cryo")) {
      target.applyStatus({ kind: "slow", time: 6 });
      this.scene.dealDamage(attacker, target, { damage: 50, dir: 1, color: 0x9fe8ff });
      this.scene.fx.shockRing(target.cx, target.cy, 140, 0x9fe8ff);
      this.scene.fx.label(target.cx, target.y - target.bodyH - 45, "SIÊU DẪN!", "#9fe8ff");
      sfx.reaction();
      return;
    }

    // 3. Tan Chảy (Pyro + Cryo)
    if ((prev === "pyro" && element === "cryo") || (prev === "cryo" && element === "pyro")) {
      this.scene.fx.flashCore(target.cx, target.cy, 1.8, 220);
      this.scene.dealDamage(attacker, target, { damage: 95, dir: 1, color: 0xffe45c });
      this.scene.fx.label(target.cx, target.y - target.bodyH - 45, "TAN CHẢY!", "#ffe45c");
      sfx.reaction();
      return;
    }

    // 4. Kết Tinh (Geo + Any)
    if (prev === "geo" || element === "geo") {
      this.damagePosture(target, 140);
      this.scene.fx.shards(target.cx, target.cy, PALETTE.earth, 16, 600);
      this.scene.pickupSys.dropLoot({ isBoss: false, x: target.cx, cy: target.cy } as unknown as Enemy);
      attacker.gainEnergy(15);
      this.scene.fx.label(target.cx, target.y - target.bodyH - 45, "KẾT TINH!", "#cca052");
      sfx.reaction();
      return;
    }
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
      if (attacker.overdriveTimer > 0) damage *= 1.25;
      if (Math.random() < attacker.mods.crit) {
        damage *= 2;
        crit = true;
      }
      if (this.scene.mode === "pk") damage *= hit.heavy ? 0.6 : 0.65;
    } else if (attacker instanceof Enemy) {
      const pwr = STAGE_POWER[this.scene.stageIndex] ?? 1.75;
      damage *= pwr;
      if (attacker.isElite && attacker.affixes.includes("vampiric")) {
        const heal = Math.round(attacker.maxHp * 0.12);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        this.scene.fx.label(attacker.x, attacker.y - attacker.bodyH - 20, `+${heal} HP`, "#37ffb0");
      }
    }

    let knock = hit.knock;
    let blocked = false;
    if (target instanceof Enemy) {
      if (target.isElite && target.affixes.includes("teleporter") && Math.random() < 0.28) {
        target.doTeleport();
      }
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

    // Posture reduction
    if (attacker instanceof Hero) {
      const basePostureDmg = hit.heavy ? 45 : 8;
      const isEarth = attacker.def.element === "earth";
      this.damagePosture(target, isEarth ? basePostureDmg * 2.2 : basePostureDmg);

      // Elemental Status & Reactions
      const heroElem = attacker.def.element;
      const mappedElem: "pyro" | "cryo" | "electro" | "geo" | "void" =
        heroElem === "fire" ? "pyro" : heroElem === "volt" ? "electro" : heroElem === "earth" ? "geo" : "cryo";
      this.handleElementalReaction(attacker, target, mappedElem);
    }

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
      if (this.combo >= 30) {
        attacker.overdriveTimer = 6.0;
      }
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
    if (attacker instanceof Hero) {
      this.scene.projectileSys.deflectAt(rect, attacker);
    }
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, t.bounds()) && this.scene.dealDamage(attacker, t, hit) > 0) count += 1;
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
        if (this.scene.dealDamage(attacker, t, { ...hit, dir }) > 0) count += 1;
      }
    }
    return count;
  }

  enemyAttack(enemy: Enemy, rect: Phaser.Geom.Rectangle, hit: Hit) {
    // 7.1 Clash / Parry Check
    for (const h of this.scene.heroes) {
      if (!h.dead && (h.state === "attack" || h.state === "cast")) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, h.bounds())) {
          // Trigger Parry!
          this.scene.fx.clashSpark(h.cx + h.facing * 35, h.cy, h.facing);
          sfx.parry();
          this.hitstop = 0.09;
          enemy.vx = -enemy.facing * 380;
          enemy.hitstun = 0.6;
          this.damagePosture(enemy, 140);
          h.gainEnergy(25);
          this.scene.score += 250;
          this.scene.fx.label(h.cx, h.y - h.bodyH - 25, "PARRY!", "#ffe45c");
          if (unlockEntry("achievements", "parry_master")) {
            this.scene.events.emit("toast", "Thành tựu: Bậc Thầy Giao Kiếm!");
          }
          return;
        }
      }
    }
    this.meleeHit(enemy, rect, { ...hit, source: enemy });
  }
}
