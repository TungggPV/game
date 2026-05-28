import Phaser from "phaser";
import { AssetKeys, basicAttackCardKey, skillCardKey, skillIconKey as menuSkillIconKey, skillReferenceKey, skillSheetKey } from "../config/assets";
import { GAME_HEIGHT, GAME_WIDTH, GameMode, GameOverPayload } from "../config/gameConfig";
import { DEFAULT_HERO_ID, HEROES, getHeroById, heroDynamicKey, heroPortraitKey } from "../config/heroes";
import { getSkillsForHero } from "../config/skills";
import { padScore } from "../utils/geometry";

type HeroCard = {
  bg: Phaser.GameObjects.Rectangle;
  portrait: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
};

type ModeButton = {
  mode: GameMode;
  hit: Phaser.GameObjects.Zone;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type MenuButton = {
  hit?: Phaser.GameObjects.Zone;
  skin?: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Rectangle;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type SkillPreviewSlot = {
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  keyText: Phaser.GameObjects.Text;
};

type MenuData = {
  result?: GameOverPayload;
  heroId?: string;
  p1HeroId?: string;
  p2HeroId?: string;
  mode?: GameMode;
  playerCount?: 1 | 2;
};

export class MenuScene extends Phaser.Scene {
  private selectedHeroIndex = 0;
  private selectedMode: GameMode = "solo";
  private heroCards: HeroCard[] = [];
  private modeButtons: ModeButton[] = [];
  private heroName!: Phaser.GameObjects.Text;
  private pkHintText!: Phaser.GameObjects.Text;
  private elementText!: Phaser.GameObjects.Text;
  private dynamicArt!: Phaser.GameObjects.Image;
  private resultText!: Phaser.GameObjects.Text;
  private missingText!: Phaser.GameObjects.Text;
  private selectorKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey?: Phaser.Input.Keyboard.Key;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private background?: Phaser.GameObjects.TileSprite;
  private result?: GameOverPayload;
  private buttons: MenuButton[] = [];
  private skillPreviewSlots: SkillPreviewSlot[] = [];
  private popup?: Phaser.GameObjects.Container;
  private isShuttingDown = false;

  constructor() {
    super("MenuScene");
  }

  init(data: MenuData) {
    const defaultId = data.p1HeroId ?? data.heroId ?? data.result?.p1HeroId ?? data.result?.heroId ?? DEFAULT_HERO_ID;
    this.selectedHeroIndex = Math.max(0, HEROES.findIndex((hero) => hero.id === defaultId));
    this.selectedMode = data.mode ?? data.result?.mode ?? (data.playerCount === 2 || data.result?.playerCount === 2 ? "coop" : "solo");
    this.result = data.result;
  }

  create() {
    this.resetMenuUiRefs();
    this.isShuttingDown = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupMenu, this);
    this.createBackground();
    this.createChrome();
    this.createHeroSelector();
    this.createButtons();
    this.createKeys();
    this.refreshSelection();
    this.refreshModeButtons();
  }

  update() {
    if (this.isShuttingDown) return;
    if (isAlive(this.background)) this.background.tilePositionX += 0.08;
    if (this.startKey && Phaser.Input.Keyboard.JustDown(this.startKey)) this.startGame();
    if (this.leftKey && Phaser.Input.Keyboard.JustDown(this.leftKey)) this.changeHero(-1);
    if (this.rightKey && Phaser.Input.Keyboard.JustDown(this.rightKey)) this.changeHero(1);
    for (let i = 0; i < this.selectorKeys.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.selectorKeys[i]) && HEROES[i]) {
        this.selectedHeroIndex = i;
        this.refreshSelection();
      }
    }
  }

  private createBackground() {
    this.cameras.main.setBackgroundColor("#02070d");
    this.background = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, AssetKeys.backgroundCity)
      .setOrigin(0)
      .setTileScale(2.49)
      .setDepth(-20);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.48).setOrigin(0).setDepth(-10);
    this.add.rectangle(0, GAME_HEIGHT - 118, GAME_WIDTH, 118, 0x02070d, 0.36).setOrigin(0).setDepth(-9);
  }

  private createChrome() {
    const panel = this.add.graphics();
    panel.fillStyle(0x020d1e, 0.78);
    panel.fillRoundedRect(52, 56, 536, 590, 8);
    panel.lineStyle(1, 0x18e6ff, 0.34);
    panel.strokeRoundedRect(52, 56, 536, 590, 8);
    panel.lineStyle(2, 0xf6c65a, 0.68);
    panel.lineBetween(82, 172, 546, 172);

    this.add
      .text(82, 82, "ELEMENT ARMOR", {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        fontStyle: "900",
        color: "#18e6ff",
        stroke: "#02070d",
        strokeThickness: 4,
      })
      .setShadow(0, 0, "#18e6ff", 8, true, true);
    this.add
      .text(80, 108, "Hao Quang Giap", {
        fontFamily: "Arial, sans-serif",
        fontSize: "42px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 6,
      })
      .setShadow(0, 0, "#18e6ff", 10, true, true);

    this.resultText = this.add.text(82, 188, this.result ? `${this.result.title}  SCORE ${padScore(this.result.score)}` : "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "900",
      color: "#ffd66d",
      stroke: "#02070d",
      strokeThickness: 4,
    });

    this.heroName = this.add
      .text(82, 230, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "25px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 5,
      })
      .setShadow(0, 0, "#18e6ff", 8, true, true);
    this.elementText = this.add
      .text(82, 262, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffd66d",
        stroke: "#02070d",
        strokeThickness: 4,
      })
      .setShadow(0, 0, "#ffd66d", 5, true, true);
    this.pkHintText = this.add
      .text(82, 282, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffd66d",
        stroke: "#02070d",
        strokeThickness: 4,
      })
      .setShadow(0, 0, "#ffd66d", 5, true, true);

    this.add.text(82, 302, "CONTROL: J Basic  K/L Skill  U Ultimate  Shift/F Dash  P Pause", {
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      fontStyle: "900",
      color: "#dffcff",
      stroke: "#02070d",
      strokeThickness: 3,
    }).setShadow(0, 0, "#18e6ff", 4, true, true);
    this.createSkillPreviewSlots();

    const initialHero = HEROES[this.selectedHeroIndex];
    this.dynamicArt = this.add
      .image(930, 646, heroDynamicKey(initialHero))
      .setOrigin(0.5, 1)
      .setDisplaySize(430, 430)
      .setDepth(10);

    this.missingText = this.add.text(82, 618, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      color: "#ffb4aa",
      wordWrap: { width: 456 },
    });
    const missing = (this.registry.get("missingAssets") as string[] | undefined) ?? [];
    if (missing.length > 0) this.missingText.setText(`Missing asset fallback used: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "..." : ""}`);
  }

  private createHeroSelector() {
    const startX = 92;
    const y = 420;
    for (let i = 0; i < HEROES.length; i++) {
      const hero = HEROES[i];
      const x = startX + i * 112;
      const bg = this.add
        .rectangle(x, y, 92, 112, 0x061727, 0.86)
        .setStrokeStyle(1, 0x18e6ff, 0.26)
        .setInteractive({ useHandCursor: true });
      const portrait = this.add.image(x, y - 14, heroPortraitKey(hero)).setDisplaySize(64, 64);
      const label = this.add
        .text(x, y + 44, hero.displayName.split(" ")[0].toUpperCase(), {
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "900",
          color: "#d8fbff",
          align: "center",
        })
        .setOrigin(0.5);
      bg.on("pointerdown", () => {
        if (!this.isMenuInteractive()) return;
        this.selectedHeroIndex = i;
        this.refreshSelection();
      });
      this.heroCards.push({ bg, portrait, label });
    }
  }

  private createSkillPreviewSlots() {
    const labels = ["K", "L", "U"];
    for (let i = 0; i < labels.length; i++) {
      const x = 118 + i * 142;
      const icon = this.add
        .image(x, 350, AssetKeys.slash1)
        .setDisplaySize(42, 42)
        .setDepth(18)
        .setInteractive({ useHandCursor: true });
      const keyText = this.add
        .text(x - 34, 335, labels[i], {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          fontStyle: "900",
          color: "#02070d",
          backgroundColor: "#18e6ff",
          padding: { x: 5, y: 1 },
        })
        .setDepth(19);
      const label = this.add
        .text(x + 34, 350, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "900",
          color: "#dffcff",
          stroke: "#02070d",
          strokeThickness: 3,
          wordWrap: { width: 82 },
        })
        .setOrigin(0, 0.5)
        .setDepth(19);
      icon.on("pointerover", () => this.showSkillCardHover(i));
      icon.on("pointerout", () => this.destroyPopup());
      this.skillPreviewSlots.push({ icon, label, keyText });
    }
  }

  private createButtons() {
    this.modeButtons.push(this.createModeButton(82, 498, 126, 42, "1 Nguoi", "solo"));
    this.modeButtons.push(this.createModeButton(222, 498, 142, 42, "2P Co-op", "coop"));
    this.modeButtons.push(this.createModeButton(380, 498, 126, 42, "PK Mode", "pk"));
    this.createButton(82, 552, 144, 42, "Bat dau", () => this.startGame(), true, AssetKeys.uiStageSelectButton);
    this.createButton(238, 552, 154, 42, "Ky nang", () => this.openSkillDetails(), true, AssetKeys.uiMenuButtons);
    this.createButton(404, 552, 144, 42, "Huong dan", () => this.openGuide(), true, AssetKeys.uiMenuButtons);
    this.createButton(82, 604, 144, 38, "Gallery", () => this.openGallery(), true, AssetKeys.uiMenuButtons);
    if (this.result) this.createButton(238, 604, 154, 38, "Choi lai", () => this.startGame(), true, AssetKeys.uiStageSelectButton);
  }

  private createKeys() {
    this.selectorKeys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ];
    this.startKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.leftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
  }

  private createModeButton(x: number, y: number, width: number, height: number, label: string, mode: GameMode): ModeButton {
    const hit = this.add.zone(x, y, width, height).setOrigin(0).setDepth(22).setInteractive({ useHandCursor: true });
    const bg = this.add.rectangle(x, y, width, height, 0x071a2c, 0.92).setOrigin(0).setDepth(20).setStrokeStyle(1, 0x8cf8ff, 0.78);
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "900",
      color: "#eaf8ff",
    }).setOrigin(0.5).setDepth(21);
    const selectMode = () => {
      if (!this.isMenuInteractive()) return;
      this.selectedMode = mode;
      if (mode === "pk") console.info("[PK] PK mode selected");
      this.refreshSelection();
      this.refreshModeButtons();
    };
    hit
      .on("pointerover", () => {
        if (!this.isMenuInteractive() || !isAlive(bg)) return;
        bg.setStrokeStyle(2, 0x8cf8ff, 1);
      })
      .on("pointerout", () => {
        if (!this.isMenuInteractive() || !isAlive(bg)) return;
        bg.setScale(1);
        this.refreshModeButtons();
      })
      .on("pointerdown", () => {
        if (!this.isMenuInteractive() || !isAlive(bg)) return;
        bg.setScale(0.98);
      })
      .on("pointerup", () => {
        if (!this.isMenuInteractive() || !isAlive(bg)) return;
        bg.setScale(1);
        selectMode();
      });
    return { mode, hit, bg, text };
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void, enabled = true, skinKey = AssetKeys.uiMenuButtons) {
    const skin = this.textures.exists(skinKey)
      ? this.add
        .image(x + width / 2, y + height / 2, skinKey)
        .setDisplaySize(width + 24, height + 16)
        .setDepth(18)
        .setAlpha(enabled ? 0.95 : 0.28)
      : undefined;
    const glow = this.add
      .rectangle(x, y, width, height, 0x18e6ff, 0.16)
      .setOrigin(0)
      .setDepth(19)
      .setVisible(false);
    const bg = this.add
      .rectangle(x, y, width, height, 0x071a2c, enabled ? 0.92 : 0.42)
      .setOrigin(0)
      .setDepth(20)
      .setStrokeStyle(1, enabled ? 0x8cf8ff : 0x4a6170, enabled ? 0.78 : 0.28);
    const text = this.add
      .text(x + width / 2, y + height / 2, label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "900",
        color: "#eaf8ff",
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAlpha(enabled ? 1 : 0.42);
    if (!enabled) {
      this.buttons.push({ skin, glow, bg, text });
      return;
    }
    const hit = this.add.zone(x, y, width, height).setOrigin(0).setDepth(22).setInteractive({ useHandCursor: true });
    hit
      .on("pointerover", () => {
        if (!this.isMenuInteractive() || !isAlive(glow) || !isAlive(bg) || !isTextAlive(text)) return;
        glow.setVisible(true);
        skin?.setTint(0x8cf8ff).setAlpha(1);
        bg.setFillStyle(0x0b2a46, 1).setStrokeStyle(2, 0x8cf8ff, 1);
        text.setShadow(0, 0, "#8cf8ff", 8, true, true);
      })
      .on("pointerout", () => {
        if (!this.isMenuInteractive() || !isAlive(glow) || !isAlive(bg) || !isTextAlive(text)) return;
        glow.setVisible(false);
        skin?.clearTint().setAlpha(0.95);
        bg.setFillStyle(0x071a2c, 0.92).setStrokeStyle(1, 0x8cf8ff, 0.78);
        text.setShadow(0, 0, "#000000", 0, false, false);
        bg.setScale(1);
        text.setScale(1);
      })
      .on("pointerdown", () => {
        if (!this.isMenuInteractive() || !isAlive(bg) || !isTextAlive(text)) return;
        bg.setScale(0.985);
        text.setScale(0.985);
      })
      .on("pointerup", () => {
        if (!this.isMenuInteractive() || !isAlive(bg) || !isTextAlive(text)) return;
        bg.setScale(1);
        text.setScale(1);
        onClick();
      });
    this.buttons.push({ hit, skin, glow, bg, text });
  }

  private changeHero(delta: number) {
    if (!this.isMenuInteractive()) return;
    this.selectedHeroIndex = Phaser.Math.Wrap(this.selectedHeroIndex + delta, 0, HEROES.length);
    this.refreshSelection();
  }

  private refreshSelection() {
    if (!this.isMenuInteractive()) return;
    const hero = HEROES[this.selectedHeroIndex];
    const p2Hero = HEROES[(this.selectedHeroIndex + 1) % HEROES.length];
    if (isTextAlive(this.heroName)) {
      this.heroName.setText(hero.displayName.toUpperCase());
      this.heroName.setColor(hero.themeCss);
    }
    if (isTextAlive(this.elementText)) this.elementText.setText(`HE: ${this.heroElementLabel(hero.id)}`).setColor(hero.themeCss);
    if (isTextAlive(this.pkHintText)) {
      this.pkHintText
        .setVisible(this.selectedMode === "pk")
        .setText(this.selectedMode === "pk" ? `PK P2: ${p2Hero.displayName.toUpperCase()}` : "");
    }
    const dynamicKey = heroDynamicKey(hero);
    if (isAlive(this.dynamicArt)) {
      if (this.textures.exists(dynamicKey)) {
        const source = this.textures.get(dynamicKey).getSourceImage() as { width?: number; height?: number };
        this.dynamicArt
          .setTexture(dynamicKey)
          .setCrop(0, 0, source.width ?? 1, source.height ?? 1)
          .setDisplaySize(430, 430)
          .setVisible(true);
      } else this.dynamicArt.setVisible(false);
    }
    this.refreshSkillPreview(hero.id);
    for (let i = 0; i < this.heroCards.length; i++) {
      const card = this.heroCards[i];
      const cardHero = HEROES[i];
      const selected = i === this.selectedHeroIndex;
      if (isAlive(card.bg)) {
        card.bg
          .setFillStyle(selected ? cardHero.themeColor : 0x061727, selected ? 0.28 : 0.86)
          .setStrokeStyle(selected ? 3 : 1, selected ? cardHero.themeColor : 0x18e6ff, selected ? 0.95 : 0.26);
      }
      if (isAlive(card.portrait)) card.portrait.setDisplaySize(selected ? 72 : 64, selected ? 72 : 64).setAlpha(selected ? 1 : 0.72);
      if (isTextAlive(card.label)) card.label.setColor(selected ? cardHero.themeCss : "#d8fbff");
    }
  }

  private refreshModeButtons() {
    if (!this.isMenuInteractive()) return;
    for (const button of this.modeButtons) {
      const selected = button.mode === this.selectedMode;
      if (isAlive(button.bg)) {
        button.bg
          .setFillStyle(selected ? 0x18e6ff : 0x071a2c, selected ? 0.94 : 0.92)
          .setStrokeStyle(selected ? 3 : 1, selected ? 0xf6c65a : 0x8cf8ff, selected ? 0.95 : 0.78);
      }
      if (isTextAlive(button.text)) button.text.setColor(selected ? "#02101e" : "#eaf8ff");
    }
  }

  private refreshSkillPreview(heroId: string) {
    const skills = getSkillsForHero(heroId);
    for (let i = 0; i < this.skillPreviewSlots.length; i++) {
      const skill = skills[i];
      const slot = this.skillPreviewSlots[i];
      if (!skill) continue;
      const iconKey = menuSkillIconKey(heroId, skill.input);
      if (isAlive(slot.icon) && this.textures.exists(iconKey)) {
        slot.icon.setTexture(iconKey).setTint(0xffffff).setDisplaySize(42, 42);
      }
      if (isTextAlive(slot.label)) slot.label.setText(skill.name).setColor(skill.themeCss);
      if (isTextAlive(slot.keyText)) slot.keyText.setBackgroundColor(skill.themeCss);
    }
  }

  private showSkillCardHover(index: number) {
    if (!this.isMenuInteractive()) return;
    const hero = HEROES[this.selectedHeroIndex];
    const skill = getSkillsForHero(hero.id)[index];
    if (!skill) return;
    const cardKey = skillCardKey(hero.id, skill.input);
    if (!this.textures.exists(cardKey)) return;
    this.destroyPopup();
    const popup = this.add.container(0, 0).setDepth(9000);
    this.popup = popup;
    popup.add(this.add.rectangle(706, 330, 402, 154, 0x02070d, 0.78).setStrokeStyle(2, skill.effectColor, 0.86));
    popup.add(this.add.image(706, 330, cardKey).setDisplaySize(360, 126));
  }

  private openSkillDetails() {
    if (!this.isMenuInteractive()) return;
    this.destroyPopup();
    const hero = HEROES[this.selectedHeroIndex];
    const popup = this.createPopupShell(0x18e6ff);
    const headerKey = skillSheetKey(hero.id, "hero_header");
    if (this.textures.exists(headerKey)) {
      popup.add(this.add.image(GAME_WIDTH / 2, 102, headerKey).setDisplaySize(360, 180));
    } else {
      popup.add(this.add.text(GAME_WIDTH / 2, 92, hero.displayName.toUpperCase(), this.popupTitleStyle(hero.themeCss)).setOrigin(0.5));
    }

    const cardKeys = [
      basicAttackCardKey(hero.id),
      skillCardKey(hero.id, "skill1"),
      skillCardKey(hero.id, "skill2"),
      skillCardKey(hero.id, "ultimate"),
    ];
    const positions = [
      { x: 364, y: 268 },
      { x: 784, y: 268 },
      { x: 364, y: 438 },
      { x: 784, y: 438 },
    ];
    for (let i = 0; i < cardKeys.length; i++) {
      const key = cardKeys[i];
      const pos = positions[i];
      popup.add(this.add.rectangle(pos.x, pos.y, 390, 142, 0x061727, 0.82).setStrokeStyle(1, hero.themeColor, 0.45));
      if (this.textures.exists(key)) popup.add(this.add.image(pos.x, pos.y, key).setDisplaySize(360, i >= 2 ? 142 : 104));
    }
    this.createPopupButton(popup, GAME_WIDTH / 2 - 66, 570, 132, 42, "Dong", () => this.destroyPopup());
  }

  private openGuide() {
    if (!this.isMenuInteractive()) return;
    this.destroyPopup();
    const popup = this.createPopupShell(0xf6c65a);
    popup.add(this.add.text(GAME_WIDTH / 2, 78, "HUONG DAN CHIEN DAU", this.popupTitleStyle("#ffd66d")).setOrigin(0.5));
    const refs = [
      { key: skillReferenceKey("controls"), x: GAME_WIDTH / 2, y: 170, w: 630, h: 112 },
      { key: skillReferenceKey("status"), x: GAME_WIDTH / 2, y: 292, w: 614, h: 112 },
      { key: skillReferenceKey("status_effects"), x: 388, y: 430, w: 368, h: 102 },
      { key: skillReferenceKey("notes"), x: 766, y: 430, w: 485, h: 93 },
    ];
    for (const ref of refs) {
      if (this.textures.exists(ref.key)) popup.add(this.add.image(ref.x, ref.y, ref.key).setDisplaySize(ref.w, ref.h));
    }
    this.createPopupButton(popup, GAME_WIDTH / 2 - 66, 570, 132, 42, "Dong", () => this.destroyPopup());
  }

  private openGallery() {
    if (!this.isMenuInteractive()) return;
    this.destroyPopup();
    const hero = HEROES[this.selectedHeroIndex];
    const popup = this.createPopupShell(hero.themeColor);
    popup.add(this.add.text(GAME_WIDTH / 2, 64, "CODEX GALLERY", this.popupTitleStyle(hero.themeCss)).setOrigin(0.5));
    const fullSheets = [skillReferenceKey("full_skill_sheet"), skillReferenceKey("full_skill_sheet_v2"), skillReferenceKey("full_skill23_sheet")];
    for (let i = 0; i < fullSheets.length; i++) {
      if (this.textures.exists(fullSheets[i])) popup.add(this.add.image(274 + i * 220, 270, fullSheets[i]).setDisplaySize(196, 132));
    }
    const columnKey = skillSheetKey(hero.id, "skill_column");
    if (this.textures.exists(columnKey)) popup.add(this.add.image(898, 330, columnKey).setDisplaySize(220, 518));
    const enemyKeys = [AssetKeys.crawlerIdle, AssetKeys.skyHunterIdle, AssetKeys.aegisMain, AssetKeys.bossMain];
    for (let i = 0; i < enemyKeys.length; i++) {
      if (this.textures.exists(enemyKeys[i])) popup.add(this.add.image(196 + i * 150, 462, enemyKeys[i]).setDisplaySize(i === 3 ? 132 : 92, i === 3 ? 94 : 72));
    }
    this.createPopupButton(popup, GAME_WIDTH / 2 - 66, 570, 132, 42, "Dong", () => this.destroyPopup());
  }

  private createPopupShell(color: number) {
    const popup = this.add.container(0, 0).setDepth(9000);
    this.popup = popup;
    const block = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.78).setOrigin(0).setInteractive({ useHandCursor: false });
    popup.add(block);
    popup.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 940, 574, 0x061727, 0.97).setStrokeStyle(3, color, 0.86));
    if (this.textures.exists(AssetKeys.uiDialogueBox)) {
      popup.add(this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, AssetKeys.uiDialogueBox).setDisplaySize(940, 420).setAlpha(0.5));
    }
    return popup;
  }

  private createPopupButton(container: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, label: string, onClick: () => void) {
    const bg = this.add
      .rectangle(x, y, width, height, 0x0b2a46, 0.98)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8cf8ff, 0.92)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x + width / 2, y + height / 2, label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "900",
        color: "#eaf8ff",
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => {
      if (isAlive(bg)) bg.setFillStyle(0x12577c, 1);
    });
    bg.on("pointerdown", () => {
      if (!this.isMenuInteractive()) return;
      onClick();
    });
    container.add([bg, text]);
  }

  private destroyPopup() {
    this.popup?.destroy();
    this.popup = undefined;
  }

  private popupTitleStyle(color: string) {
    return {
      fontFamily: "Arial, sans-serif",
      fontSize: "28px",
      fontStyle: "900",
      color,
      stroke: "#02070d",
      strokeThickness: 6,
    };
  }

  private heroElementLabel(heroId: string) {
    if (heroId === "crimson_flare") return "FIRE / BURN";
    if (heroId === "volt_sentinel") return "ELECTRIC / STUN";
    if (heroId === "emerald_phantom") return "WIND / POISON";
    return "PLASMA / BALANCE";
  }

  private startGame() {
    if (!this.isMenuInteractive()) return;
    const selected = getHeroById(HEROES[this.selectedHeroIndex].id);
    const p2Hero = HEROES[(this.selectedHeroIndex + 1) % HEROES.length];
    this.isShuttingDown = true;
    this.destroyPopup();
    this.scene.start("GameScene", {
      mode: this.selectedMode,
      heroId: selected.id,
      p1HeroId: selected.id,
      p2HeroId: p2Hero.id,
      playerCount: this.selectedMode === "solo" ? 1 : 2,
    });
  }

  private isMenuInteractive() {
    return !this.isShuttingDown && this.scene.isActive("MenuScene");
  }

  private resetMenuUiRefs() {
    this.heroCards = [];
    this.modeButtons = [];
    this.buttons = [];
    this.skillPreviewSlots = [];
    this.selectorKeys = [];
    this.startKey = undefined;
    this.leftKey = undefined;
    this.rightKey = undefined;
    this.background = undefined;
  }

  private cleanupMenu() {
    this.isShuttingDown = true;
    this.destroyPopup();
    for (const card of this.heroCards) {
      if (isAlive(card.bg)) card.bg.removeAllListeners();
    }
    for (const slot of this.skillPreviewSlots) {
      if (isAlive(slot.icon)) slot.icon.removeAllListeners();
    }
    for (const button of this.modeButtons) {
      if (isAlive(button.hit)) button.hit.removeAllListeners();
    }
    for (const button of this.buttons) {
      if (button.hit && isAlive(button.hit)) button.hit.removeAllListeners();
    }
    this.resetMenuUiRefs();
  }
}

function isAlive<T extends Phaser.GameObjects.GameObject>(object?: T | null): object is T {
  return Boolean(object?.scene && object.active);
}

function isTextAlive(text?: Phaser.GameObjects.Text | null): text is Phaser.GameObjects.Text {
  return isAlive(text);
}
