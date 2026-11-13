import Phaser from "phaser";
import { FONT, GAME_HEIGHT, GAME_WIDTH } from "../config/constants";
import { MANIFEST, spriteUrl } from "../systems/assets";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const bar = this.add.rectangle(GAME_WIDTH / 2 - 240, GAME_HEIGHT / 2, 0, 10, 0x18e6ff).setOrigin(0, 0.5);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 484, 16).setStrokeStyle(2, 0x18e6ff, 0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "ĐANG KHỞI ĐỘNG GIÁP...", { fontFamily: FONT, fontSize: "20px", color: "#9ff8ff", fontStyle: "bold" })
      .setOrigin(0.5);
    this.load.on("progress", (p: number) => (bar.width = 480 * p));

    for (const key of Object.keys(MANIFEST)) this.load.image(key, spriteUrl(key));
  }

  create() {
    this.makeTextures();
    this.scene.start("menu");
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    g.fillStyle(0xffffff).fillCircle(8, 8, 8);
    g.generateTexture("dot", 16, 16).clear();

    // Soft glow: stacked translucent circles approximate a radial gradient.
    for (let r = 32; r > 0; r -= 2) g.fillStyle(0xffffff, 0.05 + (1 - r / 32) * 0.12).fillCircle(32, 32, r);
    g.generateTexture("glow", 64, 64).clear();

    g.lineStyle(6, 0xffffff).strokeCircle(64, 64, 60);
    g.generateTexture("ring", 128, 128).clear();

    g.fillStyle(0xffffff).fillPoints([new Phaser.Math.Vector2(12, 0), new Phaser.Math.Vector2(16, 12), new Phaser.Math.Vector2(12, 24), new Phaser.Math.Vector2(8, 12)], true);
    g.generateTexture("spark", 24, 24).clear();

    g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
    g.generateTexture("px", 4, 4).clear();

    // Floor tile: dark metal plate with seams and rivets, tinted per stage.
    g.fillStyle(0x1a2433).fillRect(0, 0, 160, 110);
    g.fillStyle(0x222f42).fillRect(0, 0, 160, 18);
    g.fillStyle(0x0d141e).fillRect(0, 18, 160, 4).fillRect(158, 0, 2, 110).fillRect(0, 64, 160, 2);
    g.fillStyle(0x2c3b52).fillRect(6, 30, 66, 26).fillRect(84, 30, 66, 26).fillRect(6, 74, 144, 28);
    g.fillStyle(0x3e5068).fillCircle(10, 9, 2).fillCircle(150, 9, 2);
    g.generateTexture("floor", 160, 110).clear();

    g.destroy();
  }
}
