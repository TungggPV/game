import Phaser from "phaser";
import { ARENA_WIDTH, DEPTH, FONT, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, loadBest, type GameMode } from "../config/constants";
import { STAGES, UPGRADES, type EnemyType, type StageDef, type Upgrade } from "../config/content";
import { ARMOR_CORES, type ArmorCore } from "../systems/armorCores";
import { heroById, type SkillDef } from "../config/heroes";
import type { Actor, Hit } from "../entities/Actor";
import type { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { EnvironmentProp, type PropType } from "../entities/EnvironmentProp";
import { EventCallbacks } from "../systems/callbacks";
import { CombatSystem } from "../systems/combat";
import { BotControls, consumeTouch, type Controls, PlayerControls, setSceneFlag } from "../systems/controls";
import { FieldSystem } from "../systems/fields";
import { Fx, PALETTE, type Palette } from "../systems/Fx";
import { HazardSystem } from "../systems/hazards";
import { expDecay, FramePacer } from "../systems/motionSynth";
import { PickupSystem } from "../systems/pickups";
import { addCoins, loadProgress, saveDailyRecord, saveEndlessScore, saveProgress, unlockEntry } from "../systems/progress";
import { ProjectileSystem, type ProjectileSpec } from "../systems/projectiles";
import { sfx } from "../systems/sfx";
import { music } from "../systems/music";
import { SpawnDirector } from "../systems/spawnDirector";
import { getDailyDateString } from "../config/daily";

export type GameData = {
  mode: GameMode;
  heroes: string[];
  botDifficulty?: "easy" | "normal" | "hard";
  handicaps?: [number, number];
  sameHeroAllowed?: boolean;
};
export type Phase = "intro" | "fight" | "advance" | "stageClear" | "upgrade" | "pkIntro" | "pkFight" | "roundEnd" | "over";
export type ResultData = { win: boolean; title: string; detail: string; score: number; best: number; mode: GameMode };

export class GameScene extends Phaser.Scene {
  mode: GameMode = "solo";
  heroIds: string[] = [];
  heroes: Hero[] = [];
  enemies: Enemy[] = [];
  fx!: Fx;
  dt = 0;
  phase: Phase = "intro";
  stageIndex = 0;
  waveIndex = 0;
  score = 0;
  pkTimer = 99;
  pkRound = 1;
  pkWins = [0, 0];
  boss?: Enemy;
  timeScale = 1;
  perfectDodges = 0;
  private timeScaleTimer = 0;
  pendingCoins = 0;
  gameStartTime = 0;
  bossStartTime = 0;
  arenaMin = 0;
  arenaMax = ARENA_WIDTH;
  readonly groundY = GROUND_Y;
  botDifficulty?: "easy" | "normal" | "hard";
  handicaps?: [number, number];
  activeModifier: "none" | "fast" | "lava" | "no_heal" | "double_shot" = "none";
  framePacer = new FramePacer();

  // Subsystems
  combatSys!: CombatSystem;
  spawnDirector!: SpawnDirector;
  projectileSys!: ProjectileSystem;
  fieldSys!: FieldSystem;
  hazardSys!: HazardSystem;
  pickupSys!: PickupSystem;
  callbacks!: EventCallbacks;

  private bgFar?: Phaser.GameObjects.TileSprite;
  private bgFarScale = 1;
  private geyserTimer = 4;
  private voidPullTimer = 11;
  private stormTimer = 9;
  private timeRift?: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    timeLeft: number;
    container: Phaser.GameObjects.Container;
    bar: Phaser.GameObjects.Rectangle;
    timerText: Phaser.GameObjects.Text;
  };
  private props: EnvironmentProp[] = [];
  private bg!: Phaser.GameObjects.TileSprite;
  private bgScale = 1;
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustFgEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lampCones: Phaser.GameObjects.Image[] = [];
  private neonGlows: { img: Phaser.GameObjects.Image; baseAlpha: number; speed: number; seed: number }[] = [];
  private groundVignette?: Phaser.GameObjects.Rectangle;
  private pauseKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor(key = "game") {
    super(key);
  }

  get combo() { return this.combatSys?.combo ?? 0; }
  set combo(v: number) { if (this.combatSys) this.combatSys.combo = v; }
  get hitstop() { return this.combatSys?.hitstop ?? 0; }
  set hitstop(v: number) { if (this.combatSys) this.combatSys.hitstop = v; }
  get stage(): StageDef { return STAGES[this.mode === "pk" ? 0 : this.stageIndex]; }
  get worldWidth() { return this.mode === "pk" ? ARENA_WIDTH : ARENA_WIDTH * this.stage.waves.length; }

  init(data?: Partial<GameData> & { heroId?: string }) {
    this.mode = data?.mode ?? "solo";
    this.heroIds = data?.heroes ?? (data?.heroId ? [data.heroId] : ["nova_blade"]);
    this.botDifficulty = data?.botDifficulty;
    this.handicaps = data?.handicaps;
    this.activeModifier = "none";
    this.heroes = [];
    this.enemies = [];
    this.stageIndex = 0;
    this.waveIndex = 0;
    this.score = 0;
    this.pkRound = 1;
    this.pkWins = [0, 0];
    this.boss = undefined;
    this.timeScale = 1;
    this.timeScaleTimer = 0;
    this.perfectDodges = 0;
    this.pendingCoins = 0;
    this.gameStartTime = Date.now();
    this.bossStartTime = 0;
  }

  create() {
    setSceneFlag("game");
    this.fx = new Fx(this);
    this.combatSys = new CombatSystem(this);
    this.spawnDirector = new SpawnDirector(this);
    this.projectileSys = new ProjectileSystem(this);
    this.fieldSys = new FieldSystem(this);
    this.hazardSys = new HazardSystem(this);
    this.pickupSys = new PickupSystem(this);
    this.callbacks = new EventCallbacks(this);

    if (this.mode === "coop") this.cameras.main.setZoom(0.9);
    this.buildWorld();

    const count = this.mode === "solo" || this.mode === "endless" || this.mode === "bossrush" || this.mode === "daily" ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      const def = heroById(this.heroIds[i] ?? this.heroIds[0]);
      const x = this.mode === "pk" ? (i === 0 ? 300 : GAME_WIDTH - 300) : 220 + i * 110;
      let ctrl: Controls;
      if (this.mode === "pk" && i === 1 && this.botDifficulty) {
        ctrl = new BotControls(() => this.heroes[1], () => this.heroes[0], this.botDifficulty);
      } else {
        ctrl = new PlayerControls(this, i as 0 | 1);
      }
      const handicap = this.handicaps ? this.handicaps[i] : 1;
      const hpOverride = this.mode === "pk" ? Math.round(360 * handicap) : undefined;
      const hero = new Hero(this, x, def, i as 0 | 1, ctrl, hpOverride);
      if (this.mode === "pk") hero.energy = 20;
      this.heroes.push(hero);
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.pauseKeys = [K.P, K.ESC].map((k) => this.input.keyboard!.addKey(k));
    music.start(this.stageIndex === 4 || this.mode === "bossrush" ? "boss" : "stage");

    // Launch Cyberpunk HUD (Step 4)
    this.scene.launch("ui");
    this.scene.bringToTop("ui");

    this.events.once("shutdown", () => {
      music.stop();
      this.scene.stop("ui");
      this.props.forEach((p) => p.destroy());
      this.props = [];
      this.dustEmitter?.destroy();
      this.dustFgEmitter?.destroy();
      this.lampCones.forEach((c) => c.destroy());
      this.lampCones = [];
      this.neonGlows.forEach((n) => n.img.destroy());
      this.neonGlows = [];
      this.groundVignette?.destroy();
    });
    if (this.mode === "pk") this.startPkRound();
    else this.startStage();
  }

  private phaseTimer = 0;

  buildWorld() {
    const stage = this.stage;
    const mirKey = stage.background + "_mirrored";
    const bgKey = this.textures.exists(mirKey) ? mirKey : stage.background;
    const tex = this.textures.get(bgKey).getSourceImage();
    this.bgScale = GAME_HEIGHT / tex.height;
    this.bgFarScale = this.bgScale * 0.9;
    this.bgFar?.destroy();
    this.bg?.destroy();
    this.dustEmitter?.destroy();
    this.dustFgEmitter?.destroy();
    this.lampCones.forEach((c) => c.destroy());
    this.lampCones = [];
    this.groundVignette?.destroy();
    this.neonGlows.forEach((n) => n.img.destroy());
    this.neonGlows = [];

    // 1. Far background layer (bgFar): Far cyberpunk city skyline, scrolling slow at 0.15x
    // Has a cool cyan-purple atmospheric fog tint
    const farTexKey = this.stageIndex === 3
      ? (this.textures.exists("bg_orbit_mirrored") ? "bg_orbit_mirrored" : "bg_orbit")
      : this.stageIndex === 4
      ? (this.textures.exists("bg_void_singularity_mirrored") ? "bg_void_singularity_mirrored" : "bg_void_singularity")
      : bgKey;
    this.bgFar = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, farTexKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(this.bgFarScale)
      .setTint(0x5b5490)
      .setAlpha(0.48)
      .setDepth(DEPTH.bg - 1);

    // 2. Midground street layer (bg): Full 720px height with Mirrored Horizontal Tiling (zero vertical seams)
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, bgKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(this.bgScale)
      .setDepth(DEPTH.bg);

    // Soft foreground vignette at the very bottom edge (y=660 to 720) so the curb details stay visible while HUD is clean
    this.groundVignette = this.add
      .rectangle(0, 660, ARENA_WIDTH * 3 + GAME_WIDTH, 60, 0x01050a, 0.4)
      .setOrigin(0)
      .setDepth(DEPTH.floor);

    this.cameras.main.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(stage.floor);

    // 3. Per-stage atmospheric VFX & lighting
    this.buildStageVFX(stage);

    // 4. Dual-layer atmospheric particles — colors & behavior tuned per stage
    const dustColors = [
      [0x18e6ff, 0xa855f7],     // Stage 1: Neon city cyan/purple
      [0x37ffb0, 0x22dd88],     // Stage 2: Lab sewer green/teal
      [0xff6a2a, 0xffaa44],     // Stage 3: Lava fortress orange/amber
      [0xa855f7, 0x6366f1],     // Stage 4: Orbit purple/indigo
      [0xd946ef, 0x818cf8],     // Stage 5: Void magenta/lavender
    ];
    const fgDustColors = [
      [0x67e8f9, 0xf472b6, 0xffd07a],  // Stage 1
      [0x4ade80, 0xfbbf24, 0x34d399],  // Stage 2
      [0xff4500, 0xffa040, 0xffdd55],  // Stage 3
      [0x818cf8, 0xc084fc, 0xffffff],  // Stage 4
      [0xd946ef, 0xf0abfc, 0x67e8f9],  // Stage 5
    ];
    const si = Math.min(this.stageIndex, 4);
    this.dustEmitter = this.add
      .particles(0, 0, "dot", {
        x: { min: 0, max: this.worldWidth },
        y: { min: 80, max: GROUND_Y },
        lifespan: { min: 4000, max: 8000 },
        speedX: { min: -10, max: 15 },
        speedY: { min: -8, max: -22 },
        scale: { start: 0.4, end: 0.1 },
        alpha: { start: 0, end: 0.22 },
        tint: dustColors[si],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 220,
        quantity: 1,
      })
      .setDepth(DEPTH.bg + 2);

    this.dustFgEmitter = this.add
      .particles(0, 0, "dot", {
        x: { min: 0, max: this.worldWidth },
        y: { min: 100, max: GROUND_Y },
        lifespan: { min: 3000, max: 6000 },
        speedX: { min: -22, max: 30 },
        speedY: { min: -16, max: -38 },
        scale: { start: 0.65, end: 0.18 },
        alpha: { start: 0, end: 0.32 },
        tint: fgDustColors[si],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 240,
        quantity: 1,
      })
      .setDepth(DEPTH.fx + 10);

    // 5. Spawn environment props (Crate, Barrel, Supply Chest)
    this.props.forEach((p) => p.destroy());
    this.props = [];
    const propPatterns: Array<{ offset: number; type: PropType }> = [
      { offset: 420, type: "crate_energy" },
      { offset: 780, type: "barrel" },
      { offset: 1140, type: "crate_gold" },
      { offset: 1680, type: "crate_health" },
      { offset: 2040, type: "chest" },
      { offset: 2420, type: "crate_energy" },
      { offset: 2920, type: "barrel" },
      { offset: 3260, type: "chest" },
    ];
    for (const p of propPatterns) {
      if (p.offset < this.worldWidth - 100) {
        this.props.push(new EnvironmentProp(this, p.offset, p.type));
      }
    }
  }

  /** Per-stage atmospheric VFX & lighting */
  private buildStageVFX(stage: StageDef) {
    const ww = this.worldWidth;

    if (this.stageIndex === 0) {
      // === STAGE 1: Neon City — Street lamps, neon sign glow, rain streaks ===
      for (let lx = 320; lx < ww; lx += 480) {
        const cone = this.add
          .image(lx, 470, "lamp_cone")
          .setDisplaySize(160, 200)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.2)
          .setDepth(DEPTH.bg + 1);
        this.lampCones.push(cone);
      }
      for (let nx = 200; nx < ww; nx += 420) {
        const signGlow = this.add
          .image(nx, 605, "glow")
          .setScale(1.2, 0.4)
          .setTint(0x18e6ff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: signGlow, baseAlpha: 0.35, speed: 3.2, seed: nx });
        const lampGlow = this.add
          .image(nx + 180, 410, "core")
          .setScale(0.8, 0.8)
          .setTint(0xf43f5e)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: lampGlow, baseAlpha: 0.4, speed: 4.5, seed: nx + 77 });
      }

    } else if (this.stageIndex === 1) {
      // === STAGE 2: Lab Sewer — Green toxic fog, dripping pipe lights, warning lights ===
      for (let gx = 180; gx < ww; gx += 360) {
        // Toxic green fog pools on floor
        const fogGlow = this.add
          .image(gx, GROUND_Y - 20, "glow")
          .setScale(2.0, 0.35)
          .setTint(0x22cc66)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: fogGlow, baseAlpha: 0.25, speed: 1.5, seed: gx * 1.7 });
      }
      for (let wx = 300; wx < ww; wx += 550) {
        // Red warning lights blinking on walls
        const warn = this.add
          .image(wx, 280, "core")
          .setScale(0.5, 0.5)
          .setTint(0xff2222)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: warn, baseAlpha: 0.5, speed: 6.0, seed: wx * 2.3 });
      }
      for (let px = 420; px < ww; px += 400) {
        // Dim overhead lab lights
        const labLight = this.add
          .image(px, 320, "lamp_cone")
          .setDisplaySize(100, 160)
          .setTint(0x44ff88)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.12)
          .setDepth(DEPTH.bg + 1);
        this.lampCones.push(labLight);
      }

    } else if (this.stageIndex === 2) {
      // === STAGE 3: Lava Fortress — Lava glow, ember particles, heat shimmer ===
      for (let lx = 150; lx < ww; lx += 300) {
        // Orange lava underlight glow on floor
        const lavaGlow = this.add
          .image(lx, GROUND_Y - 10, "glow")
          .setScale(1.8, 0.4)
          .setTint(0xff4400)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: lavaGlow, baseAlpha: 0.3, speed: 2.2, seed: lx * 1.1 });
      }
      for (let fx = 240; fx < ww; fx += 480) {
        // Forge fire wall sconces
        const forge = this.add
          .image(fx, 350, "flame")
          .setScale(1.2)
          .setTint(0xff6622)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: forge, baseAlpha: 0.6, speed: 8.0, seed: fx * 3.3 });
      }

    } else if (this.stageIndex === 3) {
      // === STAGE 4: Orbit — Sunbeam flare, micro-debris streaks, star shimmer ===
      // Solar flare on the right edge
      const solarFlare = this.add
        .image(ww - 200, 180, "glow")
        .setScale(5.0, 3.5)
        .setTint(0xffeedd)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.15)
        .setDepth(DEPTH.bg + 1);
      this.neonGlows.push({ img: solarFlare, baseAlpha: 0.15, speed: 0.8, seed: 42 });
      // Star twinkle accents
      for (let sx = 100; sx < ww; sx += 240) {
        const star = this.add
          .image(sx, 80 + (sx * 97) % 300, "star")
          .setScale(0.3 + (sx % 5) * 0.08)
          .setTint(0xffffff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: star, baseAlpha: 0.4 + (sx % 3) * 0.15, speed: 2.0 + (sx % 7) * 0.5, seed: sx });
      }

    } else if (this.stageIndex === 4) {
      // === STAGE 5: Void Singularity — Void lightning, gravitational lensing glow, dark energy wisps ===
      // Central accretion disk glow
      const diskGlow = this.add
        .image(ww / 2, 300, "glow")
        .setScale(6.0, 2.0)
        .setTint(0xd946ef)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.2)
        .setDepth(DEPTH.bg + 1);
      this.neonGlows.push({ img: diskGlow, baseAlpha: 0.2, speed: 1.2, seed: 999 });
      // Void lightning crackling
      for (let vx = 200; vx < ww; vx += 350) {
        const voidCrackle = this.add
          .image(vx, 200 + (vx * 71) % 250, "streak")
          .setScale(1.5, 0.6)
          .setTint(0xd946ef)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setRotation((vx % 6) * 0.5)
          .setDepth(DEPTH.bg + 1);
        this.neonGlows.push({ img: voidCrackle, baseAlpha: 0.35, speed: 12.0, seed: vx * 7.7 });
      }
    }
  }

  arenaBounds(): [number, number] { return [this.arenaMin, this.arenaMax]; }
  resumeFromPause() { this.pauseKeys.forEach((k) => k.reset()); this.input.keyboard?.resetKeys(); }
  setTimeScaleTimer(t: number) { this.timeScaleTimer = t; }

  // Delegate helpers
  startStage() { this.spawnDirector.startStage(); }
  startWave() {
    this.spawnDirector.startWave();
    if ((this.stageIndex >= 1 && this.waveIndex === 1) || (this.mode === "endless" && (this.waveIndex + 1) % 4 === 0)) {
      this.time.delayedCall(5000, () => this.spawnTimeRift());
    }
  }

  spawnTimeRift() {
    if (this.timeRift || this.phase !== "fight") return;
    const rx = (this.arenaMin + this.arenaMax) / 2;
    const ry = GROUND_Y - 140;
    const container = this.add.container(rx, ry).setDepth(DEPTH.enemy + 1);

    const aura = this.add.circle(0, 0, 45, 0xb06cff, 0.35).setStrokeStyle(3, 0xffbb00, 0.9);
    const crystal = this.add.polygon(0, 0, [
      { x: 0, y: -36 },
      { x: 26, y: 0 },
      { x: 0, y: 36 },
      { x: -26, y: 0 },
    ], 0x18e6ff, 0.9).setStrokeStyle(2, 0xffffff, 0.9);

    const title = this.add.text(0, -56, "CỔNG THỜI GIAN", {
      fontFamily: FONT,
      fontSize: "14px",
      fontStyle: "900",
      color: "#ffe45c",
      stroke: "#000",
      strokeThickness: 3,
    }).setOrigin(0.5);

    const barBg = this.add.rectangle(0, 48, 84, 8, 0x000000, 0.7).setStrokeStyle(1, 0xffffff, 0.5);
    const bar = this.add.rectangle(-40, 48, 80, 6, 0xb06cff, 0.95).setOrigin(0, 0.5);
    const timerText = this.add.text(0, 64, "15s", {
      fontFamily: FONT,
      fontSize: "13px",
      fontStyle: "bold",
      color: "#9ff8ff",
      stroke: "#000",
      strokeThickness: 2,
    }).setOrigin(0.5);

    container.add([aura, crystal, title, barBg, bar, timerText]);

    this.tweens.add({
      targets: [crystal, aura],
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    this.timeRift = {
      x: rx,
      y: ry,
      hp: 450,
      maxHp: 450,
      timeLeft: 15,
      container,
      bar,
      timerText,
    };

    sfx.warn();
    this.events.emit("banner", "CỔNG THỜI GIAN", "Phá hủy trong 15s để nhận Lõi Giáp!", 0xb06cff);
  }
  spawnEnemy(type: EnemyType, side?: "left" | "right") { return this.spawnDirector.spawnEnemy(type, side); }
  aliveEnemies() { return this.spawnDirector.aliveEnemies(); }
  targetsFor(actor: Actor) { return this.combatSys.targetsFor(actor); }
  paletteFor(actor: Actor | undefined): Palette { return this.combatSys.paletteFor(actor); }
  dealDamage(attacker: Actor | undefined, target: Actor, hit: Hit) { return this.combatSys.dealDamage(attacker, target, hit); }
  meleeHit(attacker: Actor, rect: Phaser.Geom.Rectangle, hit: Hit) { return this.combatSys.meleeHit(attacker, rect, hit); }
  areaHit(attacker: Actor, cx: number, cy: number, radius: number, hit: Hit, everywhere = false) { return this.combatSys.areaHit(attacker, cx, cy, radius, hit, everywhere); }
  enemyAttack(enemy: Enemy, rect: Phaser.Geom.Rectangle, hit: Hit) { this.combatSys.enemyAttack(enemy, rect, hit); }
  spawnProjectile(spec: ProjectileSpec) { this.projectileSys.spawnProjectile(spec); }
  explode(attacker: Actor, x: number, y: number, radius: number, hit: Hit) { this.projectileSys.explode(attacker, x, y, radius, hit); }
  spawnField(spec: Parameters<FieldSystem["spawnField"]>[0]) { this.fieldSys.spawnField(spec); }
  spawnShockwave(owner: Enemy, x: number, dir: number, speed: number, damage: number) { this.hazardSys.spawnShockwave(owner, x, dir, speed, damage); }
  spawnBeam(owner: Enemy, x0: number, x1: number, y: number, height: number, damage: number) { this.hazardSys.spawnBeam(owner, x0, x1, y, height, damage); }
  spawnMeteor(owner: Hero, x: number, radius: number, hit: Hit) { this.hazardSys.spawnMeteor(owner, x, radius, hit); }
  dropLoot(enemy: Enemy) { this.pickupSys.dropLoot(enemy); }

  onWaveCleared() {
    if (this.mode === "endless") {
      this.waveIndex += 1;
      this.score += 500 + this.waveIndex * 150;
      if (this.waveIndex % 3 === 0) {
        this.setPhase("upgrade", 0);
        const pool = [...ARMOR_CORES];
        Phaser.Utils.Array.Shuffle(pool);
        this.events.emit("coreUpgrade", pool.slice(0, 3));
      } else {
        this.setPhase("advance", 0);
        this.events.emit("go", true);
        sfx.confirm();
      }
      return;
    }

    if (this.mode === "bossrush") {
      for (const h of this.heroes) {
        if (!h.dead) h.heal(Math.round(h.maxHp * 0.3));
      }
      if (this.waveIndex >= 2) {
        this.finish(true);
      } else {
        this.waveIndex += 1;
        this.setPhase("advance", 0);
        this.events.emit("go", true);
        sfx.confirm();
      }
      return;
    }

    const waves = this.stage.waves;
    if (this.waveIndex >= waves.length - 1) {
      this.setPhase("stageClear", 2.2);
      this.lockHeroes(true);
      sfx.win();
      this.events.emit("banner", "QUA MÀN", `Hoàn thành ${this.stage.name}`, this.stage.accent);
    } else {
      this.setPhase("advance", 0);
      this.events.emit("go", true);
      sfx.confirm();
    }
  }

  private afterStageClear() {
    if (this.stageIndex >= STAGES.length - 1) { this.finish(true); return; }
    this.setPhase("upgrade", 0);
    const pool = [...ARMOR_CORES];
    Phaser.Utils.Array.Shuffle(pool);
    this.events.emit("coreUpgrade", pool.slice(0, 3));
  }

  chooseArmorCore(core: ArmorCore) {
    this.heroes.forEach((h) => {
      h.equippedCores.push(core);
      core.apply(h);
      h.applyMods();
    });
    if (this.mode === "endless") {
      this.startWave();
    } else {
      this.stageIndex += 1;
      this.startStage();
    }
  }

  chooseUpgrade(upgrade: Upgrade) {
    this.heroes.forEach((h) => { upgrade.apply(h.mods); h.applyMods(); });
    if (this.mode === "endless") {
      this.startWave();
    } else {
      this.stageIndex += 1;
      this.startStage();
    }
  }

  finish(win: boolean) {
    if (this.phase === "over") return;
    this.setPhase("over", 0);
    this.lockHeroes(true);
    const solo = this.mode !== "pk";
    if (solo) this.score += win ? 3000 : 0;
    if (win && this.pendingCoins > 0) addCoins(this.pendingCoins);
    const prog = loadProgress();
    if (prog.coins >= 1000 && unlockEntry("achievements", "coin_hoarder")) this.events.emit("toast", "Thành tựu: Triệu Phú Giáp (1000 Xu)!");
    if (win) {
      if (this.stageIndex === 0) unlockEntry("achievements", "stage1_clear");
      if (this.stageIndex === 1) unlockEntry("achievements", "stage2_clear");
      if (this.stageIndex === 4) unlockEntry("achievements", "archon_zero_slayer");
      if (this.heroes.every((h) => !h.dead && h.hp > 0) && unlockEntry("achievements", "no_death")) this.events.emit("toast", "Thành tựu: Không Gục Ngã!");
    }
    if (this.mode === "endless") {
      const heroId = this.heroes[0]?.def.id ?? "nova_blade";
      const dateStr = new Date().toLocaleDateString("vi-VN");
      saveEndlessScore({
        score: this.score,
        wave: this.waveIndex + 1,
        hero: heroId,
        date: dateStr,
      });
    } else if (this.mode === "daily") {
      saveDailyRecord(getDailyDateString(), this.score);
    }
    const dodgeText = this.perfectDodges > 0 ? ` · Né hoàn hảo ×${this.perfectDodges}` : "";
    const coinText = win && this.pendingCoins > 0 ? ` · +${this.pendingCoins} xu` : "";
    let detailText = win ? `Thành phố đã an toàn. Giáp Hào Quang bất bại!${dodgeText}${coinText}` : `Ngã xuống ở ${this.stage.name} — đợt ${this.waveIndex + 1}${dodgeText}`;
    if (this.mode === "endless") {
      detailText = `Trụ được đến đợt ${this.waveIndex + 1}${dodgeText} · Điểm số: ${this.score}`;
    } else if (this.mode === "bossrush") {
      detailText = win ? `Đã hạ gục toàn bộ 3 Trùm!${dodgeText}` : `Ngã xuống ở Trùm ${this.waveIndex + 1}${dodgeText}`;
    }
    this.events.emit("result", {
      win,
      title: win ? "CHIẾN THẮNG" : "THẤT BẠI",
      detail: detailText,
      score: this.score,
      best: Math.max(this.score, prog.bestScore),
      mode: this.mode,
    } satisfies ResultData);
    if (solo && this.score > prog.bestScore) saveProgress({ bestScore: this.score });
    if (win) sfx.win();
    else sfx.lose();
  }

  private startPkRound() {
    this.arenaMin = 0;
    this.arenaMax = ARENA_WIDTH;
    this.pkTimer = 99;
    this.heroes.forEach((h, i) => {
      h.x = i === 0 ? 300 : GAME_WIDTH - 300;
      h.y = GROUND_Y;
      h.vx = h.vy = 0;
      h.facing = i === 0 ? 1 : -1;
      h.status = {};
      if (h.dead) h.revive(1);
      h.hp = h.maxHp;
      h.energy = 20;
      Object.keys(h.cooldowns).forEach((k) => (h.cooldowns[k as keyof typeof h.cooldowns] = 0));
      h.cooldowns.ultimate = 15;
    });
    this.lockHeroes(true);
    this.setPhase("pkIntro", 2);
    this.events.emit("banner", `HIỆP ${this.pkRound}`, "SẴN SÀNG...", 0xffd93a);
  }

  private endPkRound(winner: number | null) {
    this.setPhase("roundEnd", 2.4);
    this.lockHeroes(true);
    if (winner !== null) this.pkWins[winner] += 1;
    const label = winner === null ? "HÒA" : `P${winner + 1} THẮNG HIỆP`;
    this.events.emit("banner", label, `P1 ${this.pkWins[0]} — ${this.pkWins[1]} P2`, winner === null ? 0xffffff : this.heroes[winner].def.color);
    sfx.confirm();
  }

  private afterPkRound() {
    const [a, b] = this.pkWins;
    if (a >= 2 || b >= 2 || this.pkRound >= 3) {
      this.setPhase("over", 0);
      const title = a === b ? "HÒA" : a > b ? "P1 CHIẾN THẮNG" : "P2 CHIẾN THẮNG";
      this.events.emit("result", { win: a !== b, title, detail: `Tỉ số ${a} — ${b}`, score: 0, best: 0, mode: "pk" } satisfies ResultData);
      sfx.win();
      return;
    }
    this.pkRound += 1;
    this.startPkRound();
  }

  update(_time: number, deltaMs: number) {
    this.framePacer.record(deltaMs);
    let real = Math.min(deltaMs / 1000, 1 / 30);
    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= real;
      real *= this.timeScale;
      if (this.timeScaleTimer <= 0) this.timeScale = 1;
    }
    if (this.pauseKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) || consumeTouch("pause")) {
      if (this.phase !== "over" && this.phase !== "upgrade") this.events.emit("pause");
      return;
    }
    this.heroes.forEach((h) => h.readInput());
    if (this.hitstop > 0) { this.hitstop -= real; return; }
    this.dt = real;

    this.updatePhase(real);
    this.combatSys.update(real);
    this.heroes.forEach((h) => h.update(real));
    this.enemies.forEach((e) => e.update(real));
    this.enemies = this.enemies.filter((e) => {
      if (e.removable) e.destroy();
      return !e.removable;
    });

    this.projectileSys.update(real);
    this.fieldSys.update(real);
    this.hazardSys.update(real);
    this.pickupSys.update(real);
    this.spawnDirector.update(real);

    this.updateCamera(real);
    this.bg.tilePositionX = (this.cameras.main.scrollX * 1.0) / this.bgScale;
    if (this.bgFar) {
      this.bgFar.tilePositionX = (this.cameras.main.scrollX * 0.15) / this.bgFarScale;
    }

    // Dynamic neon signage glow flicker & pulse
    const nowSec = this.time.now / 1000;
    for (const ng of this.neonGlows) {
      const flicker = Math.sin(nowSec * ng.speed + ng.seed) * 0.15;
      const jitter = Math.random() < 0.04 ? -0.15 : 0;
      ng.img.setAlpha(Math.max(0.1, ng.baseAlpha + flicker + jitter));
    }

    if (this.boss && !this.boss.dead) {
      music.setMode("boss");
      music.setIntensity(3);
    } else if (this.combo >= 20 || this.heroes.some((h) => h.overdriveTimer > 0)) {
      music.setIntensity(2);
    } else if (this.enemies.some((e) => !e.dead)) {
      music.setIntensity(1);
    } else {
      music.setIntensity(0);
    }

    // Geyser in Lava Fortress (Stage 3) or Endless Lava Modifier
    if ((this.stageIndex === 2 || this.activeModifier === "lava") && this.phase === "fight") {
      this.geyserTimer -= real;
      if (this.geyserTimer <= 0) {
        this.geyserTimer = 4;
        const gx = Phaser.Math.Between(this.arenaMin + 120, this.arenaMax - 120);
        this.fx.ring(gx, GROUND_Y - 4, 0xff5511, 100, 1000, 0.35);
        this.time.delayedCall(1000, () => {
          this.fx.lavaGeyser(gx);
          for (const h of this.heroes) {
            if (!h.dead && Math.abs(h.x - gx) < 80) {
              this.dealDamage(undefined, h, { damage: 20, dir: 1, launch: 500, color: 0xff5511 });
            }
          }
        });
      }
    }

    // Dynamic Event: Time Rift
    if (this.timeRift) {
      this.timeRift.timeLeft -= real;
      this.timeRift.timerText.setText(`${Math.max(0, Math.ceil(this.timeRift.timeLeft))}s`);
      for (const h of this.heroes) {
        if (!h.dead && (h.state === "attack" || h.state === "cast") && Math.hypot(h.x - this.timeRift.x, (h.y - 70) - this.timeRift.y) < 70) {
          this.timeRift.hp -= h.mods.damage * 65 * real;
          this.fx.clashSpark(this.timeRift.x + (Math.random() - 0.5) * 40, this.timeRift.y + (Math.random() - 0.5) * 40);
          this.timeRift.bar.width = Math.max(0, (this.timeRift.hp / this.timeRift.maxHp) * 80);
        }
      }

      if (this.timeRift.hp <= 0) {
        this.fx.dualImpactFlash(0xb06cff, 0x18e6ff, 350);
        this.fx.shockRing(this.timeRift.x, this.timeRift.y, 400, 0xb06cff);
        sfx.win();
        this.score += 5000;
        this.heroes.forEach((h) => h.gainEnergy(50));
        unlockEntry("achievements", "time_rift_crusher");
        this.events.emit("toast", "ĐÃ PHÁ VỠ CỔNG THỜI GIAN! (+5000 ĐIỂM)");
        
        const pool = [...ARMOR_CORES];
        Phaser.Utils.Array.Shuffle(pool);
        this.events.emit("coreUpgrade", pool.slice(0, 3));

        this.timeRift.container.destroy();
        this.timeRift = undefined;
      } else if (this.timeRift.timeLeft <= 0) {
        this.fx.ring(this.timeRift.x, this.timeRift.y, 0xb06cff, 60, 300);
        this.timeRift.container.destroy();
        this.timeRift = undefined;
        this.events.emit("toast", "Cổng Thời Gian đã khép lại!");
      }
    }

    // Gravitational Vortex in Stage 5 (Lõi Hư Không)
    if (this.stageIndex === 4 && this.phase === "fight") {
      this.voidPullTimer -= real;
      if (this.voidPullTimer <= 0) {
        this.voidPullTimer = 11;
        const cx = (this.arenaMin + this.arenaMax) / 2;
        this.fx.shockRing(cx, GROUND_Y - 140, 500, 0xd946ef);
        this.events.emit("toast", "Lực hút Hố Đen đang kéo mọi vật chất!");
        sfx.warn();
        
        this.time.addEvent({
          delay: 50,
          repeat: 70,
          callback: () => {
            for (const h of this.heroes) {
              if (!h.dead) {
                const dir = Math.sign(cx - h.x) || 1;
                h.x += dir * 2.8;
              }
            }
          },
        });
      }
    }

    // Elemental Storm Hazard in Stage 4 & 5
    if ((this.stageIndex === 3 || this.stageIndex === 4) && this.phase === "fight") {
      this.stormTimer -= real;
      if (this.stormTimer <= 0) {
        this.stormTimer = 8 + Math.random() * 4;
        const hero = this.heroes[0];
        const hx = hero ? hero.x : (this.arenaMin + this.arenaMax) / 2;
        const strikeX = Phaser.Math.Clamp(hx + (Math.random() - 0.5) * 300, this.arenaMin + 60, this.arenaMax - 60);
        const col = this.stageIndex === 4 ? 0xd946ef : 0xaa44ff;
        this.fx.ring(strikeX, GROUND_Y - 4, col, 80, 1100, 0.4);
        this.time.delayedCall(1100, () => {
          this.fx.flashCore(strikeX, GROUND_Y - 40, 1.6, 200);
          this.fx.pillar(strikeX, col, 1.2, 1.4, 250);
          sfx.boom();
          for (const h of this.heroes) {
            if (!h.dead && Math.abs(h.x - strikeX) < 55) {
              this.dealDamage(undefined, h, { damage: 24, dir: 1, launch: 420, color: col });
            }
          }
        });
      }
    }

    // Environment Props
    for (const p of this.props) {
      if (p.dead) continue;
      for (const h of this.heroes) {
        if (!h.dead && Math.abs(h.x - p.x) < 55 && (h.state === "attack" || h.state === "cast")) {
          p.takeHit(h);
        }
      }
    }
    this.props = this.props.filter((p) => !p.dead);
  }

  private updatePhase(dt: number) {
    this.phaseTimer -= dt;
    switch (this.phase) {
      case "intro": if (this.phaseTimer <= 0) this.startWave(); break;
      case "advance": {
        const nextMin = this.arenaMin + ARENA_WIDTH;
        const alive = this.heroes.filter((h) => !h.dead);
        if (alive.length && alive.every((h) => h.x > nextMin + 260)) {
          this.arenaMin = nextMin;
          this.arenaMax = nextMin + ARENA_WIDTH;
          this.waveIndex += 1;
          this.events.emit("go", false);
          this.startWave();
        }
        break;
      }
      case "stageClear": if (this.phaseTimer <= 0) this.afterStageClear(); break;
      case "pkIntro":
        if (this.phaseTimer <= 0) {
          this.setPhase("pkFight", 0);
          this.lockHeroes(false);
          this.events.emit("banner", "CHIẾN!", "", 0xff4e3a);
          sfx.confirm();
        }
        break;
      case "pkFight": {
        this.pkTimer -= dt;
        const [a, b] = this.heroes;
        if (a.dead || b.dead) this.endPkRound(a.dead && b.dead ? null : a.dead ? 1 : 0);
        else if (this.pkTimer <= 0) this.endPkRound(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1);
        break;
      }
      case "roundEnd": if (this.phaseTimer <= 0) this.afterPkRound(); break;
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const alive = this.heroes.filter((h) => !h.dead);
    const avgFacing = alive.length > 0 ? alive.reduce((s, h) => s + h.facing, 0) / alive.length : 1;
    const lookAhead = avgFacing * 110;
    let target = this.arenaMin;
    if (this.phase === "advance") {
      const avg = alive.reduce((s, h) => s + h.x, 0) / Math.max(1, alive.length);
      target = Phaser.Math.Clamp(avg - GAME_WIDTH * 0.4 + lookAhead, this.arenaMin, this.arenaMin + ARENA_WIDTH);
    } else {
      const avg = alive.length > 0 ? alive.reduce((s, h) => s + h.x, 0) / alive.length : this.arenaMin + ARENA_WIDTH * 0.5;
      const desired = avg - GAME_WIDTH * 0.5 + lookAhead;
      target = Math.abs(desired - cam.scrollX) > 160 ? Phaser.Math.Clamp(desired, this.arenaMin, this.arenaMax - GAME_WIDTH) : cam.scrollX;
    }
    cam.scrollX = expDecay(cam.scrollX, target, 5.5, dt);
  }

  // Callbacks
  onHeroHurt(hero: Hero, dealt: number) { this.callbacks.onHeroHurt(hero, dealt); }
  onHeroDown(hero: Hero) { this.callbacks.onHeroDown(hero); }
  onEnemyKilled(enemy: Enemy, hit: Hit) { this.callbacks.onEnemyKilled(enemy, hit); }
  onBossEnrage(boss: Enemy) { this.callbacks.onBossEnrage(boss); }
  onPerfectDodge(hero: Hero) { this.callbacks.onPerfectDodge(hero); }

  ultimateIntro(hero: Hero, skill: SkillDef) {
    const pal = PALETTE[hero.def.element];
    sfx.ultimate();
    this.hitstop = Math.max(this.hitstop, 0.3);
    this.fx.tintScreen(pal.dark, 0.7, 1100);
    this.fx.charge(hero.cx, hero.cy, pal, 320, 220, 30);
    this.fx.ring(hero.x, GROUND_Y - 4, pal.main, 220, 600, 0.25, "glyph");
    this.events.emit("cutin", hero, skill);
  }

  anyHeroAlive() { return this.heroes.some((h) => !h.dead); }
  setPhase(p: Phase, duration: number) { this.phase = p; this.phaseTimer = duration; }
  lockHeroes(locked: boolean) { this.heroes.forEach((h) => (h.locked = locked)); }
}
