import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/constants";
import { BootScene } from "./scenes/BootScene";
import { CodexScene } from "./scenes/CodexScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { UIScene } from "./scenes/UIScene";
import { WorkshopScene } from "./scenes/WorkshopScene";
import { TrainingScene } from "./scenes/TrainingScene";
import { bindTouchControls } from "./systems/controls";

bindTouchControls();

const fsBtn = document.getElementById("fullscreenBtn");
if (fsBtn) {
  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "gameMount",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#02070d",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, antialiasGL: true, powerPreference: "high-performance", roundPixels: false },
  input: { activePointers: 4 },
  scene: [BootScene, MenuScene, GameScene, UIScene, WorkshopScene, CodexScene, TrainingScene],
});

// Exposed for automated smoke tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
