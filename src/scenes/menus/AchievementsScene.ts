import Phaser from "phaser";
import { hex } from "../../config/constants";
import { ACHIEVEMENTS } from "../../config/meta";
import { achievementUnlocked, profile } from "../../systems/save";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";
import { MenuScreen, type Dir } from "./MenuScreen";
import { bar, body, CYAN, drawPanel, fmtNum, GOLD, lockIcon, MUTED, panel } from "./ui";

const VIEW = { x: 48, y: 158, w: 1168, h: 512 };
const ROW_H = 80;
const GAP = 10;

export class AchievementsScene extends MenuScreen {
  private list!: Phaser.GameObjects.Container;
  private highlight!: Phaser.GameObjects.Graphics;
  private thumb!: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private target = 0;
  private sel = 0;
  private drag: { y: number; scroll: number; moved: boolean } | null = null;

  constructor() {
    super("menu_achievements");
  }

  private get maxScroll() {
    return Math.max(0, ACHIEVEMENTS.length * (ROW_H + GAP) - GAP - VIEW.h);
  }

  create() {
    this.scroll = 0;
    this.target = 0;
    this.sel = 0;
    this.drag = null;
    const done = ACHIEVEMENTS.filter((a) => achievementUnlocked(a.id));
    this.setupScreen({
      title: "THÀNH TỰU",
      subtitle: `ĐÃ MỞ ${done.length}/${ACHIEVEMENTS.length}`,
      accent: GOLD,
      hint: "W / S: di chuyển   ·   Lăn chuột hoặc kéo để cuộn   ·   Esc / K: quay lại",
    });

    panel(this, VIEW.x - 12, 96, VIEW.w + 36, 50, { alpha: 0.8, stroke: GOLD, strokeAlpha: 0.3, radius: 25 });
    body(this, VIEW.x + 10, 121, `Tiến độ ${Math.round((done.length / ACHIEVEMENTS.length) * 100)}%`, 16, "#ffffff", { weight: "900" }).setOrigin(0, 0.5);
    bar(this, VIEW.x + 150, 115, 640, 12, done.length / ACHIEVEMENTS.length, GOLD);
    const earned = done.reduce((s, a) => s + a.reward, 0);
    body(this, VIEW.x + VIEW.w + 10, 121, `Đã nhận ${fmtNum(earned)} tín dụng`, 16, hex(GOLD), { weight: "900" }).setOrigin(1, 0.5);

    this.list = this.add.container(VIEW.x, VIEW.y);
    const maskShape = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(VIEW.x - 10, VIEW.y - 6, VIEW.w + 20, VIEW.h + 12);
    this.list.setMask(maskShape.createGeometryMask());
    this.highlight = this.add.graphics();
    this.list.add(this.highlight);
    const stats = profile().stats;
    ACHIEVEMENTS.forEach((a, i) => {
      const y = i * (ROW_H + GAP);
      const open = achievementUnlocked(a.id);
      const g = this.add.graphics();
      drawPanel(g, 0, y, VIEW.w - 24, ROW_H, { fill: open ? 0x1a2a1c : 0x0a1a2c, alpha: open ? 0.92 : 0.85, stroke: open ? GOLD : 0x3a5068, strokeAlpha: open ? 0.6 : 0.4 });
      this.list.add(g);
      if (open) {
        this.list.add(this.add.image(42, y + ROW_H / 2, "glow").setScale(0.7).setTint(GOLD).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD));
        this.list.add(text(this, 42, y + ROW_H / 2, "★", 30, hex(GOLD), "900").setOrigin(0.5));
      } else {
        this.list.add(lockIcon(this, 42, y + ROW_H / 2 + 2, 22, 0x6f7f90));
      }
      this.list.add(text(this, 84, y + 14, a.name, 20, open ? "#ffffff" : "#c8dcea", "900"));
      this.list.add(body(this, 84, y + 46, a.desc, 15, open ? "#c8dcea" : "#8fa6ba", { weight: "700" }));

      const px = 640;
      if (open) {
        const when = new Date(profile().achievements[a.id]).toLocaleDateString("vi-VN");
        this.list.add(body(this, px, y + 20, "ĐÃ MỞ KHÓA", 14, hex(GOLD), { weight: "900" }));
        this.list.add(body(this, px, y + 44, when, 14, MUTED, { weight: "700" }));
      } else if (a.stat && a.goal) {
        const v = Math.min(stats[a.stat], a.goal);
        this.list.add(body(this, px, y + 18, "Tiến độ", 13, MUTED, { weight: "800" }));
        this.list.add(body(this, px + 300, y + 18, `${fmtNum(v)}/${fmtNum(a.goal)}`, 14, "#ffffff", { weight: "900" }).setOrigin(1, 0));
        this.list.add(bar(this, px, y + 46, 300, 10, v / a.goal, CYAN).g);
      } else {
        this.list.add(body(this, px, y + 30, "Thử thách đặc biệt", 14, MUTED, { weight: "800" }));
      }
      const coin = this.add.image(VIEW.w - 160, y + ROW_H / 2, "item_coin");
      coin.setScale(24 / coin.height).setAlpha(open ? 1 : 0.6);
      this.list.add(coin);
      this.list.add(text(this, VIEW.w - 144, y + ROW_H / 2, `+${fmtNum(a.reward)}`, 19, open ? hex(GOLD) : "#a89a50", "900").setOrigin(0, 0.5));
    });

    const track = this.add.graphics();
    track.fillStyle(0x1d2b3a, 1).fillRoundedRect(VIEW.x + VIEW.w - 6, VIEW.y, 6, VIEW.h, 3);
    this.thumb = this.add.graphics();

    const zone = this.add.zone(VIEW.x, VIEW.y, VIEW.w, VIEW.h).setOrigin(0).setInteractive();
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollTo(this.target + dy * 0.8));
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => (this.drag = { y: p.y, scroll: this.target, moved: false }));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dy = p.y - this.drag.y;
      if (Math.abs(dy) > 6) this.drag.moved = true;
      if (this.drag.moved) this.scrollTo(this.drag.scroll - dy, true);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.drag && !this.drag.moved) {
        const i = Math.floor((p.y - VIEW.y + this.scroll) / (ROW_H + GAP));
        if (i >= 0 && i < ACHIEVEMENTS.length && p.x < VIEW.x + VIEW.w) this.select(i, false);
      }
      this.drag = null;
    });
    this.select(0, false, true);
  }

  private scrollTo(v: number, immediate = false) {
    this.target = Phaser.Math.Clamp(v, 0, this.maxScroll);
    if (immediate) this.scroll = this.target;
  }

  private select(i: number, keepVisible = true, silent = false) {
    const next = Phaser.Math.Clamp(i, 0, ACHIEVEMENTS.length - 1);
    if (next !== this.sel && !silent) sfx.select();
    this.sel = next;
    const y = next * (ROW_H + GAP);
    this.highlight.clear();
    this.highlight.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(-2, y - 2, VIEW.w - 20, ROW_H + 4, 13);
    this.highlight.lineStyle(7, CYAN, 0.25).strokeRoundedRect(-5, y - 5, VIEW.w - 14, ROW_H + 10, 15);
    this.list.bringToTop(this.highlight);
    if (keepVisible) {
      if (y < this.target) this.scrollTo(y);
      else if (y + ROW_H > this.target + VIEW.h) this.scrollTo(y + ROW_H - VIEW.h);
    }
  }

  protected onDirection(dir: Dir) {
    if (dir === "up") this.select(this.sel - 1);
    else if (dir === "down") this.select(this.sel + 1);
    return true;
  }

  protected onKey(code: string) {
    const page = Math.floor(VIEW.h / (ROW_H + GAP));
    if (code === "PageDown") this.select(this.sel + page);
    else if (code === "PageUp") this.select(this.sel - page);
    else if (code === "Home") this.select(0);
    else if (code === "End") this.select(ACHIEVEMENTS.length - 1);
  }

  protected onConfirmKey() {
    return true;
  }

  protected tick(dms: number) {
    this.scroll += (this.target - this.scroll) * Math.min(1, dms * 0.018);
    if (Math.abs(this.target - this.scroll) < 0.5) this.scroll = this.target;
    this.list.y = VIEW.y - this.scroll;
    const ratio = VIEW.h / (VIEW.h + this.maxScroll);
    const th = Math.max(40, VIEW.h * ratio);
    const ty = VIEW.y + (this.maxScroll ? (this.scroll / this.maxScroll) * (VIEW.h - th) : 0);
    this.thumb.clear().fillStyle(GOLD, 0.85).fillRoundedRect(VIEW.x + VIEW.w - 6, ty, 6, th, 3);
  }
}
