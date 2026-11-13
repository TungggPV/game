import Phaser from "phaser";
import { DEPTH, FONT, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, hex } from "../config/constants";

export type HeroElement = "plasma" | "fire" | "volt" | "wind";
export type Element = HeroElement | "enemy" | "boss";

export type Palette = { main: number; light: number; dark: number };

export const PALETTE: Record<Element, Palette> = {
  plasma: { main: 0x18e6ff, light: 0xd8feff, dark: 0x1a55ff },
  fire: { main: 0xff6a1a, light: 0xfff0a0, dark: 0xc0142a },
  volt: { main: 0xffd93a, light: 0xfffbe6, dark: 0x8a5cff },
  wind: { main: 0x3df2a0, light: 0xe0fff0, dark: 0x0b8f74 },
  enemy: { main: 0xff3355, light: 0xffd0d8, dark: 0x6a0a2a },
  boss: { main: 0x8f6bff, light: 0xeee6ff, dark: 0x2c1690 },
};

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

const ADD = Phaser.BlendModes.ADD;
const toDeg = 180 / Math.PI;

/** Rotate streak particles along their velocity every frame. */
const alignToVelocity = {
  onEmit: () => 0,
  onUpdate: (p: Phaser.GameObjects.Particles.Particle) => Math.atan2(p.velocityY, p.velocityX) * toDeg,
};

export class Fx {
  private dim?: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene) {}

  // ---------- primitives ----------

  /** One-shot particle burst; the emitter cleans itself up. */
  particles(x: number, y: number, texture: string, config: EmitterConfig, count: number, depth: number = DEPTH.fx) {
    const life = config.lifespan;
    const maxLife = typeof life === "number" ? life : typeof life === "object" && life && "max" in life ? Number(life.max) : 800;
    const em = this.scene.add.particles(x, y, texture, { ...config, emitting: false }).setDepth(depth);
    em.explode(count);
    this.scene.time.delayedCall(maxLife + 60, () => em.destroy());
    return em;
  }

  /** Continuous emitter that follows a target. Call `stopTrail` to let it fade out. */
  trail(target: { x: number; y: number }, texture: string, config: EmitterConfig, depth: number = DEPTH.projectile - 1) {
    const em = this.scene.add.particles(0, 0, texture, config).setDepth(depth);
    em.startFollow(target as Phaser.Types.Math.Vector2Like);
    return em;
  }

  stopTrail(em: Phaser.GameObjects.Particles.ParticleEmitter | undefined, linger = 600) {
    if (!em) return;
    em.stopFollow();
    em.stop();
    this.scene.time.delayedCall(linger, () => em.destroy());
  }

  glow(x: number, y: number, color: number, scale = 2, duration = 260, depth: number = DEPTH.fx) {
    const g = this.scene.add.image(x, y, "glow").setTint(color).setBlendMode(ADD).setScale(scale * 0.4).setDepth(depth);
    this.scene.tweens.add({ targets: g, scale, alpha: 0, duration, ease: "Quad.easeOut", onComplete: () => g.destroy() });
    return g;
  }

  /** Expanding ring; `squash` < 1 lays it flat on the ground. */
  ring(x: number, y: number, color: number, radius: number, duration = 420, squash = 1, texture = "ring") {
    const s = radius / 110;
    const r = this.scene.add.image(x, y, texture).setTint(color).setBlendMode(ADD).setScale(s * 0.15, s * 0.15 * squash).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: r, scaleX: s, scaleY: s * squash, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
    return r;
  }

  flashCore(x: number, y: number, size = 1, duration = 140) {
    const c = this.scene.add.image(x, y, "star").setBlendMode(ADD).setScale(size * 2.2).setRotation(Math.random() * Math.PI).setDepth(DEPTH.fx + 2);
    this.scene.tweens.add({ targets: c, scale: size * 0.4, alpha: 0, duration, ease: "Quad.easeIn", onComplete: () => c.destroy() });
  }

  sparks(x: number, y: number, color: number, dir: number, count = 8, speed = 600, spread = 70) {
    const base = dir > 0 ? 0 : 180;
    this.particles(x, y, "streak", {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: base - spread, max: base + spread },
      lifespan: { min: 160, max: 320 },
      scale: { start: 0.55, end: 0.05 },
      alpha: { start: 1, end: 0 },
      color: [0xffffff, color],
      blendMode: ADD,
      rotate: alignToVelocity,
      gravityY: 900,
    }, count);
  }

  embers(x: number, y: number, palette: Palette, count = 10, radius = 30) {
    this.particles(x, y, "dot", {
      emitZone: { type: "random", source: new Phaser.Geom.Circle(0, 0, radius) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      speedY: { min: -220, max: -60 },
      speedX: { min: -60, max: 60 },
      lifespan: { min: 400, max: 900 },
      scale: { start: 0.55, end: 0 },
      color: [palette.light, palette.main, palette.dark],
      blendMode: ADD,
      accelerationY: -120,
    }, count);
  }

  smoke(x: number, y: number, count = 6, radius = 40, color = 0x2a2f3a, rise = 60) {
    this.particles(x, y, "smoke", {
      emitZone: { type: "random", source: new Phaser.Geom.Circle(0, 0, radius) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      speedY: { min: -rise * 1.5, max: -rise * 0.3 },
      speedX: { min: -40, max: 40 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: 0.5, end: 1.6 },
      alpha: { start: 0.55, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: color,
    }, count, DEPTH.fx - 2);
  }

  dust(x: number, dir: number, amount = 1) {
    this.particles(x, GROUND_Y - 6, "smoke", {
      speedX: { min: -dir * 160, max: -dir * 40 },
      speedY: { min: -70, max: -10 },
      lifespan: { min: 300, max: 550 },
      scale: { start: 0.25 * amount, end: 0.7 * amount },
      alpha: { start: 0.4, end: 0 },
      tint: 0x9aa6b8,
    }, Math.round(4 * amount), DEPTH.shadow + 1);
  }

  shards(x: number, y: number, palette: Palette, count = 10, speed = 700) {
    this.particles(x, y, "shard", {
      speed: { min: speed * 0.35, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 600 },
      scale: { start: 0.8, end: 0.1 },
      rotate: { start: 0, end: 540 },
      color: [palette.light, palette.main],
      blendMode: ADD,
      gravityY: 700,
    }, count);
  }

  /** Jagged bolt with optional branches, drawn in glow / colour / white-core layers and re-rolled for flicker. */
  lightning(x1: number, y1: number, x2: number, y2: number, color: number, width = 1, branches = 2, duration = 260) {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx + 1).setBlendMode(ADD);
    const segs = (ax: number, ay: number, bx: number, by: number, jitter: number, depth: number, out: number[][]) => {
      if (depth === 0) {
        out.push([ax, ay, bx, by]);
        return;
      }
      const mx = (ax + bx) / 2 + (Math.random() - 0.5) * jitter;
      const my = (ay + by) / 2 + (Math.random() - 0.5) * jitter * 0.4;
      segs(ax, ay, mx, my, jitter / 2, depth - 1, out);
      segs(mx, my, bx, by, jitter / 2, depth - 1, out);
    };
    const draw = () => {
      g.clear();
      const len = Math.hypot(x2 - x1, y2 - y1);
      const main: number[][] = [];
      segs(x1, y1, x2, y2, Math.min(140, len * 0.35), 5, main);
      const all = [{ lines: main, w: 1 }];
      for (let b = 0; b < branches; b += 1) {
        const start = main[Math.floor(Math.random() * main.length * 0.7)];
        const ang = Math.atan2(y2 - y1, x2 - x1) + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
        const bl = len * (0.15 + Math.random() * 0.25);
        const out: number[][] = [];
        segs(start[2], start[3], start[2] + Math.cos(ang) * bl, start[3] + Math.sin(ang) * bl, bl * 0.4, 3, out);
        all.push({ lines: out, w: 0.5 });
      }
      for (const [lw, c, a] of [[16, color, 0.25], [7, color, 0.8], [2.5, 0xffffff, 1]] as const) {
        for (const part of all) {
          g.lineStyle(lw * width * part.w, c, a);
          g.beginPath();
          g.moveTo(part.lines[0][0], part.lines[0][1]);
          for (const s of part.lines) g.lineTo(s[2], s[3]);
          g.strokePath();
        }
      }
    };
    draw();
    const flicker = this.scene.time.addEvent({ delay: 50, repeat: 2, callback: draw });
    this.scene.tweens.add({
      targets: g, alpha: 0, delay: duration * 0.4, duration: duration * 0.6,
      onComplete: () => { flicker.remove(); g.destroy(); },
    });
  }

  pillar(x: number, color: number, width = 1, height = 1, duration = 420) {
    const p = this.scene.add.image(x, GROUND_Y + 10, "pillar").setOrigin(0.5, 1).setTint(color).setBlendMode(ADD).setDepth(DEPTH.fx).setScale(width * 0.3, height * 2.6);
    const core = this.scene.add.image(x, GROUND_Y + 10, "pillar").setOrigin(0.5, 1).setBlendMode(ADD).setDepth(DEPTH.fx + 1).setScale(width * 0.12, height * 2.6);
    this.scene.tweens.add({ targets: p, scaleX: width * 1.1, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => p.destroy() });
    this.scene.tweens.add({ targets: core, scaleX: 0, alpha: 0, duration: duration * 0.7, ease: "Cubic.easeIn", onComplete: () => core.destroy() });
  }

  /** Particles that rush into a point — used for wind-ups and ultimate charge. */
  charge(x: number, y: number, palette: Palette, duration = 300, radius = 160, count = 24) {
    const em = this.scene.add.particles(x, y, "streak", {
      emitZone: { type: "edge", source: new Phaser.Geom.Circle(0, 0, radius) as unknown as Phaser.Types.GameObjects.Particles.EdgeZoneSource, quantity: count },
      moveToX: 0,
      moveToY: 0,
      lifespan: duration,
      scale: { start: 0.2, end: 0.8 },
      alpha: { start: 0, end: 1 },
      color: [palette.main, palette.light],
      blendMode: ADD,
      rotate: alignToVelocity,
      frequency: 30,
      quantity: 3,
    }).setDepth(DEPTH.fx);
    this.scene.time.delayedCall(duration, () => em.stop());
    this.scene.time.delayedCall(duration * 2 + 50, () => em.destroy());
    this.glow(x, y, palette.main, radius / 40, duration);
  }

  // ---------- composite effects ----------

  /**
   * Crescent slash that sweeps through `sweep` radians toward the facing direction.
   * `tilt` rotates the whole arc (negative = upward cut).
   */
  slash(x: number, y: number, dir: number, palette: Palette, opts: { scale?: number; tilt?: number; sweep?: number; duration?: number; thin?: boolean } = {}) {
    const scale = opts.scale ?? 1;
    const tilt = opts.tilt ?? 0;
    const sweep = opts.sweep ?? 1.1;
    const duration = opts.duration ?? 220;
    const flip = dir < 0;
    const base = (flip ? Math.PI : 0) + tilt * dir;
    const layers: [number, number, number][] = [
      [palette.dark, 1.08, 0.7],
      [palette.main, 1, 1],
      [0xffffff, 0.9, 0.95],
    ];
    const objs = layers.map(([color, s, a]) =>
      this.scene.add
        .image(x - dir * 40 * scale, y, "arc")
        .setTint(color)
        .setBlendMode(ADD)
        .setAlpha(a)
        .setScale(scale * 0.62 * s, scale * 0.62 * s * (opts.thin ? 0.55 : 0.8))
        .setRotation(base - (sweep / 2) * dir)
        .setFlipX(false)
        .setDepth(DEPTH.fx + 1),
    );
    this.scene.tweens.add({
      targets: objs,
      rotation: base + (sweep / 2) * dir,
      scaleX: `*=1.18`,
      duration: duration * 0.55,
      ease: "Cubic.easeOut",
    });
    this.scene.tweens.add({ targets: objs, alpha: 0, delay: duration * 0.35, duration: duration * 0.65, onComplete: () => objs.forEach((o) => o.destroy()) });
    // Sparks peel off the leading tip of the arc.
    const tipA = base + (sweep / 2) * dir;
    const r = 118 * scale * 0.62;
    this.particles(x - dir * 40 * scale + Math.cos(tipA) * r, y + Math.sin(tipA) * r, "streak", {
      speed: { min: 150, max: 420 },
      angle: { min: (tipA * toDeg) + 60 * dir, max: (tipA * toDeg) + 120 * dir },
      lifespan: { min: 140, max: 280 },
      scale: { start: 0.4, end: 0 },
      color: [0xffffff, palette.main],
      blendMode: ADD,
      rotate: alignToVelocity,
    }, Math.round(5 * scale));
  }

  hit(x: number, y: number, dir: number, palette: Palette, heavy = false) {
    this.flashCore(x, y, heavy ? 1.1 : 0.7, heavy ? 160 : 110);
    this.glow(x, y, palette.main, heavy ? 2.2 : 1.3, 180);
    this.sparks(x, y, palette.main, dir, heavy ? 12 : 7, heavy ? 820 : 600);
    if (heavy) this.ring(x, y, palette.light, 70, 260);
  }

  explosion(x: number, y: number, palette: Palette, radius = 120, smoky = true) {
    this.flashCore(x, y, radius / 70, 180);
    this.glow(x, y, palette.light, radius / 30, 260);
    this.glow(x, y, palette.main, radius / 18, 520);
    this.ring(x, y, palette.light, radius * 1.1, 360);
    this.ring(x, GROUND_Y - 4, palette.main, radius * 1.4, 520, 0.22);
    this.particles(x, y, "flame", {
      speed: { min: radius * 0.8, max: radius * 2.4 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 260, max: 520 },
      scale: { start: radius / 120, end: 0.1 },
      alpha: { start: 1, end: 0 },
      rotate: alignToVelocity,
      color: [0xffffff, palette.light, palette.main, palette.dark],
      blendMode: ADD,
    }, Math.round(10 + radius / 12));
    this.sparks(x, y, palette.light, 1, 8, 900, 180);
    this.embers(x, y, palette, 12, radius * 0.5);
    if (smoky) this.smoke(x, y - 10, 6, radius * 0.5);
  }

  afterimage(source: Phaser.GameObjects.Image, color: number, alpha = 0.5, duration = 240) {
    const ghost = this.scene.add
      .image(source.x, source.y, source.texture.key)
      .setOrigin(source.originX, source.originY)
      .setScale(source.scaleX, source.scaleY)
      .setFlipX(source.flipX)
      .setRotation(source.rotation)
      .setTintFill(color)
      .setAlpha(alpha)
      .setBlendMode(ADD)
      .setDepth(source.depth - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, scaleX: source.scaleX * 1.05, duration, onComplete: () => ghost.destroy() });
  }

  // ---------- screen ----------

  shake(intensity = 0.006, duration = 120) {
    this.scene.cameras.main.shake(duration, intensity);
  }

  flash(color = 0xffffff, duration = 140) {
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(duration, c.red, c.green, c.blue);
  }

  zoomPunch(amount = 0.04, duration = 160) {
    const cam = this.scene.cameras.main;
    this.scene.tweens.killTweensOf(cam);
    cam.setZoom(1 + amount);
    this.scene.tweens.add({ targets: cam, zoom: 1, duration, ease: "Cubic.easeOut" });
  }

  /** Darken/tint the edges of the screen, e.g. while an ultimate plays. */
  tintScreen(color: number, alpha = 0.6, duration = 900) {
    this.dim?.destroy();
    const v = this.scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "vignette")
      .setScrollFactor(0)
      .setDisplaySize(GAME_WIDTH * 1.1, GAME_HEIGHT * 1.1)
      .setTint(color)
      .setAlpha(0)
      .setDepth(DEPTH.fx - 5);
    const shade = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 1.2, GAME_HEIGHT * 1.2, 0x02040a, 0).setScrollFactor(0).setDepth(DEPTH.enemy - 1);
    this.scene.tweens.add({ targets: v, alpha, duration: 120, yoyo: true, hold: duration, onComplete: () => v.destroy() });
    this.scene.tweens.add({ targets: shade, fillAlpha: 0.45, duration: 120, yoyo: true, hold: duration, onComplete: () => shade.destroy() });
    this.dim = v;
  }

  // ---------- text ----------

  number(x: number, y: number, value: number, color: number, crit = false) {
    const t = this.scene.add
      .text(x + (Math.random() - 0.5) * 30, y, crit ? `${value}!` : String(value), {
        fontFamily: FONT,
        fontSize: crit ? "34px" : "24px",
        fontStyle: "900",
        color: crit ? "#ffe45c" : hex(color),
        stroke: "#05070c",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.text)
      .setScale(crit ? 1.6 : 1.25);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, y: y - 64, duration: 700, ease: "Cubic.easeOut" });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 420, duration: 280, onComplete: () => t.destroy() });
  }

  label(x: number, y: number, text: string, color: string) {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: "20px", fontStyle: "900", color, stroke: "#05070c", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(DEPTH.text)
      .setScale(0.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 300, duration: 700, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }
}
