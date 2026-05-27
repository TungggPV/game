import Phaser from "phaser";
import { DEPTHS, GAME_WIDTH } from "../config/gameConfig";
import { HeroConfig, heroPortraitKey } from "../config/heroes";
import { padScore } from "../utils/geometry";

export type EnemyBarState = {
  name: string;
  hp: number;
  maxHp: number;
};

export class HUD {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly bossGraphics: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly heroName: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bossText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene, hero: HeroConfig) {
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(DEPTHS.hud);
    this.bossGraphics = scene.add.graphics().setScrollFactor(0).setDepth(DEPTHS.hud);
    this.portrait = scene.add
      .image(66, 66, heroPortraitKey(hero))
      .setDisplaySize(70, 70)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 2);
    this.heroName = scene.add
      .text(120, 26, hero.displayName.toUpperCase(), {
        fontFamily: "Arial, sans-serif",
        fontSize: "17px",
        fontStyle: "900",
        color: "#eaf8ff",
        stroke: "#03101d",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 4);
    this.scoreText = scene.add
      .text(GAME_WIDTH - 32, 28, "SCORE 0000", {
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 5,
      })
      .setOrigin(1, 0)
      .setShadow(0, 0, "#18e6ff", 8, true, true)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 4);
    this.bossText = scene.add
      .text(GAME_WIDTH / 2, 17, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffd7d7",
        stroke: "#180204",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 4);
  }

  update(hero: HeroConfig, hp: number, maxHp: number, energy: number, maxEnergy: number, score: number, enemyBar?: EnemyBarState) {
    this.heroName.setText(hero.displayName.toUpperCase());
    const portraitKey = heroPortraitKey(hero);
    if (this.scene.textures.exists(portraitKey) && this.portrait.texture.key !== portraitKey) {
      this.portrait.setTexture(portraitKey).setDisplaySize(70, 70);
    }
    this.scoreText.setText(`SCORE ${padScore(score)}`);

    const healthPct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    const energyPct = Phaser.Math.Clamp(energy / maxEnergy, 0, 1);

    this.graphics.clear();
    this.graphics.fillStyle(0x020812, 0.74);
    this.graphics.fillRoundedRect(24, 20, 366, 92, 8);
    this.graphics.lineStyle(1, 0x18e6ff, 0.34);
    this.graphics.strokeRoundedRect(24, 20, 366, 92, 8);
    this.graphics.fillStyle(0x061727, 0.96);
    this.graphics.fillRoundedRect(31, 31, 70, 70, 7);
    this.graphics.lineStyle(2, hero.themeColor, 0.92);
    this.graphics.strokeRoundedRect(31, 31, 70, 70, 7);
    this.drawBar(120, 56, 236, 16, healthPct, 0x102018, 0x4bf070, 0xaef8bd);
    this.drawBar(120, 82, 204, 12, energyPct, 0x0b1a22, 0x18e6ff, 0xa6fbff);
    this.graphics.lineStyle(1, 0xf6c65a, 0.86);
    this.graphics.lineBetween(120, 102, 358, 102);

    this.bossGraphics.clear();
    if (enemyBar) {
      const pct = Phaser.Math.Clamp(enemyBar.hp / enemyBar.maxHp, 0, 1);
      const x = GAME_WIDTH / 2 - 228;
      this.bossGraphics.fillStyle(0x180406, 0.8);
      this.bossGraphics.fillRoundedRect(x, 36, 456, 24, 8);
      this.bossGraphics.fillStyle(0x9d1728, 0.95);
      this.bossGraphics.fillRoundedRect(x + 4, 40, 448 * pct, 16, 6);
      this.bossGraphics.lineStyle(1, 0xff6d6d, 0.78);
      this.bossGraphics.strokeRoundedRect(x, 36, 456, 24, 8);
      this.bossText.setText(enemyBar.name).setVisible(true);
    } else {
      this.bossText.setVisible(false);
    }
  }

  destroy() {
    this.graphics.destroy();
    this.bossGraphics.destroy();
    this.portrait.destroy();
    this.heroName.destroy();
    this.scoreText.destroy();
    this.bossText.destroy();
  }

  private drawBar(x: number, y: number, width: number, height: number, pct: number, bg: number, fill: number, line: number) {
    this.graphics.fillStyle(bg, 0.88);
    this.graphics.fillRoundedRect(x, y, width, height, 5);
    this.graphics.fillStyle(fill, 0.96);
    this.graphics.fillRoundedRect(x + 3, y + 3, Math.max(0, (width - 6) * pct), height - 6, 4);
    this.graphics.lineStyle(1, line, 0.72);
    this.graphics.strokeRoundedRect(x, y, width, height, 5);
  }
}
