import Phaser from "phaser";
import { GROUND_Y, type SkillSlot } from "../config/constants";
import type { SkillDef } from "../config/heroes";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { PALETTE } from "./Fx";
import { sfx } from "./sfx";

export const castSkill = (scene: GameScene, hero: Hero, slot: SkillSlot, skill: SkillDef) => {
  const pal = PALETTE[hero.def.element];
  const fx = scene.fx;
  const dir = hero.facing;
  const base = { damage: skill.damage, dir, color: skill.color, status: skill.status, source: hero, heavy: slot !== "skill1" };

  switch (skill.kind) {
    case "projectile": {
      sfx[skill.chain ? "zap" : "shoot"]();
      const mx = hero.x + dir * 70;
      const my = hero.y - 88;
      fx.flashCore(mx, my, 0.8);
      fx.glow(mx, my, pal.main, 1.6, 180);
      fx.ring(mx, my, pal.light, 40, 200, 1.6);
      fx.sparks(mx, my, pal.main, dir, 6, 500, 30);
      hero.vx -= dir * 140; // recoil
      scene.spawnProjectile({
        owner: hero,
        x: mx,
        y: my,
        vx: dir * skill.speed,
        vy: 0,
        size: skill.size,
        color: skill.color,
        pierce: skill.pierce ?? 1,
        style: hero.def.element,
        explodeRadius: skill.explodeRadius,
        chain: skill.chain,
        hit: { ...base, knock: skill.knock ?? 150 },
      });
      return;
    }

    case "burst": {
      sfx.boom();
      if (skill.screen) {
        // Nova Overdrive: charge, then a screen-wide plasma nova with a horizontal beam.
        const cy = hero.y - 80;
        fx.flash(pal.main, 150);
        fx.shake(0.022, 500);
        fx.zoomPunch(0.06, 400);
        fx.flashCore(hero.cx, cy, 3, 300);
        for (let i = 0; i < 4; i += 1) {
          scene.time.delayedCall(i * 90, () => {
            fx.ring(hero.x, cy, i % 2 ? pal.light : pal.main, 420 + i * 220, 600);
            fx.ring(hero.x, GROUND_Y - 4, pal.main, 520 + i * 260, 700, 0.2);
          });
        }
        const [minX, maxX] = scene.arenaBounds();
        const beam = scene.add.image((minX + maxX) / 2, cy, "beam").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(maxX - minX, 10).setDepth(55);
        const core = scene.add.image((minX + maxX) / 2, cy, "beam").setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(maxX - minX, 4).setDepth(56);
        scene.tweens.add({ targets: beam, displayHeight: 260, alpha: 0, duration: 600, ease: "Cubic.easeOut", onComplete: () => beam.destroy() });
        scene.tweens.add({ targets: core, displayHeight: 80, alpha: 0, duration: 450, ease: "Cubic.easeOut", onComplete: () => core.destroy() });
        for (let i = 0; i < 6; i += 1) {
          const px = Phaser.Math.Linear(minX + 120, maxX - 120, i / 5);
          scene.time.delayedCall(80 + Math.abs(px - hero.x) / 4, () => fx.pillar(px, pal.main, 1.3, 1, 520));
        }
        fx.shards(hero.cx, cy, pal, 30, 1300);
        fx.embers(hero.cx, cy, pal, 40, 300);
        scene.areaHit(hero, (minX + maxX) / 2, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);
        return;
      }

      const cx = hero.x + dir * skill.offset;
      const cy = hero.y - 75;
      if (hero.def.element === "fire") {
        // Inferno Arc: two heavy fire crescents and a fan of flame.
        fx.slash(cx - dir * 20, cy, dir, pal, { scale: 2.2, tilt: 0.15, sweep: 1.6, duration: 300 });
        scene.time.delayedCall(60, () => fx.slash(cx, cy + 10, dir, pal, { scale: 1.8, tilt: -0.2, sweep: 1.4, duration: 300 }));
        fx.particles(hero.x + dir * 60, cy, "flame", {
          speed: { min: 300, max: 900 },
          angle: dir > 0 ? { min: -45, max: 35 } : { min: 145, max: 225 },
          lifespan: { min: 280, max: 520 },
          scale: { start: 1.2, end: 0.15 },
          alpha: { start: 1, end: 0 },
          rotate: { onEmit: () => 0, onUpdate: (p: Phaser.GameObjects.Particles.Particle) => Math.atan2(p.velocityY, p.velocityX) * (180 / Math.PI) + 90 },
          color: [0xffffff, pal.light, pal.main, pal.dark],
          blendMode: Phaser.BlendModes.ADD,
        }, 36);
        fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.4, 500, 0.22);
        fx.embers(cx, cy, pal, 20, skill.radius * 0.6);
        fx.smoke(cx, cy, 5, 60);
        fx.shake(0.01, 180);
      } else {
        // Rising Blade: three stacked upward crescents and a plasma pillar.
        [0, 1, 2].forEach((i) => {
          scene.time.delayedCall(i * 55, () => fx.slash(cx, cy + 30 - i * 40, dir, pal, { scale: 1.5 + i * 0.25, tilt: -0.9, sweep: 1.5, duration: 260, thin: i === 1 }));
        });
        fx.pillar(cx, pal.main, 1.2, 0.9, 450);
        fx.ring(cx, GROUND_Y - 4, pal.light, skill.radius * 1.2, 420, 0.22);
        fx.particles(cx, GROUND_Y - 10, "streak", {
          speed: { min: 400, max: 900 }, angle: { min: -100, max: -80 }, lifespan: { min: 200, max: 400 },
          scale: { start: 0.8, end: 0 }, color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD, rotate: -90,
          emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-60, 0, 120, 10) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        }, 18);
        fx.shake(0.008, 160);
      }
      scene.areaHit(hero, cx, cy, skill.radius, { ...base, knock: skill.knock ?? 260, launch: skill.launch });
      return;
    }

    case "field": {
      sfx.zap();
      scene.spawnField({
        owner: hero,
        offset: skill.offset,
        x: hero.x + dir * skill.offset,
        y: GROUND_Y - 70,
        radius: skill.radius,
        duration: skill.duration,
        tick: skill.tick,
        color: skill.color,
        style: hero.def.element === "volt" ? "cage" : "spiral",
        hit: { ...base, knock: 40 },
      });
      return;
    }

    case "strikes": {
      const targets = scene.targetsFor(hero).filter((t) => !t.dead);
      const [minX, maxX] = scene.arenaBounds();
      if (!skill.meteor) fx.tintScreen(0x1a0a40, 0.5, skill.count * skill.interval * 1000 + 200);
      for (let i = 0; i < skill.count; i += 1) {
        scene.time.delayedCall(i * skill.interval * 1000, () => {
          const alive = targets.filter((t) => !t.dead);
          const x = alive.length ? alive[i % alive.length].x + Phaser.Math.Between(-30, 30) : Phaser.Math.Between(minX + 120, maxX - 120);
          if (skill.meteor) {
            scene.spawnMeteor(hero, x, skill.radius, { ...base, knock: 300, launch: 500 });
            return;
          }
          // Storm Breaker: forked bolt from the sky, impact flash and a ground ring.
          sfx.zap();
          const top = scene.cameras.main.worldView.y - 20;
          fx.lightning(x + Phaser.Math.Between(-60, 60), top, x, GROUND_Y - 6, pal.main, 1.4, 3, 300);
          fx.pillar(x, pal.main, 0.8, 1.1, 300);
          fx.flashCore(x, GROUND_Y - 30, 1.4, 160);
          fx.ring(x, GROUND_Y - 4, pal.light, skill.radius * 1.3, 380, 0.24);
          fx.sparks(x, GROUND_Y - 20, pal.main, 1, 8, 800, 180);
          fx.flash(pal.light, 60);
          fx.shake(0.008, 100);
          scene.areaHit(hero, x, GROUND_Y - 80, skill.radius, { ...base, knock: 120, stun: 1.2 });
        });
      }
      return;
    }

    case "sweep": {
      // Emerald Mirage: phantom dashes back and forth leaving afterimages and leaf storms.
      sfx.dash();
      const [minX, maxX] = scene.arenaBounds();
      const step = 0.13;
      hero.enterSweep(skill.hits * step + 0.1);
      fx.tintScreen(pal.dark, 0.6, skill.hits * step * 1000 + 200);
      for (let i = 0; i < skill.hits; i += 1) {
        scene.time.delayedCall(i * step * 1000, () => {
          if (hero.dead) return;
          const goingRight = i % 2 === 0 ? dir > 0 : dir < 0;
          const fromX = hero.x;
          const toX = goingRight ? maxX - 100 : minX + 100;
          hero.facing = goingRight ? 1 : -1;
          for (let k = 0; k < 7; k += 1) {
            hero.x = Phaser.Math.Linear(fromX, toX, (k + 1) / 7);
            hero.sprite.setPosition(hero.x, hero.y).setFlipX(!goingRight);
            fx.afterimage(hero.sprite, k % 2 ? pal.main : pal.light, 0.55, 320);
          }
          const y = hero.y - 80;
          const line = scene.add.image((fromX + toX) / 2, y, "beam").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD)
            .setDisplaySize(Math.abs(toX - fromX), 18).setDepth(55);
          scene.tweens.add({ targets: line, displayHeight: 2, alpha: 0, duration: 260, onComplete: () => line.destroy() });
          fx.particles((fromX + toX) / 2, y, "leaf", {
            emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-Math.abs(toX - fromX) / 2, -20, Math.abs(toX - fromX), 40) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
            speedX: { min: (goingRight ? 1 : -1) * 100, max: (goingRight ? 1 : -1) * 400 }, speedY: { min: -150, max: 150 },
            lifespan: { min: 400, max: 700 }, scale: { start: 1, end: 0.2 }, rotate: { start: 0, end: 720 },
            color: [pal.light, pal.main, pal.dark], alpha: { start: 1, end: 0 },
          }, 16);
          sfx.swing();
          for (const t of scene.targetsFor(hero)) {
            if (t.dead) continue;
            fx.slash(t.cx, t.cy, hero.facing, pal, { scale: 1.3, tilt: i % 2 ? 0.6 : -0.6, sweep: 1.4, duration: 220 });
          }
          scene.areaHit(hero, (minX + maxX) / 2, GROUND_Y - 200, 9999, { ...base, knock: 60, status: i === skill.hits - 1 ? { kind: "poison", time: 3 } : undefined }, true);
        });
      }
      scene.time.delayedCall(skill.hits * step * 1000 + 80, () => {
        hero.endSweep();
        fx.ring(hero.x, hero.y - 70, pal.main, 160, 400);
      });
      return;
    }
  }
};
