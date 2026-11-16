import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Enemy } from "../entities/Enemy";
import type { GameScene } from "../scenes/GameScene";
import { sfx } from "./sfx";

export type Pickup = {
  kind: "health" | "energy" | "coin";
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  life: number;
};

export class PickupSystem {
  pickups: Pickup[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    for (const p of this.pickups) {
      p.life -= dt;
      p.vy += 1800 * dt;
      p.y = Math.min(GROUND_Y - 24, p.y + p.vy * dt);
      if (p.y >= GROUND_Y - 24) p.vy = 0;
      const bob = p.vy === 0 ? Math.sin(this.scene.time.now / 200 + p.x) * 5 : 0;
      p.img.setPosition(p.x, p.y + bob).setAlpha(p.life < 2 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1);
      const hero = this.scene.heroes.find((h) => !h.dead && Math.abs(h.x - p.x) < 60 && Math.abs(h.y - 60 - p.y) < 110);
      if (hero && p.vy === 0) {
        p.life = -1;
        sfx.pickup();
        const color = p.kind === "health" ? 0x7dff9a : p.kind === "energy" ? 0x7de8ff : 0xffe45c;
        if (p.kind === "health") {
          hero.heal(45);
          this.scene.fx.label(hero.x, hero.y - 170, "+45 HP", "#7dff9a");
        } else if (p.kind === "energy") {
          hero.gainEnergy(30);
          this.scene.fx.label(hero.x, hero.y - 170, "+30 NL", "#7de8ff");
        } else {
          this.scene.score += 50;
          hero.score += 50;
          this.scene.pendingCoins += 1;
          this.scene.fx.label(hero.x, hero.y - 170, "+1 XU", "#ffe45c");
        }
        this.scene.fx.ring(p.x, p.y, color, 50, 260);
        this.scene.fx.embers(p.x, p.y, { main: color, light: 0xffffff, dark: color }, 8, 16);
      }
      if (p.life <= 0) p.img.destroy();
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }

  clear() {
    this.pickups.forEach((p) => p.img.destroy());
    this.pickups = [];
  }

  dropLoot(enemy: Enemy) {
    const drops: Pickup["kind"][] = ["coin"];
    const r = Math.random();
    const canHeal = this.scene.activeModifier !== "no_heal";
    if (enemy.isBoss) {
      if (canHeal) drops.push("health");
      drops.push("energy", "coin", "coin");
    } else if (r < 0.22 && canHeal) {
      drops.push("health");
    } else if (r < 0.5) {
      drops.push("energy");
    }
    drops.forEach((kind, i) => {
      const key = kind === "health" ? "item_health" : kind === "energy" ? "item_energy" : "item_coin";
      const x = Phaser.Math.Clamp(enemy.x + (i - drops.length / 2) * 40, this.scene.arenaMin + 40, this.scene.arenaMax - 40);
      const img = this.scene.add.image(x, enemy.cy, key).setScale(kind === "coin" ? 0.45 : 0.6).setDepth(DEPTH.projectile);
      this.pickups.push({ kind, img, x, y: Math.min(enemy.cy, GROUND_Y - 40), vy: -420 - Math.random() * 200, life: 12 });
    });
  }
}
