import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/gameConfig";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { bindTouchControls } from "./utils/touchControls";

bindTouchControls();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "gameMount",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#02070d",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: "high-performance",
  },
  scene: [BootScene, MenuScene, GameScene],
});
