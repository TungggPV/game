import Phaser from "phaser";
import { DEPTH, FONT, hex } from "../config/constants";

export class Fx {
  constructor(private scene: Phaser.Scene) {}

  burst(x: number, y: number, color: number, count = 10, speed = 320, size = 0.6, texture = "dot") {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const p = this.scene.add
        .image(x, y, texture)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(size * (0.5 + Math.random()))
        .setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * v * 0.35,
        y: y + Math.sin(angle) * v * 0.35,
        scale: 0,
        alpha: 0,
        duration: 260 + Math.random() * 260,
        ease: "Cubic.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }

  sparks(x: number, y: number, color: number, dir: number, count = 6) {
    for (let i = 0; i < count; i += 1) {
      const angle = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.6;
      const p = this.scene.add.image(x, y, "spark").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
      p.setRotation(angle + Math.PI / 2).setScale(0.5 + Math.random() * 0.6, 1 + Math.random());
      const d = 60 + Math.random() * 90;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * d,
        y: y + Math.sin(angle) * d,
        alpha: 0,
        scaleY: 0.2,
        duration: 200 + Math.random() * 120,
        onComplete: () => p.destroy(),
      });
    }
  }

  glow(x: number, y: number, color: number, scale = 3, duration = 260) {
    const g = this.scene.add.image(x, y, "glow").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(scale * 0.5).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: g, scale, alpha: 0, duration, ease: "Quad.easeOut", onComplete: () => g.destroy() });
  }

  ring(x: number, y: number, color: number, radius: number, duration = 380) {
    const r = this.scene.add.image(x, y, "ring").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: r, scale: radius / 60, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
  }

  slash(x: number, y: number, dir: number, color: number, scale = 1, flipY = false) {
    const key = Math.random() > 0.5 ? "fx_slash1" : "fx_slash2";
    // Source art sweeps to the left; mirror it so the arc opens toward the facing direction.
    const s = this.scene.add
      .image(x, y, key)
      .setTintFill(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(dir > 0)
      .setFlipY(flipY)
      .setScale(scale * 0.7)
      .setAlpha(0.95)
      .setDepth(DEPTH.fx);
    const core = this.scene.add
      .image(x, y, key)
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(dir > 0)
      .setFlipY(flipY)
      .setScale(scale * 0.55)
      .setAlpha(0.7)
      .setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: [s, core], scale: `*=1.3`, alpha: 0, x: x + dir * 30, duration: 200, ease: "Quad.easeOut", onComplete: () => { s.destroy(); core.destroy(); } });
  }

  lightning(x: number, topY: number, bottomY: number, color: number) {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    const draw = (width: number, c: number, alpha: number) => {
      g.lineStyle(width, c, alpha);
      g.beginPath();
      let cx = x;
      g.moveTo(cx, topY);
      for (let y = topY; y < bottomY; y += 36) {
        cx = x + (Math.random() - 0.5) * 50;
        g.lineTo(cx, Math.min(y + 36, bottomY));
      }
      g.strokePath();
    };
    draw(14, color, 0.4);
    draw(5, 0xffffff, 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  chain(x1: number, y1: number, x2: number, y2: number, color: number) {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    const steps = 7;
    for (const [w, c, a] of [[8, color, 0.5], [3, 0xffffff, 1]] as const) {
      g.lineStyle(w, c, a).beginPath().moveTo(x1, y1);
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        g.lineTo(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 26, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 26);
      }
      g.lineTo(x2, y2).strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

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
      .setScale(crit ? 1.4 : 1.1);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: 260, duration: 420, ease: "Quad.easeIn", onComplete: () => t.destroy() });
  }

  label(x: number, y: number, text: string, color: string) {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: "20px", fontStyle: "900", color, stroke: "#05070c", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(DEPTH.text);
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  afterimage(source: Phaser.GameObjects.Image, color: number) {
    const ghost = this.scene.add
      .image(source.x, source.y, source.texture.key)
      .setOrigin(source.originX, source.originY)
      .setScale(source.scaleX, source.scaleY)
      .setFlipX(source.flipX)
      .setRotation(source.rotation)
      .setTintFill(color)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(source.depth - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  shake(intensity = 0.006, duration = 120) {
    this.scene.cameras.main.shake(duration, intensity);
  }

  flash(color = 0xffffff, duration = 140) {
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(duration, c.red, c.green, c.blue);
  }
}
