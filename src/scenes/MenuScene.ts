import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import { GAME_HEIGHT, GAME_WIDTH, GameOverPayload } from "../config/gameConfig";
import { DEFAULT_HERO_ID, HEROES, HeroConfig, getHeroById, heroDynamicKey, heroPortraitKey } from "../config/heroes";

type MenuButton = {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  enabled: boolean;
};

type HeroCard = {
  bg: Phaser.GameObjects.Rectangle;
  portrait: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
};

type MenuData = {
  result?: GameOverPayload;
  heroId?: string;
};

export class MenuScene extends Phaser.Scene {
  private selectedHeroIndex = 0;
  private heroCards: HeroCard[] = [];
  private heroName!: Phaser.GameObjects.Text;
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
    const defaultId = data.heroId ?? data.result?.heroId ?? DEFAULT_HERO_ID;
    this.selectedHeroIndex = Math.max(0, HEROES.findIndex((hero) => hero.id === defaultId));
    this.result = data.result;
  }

  create() {
    this.createBackground();
    this.createChrome();
    this.createHeroSelector();
    this.createButtons();
    this.createKeys();
    this.refreshSelection();
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
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.46).setOrigin(0).setDepth(-10);
    this.add.rectangle(0, GAME_HEIGHT - 118, GAME_WIDTH, 118, 0x02070d, 0.36).setOrigin(0).setDepth(-9);
  }

  private createChrome() {
    const panel = this.add.graphics();
    panel.fillStyle(0x020d1e, 0.76);
    panel.fillRoundedRect(52, 56, 512, 590, 8);
    panel.lineStyle(1, 0x18e6ff, 0.34);
    panel.strokeRoundedRect(52, 56, 512, 590, 8);
    panel.lineStyle(2, 0xf6c65a, 0.68);
    panel.lineBetween(82, 172, 522, 172);

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
      .text(80, 108, "Hào Quang Giáp", {
        fontFamily: "Arial, sans-serif",
        fontSize: "42px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 6,
      })
      .setShadow(0, 0, "#18e6ff", 10, true, true);

    this.resultText = this.add.text(82, 188, this.result ? `${this.result.title}  SCORE ${this.result.score}` : "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "900",
      color: "#ffd66d",
      stroke: "#02070d",
      strokeThickness: 4,
    });

    this.heroName = this.add
      .text(82, 232, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "25px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 5,
      })
      .setShadow(0, 0, "#18e6ff", 8, true, true);

    const initialHero = HEROES[this.selectedHeroIndex];
    this.dynamicArt = this.add
      .image(930, 646, heroDynamicKey(initialHero))
      .setOrigin(0.5, 1)
      .setDisplaySize(430, 430)
      .setDepth(10);

    this.missingText = this.add.text(82, 612, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      color: "#ffb4aa",
      wordWrap: { width: 432 },
    });
    const missing = (this.registry.get("missingAssets") as string[] | undefined) ?? [];
    if (missing.length > 0) {
      this.missingText.setText(`Thiếu asset: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "..." : ""}`);
    }
  }

  private createHeroSelector() {
    const startX = 92;
    const y = 330;
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
    this.createButton(82, 468, 126, 42, "1 Người", true, () => undefined, true);
    this.createButton(222, 468, 126, 42, "2 Người", false, () => undefined);
    this.createButton(82, 532, 154, 48, "Bắt đầu", true, () => this.startGame(), true);
    this.createButton(252, 532, 154, 48, "Chơi lại", Boolean(this.result), () => this.startGame());
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

  private createButton(x: number, y: number, width: number, height: number, label: string, enabled: boolean, onClick: () => void, selected = false): MenuButton {
    const bg = this.add
      .rectangle(x, y, width, height, selected ? 0x18e6ff : 0x071a2c, enabled ? 0.92 : 0.42)
      .setOrigin(0)
      .setStrokeStyle(1, enabled ? 0x8cf8ff : 0x4a6170, enabled ? 0.78 : 0.28);
    const text = this.add
      .text(x + width / 2, y + height / 2, label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "900",
        color: selected ? "#02101e" : "#eaf8ff",
      })
      .setOrigin(0.5);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => bg.setFillStyle(selected ? 0x67f6ff : 0x0b2a46, 1));
      bg.on("pointerout", () => bg.setFillStyle(selected ? 0x18e6ff : 0x071a2c, 0.92));
      bg.on("pointerdown", onClick);
      text.setInteractive({ useHandCursor: true });
      text.on("pointerdown", onClick);
    } else {
      text.setAlpha(0.42);
    }
    return { bg, text, enabled };
  }

  private changeHero(delta: number) {
    this.selectedHeroIndex = Phaser.Math.Wrap(this.selectedHeroIndex + delta, 0, HEROES.length);
    this.refreshSelection();
  }

  private refreshSelection() {
    const hero = HEROES[this.selectedHeroIndex];
    this.heroName.setText(hero.displayName.toUpperCase());
    this.heroName.setColor(hero.themeCss);
    const dynamicKey = heroDynamicKey(hero);
    if (this.textures.exists(dynamicKey)) {
      this.dynamicArt.setTexture(dynamicKey).setDisplaySize(430, 430).setVisible(true);
    } else {
      this.dynamicArt.setVisible(false);
    }
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

  private startGame() {
    const selected = getHeroById(HEROES[this.selectedHeroIndex].id);
    this.scene.start("GameScene", { heroId: selected.id });
  }
}
