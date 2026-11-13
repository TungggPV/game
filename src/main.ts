import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/constants";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { UIScene } from "./scenes/UIScene";
import { bindTouchControls } from "./systems/controls";

bindTouchControls();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "gameMount",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#02070d",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, powerPreference: "high-performance" },
  input: { activePointers: 4 },
  scene: [BootScene, MenuScene, GameScene, UIScene],
});

// Exposed for automated smoke tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
