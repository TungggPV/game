import Phaser from "phaser";
import { GROUND_Y } from "../config/constants";
import type { Actor, Hit } from "../entities/Actor";
import type { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";
import { unlockEntry } from "./progress";
import { sfx } from "./sfx";

export class EventCallbacks {
  constructor(private scene: GameScene) {}

  onHeroHurt(_hero: Hero, dealt: number) {
    if (this.scene.mode !== "pk") this.scene.combo = 0;
    this.scene.fx.shake(0.004 + Math.min(dealt, 40) / 4000, 140);
  }

  onHeroDown(hero: Hero) {
    const pal = PALETTE[hero.def.element];
    this.scene.fx.shake(0.015, 300);
    this.scene.fx.explosion(hero.cx, hero.cy, pal, 90, false);
    if (this.scene.mode !== "pk" && !this.scene.anyHeroAlive()) {
      this.scene.time.delayedCall(1200, () => this.scene.finish(false));
    } else if (this.scene.mode === "coop") {
      this.scene.fx.label(hero.x, hero.y - 190, "Hồi sinh sau 8s", "#ffb0b8");
    }
  }

  onEnemyKilled(enemy: Enemy, hit: Hit) {
    const killer = hit.source instanceof Hero ? hit.source : undefined;
    const mult = 1 + Math.min(this.scene.combo, 50) / 25;
    const points = Math.round(enemy.def.score * mult);
    this.scene.score += points;
    if (killer) {
      killer.kills += 1;
      killer.score += points;
      killer.heal(killer.mods.healOnKill);
      if (unlockEntry("achievements", "first_blood")) {
        this.scene.events.emit("toast", "Thành tựu: Khởi Đầu Chiến Binh!");
      }
    }
    const blast = { main: 0xff8a2a, light: 0xfff0b0, dark: 0x8a1a1a };
    const size = Math.min(160, enemy.bodyH * 0.7);
    this.scene.time.delayedCall(enemy.isBoss ? 0 : 180, () => this.scene.fx.explosion(enemy.cx, enemy.cy, blast, size));
    this.scene.fx.shards(enemy.cx, enemy.cy, { main: 0x6fa8ff, light: 0xdfeaff, dark: 0x203060 }, enemy.isBoss ? 30 : 10, 600);
    sfx.boom();
    this.scene.fx.label(enemy.cx, enemy.y - enemy.bodyH - 30, `+${points}`, "#ffe45c");
    if (enemy.isBoss) {
      this.scene.fx.flash(0xffffff, 400);
      this.scene.fx.shake(0.03, 900);
      for (let i = 0; i < 7; i += 1) {
        this.scene.time.delayedCall(i * 200, () => {
          this.scene.fx.explosion(
            enemy.x + Phaser.Math.Between(-140, 140),
            enemy.cy + Phaser.Math.Between(-120, 100),
            blast,
            Phaser.Math.Between(90, 160),
          );
          sfx.boom();
        });
      }
      this.scene.time.delayedCall(1500, () => {
        this.scene.fx.pillar(enemy.x, 0xffd890, 3, 1.4, 900);
        this.scene.fx.ring(enemy.x, GROUND_Y - 4, 0xffd890, 700, 900, 0.22);
      });
      this.scene.aliveEnemies().forEach((e) => e.takeHit({ damage: 9999, dir: 1, color: 0xffffff }));
      this.scene.events.emit("boss", null);
      this.scene.boss = undefined;
      if (unlockEntry("achievements", "colossus_slayer")) {
        this.scene.events.emit("toast", "Thành tựu: Hạ Gục Colossus!");
      }
      if (this.scene.bossStartTime > 0 && Date.now() - this.scene.bossStartTime < 60000) {
        if (unlockEntry("achievements", "fast_boss")) {
          this.scene.events.emit("toast", "Thành tựu: Tốc Chiến Bất Bại (<60s)!");
        }
      }
    }
    this.scene.dropLoot(enemy);
  }

  onBossEnrage(boss: Enemy) {
    this.scene.fx.flash(0xff2040, 300);
    this.scene.fx.shake(0.02, 500);
    this.scene.events.emit("toast", "Colossus nổi giận!");
    sfx.warn();
    this.scene.fx.ring(boss.cx, boss.cy, 0xff3355, 420, 700);
    this.scene.fx.ring(boss.x, GROUND_Y - 4, 0xff3355, 600, 800, 0.22);
    this.scene.fx.embers(boss.cx, boss.cy, PALETTE.enemy, 30, 140);
  }

  onPerfectDodge(hero: Hero) {
    this.scene.perfectDodges += 1;
    this.scene.timeScale = 0.35;
    this.scene.setTimeScaleTimer(0.22);
    hero.gainEnergy(15);
    hero.cooldowns.dash = 0;
    const pal = this.scene.paletteFor(hero);
    this.scene.fx.label(hero.x, hero.y - 190, "NÉ HOÀN HẢO", "#9ff8ff");
    this.scene.fx.tintScreen(pal.main, 0.35, 220);
    sfx.dodge();
    if (this.scene.perfectDodges >= 5 && unlockEntry("achievements", "perfect_dodge_5")) {
      this.scene.events.emit("toast", "Thành tựu: Phản Xạ Thần Tốc (5 Né Hoàn Hảo)!");
    }
    if (this.scene.perfectDodges >= 10 && unlockEntry("achievements", "perfect_dodge_10")) {
      this.scene.events.emit("toast", "Thành tựu: Bóng Ma Chiến Trường (10 Né Hoàn Hảo)!");
    }
  }
}
