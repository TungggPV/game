import Phaser from "phaser";
import { FONT, hex } from "../config/constants";
import { sfx } from "../systems/sfx";

export const text = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color = "#eaf8ff",
  weight = "800",
) =>
  scene.add.text(x, y, value, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: weight,
    color,
    stroke: "#02070d",
    strokeThickness: Math.max(2, Math.round(size / 7)),
  });

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  selected = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    caption: string,
    readonly onPress: () => void,
    private accent = 0x18e6ff,
    /** Cards keep their dark fill when selected so their content stays readable. */
    private outline = false,
  ) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, w, h, 0x0a1a2c, 0.92).setStrokeStyle(2, accent, 0.45);
    this.label = text(scene, 0, 0, caption, Math.round(h * 0.4)).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerover", () => this.emit("hover"));
    this.bg.on("pointerdown", () => this.press());
    scene.add.existing(this);
  }

  setCaption(caption: string) {
    this.label.setText(caption);
    return this;
  }

  setSelected(on: boolean) {
    this.selected = on;
    this.setScale(on ? 1.04 : 1);
    if (this.outline) {
      this.bg.setFillStyle(on ? 0x14283c : 0x0a1a2c, 0.95).setStrokeStyle(on ? 4 : 2, this.accent, on ? 1 : 0.45);
      return this;
    }
    this.bg.setFillStyle(on ? this.accent : 0x0a1a2c, on ? 0.95 : 0.92).setStrokeStyle(2, this.accent, on ? 1 : 0.45);
    this.label.setColor(on ? "#02070d" : "#eaf8ff").setStroke(on ? hex(this.accent) : "#02070d", on ? 0 : 4);
    return this;
  }

  press() {
    sfx.confirm();
    this.onPress();
  }
}

/** Vertical/horizontal button group with keyboard navigation. */
export class ButtonGroup {
  index = 0;
  private keys: Phaser.Input.Keyboard.Key[][];

  constructor(
    private scene: Phaser.Scene,
    readonly buttons: Button[],
    private horizontal = false,
  ) {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = scene.input.keyboard!;
    const prev = horizontal ? [K.A, K.LEFT] : [K.W, K.UP];
    const next = horizontal ? [K.D, K.RIGHT] : [K.S, K.DOWN];
    this.keys = [prev, next, [K.ENTER, K.J, K.SPACE]].map((codes) => codes.map((c) => kb.addKey(c, true, false)));
    buttons.forEach((b, i) => b.on("hover", () => this.select(i)));
    this.select(0);
  }

  select(i: number) {
    const n = this.buttons.length;
    const next = ((i % n) + n) % n;
    if (next !== this.index) sfx.select();
    this.index = next;
    this.buttons.forEach((b, j) => b.setSelected(j === this.index));
  }

  update() {
    const jd = (ks: Phaser.Input.Keyboard.Key[]) => ks.some((k) => Phaser.Input.Keyboard.JustDown(k));
    if (jd(this.keys[0])) this.select(this.index - 1);
    if (jd(this.keys[1])) this.select(this.index + 1);
    if (jd(this.keys[2])) this.buttons[this.index].press();
  }

  /** Clear latched presses so the key that opened a menu does not also activate it. */
  reset() {
    this.keys.flat().forEach((k) => k.reset());
  }

  // Key objects are shared per scene, so they are left registered.
  destroy() {
    this.buttons.forEach((b) => b.destroy());
  }
}
