import Phaser from "phaser";
import { GROUND_Y, type SkillSlot } from "../config/constants";
import type { SkillDef } from "../config/heroes";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { fxSeq, PALETTE } from "./Fx";
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
      fx.playAnim(mx, my, fxSeq("fx_blast_anim", 8), {
        flipX: dir < 0,
        tint: pal.main,
        scale: 0.68,
        endScale: 1.02,
        duration: 210,
      });
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
        const cy = hero.y - 80;
        const [minX, maxX] = scene.arenaBounds();
        fx.flash(pal.main, 150);
        fx.shake(0.022, 500);
        fx.zoomPunch(0.06, 400);
        if (hero.def.element === "earth") {
          // Tectonic Wrath: sweeping seismic magma spire waves across the battlefield
          for (let i = 0; i < 5; i += 1) {
            const offset = i * 165;
            scene.time.delayedCall(i * 75, () => {
              for (const side of i === 0 ? [0] : [-1, 1]) {
                const px = Phaser.Math.Clamp(hero.x + side * offset, minX + 60, maxX - 60);
                fx.playAnim(px, GROUND_Y + 6, fxSeq("fx_earth_spire", 8), {
                  originY: 1,
                  blendMode: Phaser.BlendModes.NORMAL,
                  scale: 1.35,
                  endScale: 1.55,
                  duration: 620,
                });
                fx.groundCrack(px, 1.4, pal.main);
                fx.explosion(px, GROUND_Y - 40, pal, 110, false);
              }
            });
          }
          scene.areaHit(hero, (minX + maxX) / 2, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);
          return;
        }
        // Nova Overdrive: swirling plasma vortex + sweeping beam + animated Nova pillars
        fx.playAnim(hero.x, GROUND_Y + 6, fxSeq("fx_nova_vortex", 8), {
          originY: 1,
          scale: 1.85,
          endScale: 2.35,
          duration: 620,
        });
        fx.playAnim(hero.x + dir * 240, cy, fxSeq("fx_blast_anim", 8), {
          flipX: dir < 0,
          tint: pal.main,
          scale: 2.6,
          endScale: 3.1,
          duration: 520,
        });
        fx.groundCrack(hero.x, 1.8, pal.main);
        for (let i = 0; i < 4; i += 1) {
          scene.time.delayedCall(i * 90, () => {
            fx.ring(hero.x, cy, i % 2 ? pal.light : pal.main, 420 + i * 220, 600);
            fx.ring(hero.x, GROUND_Y - 4, pal.main, 520 + i * 260, 700, 0.2);
          });
        }
        const beam = scene.add.image((minX + maxX) / 2, cy, "beam").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(maxX - minX, 12).setDepth(55);
        const core = scene.add.image((minX + maxX) / 2, cy, "beam").setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(maxX - minX, 5).setDepth(56);
        scene.tweens.add({ targets: beam, displayHeight: 260, alpha: 0, duration: 600, ease: "Cubic.easeOut", onComplete: () => beam.destroy() });
        scene.tweens.add({ targets: core, displayHeight: 80, alpha: 0, duration: 450, ease: "Cubic.easeOut", onComplete: () => core.destroy() });
        for (let i = 0; i < 6; i += 1) {
          const px = Phaser.Math.Linear(minX + 120, maxX - 120, i / 5);
          scene.time.delayedCall(80 + Math.abs(px - hero.x) / 4, () => {
            fx.playAnim(px, GROUND_Y + 6, fxSeq("fx_nova_pillar", 8), {
              originY: 1,
              scale: 1.35,
              endScale: 1.55,
              duration: 500,
            });
            fx.groundCrack(px, 0.9, pal.main);
          });
        }
        fx.shards(hero.cx, cy, pal, 24, 1300);
        fx.embers(hero.cx, cy, pal, 32, 300);
        scene.areaHit(hero, (minX + maxX) / 2, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);
        return;
      }

      const cx = hero.x + dir * skill.offset;
      const cy = hero.y - 75;
      if (hero.def.element === "fire") {
        // Inferno Arc: sweeping painted fire vortex + dual fire crescents
        fx.playAnim(cx, GROUND_Y + 8, fxSeq("fx_fire_vortex", 8), {
          originY: 1,
          flipX: dir < 0,
          scale: 1.45,
          endScale: 1.85,
          duration: 380,
        });
        fx.slash(cx - dir * 20, cy, dir, pal, { scale: 2.1, tilt: 0.15, sweep: 0.78, duration: 300 });
        scene.time.delayedCall(60, () => fx.slash(cx, cy + 10, dir, pal, { scale: 1.75, tilt: -0.2, sweep: 0.72, duration: 300 }));
        fx.groundCrack(cx, 1.35, pal.main);
        fx.particles(hero.x + dir * 60, cy, "flame", {
          speed: { min: 300, max: 900 },
          angle: dir > 0 ? { min: -45, max: 35 } : { min: 145, max: 225 },
          lifespan: { min: 280, max: 520 },
          scale: { start: 1.2, end: 0.15 },
          alpha: { start: 1, end: 0 },
          rotate: { onEmit: () => 0, onUpdate: (p: Phaser.GameObjects.Particles.Particle) => Math.atan2(p.velocityY, p.velocityX) * (180 / Math.PI) + 90 },
          color: [0xffffff, pal.light, pal.main, pal.dark],
          blendMode: Phaser.BlendModes.ADD,
        }, 28);
        fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.4, 500, 0.22);
        fx.embers(cx, cy, pal, 18, skill.radius * 0.6);
        fx.shake(0.01, 180);
      } else if (hero.def.element === "void") {
        // Phantom Rift: animated dimensional X-tear + black-hole orb implosion + siphon heal
        fx.playAnim(cx, cy, fxSeq("fx_void_rift", 8), {
          scale: 1.25,
          endScale: 1.65,
          endRotation: 0.18 * dir,
          duration: 380,
          depth: 58,
        });
        fx.playAnim(cx, cy, fxSeq("fx_void_orb", 8), {
          scale: 0.85,
          endScale: 1.25,
          duration: 360,
          depth: 57,
        });
        fx.slash(cx - dir * 10, cy - 10, dir, pal, { scale: 1.9, tilt: -0.28, sweep: 0.78, duration: 280 });
        scene.time.delayedCall(55, () => fx.slash(cx, cy + 8, dir, pal, { scale: 1.9, tilt: 0.28, sweep: 0.78, duration: 280 }));
        fx.groundCrack(cx, 1.3, pal.main);
        fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.35, 450, 0.22);
        fx.shards(cx, cy, pal, 20, 980);
        hero.heal(8);
        fx.label(hero.x, hero.y - 165, "+8 HP", "#f0abfc");
        fx.shake(0.012, 180);
      } else if (hero.def.element === "earth") {
        // Earth Barrier: 3 erupting volcanic obsidian spire monoliths + ground fissures
        for (const off of [-48, 0, 48]) {
          fx.playAnim(cx + off, GROUND_Y + 6, fxSeq("fx_earth_spire", 8), {
            originY: 1,
            blendMode: Phaser.BlendModes.NORMAL,
            scale: off === 0 ? 1.3 : 1.05,
            endScale: off === 0 ? 1.48 : 1.18,
            duration: 580,
          });
        }
        fx.groundCrack(cx, 1.45, pal.main);
        fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.5, 500, 0.25);
        fx.shards(cx, cy, pal, 22, 900);
        fx.dust(cx, dir, 1.5);
        fx.shake(0.015, 220);
      } else {
        // Rising Blade: three stacked upward crescents and an animated plasma pillar
        [0, 1, 2].forEach((i) => {
          scene.time.delayedCall(i * 55, () => fx.slash(cx, cy + 30 - i * 40, dir, pal, { scale: 1.5 + i * 0.25, tilt: -0.28, sweep: 0.76, duration: 260, thin: i === 1 }));
        });
        fx.playAnim(cx, GROUND_Y + 6, fxSeq("fx_nova_pillar", 8), {
          originY: 1,
          scale: 1.28,
          endScale: 1.46,
          duration: 460,
        });
        fx.groundCrack(cx, 1.2, pal.main);
        fx.ring(cx, GROUND_Y - 4, pal.light, skill.radius * 1.2, 420, 0.22);
        fx.particles(cx, GROUND_Y - 10, "streak", {
          speed: { min: 400, max: 900 }, angle: { min: -100, max: -80 }, lifespan: { min: 200, max: 400 },
          scale: { start: 0.8, end: 0 }, color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD, rotate: -90,
          emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-60, 0, 120, 10) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        }, 16);
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
        style: hero.def.element === "volt" ? "cage" : hero.def.element === "cryo" ? "blizzard" : "spiral",
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
          if (hero.def.element === "cryo") {
            // Eternal Permafrost: falling crystalline ice monolith sprite slamming into frost nova
            const iceKeys = fxSeq("fx_ice_monolith", 8);
            const ice = scene.add
              .image(x, -120, scene.textures.exists(iceKeys[0]) ? iceKeys[0] : "shard")
              .setOrigin(0.5, 1)
              .setRotation(Math.PI)
              .setScale(1.1)
              .setDepth(58);
            scene.tweens.add({
              targets: ice,
              y: GROUND_Y + 6,
              rotation: Math.PI,
              duration: 180,
              ease: "Cubic.easeIn",
              onComplete: () => {
                sfx.boom();
                ice.setOrigin(0.5, 1).setRotation(0);
                fx.playAnim(x, GROUND_Y + 6, iceKeys, { originY: 1, blendMode: Phaser.BlendModes.NORMAL, scale: 1.25, endScale: 1.4, duration: 520 });
                fx.playAnim(x, GROUND_Y - 10, fxSeq("fx_cryo_blizzard", 8), {
                  scale: 1.15,
                  scaleY: 0.42,
                  duration: 380,
                });
                fx.groundCrack(x, 1.1, pal.light);
                fx.flashCore(x, GROUND_Y - 30, 1.5, 180);
                fx.ring(x, GROUND_Y - 4, pal.light, skill.radius * 1.4, 420, 0.24);
                fx.shards(x, GROUND_Y - 30, pal, 18, 950);
                fx.shake(0.01, 120);
                scene.areaHit(hero, x, GROUND_Y - 80, skill.radius, { ...base, knock: 120, stun: skill.status?.time ?? 1.8 });
                scene.tweens.add({ targets: ice, alpha: 0, delay: 180, duration: 180, onComplete: () => ice.destroy() });
              },
            });
            return;
          }
          // Storm Breaker: animated high-voltage lightning bolt pillar, energy burst & crack
          sfx.zap();
          const top = scene.cameras.main.worldView.y - 20;
          fx.lightning(x + Phaser.Math.Between(-50, 50), top, x, GROUND_Y - 6, pal.main, 1.2, 2, 240);
          fx.playAnim(x, GROUND_Y + 8, fxSeq("fx_volt_bolt", 8), {
            originY: 1,
            scale: 1.35,
            endScale: 1.55,
            duration: 340,
          });
          fx.playAnim(x, GROUND_Y - 30, fxSeq("fx_boom_energy", 8), {
            scale: 0.9,
            endScale: 1.2,
            tint: pal.main,
            duration: 320,
          });
          fx.groundCrack(x, 1.0, pal.main);
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
      // Emerald Mirage & Dimension Eclipse: high-speed dashes with multi-frame vortexes, rifts & slashes
      sfx.dash();
      const [minX, maxX] = scene.arenaBounds();
      const step = 0.13;
      const isVoid = hero.def.element === "void";
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
            fx.afterimage(hero.sprite, k % 2 ? pal.main : pal.light, 0.36, 280);
          }
          const y = hero.y - 80;
          const midX = (fromX + toX) / 2;
          const line = scene.add.image(midX, y, "beam").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD)
            .setDisplaySize(Math.abs(toX - fromX), 18).setAlpha(0.62).setDepth(55);
          scene.tweens.add({ targets: line, displayHeight: 2, alpha: 0, duration: 260, onComplete: () => line.destroy() });
          if (isVoid) {
            fx.playAnim(midX + ((i % 3) - 1) * 140, y, fxSeq("fx_void_rift", 8), {
              scale: 1.05,
              endScale: 1.35,
              rotation: (i % 2 ? 1 : -1) * 0.25,
              alpha: 0.78,
              duration: 300,
              depth: 57,
            });
            if (i % 2 === 0) {
              fx.playAnim(midX, GROUND_Y - 70, fxSeq("fx_void_orb", 8), {
                scale: 1.0,
                endScale: 1.35,
                alpha: 0.76,
                duration: 320,
              });
            }
          } else if (i % 2 === 0) {
            fx.playAnim(midX, GROUND_Y + 6, fxSeq("fx_wind_tornado", 8), {
              originY: 1,
              scale: 1.25,
              endScale: 1.5,
              alpha: 0.86,
              duration: 340,
            });
          }
          fx.particles(midX, y, isVoid ? "shard" : "leaf", {
            emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-Math.abs(toX - fromX) / 2, -20, Math.abs(toX - fromX), 40) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
            speedX: { min: (goingRight ? 1 : -1) * 100, max: (goingRight ? 1 : -1) * 400 }, speedY: { min: -150, max: 150 },
            lifespan: { min: 400, max: 700 }, scale: { start: 1, end: 0.2 }, rotate: { start: 0, end: 720 },
            color: [pal.light, pal.main, pal.dark], alpha: { start: 1, end: 0 },
          }, 14);
          sfx.swing();
          for (const t of scene.targetsFor(hero)) {
            if (t.dead) continue;
            fx.slash(t.cx, t.cy, hero.facing, pal, { scale: 1.18, tilt: i % 2 ? 0.24 : -0.24, sweep: 0.72, duration: 190 });
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
