import Phaser from "phaser";
import { hex, type GameMode } from "../config/constants";
import { HEROES } from "../config/heroes";
import { ACHIEVEMENTS } from "../config/meta";
import { STAGES } from "../config/content";
import { achievementUnlocked, heroProgress, settings, stageStars } from "../systems/save";
import { music, sfx } from "../systems/sfx";
import { text } from "../ui/widgets";
import { MODE_INFO } from "./menus/data";
import { MenuScreen } from "./menus/MenuScreen";
import { body, CYAN, GOLD, MUTED, panel, Tile } from "./menus/ui";

const MODE_ICONS: Record<GameMode, string> = {
  campaign: "nova_blade_icon_ultimate",
  endless: "emerald_phantom_icon_skill2",
  bossrush: "boss",
  pk: "crimson_flare_icon_basic",
  training: "volt_sentinel_icon_skill1",
};

let lastFocus = 0;

/** Hub screen: the entry point the game returns to. */
export class MenuScene extends MenuScreen {
  private showcase = 0;
  private art!: Phaser.GameObjects.Image;
  private artGlow!: Phaser.GameObjects.Image;
  private heroName!: Phaser.GameObjects.Text;
  private heroRole!: Phaser.GameObjects.Text;

  constructor() {
    super("menu");
  }

  create() {
    const s = settings();
    sfx.setVolume(s.volume);
    music.play("menu", s.music);
    this.setupScreen({ back: false, hint: "W/S/A/D: di chuyển  ·  J / Enter / Space: chọn  ·  hoặc chạm trực tiếp" });

    text(this, 52, 30, "ELEMENT ARMOR", 16, hex(CYAN), "900").setLetterSpacing(8);
    const title = text(this, 46, 48, "HÀO QUANG GIÁP", 62, "#ffffff", "900");
    title.setShadow(0, 0, hex(CYAN), 18, false, true);
    this.summary();

    text(this, 50, 196, "CHẾ ĐỘ CHƠI", 14, MUTED, "900").setLetterSpacing(3);
    text(this, 462, 196, "HỒ SƠ & HỆ THỐNG", 14, MUTED, "900").setLetterSpacing(3);

    const bossLocked = stageStars(2) <= 0;
    const modes: GameMode[] = ["campaign", "endless", "bossrush", "pk", "training"];
    modes.forEach((mode, i) => {
      const info = MODE_INFO[mode];
      const locked = mode === "bossrush" && bossLocked;
      this.addFocusable(
        new Tile(this, 48, 222 + i * 82, 392, 72, {
          title: info.name,
          sub: info.desc,
          icon: MODE_ICONS[mode],
          iconSize: 50,
          accent: info.color,
          locked,
          lockedSub: "Hoàn thành Màn 3 để mở khóa",
          onPress: () => this.go("menu_heroes", { mode }),
        }),
      );
    });

    const unlocked = ACHIEVEMENTS.filter((a) => achievementUnlocked(a.id)).length;
    const pages: [string, string, string][] = [
      ["Xưởng Giáp", "Nâng cấp giáp vĩnh viễn", "menu_workshop"],
      ["Anh Hùng", "Hồ sơ 4 chiến binh", "menu_roster"],
      ["Thành Tựu", `Đã mở ${unlocked}/${ACHIEVEMENTS.length}`, "menu_achievements"],
      ["Thống Kê", "Thành tích của bạn", "menu_stats"],
      ["Cài Đặt", "Âm thanh · hiển thị · dữ liệu", "menu_settings"],
      ["Hướng Dẫn", "Điều khiển & cơ chế", "menu_guide"],
    ];
    pages.forEach(([name, sub, key], i) => {
      this.addFocusable(new Tile(this, 460, 222 + i * 68, 262, 60, { title: name, sub, subSize: 13, onPress: () => this.go(key) }));
    });

    this.buildShowcase();
    this.focus(Math.min(lastFocus, this.focusables.length - 1), true);
  }

  protected onFocusChanged(i: number) {
    lastFocus = i;
  }

  protected onBack() {
    // Hub has nowhere to go back to.
  }

  private summary() {
    const best = Math.max(...HEROES.map((h) => heroProgress(h.id).level));
    const unlocked = ACHIEVEMENTS.filter((a) => achievementUnlocked(a.id)).length;
    const stars = STAGES.reduce((sum, _s, i) => sum + stageStars(i), 0);
    const chips: [string, string][] = [
      [`Cấp cao nhất ${best}`, "#eaf8ff"],
      [`Thành tựu ${unlocked}/${ACHIEVEMENTS.length}`, "#eaf8ff"],
      [`★ ${stars}/${STAGES.length * 3}`, hex(GOLD)],
    ];
    let x = 50;
    chips.forEach(([label, color]) => {
      const t = body(this, 0, 0, label, 15, color, { weight: "800" });
      const w = t.width + 28;
      panel(this, x, 132, w, 34, { stroke: CYAN, strokeAlpha: 0.3, radius: 17 });
      t.setPosition(x + 14, 149).setOrigin(0, 0.5).setDepth(1);
      x += w + 10;
    });
  }

  private buildShowcase() {
    const cx = 1000;
    panel(this, 760, 104, 484, 548, { alpha: 0.5, stroke: CYAN, strokeAlpha: 0.18, radius: 18 });
    this.artGlow = this.add.image(cx, 350, "glow").setScale(5).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add.image(cx, 350, "softring").setScale(1.5).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, angle: 360, duration: 24000, repeat: -1 });
    this.art = this.add.image(cx, 350, `${HEROES[0].id}_art`);
    this.tweens.add({ targets: this.art, y: 336, yoyo: true, repeat: -1, duration: 1800, ease: "Sine.easeInOut" });
    this.heroName = text(this, cx, 572, "", 30, "#ffffff", "900").setOrigin(0.5);
    this.heroRole = body(this, cx, 608, "", 15, "#9fb8cc", { weight: "800" }).setOrigin(0.5);
    this.showcase = Phaser.Math.Between(0, HEROES.length - 1);
    this.showHero(false);
    this.time.addEvent({ delay: 4200, loop: true, callback: () => this.showHero(true) });
  }

  private showHero(advance: boolean) {
    if (advance) this.showcase = (this.showcase + 1) % HEROES.length;
    const h = HEROES[this.showcase];
    const lvl = heroProgress(h.id).level;
    this.art.setTexture(`${h.id}_art`);
    this.art.setScale(Math.min(400 / this.art.width, 400 / this.art.height));
    this.artGlow.setTint(h.color);
    this.heroName.setText(h.name.toUpperCase()).setColor(hex(h.color));
    this.heroRole.setText(`${h.role}  ·  Cấp ${lvl}`);
    this.art.setAlpha(0).setX(1040);
    this.tweens.add({ targets: this.art, alpha: 1, x: 1000, duration: 420, ease: "Cubic.easeOut" });
  }
}
