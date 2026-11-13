import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/constants";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { AchievementsScene } from "./scenes/menus/AchievementsScene";
import { DifficultyScene } from "./scenes/menus/DifficultyScene";
import { GuideScene } from "./scenes/menus/GuideScene";
import { HeroSelectScene } from "./scenes/menus/HeroSelectScene";
import { RosterScene } from "./scenes/menus/RosterScene";
import { SettingsScene } from "./scenes/menus/SettingsScene";
import { StageSelectScene } from "./scenes/menus/StageSelectScene";
import { StatsScene } from "./scenes/menus/StatsScene";
import { WorkshopScene } from "./scenes/menus/WorkshopScene";
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
  scene: [
    BootScene,
    MenuScene,
    HeroSelectScene,
    StageSelectScene,
    DifficultyScene,
    WorkshopScene,
    RosterScene,
    AchievementsScene,
    StatsScene,
    SettingsScene,
    GuideScene,
    GameScene,
    UIScene,
  ],
});

// Exposed for automated smoke tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
