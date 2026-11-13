import Phaser from "phaser";
import { hex } from "../../config/constants";
import { HEROES } from "../../config/heroes";
import { heroProgress } from "../../systems/save";
import { text } from "../../ui/widgets";
import { HERO_LORE } from "./data";
import { drawHeroDetail, drawLevel } from "./HeroSelectScene";
import { MenuScreen, type Dir } from "./MenuScreen";
import { body, panel, Tile } from "./ui";

let lastHero = 0;

export class RosterScene extends MenuScreen {
  private tabs: Tile[] = [];
  private detail!: Phaser.GameObjects.Container;
  private art!: Phaser.GameObjects.Image;
  private artGlow!: Phaser.GameObjects.Image;

  constructor() {
    super("menu_roster");
  }

  create() {
    this.tabs = [];
    this.setupScreen({
      title: "ANH HÙNG",
      subtitle: "HỒ SƠ CHIẾN BINH HÀO QUANG",
      hint: "W/S hoặc A/D: đổi anh hùng   ·   Chạm thẻ để xem   ·   Esc / K: quay lại",
    });

    HEROES.forEach((h, i) => {
      const tile = new Tile(this, 36, 100 + i * 144, 230, 134, {
        title: h.name,
        sub: `Cấp ${heroProgress(h.id).level}  ·  ${heroProgress(h.id).wins} thắng`,
        icon: `${h.id}_idle`,
        iconSize: 92,
        titleSize: 18,
        subSize: 13,
        accent: h.color,
        onPress: () => this.focus(i),
      });
      this.tabs.push(this.addFocusable(tile));
    });

    panel(this, 282, 100, 386, 572, { alpha: 0.75, stroke: 0x18e6ff, strokeAlpha: 0.2, radius: 16 });
    panel(this, 684, 100, 560, 572, { alpha: 0.85, stroke: 0x18e6ff, strokeAlpha: 0.2, radius: 16 });
    this.artGlow = this.add.image(475, 270, "glow").setScale(4).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add.image(475, 270, "softring").setScale(1.2).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, angle: -360, duration: 20000, repeat: -1 });
    this.art = this.add.image(475, 270, `${HEROES[0].id}_art`);
    this.detail = this.add.container(0, 0);
    this.focus(lastHero, true);
  }

  protected onDirection(dir: Dir) {
    const step = dir === "up" || dir === "left" ? -1 : 1;
    this.focus((this.focusIndex + step + HEROES.length) % HEROES.length);
    return true;
  }

  protected onConfirmKey() {
    return true;
  }

  protected onFocusChanged(i: number) {
    lastHero = i;
    this.tabs.forEach((t, j) => t.setSelected(j === i));
    const hero = HEROES[i];
    this.art.setTexture(`${hero.id}_art`);
    this.art.setScale(Math.min(350 / this.art.width, 300 / this.art.height));
    this.artGlow.setTint(hero.color);
    this.art.setAlpha(0).setY(290);
    this.tweens.add({ targets: this.art, alpha: 1, y: 270, duration: 260, ease: "Cubic.easeOut" });

    const d = this.detail;
    d.removeAll(true);
    d.add(text(this, 304, 440, hero.name.toUpperCase(), 30, hex(hero.color), "900"));
    d.add(body(this, 304, 480, hero.role, 15, "#ffffff", { weight: "800" }));
    d.add(body(this, 304, 512, HERO_LORE[hero.id] ?? "", 15, "#c8dcea", { wrap: 344, lineSpacing: 6 }));
    drawLevel(this, d, hero, 708, 118, 512);
    drawHeroDetail(this, d, hero, 708, 176, 528);
  }
}
