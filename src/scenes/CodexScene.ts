import Phaser from "phaser";
import { ACHIEVEMENTS } from "../config/achievements";
import { CODEX_ENTRIES } from "../config/codex";
import { FONT, GAME_HEIGHT, GAME_WIDTH, hex } from "../config/constants";
import { loadProgress } from "../systems/progress";
import { sfx } from "../systems/sfx";
import { Button, ButtonGroup, text } from "../ui/widgets";

export class CodexScene extends Phaser.Scene {
  private tab: "codex" | "achievements" = "codex";
  private listContainer!: Phaser.GameObjects.Container;
  private group!: ButtonGroup;

  constructor() {
    super("codex");
  }

  create() {
    const src = this.textures.get("bg_city_neon").getSourceImage();
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_city_neon").setOrigin(0).setTileScale(GAME_HEIGHT / src.height);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.8).setOrigin(0);

    text(this, 60, 40, "SỔ TAY CHIẾN THUẬT & THÀNH TỰU", 36, "#18e6ff", "900");

    const buttons: Button[] = [];
    const codexBtn = new Button(this, 140, 100, 160, 40, "Sổ Tay", () => this.switchTab("codex"), 0x18e6ff);
    const achBtn = new Button(this, 320, 100, 160, 40, "Thành Tựu", () => this.switchTab("achievements"), 0xffe45c);
    const backBtn = new Button(this, GAME_WIDTH - 120, 100, 140, 40, "← Menu", () => this.backToMenu());
    buttons.push(codexBtn, achBtn, backBtn);

    this.listContainer = this.add.container(60, 150);
    this.renderContent();

    this.group = new ButtonGroup(this, buttons, true);
    this.group.reset();
  }

  private switchTab(tab: "codex" | "achievements") {
    this.tab = tab;
    sfx.select();
    this.renderContent();
  }

  private renderContent() {
    this.listContainer.removeAll(true);
    const p = loadProgress();

    if (this.tab === "codex") {
      const entries = CODEX_ENTRIES;
      entries.forEach((e, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = col * 580;
        const y = row * 105;

        const unlocked = p.codex.includes(e.id) || e.category === "hero";
        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 560, 95, 0x0a1a2c, 0.9).setOrigin(0).setStrokeStyle(1.5, unlocked ? 0x18e6ff : 0x3a4b5c, 0.5);

        if (unlocked) {
          const title = text(this, 16, 12, e.name.toUpperCase(), 18, "#ffffff", "900");
          const tag = text(this, 16, 36, e.elementOrRole, 13, "#18e6ff", "700");
          const desc = text(this, 16, 56, e.desc, 13, "#c8dcea", "600");
          const stats = text(this, 540, 14, e.stats, 12, "#ffe45c", "700").setOrigin(1, 0);
          card.add([bg, title, tag, desc, stats]);
        } else {
          const locked = text(this, 280, 45, "🔒 Chưa gặp đối thủ này trong chiến đấu", 16, "#5a6e82", "700").setOrigin(0.5);
          card.add([bg, locked]);
        }
        this.listContainer.add(card);
      });
    } else {
      ACHIEVEMENTS.forEach((a, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = col * 580;
        const y = row * 82;

        const unlocked = p.achievements.includes(a.id);
        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 560, 72, 0x0a1a2c, 0.9).setOrigin(0).setStrokeStyle(1.5, unlocked ? 0xffe45c : 0x2a3b4c, 0.5);

        const icon = text(this, 26, 36, unlocked ? a.icon : "🔒", 26, "#ffffff", "900").setOrigin(0.5);
        const title = text(this, 60, 14, a.title, 18, unlocked ? "#ffe45c" : "#6a7d90", "900");
        const desc = text(this, 60, 40, a.desc, 14, unlocked ? "#c8dcea" : "#4a5b6c", "600");
        const status = text(this, 540, 36, unlocked ? "ĐÃ ĐẠT" : "CHƯA ĐẠT", 13, unlocked ? "#7dffb0" : "#4a5b6c", "800").setOrigin(1, 0.5);

        card.add([bg, icon, title, desc, status]);
        this.listContainer.add(card);
      });
    }
  }

  private backToMenu() {
    sfx.select();
    this.scene.start("menu");
  }

  update() {
    this.group.update();
  }
}
