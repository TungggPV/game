import Phaser from "phaser";
import { DEPTH, GROUND_Y, type SkillSlot } from "../config/constants";
import type { BurstSkill, FieldSkill, ProjectileSkill, SkillDef, StrikesSkill, SweepSkill } from "../config/heroes";
import type { Hit } from "../entities/Actor";
import type { Hero } from "../entities/Hero";
import type { GameScene } from "../scenes/GameScene";
import { fxSeq, PALETTE, type Palette } from "./Fx";
import { sfx } from "./sfx";

const castProjectile = (scene: GameScene, hero: Hero, skill: ProjectileSkill, pal: Palette, dir: number, base: Hit) => {
  sfx.skillCast(hero.def.element, "skill1");
  const mx = hero.x + dir * 74;
  const my = hero.y - 88;
  scene.fx.energyChargeRing(hero.cx + dir * 24, my, pal, 130);
  scene.fx.playAnim(mx, my, fxSeq("fx_blast_anim", 8), {
    flipX: dir < 0,
    tint: pal.main,
    scale: 0.78,
    endScale: 1.18,
    duration: 230,
  });
  scene.fx.impactBurst(mx, my, pal, 0.72);
  scene.fx.ring(mx, my, pal.light, 56, 220, 1.4);
  scene.fx.ring(mx + dir * 18, my, pal.main, 78, 260, 1.3);
  scene.fx.sparks(mx, my, pal.main, dir, 10, 620, 32);
  hero.vx -= dir * 145;
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
};

const castScreenUltimate = (scene: GameScene, hero: Hero, skill: BurstSkill, pal: Palette, dir: number, base: Hit) => {
  const cy = hero.y - 80;
  const [minX, maxX] = scene.arenaBounds();
  const midX = (minX + maxX) / 2;
  scene.fx.rimGlow(pal.main, 1250, 0.44);
  scene.fx.speedLines(pal.main, 760, 26);
  scene.fx.shake(0.024, 540);
  scene.fx.zoomPunch(0.07, 420);

  if (hero.def.element === "earth") {
    sfx.skillCast("earth", "ultimate");
    for (let i = 0; i < 6; i += 1) {
      const offset = i * 145;
      scene.time.delayedCall(i * 70, () => {
        for (const side of i === 0 ? [0] : [-1, 1]) {
          const px = Phaser.Math.Clamp(hero.x + side * offset, minX + 60, maxX - 60);
          scene.fx.playAnim(px, GROUND_Y + 6, fxSeq("fx_earth_spire", 8), {
            originY: 1,
            blendMode: Phaser.BlendModes.NORMAL,
            scale: i === 0 ? 1.55 : 1.32,
            endScale: i === 0 ? 1.82 : 1.55,
            duration: 650,
          });
          scene.fx.groundScorch(px, pal.main, 1.4, 1300);
          scene.fx.pillar(px, 0xff7722, 1.4, 0.9, 440);
          scene.fx.explosion(px, GROUND_Y - 40, pal, 115, false);
        }
        sfx.elementImpact("earth", true);
      });
    }
    scene.areaHit(hero, midX, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);
    scene.time.delayedCall(440, () => {
      if (hero.dead) return;
      scene.fx.impactBurst(hero.cx + dir * 90, GROUND_Y - 60, pal, 1.85);
      scene.fx.groundScorch(hero.x + dir * 90, pal.main, 1.9, 1500);
      scene.fx.shards(hero.cx, GROUND_Y - 50, pal, 32, 1250);
      scene.fx.shake(0.028, 420);
      scene.fx.zoomPunch(0.085, 340);
      sfx.ultimateFinisher("earth");
      scene.areaHit(hero, midX, cy, skill.radius, { ...base, damage: skill.damage * 0.45, knock: 620, launch: 540 }, true);
    });
    return;
  }

  // Nova Overdrive: swirling vortex + 3-layer plasma rail-cannon + concentric travel rings + supernova finale
  sfx.skillCast("plasma", "ultimate");
  scene.fx.playAnim(hero.x, GROUND_Y + 6, fxSeq("fx_nova_vortex", 8), {
    originY: 1,
    scale: 1.95,
    endScale: 2.5,
    duration: 680,
  });
  scene.fx.playAnim(hero.x + dir * 240, cy, fxSeq("fx_blast_anim", 8), {
    flipX: dir < 0,
    tint: pal.main,
    scale: 2.8,
    endScale: 3.35,
    duration: 540,
  });
  scene.fx.groundScorch(hero.x, pal.main, 1.85, 1300);

  const outerBeam = scene.add
    .image(midX, cy, "beam")
    .setTint(pal.dark)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(maxX - minX, 24)
    .setDepth(DEPTH.fx + 3);
  const beam = scene.add
    .image(midX, cy, "beam")
    .setTint(pal.main)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(maxX - minX, 14)
    .setDepth(DEPTH.fx + 4);
  const core = scene.add
    .image(midX, cy, "beam")
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(maxX - minX, 6)
    .setDepth(DEPTH.fx + 5);
  scene.tweens.add({ targets: outerBeam, displayHeight: 330, alpha: 0, duration: 640, ease: "Cubic.easeOut", onComplete: () => outerBeam.destroy() });
  scene.tweens.add({ targets: beam, displayHeight: 240, alpha: 0, duration: 560, ease: "Cubic.easeOut", onComplete: () => beam.destroy() });
  scene.tweens.add({ targets: core, displayHeight: 85, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => core.destroy() });

  for (let i = 0; i < 6; i += 1) {
    scene.time.delayedCall(i * 55, () => {
      const rx = Phaser.Math.Clamp(hero.x + dir * (110 + i * 150), minX + 40, maxX - 40);
      scene.fx.ring(rx, cy, i % 2 ? 0xffffff : pal.main, 210 + i * 28, 420, 0.5);
    });
  }
  for (let i = 0; i < 7; i += 1) {
    const px = Phaser.Math.Linear(minX + 110, maxX - 110, i / 6);
    scene.time.delayedCall(70 + Math.abs(px - hero.x) / 4.2, () => {
      scene.fx.playAnim(px, GROUND_Y + 6, fxSeq("fx_nova_pillar", 8), {
        originY: 1,
        scale: 1.4,
        endScale: 1.65,
        duration: 540,
      });
      scene.fx.groundScorch(px, pal.main, 1.0, 950);
    });
  }
  scene.fx.shards(hero.cx, cy, pal, 28, 1300);
  scene.fx.embers(hero.cx, cy, pal, 36, 320);
  scene.areaHit(hero, midX, cy, skill.radius, { ...base, knock: 520, launch: skill.launch }, true);

  scene.time.delayedCall(360, () => {
    if (hero.dead) return;
    scene.fx.impactBurst(hero.cx + dir * 180, cy, pal, 1.85);
    scene.fx.speedLines(pal.light, 480, 22);
    scene.fx.zoomPunch(0.08, 320);
    sfx.ultimateFinisher("plasma");
    scene.areaHit(hero, midX, cy, skill.radius, { ...base, damage: skill.damage * 0.42, knock: 600, launch: 460 }, true);
  });
};

const castLocalBurst = (scene: GameScene, hero: Hero, skill: BurstSkill, pal: Palette, dir: number, base: Hit) => {
  const cx = hero.x + dir * skill.offset;
  const cy = hero.y - 75;
  scene.fx.impactBurst(cx, cy, pal, 1.15);

  if (hero.def.element === "fire") {
    scene.fx.rimGlow(pal.main, 380, 0.28);
    scene.fx.playAnim(cx, GROUND_Y + 8, fxSeq("fx_fire_vortex", 8), {
      originY: 1,
      flipX: dir < 0,
      scale: 1.55,
      endScale: 2.0,
      duration: 420,
    });
    [0, 50, 100].forEach((ms, idx) => {
      scene.time.delayedCall(ms, () => {
        scene.fx.slash(cx + dir * (idx - 1) * 16, cy - idx * 8, dir, pal, {
          scale: 2.15 - idx * 0.15,
          tilt: idx === 1 ? -0.22 : 0.18,
          sweep: 0.78,
          duration: 300,
        });
      });
    });
    scene.fx.groundScorch(cx, pal.main, 1.45, 1100);
    scene.fx.particles(
      hero.x + dir * 60,
      cy,
      "flame",
      {
        speed: { min: 340, max: 960 },
        angle: dir > 0 ? { min: -45, max: 35 } : { min: 145, max: 225 },
        lifespan: { min: 280, max: 520 },
        scale: { start: 1.3, end: 0.15 },
        alpha: { start: 1, end: 0 },
        rotate: { onEmit: () => 0, onUpdate: (p: Phaser.GameObjects.Particles.Particle) => Math.atan2(p.velocityY, p.velocityX) * (180 / Math.PI) + 90 },
        color: [0xffffff, pal.light, pal.main, pal.dark],
        blendMode: Phaser.BlendModes.ADD,
      },
      32,
    );
    scene.fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.45, 500, 0.22);
    scene.fx.embers(cx, cy, pal, 24, skill.radius * 0.65);
    scene.fx.shake(0.012, 200);
    sfx.elementImpact("fire", true);
  } else if (hero.def.element === "void") {
    scene.fx.energyChargeRing(cx, cy, pal, 220);
    for (const rot of [-0.38, 0.38]) {
      scene.fx.playAnim(cx, cy, fxSeq("fx_void_rift", 8), {
        scale: 1.32,
        endScale: 1.72,
        rotation: rot * dir,
        endRotation: rot * dir * 1.25,
        duration: 400,
        depth: DEPTH.fx + 4,
      });
    }
    scene.fx.playAnim(cx, cy, fxSeq("fx_void_orb", 8), {
      scale: 0.92,
      endScale: 1.38,
      duration: 380,
      depth: DEPTH.fx + 3,
    });
    scene.fx.slash(cx - dir * 10, cy - 12, dir, pal, { scale: 2.0, tilt: -0.3, sweep: 0.78, duration: 280 });
    scene.time.delayedCall(55, () => scene.fx.slash(cx, cy + 8, dir, pal, { scale: 2.0, tilt: 0.3, sweep: 0.78, duration: 280 }));
    scene.fx.groundScorch(cx, pal.main, 1.35, 1000);
    scene.fx.shards(cx, cy, pal, 24, 1020);
    hero.heal(8);
    scene.fx.label(hero.x, hero.y - 165, "+8 HP", "#f0abfc");
    scene.fx.shake(0.014, 200);
    sfx.elementImpact("void", true);
  } else if (hero.def.element === "earth") {
    [-90, -45, 0, 45, 90].forEach((off, idx) => {
      scene.time.delayedCall(Math.abs(off) * 0.55, () => {
        scene.fx.playAnim(cx + off, GROUND_Y + 6, fxSeq("fx_earth_spire", 8), {
          originY: 1,
          blendMode: Phaser.BlendModes.NORMAL,
          scale: off === 0 ? 1.38 : 1.08 + (idx % 2) * 0.12,
          endScale: off === 0 ? 1.56 : 1.24,
          duration: 580,
        });
      });
    });
    scene.fx.groundScorch(cx, pal.main, 1.55, 1150);
    scene.fx.ring(cx, GROUND_Y - 4, pal.main, skill.radius * 1.5, 500, 0.25);
    scene.fx.shards(cx, cy, pal, 26, 950);
    scene.fx.dust(cx, dir, 1.6);
    scene.fx.zoomPunch(0.035, 200);
    scene.fx.shake(0.016, 240);
    sfx.elementImpact("earth", true);
  } else {
    // Rising Blade: 4 ascending cyan plasma crescents + base vortex + towering pillar
    [0, 1, 2, 3].forEach((i) => {
      scene.time.delayedCall(i * 48, () =>
        scene.fx.slash(cx, cy + 36 - i * 36, dir, pal, { scale: 1.55 + i * 0.24, tilt: -0.28, sweep: 0.78, duration: 260, thin: i % 2 === 1 }),
      );
    });
    scene.fx.playAnim(cx, GROUND_Y + 6, fxSeq("fx_nova_vortex", 8), {
      originY: 1,
      scale: 1.2,
      endScale: 1.5,
      duration: 420,
    });
    scene.fx.playAnim(cx, GROUND_Y + 6, fxSeq("fx_nova_pillar", 8), {
      originY: 1,
      scale: 1.38,
      endScale: 1.6,
      duration: 500,
    });
    scene.fx.groundScorch(cx, pal.main, 1.3, 1000);
    scene.fx.particles(
      cx,
      GROUND_Y - 10,
      "streak",
      {
        speed: { min: 450, max: 980 },
        angle: { min: -100, max: -80 },
        lifespan: { min: 220, max: 420 },
        scale: { start: 0.9, end: 0 },
        color: [0xffffff, pal.main],
        blendMode: Phaser.BlendModes.ADD,
        rotate: -90,
        emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-70, 0, 140, 10) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      },
      22,
    );
    scene.fx.shake(0.01, 180);
    sfx.elementImpact("plasma", true);
  }
  scene.areaHit(hero, cx, cy, skill.radius, { ...base, knock: skill.knock ?? 260, launch: skill.launch });
};

const castField = (scene: GameScene, hero: Hero, skill: FieldSkill, pal: Palette, dir: number, base: Hit) => {
  const fxX = hero.x + dir * skill.offset;
  sfx.skillCast(hero.def.element, "skill2");
  scene.fx.energyChargeRing(fxX, GROUND_Y - 64, pal, 240);
  scene.fx.pillar(fxX, pal.main, 1.15, 0.95, 380);
  scene.fx.impactBurst(fxX, GROUND_Y - 70, pal, 1.05);
  scene.fx.groundScorch(fxX, pal.main, 1.15, 1000);
  scene.spawnField({
    owner: hero,
    offset: skill.offset,
    x: fxX,
    y: GROUND_Y - 70,
    radius: skill.radius,
    duration: skill.duration,
    tick: skill.tick,
    color: skill.color,
    style: hero.def.element === "volt" ? "cage" : hero.def.element === "cryo" ? "blizzard" : "spiral",
    hit: { ...base, knock: 40 },
  });
};

const castStrikes = (scene: GameScene, hero: Hero, skill: StrikesSkill, pal: Palette, dir: number, base: Hit) => {
  const targets = scene.targetsFor(hero).filter((t) => !t.dead);
  const [minX, maxX] = scene.arenaBounds();
  const totalMs = skill.count * skill.interval * 1000;
  sfx.skillCast(hero.def.element, "ultimate");
  scene.fx.rimGlow(hero.def.element === "cryo" ? 0x7dd3fc : pal.main, totalMs + 500, 0.44);

  if (skill.meteor) {
    scene.fx.embers((minX + maxX) / 2, 160, pal, 40, 420);
  }

  for (let i = 0; i < skill.count; i += 1) {
    scene.time.delayedCall(i * skill.interval * 1000, () => {
      const alive = targets.filter((t) => !t.dead);
      const x = alive.length ? alive[i % alive.length].x + Phaser.Math.Between(-35, 35) : Phaser.Math.Between(minX + 120, maxX - 120);
      if (skill.meteor) {
        scene.spawnMeteor(hero, x, skill.radius, { ...base, knock: 300, launch: 500 });
        return;
      }
      if (hero.def.element === "cryo") {
        const iceKeys = fxSeq("fx_ice_monolith", 8);
        const ice = scene.add
          .image(x, -120, scene.textures.exists(iceKeys[0]) ? iceKeys[0] : "shard")
          .setOrigin(0.5, 1)
          .setRotation(Math.PI)
          .setScale(1.18)
          .setDepth(DEPTH.fx + 4);
        scene.tweens.add({
          targets: ice,
          y: GROUND_Y + 6,
          rotation: Math.PI,
          duration: 170,
          ease: "Cubic.easeIn",
          onComplete: () => {
            sfx.elementImpact("cryo", true);
            ice.setOrigin(0.5, 1).setRotation(0);
            scene.fx.playAnim(x, GROUND_Y + 6, iceKeys, { originY: 1, blendMode: Phaser.BlendModes.NORMAL, scale: 1.3, endScale: 1.48, duration: 540 });
            scene.fx.playAnim(x, GROUND_Y - 10, fxSeq("fx_cryo_blizzard", 8), { scale: 1.22, scaleY: 0.44, duration: 400 });
            scene.fx.groundScorch(x, pal.light, 1.05, 1000);
            scene.fx.impactBurst(x, GROUND_Y - 35, pal, 0.95);
            scene.fx.shards(x, GROUND_Y - 30, pal, 22, 1000);
            scene.fx.shake(0.011, 130);
            scene.areaHit(hero, x, GROUND_Y - 80, skill.radius, { ...base, knock: 120, stun: skill.status?.time ?? 1.8 });
            scene.tweens.add({ targets: ice, alpha: 0, delay: 180, duration: 180, onComplete: () => ice.destroy() });
          },
        });
        return;
      }
      // Storm Breaker: multi-branch lightning + crackling pillar + impact burst
      sfx.elementImpact("volt", false);
      const top = scene.cameras.main.worldView.y - 20;
      scene.fx.lightning(x + Phaser.Math.Between(-60, 60), top, x, GROUND_Y - 6, pal.main, 1.35, 3, 250);
      scene.fx.playAnim(x, GROUND_Y + 8, fxSeq("fx_volt_bolt", 8), { originY: 1, scale: 1.4, endScale: 1.62, duration: 360 });
      scene.fx.playAnim(x, GROUND_Y - 30, fxSeq("fx_boom_energy", 8), { scale: 0.98, endScale: 1.28, tint: pal.main, duration: 320 });
      scene.fx.groundScorch(x, pal.main, 0.95, 900);
      scene.fx.flashCore(x, GROUND_Y - 30, 1.45, 160);
      scene.fx.ring(x, GROUND_Y - 4, pal.light, skill.radius * 1.35, 380, 0.24);
      scene.fx.sparks(x, GROUND_Y - 20, pal.main, 1, 10, 860, 180);
      scene.fx.shake(0.009, 110);
      scene.areaHit(hero, x, GROUND_Y - 80, skill.radius, { ...base, knock: 120, stun: 1.2 });
    });
  }

  // Climactic Finale after all strikes settle!
  if (skill.meteor) {
    scene.time.delayedCall(totalMs + 160, () => {
      if (hero.dead) return;
      const alive = scene.targetsFor(hero).filter((t) => !t.dead);
      const fxX = alive.length ? alive[0].x : Phaser.Math.Clamp(hero.x + dir * 240, minX + 160, maxX - 160);
      scene.fx.speedLines(pal.main, 560, 24);
      scene.spawnMeteor(hero, fxX, Math.round(skill.radius * 1.45), { ...base, damage: skill.damage * 1.45, knock: 520, launch: 640 });
      scene.time.delayedCall(450, () => {
        if (hero.dead) return;
        scene.fx.zoomPunch(0.08, 320);
        scene.fx.shake(0.025, 380);
        sfx.ultimateFinisher("fire");
      });
    });
  } else if (hero.def.element === "cryo") {
    scene.time.delayedCall(totalMs + 160, () => {
      if (hero.dead) return;
      const alive = scene.targetsFor(hero).filter((t) => !t.dead);
      const center = alive.length ? alive[0].x : Phaser.Math.Clamp(hero.x + dir * 220, minX + 160, maxX - 160);
      scene.fx.speedLines(pal.light, 500, 24);
      scene.fx.impactBurst(center, GROUND_Y - 75, pal, 1.8);
      scene.fx.shards(center, GROUND_Y - 60, pal, 36, 1250);
      scene.fx.ring(center, GROUND_Y - 4, 0xffffff, 420, 560, 0.22);
      scene.fx.zoomPunch(0.08, 320);
      scene.fx.shake(0.02, 320);
      sfx.ultimateFinisher("cryo");
      scene.areaHit(hero, center, GROUND_Y - 80, skill.radius * 1.8, { ...base, damage: skill.damage * 0.75, knock: 280, stun: 2.0 });
    });
  } else {
    scene.time.delayedCall(totalMs + 140, () => {
      if (hero.dead) return;
      const alive = scene.targetsFor(hero).filter((t) => !t.dead);
      const center = alive.length ? alive[0].x : Phaser.Math.Clamp(hero.x + dir * 220, minX + 160, maxX - 160);
      const top = scene.cameras.main.worldView.y - 20;
      scene.fx.speedLines(pal.main, 460, 24);
      scene.fx.lightning(center - 40, top, center, GROUND_Y - 4, pal.main, 2.1, 4, 340);
      for (const t of alive.slice(0, 4)) {
        scene.fx.lightning(center, GROUND_Y - 85, t.cx, t.cy, pal.light, 1.4, 2, 260);
      }
      scene.fx.impactBurst(center, GROUND_Y - 75, pal, 1.8);
      scene.fx.zoomPunch(0.08, 320);
      scene.fx.shake(0.022, 340);
      sfx.ultimateFinisher("volt");
      scene.areaHit(hero, center, GROUND_Y - 80, skill.radius * 2.0, { ...base, damage: skill.damage * 0.85, knock: 340, stun: 1.6 });
    });
  }
};

const castSweep = (scene: GameScene, hero: Hero, skill: SweepSkill, pal: Palette, dir: number, base: Hit) => {
  const [minX, maxX] = scene.arenaBounds();
  const midArenaX = (minX + maxX) / 2;
  const step = 0.13;
  const isVoid = hero.def.element === "void";
  hero.enterSweep(skill.hits * step + 0.28);
  sfx.skillCast(hero.def.element, "ultimate");
  scene.fx.rimGlow(pal.main, skill.hits * step * 1000 + 360, 0.45);
  scene.fx.speedLines(pal.main, skill.hits * step * 1000 + 260, 26);

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
        scene.fx.afterimage(hero.sprite, k % 2 ? pal.main : pal.light, 0.4, 300);
      }
      const y = hero.y - 80;
      const midX = (fromX + toX) / 2;
      const line = scene.add
        .image(midX, y, "beam")
        .setTint(pal.main)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(Math.abs(toX - fromX), 22)
        .setAlpha(0.7)
        .setDepth(DEPTH.fx + 3);
      scene.tweens.add({ targets: line, displayHeight: 2, alpha: 0, duration: 280, onComplete: () => line.destroy() });

      if (isVoid) {
        scene.fx.playAnim(midX + ((i % 3) - 1) * 145, y, fxSeq("fx_void_rift", 8), {
          scale: 1.15,
          endScale: 1.45,
          rotation: (i % 2 ? 1 : -1) * 0.28,
          alpha: 0.85,
          duration: 320,
          depth: DEPTH.fx + 4,
        });
        if (i % 2 === 0) {
          scene.fx.playAnim(midX, GROUND_Y - 70, fxSeq("fx_void_orb", 8), {
            scale: 1.05,
            endScale: 1.42,
            alpha: 0.82,
            duration: 340,
          });
        }
      } else if (i % 2 === 0) {
        scene.fx.playAnim(midX, GROUND_Y + 6, fxSeq("fx_wind_tornado", 8), {
          originY: 1,
          scale: 1.32,
          endScale: 1.58,
          alpha: 0.9,
          duration: 360,
        });
      }

      scene.fx.particles(
        midX,
        y,
        isVoid ? "shard" : "leaf",
        {
          emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-Math.abs(toX - fromX) / 2, -22, Math.abs(toX - fromX), 44) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
          speedX: { min: (goingRight ? 1 : -1) * 120, max: (goingRight ? 1 : -1) * 440 },
          speedY: { min: -160, max: 160 },
          lifespan: { min: 400, max: 720 },
          scale: { start: 1.05, end: 0.2 },
          rotate: { start: 0, end: 720 },
          color: [pal.light, pal.main, pal.dark],
          alpha: { start: 1, end: 0 },
        },
        16,
      );
      sfx.comboSwing(3, hero.def.element);
      sfx.elementImpact(hero.def.element, false);
      for (const t of scene.targetsFor(hero)) {
        if (t.dead) continue;
        scene.fx.slash(t.cx, t.cy, hero.facing, pal, { scale: 1.25, tilt: i % 2 ? 0.25 : -0.25, sweep: 0.74, duration: 200 });
      }
      scene.areaHit(hero, midArenaX, GROUND_Y - 200, 9999, { ...base, knock: 60, status: i === skill.hits - 1 ? { kind: "poison", time: 3 } : undefined }, true);
    });
  }

  scene.time.delayedCall(skill.hits * step * 1000 + 110, () => {
    if (hero.dead) return;
    const cy = hero.y - 80;
    if (isVoid) {
      for (const rot of [-0.45, 0.45]) {
        scene.fx.playAnim(midArenaX, cy, fxSeq("fx_void_rift", 8), { scale: 1.85, endScale: 2.3, rotation: rot, duration: 420, depth: DEPTH.fx + 5 });
      }
      scene.fx.impactBurst(midArenaX, cy, pal, 1.9);
    } else {
      scene.fx.playAnim(hero.x, GROUND_Y + 6, fxSeq("fx_wind_tornado", 8), { originY: 1, scale: 1.65, endScale: 2.0, duration: 420 });
      scene.fx.slash(hero.x + hero.facing * 40, cy, hero.facing, pal, { scale: 2.35, tilt: -0.28, sweep: 0.82, duration: 300 });
      scene.fx.slash(hero.x - hero.facing * 40, cy, -hero.facing, pal, { scale: 2.35, tilt: 0.28, sweep: 0.82, duration: 300 });
      scene.fx.impactBurst(hero.cx, cy, pal, 1.65);
    }
    scene.fx.speedLines(pal.light, 500, 26);
    scene.fx.zoomPunch(0.085, 340);
    scene.fx.shake(0.022, 340);
    sfx.ultimateFinisher(hero.def.element);
    scene.areaHit(hero, midArenaX, GROUND_Y - 200, 9999, { ...base, damage: skill.damage * 1.4, knock: 420, launch: 360 }, true);
    hero.endSweep();
    scene.fx.ring(hero.x, hero.y - 70, pal.main, 200, 420);
  });
};

export const castSkill = (scene: GameScene, hero: Hero, slot: SkillSlot, skill: SkillDef) => {
  const pal = PALETTE[hero.def.element];
  const dir = hero.facing;
  const base: Hit = { damage: skill.damage, dir, color: skill.color, status: skill.status, source: hero, heavy: slot !== "skill1" };

  switch (skill.kind) {
    case "projectile":
      castProjectile(scene, hero, skill, pal, dir, base);
      return;
    case "burst":
      if (skill.screen) castScreenUltimate(scene, hero, skill, pal, dir, base);
      else castLocalBurst(scene, hero, skill, pal, dir, base);
      return;
    case "field":
      castField(scene, hero, skill, pal, dir, base);
      return;
    case "strikes":
      castStrikes(scene, hero, skill, pal, dir, base);
      return;
    case "sweep":
      castSweep(scene, hero, skill, pal, dir, base);
      return;
  }
};
