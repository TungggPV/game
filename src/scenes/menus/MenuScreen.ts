import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, hex } from "../../config/constants";
import type { AchievementDef } from "../../config/meta";
import { setSceneFlag } from "../../systems/controls";
import { metaEvents, profile } from "../../systems/save";
import { sfx } from "../../systems/sfx";
import { text, toast } from "../../ui/widgets";
import { body, CYAN, fmtNum, GOLD, MUTED, panel, Tile, type Focusable } from "./ui";

export type Dir = "up" | "down" | "left" | "right";

const DIRS: Record<string, Dir> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
};
const CONFIRM = new Set(["Enter", "NumpadEnter", "Space", "KeyJ"]);
const BACK = new Set(["Escape", "KeyK", "Backspace"]);

export type ScreenOpts = {
  title?: string;
  subtitle?: string;
  bg?: string;
  tint?: number;
  accent?: number;
  back?: boolean;
  credits?: boolean;
  hint?: string;
};

type Modal = { list: Focusable[]; index: number; layer: Phaser.GameObjects.Container; onCancel: () => void };

/**
 * Shared shell for every out-of-game screen: animated backdrop, header, back button,
 * credits counter, keyboard/pointer focus navigation, transitions and achievement toasts.
 */
export abstract class MenuScreen extends Phaser.Scene {
  protected focusables: Focusable[] = [];
  protected focusIndex = -1;
  protected leaving = false;
  protected accent = CYAN;
  private bgTile?: Phaser.GameObjects.TileSprite;
  private creditText?: Phaser.GameObjects.Text;
  private creditShown = 0;
  private modal: Modal | null = null;

  protected setupScreen(opts: ScreenOpts) {
    setSceneFlag("menu");
    this.focusables = [];
    this.focusIndex = -1;
    this.leaving = false;
    this.modal = null;
    this.creditText = undefined;
    this.accent = opts.accent ?? CYAN;

    this.backdrop(opts.bg ?? "bg_city_neon", opts.tint ?? 0xffffff);
    if (opts.title) {
      const tx = opts.back === false ? 48 : 214;
      text(this, tx, 22, opts.title, 34, "#ffffff", "900");
      if (opts.subtitle) text(this, tx + 2, 66, opts.subtitle, 14, hex(this.accent), "800").setLetterSpacing(3);
    }
    if (opts.back !== false) {
      const back = new Tile(this, 36, 26, 160, 50, { title: "‹  Quay lại", titleSize: 19, accent: this.accent, align: "center", onPress: () => this.onBack() });
      back.onHover = () => back.setFocus(true);
      back.on("pointerout", () => back.setFocus(false));
      // Pointer-only: Esc/K is the keyboard path, so it is kept out of the focus ring.
      back.list.forEach((c) => c instanceof Phaser.GameObjects.Zone && c.on("pointerout", () => back.setFocus(false)));
    }
    if (opts.credits !== false) this.creditsWidget();
    if (opts.hint) body(this, GAME_WIDTH / 2, GAME_HEIGHT - 26, opts.hint, 14, MUTED, { weight: "700", align: "center" }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    kb.addCapture([K.SPACE, K.TAB, K.UP, K.DOWN, K.LEFT, K.RIGHT, K.BACKSPACE]);
    const onKey = (ev: KeyboardEvent) => this.handleKey(ev);
    kb.on("keydown", onKey);
    const onAchievement = (def: AchievementDef) => {
      sfx.achievement();
      toast(this, `🏆 ${def.name}`, `${def.desc} · +${fmtNum(def.reward)} tín dụng`, GOLD);
      this.refreshCredits();
    };
    const onCredits = () => this.refreshCredits();
    metaEvents.on("achievement", onAchievement);
    metaEvents.on("credits", onCredits);
    this.events.once("shutdown", () => {
      kb.off("keydown", onKey);
      metaEvents.off("achievement", onAchievement);
      metaEvents.off("credits", onCredits);
    });
    this.input.once("pointerdown", () => sfx.unlock());

    const cam = this.cameras.main;
    cam.fadeIn(260, 2, 7, 13);
    cam.setScroll(-28, 0);
    this.tweens.add({ targets: cam, scrollX: 0, duration: 320, ease: "Cubic.easeOut" });
  }

  private backdrop(key: string, tint: number) {
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    this.bgTile = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
      .setOrigin(0)
      .setTileScale(GAME_HEIGHT / src.height)
      .setTint(tint)
      .setScrollFactor(0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.66).setOrigin(0).setScrollFactor(0);
    const glowA = this.add.image(220, 120, "glow").setScale(7).setTint(this.accent).setAlpha(0.13).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0);
    const glowB = this.add.image(1100, 620, "glow").setScale(8).setTint(0x7a4dff).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0);
    this.tweens.add({ targets: glowA, x: 420, y: 220, duration: 9000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: glowB, x: 880, y: 520, duration: 11000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .particles(0, 0, "dot", {
        x: { min: 0, max: GAME_WIDTH },
        y: GAME_HEIGHT + 10,
        speedY: { min: -40, max: -14 },
        speedX: { min: -8, max: 8 },
        lifespan: 16000,
        scale: { start: 0.6, end: 0.1 },
        alpha: { start: 0.55, end: 0 },
        frequency: 260,
        tint: [this.accent, 0xffffff, 0x7a4dff],
        blendMode: "ADD",
      })
      .setScrollFactor(0);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "vignette").setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.85).setScrollFactor(0);
  }

  private creditsWidget() {
    const p = profile();
    this.creditShown = p.credits;
    panel(this, GAME_WIDTH - 236, 26, 200, 50, { stroke: GOLD, strokeAlpha: 0.5, radius: 25 });
    const coin = this.add.image(GAME_WIDTH - 210, 51, "item_coin");
    coin.setScale(30 / coin.height);
    this.creditText = text(this, GAME_WIDTH - 52, 51, fmtNum(p.credits), 22, hex(GOLD), "900").setOrigin(1, 0.5);
  }

  protected refreshCredits() {
    const label = this.creditText;
    if (!label || !label.active) return;
    const target = profile().credits;
    const from = this.creditShown;
    if (from === target) return;
    this.creditShown = target;
    const counter = { v: from };
    this.tweens.add({
      targets: counter,
      v: target,
      duration: 500,
      ease: "Cubic.easeOut",
      onUpdate: () => label.setText(fmtNum(counter.v)),
    });
    this.tweens.add({ targets: label, scale: { from: target > from ? 1.25 : 0.85, to: 1 }, duration: 380, ease: "Back.easeOut" });
    label.setColor(target > from ? "#ffffff" : "#ff8a8a");
    this.time.delayedCall(400, () => label.active && label.setColor(hex(GOLD)));
  }

  update(_t: number, dms: number) {
    if (this.bgTile) this.bgTile.tilePositionX += dms * 0.012;
    this.tick(dms);
  }

  protected tick(_dms: number) {}

  // ---------- focus ----------

  protected addFocusable<T extends Focusable>(f: T): T {
    const list = this.modal ? this.modal.list : this.focusables;
    const i = list.length;
    list.push(f);
    f.onHover = () => this.focus(i);
    return f;
  }

  protected get activeList() {
    return this.modal ? this.modal.list : this.focusables;
  }

  protected focus(i: number, silent = false) {
    const list = this.activeList;
    if (!list.length) return;
    const next = Phaser.Math.Clamp(i, 0, list.length - 1);
    const current = this.modal ? this.modal.index : this.focusIndex;
    if (next === current) {
      list[next].setFocus(true);
      return;
    }
    if (!silent) sfx.select();
    list.forEach((f, j) => f.setFocus(j === next));
    if (this.modal) this.modal.index = next;
    else {
      this.focusIndex = next;
      this.onFocusChanged(next);
    }
  }

  protected onFocusChanged(_i: number) {}

  /** Spatial navigation: nearest focusable in the pressed direction, wrapping within the same row/column. */
  protected moveFocus(dir: Dir) {
    const list = this.activeList;
    const cur = list[this.modal ? this.modal.index : this.focusIndex];
    if (!cur) {
      this.focus(0);
      return;
    }
    const horizontal = dir === "left" || dir === "right";
    const sign = dir === "right" || dir === "down" ? 1 : -1;
    let best = -1;
    let bestScore = Infinity;
    let wrap = -1;
    let wrapScore = -Infinity;
    list.forEach((f, i) => {
      if (f === cur) return;
      const dx = f.rect.centerX - cur.rect.centerX;
      const dy = f.rect.centerY - cur.rect.centerY;
      const primary = (horizontal ? dx : dy) * sign;
      const secondary = Math.abs(horizontal ? dy : dx);
      if (primary > 4) {
        const score = primary + secondary * 2.2;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      } else if (secondary < (horizontal ? cur.rect.height : cur.rect.width) / 2) {
        const score = -primary;
        if (score > wrapScore) {
          wrapScore = score;
          wrap = i;
        }
      }
    });
    const target = best >= 0 ? best : wrap;
    if (target >= 0) this.focus(target);
  }

  protected activateFocused() {
    const list = this.activeList;
    list[this.modal ? this.modal.index : this.focusIndex]?.activate();
  }

  // ---------- input ----------

  private handleKey(ev: KeyboardEvent) {
    if (this.leaving) return;
    sfx.unlock();
    const code = ev.code;
    const dir = DIRS[code];
    if (this.modal) {
      if (dir) this.moveFocus(dir);
      else if (!ev.repeat && CONFIRM.has(code)) this.activateFocused();
      else if (!ev.repeat && BACK.has(code)) this.modal.onCancel();
      return;
    }
    if (dir) {
      if (!this.onDirection(dir, code)) this.moveFocus(dir);
      return;
    }
    if (ev.repeat) return;
    if (CONFIRM.has(code)) {
      if (!this.onConfirmKey(code)) this.activateFocused();
    } else if (BACK.has(code)) this.onBack();
    else this.onKey(code);
  }

  /** Return true to consume a direction before spatial navigation runs. */
  protected onDirection(_dir: Dir, _code: string): boolean {
    return false;
  }

  protected onConfirmKey(_code: string): boolean {
    return false;
  }

  protected onKey(_code: string) {}

  protected onBack() {
    this.go("menu");
  }

  // ---------- navigation ----------

  protected go(key: string, data?: object) {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, scrollX: 24, duration: 180, ease: "Cubic.easeIn" });
    cam.fadeOut(180, 2, 7, 13);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
  }

  // ---------- modal ----------

  protected openConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void, color = 0xff4e5f) {
    if (this.modal) return;
    const layer = this.add.container(0, 0).setDepth(5000).setScrollFactor(0);
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setOrigin(0).setInteractive();
    const w = 560;
    const h = 260;
    const x = (GAME_WIDTH - w) / 2;
    const y = (GAME_HEIGHT - h) / 2;
    const box = panel(this, x, y, w, h, { fill: 0x081624, alpha: 0.98, stroke: color, strokeAlpha: 0.9, radius: 16 });
    const head = text(this, GAME_WIDTH / 2, y + 30, title, 28, hex(color), "900").setOrigin(0.5, 0);
    const msg = body(this, GAME_WIDTH / 2, y + 82, message, 17, "#c8dcea", { wrap: w - 60, align: "center" }).setOrigin(0.5, 0);
    layer.add([shade, box, head, msg]);
    const close = () => {
      if (!this.modal) return;
      this.modal = null;
      layer.destroy();
      this.focusables.forEach((f, j) => f.setFocus(j === this.focusIndex));
    };
    this.modal = { list: [], index: -1, layer, onCancel: close };
    this.focusables.forEach((f) => f.setFocus(false));
    const cancel = this.addFocusable(new Tile(this, x + 40, y + h - 84, 220, 56, { title: "Hủy", align: "center", onPress: close }));
    const ok = this.addFocusable(
      new Tile(this, x + w - 260, y + h - 84, 220, 56, {
        title: confirmLabel,
        align: "center",
        accent: color,
        onPress: () => {
          close();
          onConfirm();
        },
      }),
    );
    layer.add([cancel, ok]);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160 });
    this.focus(0, true);
  }
}
