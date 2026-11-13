import Phaser from "phaser";
import { FONT, hex } from "../../config/constants";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";

export const CYAN = 0x18e6ff;
export const GOLD = 0xffe45c;
export const RED = 0xff4e5f;
export const PANEL = 0x0a1a2c;
export const MUTED = "#8fa6ba";

/** Plain (unstroked) text for paragraphs and small labels. */
export const body = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size = 16,
  color = "#c8dcea",
  opts: { wrap?: number; weight?: string; align?: string; lineSpacing?: number } = {},
) =>
  scene.add.text(x, y, value, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: opts.weight ?? "600",
    color,
    align: opts.align ?? "left",
    lineSpacing: opts.lineSpacing ?? 4,
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
  });

export const panel = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; alpha?: number; stroke?: number; strokeAlpha?: number; radius?: number; lineWidth?: number } = {},
) => {
  const g = scene.add.graphics();
  drawPanel(g, 0, 0, w, h, opts);
  g.setPosition(x, y);
  return g;
};

export const drawPanel = (
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; alpha?: number; stroke?: number; strokeAlpha?: number; radius?: number; lineWidth?: number } = {},
) => {
  const r = opts.radius ?? 12;
  g.fillStyle(opts.fill ?? PANEL, opts.alpha ?? 0.88).fillRoundedRect(x, y, w, h, r);
  if (opts.stroke !== undefined) g.lineStyle(opts.lineWidth ?? 2, opts.stroke, opts.strokeAlpha ?? 0.45).strokeRoundedRect(x, y, w, h, r);
};

/** Horizontal progress bar; returns a setter. */
export const bar = (scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number, track = 0x1d2b3a) => {
  const g = scene.add.graphics();
  const draw = (r: number) => {
    const v = Phaser.Math.Clamp(r, 0, 1);
    g.clear();
    g.fillStyle(track, 1).fillRoundedRect(x, y, w, h, h / 2);
    if (v > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(h, w * v), h, h / 2);
  };
  draw(ratio);
  return { g, set: draw };
};

/** Segmented stat bar (1–5 pips). */
export const pips = (scene: Phaser.Scene, x: number, y: number, value: number, max: number, color: number, w = 26, h = 10, gap = 4) => {
  const g = scene.add.graphics();
  for (let i = 0; i < max; i += 1) g.fillStyle(i < value ? color : 0x1d2b3a, 1).fillRoundedRect(x + i * (w + gap), y, w, h, 3);
  return g;
};

export const starText = (scene: Phaser.Scene, x: number, y: number, count: number, size = 22, max = 3) => {
  const t = scene.add.text(x, y, "", { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "900", stroke: "#02070d", strokeThickness: 3 });
  // Earned stars gold, missing ones dim — two colors in one Text via a second object would be heavier.
  t.setText("★".repeat(count) + "☆".repeat(Math.max(0, max - count)));
  t.setColor(count > 0 ? hex(GOLD) : "#4a5c6e");
  return t;
};

export const lockIcon = (scene: Phaser.Scene, x: number, y: number, size = 22, color = 0x9fb8cc) => {
  const g = scene.add.graphics({ x, y });
  const w = size;
  const h = size * 0.75;
  g.lineStyle(Math.max(2, size / 8), color, 1).beginPath();
  g.arc(0, -h / 2 + 1, w * 0.3, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 3);
  g.fillStyle(0x02070d, 1).fillCircle(0, -1, size / 9).fillRect(-1, 0, 2, h / 4);
  return g;
};

export interface Focusable {
  rect: Phaser.Geom.Rectangle;
  setFocus(on: boolean): void;
  activate(): void;
  /** Optional hook so pointer hover can move keyboard focus. */
  onHover?: () => void;
}

export type TileOpts = {
  title: string;
  sub?: string;
  icon?: string;
  iconSize?: number;
  accent?: number;
  locked?: boolean;
  lockedSub?: string;
  titleSize?: number;
  subSize?: number;
  align?: "left" | "center";
  /** Selected (persistent) state, drawn independently from keyboard focus. */
  selected?: boolean;
  onPress?: () => void;
};

/** Rounded focusable card with optional icon/subtitle/lock. Positioned by top-left corner. */
export class Tile extends Phaser.GameObjects.Container implements Focusable {
  rect: Phaser.Geom.Rectangle;
  onHover?: () => void;
  focused = false;
  private g: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private subText?: Phaser.GameObjects.Text;
  private shine: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    public opts: TileOpts,
  ) {
    super(scene, x + w / 2, y + h / 2);
    this.rect = new Phaser.Geom.Rectangle(x, y, w, h);
    this.g = scene.add.graphics();
    this.add(this.g);
    const accent = opts.accent ?? CYAN;
    const center = opts.align === "center";
    let tx = -w / 2 + 18;
    if (opts.icon) {
      const size = opts.iconSize ?? Math.min(h - 18, 46);
      const icon = scene.add.image(-w / 2 + 16 + size / 2, 0, opts.icon);
      icon.setScale(size / Math.max(icon.width, icon.height));
      if (opts.locked) icon.setTint(0x55616e);
      this.add(icon);
      tx = -w / 2 + 30 + size;
    }
    const hasSub = !!(opts.locked ? opts.lockedSub ?? opts.sub : opts.sub);
    const titleSize = opts.titleSize ?? Math.min(24, Math.round(h * (hasSub ? 0.3 : 0.38)));
    this.titleText = text(scene, center ? 0 : tx, hasSub ? -4 : 0, opts.title, titleSize, opts.locked ? "#7f8fa0" : "#eaf8ff", "900").setOrigin(center ? 0.5 : 0, hasSub ? 1 : 0.5);
    this.add(this.titleText);
    if (hasSub) {
      this.subText = body(scene, center ? 0 : tx, 2, (opts.locked ? opts.lockedSub ?? opts.sub : opts.sub) ?? "", opts.subSize ?? 14, opts.locked ? "#7f8fa0" : "#9fb8cc", {
        weight: "700",
        wrap: w - (tx + w / 2) - 16,
        align: center ? "center" : "left",
      }).setOrigin(center ? 0.5 : 0, 0);
      this.add(this.subText);
    }
    if (opts.locked) this.add(lockIcon(scene, w / 2 - 26, 0, 20));
    this.shine = scene.add.rectangle(-w / 2 + 3, 0, 5, h - 20, accent, 1).setOrigin(0, 0.5).setVisible(false);
    this.add(this.shine);

    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => this.onHover?.());
    zone.on("pointerdown", () => this.activate());
    this.add(zone);
    this.setSize(w, h);
    scene.add.existing(this);
    this.redraw();
  }

  get accent() {
    return this.opts.accent ?? CYAN;
  }

  setTitle(value: string) {
    this.titleText.setText(value);
    return this;
  }

  setSub(value: string) {
    this.subText?.setText(value);
    return this;
  }

  setSelected(on: boolean) {
    this.opts.selected = on;
    this.redraw();
    return this;
  }

  setFocus(on: boolean) {
    if (this.focused === on) return;
    this.focused = on;
    this.redraw();
    this.scene.tweens.add({ targets: this, scale: on ? 1.035 : 1, duration: 120, ease: "Quad.easeOut" });
  }

  activate() {
    if (this.opts.locked) {
      this.deny();
      return;
    }
    sfx.confirm();
    this.opts.onPress?.();
  }

  deny() {
    sfx.warn();
    shake(this.scene, this, this.rect.centerX);
    flash(this.scene, this);
  }

  private redraw() {
    const { w, h } = this;
    const accent = this.accent;
    const sel = !!this.opts.selected;
    const on = this.focused;
    this.g.clear();
    drawPanel(this.g, -w / 2, -h / 2, w, h, {
      fill: on ? 0x143049 : sel ? 0x10263b : PANEL,
      alpha: this.opts.locked ? 0.7 : 0.92,
      stroke: on ? 0xffffff : accent,
      strokeAlpha: on ? 0.95 : sel ? 1 : 0.4,
      lineWidth: on || sel ? 3 : 2,
    });
    if (on) this.g.lineStyle(6, accent, 0.25).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 14);
    this.shine.setVisible(on || sel).setFillStyle(accent);
  }
}

export const shake = (scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform, x0 = target.x) => {
  scene.tweens.add({
    targets: target,
    x: { from: x0 - 8, to: x0 },
    duration: 60,
    repeat: 3,
    yoyo: false,
    ease: "Sine.easeInOut",
    onComplete: () => {
      target.x = x0;
    },
  });
};

/** Brief colored overlay over a center-origin container (e.g. a Tile). */
export const flash = (scene: Phaser.Scene, host: Phaser.GameObjects.Container, color = RED) => {
  const r = scene.add.rectangle(0, 0, host.width, host.height, color, 0.45);
  host.add(r);
  scene.tweens.add({ targets: r, alpha: 0, duration: 380, onComplete: () => r.destroy() });
};

export const fmtNum = (n: number) => Math.round(n).toLocaleString("vi-VN");
