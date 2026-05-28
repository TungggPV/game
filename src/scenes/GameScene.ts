import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import {
  DEPTHS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GameMode,
  PLAYER_START_X,
  PLATFORM_Y,
  PlayerInput,
  WORLD_WIDTH,
} from "../config/gameConfig";
import { HEROES, HeroConfig, getHeroById } from "../config/heroes";
import { BasicAttackConfig, SkillConfig, SkillInput, getBasicAttackForHero, getSkillForHeroInput } from "../config/skills";
import { Enemy, EnemyAction, EnemyKind } from "../entities/Enemy";
import { Player } from "../entities/Player";
import { EnemyBarState, HUD } from "../ui/HUD";
import { RectLike, overlaps } from "../utils/geometry";
import { touchControls } from "../utils/touchControls";

type GameSceneData = {
  mode?: GameMode;
  heroId?: string;
  p1HeroId?: string;
  p2HeroId?: string;
  playerCount?: 1 | 2;
};

type SkillProjectile = {
  image: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  trailTimer: number;
  color: number;
  facing: -1 | 1;
  owner: "player" | "enemy";
  attacker?: Player;
  skill?: SkillConfig;
};

type PickupKind = "health" | "energy" | "credit" | "upgrade" | "treasure";

type Pickup = {
  image: Phaser.GameObjects.Image;
  kind: PickupKind;
  value: number;
  life: number;
  baseY: number;
  phase: number;
};

type ActiveArea = {
  kind: "electric_cage" | "toxic_spiral";
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  tick: number;
  tickRate: number;
  damage: number;
  owner: Player;
  skill: SkillConfig;
  visual: Phaser.GameObjects.Graphics;
};

type WaveConfig = {
  label: string;
  enemies: EnemyKind[];
};

type DebugRect = {
  rect: RectLike;
  color: number;
  life: number;
};

type AtmosphereLayer = {
  layer: Phaser.GameObjects.TileSprite;
  factor: number;
  speed: number;
  drift: number;
};

const OVERLAY_DEPTH = 9000;
const PANEL_DEPTH = 9100;
const BUTTON_DEPTH = 10000;
const PK_ARENA_MIN = 76;
const PK_ARENA_MAX = GAME_WIDTH - 76;
const PK_TIMER_MAX = 99;
const PK_DAMAGE_MULTIPLIER = {
  basic: 0.6,
  skill: 0.65,
  ultimate: 0.55,
};

export class GameScene extends Phaser.Scene {
  private selectedHero!: HeroConfig;
  private p2Hero!: HeroConfig;
  private gameMode: GameMode = "solo";
  private playerCount: 1 | 2 = 1;
  private players: Player[] = [];
  private hud?: HUD;
  private background?: Phaser.GameObjects.TileSprite;
  private readonly atmosphereLayers: AtmosphereLayer[] = [];
  private neonRain?: Phaser.GameObjects.Graphics;
  private enemies: Enemy[] = [];
  private projectiles: SkillProjectile[] = [];
  private pickups: Pickup[] = [];
  private activeAreas: ActiveArea[] = [];
  private defeatedLogged = new Set<Enemy>();
  private enrageLogged = new Set<Enemy>();
  private failLogCooldowns = new Map<string, number>();
  private score = 0;
  private running = true;
  private paused = false;
  private stageClear = false;
  private gameOver = false;
  private matchEnded = false;
  private pkIntroTimer = 0;
  private pkFightShown = false;
  private pkTimer = PK_TIMER_MAX;
  private pkStatusText?: Phaser.GameObjects.Text;
  private hitPauseTimer = 0;
  private messageText?: Phaser.GameObjects.Text;
  private messageTimer = 0;
  private waveIndex = -1;
  private waitingNextWave = false;
  private waveWait = 0;
  private debugHitboxes = false;
  private playtestLogEnabled = false;
  private transitioning = false;
  private readonly logLines: string[] = [];
  private logText?: Phaser.GameObjects.Text;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  private readonly debugRects: DebugRect[] = [];
  private readonly downCodes = new Set<string>();
  private readonly justCodes = new Set<string>();
  private readonly waves: WaveConfig[] = [
    { label: "WAVE 1 / 4", enemies: ["crawler", "crawler"] },
    { label: "WAVE 2 / 4", enemies: ["crawler", "crawler", "sky_hunter"] },
    { label: "WAVE 3 / 4", enemies: ["horned_mutant", "crawler"] },
    { label: "BOSS WAVE / 4", enemies: ["aegis_elite", "abyssal_colossus"] },
  ];
  private pauseOverlay?: Phaser.GameObjects.Container;
  private resultOverlay?: Phaser.GameObjects.Container;
  private readonly pauseOverlayButtons: Phaser.GameObjects.GameObject[] = [];
  private readonly resultOverlayButtons: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData) {
    this.gameMode = data.mode ?? (data.playerCount === 2 ? "coop" : "solo");
    this.selectedHero = getHeroById(data.p1HeroId ?? data.heroId ?? "");
    const selectedIndex = Math.max(0, HEROES.findIndex((hero) => hero.id === this.selectedHero.id));
    const fallbackP2 = HEROES[(selectedIndex + 1) % HEROES.length];
    const requestedP2 = getHeroById(data.p2HeroId ?? fallbackP2.id);
    this.p2Hero = requestedP2.id === this.selectedHero.id ? fallbackP2 : requestedP2;
    this.playerCount = this.gameMode === "solo" ? 1 : 2;
  }

  create() {
    this.resetState();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.createBackground();
    this.drawPlatform();
    this.createKeyTracking();
    this.createPlayers();
    this.hud = new HUD(this, this.players, this.gameMode);
    this.messageText = this.add
      .text(GAME_WIDTH / 2, 142, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "34px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 7);
    this.logText = this.add
      .text(GAME_WIDTH - 24, 78, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        fontStyle: "700",
        color: "#dffcff",
        align: "right",
        stroke: "#02070d",
        strokeThickness: 3,
        wordWrap: { width: 390 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 8)
      .setVisible(false);
    this.debugGraphics = this.add.graphics().setDepth(DEPTHS.hud + 20);
    this.createPkStatusText();
    this.showMessage(this.gameMode === "pk" ? "READY" : this.playerCount === 2 ? "CO-OP ARMOR SYNC" : "ARMOR CORE ONLINE", 1);
    this.addLog("Run start: SCORE 0000");
    if (this.gameMode === "pk") this.startPkMatch();
    else this.startNextWave();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.033, deltaMs / 1000);
    this.handleDebugToggles();
    this.handlePauseToggle();

    if (this.paused) {
      this.updateHudAndMessage(dt);
      this.drawDebug();
      touchControls.clearJust();
      this.justCodes.clear();
      return;
    }

    if (this.hitPauseTimer > 0) {
      this.hitPauseTimer = Math.max(0, this.hitPauseTimer - dt);
      this.updateHudAndMessage(dt);
      this.drawDebug();
      touchControls.clearJust();
      this.justCodes.clear();
      return;
    }

    if (this.running) {
      const controlsLocked = this.gameMode === "pk" && this.pkIntroTimer > 0;
      if (controlsLocked) this.updatePkIntro(dt);

      for (let i = 0; i < this.players.length; i++) {
        const input = controlsLocked ? this.emptyInput() : this.readInput(i);
        if (!controlsLocked) this.processPlayerInput(this.players[i], input);
        this.players[i].update(dt, input);
      }
      if (this.gameMode !== "pk") this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updatePickups(dt);
      this.updateActiveAreas(dt);
      this.resolveBodySpacing();
      if (this.gameMode !== "pk") {
        this.cleanupDeadEnemies();
        this.updateWaveFlow(dt);
      } else if (!controlsLocked) {
        this.updatePkTimer(dt);
      }
      this.updateCamera(dt);
      if (this.gameMode === "pk") this.checkPkEnd();
      else this.checkGameOver();
    }

    this.updateHudAndMessage(dt);
    this.drawDebug();
    touchControls.clearJust();
    this.justCodes.clear();
  }

  private resetState() {
    this.running = true;
    this.paused = false;
    this.stageClear = false;
    this.gameOver = false;
    this.matchEnded = false;
    this.transitioning = false;
    this.pkIntroTimer = 0;
    this.pkFightShown = false;
    this.pkTimer = PK_TIMER_MAX;
    this.hitPauseTimer = 0;
    this.score = 0;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.activeAreas = [];
    this.defeatedLogged = new Set();
    this.enrageLogged = new Set();
    this.failLogCooldowns = new Map();
    this.players = [];
    this.waveIndex = -1;
    this.waitingNextWave = false;
    this.waveWait = 0;
    this.debugRects.length = 0;
    this.logLines.length = 0;
    this.pauseOverlay = undefined;
    this.resultOverlay = undefined;
    this.pkStatusText = undefined;
    this.atmosphereLayers.length = 0;
    this.neonRain = undefined;
    this.pauseOverlayButtons.length = 0;
    this.resultOverlayButtons.length = 0;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
  }

  private createPlayers() {
    if (this.gameMode === "pk") {
      const p1 = new Player(this, 0, this.selectedHero, GAME_WIDTH / 2 - 220, PLATFORM_Y, {
        maxHp: 360,
        maxEnergy: 120,
        energyRegen: 5,
        initialUltimateCooldown: 4,
      });
      const p2 = new Player(this, 1, this.p2Hero, GAME_WIDTH / 2 + 220, PLATFORM_Y, {
        maxHp: 360,
        maxEnergy: 120,
        energyRegen: 5,
        initialUltimateCooldown: 4,
      });
      p1.energy = 80;
      p2.energy = 80;
      p1.setFacing(1);
      p2.setFacing(-1);
      p1.setHorizontalBounds(PK_ARENA_MIN, PK_ARENA_MAX);
      p2.setHorizontalBounds(PK_ARENA_MIN, PK_ARENA_MAX);
      this.players.push(p1, p2);
      return;
    }

    this.players.push(new Player(this, 0, this.selectedHero, PLAYER_START_X));
    if (this.playerCount === 2) {
      this.players.push(new Player(this, 1, this.p2Hero, PLAYER_START_X + 130));
    }
  }

  private createBackground() {
    this.cameras.main.setBackgroundColor("#02070d");
    this.background = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, AssetKeys.backgroundCity)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(2.38)
      .setDepth(DEPTHS.background);
    this.background.setTint(0xe6fbff);
    this.createAtmosphereLayers();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.08).setOrigin(0).setScrollFactor(0).setDepth(DEPTHS.background + 5);
  }

  private createAtmosphereLayers() {
    const addLayer = (scale: number, alpha: number, tint: number, factor: number, speed: number, drift: number, depth: number) => {
      const layer = this.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, AssetKeys.backgroundCity)
        .setOrigin(0)
        .setScrollFactor(0)
        .setTileScale(scale)
        .setDepth(depth)
        .setTint(tint)
        .setAlpha(alpha)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.atmosphereLayers.push({ layer, factor, speed, drift });
    };

    addLayer(2.95, 0.18, 0x18e6ff, 0.08, 3.2, 0.16, DEPTHS.background + 1);
    addLayer(3.6, 0.1, 0xff4fff, 0.045, -1.4, 0.1, DEPTHS.background + 2);
    addLayer(2.2, 0.11, 0xf6c65a, 0.14, 1.1, 0.08, DEPTHS.background + 3);

    const haze = this.add.graphics().setScrollFactor(0).setDepth(DEPTHS.background + 4).setBlendMode(Phaser.BlendModes.ADD);
    haze.fillStyle(0x18e6ff, 0.06);
    haze.fillEllipse(GAME_WIDTH * 0.24, GAME_HEIGHT * 0.36, 540, 220);
    haze.fillStyle(0xff4fff, 0.045);
    haze.fillEllipse(GAME_WIDTH * 0.72, GAME_HEIGHT * 0.28, 430, 180);
    haze.fillStyle(0xf6c65a, 0.045);
    haze.fillEllipse(GAME_WIDTH * 0.58, GAME_HEIGHT * 0.72, 620, 90);

    this.neonRain = this.add.graphics().setScrollFactor(0).setDepth(DEPTHS.background + 6).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 58; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const length = Phaser.Math.Between(16, 44);
      const color = i % 5 === 0 ? 0xf6c65a : i % 3 === 0 ? 0xff4fff : 0x18e6ff;
      this.neonRain.lineStyle(1, color, Phaser.Math.FloatBetween(0.08, 0.24));
      this.neonRain.lineBetween(x, y, x - 9, y + length);
    }

    const vignette = this.add.graphics().setScrollFactor(0).setDepth(DEPTHS.hud - 30);
    vignette.fillStyle(0x02070d, 0.28);
    vignette.fillRect(0, 0, GAME_WIDTH, 72);
    vignette.fillRect(0, GAME_HEIGHT - 86, GAME_WIDTH, 86);
    vignette.fillStyle(0x02070d, 0.16);
    vignette.fillRect(0, 0, 72, GAME_HEIGHT);
    vignette.fillRect(GAME_WIDTH - 72, 0, 72, GAME_HEIGHT);
  }

  private drawPlatform() {
    if (this.textures.exists(AssetKeys.cityTiles)) {
      this.add
        .tileSprite(0, PLATFORM_Y + 36, WORLD_WIDTH, 150, AssetKeys.cityTiles)
        .setOrigin(0, 0)
        .setTileScale(1.4)
        .setAlpha(0.28)
        .setTint(0x9feeff)
        .setDepth(DEPTHS.platformBack);
    }
    if (this.textures.exists(AssetKeys.labTiles)) {
      this.add
        .tileSprite(0, PLATFORM_Y + 76, WORLD_WIDTH, 94, AssetKeys.labTiles)
        .setOrigin(0, 0)
        .setTileScale(1.15)
        .setAlpha(0.16)
        .setTint(0x67f6ff)
        .setDepth(DEPTHS.platformBack + 1);
    }
    if (this.textures.exists(AssetKeys.lavaTiles)) {
      this.add
        .tileSprite(0, PLATFORM_Y + 128, WORLD_WIDTH, 86, AssetKeys.lavaTiles)
        .setOrigin(0, 0)
        .setTileScale(1.2)
        .setAlpha(0.1)
        .setTint(0xff7a32)
        .setDepth(DEPTHS.platformBack + 1);
    }
    this.createWorldProps();

    const g = this.add.graphics().setDepth(DEPTHS.platformBack + 1);
    g.fillStyle(0x07121c, 0.98);
    g.fillRect(0, PLATFORM_Y, WORLD_WIDTH, GAME_HEIGHT - PLATFORM_Y);
    g.fillStyle(0x18e6ff, 0.08);
    g.fillRect(0, PLATFORM_Y - 18, WORLD_WIDTH, 18);
    g.fillStyle(0x02070d, 0.3);
    g.fillRect(0, PLATFORM_Y + 92, WORLD_WIDTH, GAME_HEIGHT - PLATFORM_Y - 92);
    g.fillStyle(0x10212e, 0.94);
    g.fillRect(0, PLATFORM_Y + 5, WORLD_WIDTH, 42);
    g.lineStyle(7, 0x18e6ff, 0.16);
    g.lineBetween(0, PLATFORM_Y - 2, WORLD_WIDTH, PLATFORM_Y - 2);
    g.lineStyle(4, 0x8cf8ff, 0.96);
    g.lineBetween(0, PLATFORM_Y, WORLD_WIDTH, PLATFORM_Y);
    g.lineStyle(2, 0xf6c65a, 0.9);
    g.lineBetween(0, PLATFORM_Y + 19, WORLD_WIDTH, PLATFORM_Y + 19);
    g.lineStyle(1, 0x2a5970, 0.42);
    for (let x = 0; x < WORLD_WIDTH; x += 154) {
      g.fillStyle(x % 308 === 0 ? 0x12293a : 0x0d1c28, 0.78);
      g.fillRect(x + 7, PLATFORM_Y + 32, 136, 56);
      g.strokeRect(x + 7, PLATFORM_Y + 32, 136, 56);
      g.lineStyle(1, 0x18e6ff, 0.18);
      g.lineBetween(x + 22, PLATFORM_Y + 47, x + 126, PLATFORM_Y + 47);
      if (x % 462 === 0) {
        g.fillStyle(0x18e6ff, 0.42);
        g.fillRoundedRect(x + 20, PLATFORM_Y + 12, 72, 5, 2);
        g.fillStyle(0xf6c65a, 0.32);
        g.fillRoundedRect(x + 102, PLATFORM_Y + 12, 32, 5, 2);
      }
      g.lineStyle(1, 0x2a5970, 0.42);
    }
    g.fillStyle(0x8cf8ff, 0.045);
    for (let y = PLATFORM_Y + 54; y < GAME_HEIGHT; y += 18) {
      g.fillRect(0, y, WORLD_WIDTH, 1);
    }

    const foreground = this.add.graphics().setDepth(DEPTHS.platformBack + 3).setBlendMode(Phaser.BlendModes.ADD);
    foreground.fillStyle(0x18e6ff, 0.08);
    foreground.fillEllipse(WORLD_WIDTH * 0.22, PLATFORM_Y + 18, WORLD_WIDTH * 0.18, 32);
    foreground.fillStyle(0xf6c65a, 0.05);
    foreground.fillEllipse(WORLD_WIDTH * 0.58, PLATFORM_Y + 20, WORLD_WIDTH * 0.22, 28);
  }

  private createWorldProps() {
    const propRows = [
      { key: AssetKeys.cityProps, y: PLATFORM_Y - 94, scale: 0.82, alpha: 0.78, tint: 0xffffff, step: 760 },
      { key: AssetKeys.labProps, y: PLATFORM_Y - 132, scale: 0.64, alpha: 0.32, tint: 0x75f4ff, step: 980 },
      { key: AssetKeys.lavaProps, y: PLATFORM_Y - 58, scale: 0.58, alpha: 0.2, tint: 0xff8a2a, step: 1140 },
    ];
    for (const row of propRows) {
      if (!this.textures.exists(row.key)) continue;
      for (let x = 260; x < WORLD_WIDTH; x += row.step) {
        this.add
          .image(x + Phaser.Math.Between(-48, 48), row.y, row.key)
          .setOrigin(0.5, 1)
          .setScale(row.scale)
          .setAlpha(row.alpha)
          .setTint(row.tint)
          .setDepth(DEPTHS.platformBack + (row.key === AssetKeys.cityProps ? 2 : -1));
      }
    }
  }

  private createKeyTracking() {
    this.input.keyboard?.on("keydown", this.onKeyDown);
    this.input.keyboard?.on("keyup", this.onKeyUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown);
      this.input.keyboard?.off("keyup", this.onKeyUp);
      this.downCodes.clear();
      this.justCodes.clear();
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.downCodes.has(event.code)) this.justCodes.add(event.code);
    this.downCodes.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.downCodes.delete(event.code);
  };

  private readInput(playerIndex: number): PlayerInput {
    if (playerIndex === 1) {
      return {
        left: this.isDown("ArrowLeft"),
        right: this.isDown("ArrowRight"),
        jump: this.isJust("ArrowUp"),
        dash: this.isJust("ShiftRight", "Numpad0"),
        basicAttack: this.isJust("Numpad1"),
        skill1: this.isJust("Numpad2"),
        skill2: this.isJust("Numpad3"),
        ultimate: this.isJust("Numpad4"),
      };
    }

    return {
      left: this.isDown("KeyA") || touchControls.isHeld("left"),
      right: this.isDown("KeyD") || touchControls.isHeld("right"),
      jump: this.isJust("KeyW", "Space") || touchControls.consumeJust("jump"),
      dash: this.isJust("ShiftLeft", "KeyF") || touchControls.consumeJust("dash"),
      basicAttack: this.isJust("KeyJ") || touchControls.consumeJust("basic") || touchControls.consumeJust("slash"),
      skill1: this.isJust("KeyK") || touchControls.consumeJust("skill1") || touchControls.consumeJust("blast"),
      skill2: this.isJust("KeyL") || touchControls.consumeJust("skill2"),
      ultimate: this.isJust("KeyU", "KeyI") || touchControls.consumeJust("ultimate"),
    };
  }

  private emptyInput(): PlayerInput {
    return {
      left: false,
      right: false,
      jump: false,
      dash: false,
      basicAttack: false,
      skill1: false,
      skill2: false,
      ultimate: false,
    };
  }

  private processPlayerInput(player: Player, input: PlayerInput) {
    if (input.dash && player.tryDash()) {
      this.spawnDashTrail(player);
      this.addLog(`P${player.id + 1} dash`);
    }
    if (input.basicAttack) this.tryBasicAttack(player);
    if (input.skill1) this.tryUseSkill(player, "skill1");
    if (input.skill2) this.tryUseSkill(player, "skill2");
    if (input.ultimate) this.tryUseSkill(player, "ultimate");
  }

  private tryBasicAttack(player: Player) {
    const attack = getBasicAttackForHero(player.hero.id);
    if (!attack) return;
    const result = player.startBasicAttack(attack);
    if (!result.ok) {
      if (result.reason === "cooldown") this.addThrottledLog(`basic-${player.id}`, `${attack.name} failed: cooldown`, 0.75);
      return;
    }
    this.addLog(`P${player.id + 1} used ${attack.name}`);
    this.resolveBasicAttack(player, attack);
  }

  private tryUseSkill(player: Player, input: SkillInput) {
    const skill = getSkillForHeroInput(player.hero.id, input);
    if (!skill) return;
    const result = player.startSkill(skill);
    if (!result.ok) {
      const reason = result.reason === "energy" ? "not enough energy" : result.reason === "cooldown" ? "cooldown" : "dead";
      this.addThrottledLog(`skill-${player.id}-${skill.id}-${reason}`, `${skill.name} failed: ${reason}`, reason === "cooldown" ? 0.8 : 0.35);
      return;
    }

    this.addLog(`P${player.id + 1} used ${skill.name}`);
    if (this.gameMode === "pk") {
      this.addLog(skill.input === "ultimate" ? `P${player.id + 1} used ultimate` : `P${player.id + 1} used skill`);
    }
    if (skill.input === "ultimate") this.spawnUltimate(player, skill);
    else if (skill.type === "ranged") this.spawnPlayerProjectile(player, skill);
    else if (skill.id === "rising_blade") this.spawnRisingBlade(player, skill);
    else if (skill.id === "inferno_arc") this.spawnInfernoArc(player, skill);
    else if (skill.id === "electric_cage") this.spawnElectricCage(player, skill);
    else if (skill.id === "toxic_spiral") this.spawnToxicSpiral(player, skill);
    else this.resolveMeleeSkill(player, skill);
  }

  private resolveBasicAttack(player: Player, attack: BasicAttackConfig) {
    const range = attack.range;
    const hitbox = {
      x: player.sprite.x + player.facing * (range * 0.5) - range / 2,
      y: player.sprite.y - 132,
      width: range,
      height: 104,
    };
    this.debugRects.push({ rect: hitbox, color: attack.effectColor, life: 0.13 });
    this.spawnBasicSlashEffect(player, attack);
    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !overlaps(hitbox, enemy.getBounds())) continue;
      this.applyBasicHit(enemy, attack.damage, player, attack, attack.knockback ?? 22);
      hit = true;
    }
    for (const target of this.pkOpponents(player)) {
      if (!overlaps(hitbox, target.getBounds())) continue;
      if (this.applyBasicPlayerHit(target, player, attack)) hit = true;
    }
    if (hit) this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private resolveMeleeSkill(player: Player, skill: SkillConfig) {
    const range = skill.range ?? 140;
    const hitbox = {
      x: player.sprite.x + player.facing * (range * 0.52) - range / 2,
      y: player.sprite.y - 142,
      width: range,
      height: 118,
    };
    this.debugRects.push({ rect: hitbox, color: skill.effectColor, life: 0.15 });
    this.spawnSlashEffect(player, skill, range);
    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !overlaps(hitbox, enemy.getBounds())) continue;
      this.applySkillHit(enemy, skill.damage, player, skill, skill.knockback ?? 28);
      hit = true;
    }
    for (const target of this.pkOpponents(player)) {
      if (!overlaps(hitbox, target.getBounds())) continue;
      if (this.applySkillPlayerHit(target, player, skill, skill.knockback ?? 28)) hit = true;
    }
    if (hit) this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private spawnRisingBlade(player: Player, skill: SkillConfig) {
    const x = player.sprite.x + player.facing * 112;
    const hitbox = {
      x: x - 58,
      y: PLATFORM_Y - 272,
      width: 116,
      height: 272,
    };
    this.debugRects.push({ rect: hitbox, color: skill.effectColor, life: 0.22 });
    this.spawnRisingBladeColumn(x, skill.effectColor);

    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !overlaps(hitbox, enemy.getBounds())) continue;
      this.applySkillHit(enemy, skill.damage, player, skill, 18);
      enemy.launch(590);
      hit = true;
    }
    for (const target of this.pkOpponents(player)) {
      if (!overlaps(hitbox, target.getBounds())) continue;
      if (this.applySkillPlayerHit(target, player, skill, 18)) {
        target.vy = -520;
        target.grounded = false;
        hit = true;
      }
    }
    if (hit) this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private spawnInfernoArc(player: Player, skill: SkillConfig) {
    const range = skill.range ?? 210;
    const x = player.sprite.x + player.facing * (range * 0.52);
    const hitbox = {
      x: player.facing > 0 ? player.sprite.x + 8 : player.sprite.x - range - 8,
      y: player.sprite.y - 188,
      width: range,
      height: 188,
    };
    this.debugRects.push({ rect: hitbox, color: skill.effectColor, life: 0.18 });
    this.spawnInfernoArcVisual(player, skill, range);
    this.spawnFireTrail(player.sprite.x + player.facing * 125, player.facing, skill);

    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !overlaps(hitbox, enemy.getBounds())) continue;
      this.applySkillHit(enemy, skill.damage, player, skill, skill.knockback ?? 76);
      hit = true;
    }
    for (const target of this.pkOpponents(player)) {
      if (!overlaps(hitbox, target.getBounds())) continue;
      if (this.applySkillPlayerHit(target, player, skill, skill.knockback ?? 76)) hit = true;
    }
    if (hit) this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private spawnPlayerProjectile(player: Player, skill: SkillConfig) {
    const image = this.add
      .image(player.sprite.x + player.facing * 76, player.sprite.y - 92, AssetKeys.energyBlastSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.projectile)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(player.facing < 0)
      .setTint(skill.effectColor);
    const projectileWidth = skill.id === "fire_burst" ? 164 : skill.id === "thunder_bolt" ? 184 : 174;
    const projectileHeight = skill.id === "fire_burst" ? 66 : skill.id === "wind_pulse" ? 60 : 50;
    image.setCrop(246, 0, 190, 145).setDisplaySize(projectileWidth, projectileHeight);
    this.projectiles.push({
      image,
      vx: player.facing * (skill.projectileSpeed ?? 820),
      vy: 0,
      damage: skill.damage,
      life: 1.15,
      trailTimer: 0,
      color: skill.effectColor,
      facing: player.facing,
      owner: "player",
      attacker: player,
      skill,
    });
  }

  private spawnUltimate(player: Player, skill: SkillConfig) {
    this.cameras.main.shake(skill.id === "crimson_meteor" ? 430 : 260, skill.id === "crimson_meteor" ? 0.011 : 0.005);
    this.flashUltimate(skill.effectColor, skill.id === "crimson_meteor" ? 190 : 130);
    this.showMessage(skill.name.toUpperCase(), 0.9);

    if (skill.id === "nova_overdrive") {
      this.spawnNovaCharge(player, skill.effectColor);
      this.time.delayedCall(200, () => {
        this.spawnPlasmaRing(player.sprite.x, player.sprite.y - 88, skill.radius ?? 240, skill.effectColor);
        this.spawnPlasmaDome(player.sprite.x, player.sprite.y - 86, skill.radius ?? 240, skill.effectColor);
        this.spawnExplosion(player.sprite.x, player.sprite.y - 86, true, skill.effectColor);
        this.damageEnemiesInRadius(player.sprite.x, player.sprite.y - 92, skill.radius ?? 240, skill.damage, player, skill);
      });
      return;
    }

    if (skill.id === "crimson_meteor") {
      const target = this.nearestPkOpponent(player, 900) ?? this.biggestEnemy() ?? { sprite: { x: player.sprite.x + player.facing * 230, y: PLATFORM_Y } };
      const impactX = Phaser.Math.Clamp(target.sprite.x, player.sprite.x - 360, player.sprite.x + 420);
      this.spawnMeteorWarning(impactX, skill.effectColor);
      this.time.delayedCall(400, () => this.spawnMeteor(impactX, skill));
      this.time.delayedCall(620, () => {
        this.cameras.main.shake(260, 0.012);
        this.spawnExplosion(impactX, PLATFORM_Y - 88, true, skill.effectColor);
        this.spawnFirePillar(impactX, skill.effectColor);
        this.damageEnemiesInRadius(impactX, PLATFORM_Y - 84, skill.radius ?? 280, skill.damage, player, skill);
      });
      return;
    }

    if (skill.id === "storm_breaker") {
      for (let i = 0; i < (skill.strikeCount ?? 4); i++) {
        this.time.delayedCall(i * 300, () => {
          const target = this.nearestPkOpponent(player, skill.radius ?? 260) ?? this.nearestEnemy(player.sprite.x, skill.radius ?? 260);
          if (!target) return;
          this.spawnLightningWarning(target.sprite.x, target.sprite.y - target.sprite.displayHeight * 0.5, skill.effectColor);
        });
        this.time.delayedCall(i * 300 + 95, () => {
          const target = this.nearestPkOpponent(player, skill.radius ?? 280) ?? this.nearestEnemy(player.sprite.x, skill.radius ?? 280);
          if (!target) return;
          this.cameras.main.shake(95, 0.004);
          this.spawnLightning(target.sprite.x, target.sprite.y - target.sprite.displayHeight * 0.55, skill.effectColor);
          if (target instanceof Player) this.applySkillPlayerHit(target, player, skill, 22);
          else this.applySkillHit(target, skill.damage, player, skill, 22);
        });
      }
      return;
    }

    if (skill.id === "emerald_mirage") {
      const hits = skill.hitCount ?? 5;
      for (let i = 0; i < hits; i++) {
        this.time.delayedCall(i * 95, () => {
          const angle = (Math.PI * 2 * i) / hits;
          const target = this.nearestPkOpponent(player, skill.radius ?? 230) ?? this.nearestEnemy(player.sprite.x, skill.radius ?? 230);
          const centerX = target?.sprite.x ?? player.sprite.x;
          const centerY = target ? target.sprite.y - target.sprite.displayHeight * 0.48 : player.sprite.y - 96;
          const x = centerX + Math.cos(angle) * 92;
          const y = centerY + Math.sin(angle) * 46;
          this.spawnHeroAfterimage(player, x, PLATFORM_Y, skill.effectColor, centerX);
          this.spawnSlashAt((x + centerX) / 2, (y + centerY) / 2, skill.effectColor, angle + Math.PI * 0.45);
          this.damageEnemiesInRadius(centerX, centerY, skill.radius ?? 230, skill.damage, player, skill, false);
        });
      }
    }
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      const actions = enemy.update(dt, this.players);
      if (enemy.isEnragedState() && !this.enrageLogged.has(enemy)) {
        this.enrageLogged.add(enemy);
        this.addLog("Boss enrage");
        this.spawnBossEnrage(enemy);
      }
      for (const action of actions) this.handleEnemyAction(action);
    }
  }

  private handleEnemyAction(action: EnemyAction) {
    if (action.type === "shot") {
      this.spawnEnemyProjectile(action);
      return;
    }
    if (action.type === "slam") {
      this.spawnShockwave(action.impactX, action.source.facing);
      this.cameras.main.shake(150, 0.007);
      this.addLog("Boss Ground Slam");
    }
    this.debugRects.push({ rect: action.hitbox, color: 0xff5b6d, life: 0.18 });
    for (const player of this.players) {
      if (!player.alive || !overlaps(action.hitbox, player.getBounds())) continue;
      if (player.takeDamage(action.damage, action.source.facing)) {
        this.spawnHitSpark(player.sprite.x - action.source.facing * 24, player.sprite.y - 92, 0xff6d57);
        this.addLog(`P${player.id + 1} took ${Math.ceil(action.damage)} damage`);
      }
    }
  }

  private spawnEnemyProjectile(action: Extract<EnemyAction, { type: "shot" }>) {
    const image = this.add
      .image(action.x, action.y, AssetKeys.energyBlastSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.projectile)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(action.facing < 0)
      .setTint(0x67f6ff);
    image.setCrop(74, 0, 82, 145).setDisplaySize(86, 38);
    this.projectiles.push({
      image,
      vx: action.facing * 430,
      vy: 0,
      damage: action.damage,
      life: 1.35,
      trailTimer: 0,
      color: 0x67f6ff,
      facing: action.facing,
      owner: "enemy",
    });
  }

  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.image.x += projectile.vx * dt;
      projectile.image.y += projectile.vy * dt;
      projectile.image.rotation += projectile.facing * dt * 4;
      projectile.trailTimer -= dt;
      if (projectile.trailTimer <= 0) {
        projectile.trailTimer = projectile.owner === "player" ? 0.028 : 0.045;
        this.spawnProjectileTrail(projectile);
      }
      const hitbox = this.projectileBounds(projectile.image);
      if (this.debugHitboxes) this.debugRects.push({ rect: hitbox, color: projectile.owner === "player" ? 0xffef72 : 0xff5b6d, life: 0.02 });

      if (projectile.owner === "player") this.resolvePlayerProjectile(projectile, hitbox);
      else this.resolveEnemyProjectile(projectile, hitbox);

      if (projectile.image.x < -80 || projectile.image.x > WORLD_WIDTH + 80) projectile.life = 0;
    }
    for (const projectile of this.projectiles.filter((item) => item.life <= 0)) projectile.image.destroy();
    this.projectiles = this.projectiles.filter((item) => item.life > 0);
  }

  private resolvePlayerProjectile(projectile: SkillProjectile, hitbox: RectLike) {
    if (!projectile.skill || !projectile.attacker || projectile.life <= 0) return;
    for (const target of this.pkOpponents(projectile.attacker)) {
      if (!overlaps(hitbox, target.getBounds())) continue;
      this.applySkillPlayerHit(target, projectile.attacker, projectile.skill, projectile.skill.knockback ?? 18);
      if (projectile.skill.explosionRadius) {
        this.spawnExplosion(target.sprite.x, target.sprite.y - 88, false, projectile.skill.effectColor);
        this.damagePlayersInRadius(
          target.sprite.x,
          target.sprite.y - 80,
          projectile.skill.explosionRadius,
          projectile.skill.damage * 0.65,
          projectile.attacker,
          projectile.skill,
        );
      }
      projectile.life = 0;
      return;
    }
    for (const enemy of this.enemies) {
      if (!enemy.alive || !overlaps(hitbox, enemy.getBounds())) continue;
      this.applySkillHit(enemy, projectile.damage, projectile.attacker, projectile.skill, projectile.skill.knockback ?? 18);
      if (projectile.skill.explosionRadius) {
        this.spawnExplosion(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48, false, projectile.skill.effectColor);
        this.damageEnemiesInRadius(enemy.sprite.x, enemy.sprite.y - 80, projectile.skill.explosionRadius, projectile.skill.damage * 0.65, projectile.attacker, projectile.skill, false);
      }
      if (projectile.skill.chainRadius) this.chainLightning(enemy, projectile.attacker, projectile.skill);
      projectile.life = 0;
      break;
    }
  }

  private resolveEnemyProjectile(projectile: SkillProjectile, hitbox: RectLike) {
    for (const player of this.players) {
      if (!player.alive || !overlaps(hitbox, player.getBounds())) continue;
      if (player.takeDamage(projectile.damage, projectile.facing)) {
        this.spawnHitSpark(player.sprite.x, player.sprite.y - 90, 0xff6d57);
        this.addLog(`P${player.id + 1} took ${projectile.damage} shot damage`);
      }
      projectile.life = 0;
      break;
    }
  }

  private applyBasicHit(enemy: Enemy, damage: number, player: Player, attack: BasicAttackConfig, knockback = 22) {
    enemy.takeDamage(damage, player.facing, knockback);
    player.energize(attack.energyGainOnHit);
    this.spawnHitSpark(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48, attack.effectColor);
    if (!enemy.alive) this.logEnemyDefeated(enemy);
    this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private applySkillHit(enemy: Enemy, damage: number, player: Player, skill: SkillConfig, knockback = 24) {
    enemy.takeDamage(damage, player.facing, knockback);
    this.spawnHitSpark(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48, skill.effectColor);
    if (skill.status && Math.random() <= (skill.statusChance ?? 1)) {
      const applied = enemy.applyStatus(skill.status, skill.statusDuration);
      if (applied) this.addLog(`${enemy.data.displayName} ${skill.status}`);
    }
    if (!enemy.alive) this.logEnemyDefeated(enemy);
    this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private pkOpponents(player: Player) {
    if (this.gameMode !== "pk" || this.matchEnded) return [];
    return this.players.filter((target) => target !== player && target.alive);
  }

  private applyBasicPlayerHit(target: Player, attacker: Player, attack: BasicAttackConfig) {
    const damage = attack.damage * PK_DAMAGE_MULTIPLIER.basic;
    const direction = attacker.sprite.x <= target.sprite.x ? 1 : -1;
    const didHit = target.takeDamage(damage, direction);
    if (!didHit) return false;
    attacker.energize(attack.energyGainOnHit);
    this.spawnHitSpark(target.sprite.x, target.sprite.y - 92, attack.effectColor);
    this.addLog(`P${attacker.id + 1} hit P${target.id + 1}`);
    this.addLog(`P${target.id + 1} HP ${Math.ceil(target.hp)}`);
    this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.04);
    return true;
  }

  private applySkillPlayerHit(target: Player, attacker: Player, skill: SkillConfig, knockback = 24) {
    const multiplier = skill.input === "ultimate" ? PK_DAMAGE_MULTIPLIER.ultimate : PK_DAMAGE_MULTIPLIER.skill;
    const damage = skill.damage * multiplier;
    const direction = attacker.sprite.x <= target.sprite.x ? 1 : -1;
    const didHit = target.takeDamage(damage, direction);
    if (!didHit) return false;
    target.vx += direction * knockback * 5;
    this.spawnHitSpark(target.sprite.x, target.sprite.y - 92, skill.effectColor);
    this.addLog(`P${attacker.id + 1} hit P${target.id + 1}`);
    this.addLog(`P${target.id + 1} HP ${Math.ceil(target.hp)}`);
    this.hitPauseTimer = Math.max(this.hitPauseTimer, skill.input === "ultimate" ? 0.05 : 0.04);
    return true;
  }

  private logEnemyDefeated(enemy: Enemy) {
    if (this.defeatedLogged.has(enemy)) return;
    this.defeatedLogged.add(enemy);
    this.addLog(`${enemy.data.displayName} defeated`);
  }

  private damageEnemiesInRadius(x: number, y: number, radius: number, damage: number, player: Player, skill: SkillConfig, pause = true) {
    const hitbox = { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
    this.debugRects.push({ rect: hitbox, color: skill.effectColor, life: 0.22 });
    let hit = false;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const bounds = enemy.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(x, y, cx, cy) > radius) continue;
      this.applySkillHit(enemy, damage, player, skill, skill.knockback ?? 42);
      hit = true;
    }
    if (this.damagePlayersInRadius(x, y, radius, damage, player, skill)) hit = true;
    if (hit && pause) this.hitPauseTimer = Math.max(this.hitPauseTimer, 0.06);
  }

  private damagePlayersInRadius(x: number, y: number, radius: number, damage: number, attacker: Player, skill: SkillConfig) {
    let hit = false;
    for (const target of this.pkOpponents(attacker)) {
      const bounds = target.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(x, y, cx, cy) > radius) continue;
      const syntheticSkill = { ...skill, damage };
      if (this.applySkillPlayerHit(target, attacker, syntheticSkill, skill.knockback ?? 42)) hit = true;
    }
    return hit;
  }

  private chainLightning(origin: Enemy, player: Player, skill: SkillConfig) {
    const radius = skill.chainRadius ?? 170;
    const target = this.enemies
      .filter((enemy) => enemy !== origin && enemy.alive)
      .sort((a, b) => Math.abs(a.sprite.x - origin.sprite.x) - Math.abs(b.sprite.x - origin.sprite.x))
      .find((enemy) => Phaser.Math.Distance.Between(origin.sprite.x, origin.sprite.y, enemy.sprite.x, enemy.sprite.y) <= radius);
    if (!target) return;
    this.spawnLightning(target.sprite.x, target.sprite.y - target.sprite.displayHeight * 0.48, skill.effectColor);
    this.applySkillHit(target, skill.damage * (skill.chainDamageMultiplier ?? 0.5), player, skill, 12);
  }

  private spawnElectricCage(player: Player, skill: SkillConfig) {
    const radius = skill.radius ?? 170;
    const x = player.sprite.x + player.facing * 118;
    const y = PLATFORM_Y - 78;
    const visual = this.add.graphics().setDepth(DEPTHS.effect + 2);
    this.drawElectricCageVisual(visual, x, y, radius, skill.effectColor, 1);
    this.activeAreas.push({
      kind: "electric_cage",
      x,
      y,
      radius,
      life: skill.duration ?? 2.2,
      maxLife: skill.duration ?? 2.2,
      tick: 0,
      tickRate: skill.tickRate ?? 0.45,
      damage: skill.damage,
      owner: player,
      skill,
      visual,
    });
    this.addLog("Electric Cage active");
  }

  private spawnToxicSpiral(player: Player, skill: SkillConfig) {
    const radius = skill.radius ?? 165;
    const x = player.sprite.x;
    const y = player.sprite.y - 92;
    this.spawnSpiralBurst(x, y, radius, skill.effectColor);
    this.activeAreas.push({
      kind: "toxic_spiral",
      x,
      y,
      radius,
      life: skill.duration ?? 1.8,
      maxLife: skill.duration ?? 1.8,
      tick: 0,
      tickRate: skill.tickRate ?? 0.3,
      damage: Math.max(4, skill.damage * 0.28),
      owner: player,
      skill,
      visual: this.add.graphics().setDepth(DEPTHS.effect + 2),
    });
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const bounds = enemy.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(x, y, cx, cy) > radius) continue;
      enemy.pullToward(x, 24);
      this.applySkillHit(enemy, skill.damage, player, skill, 0);
    }
    for (const target of this.pkOpponents(player)) {
      const bounds = target.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(x, y, cx, cy) > radius) continue;
      target.vx += Math.sign(x - target.sprite.x) * (skill.pullStrength ?? 92) * 1.6;
      this.applySkillPlayerHit(target, player, skill, 0);
    }
  }

  private updateActiveAreas(dt: number) {
    for (const area of this.activeAreas) {
      area.life -= dt;
      area.tick -= dt;
      const alpha = Phaser.Math.Clamp(area.life / area.maxLife, 0, 1);
      if (area.kind === "electric_cage") this.drawElectricCageVisual(area.visual, area.x, area.y, area.radius, area.skill.effectColor, alpha);
      else this.drawToxicSpiralVisual(area.visual, area.x, area.y, area.radius, area.skill.effectColor, alpha);
      if (area.tick <= 0) {
        area.tick += area.tickRate;
        this.tickActiveArea(area);
      }
    }
    for (const area of this.activeAreas.filter((item) => item.life <= 0)) area.visual.destroy();
    this.activeAreas = this.activeAreas.filter((item) => item.life > 0);
  }

  private tickActiveArea(area: ActiveArea) {
    const hitbox = {
      x: area.x - area.radius,
      y: area.y - area.radius,
      width: area.radius * 2,
      height: area.radius * 2,
    };
    this.debugRects.push({ rect: hitbox, color: area.skill.effectColor, life: 0.08 });
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const bounds = enemy.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(area.x, area.y, cx, cy) > area.radius) continue;
      if (area.kind === "toxic_spiral") enemy.pullToward(area.x, (area.skill.pullStrength ?? 90) * 0.08);
      this.applySkillHit(enemy, area.damage, area.owner, area.skill, area.kind === "toxic_spiral" ? 0 : area.skill.knockback ?? 8);
    }
    for (const target of this.pkOpponents(area.owner)) {
      const bounds = target.getBounds();
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (Phaser.Math.Distance.Between(area.x, area.y, cx, cy) > area.radius) continue;
      if (area.kind === "toxic_spiral") target.vx += Math.sign(area.x - target.sprite.x) * (area.skill.pullStrength ?? 90) * 0.8;
      const syntheticSkill = { ...area.skill, damage: area.damage };
      this.applySkillPlayerHit(target, area.owner, syntheticSkill, area.kind === "toxic_spiral" ? 0 : area.skill.knockback ?? 8);
    }
  }

  private cleanupDeadEnemies() {
    const dead = this.enemies.filter((enemy) => !enemy.alive);
    for (const enemy of dead) {
      this.score += enemy.scoreValue;
      this.logEnemyDefeated(enemy);
      if (enemy.isBoss()) {
        this.cameras.main.shake(360, 0.01);
        this.addLog("Boss defeated bonus");
        this.spawnExplosion(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.45, true, 0x18e6ff);
        this.spawnExplosion(enemy.sprite.x - 74, enemy.sprite.y - enemy.sprite.displayHeight * 0.34, true, 0xff7a32);
        this.spawnExplosion(enemy.sprite.x + 82, enemy.sprite.y - enemy.sprite.displayHeight * 0.58, true, 0x67f6ff);
      } else {
        this.spawnExplosion(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.45, false, 0x18e6ff);
      }
      this.spawnEnemyDrop(enemy);
      enemy.destroy();
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  private spawnEnemyDrop(enemy: Enemy) {
    const x = enemy.sprite.x;
    const y = enemy.kind === "sky_hunter" ? Math.min(PLATFORM_Y - 30, enemy.sprite.y + 28) : PLATFORM_Y - 20;
    if (enemy.kind === "abyssal_colossus") {
      this.spawnPickup("treasure", x, y, 800);
      this.spawnPickup("health", x - 72, y, 55);
      this.spawnPickup("energy", x + 72, y, 55);
      return;
    }
    if (enemy.isBoss()) {
      this.spawnPickup("upgrade", x, y, 380);
      this.spawnPickup("energy", x + 58, y, 42);
      return;
    }
    const roll = Math.random();
    if (roll < 0.22) this.spawnPickup("health", x, y, 32);
    else if (roll < 0.46) this.spawnPickup("energy", x, y, 30);
    else if (roll < 0.66) this.spawnPickup("credit", x, y, 80);
    else if (enemy.kind === "aegis_elite") this.spawnPickup("upgrade", x, y, 240);
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, value: number) {
    const key =
      kind === "health"
        ? AssetKeys.itemHealth
        : kind === "energy"
          ? AssetKeys.itemEnergy
          : kind === "upgrade"
            ? AssetKeys.itemUpgrade
            : kind === "treasure"
              ? AssetKeys.itemTreasure
              : AssetKeys.itemCredit;
    if (!this.textures.exists(key)) return;
    const image = this.add
      .image(x, y, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(kind === "treasure" ? 70 : kind === "upgrade" ? 52 : 46, kind === "treasure" ? 72 : 54)
      .setDepth(DEPTHS.effect - 1)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.tweens.add({
      targets: image,
      y: y - 24,
      duration: 260,
      ease: "Quad.easeOut",
      yoyo: true,
    });
    this.pickups.push({ image, kind, value, life: 11, baseY: y, phase: Math.random() * Math.PI * 2 });
  }

  private updatePickups(dt: number) {
    for (const pickup of this.pickups) {
      pickup.life -= dt;
      pickup.image.y = pickup.baseY - 8 + Math.sin(this.time.now * 0.006 + pickup.phase) * 6;
      pickup.image.rotation = Math.sin(this.time.now * 0.004 + pickup.phase) * 0.045;
      pickup.image.setAlpha(pickup.life < 2 ? 0.45 + Math.sin(this.time.now * 0.025) * 0.25 : 1);
      const pickupBounds = this.pickupBounds(pickup.image);
      for (const player of this.players) {
        if (!player.alive || !overlaps(player.getBounds(), pickupBounds)) continue;
        this.collectPickup(player, pickup);
        pickup.life = 0;
        break;
      }
    }
    for (const pickup of this.pickups.filter((item) => item.life <= 0)) {
      if (pickup.image.scene) pickup.image.destroy();
    }
    this.pickups = this.pickups.filter((item) => item.life > 0);
  }

  private collectPickup(player: Player, pickup: Pickup) {
    if (pickup.kind === "health") {
      player.hp = Math.min(player.maxHp, player.hp + pickup.value);
      this.spawnHitSpark(player.sprite.x, player.sprite.y - 88, 0x4ef3a5);
      this.addLog(`P${player.id + 1} picked HP`);
    } else if (pickup.kind === "energy") {
      player.energy = Math.min(player.maxEnergy, player.energy + pickup.value);
      this.spawnHitSpark(player.sprite.x, player.sprite.y - 88, player.hero.themeColor);
      this.addLog(`P${player.id + 1} picked energy`);
    } else {
      this.score += pickup.value;
      this.spawnHitSpark(pickup.image.x, pickup.image.y - 20, 0xffd66d);
      this.addLog(`Pickup score +${pickup.value}`);
    }
  }

  private pickupBounds(image: Phaser.GameObjects.Image): RectLike {
    return {
      x: image.x - image.displayWidth * 0.42,
      y: image.y - image.displayHeight,
      width: image.displayWidth * 0.84,
      height: image.displayHeight,
    };
  }

  private updateWaveFlow(dt: number) {
    if (this.enemies.length > 0 || this.stageClear || this.gameOver) return;

    if (this.waitingNextWave) {
      this.waveWait -= dt;
      if (this.waveWait <= 0) {
        this.waitingNextWave = false;
        this.startNextWave();
      }
      return;
    }

    if (this.waveIndex >= this.waves.length - 1) {
      this.finishRun("STAGE CLEAR", "Neon sector secured.");
      return;
    }

    this.addLog(`Wave ${this.waveIndex + 1} clear`);
    this.waitingNextWave = true;
    this.waveWait = 0.9;
  }

  private startNextWave() {
    this.waveIndex += 1;
    const wave = this.waves[this.waveIndex];
    if (!wave) return;
    this.showMessage(wave.label, 1);
    this.addLog(`Wave start: ${wave.label}`);
    wave.enemies.forEach((kind, index) => this.spawnWaveEnemy(kind, index, this.waveIndex));
  }

  private spawnWaveEnemy(kind: EnemyKind, index: number, waveLevel: number) {
    const front = Math.max(...this.players.map((player) => player.sprite.x));
    let x = Phaser.Math.Clamp(front + 620 + index * 180, PLAYER_START_X + 620, WORLD_WIDTH - 260);
    while (this.enemies.some((enemy) => Math.abs(enemy.sprite.x - x) < 145)) x += 145;
    this.spawnEnemy(kind, x, waveLevel);
  }

  private spawnEnemy(kind: EnemyKind, x: number, waveLevel = 0) {
    const playerFront = Math.max(...this.players.map((player) => player.sprite.x));
    const safeX = Math.abs(x - playerFront) < 600 ? playerFront + 620 : x;
    const enemy = new Enemy(this, kind, Phaser.Math.Clamp(safeX, 160, WORLD_WIDTH - 160), waveLevel);
    this.enemies.push(enemy);
    if (enemy.isBoss()) this.spawnBossIntro(enemy);
  }

  private spawnBossIntro(enemy: Enemy) {
    this.addLog(`Boss spawn: ${enemy.getBarState().name}`);
    this.showMessage("BOSS APPROACHING", 1);
    this.cameras.main.shake(210, 0.006);
    const ring = this.add.graphics().setDepth(DEPTHS.effect + 2).setBlendMode(Phaser.BlendModes.ADD);
    const x = enemy.sprite.x;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 620,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        ring.clear();
        ring.lineStyle(5, 0x18e6ff, 1 - value);
        ring.strokeEllipse(x, PLATFORM_Y + 2, 90 + value * 240, 14 + value * 42);
        ring.fillStyle(0x18e6ff, 0.12 * (1 - value));
        ring.fillEllipse(x, PLATFORM_Y - 72, 130 + value * 180, 180 + value * 120);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private spawnBossEnrage(enemy: Enemy) {
    this.cameras.main.shake(220, 0.007);
    const aura = this.add.graphics().setDepth(DEPTHS.effect + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 520,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        aura.clear();
        aura.lineStyle(4, 0xff4c4c, 0.88 * (1 - value));
        aura.strokeEllipse(enemy.sprite.x, PLATFORM_Y - 6, 122 + value * 180, 26 + value * 38);
        aura.fillStyle(0xff2f2f, 0.13 * (1 - value));
        aura.fillEllipse(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48, enemy.sprite.displayWidth * 0.82, enemy.sprite.displayHeight * 0.84);
      },
      onComplete: () => aura.destroy(),
    });
  }

  private resolveBodySpacing() {
    if (this.gameMode === "pk") {
      this.resolvePkPlayerSpacing();
      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind === "sky_hunter") continue;
      for (const player of this.players) {
        if (!player.alive) continue;
        const dx = enemy.sprite.x - player.sprite.x;
        if (Math.abs(dx) < 76) enemy.sprite.x += (dx >= 0 ? 1 : -1) * (76 - Math.abs(dx)) * 0.42;
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.kind === "sky_hunter") continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.kind === "sky_hunter") continue;
        const dx = b.sprite.x - a.sprite.x;
        if (Math.abs(dx) < 92) {
          const push = (92 - Math.abs(dx)) * 0.28;
          a.sprite.x -= (dx >= 0 ? 1 : -1) * push;
          b.sprite.x += (dx >= 0 ? 1 : -1) * push;
        }
      }
    }
  }

  private resolvePkPlayerSpacing() {
    if (this.players.length < 2) return;
    const [p1, p2] = this.players;
    const dx = p2.sprite.x - p1.sprite.x;
    if (Math.abs(dx) < 88) {
      const direction = dx >= 0 ? 1 : -1;
      const push = (88 - Math.abs(dx)) * 0.5;
      p1.sprite.x = Phaser.Math.Clamp(p1.sprite.x - direction * push, PK_ARENA_MIN, PK_ARENA_MAX);
      p2.sprite.x = Phaser.Math.Clamp(p2.sprite.x + direction * push, PK_ARENA_MIN, PK_ARENA_MAX);
    }
    p1.setFacing(p1.sprite.x <= p2.sprite.x ? 1 : -1);
    p2.setFacing(p2.sprite.x < p1.sprite.x ? 1 : -1);
  }

  private checkGameOver() {
    if (this.players.some((player) => player.alive)) return;
    this.finishRun("GAME OVER", "Armor cores offline.");
  }

  private startPkMatch() {
    this.score = 0;
    this.pkTimer = PK_TIMER_MAX;
    this.pkIntroTimer = 1.15;
    this.pkFightShown = false;
    this.matchEnded = false;
    this.cameras.main.scrollX = 0;
    this.showMessage("READY", 0.7);
    this.addLog("PK match start");
    this.addLog(`P1 selected hero: ${this.selectedHero.displayName}`);
    this.addLog(`P2 selected hero: ${this.p2Hero.displayName}`);
  }

  private updatePkIntro(dt: number) {
    this.pkIntroTimer = Math.max(0, this.pkIntroTimer - dt);
    if (!this.pkFightShown && this.pkIntroTimer <= 0.55) {
      this.pkFightShown = true;
      this.showMessage("FIGHT", 0.7);
    }
  }

  private updatePkTimer(dt: number) {
    if (this.matchEnded) return;
    this.pkTimer = Math.max(0, this.pkTimer - dt);
    if (this.pkTimer <= 0) this.finishPkByTimer();
  }

  private checkPkEnd() {
    if (this.matchEnded || this.players.length < 2) return;
    const [p1, p2] = this.players;
    if (!p1.alive && !p2.alive) {
      this.finishPkMatch("DRAW", "Both armor cores are down.");
      return;
    }
    if (!p1.alive) {
      this.finishPkMatch("P2 WIN", `${p2.hero.displayName} wins!`);
      return;
    }
    if (!p2.alive) this.finishPkMatch("P1 WIN", `${p1.hero.displayName} wins!`);
  }

  private finishPkByTimer() {
    if (this.matchEnded || this.players.length < 2) return;
    const [p1, p2] = this.players;
    if (p1.hp > p2.hp) this.finishPkMatch("P1 WIN", `${p1.hero.displayName} wins by HP!`);
    else if (p2.hp > p1.hp) this.finishPkMatch("P2 WIN", `${p2.hero.displayName} wins by HP!`);
    else this.finishPkMatch("DRAW", "Equal armor integrity.");
  }

  private finishPkMatch(title: string, detail: string) {
    if (!this.running || this.matchEnded) return;
    this.setPaused(false, false);
    this.running = false;
    this.matchEnded = true;
    this.stageClear = title !== "DRAW";
    this.gameOver = false;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.addLog(title.toLowerCase().includes("p1") ? "P1 win" : title.toLowerCase().includes("p2") ? "P2 win" : "Draw");
    this.createResultOverlay(title, detail);
  }

  private finishRun(title: string, detail: string) {
    if (!this.running) return;
    this.setPaused(false, false);
    this.running = false;
    this.stageClear = title === "STAGE CLEAR";
    this.gameOver = title !== "STAGE CLEAR";
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.addLog(`${title}: SCORE ${this.score}`);
    this.createResultOverlay(title, detail);
  }

  private createResultOverlay(title: string, detail: string) {
    this.destroyResultOverlay();
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.resultOverlay = overlay;
    overlay.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.72).setOrigin(0).setDepth(OVERLAY_DEPTH));
    const panel = this.add.graphics().setDepth(PANEL_DEPTH);
    panel.fillStyle(0x061727, 0.96);
    panel.fillRoundedRect(GAME_WIDTH / 2 - 235, GAME_HEIGHT / 2 - 130, 470, 260, 8);
    panel.lineStyle(2, this.stageClear ? 0x18e6ff : 0xff5b6d, 0.92);
    panel.strokeRoundedRect(GAME_WIDTH / 2 - 235, GAME_HEIGHT / 2 - 130, 470, 260, 8);
    overlay.add(panel);
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 82, title, {
      fontFamily: "Arial, sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: this.stageClear ? "#8cf8ff" : "#ffb3b8",
      stroke: "#02070d",
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(PANEL_DEPTH + 1));
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, `${detail}\nSCORE ${this.score.toString().padStart(4, "0")}`, {
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
      fontStyle: "900",
      align: "center",
      color: "#eaf8ff",
      stroke: "#02070d",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(PANEL_DEPTH + 1));
    this.resultOverlayButtons.push(
      ...this.createMenuButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 + 56, "Choi lai", () => this.restartRun()),
      ...this.createMenuButton(GAME_WIDTH / 2 + 18, GAME_HEIGHT / 2 + 56, "Ve menu", () => this.returnToMenu({ title, detail })),
    );
  }

  private createMenuButton(x: number, y: number, label: string, onClick: () => void) {
    const width = 132;
    const height = 46;
    const skin = this.textures.exists(AssetKeys.uiStageSelectButton)
      ? this.add
        .image(x + width / 2, y + height / 2, AssetKeys.uiStageSelectButton)
        .setDisplaySize(width + 28, height + 18)
        .setScrollFactor(0)
        .setDepth(BUTTON_DEPTH - 2)
        .setAlpha(0.9)
      : undefined;
    const glow = this.add
      .rectangle(x, y, width, height, 0x18e6ff, 0.18)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(BUTTON_DEPTH - 1)
      .setVisible(false);
    const bg = this.add
      .rectangle(x, y, width, height, 0x0b2a46, 0.98)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(BUTTON_DEPTH)
      .setStrokeStyle(2, 0x55eaff, 0.92)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "900",
      color: "#eaf8ff",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(BUTTON_DEPTH + 1);

    bg
      .on("pointerover", () => {
        if (!this.canUseOverlayButton() || !isGameObjectAlive(glow) || !isGameObjectAlive(bg) || !isGameObjectAlive(text)) return;
        glow.setVisible(true);
        skin?.setTint(0x8cf8ff).setAlpha(1);
        bg.setFillStyle(0x12577c, 1).setStrokeStyle(3, 0x8cf8ff, 1);
        text.setShadow(0, 0, "#8cf8ff", 8, true, true);
      })
      .on("pointerout", () => {
        if (!this.canUseOverlayButton() || !isGameObjectAlive(glow) || !isGameObjectAlive(bg) || !isGameObjectAlive(text)) return;
        glow.setVisible(false);
        skin?.clearTint().setAlpha(0.9);
        bg.setFillStyle(0x0b2a46, 0.98).setStrokeStyle(2, 0x55eaff, 0.92);
        text.setShadow(0, 0, "#000000", 0, false, false);
        bg.setScale(1);
        glow.setScale(1);
        text.setScale(1);
      })
      .on("pointerdown", () => {
        if (!this.canUseOverlayButton() || !isGameObjectAlive(bg) || !isGameObjectAlive(glow) || !isGameObjectAlive(text)) return;
        bg.setScale(0.97);
        glow.setScale(0.97);
        text.setScale(0.97);
        onClick();
      });
    return skin ? [skin, glow, bg, text] : [glow, bg, text];
  }

  private canUseOverlayButton() {
    return !this.transitioning && this.scene.isActive("GameScene");
  }

  private handlePauseToggle() {
    if (!this.running || this.stageClear || this.gameOver || this.matchEnded) return;
    if (this.isJust("KeyP", "Escape")) this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean, log = true) {
    if (paused && (!this.running || this.stageClear || this.gameOver || this.matchEnded)) return;
    if (this.paused === paused) return;
    this.paused = paused;
    this.time.timeScale = paused ? 0 : 1;
    this.tweens.timeScale = paused ? 0 : 1;
    if (paused) {
      this.createPauseOverlay();
      if (log) this.addLog("Pause");
    } else {
      this.destroyPauseOverlay();
      if (log) this.addLog("Resume");
    }
  }

  private createPauseOverlay() {
    this.destroyPauseOverlay();
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.pauseOverlay = overlay;
    overlay.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.62).setOrigin(0).setDepth(OVERLAY_DEPTH));

    const panel = this.add.graphics().setDepth(PANEL_DEPTH);
    panel.fillStyle(0x061727, 0.97);
    panel.fillRoundedRect(GAME_WIDTH / 2 - 210, GAME_HEIGHT / 2 - 154, 420, 308, 8);
    panel.lineStyle(2, 0x18e6ff, 0.95);
    panel.strokeRoundedRect(GAME_WIDTH / 2 - 210, GAME_HEIGHT / 2 - 154, 420, 308, 8);
    panel.lineStyle(1, 0xf6c65a, 0.72);
    panel.strokeRoundedRect(GAME_WIDTH / 2 - 198, GAME_HEIGHT / 2 - 142, 396, 284, 6);
    overlay.add(panel);

    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 98, "PAUSED", {
      fontFamily: "Arial, sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#8cf8ff",
      stroke: "#02070d",
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(PANEL_DEPTH + 1).setShadow(0, 0, "#18e6ff", 12, true, true));

    this.pauseOverlayButtons.push(
      ...this.createMenuButton(GAME_WIDTH / 2 - 66, GAME_HEIGHT / 2 - 40, "Tiep tuc", () => {
        console.log("[UI] Resume clicked");
        this.setPaused(false);
      }),
      ...this.createMenuButton(GAME_WIDTH / 2 - 66, GAME_HEIGHT / 2 + 18, "Choi lai", () => this.restartRun()),
      ...this.createMenuButton(GAME_WIDTH / 2 - 66, GAME_HEIGHT / 2 + 76, "Ve menu", () => this.returnToMenu()),
    );
  }

  private destroyPauseOverlay() {
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
    for (const object of this.pauseOverlayButtons) object.destroy();
    this.pauseOverlayButtons.length = 0;
  }

  private destroyResultOverlay() {
    this.resultOverlay?.destroy();
    this.resultOverlay = undefined;
    for (const object of this.resultOverlayButtons) object.destroy();
    this.resultOverlayButtons.length = 0;
  }

  private cleanupGameScene() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.running = false;
    this.paused = false;
    this.stageClear = false;
    this.gameOver = false;
    this.matchEnded = false;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.input.enabled = true;
    this.input.keyboard?.off("keydown", this.onKeyDown);
    this.input.keyboard?.off("keyup", this.onKeyUp);
    touchControls.clearJust();
    this.downCodes.clear();
    this.justCodes.clear();
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.destroyPauseOverlay();
    this.destroyResultOverlay();
    for (const projectile of this.projectiles) {
      if (isGameObjectAlive(projectile.image)) projectile.image.destroy();
    }
    for (const pickup of this.pickups) {
      if (isGameObjectAlive(pickup.image)) pickup.image.destroy();
    }
    for (const area of this.activeAreas) {
      if (isGameObjectAlive(area.visual)) area.visual.destroy();
    }
    for (const enemy of this.enemies) {
      if (isGameObjectAlive(enemy.sprite)) enemy.destroy();
    }
    for (const player of this.players) {
      if (isGameObjectAlive(player.sprite)) player.destroy();
    }
    this.hud?.destroy();
    this.hud = undefined;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.activeAreas = [];
    this.players = [];
    this.defeatedLogged.clear();
    this.enrageLogged.clear();
    this.failLogCooldowns.clear();
    this.debugRects.length = 0;
    this.pauseOverlayButtons.length = 0;
    this.resultOverlayButtons.length = 0;
  }

  private restartRun() {
    if (this.transitioning) return;
    console.log("[UI] Restart clicked");
    this.addLog("Restart");
    const data: GameSceneData = {
      mode: this.gameMode,
      heroId: this.selectedHero.id,
      p1HeroId: this.selectedHero.id,
      p2HeroId: this.p2Hero.id,
      playerCount: this.playerCount,
    };
    this.cleanupGameScene();
    this.scene.stop("GameScene");
    this.scene.start("GameScene", data);
  }

  private returnToMenu(result?: { title: string; detail: string }) {
    if (this.transitioning) return;
    console.log("[UI] Back to menu clicked");
    this.addLog("Return menu");
    const payload = result
      ? {
        title: result.title,
        detail: result.detail,
        score: this.score,
        heroId: this.selectedHero.id,
        p1HeroId: this.selectedHero.id,
        p2HeroId: this.p2Hero.id,
        mode: this.gameMode,
        playerCount: this.playerCount,
      }
      : undefined;
    const heroId = this.selectedHero.id;
    const p2HeroId = this.p2Hero.id;
    const playerCount = this.playerCount;
    const mode = this.gameMode;
    this.cleanupGameScene();
    this.scene.stop("GameScene");
    this.scene.start("MenuScene", {
      heroId,
      p1HeroId: heroId,
      p2HeroId,
      mode,
      playerCount,
      result: payload,
    });
  }

  private spawnBasicSlashEffect(player: Player, attack: BasicAttackConfig) {
    const slash = this.add
      .image(player.sprite.x + player.facing * (attack.range * 0.45), player.sprite.y - 86, AssetKeys.slash1)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(player.facing < 0)
      .setTint(attack.effectColor)
      .setDisplaySize(attack.range + 18, 92);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: slash.scaleX * 1.18,
      scaleY: slash.scaleY * 1.18,
      duration: 160,
      onComplete: () => slash.destroy(),
    });
  }

  private spawnRisingBladeColumn(x: number, color: number) {
    const column = this.add.graphics().setDepth(DEPTHS.effect + 3).setBlendMode(Phaser.BlendModes.ADD);
    const shards: Phaser.GameObjects.GameObject[] = [];
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 330,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        const alpha = 1 - value;
        column.clear();
        column.fillStyle(color, 0.16 * alpha);
        column.fillEllipse(x, PLATFORM_Y - 122, 92 + value * 58, 285 + value * 70);
        column.lineStyle(7, color, 0.95 * alpha);
        column.lineBetween(x, PLATFORM_Y - 8, x + Math.sin(value * 16) * 12, PLATFORM_Y - 270 - value * 18);
        column.lineStyle(3, 0xffffff, 0.68 * alpha);
        column.lineBetween(x - 20, PLATFORM_Y - 18, x - 6, PLATFORM_Y - 235);
        column.lineBetween(x + 23, PLATFORM_Y - 26, x + 6, PLATFORM_Y - 252);
      },
      onComplete: () => column.destroy(),
    });
    for (let i = 0; i < 12; i++) {
      const shard = this.add
        .triangle(x + Phaser.Math.Between(-36, 36), PLATFORM_Y - 8, 0, 12, 6, 0, 12, 12, i % 3 === 0 ? 0xffffff : color, 0.86)
        .setDepth(DEPTHS.effect + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(Phaser.Math.FloatBetween(-0.8, 0.8));
      shards.push(shard);
      this.tweens.add({
        targets: shard,
        x: shard.x + Phaser.Math.Between(-58, 58),
        y: shard.y - Phaser.Math.Between(82, 190),
        alpha: 0,
        rotation: shard.rotation + Phaser.Math.FloatBetween(-2.2, 2.2),
        duration: 360 + i * 18,
        onComplete: () => shard.destroy(),
      });
    }
  }

  private spawnInfernoArcVisual(player: Player, skill: SkillConfig, range: number) {
    const x = player.sprite.x + player.facing * (range * 0.48);
    const y = player.sprite.y - 92;
    const slash = this.add
      .image(x, y, AssetKeys.slash2)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(player.facing < 0)
      .setTint(skill.effectColor)
      .setRotation(player.facing * -0.18)
      .setDisplaySize(range + 118, 214);
    const arc = this.add.graphics().setDepth(DEPTHS.effect + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        arc.clear();
        arc.lineStyle(14, skill.effectColor, 0.68 * (1 - value));
        arc.beginPath();
        const start = player.facing > 0 ? -1.35 : Math.PI + 1.35;
        const end = player.facing > 0 ? 1.35 : Math.PI - 1.35;
        arc.arc(player.sprite.x, y + 30, range * (0.64 + value * 0.22), start, end, player.facing < 0);
        arc.strokePath();
        arc.lineStyle(5, 0xfff0a2, 0.42 * (1 - value));
        arc.beginPath();
        arc.arc(player.sprite.x, y + 30, range * (0.45 + value * 0.16), start, end, player.facing < 0);
        arc.strokePath();
      },
      onComplete: () => arc.destroy(),
    });
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: slash.scaleX * 1.28,
      scaleY: slash.scaleY * 1.12,
      duration: 260,
      onComplete: () => slash.destroy(),
    });
    this.spawnFlameWisps(x, y, skill.effectColor);
  }

  private spawnFireTrail(x: number, facing: -1 | 1, skill: SkillConfig) {
    const fire = this.add.graphics().setDepth(DEPTHS.effect).setBlendMode(Phaser.BlendModes.ADD);
    const startX = x - facing * 118;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 600,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        fire.clear();
        for (let i = 0; i < 9; i++) {
          const px = startX + facing * i * 28;
          const flameHeight = 22 + Math.sin(this.time.now * 0.018 + i) * 8;
          fire.fillStyle(i % 2 === 0 ? skill.effectColor : 0xffd35a, 0.72 * (1 - value));
          fire.fillTriangle(px - 10, PLATFORM_Y - 5, px, PLATFORM_Y - flameHeight, px + 10, PLATFORM_Y - 5);
        }
        fire.lineStyle(3, skill.effectColor, 0.42 * (1 - value));
        fire.lineBetween(startX - facing * 14, PLATFORM_Y - 7, startX + facing * 252, PLATFORM_Y - 7);
      },
      onComplete: () => fire.destroy(),
    });
  }

  private spawnSlashEffect(player: Player, skill: SkillConfig, range: number) {
    const key = this.textures.exists(AssetKeys.slash2) ? AssetKeys.slash2 : AssetKeys.slash1;
    const height = skill.id === "inferno_arc" ? 156 : skill.id === "rising_blade" ? 146 : 118;
    const slash = this.add
      .image(player.sprite.x + player.facing * (range * 0.46), player.sprite.y - 90, key)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(player.facing < 0)
      .setTint(skill.effectColor)
      .setDisplaySize(range + 36, height);
    if (skill.id === "rising_blade") slash.setRotation(player.facing * -0.18);
    if (skill.id === "inferno_arc") this.spawnFlameWisps(player.sprite.x + player.facing * 88, player.sprite.y - 96, skill.effectColor);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: slash.scaleX * 1.22,
      scaleY: slash.scaleY * 1.22,
      duration: 240,
      onComplete: () => slash.destroy(),
    });
  }

  private spawnProjectileTrail(projectile: SkillProjectile) {
    const color = projectile.color;
    const x = projectile.image.x - projectile.facing * 58;
    const y = projectile.image.y + Phaser.Math.Between(-5, 5);

    if (projectile.skill?.id === "thunder_bolt") {
      const g = this.add.graphics().setDepth(DEPTHS.effect).setBlendMode(Phaser.BlendModes.ADD);
      g.lineStyle(2, color, 0.78);
      g.lineBetween(x - projectile.facing * 28, y - 8, x, y + 7);
      g.lineBetween(x, y + 7, x + projectile.facing * 28, y - 4);
      this.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
      return;
    }

    const trail = this.add
      .ellipse(x, y, projectile.skill?.id === "fire_burst" ? 28 : 22, projectile.skill?.id === "wind_pulse" ? 18 : 12, color, projectile.owner === "enemy" ? 0.38 : 0.52)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scaleX: projectile.skill?.id === "wind_pulse" ? 1.9 : 1.45,
      scaleY: 0.4,
      duration: projectile.skill?.id === "fire_burst" ? 180 : 140,
      onComplete: () => trail.destroy(),
    });
  }

  private spawnFlameWisps(x: number, y: number, color: number) {
    for (let i = 0; i < 7; i++) {
      const ember = this.add
        .ellipse(x + Phaser.Math.Between(-48, 48), y + Phaser.Math.Between(-28, 20), 12, 18, i % 2 === 0 ? 0xffd45f : color, 0.78)
        .setDepth(DEPTHS.effect + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ember,
        y: ember.y - Phaser.Math.Between(22, 54),
        alpha: 0,
        scaleX: 0.45,
        duration: 260 + i * 18,
        onComplete: () => ember.destroy(),
      });
    }
  }

  private spawnSlashAt(x: number, y: number, color: number, rotation: number) {
    const slash = this.add
      .image(x, y, AssetKeys.slash1)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setRotation(rotation)
      .setDisplaySize(150, 110);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: slash.scaleX * 1.25,
      scaleY: slash.scaleY * 1.25,
      duration: 220,
      onComplete: () => slash.destroy(),
    });
  }

  private spawnHitSpark(x: number, y: number, color: number) {
    const burst = this.add.graphics().setDepth(DEPTHS.effect + 2).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const length = Phaser.Math.Between(20, 48);
      burst.lineStyle(i % 3 === 0 ? 3 : 2, i % 4 === 0 ? 0xffffff : color, i % 3 === 0 ? 0.9 : 0.58);
      burst.lineBetween(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.62);
    }
    burst.fillStyle(color, 0.18);
    burst.fillCircle(x, y, 34);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 130,
      onComplete: () => burst.destroy(),
    });

    const spark = this.add
      .image(x, y, AssetKeys.hitSparksSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color);
    const frame = Phaser.Math.Between(0, 4);
    spark.setCrop(frame * 71, 0, 71, 145).setDisplaySize(74, 58);
    this.tweens.add({
      targets: spark,
      alpha: 0,
      scaleX: spark.scaleX * 1.35,
      scaleY: spark.scaleY * 1.35,
      duration: 190,
      onComplete: () => spark.destroy(),
    });
  }

  private spawnExplosion(x: number, y: number, large: boolean, color: number) {
    const ring = this.add.graphics().setDepth(DEPTHS.effect + 1).setBlendMode(Phaser.BlendModes.ADD);
    const radius = large ? 124 : 78;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: large ? 420 : 270,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        ring.clear();
        ring.lineStyle(large ? 6 : 4, color, 0.8 * (1 - value));
        ring.strokeEllipse(x, y + 18, 28 + radius * value, 12 + radius * 0.46 * value);
        ring.fillStyle(color, 0.11 * (1 - value));
        ring.fillCircle(x, y, radius * (0.18 + value * 0.72));
      },
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < (large ? 16 : 9); i++) {
      const shard = this.add
        .triangle(x, y + Phaser.Math.Between(-20, 22), 0, 12, 5, 0, 10, 12, i % 3 === 0 ? 0xffd36d : color, 0.72)
        .setDepth(DEPTHS.effect + 3)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(Phaser.Math.FloatBetween(-Math.PI, Math.PI));
      this.tweens.add({
        targets: shard,
        x: x + Phaser.Math.Between(-radius, radius),
        y: y + Phaser.Math.Between(-radius, radius * 0.4),
        alpha: 0,
        rotation: shard.rotation + Phaser.Math.FloatBetween(-2, 2),
        duration: large ? 460 : 310,
        onComplete: () => shard.destroy(),
      });
    }

    const explosion = this.add
      .image(x, y, AssetKeys.explosionsSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color);
    explosion.setCrop(330, 0, 155, 155).setDisplaySize(large ? 220 : 132, large ? 188 : 116);
    this.tweens.add({
      targets: explosion,
      alpha: 0,
      scaleX: explosion.scaleX * 1.45,
      scaleY: explosion.scaleY * 1.45,
      duration: large ? 380 : 260,
      onComplete: () => explosion.destroy(),
    });
  }

  private spawnNovaCharge(player: Player, color: number) {
    const aura = this.add.graphics().setDepth(DEPTHS.effect + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 200,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        aura.clear();
        aura.lineStyle(3, color, 0.82);
        aura.strokeCircle(player.sprite.x, player.sprite.y - 92, 72 - value * 30);
        aura.fillStyle(color, 0.13 + value * 0.16);
        aura.fillCircle(player.sprite.x, player.sprite.y - 92, 44 + value * 18);
      },
      onComplete: () => aura.destroy(),
    });
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const shard = this.add
        .triangle(
          player.sprite.x + Math.cos(angle) * 118,
          player.sprite.y - 92 + Math.sin(angle) * 62,
          0,
          10,
          5,
          0,
          10,
          10,
          color,
          0.78,
        )
        .setDepth(DEPTHS.effect + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle);
      this.tweens.add({
        targets: shard,
        x: player.sprite.x,
        y: player.sprite.y - 92,
        alpha: 0,
        duration: 190,
        onComplete: () => shard.destroy(),
      });
    }
  }

  private spawnPlasmaRing(x: number, y: number, radius: number, color: number) {
    const ring = this.add.graphics().setDepth(DEPTHS.effect + 3).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(5, color, 0.9);
    ring.strokeCircle(x, y, 38);
    ring.lineStyle(2, 0xffffff, 0.56);
    ring.strokeCircle(x, y, 20);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 360,
      onUpdate: (tween) => {
        const value = tween.getValue();
        if (value === null) return;
        ring.clear();
        ring.lineStyle(5, color, 0.9 * (1 - value));
        ring.strokeCircle(x, y, 38 + radius * value);
        ring.lineStyle(2, 0xffffff, 0.42 * (1 - value));
        ring.strokeCircle(x, y, 22 + radius * 0.62 * value);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private spawnPlasmaDome(x: number, y: number, radius: number, color: number) {
    const dome = this.add.graphics().setDepth(DEPTHS.effect + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 420,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        dome.clear();
        dome.fillStyle(color, 0.2 * (1 - value));
        dome.fillCircle(x, y, radius * (0.25 + value * 0.75));
        dome.lineStyle(2, 0xffffff, 0.32 * (1 - value));
        for (let i = 0; i < 14; i++) {
          const angle = (Math.PI * 2 * i) / 14 + value * 0.8;
          const inner = radius * value * 0.45;
          const outer = radius * value;
          dome.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
        }
      },
      onComplete: () => dome.destroy(),
    });
  }

  private spawnSpiralBurst(x: number, y: number, radius: number, color: number) {
    const g = this.add.graphics().setDepth(DEPTHS.effect + 2).setBlendMode(Phaser.BlendModes.ADD);
    const turns = 2.35;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 300,
      onUpdate: (tween) => {
        const value = tween.getValue();
        if (value === null) return;
        g.clear();
        g.lineStyle(4, color, 0.75 * (1 - value));
        for (let arm = 0; arm < 3; arm++) {
          let lastX = x;
          let lastY = y;
          for (let i = 1; i < 18; i++) {
            const pct = i / 18;
            const angle = arm * 2.1 + pct * Math.PI * turns + value * 2.2;
            const px = x + Math.cos(angle) * radius * pct;
            const py = y + Math.sin(angle) * radius * pct * 0.52;
            g.lineBetween(lastX, lastY, px, py);
            lastX = px;
            lastY = py;
          }
        }
      },
      onComplete: () => g.destroy(),
    });
  }

  private drawElectricCageVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
    graphics.clear();
    const nodes: Phaser.Math.Vector2[] = [];
    graphics.lineStyle(3, color, 0.72 * alpha);
    graphics.strokeEllipse(x, y + 38, radius * 1.72, radius * 0.52);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 + this.time.now * 0.004;
      nodes.push(new Phaser.Math.Vector2(x + Math.cos(angle) * radius * 0.82, y + 38 + Math.sin(angle) * radius * 0.25));
    }
    graphics.lineStyle(2, 0xc9fbff, 0.48 * alpha);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const next = nodes[(i + 1) % nodes.length];
      const midX = (node.x + next.x) / 2 + Math.sin(this.time.now * 0.02 + i) * 12;
      const midY = (node.y + next.y) / 2 + Math.cos(this.time.now * 0.018 + i) * 8;
      graphics.lineBetween(node.x, node.y, midX, midY);
      graphics.lineBetween(midX, midY, next.x, next.y);
      graphics.fillStyle(i % 2 === 0 ? color : 0xffffff, 0.86 * alpha);
      graphics.fillCircle(node.x, node.y, 5 + Math.sin(this.time.now * 0.014 + i) * 1.5);
      graphics.lineStyle(2, color, 0.34 * alpha);
      graphics.lineBetween(node.x, node.y, x, y - 72);
      graphics.lineStyle(2, 0xc9fbff, 0.48 * alpha);
    }
  }

  private drawToxicSpiralVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
    graphics.clear();
    const time = this.time.now * 0.006;
    graphics.fillStyle(color, 0.08 * alpha);
    graphics.fillCircle(x, y, radius * 0.82);
    for (let arm = 0; arm < 4; arm++) {
      graphics.lineStyle(5, arm % 2 === 0 ? color : 0x9fffd2, 0.68 * alpha);
      let lastX = x;
      let lastY = y;
      for (let i = 1; i <= 20; i++) {
        const pct = i / 20;
        const angle = arm * Math.PI * 0.5 + pct * Math.PI * 2.6 - time * 2.1;
        const px = x + Math.cos(angle) * radius * pct;
        const py = y + Math.sin(angle) * radius * pct * 0.58;
        graphics.lineBetween(lastX, lastY, px, py);
        lastX = px;
        lastY = py;
      }
    }
    graphics.lineStyle(2, 0xb6ffd4, 0.42 * alpha);
    graphics.strokeCircle(x, y, radius * (0.45 + Math.sin(time * 2) * 0.08));
  }

  private flashUltimate(color: number, duration: number) {
    const rgb = Phaser.Display.Color.IntegerToColor(color);
    this.cameras.main.flash(duration, rgb.red, rgb.green, rgb.blue, false);
  }

  private spawnMeteor(x: number, skill: SkillConfig) {
    const column = this.add.graphics().setDepth(DEPTHS.effect + 3).setBlendMode(Phaser.BlendModes.ADD);
    column.fillStyle(0xffd45f, 0.18);
    column.fillEllipse(x, PLATFORM_Y - 70, 128, 260);
    column.lineStyle(4, skill.effectColor, 0.75);
    column.strokeEllipse(x, PLATFORM_Y - 70, 96, 245);
    const beam = this.add
      .image(x, PLATFORM_Y - 300, AssetKeys.energyBlastSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(skill.effectColor)
      .setRotation(Math.PI / 2);
    beam.setCrop(286, 0, 214, 145).setDisplaySize(310, 86);
    this.tweens.add({
      targets: beam,
      y: PLATFORM_Y - 96,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        beam.destroy();
        this.spawnFlameWisps(x, PLATFORM_Y - 92, skill.effectColor);
      },
    });
    this.tweens.add({ targets: column, alpha: 0, duration: 340, onComplete: () => column.destroy() });
  }

  private spawnMeteorWarning(x: number, color: number) {
    const marker = this.add.graphics().setDepth(DEPTHS.effect + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 400,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        marker.clear();
        marker.lineStyle(3, color, 0.88);
        marker.strokeEllipse(x, PLATFORM_Y - 8, 138 - value * 32, 32 - value * 8);
        marker.lineStyle(2, 0xfff0a2, 0.62);
        marker.lineBetween(x - 58, PLATFORM_Y - 8, x + 58, PLATFORM_Y - 8);
        marker.lineBetween(x, PLATFORM_Y - 36, x, PLATFORM_Y + 12);
      },
      onComplete: () => marker.destroy(),
    });
  }

  private spawnFirePillar(x: number, color: number) {
    const pillar = this.add.graphics().setDepth(DEPTHS.effect + 4).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 480,
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        const alpha = 1 - value;
        pillar.clear();
        pillar.fillStyle(color, 0.26 * alpha);
        pillar.fillEllipse(x, PLATFORM_Y - 126, 118 + value * 36, 292 + value * 90);
        pillar.fillStyle(0xfff0a2, 0.18 * alpha);
        pillar.fillEllipse(x, PLATFORM_Y - 135, 54, 280);
        for (let i = 0; i < 8; i++) {
          const px = x - 48 + i * 14;
          pillar.fillStyle(i % 2 === 0 ? color : 0xffd35a, 0.72 * alpha);
          pillar.fillTriangle(px - 8, PLATFORM_Y - 6, px + Math.sin(this.time.now * 0.02 + i) * 18, PLATFORM_Y - 166 - value * 80, px + 12, PLATFORM_Y - 6);
        }
      },
      onComplete: () => pillar.destroy(),
    });
  }

  private spawnLightningWarning(x: number, y: number, color: number) {
    const marker = this.add.graphics().setDepth(DEPTHS.effect + 3).setBlendMode(Phaser.BlendModes.ADD);
    marker.lineStyle(3, color, 0.82);
    marker.strokeCircle(x, y + 45, 34);
    marker.lineStyle(2, 0xffffff, 0.5);
    marker.lineBetween(x, y - 190, x, y + 48);
    this.tweens.add({ targets: marker, alpha: 0, duration: 95, onComplete: () => marker.destroy() });
  }

  private spawnLightning(x: number, y: number, color: number) {
    const zigzag = this.add.graphics().setDepth(DEPTHS.effect + 5).setBlendMode(Phaser.BlendModes.ADD);
    zigzag.lineStyle(4, color, 0.95);
    let lastX = x + Phaser.Math.Between(-18, 18);
    let lastY = y - 260;
    for (let i = 1; i <= 7; i++) {
      const nextX = x + Phaser.Math.Between(-30, 30);
      const nextY = y - 260 + i * 38;
      zigzag.lineBetween(lastX, lastY, nextX, nextY);
      lastX = nextX;
      lastY = nextY;
    }
    this.tweens.add({ targets: zigzag, alpha: 0, duration: 180, onComplete: () => zigzag.destroy() });
    const bolt = this.add
      .image(x, y - 90, AssetKeys.energyBlastSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setRotation(Math.PI / 2);
    bolt.setCrop(286, 0, 214, 145).setDisplaySize(240, 58);
    this.tweens.add({
      targets: bolt,
      alpha: 0,
      scaleX: bolt.scaleX * 1.1,
      scaleY: bolt.scaleY * 1.25,
      duration: 180,
      onComplete: () => bolt.destroy(),
    });
    this.spawnHitSpark(x, y, color);
  }

  private spawnHeroAfterimage(player: Player, x: number, groundY: number, color: number, targetX: number) {
    const ghost = this.add
      .image(x, groundY, player.sprite.texture.key)
      .setOrigin(0.5, 1)
      .setScale(player.sprite.scaleX, player.sprite.scaleY)
      .setFlipX(targetX < x)
      .setTint(color)
      .setAlpha(0.54)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTHS.player + 4);
    this.tweens.add({
      targets: ghost,
      x: targetX,
      alpha: 0,
      duration: 170,
      onComplete: () => ghost.destroy(),
    });
  }

  private spawnShockwave(x: number, facing: -1 | 1) {
    const shock = this.add
      .image(x, PLATFORM_Y - 42, AssetKeys.slash2)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(facing < 0)
      .setTint(0x67f6ff)
      .setDisplaySize(190, 86);
    this.tweens.add({
      targets: shock,
      alpha: 0,
      x: x + facing * 70,
      scaleX: shock.scaleX * 1.2,
      duration: 260,
      onComplete: () => shock.destroy(),
    });
  }

  private spawnDashTrail(player: Player) {
    for (let i = 0; i < 3; i++) {
      const ghost = this.add
        .image(player.sprite.x - player.facing * i * 24, player.sprite.y, player.sprite.texture.key)
        .setOrigin(0.5, 1)
        .setScale(player.sprite.scaleX, player.sprite.scaleY)
        .setFlipX(player.facing < 0)
        .setTint(i === 0 ? 0xffffff : player.hero.themeColor)
        .setAlpha(0.32 - i * 0.07)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTHS.player - 2);
      this.tweens.add({
        targets: ghost,
        alpha: 0,
        x: ghost.x - player.facing * (48 + i * 26),
        scaleX: ghost.scaleX * (1 + i * 0.08),
        duration: 190 + i * 55,
        onComplete: () => ghost.destroy(),
      });
    }

    const streak = this.add.graphics().setDepth(DEPTHS.effect).setBlendMode(Phaser.BlendModes.ADD);
    streak.lineStyle(5, player.hero.themeColor, 0.62);
    streak.lineBetween(player.sprite.x - player.facing * 26, player.sprite.y - 92, player.sprite.x - player.facing * 210, player.sprite.y - 94);
    streak.lineStyle(2, 0xffffff, 0.42);
    streak.lineBetween(player.sprite.x - player.facing * 8, player.sprite.y - 118, player.sprite.x - player.facing * 154, player.sprite.y - 126);
    this.tweens.add({ targets: streak, alpha: 0, duration: 180, onComplete: () => streak.destroy() });
  }

  private createPkStatusText() {
    if (this.gameMode !== "pk") return;
    this.pkStatusText = this.add
      .text(GAME_WIDTH / 2, 20, "PK MODE  99", {
        fontFamily: "Arial, sans-serif",
        fontSize: "22px",
        fontStyle: "900",
        color: "#ffd66d",
        stroke: "#02070d",
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 9)
      .setShadow(0, 0, "#ffd66d", 8, true, true);
  }

  private projectileBounds(image: Phaser.GameObjects.Image): RectLike {
    return {
      x: image.x - 54,
      y: image.y - 22,
      width: 108,
      height: 44,
    };
  }

  private updateCamera(dt: number) {
    if (this.gameMode === "pk") {
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, 0, Math.min(1, dt * 8));
      this.updateParallax(0);
      return;
    }

    const alive = this.players.filter((player) => player.alive);
    const focus = alive.length > 0 ? alive.reduce((sum, player) => sum + player.sprite.x, 0) / alive.length : PLAYER_START_X;
    const front = alive.length > 0 ? Math.max(...alive.map((player) => player.sprite.x)) : focus;
    const target = Phaser.Math.Clamp(Math.max(focus - GAME_WIDTH * 0.4, front - GAME_WIDTH * 0.62), 0, WORLD_WIDTH - GAME_WIDTH);
    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, target, Math.min(1, dt * 5));
    this.updateParallax(this.cameras.main.scrollX);
  }

  private updateParallax(scrollX: number) {
    const time = this.time.now * 0.001;
    if (this.background) {
      this.background.tilePositionX = scrollX * 0.16 + time * 5;
      this.background.tilePositionY = Math.sin(time * 0.35) * 3;
    }
    for (const item of this.atmosphereLayers) {
      item.layer.tilePositionX = scrollX * item.factor + time * item.speed;
      item.layer.tilePositionY = Math.sin(time * item.drift + item.factor * 40) * 9;
    }
    if (this.neonRain) {
      this.neonRain.y = (Math.sin(time * 0.4) + 1) * 3;
      this.neonRain.alpha = 0.75 + Math.sin(time * 0.9) * 0.15;
    }
  }

  private updateHudAndMessage(dt: number) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageText) {
      this.messageText.setVisible(this.messageTimer > 0);
      this.messageText.setAlpha(Math.min(1, this.messageTimer));
    }
    this.updateLogText();
    if (this.pkStatusText) this.pkStatusText.setText(`PK MODE  ${Math.ceil(this.pkTimer).toString().padStart(2, "0")}`);
    this.hud?.update(this.players, this.score, this.enemyBarState());
  }

  private enemyBarState(): EnemyBarState | undefined {
    if (this.gameMode === "pk") return undefined;
    const boss = this.enemies.find((enemy) => enemy.alive && enemy.isBoss());
    if (boss) return boss.getBarState();
    const elite = this.enemies
      .filter((enemy) => enemy.alive && enemy.hp / enemy.maxHp > 0.65)
      .sort((a, b) => b.maxHp - a.maxHp)[0];
    return elite?.getBarState();
  }

  private drawDebug() {
    if (!this.debugGraphics) return;
    this.debugGraphics.clear();
    for (let i = this.debugRects.length - 1; i >= 0; i--) {
      this.debugRects[i].life -= 1 / 60;
      if (this.debugRects[i].life <= 0) this.debugRects.splice(i, 1);
    }
    if (!this.debugHitboxes) return;
    this.debugGraphics.setScrollFactor(0);
    const cameraX = this.cameras.main.scrollX;
    const drawRect = (rect: RectLike, color: number) => {
      this.debugGraphics!.lineStyle(2, color, 0.9);
      this.debugGraphics!.strokeRect(rect.x - cameraX, rect.y, rect.width, rect.height);
    };
    for (const player of this.players) drawRect(player.getBounds(), 0x4ef3a5);
    for (const enemy of this.enemies) drawRect(enemy.getBounds(), 0xff5b6d);
    for (const projectile of this.projectiles) drawRect(this.projectileBounds(projectile.image), 0xffef72);
    for (const pickup of this.pickups) drawRect(this.pickupBounds(pickup.image), 0xffd66d);
    for (const item of this.debugRects) drawRect(item.rect, item.color);
  }

  private handleDebugToggles() {
    if (this.isJust("KeyH")) {
      this.debugHitboxes = !this.debugHitboxes;
      this.addLog(`Hitbox debug ${this.debugHitboxes ? "ON" : "OFF"}`);
    }
    if (this.isJust("F10")) {
      this.playtestLogEnabled = !this.playtestLogEnabled;
      this.updateLogText();
    }
  }

  private addLog(message: string) {
    const line = `[${((this.time.now / 1000) % 999).toFixed(1)}] ${message}`;
    this.logLines.unshift(line);
    this.logLines.length = Math.min(this.logLines.length, 7);
    if (this.playtestLogEnabled) console.info(line);
    this.updateLogText();
  }

  private addThrottledLog(key: string, message: string, seconds: number) {
    const last = this.failLogCooldowns.get(key) ?? -Infinity;
    const now = this.time.now;
    if (now - last < seconds * 1000) return;
    this.failLogCooldowns.set(key, now);
    this.addLog(message);
  }

  private updateLogText() {
    if (!this.logText) return;
    this.logText.setVisible(this.playtestLogEnabled);
    if (this.playtestLogEnabled) this.logText.setText(["PLAYTEST LOG", ...this.logLines].join("\n"));
  }

  private showMessage(message: string, seconds: number) {
    this.messageText?.setText(message);
    this.messageTimer = seconds;
  }

  private biggestEnemy() {
    return this.enemies.filter((enemy) => enemy.alive).sort((a, b) => b.maxHp - a.maxHp)[0];
  }

  private nearestEnemy(x: number, radius: number) {
    return this.enemies
      .filter((enemy) => enemy.alive && Math.abs(enemy.sprite.x - x) <= radius)
      .sort((a, b) => Math.abs(a.sprite.x - x) - Math.abs(b.sprite.x - x))[0];
  }

  private nearestPkOpponent(player: Player, radius: number) {
    return this.pkOpponents(player)
      .filter((target) => Math.abs(target.sprite.x - player.sprite.x) <= radius)
      .sort((a, b) => Math.abs(a.sprite.x - player.sprite.x) - Math.abs(b.sprite.x - player.sprite.x))[0];
  }

  private isDown(...codes: string[]) {
    return codes.some((code) => this.downCodes.has(code));
  }

  private isJust(...codes: string[]) {
    return codes.some((code) => this.justCodes.has(code));
  }
}

function isGameObjectAlive<T extends Phaser.GameObjects.GameObject>(object?: T | null): object is T {
  return Boolean(object?.scene && object.active);
}
