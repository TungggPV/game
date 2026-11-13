import Phaser from "phaser";
import { GROUND_Y, type SkillSlot } from "../config/constants";
import type { SkillDef } from "../config/heroes";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { sfx } from "./sfx";

export const castSkill = (scene: GameScene, hero: Hero, slot: SkillSlot, skill: SkillDef) => {
  const isUlt = slot === "ultimate";
  const base = { damage: skill.damage, dir: hero.facing, color: skill.color, status: skill.status, source: hero, heavy: slot !== "skill1" };

  switch (skill.kind) {
    case "projectile": {
      sfx[skill.chain ? "zap" : "shoot"]();
      scene.spawnProjectile({
        owner: hero,
        x: hero.x + hero.facing * 70,
        y: hero.y - 88,
        vx: hero.facing * skill.speed,
        vy: 0,
        size: skill.size,
        color: skill.color,
        pierce: skill.pierce ?? 1,
        explodeRadius: skill.explodeRadius,
        chain: skill.chain,
        hit: { ...base, knock: skill.knock ?? 150 },
      });
      scene.fx.glow(hero.x + hero.facing * 70, hero.y - 88, skill.color, 1.6, 160);
      return;
    }

    case "burst": {
      const [minX, maxX] = scene.arenaBounds();
      const cx = skill.screen ? (minX + maxX) / 2 : hero.x + hero.facing * skill.offset;
      const cy = hero.y - 70;
      if (skill.screen) {
        sfx.boom();
        scene.fx.flash(skill.color, 260);
        scene.fx.shake(0.02, 420);
        for (let i = 0; i < 4; i += 1) scene.time.delayedCall(i * 90, () => scene.fx.ring(hero.x, cy, skill.color, 500 + i * 160, 520));
        scene.fx.burst(hero.x, cy, skill.color, 40, 1400, 1.2);
        scene.areaHit(hero, cx, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);
      } else {
        sfx.boom();
        scene.fx.shake(0.008, 160);
        scene.fx.slash(cx, cy - 10, hero.facing, skill.color, 1.8, false);
        scene.fx.slash(cx, cy + 10, hero.facing, skill.color, 1.5, true);
        scene.fx.ring(cx, cy, skill.color, skill.radius);
        scene.fx.burst(cx, cy, skill.color, 18, 600, 0.9);
        scene.areaHit(hero, cx, cy, skill.radius, { ...base, knock: skill.knock ?? 260, launch: skill.launch });
      }
      if (isUlt) hero.invuln = Math.max(hero.invuln, 0.4);
      return;
    }

    case "field": {
      sfx.zap();
      scene.spawnField({
        owner: hero,
        offset: skill.offset,
        x: hero.x + hero.facing * skill.offset,
        y: GROUND_Y - 70,
        radius: skill.radius,
        duration: skill.duration,
        tick: skill.tick,
        color: skill.color,
        hit: { ...base, knock: 40 },
      });
      return;
    }

    case "strikes": {
      const targets = scene.targetsFor(hero).filter((t) => !t.dead);
      const [minX, maxX] = scene.arenaBounds();
      for (let i = 0; i < skill.count; i += 1) {
        scene.time.delayedCall(i * skill.interval * 1000, () => {
          const alive = targets.filter((t) => !t.dead);
          const x = alive.length
            ? alive[i % alive.length].x + Phaser.Math.Between(-30, 30)
            : Phaser.Math.Between(minX + 120, maxX - 120);
          if (skill.meteor) {
            scene.spawnMeteor(hero, x, skill.radius, { ...base, knock: 300, launch: 500 });
          } else {
            sfx.zap();
            scene.fx.lightning(x, scene.cameras.main.worldView.y - 20, GROUND_Y, skill.color);
            scene.fx.burst(x, GROUND_Y - 20, skill.color, 10, 500, 0.8, "spark");
            scene.fx.shake(0.006, 90);
            scene.areaHit(hero, x, GROUND_Y - 80, skill.radius, { ...base, knock: 120, stun: 1.2 });
          }
        });
      }
      return;
    }

    case "sweep": {
      sfx.dash();
      const [minX, maxX] = scene.arenaBounds();
      const step = 0.13;
      hero.enterSweep(skill.hits * step + 0.1);
      for (let i = 0; i < skill.hits; i += 1) {
        scene.time.delayedCall(i * step * 1000, () => {
          if (hero.dead) return;
          const goingRight = i % 2 === 0 ? hero.facing > 0 : hero.facing < 0;
          const fromX = hero.x;
          const toX = goingRight ? maxX - 100 : minX + 100;
          for (let k = 0; k < 5; k += 1) {
            hero.x = Phaser.Math.Linear(fromX, toX, (k + 1) / 5);
            hero.sprite.setPosition(hero.x, hero.y);
            scene.fx.afterimage(hero.sprite, skill.color);
          }
          hero.facing = goingRight ? 1 : -1;
          sfx.swing();
          for (const t of scene.targetsFor(hero)) {
            if (t.dead) continue;
            scene.fx.slash(t.cx, t.cy, hero.facing, skill.color, 1.2, i % 2 === 1);
          }
          scene.areaHit(hero, (minX + maxX) / 2, GROUND_Y - 200, 9999, { ...base, knock: 60, status: i === skill.hits - 1 ? { kind: "poison", time: 3 } : undefined }, true);
        });
      }
      scene.time.delayedCall(skill.hits * step * 1000 + 80, () => hero.endSweep());
      return;
    }
  }
};
