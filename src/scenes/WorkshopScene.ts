import Phaser from "phaser";
import { FONT, GAME_HEIGHT, GAME_WIDTH, hex } from "../config/constants";
import { HEROES } from "../config/heroes";
import { loadProgress, saveProgress, unlockEntry } from "../systems/progress";
import { sfx } from "../systems/sfx";
import { Button, ButtonGroup, text } from "../ui/widgets";

type UpgradeBranch = {
  id: "hp" | "energy" | "cooldown";
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
];

const UPGRADE_COSTS = [150, 300, 500, 800, 1200];
const WARDEN_COST = 2500;

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
    text(this, 64, 84, "Nâng cấp chỉ số vĩnh viễn và chế tạo Giáp Hộ Vệ mới", 16, "#9fb8cc", "700");

    const p = loadProgress();
    this.coinText = text(this, GAME_WIDTH - 105, 48, `🪙 ${p.coins} XU`, 28, "#ffe45c", "900").setOrigin(1, 0);

    const buttons: Button[] = [];

    // Render 3 upgrade branches
    BRANCHES.forEach((b, i) => {
      const x = 160 + i * 290;
      const y = 300;
      const root = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, 260, 320, 0x0a1a2c, 0.95).setStrokeStyle(2, 0x18e6ff, 0.4);
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

      const buyBtn = new Button(this, 0, 110, 220, 44, btnText, () => this.buyUpgrade(b.id), 0x18e6ff);
      if (curLevel >= 5 || p.coins < cost) {
        buyBtn.setAlpha(0.6);
      }

      const pips = this.add.container(0, 45);
      for (let s = 0; s < 5; s += 1) {
        const fill = s < curLevel ? 0x18e6ff : 0x1d2b3a;
        pips.add(this.add.rectangle(-60 + s * 30, 0, 22, 12, fill).setOrigin(0.5));
      }

      root.add([bg, icon, name, desc, pips, buyBtn]);
      this.cards.push(root);
      buttons.push(buyBtn);
    });

    // 4th Card: Unlock Obsidian Warden
    const wx = 160 + 3 * 290;
    const wy = 300;
    const wRoot = this.add.container(wx, wy);
    const wBg = this.add.rectangle(0, 0, 260, 320, 0x0a1a2c, 0.95).setStrokeStyle(2, 0xcca052, 0.6);
    const wIcon = this.add.image(0, -90, "obsidian_warden_art");
    wIcon.setScale(86 / Math.max(wIcon.width, wIcon.height));
    const wName = text(this, 0, -45, "Obsidian Warden", 20, "#cca052", "900").setOrigin(0.5);
    const wDesc = this.add.text(0, -5, "Hộ Vệ Đất & Khiên\nTạo tường chắn & phản đòn siêu hạng", {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#c8dcea",
      align: "center",
      wordWrap: { width: 220 },
    }).setOrigin(0.5);

    const isUnlocked = p.unlocks.includes("obsidian_warden");
    const wBtnText = isUnlocked ? "ĐÃ MỞ KHÓA" : `MỞ KHÓA (${WARDEN_COST} xu)`;
    const wBtn = new Button(this, 0, 110, 220, 44, wBtnText, () => this.unlockWarden(), 0xcca052);
    if (isUnlocked || p.coins < WARDEN_COST) {
      wBtn.setAlpha(0.6);
    }
    wRoot.add([wBg, wIcon, wName, wDesc, wBtn]);
    this.cards.push(wRoot);
    buttons.push(wBtn);

    const backBtn = new Button(this, 130, 640, 180, 46, "← Quay lại (Esc)", () => this.backToMenu());
    buttons.push(backBtn);

    this.group = new ButtonGroup(this, buttons, true);
    this.group.reset();

    const esc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    esc?.on("down", () => this.backToMenu());
    this.events.once("shutdown", () => esc?.removeAllListeners());
  }

  private buyUpgrade(id: "hp" | "energy" | "cooldown") {
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

  private unlockWarden() {
    const p = loadProgress();
    if (p.unlocks.includes("obsidian_warden")) return;
    if (p.coins < WARDEN_COST) {
      sfx.warn();
      return;
    }
    p.coins -= WARDEN_COST;
    p.unlocks.push("obsidian_warden");
    saveProgress(p);
    sfx.confirm();
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
