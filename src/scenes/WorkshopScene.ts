import Phaser from "phaser";
import { FONT, GAME_HEIGHT, GAME_WIDTH, hex } from "../config/constants";
import { HEROES } from "../config/heroes";
import { loadProgress, saveProgress, unlockEntry } from "../systems/progress";
import { sfx } from "../systems/sfx";
import { Button, ButtonGroup, text } from "../ui/widgets";

type UpgradeBranch = {
  id: "hp" | "energy" | "cooldown" | "damage";
  name: string;
  icon: string;
  desc: string;
  bonusText: (level: number) => string;
};

const BRANCHES: UpgradeBranch[] = [
  {
    id: "hp",
    name: "Sinh Lực",
    icon: "item_health",
    desc: "+15 HP tối đa mỗi cấp",
    bonusText: (lvl) => `+${lvl * 15} HP`,
  },
  {
    id: "energy",
    name: "Năng Lượng",
    icon: "item_energy",
    desc: "+8 Năng lượng khởi đầu & tốc độ nạp mỗi cấp",
    bonusText: (lvl) => `+${lvl * 8} Năng lượng`,
  },
  {
    id: "cooldown",
    name: "Kỹ Thuật",
    icon: "item_chip",
    desc: "-4% thời gian hồi chiêu mỗi cấp",
    bonusText: (lvl) => `-${lvl * 4}% Hồi chiêu`,
  },
  {
    id: "damage",
    name: "Hỏa Lực",
    icon: "nova_blade_icon_basic",
    desc: "+5% Sát thương đòn đánh & kỹ năng mỗi cấp",
    bonusText: (lvl) => `+${lvl * 5}% Sát thương`,
  },
];

const UPGRADE_COSTS = [150, 300, 500, 800, 1200];

export class WorkshopScene extends Phaser.Scene {
  private coinText!: Phaser.GameObjects.Text;
  private cards: Phaser.GameObjects.Container[] = [];
  private group!: ButtonGroup;

  constructor() {
    super("workshop");
  }

  create() {
    this.cards = [];
    const src = this.textures.get("bg_lab_sewer").getSourceImage();
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_lab_sewer").setOrigin(0).setTileScale(GAME_HEIGHT / src.height);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.75).setOrigin(0);

    text(this, 60, 40, "XƯỞNG GIÁP & KHO VŨ KHÍ", 38, "#ffe45c", "900");
    text(this, 64, 84, "Nâng cấp chỉ số vĩnh viễn cho toàn bộ 7 Chiến Binh Giáp Hào Quang", 16, "#9fb8cc", "700");

    const p = loadProgress();
    this.coinText = text(this, GAME_WIDTH - 105, 48, `🪙 ${p.coins} XU`, 28, "#ffe45c", "900").setOrigin(1, 0);

    const buttons: Button[] = [];

    // Render all 4 stat upgrade branches uniformly
    BRANCHES.forEach((b, i) => {
      const x = 160 + i * 290;
      const y = 300;
      const root = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, 260, 320, 0x0a1a2c, 0.95).setStrokeStyle(2, i === 3 ? 0xff4e3a : 0x18e6ff, 0.45);
      const icon = this.add.image(0, -90, b.icon).setDisplaySize(54, 54);
      const name = text(this, 0, -45, b.name, 22, "#ffffff", "900").setOrigin(0.5);
      const desc = this.add.text(0, -10, b.desc, {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#9fb8cc",
        align: "center",
        wordWrap: { width: 220 },
      }).setOrigin(0.5);

      const curLevel = p.upgrades[b.id] ?? 0;
      const cost = curLevel < 5 ? UPGRADE_COSTS[curLevel] : 0;
      const btnText = curLevel >= 5 ? "TỐI ĐA" : `NÂNG CẤP (${cost} xu)`;

      const buyBtn = new Button(this, 0, 110, 220, 44, btnText, () => this.buyUpgrade(b.id), i === 3 ? 0xff4e3a : 0x18e6ff);
      if (curLevel >= 5 || p.coins < cost) {
        buyBtn.setAlpha(0.6);
      }

      const pips = this.add.container(0, 45);
      for (let s = 0; s < 5; s += 1) {
        const fill = s < curLevel ? (i === 3 ? 0xff4e3a : 0x18e6ff) : 0x1d2b3a;
        pips.add(this.add.rectangle(-60 + s * 30, 0, 22, 12, fill).setOrigin(0.5));
      }

      root.add([bg, icon, name, desc, pips, buyBtn]);
      this.cards.push(root);
      buttons.push(buyBtn);
    });

    const backBtn = new Button(this, 130, 640, 180, 46, "← Quay lại (Esc)", () => this.backToMenu());
    buttons.push(backBtn);

    this.group = new ButtonGroup(this, buttons, true);
    this.group.reset();

    const esc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    esc?.on("down", () => this.backToMenu());
    this.events.once("shutdown", () => esc?.removeAllListeners());
  }

  private buyUpgrade(id: "hp" | "energy" | "cooldown" | "damage") {
    const p = loadProgress();
    const curLevel = p.upgrades[id] ?? 0;
    if (curLevel >= 5) return;
    const cost = UPGRADE_COSTS[curLevel];
    if (p.coins < cost) {
      sfx.warn();
      return;
    }
    p.coins -= cost;
    p.upgrades[id] = curLevel + 1;
    saveProgress(p);
    sfx.confirm();
    if (p.upgrades[id] >= 5) {
      unlockEntry("achievements", "workshop_master");
    }
    this.scene.restart();
  }

  private backToMenu() {
    sfx.select();
    this.scene.start("menu");
  }

  update() {
    this.group.update();
  }
}
