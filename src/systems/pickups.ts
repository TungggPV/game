import Phaser from "phaser";
import { DEPTH, GROUND_Y } from "../config/constants";
import type { Enemy } from "../entities/Enemy";
import type { GameScene } from "../scenes/GameScene";
import { sfx } from "./sfx";

export type Pickup = {
  kind: "health" | "energy" | "coin";
  img: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  life: number;
};

export class PickupSystem {
  pickups: Pickup[] = [];

  constructor(private scene: GameScene) {}

  update(dt: number) {
    const timeNow = this.scene.time.now;
    for (const p of this.pickups) {
      p.life -= dt;
      p.vy += 1800 * dt;
      const restY = GROUND_Y - 22;
      p.y = Math.min(restY, p.y + p.vy * dt);
      if (p.y >= restY) p.vy = 0;

      const bob = p.vy === 0 ? Math.sin(timeNow / 220 + p.x) * 4.5 : 0;
      const currentY = p.y + bob;
      const alpha = p.life < 2 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1;

      p.img.setPosition(p.x, currentY).setAlpha(alpha);

      if (p.glow) {
        const pulse = 0.55 + 0.35 * Math.sin(timeNow / 180 + p.x);
        p.glow.setPosition(p.x, currentY).setAlpha(pulse * alpha);
      }

      const hFromGround = Math.max(0, GROUND_Y - currentY);
      const sFactor = Math.max(0.35, 1 - hFromGround / 220);
      const baseW = p.kind === "coin" ? 28 : 34;
      p.shadow.setPosition(p.x, GROUND_Y).setScale(
        sFactor * (baseW / 128),
        sFactor * (10 / 64),
      ).setAlpha(0.75 * sFactor * alpha);

      const hero = this.scene.heroes.find((h) => !h.dead && Math.abs(h.x - p.x) < 60 && Math.abs(h.y - 60 - currentY) < 110);
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
        this.scene.fx.ring(p.x, currentY, color, 50, 260);
        this.scene.fx.embers(p.x, currentY, { main: color, light: 0xffffff, dark: color }, 8, 16);
      }
      if (p.life <= 0) {
        p.img.destroy();
        p.glow?.destroy();
        p.shadow.destroy();
      }
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }

  clear() {
    this.pickups.forEach((p) => {
      p.img.destroy();
      p.glow?.destroy();
      p.shadow.destroy();
    });
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
      const color = kind === "health" ? 0x7dff9a : kind === "energy" ? 0x7de8ff : 0xffe45c;
      // Increased size: Coin +28%, Health/Energy +25%
      const baseScale = kind === "coin" ? 0.58 : 0.75;
      const img = this.scene.add.image(x, enemy.cy, key).setScale(baseScale).setDepth(DEPTH.projectile);
      const glow = this.scene.add.image(x, enemy.cy, "core")
        .setScale(kind === "coin" ? 0.5 : 0.65)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.projectile - 1);
      const baseW = kind === "coin" ? 28 : 34;
      const shadow = this.scene.add.image(x, GROUND_Y, "contact_shadow")
        .setDisplaySize(baseW, 10)
        .setDepth(DEPTH.shadow);
      this.pickups.push({
        kind,
        img,
        glow,
        shadow,
        x,
        y: Math.min(enemy.cy, GROUND_Y - 40),
        vy: -420 - Math.random() * 200,
        life: 12,
      });
    });
  }
}
