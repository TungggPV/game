import Phaser from "phaser";
import { hex } from "../../config/constants";
import { WORKSHOP, type WorkshopDef } from "../../config/meta";
import { buyWorkshop, nextWorkshopCost, profile, workshopLevel } from "../../systems/save";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";
import { MenuScreen } from "./MenuScreen";
import { body, CYAN, drawPanel, flash, fmtNum, GOLD, MUTED, RED, Tile } from "./ui";

const W = 284;
const H = 262;

export class WorkshopScene extends MenuScreen {
  private cards: { def: WorkshopDef; tile: Tile; dyn: Phaser.GameObjects.Container }[] = [];

  constructor() {
    super("menu_workshop");
  }

  create() {
    this.cards = [];
    this.setupScreen({
      title: "XƯỞNG GIÁP",
      subtitle: "NÂNG CẤP VĨNH VIỄN CHO MỌI ANH HÙNG",
      bg: "bg_lab_sewer",
      tint: 0xb8e8ff,
      hint: "W/S/A/D: chọn   ·   J / Enter / chạm: mua nâng cấp   ·   Esc / K: quay lại",
    });

    WORKSHOP.forEach((def, i) => {
      const x = 48 + (i % 4) * (W + 16);
      const y = 100 + Math.floor(i / 4) * (H + 16);
      const tile = new Tile(this, x, y, W, H, { title: "", accent: CYAN, onPress: () => this.buy(i) });
      const icon = this.add.image(-W / 2 + 42, -H / 2 + 42, def.icon);
      icon.setScale(46 / Math.max(icon.width, icon.height));
      const glow = this.add.image(icon.x, icon.y, "glow").setScale(0.9).setTint(CYAN).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
      tile.add([glow, icon]);
      tile.add(text(this, -W / 2 + 78, -H / 2 + 16, def.name, 20, "#ffffff", "900"));
      tile.add(body(this, -W / 2 + 78, -H / 2 + 46, def.desc, 13, "#9fb8cc", { wrap: W - 96, weight: "700" }));
      const dyn = this.add.container(0, 0);
      tile.add(dyn);
      this.cards.push({ def, tile, dyn });
      this.addFocusable(tile);
      this.drawDynamic(i);
    });
    this.focus(0, true);
  }

  private drawDynamic(i: number) {
    const { def, dyn } = this.cards[i];
    dyn.removeAll(true);
    const lvl = workshopLevel(def.id);
    const cost = nextWorkshopCost(def.id);
    const left = -W / 2 + 20;
    const top = -H / 2;
    dyn.add(body(this, left, top + 90, "CẤP", 12, MUTED, { weight: "900" }));
    dyn.add(body(this, W / 2 - 20, top + 88, `${lvl}/${def.max}`, 15, "#ffffff", { weight: "900" }).setOrigin(1, 0));
    const g = this.add.graphics();
    const gap = 4;
    const pw = (W - 40 - gap * (def.max - 1)) / def.max;
    for (let p = 0; p < def.max; p += 1) g.fillStyle(p < lvl ? CYAN : 0x1d2b3a, 1).fillRoundedRect(left + p * (pw + gap), top + 112, pw, 10, 3);
    dyn.add(g);

    dyn.add(body(this, left, top + 134, "Hiện tại", 12, MUTED, { weight: "800" }));
    dyn.add(body(this, left, top + 151, lvl > 0 ? def.effect(lvl) : "Chưa nâng cấp", 15, lvl > 0 ? "#ffffff" : "#6f7f90", { weight: "900" }));
    dyn.add(body(this, left, top + 176, "Cấp kế tiếp", 12, MUTED, { weight: "800" }));
    dyn.add(body(this, left, top + 193, cost === null ? "—" : def.effect(lvl + 1), 15, hex(CYAN), { weight: "900" }));

    const strip = this.add.graphics();
    const afford = cost !== null && profile().credits >= cost;
    const color = cost === null ? 0x7dffb0 : afford ? GOLD : RED;
    drawPanel(strip, left, H / 2 - 50, W - 40, 36, { fill: 0x061220, alpha: 1, stroke: color, strokeAlpha: 0.8, radius: 18 });
    dyn.add(strip);
    if (cost === null) {
      dyn.add(text(this, 0, H / 2 - 32, "TỐI ĐA", 17, "#7dffb0", "900").setOrigin(0.5));
    } else {
      const coin = this.add.image(-40, H / 2 - 32, "item_coin");
      coin.setScale(22 / coin.height);
      dyn.add(coin);
      dyn.add(text(this, -24, H / 2 - 32, fmtNum(cost), 18, afford ? hex(GOLD) : "#ff8a8a", "900").setOrigin(0, 0.5));
    }
  }

  private buy(i: number) {
    const { def, tile } = this.cards[i];
    if (this.focusIndex !== i) this.focus(i, true);
    if (nextWorkshopCost(def.id) === null) {
      sfx.warn();
      return;
    }
    if (!buyWorkshop(def.id)) {
      tile.deny();
      return;
    }
    sfx.coin();
    flash(this, tile, CYAN);
    this.refreshCredits();
    const burst = this.add.particles(tile.x, tile.y, "dot", {
      speed: { min: 80, max: 260 },
      lifespan: 600,
      scale: { start: 0.9, end: 0 },
      tint: [CYAN, GOLD],
      blendMode: "ADD",
      emitting: false,
    });
    burst.explode(24);
    this.time.delayedCall(800, () => burst.destroy());
    // Affordability of every card may have changed.
    this.cards.forEach((_c, j) => this.drawDynamic(j));
  }
}
