import Phaser from "phaser";
import { ACHIEVEMENTS } from "../config/achievements";
import { CODEX_ENTRIES } from "../config/codex";
import { FONT, GAME_HEIGHT, GAME_WIDTH, hex } from "../config/constants";
import { ARMOR_CORES, RARITY_COLORS } from "../systems/armorCores";
import { loadProgress } from "../systems/progress";
import { sfx } from "../systems/sfx";
import { Button, ButtonGroup, text } from "../ui/widgets";

type TabType = "codex" | "cores" | "reactions" | "achievements";

export class CodexScene extends Phaser.Scene {
  private tab: TabType = "codex";
  private listContainer!: Phaser.GameObjects.Container;
  private group!: ButtonGroup;
  private tabButtons: Button[] = [];
  private scrollY = 0;
  private maxScroll = 0;
  private scrollTrack!: Phaser.GameObjects.Rectangle;
  private scrollThumb!: Phaser.GameObjects.Rectangle;
  private scrollKeys!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; w: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; esc: Phaser.Input.Keyboard.Key };
  private readonly viewTop = 140;
  private readonly viewHeight = 540;

  constructor() {
    super("codex");
  }

  create() {
    this.scrollY = 0;
    this.maxScroll = 0;
    this.cameras.main.fadeIn(180, 2, 7, 13);
    const src = this.textures.get("bg_city_neon").getSourceImage();
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_city_neon").setOrigin(0).setTileScale(GAME_HEIGHT / src.height);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.85).setOrigin(0);

    text(this, 60, 36, "SỔ TAY CHIẾN THUẬT & THÀNH TỰU V2.0", 32, "#18e6ff", "900");

    const buttons: Button[] = [];
    const b1 = new Button(this, 125, 95, 130, 38, "Sổ Tay", () => this.switchTab("codex"), 0x18e6ff);
    const b2 = new Button(this, 265, 95, 130, 38, "Lõi Giáp", () => this.switchTab("cores"), 0xd946ef);
    const b3 = new Button(this, 405, 95, 130, 38, "Nguyên Tố", () => this.switchTab("reactions"), 0x37ffb0);
    const b4 = new Button(this, 545, 95, 130, 38, "Thành Tựu", () => this.switchTab("achievements"), 0xffe45c);
    const backBtn = new Button(this, GAME_WIDTH - 100, 95, 120, 38, "← Menu", () => this.backToMenu());

    this.tabButtons = [b1, b2, b3, b4];
    buttons.push(b1, b2, b3, b4, backBtn);

    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff).fillRect(40, this.viewTop - 4, GAME_WIDTH - 80, this.viewHeight + 8);
    this.listContainer = this.add.container(60, this.viewTop);
    this.listContainer.setMask(maskShape.createGeometryMask());

    this.scrollTrack = this.add.rectangle(GAME_WIDTH - 24, this.viewTop + this.viewHeight / 2, 6, this.viewHeight, 0x1d2b3a, 0.7).setVisible(false);
    this.scrollThumb = this.add.rectangle(GAME_WIDTH - 24, this.viewTop, 6, 80, 0x18e6ff, 0.9).setOrigin(0.5, 0).setVisible(false);
    text(this, GAME_WIDTH / 2, GAME_HEIGHT - 18, "Cuộn chuột hoặc ↑/↓ để xem thêm · Esc quay lại Menu", 13, "#7f95a8", "700").setOrigin(0.5);

    this.renderContent();

    this.group = new ButtonGroup(this, buttons, true);
    this.group.reset();

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.scrollKeys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, w: K.W, s: K.S, esc: K.ESC,
    }) as typeof this.scrollKeys;
    this.scrollKeys.esc.on("down", () => this.backToMenu());

    const onWheel = (_ptr: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
      this.scrollBy(dy * 0.6);
    };
    this.input.on("wheel", onWheel);
    this.events.once("shutdown", () => {
      this.input.off("wheel", onWheel);
      this.scrollKeys.esc.removeAllListeners();
      maskShape.destroy();
    });
  }

  private scrollBy(delta: number) {
    if (this.maxScroll <= 0) return;
    this.scrollY = Phaser.Math.Clamp(this.scrollY + delta, 0, this.maxScroll);
    this.listContainer.y = this.viewTop - this.scrollY;
    const ratio = this.scrollY / this.maxScroll;
    const travel = this.viewHeight - this.scrollThumb.height;
    this.scrollThumb.y = this.viewTop + travel * ratio;
  }

  private switchTab(tab: TabType) {
    this.tab = tab;
    const idx = (["codex", "cores", "reactions", "achievements"] as const).indexOf(tab);
    if (idx >= 0) this.group?.select(idx);
    sfx.select();
    this.renderContent();
  }

  private renderContent() {
    this.listContainer.removeAll(true);
    this.scrollY = 0;
    this.listContainer.y = this.viewTop;
    let contentHeight = 0;
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
      contentHeight = Math.max(0, Math.ceil(entries.length / 2) - 1) * 105 + 95;
    } else if (this.tab === "cores") {
      ARMOR_CORES.forEach((c, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = col * 385;
        const y = row * 88;
        const rColor = RARITY_COLORS[c.rarity];

        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 370, 78, 0x081524, 0.92).setOrigin(0).setStrokeStyle(1.5, rColor.main, 0.6);
        const icon = text(this, 22, 24, c.icon, 20, "#ffffff", "900").setOrigin(0.5);
        const name = text(this, 44, 12, c.name, 15, "#ffffff", "900");
        const rarity = text(this, 355, 12, `[${c.rarity.toUpperCase()}]`, 11, hex(rColor.main), "800").setOrigin(1, 0);
        const tags = text(this, 44, 32, `Hệ: ${c.tags.join(" • ")}`, 12, "#7dffb0", "700");
        const desc = this.add.text(44, 50, c.desc, {
          fontFamily: FONT,
          fontSize: "11px",
          color: "#c8dcea",
          wordWrap: { width: 310 },
        });

        card.add([bg, icon, name, rarity, tags, desc]);
        this.listContainer.add(card);
      });
      contentHeight = Math.max(0, Math.ceil(ARMOR_CORES.length / 3) - 1) * 88 + 78;
    } else if (this.tab === "reactions") {
      const reactions = [
        {
          name: "QUÁ TẢI (OVERLOAD)",
          elements: "Hỏa (Pyro) + Lôi (Electro)",
          effect: "Tạo vụ nổ năng lượng diện rộng bán kính 140px gây 70 sát thương cực lớn và hất văng đối thủ.",
          color: 0xff6a1a,
          icon: "💥",
        },
        {
          name: "SIÊU DẪN (SUPERCONDUCT)",
          elements: "Băng (Cryo) + Lôi (Electro)",
          effect: "Phát nổ xung điện diện rộng gây 50 sát thương và làm chậm 50% tốc độ di chuyển của toàn bộ kẻ địch trong 6 giây.",
          color: 0x9fe8ff,
          icon: "⚡",
        },
        {
          name: "TAN CHẢY (MELT)",
          elements: "Hỏa (Pyro) + Băng (Cryo)",
          effect: "Kích hoạt bộc phá nguyên tố gây 95 sát thương cực đại (x2 sát thương phản ứng bộc phá).",
          color: 0xffe45c,
          icon: "🔥",
        },
        {
          name: "KẾT TINH (CRYSTALLIZE)",
          elements: "Nham (Geo) + Hỏa / Băng / Lôi",
          effect: "Gây 140 sát thương Posture làm tụt thanh Phá Giáp cực nhanh, tạo mảnh pha lê hấp thu năng lượng (+15 Energy).",
          color: 0xcca052,
          icon: "💎",
        },
      ];

      reactions.forEach((r, i) => {
        const x = 0;
        const y = i * 125;
        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 1160, 110, 0x081524, 0.92).setOrigin(0).setStrokeStyle(2, r.color, 0.6);
        const icon = text(this, 40, 55, r.icon, 36, "#ffffff", "900").setOrigin(0.5);
        const title = text(this, 85, 18, r.name, 22, hex(r.color), "900");
        const formula = text(this, 85, 46, `Nguyên tố kích hoạt: ${r.elements}`, 15, "#ffffff", "800");
        const desc = text(this, 85, 74, `Hiệu ứng: ${r.effect}`, 14, "#c8dcea", "600");

        card.add([bg, icon, title, formula, desc]);
        this.listContainer.add(card);
      });
      contentHeight = Math.max(0, reactions.length - 1) * 125 + 110;
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
      contentHeight = Math.max(0, Math.ceil(ACHIEVEMENTS.length / 2) - 1) * 82 + 72;
    }

    this.maxScroll = Math.max(0, contentHeight - this.viewHeight);
    const showBar = this.maxScroll > 0;
    this.scrollTrack.setVisible(showBar);
    this.scrollThumb.setVisible(showBar);
    if (showBar) {
      this.scrollThumb.height = Math.max(40, Math.round((this.viewHeight / contentHeight) * this.viewHeight));
      this.scrollThumb.y = this.viewTop;
    }
  }

  private backToMenu() {
    sfx.select();
    this.scene.start("menu");
  }

  update(_t: number, dms: number) {
    this.group.update();
    if (this.scrollKeys.up.isDown || this.scrollKeys.w.isDown) this.scrollBy(-dms * 0.45);
    if (this.scrollKeys.down.isDown || this.scrollKeys.s.isDown) this.scrollBy(dms * 0.45);
  }
}
