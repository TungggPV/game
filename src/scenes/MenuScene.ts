import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import { GAME_HEIGHT, GAME_WIDTH, GameMode, GameOverPayload } from "../config/gameConfig";
import { DEFAULT_HERO_ID, HEROES, getHeroById, heroDynamicKey, heroPortraitKey } from "../config/heroes";
import { padScore } from "../utils/geometry";

type HeroCard = {
  bg: Phaser.GameObjects.Rectangle;
  portrait: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
};

type ModeButton = {
  mode: GameMode;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
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
  private dynamicArt!: Phaser.GameObjects.Image;
  private resultText!: Phaser.GameObjects.Text;
  private missingText!: Phaser.GameObjects.Text;
  private selectorKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey?: Phaser.Input.Keyboard.Key;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private background?: Phaser.GameObjects.TileSprite;
  private result?: GameOverPayload;

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
    this.createBackground();
    this.createChrome();
    this.createHeroSelector();
    this.createButtons();
    this.createKeys();
    this.refreshSelection();
    this.refreshModeButtons();
  }

  update() {
    if (this.background) this.background.tilePositionX += 0.08;
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
    this.pkHintText = this.add
      .text(82, 260, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffd66d",
        stroke: "#02070d",
        strokeThickness: 4,
      })
      .setShadow(0, 0, "#ffd66d", 5, true, true);

    this.add.text(82, 286, "P1: A/D move  W/Space jump  J basic  K/L skills  U/I ultimate  Shift/F dash  P/Esc pause", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "700",
      color: "#bfefff",
      stroke: "#02070d",
      strokeThickness: 3,
    });
    this.add.text(82, 306, "P2: Arrows move/jump  N1 basic  N2/N3 skills  N4 ultimate  Right Shift/N0 dash", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "700",
      color: "#bfefff",
      stroke: "#02070d",
      strokeThickness: 3,
    });

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
    const y = 370;
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
        this.selectedHeroIndex = i;
        this.refreshSelection();
      });
      this.heroCards.push({ bg, portrait, label });
    }
  }

  private createButtons() {
    this.modeButtons.push(this.createModeButton(82, 498, 126, 42, "1 Nguoi", "solo"));
    this.modeButtons.push(this.createModeButton(222, 498, 142, 42, "2P Co-op", "coop"));
    this.modeButtons.push(this.createModeButton(380, 498, 126, 42, "PK Mode", "pk"));
    this.createButton(82, 560, 154, 48, "Bat dau", () => this.startGame());
    this.createButton(252, 560, 154, 48, "Choi lai", () => this.startGame(), Boolean(this.result));
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
      this.selectedMode = mode;
      if (mode === "pk") console.info("[PK] PK mode selected");
      this.refreshSelection();
      this.refreshModeButtons();
    };
    hit
      .on("pointerover", () => bg.setStrokeStyle(2, 0x8cf8ff, 1))
      .on("pointerout", () => {
        bg.setScale(1);
        this.refreshModeButtons();
      })
      .on("pointerdown", () => bg.setScale(0.98))
      .on("pointerup", () => {
        bg.setScale(1);
        selectMode();
      });
    return { mode, bg, text };
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void, enabled = true) {
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
    if (!enabled) return;
    const hit = this.add.zone(x, y, width, height).setOrigin(0).setDepth(22).setInteractive({ useHandCursor: true });
    hit
      .on("pointerover", () => {
        glow.setVisible(true);
        bg.setFillStyle(0x0b2a46, 1).setStrokeStyle(2, 0x8cf8ff, 1);
        text.setShadow(0, 0, "#8cf8ff", 8, true, true);
      })
      .on("pointerout", () => {
        glow.setVisible(false);
        bg.setFillStyle(0x071a2c, 0.92).setStrokeStyle(1, 0x8cf8ff, 0.78);
        text.setShadow(0, 0, "#000000", 0, false, false);
        bg.setScale(1);
        text.setScale(1);
      })
      .on("pointerdown", () => {
        bg.setScale(0.985);
        text.setScale(0.985);
      })
      .on("pointerup", () => {
        bg.setScale(1);
        text.setScale(1);
        onClick();
      });
  }

  private changeHero(delta: number) {
    this.selectedHeroIndex = Phaser.Math.Wrap(this.selectedHeroIndex + delta, 0, HEROES.length);
    this.refreshSelection();
  }

  private refreshSelection() {
    const hero = HEROES[this.selectedHeroIndex];
    const p2Hero = HEROES[(this.selectedHeroIndex + 1) % HEROES.length];
    this.heroName.setText(hero.displayName.toUpperCase());
    this.heroName.setColor(hero.themeCss);
    this.pkHintText
      .setVisible(this.selectedMode === "pk")
      .setText(this.selectedMode === "pk" ? `PK P2: ${p2Hero.displayName.toUpperCase()}` : "");
    const dynamicKey = heroDynamicKey(hero);
    if (this.textures.exists(dynamicKey)) this.dynamicArt.setTexture(dynamicKey).setDisplaySize(430, 430).setVisible(true);
    else this.dynamicArt.setVisible(false);
    for (let i = 0; i < this.heroCards.length; i++) {
      const card = this.heroCards[i];
      const cardHero = HEROES[i];
      const selected = i === this.selectedHeroIndex;
      card.bg
        .setFillStyle(selected ? cardHero.themeColor : 0x061727, selected ? 0.28 : 0.86)
        .setStrokeStyle(selected ? 3 : 1, selected ? cardHero.themeColor : 0x18e6ff, selected ? 0.95 : 0.26);
      card.portrait.setDisplaySize(selected ? 72 : 64, selected ? 72 : 64).setAlpha(selected ? 1 : 0.72);
      card.label.setColor(selected ? cardHero.themeCss : "#d8fbff");
    }
  }

  private refreshModeButtons() {
    for (const button of this.modeButtons) {
      const selected = button.mode === this.selectedMode;
      button.bg
        .setFillStyle(selected ? 0x18e6ff : 0x071a2c, selected ? 0.94 : 0.92)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xf6c65a : 0x8cf8ff, selected ? 0.95 : 0.78);
      button.text.setColor(selected ? "#02101e" : "#eaf8ff");
    }
  }

  private startGame() {
    const selected = getHeroById(HEROES[this.selectedHeroIndex].id);
    const p2Hero = HEROES[(this.selectedHeroIndex + 1) % HEROES.length];
    this.scene.start("GameScene", {
      mode: this.selectedMode,
      heroId: selected.id,
      p1HeroId: selected.id,
      p2HeroId: p2Hero.id,
      playerCount: this.selectedMode === "solo" ? 1 : 2,
    });
  }
}
