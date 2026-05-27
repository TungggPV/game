import Phaser from "phaser";

const W = 1280;
const H = 720;
const WORLD_W = 4300;
const GROUND_Y = 586;
const GRAVITY = 2300;

const overlay = document.getElementById("screenOverlay") as HTMLDivElement;
const overlayTitle = overlay.querySelector("h1") as HTMLHeadingElement;
const overlayCopy = document.getElementById("overlayCopy") as HTMLParagraphElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];

type Action = "left" | "right" | "up" | "attack" | "dash" | "guard" | "special" | "overdrive" | "prevArmor" | "nextArmor" | "armor1" | "armor2" | "armor3" | "armor4";
type EnemyKind = "crawler" | "mutant" | "drone" | "elite" | "boss";

type Colors = {
  primary: number;
  plate: number;
  accent: number;
  visor: number;
  dark: number;
  trim: number;
};

type ArmorForm = {
  id: string;
  name: string;
  short: string;
  colors: Colors;
  speed: number;
  melee: number;
  special: string;
};

type Controls = Record<Action, Phaser.Input.Keyboard.Key[]>;

type PlayerState = {
  id: number;
  tag: string;
  sprite: Phaser.GameObjects.Image;
  portrait: Phaser.GameObjects.Image;
  armor: number;
  hp: number;
  maxHp: number;
  core: number;
  maxCore: number;
  overdrive: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  alive: boolean;
  invuln: number;
  attackCd: number;
  dashCd: number;
  specialCd: number;
  hurtTime: number;
  attackTime: number;
  dashTime: number;
  step: number;
};

type EnemyState = {
  id: number;
  kind: EnemyKind;
  sprite: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  attackCd: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hurtTime: number;
  elite: boolean;
  phase: number;
  bob: number;
};

type ProjectileState = {
  image: Phaser.GameObjects.Image;
  owner: "player" | "enemy";
  attacker?: PlayerState;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  facing: 1 | -1;
};

type EffectState = {
  image: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  spin?: number;
};

type Wave = {
  at: number;
  spawned: boolean;
  cleared: boolean;
  boss?: boolean;
  enemies: Array<{ kind: EnemyKind; offset: number; elite?: boolean }>;
};

type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const armorForms: ArmorForm[] = [
  {
    id: "nova",
    name: "Nova Blade",
    short: "BLADE",
    colors: { primary: 0x0b65d8, plate: 0xf0f6ff, accent: 0x18e6ff, visor: 0x8cf8ff, dark: 0x07121f, trim: 0x1f8ee8 },
    speed: 1,
    melee: 22,
    special: "Hyper Blade",
  },
  {
    id: "aegis",
    name: "Aegis Elite",
    short: "AEGIS",
    colors: { primary: 0x1f8ee8, plate: 0xf6fbff, accent: 0x67e8ff, visor: 0xb2fbff, dark: 0x071827, trim: 0x083d95 },
    speed: 0.92,
    melee: 20,
    special: "Shield Pulse",
  },
  {
    id: "volt",
    name: "Volt Runner",
    short: "VOLT",
    colors: { primary: 0x0056d8, plate: 0xeaf3ff, accent: 0x00f2ff, visor: 0x94fbff, dark: 0x06111e, trim: 0x13a7ff },
    speed: 1.22,
    melee: 18,
    special: "Rising Shot",
  },
  {
    id: "titan",
    name: "Titan Shield",
    short: "TITAN",
    colors: { primary: 0x0b4fb3, plate: 0xdfe8f4, accent: 0x35d8ff, visor: 0x9ff6ff, dark: 0x07111a, trim: 0x5b6f89 },
    speed: 0.82,
    melee: 28,
    special: "Core Break",
  },
];

const touchHeld = new Set<Action>();
const touchJust = new Set<Action>();
let selectedPlayers = 1;
let gameScene: MainScene | undefined;

class MainScene extends Phaser.Scene {
  private players: PlayerState[] = [];
  private enemies: EnemyState[] = [];
  private projectiles: ProjectileState[] = [];
  private effects: EffectState[] = [];
  private waves: Wave[] = [];
  private controls: Controls[] = [];
  private hudTexts: Phaser.GameObjects.Text[] = [];
  private hudImages: Phaser.GameObjects.Image[] = [];
  private bossHudImage?: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private score = 0;
  private running = false;
  private pausedByUser = false;
  private message = "";
  private messageTimer = 0;
  private shakeTimer = 0;
  private enemySeq = 0;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private escKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.image("bg-city-neon", "/assets/backgrounds/city_neon.png");

    this.load.image("hero-idle", "/assets/hero/sprites/idle.png");
    this.load.image("hero-walk-1", "/assets/hero/sprites/walk_1.png");
    this.load.image("hero-walk-2", "/assets/hero/sprites/walk_2.png");
    this.load.image("hero-walk-3", "/assets/hero/sprites/walk_3.png");
    this.load.image("hero-walk-4", "/assets/hero/sprites/walk_4.png");
    this.load.image("hero-jump", "/assets/hero/sprites/jump.png");
    this.load.image("hero-attack-slash", "/assets/hero/sprites/attack_slash.png");
    this.load.image("hero-attack-blast", "/assets/hero/sprites/attack_blast.png");
    this.load.image("hero-dash", "/assets/hero/sprites/dash.png");
    this.load.image("hero-hit", "/assets/hero/sprites/hit_reaction.png");
    this.load.image("hero-portrait", "/assets/hero/portrait/hero_portrait.png");

    this.load.image("crawler-idle", "/assets/enemies/crawler/crawler_main.png");
    this.load.image("crawler-walk1", "/assets/enemies/crawler/crawl.png");
    this.load.image("crawler-walk2", "/assets/enemies/crawler/crawler_main.png");
    this.load.image("mutant-idle", "/assets/enemies/horned_mutant/mutant_main.png");
    this.load.image("mutant-walk1", "/assets/enemies/horned_mutant/walk_1.png");
    this.load.image("mutant-walk2", "/assets/enemies/horned_mutant/walk_2.png");
    this.load.image("elite-idle", "/assets/enemies/aegis_elite/aegis_main.png");
    this.load.image("elite-walk1", "/assets/enemies/aegis_elite/walk.png");
    this.load.image("elite-walk2", "/assets/enemies/aegis_elite/walk.png");
    this.load.image("drone", "/assets/enemies/sky_hunter/sky_hunter_main.png");
    this.load.image("boss", "/assets/enemies/boss/abyssal_colossus_main.png");

    this.load.image("hud-health", "/assets/ui/hud/health_bar.png");
    this.load.image("hud-energy", "/assets/ui/hud/energy_bar.png");
    this.load.image("hud-boss", "/assets/ui/hud/boss_bar.png");

    this.load.image("slash", "/assets/effects/slash_crescent_1.png");
    this.load.image("energy-blasts", "/assets/effects/energy_blasts_sheet.png");
    this.load.image("hit-sparks", "/assets/effects/hit_sparks_sheet.png");
    this.load.image("explosions", "/assets/effects/explosions_sheet.png");
  }

  create() {
    gameScene = this;
    this.cameras.main.setBounds(0, 0, WORLD_W, H);
    this.cameras.main.setBackgroundColor("#06111f");
    this.drawBackground();
    this.createControls();
    this.scoreText = this.add.text(W - 44, 34, "", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "21px",
      fontStyle: "900",
      color: "#eaf8ff",
      stroke: "#02060b",
      strokeThickness: 4,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(1001);
    this.messageText = this.add.text(W / 2, 148, "", {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: "40px",
      fontStyle: "900",
      color: "#eaf8ff",
      stroke: "#02060b",
      strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    this.drawHud();
  }

  startRun(playerCount: number) {
    this.clearRun();
    this.running = true;
    this.pausedByUser = false;
    this.score = 0;
    this.message = playerCount === 2 ? "Co-op Armor Sync" : "Armor Core Online";
    this.messageTimer = 1.4;
    this.cameras.main.scrollX = 0;
    this.players = this.createPlayers(playerCount);
    this.waves = [
      { at: 360, spawned: false, cleared: false, enemies: [{ kind: "crawler", offset: 80 }, { kind: "mutant", offset: 210 }, { kind: "drone", offset: 370 }] },
      { at: 980, spawned: false, cleared: false, enemies: [{ kind: "mutant", offset: 70 }, { kind: "elite", offset: 250, elite: true }, { kind: "drone", offset: 430 }] },
      { at: 1640, spawned: false, cleared: false, enemies: [{ kind: "crawler", offset: 80 }, { kind: "crawler", offset: 180 }, { kind: "elite", offset: 360, elite: true }, { kind: "drone", offset: 520 }] },
      { at: 2380, spawned: false, cleared: false, enemies: [{ kind: "mutant", offset: 80 }, { kind: "elite", offset: 260, elite: true }, { kind: "elite", offset: 440, elite: true }] },
      { at: 3180, spawned: false, cleared: false, boss: true, enemies: [{ kind: "boss", offset: 430 }] },
    ];
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.033, deltaMs / 1000);
    if (!this.running) {
      this.drawHud();
      touchJust.clear();
      return;
    }

    if ((this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) ||
      (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey))) {
      this.pausedByUser = !this.pausedByUser;
      this.message = this.pausedByUser ? "TAM DUNG" : "TIEP TUC";
      this.messageTimer = 0.9;
    }

    if (this.pausedByUser) {
      this.drawHud();
      touchJust.clear();
      return;
    }

    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.spawnWaves();
    this.updatePlayers(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.drawHud();
    touchJust.clear();
  }

  private clearRun() {
    for (const item of [...this.players, ...this.enemies]) item.sprite.destroy();
    for (const item of this.players) item.portrait.destroy();
    for (const item of this.projectiles) item.image.destroy();
    for (const item of this.effects) item.image.destroy();
    for (const text of this.hudTexts) text.destroy();
    for (const image of this.hudImages) image.destroy();
    this.bossHudImage?.destroy();
    this.players = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.hudTexts = [];
    this.hudImages = [];
    this.bossHudImage = undefined;
  }

  private createPlayers(playerCount: number): PlayerState[] {
    const result: PlayerState[] = [];
    for (let i = 0; i < playerCount; i++) {
      const armor = i % armorForms.length;
      const sprite = this.add.image(140 + i * 82, GROUND_Y, "hero-idle").setOrigin(0.5, 1).setScale(i === 0 ? 1.15 : 1.1).setDepth(60);
      const portrait = this.add.image(58, 56 + i * 82, "hero-portrait").setOrigin(0.5).setScale(0.22).setScrollFactor(0).setDepth(1002);
      result.push({
        id: i,
        tag: i === 0 ? "P1" : "P2",
        sprite,
        portrait,
        armor,
        hp: 220,
        maxHp: 220,
        core: 120,
        maxCore: 120,
        overdrive: 0,
        vx: 0,
        vy: 0,
        facing: 1,
        grounded: true,
        alive: true,
        invuln: 0,
        attackCd: 0,
        dashCd: 0,
        specialCd: 0,
        hurtTime: 0,
        attackTime: 0,
        dashTime: 0,
        step: 0,
      });
    }
    return result;
  }

  private createControls() {
    const add = (codes: number[]) => codes.map((code) => this.input.keyboard!.addKey(code));
    this.controls = [
      {
        left: add([Phaser.Input.Keyboard.KeyCodes.A]),
        right: add([Phaser.Input.Keyboard.KeyCodes.D]),
        up: add([Phaser.Input.Keyboard.KeyCodes.W, Phaser.Input.Keyboard.KeyCodes.SPACE]),
        attack: add([Phaser.Input.Keyboard.KeyCodes.J]),
        dash: add([Phaser.Input.Keyboard.KeyCodes.K]),
        guard: add([Phaser.Input.Keyboard.KeyCodes.L]),
        special: add([Phaser.Input.Keyboard.KeyCodes.F]),
        overdrive: add([Phaser.Input.Keyboard.KeyCodes.R]),
        prevArmor: add([Phaser.Input.Keyboard.KeyCodes.Q]),
        nextArmor: add([Phaser.Input.Keyboard.KeyCodes.E]),
        armor1: add([Phaser.Input.Keyboard.KeyCodes.ONE]),
        armor2: add([Phaser.Input.Keyboard.KeyCodes.TWO]),
        armor3: add([Phaser.Input.Keyboard.KeyCodes.THREE]),
        armor4: add([Phaser.Input.Keyboard.KeyCodes.FOUR]),
      },
      {
        left: add([Phaser.Input.Keyboard.KeyCodes.LEFT]),
        right: add([Phaser.Input.Keyboard.KeyCodes.RIGHT]),
        up: add([Phaser.Input.Keyboard.KeyCodes.UP]),
        attack: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE, Phaser.Input.Keyboard.KeyCodes.PERIOD]),
        dash: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO, Phaser.Input.Keyboard.KeyCodes.COMMA]),
        guard: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE, Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH]),
        special: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO, Phaser.Input.Keyboard.KeyCodes.ENTER]),
        overdrive: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE, Phaser.Input.Keyboard.KeyCodes.SHIFT]),
        prevArmor: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR, Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET]),
        nextArmor: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX, Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET]),
        armor1: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN]),
        armor2: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT]),
        armor3: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE]),
        armor4: add([Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD]),
      },
    ];
    this.pauseKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  private updatePlayers(dt: number) {
    for (const player of this.players) {
      if (!player.alive) continue;
      const control = this.controls[player.id];
      const form = armorForms[player.armor];
      const left = this.held(control.left) || (player.id === 0 && touchHeld.has("left"));
      const right = this.held(control.right) || (player.id === 0 && touchHeld.has("right"));
      const jump = this.just(control.up) || (player.id === 0 && touchJust.has("up"));
      const attack = this.just(control.attack) || (player.id === 0 && touchJust.has("attack"));
      const dash = this.just(control.dash) || (player.id === 0 && touchJust.has("dash"));
      const special = this.just(control.special) || (player.id === 0 && touchJust.has("special"));
      const overdrive = this.just(control.overdrive) || (player.id === 0 && touchJust.has("overdrive"));
      const guarding = this.held(control.guard) || (player.id === 0 && touchHeld.has("guard"));
      if (this.just(control.prevArmor)) this.switchArmor(player, -1);
      if (this.just(control.nextArmor)) this.switchArmor(player, 1);
      for (let i = 0; i < armorForms.length; i++) {
        if (this.just(control[`armor${i + 1}` as "armor1" | "armor2" | "armor3" | "armor4"])) this.setArmor(player, i);
      }

      player.attackCd = Math.max(0, player.attackCd - dt);
      player.dashCd = Math.max(0, player.dashCd - dt);
      player.specialCd = Math.max(0, player.specialCd - dt);
      player.invuln = Math.max(0, player.invuln - dt);
      player.hurtTime = Math.max(0, player.hurtTime - dt);
      player.attackTime = Math.max(0, player.attackTime - dt);
      player.dashTime = Math.max(0, player.dashTime - dt);
      player.core = Math.min(player.maxCore, player.core + dt * 10);
      player.overdrive = Math.max(0, player.overdrive - dt);

      let targetVx = 0;
      if (left) targetVx -= 245 * form.speed;
      if (right) targetVx += 245 * form.speed;
      if (targetVx !== 0) player.facing = targetVx > 0 ? 1 : -1;
      if (player.dashTime > 0) targetVx = player.facing * 620;
      if (guarding && player.grounded) targetVx *= 0.35;
      player.vx = Phaser.Math.Linear(player.vx, targetVx, player.grounded ? 0.22 : 0.09);

      if (jump && player.grounded) {
        player.vy = -760;
        player.grounded = false;
        this.spawnJet(player.sprite.x, player.sprite.y - 14, armorForms[player.armor].colors.accent);
      }
      if (dash && player.dashCd <= 0) {
        player.dashTime = 0.18;
        player.dashCd = 0.72;
        player.invuln = 0.2;
        this.addAfterimage(player);
      }
      if (attack && player.attackCd <= 0) {
        this.playerAttack(player);
      }
      if (special && player.specialCd <= 0 && player.core >= 28) {
        this.playerSpecial(player);
      }
      if (overdrive && player.core >= 80) {
        player.core -= 80;
        player.overdrive = 7.5;
        player.hp = Math.min(player.maxHp, player.hp + 34);
        this.message = `${player.tag} OVERDRIVE`;
        this.messageTimer = 1.1;
        this.spawnBurst(player.sprite.x, player.sprite.y - 76, form.colors.accent, 24);
      }

      player.vy += GRAVITY * dt;
      player.sprite.x = Phaser.Math.Clamp(player.sprite.x + player.vx * dt, 42, WORLD_W - 42);
      player.sprite.y += player.vy * dt;
      if (player.sprite.y >= GROUND_Y) {
        player.sprite.y = GROUND_Y;
        player.vy = 0;
        player.grounded = true;
      }
      if (Math.abs(player.vx) > 35 && player.grounded) player.step += dt * 11;
      player.sprite.setFlipX(player.facing < 0);
      player.sprite.setAlpha(player.invuln > 0 && Math.floor(this.time.now * 0.03) % 2 === 0 ? 0.58 : 1);
      player.sprite.setTexture(this.textureForPlayer(player));
      if (player.overdrive > 0) {
        player.sprite.setBlendMode(Phaser.BlendModes.ADD);
        player.sprite.setTint(0xc9fdff);
      } else {
        player.sprite.setBlendMode(Phaser.BlendModes.NORMAL);
        player.sprite.clearTint();
      }
    }

    if (this.players.length > 0 && this.players.every((player) => !player.alive)) {
      this.endRun("THAT BAI", "Loi giap can duoc khoi dong lai.");
    }
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      const target = this.nearestPlayer(enemy.sprite.x);
      if (!target) continue;
      const dx = target.sprite.x - enemy.sprite.x;
      const dist = Math.abs(dx);
      enemy.facing = dx >= 0 ? 1 : -1;
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.hurtTime = Math.max(0, enemy.hurtTime - dt);

      if (enemy.kind === "drone") {
        enemy.sprite.y = Phaser.Math.Linear(enemy.sprite.y, target.sprite.y - 126 + Math.sin(this.time.now * 0.005 + enemy.bob) * 20, 0.03);
        enemy.sprite.x += enemy.facing * enemy.speed * dt;
        if (dist < enemy.range && enemy.attackCd <= 0) {
          enemy.attackCd = 1.35;
          this.enemyProjectile(enemy, target);
        }
      } else if (enemy.kind === "boss") {
        this.updateBoss(enemy, target, dt, dist);
      } else {
        if (dist > enemy.range) enemy.vx = Phaser.Math.Linear(enemy.vx, enemy.facing * enemy.speed, 0.08);
        else {
          enemy.vx = Phaser.Math.Linear(enemy.vx, 0, 0.18);
          if (enemy.attackCd <= 0) this.enemyStrike(enemy);
        }
        enemy.vy += GRAVITY * dt;
        enemy.sprite.x += enemy.vx * dt;
        enemy.sprite.y += enemy.vy * dt;
        if (enemy.sprite.y >= GROUND_Y) {
          enemy.sprite.y = GROUND_Y;
          enemy.vy = 0;
        }
      }

      enemy.sprite.setFlipX(enemy.facing < 0);
      enemy.sprite.setAlpha(enemy.hurtTime > 0 && Math.floor(this.time.now * 0.045) % 2 === 0 ? 0.55 : 1);
    }

    const dead = this.enemies.filter((enemy) => enemy.hp <= 0);
    for (const enemy of dead) {
      this.score += enemy.kind === "boss" ? 2500 : enemy.elite ? 240 : 120;
      this.spawnBurst(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.45, 0x18e6ff, enemy.kind === "boss" ? 52 : 18);
      enemy.sprite.destroy();
    }
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    for (const wave of this.waves) {
      if (wave.spawned && !wave.cleared && this.enemies.length === 0) {
        wave.cleared = true;
        this.message = wave.boss ? "MISSION CLEAR" : "WAVE CLEAR";
        this.messageTimer = 1.2;
        if (wave.boss) this.endRun("CHIEN THANG", "Thanh pho neon da duoc giai phong.");
      }
    }
  }

  private updateBoss(enemy: EnemyState, target: PlayerState, dt: number, dist: number) {
    enemy.phase = enemy.hp < enemy.maxHp * 0.52 ? 1 : 0;
    enemy.vx = Phaser.Math.Linear(enemy.vx, dist > enemy.range ? enemy.facing * (enemy.speed + enemy.phase * 25) : 0, 0.07);
    enemy.sprite.x += enemy.vx * dt;
    enemy.sprite.y = GROUND_Y + Math.sin(this.time.now * 0.003) * 3;
    if (enemy.attackCd <= 0) {
      if (dist < 170) this.bossSmash(enemy);
      else if (Math.random() < 0.56) this.bossBeam(enemy, target);
      else this.bossSummon(enemy);
      enemy.attackCd = enemy.phase ? 1.05 : 1.38;
    }
  }

  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.image.x += projectile.vx * dt;
      projectile.image.y += projectile.vy * dt;
      projectile.image.rotation += projectile.facing * dt * 3;
      const targets = projectile.owner === "player" ? this.enemies : this.players.filter((player) => player.alive);
      for (const target of targets) {
        if (projectile.owner === "player") {
          const enemy = target as EnemyState;
          if (this.intersects(this.boundsFor(projectile.image, 52, 24), this.enemyBounds(enemy))) {
            this.damageEnemy(enemy, projectile.damage, projectile.attacker);
            projectile.life = 0;
          }
        } else {
          const player = target as PlayerState;
          if (this.intersects(this.boundsFor(projectile.image, 42, 22), this.playerBounds(player))) {
            this.damagePlayer(player, projectile.damage, projectile.vx > 0 ? 1 : -1);
            projectile.life = 0;
          }
        }
      }
      if (projectile.image.x < -80 || projectile.image.x > WORLD_W + 80) projectile.life = 0;
    }
    for (const projectile of this.projectiles.filter((item) => item.life <= 0)) projectile.image.destroy();
    this.projectiles = this.projectiles.filter((item) => item.life > 0);
  }

  private updateEffects(dt: number) {
    for (const effect of this.effects) {
      effect.life -= dt;
      effect.image.setAlpha(Math.max(0, effect.life / effect.maxLife));
      effect.image.setScale(effect.image.scaleX + dt * 1.6, effect.image.scaleY + dt * 1.6);
      if (effect.spin) effect.image.rotation += effect.spin * dt;
    }
    for (const effect of this.effects.filter((item) => item.life <= 0)) effect.image.destroy();
    this.effects = this.effects.filter((item) => item.life > 0);
  }

  private updateCamera(dt: number) {
    const alive = this.players.filter((player) => player.alive);
    const focus = alive.length > 0 ? alive.reduce((sum, player) => sum + player.sprite.x, 0) / alive.length : 0;
    const front = alive.length > 0 ? Math.max(...alive.map((player) => player.sprite.x)) : focus;
    const target = Phaser.Math.Clamp(Math.max(focus - W * 0.38, front - W * 0.62), 0, WORLD_W - W);
    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, target, Math.min(1, dt * 4.8));
    if (this.shakeTimer > 0) this.cameras.main.scrollX += Math.sin(this.time.now * 0.08) * 5;
  }

  private spawnWaves() {
    const front = this.players.length > 0 ? Math.max(...this.players.map((player) => player.sprite.x)) : 0;
    for (const wave of this.waves) {
      if (!wave.spawned && front > wave.at) {
        wave.spawned = true;
        for (const entry of wave.enemies) this.spawnEnemy(entry.kind, wave.at + entry.offset, !!entry.elite);
        this.message = wave.boss ? "ABYSSAL COLOSSUS" : "ENEMY CONTACT";
        this.messageTimer = 1.2;
      }
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, elite = false) {
    const stats = {
      crawler: { hp: 42, damage: 10, speed: 112, range: 58, key: "crawler-idle", y: GROUND_Y },
      mutant: { hp: 78, damage: 16, speed: 82, range: 74, key: "mutant-idle", y: GROUND_Y },
      drone: { hp: 48, damage: 12, speed: 88, range: 330, key: "drone", y: GROUND_Y - 240 },
      elite: { hp: 112, damage: 20, speed: 70, range: 98, key: "elite-idle", y: GROUND_Y },
      boss: { hp: 680, damage: 28, speed: 48, range: 210, key: "boss", y: GROUND_Y },
    }[kind];
    const boost = selectedPlayers > 1 && kind !== "boss" ? 1.22 : 1;
    const sprite = this.add.image(x, stats.y, stats.key).setOrigin(0.5, 1).setDepth(kind === "boss" ? 52 : 54);
    const scale = { crawler: 0.72, mutant: 0.78, drone: 0.72, elite: 0.74, boss: 0.66 }[kind];
    sprite.setScale(scale);
    if (elite && kind !== "boss" && kind !== "elite") sprite.setTint(0xc9fdff);
    this.enemies.push({
      id: this.enemySeq++,
      kind,
      sprite,
      hp: stats.hp * boost * (elite ? 1.25 : 1),
      maxHp: stats.hp * boost * (elite ? 1.25 : 1),
      damage: stats.damage,
      speed: stats.speed,
      range: stats.range,
      attackCd: 0.6 + Math.random() * 0.5,
      vx: 0,
      vy: 0,
      facing: -1,
      hurtTime: 0,
      elite,
      phase: 0,
      bob: Math.random() * Math.PI * 2,
    });
  }

  private playerAttack(player: PlayerState) {
    const form = armorForms[player.armor];
    player.attackCd = player.overdrive > 0 ? 0.18 : 0.28;
    player.attackTime = 0.18;
    const slash = this.add.image(player.sprite.x + player.facing * 62, player.sprite.y - 82, "slash").setOrigin(0.5).setFlipX(player.facing < 0).setDepth(90).setBlendMode(Phaser.BlendModes.ADD);
    slash.setScale(0.95);
    this.effects.push({ image: slash, life: 0.16, maxLife: 0.16, spin: player.facing * 0.5 });
    const hit = { x: player.sprite.x + player.facing * 62 - 55, y: player.sprite.y - 132, width: 110, height: 86 };
    for (const enemy of this.enemies) {
      if (this.intersects(hit, this.enemyBounds(enemy))) this.damageEnemy(enemy, form.melee + (player.overdrive > 0 ? 12 : 0), player);
    }
  }

  private playerSpecial(player: PlayerState) {
    const form = armorForms[player.armor];
    player.core -= 28;
    player.specialCd = 0.52;
    player.attackTime = 0.2;
    const bolt = this.add.image(player.sprite.x + player.facing * 64, player.sprite.y - 92, "energy-blasts").setOrigin(0.5).setFlipX(player.facing < 0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    bolt.setCrop(160, 0, 120, 145).setDisplaySize(118, 42);
    this.projectiles.push({ image: bolt, owner: "player", attacker: player, vx: player.facing * 760, vy: 0, damage: form.melee + 16, life: 1.1, facing: player.facing });
    this.spawnBurst(player.sprite.x + player.facing * 50, player.sprite.y - 94, form.colors.accent, 8);
  }

  private enemyStrike(enemy: EnemyState) {
    enemy.attackCd = enemy.kind === "elite" ? 1.15 : 1.45;
    const hit = {
      x: enemy.sprite.x + enemy.facing * 50 - 44,
      y: enemy.sprite.y - 118,
      width: 88,
      height: 104,
    };
    const flash = this.add.image(enemy.sprite.x + enemy.facing * 62, enemy.sprite.y - 78, "hit-sparks").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(91).setBlendMode(Phaser.BlendModes.ADD);
    flash.setCrop(0, 0, 82, 145).setDisplaySize(84, 54);
    this.effects.push({ image: flash, life: 0.16, maxLife: 0.16 });
    for (const player of this.players) {
      if (player.alive && this.intersects(hit, this.playerBounds(player))) this.damagePlayer(player, enemy.damage, enemy.facing);
    }
  }

  private enemyProjectile(enemy: EnemyState, target: PlayerState) {
    const bolt = this.add.image(enemy.sprite.x + enemy.facing * 34, enemy.sprite.y - 52, "energy-blasts").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(70).setBlendMode(Phaser.BlendModes.ADD);
    bolt.setCrop(74, 0, 82, 145).setDisplaySize(82, 36);
    this.projectiles.push({ image: bolt, owner: "enemy", vx: enemy.facing * 420, vy: (target.sprite.y - 110 - enemy.sprite.y) * 0.45, damage: enemy.damage, life: 1.45, facing: enemy.facing });
  }

  private bossSmash(enemy: EnemyState) {
    const impactX = enemy.sprite.x + enemy.facing * 95;
    const ring = this.add.image(impactX, GROUND_Y - 24, "explosions").setOrigin(0.5, 0.72).setDepth(92).setBlendMode(Phaser.BlendModes.ADD);
    ring.setCrop(330, 0, 155, 155).setDisplaySize(190, 170);
    this.effects.push({ image: ring, life: 0.26, maxLife: 0.26 });
    this.shakeTimer = 0.28;
    const hit = { x: impactX - 120, y: GROUND_Y - 156, width: 240, height: 150 };
    for (const player of this.players) {
      if (player.alive && this.intersects(hit, this.playerBounds(player))) this.damagePlayer(player, enemy.damage + 8, enemy.facing);
    }
  }

  private bossBeam(enemy: EnemyState, target: PlayerState) {
    const beam = this.add.image(enemy.sprite.x + enemy.facing * 190, target.sprite.y - 96, "energy-blasts").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(88).setBlendMode(Phaser.BlendModes.ADD);
    beam.setCrop(286, 0, 214, 145).setDisplaySize(430, 86);
    this.effects.push({ image: beam, life: 0.24, maxLife: 0.24 });
    const hit = { x: enemy.facing > 0 ? enemy.sprite.x + 38 : enemy.sprite.x - 430, y: target.sprite.y - 132, width: 430, height: 74 };
    for (const player of this.players) {
      if (player.alive && this.intersects(hit, this.playerBounds(player))) this.damagePlayer(player, enemy.damage, enemy.facing);
    }
  }

  private bossSummon(enemy: EnemyState) {
    const spawnX = Phaser.Math.Clamp(enemy.sprite.x - enemy.facing * 230, 100, WORLD_W - 100);
    this.spawnEnemy(Math.random() > 0.45 ? "crawler" : "mutant", spawnX, Math.random() > 0.65);
    this.spawnBurst(spawnX, GROUND_Y - 64, 0x18e6ff, 18);
  }

  private damageEnemy(enemy: EnemyState, amount: number, attacker?: PlayerState) {
    enemy.hp -= amount;
    enemy.hurtTime = 0.12;
    enemy.sprite.x += (attacker?.facing ?? 1) * (enemy.kind === "boss" ? 8 : 22);
    this.spawnBurst(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.42, 0x18e6ff, 5);
    if (attacker) attacker.core = Math.min(attacker.maxCore, attacker.core + 3);
  }

  private damagePlayer(player: PlayerState, amount: number, direction: 1 | -1) {
    if (player.invuln > 0 || !player.alive) return;
    const control = this.controls[player.id];
    const guarding = this.held(control.guard) || (player.id === 0 && touchHeld.has("guard"));
    const finalDamage = guarding ? amount * 0.34 : amount;
    player.hp -= finalDamage;
    player.invuln = guarding ? 0.12 : 0.36;
    player.hurtTime = 0.2;
    player.vx = direction * 330;
    this.spawnBurst(player.sprite.x, player.sprite.y - 88, guarding ? 0x67e8ff : 0xff6d57, 8);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.sprite.setTexture("hero-hit").setAlpha(0.65).setRotation(-0.65);
    }
  }

  private textureForPlayer(player: PlayerState) {
    if (player.hurtTime > 0) return "hero-hit";
    if (player.attackTime > 0 && player.specialCd > 0.32) return "hero-attack-blast";
    if (player.attackTime > 0) return "hero-attack-slash";
    if (player.dashTime > 0) return "hero-dash";
    if (!player.grounded) return "hero-jump";
    if (Math.abs(player.vx) > 40) return `hero-walk-${(Math.floor(player.step) % 4) + 1}`;
    return "hero-idle";
  }

  private switchArmor(player: PlayerState, direction: number) {
    this.setArmor(player, Phaser.Math.Wrap(player.armor + direction, 0, armorForms.length));
  }

  private setArmor(player: PlayerState, armor: number) {
    if (player.armor === armor) return;
    player.armor = armor;
    player.core = Math.min(player.maxCore, player.core + 8);
    player.sprite.setTexture(this.textureForPlayer(player));
    this.spawnBurst(player.sprite.x, player.sprite.y - 90, armorForms[player.armor].colors.accent, 12);
    this.message = `${player.tag} ${armorForms[player.armor].short}`;
    this.messageTimer = 0.7;
  }

  private nearestPlayer(x: number) {
    const alive = this.players.filter((player) => player.alive);
    if (alive.length === 0) return undefined;
    return alive.reduce((best, player) => Math.abs(player.sprite.x - x) < Math.abs(best.sprite.x - x) ? player : best, alive[0]);
  }

  private held(keys: Phaser.Input.Keyboard.Key[]) {
    return keys.some((key) => key.isDown);
  }

  private just(keys: Phaser.Input.Keyboard.Key[]) {
    return keys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  private intersects(a: RectLike, b: RectLike) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private boundsFor(image: Phaser.GameObjects.Image, width: number, height: number) {
    return { x: image.x - width / 2, y: image.y - height / 2, width, height };
  }

  private playerBounds(player: PlayerState) {
    const width = Math.max(62, player.sprite.displayWidth * 0.42);
    const height = Math.max(132, player.sprite.displayHeight * 0.86);
    return { x: player.sprite.x - width / 2, y: player.sprite.y - height, width, height };
  }

  private enemyBounds(enemy: EnemyState) {
    const width = enemy.kind === "boss" ? enemy.sprite.displayWidth * 0.46 : enemy.sprite.displayWidth * 0.58;
    const height = enemy.kind === "drone" ? enemy.sprite.displayHeight * 0.56 : enemy.sprite.displayHeight * 0.78;
    return { x: enemy.sprite.x - width / 2, y: enemy.sprite.y - height, width, height };
  }

  private endRun(title: string, copy: string) {
    if (!this.running) return;
    this.running = false;
    showOverlay(title, `${copy} Diem: ${this.score}.`, "Choi lai");
  }

  private drawHud() {
    this.scoreText.setText(`DIEM ${this.score}`);
    this.messageText.setText(this.messageTimer > 0 ? this.message : "");
    this.messageText.setAlpha(Math.min(1, this.messageTimer));

    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      const y = 14 + i * 86;
      const healthIndex = i * 2;
      const energyIndex = healthIndex + 1;
      if (!this.hudImages[healthIndex]) {
        this.hudImages[healthIndex] = this.add.image(22, y, "hud-health").setOrigin(0, 0).setScale(0.62).setScrollFactor(0).setDepth(998);
        this.hudImages[energyIndex] = this.add.image(68, y + 44, "hud-energy").setOrigin(0, 0).setScale(0.5).setScrollFactor(0).setDepth(998);
      }
      this.hudImages[healthIndex].setPosition(22, y).setVisible(true).setAlpha(player.alive ? 1 : 0.48);
      this.hudImages[energyIndex].setPosition(68, y + 44).setVisible(true).setAlpha(player.alive ? 1 : 0.48);
      player.portrait.setPosition(58, y + 40).setVisible(true).setTexture("hero-portrait");

      if (!this.hudTexts[i * 2]) {
        this.hudTexts[i * 2] = this.add.text(140, y + 7, "", { fontFamily: "Inter, Arial, sans-serif", fontSize: "13px", fontStyle: "900", color: "#8cf8ff", stroke: "#02060b", strokeThickness: 3 }).setScrollFactor(0).setDepth(1001);
        this.hudTexts[i * 2 + 1] = this.add.text(175, y + 7, "", { fontFamily: "Inter, Arial, sans-serif", fontSize: "14px", fontStyle: "900", color: "#eaf8ff", stroke: "#02060b", strokeThickness: 3 }).setScrollFactor(0).setDepth(1001);
      }
      this.hudTexts[i * 2].setPosition(140, y + 7).setText(player.tag).setVisible(true);
      this.hudTexts[i * 2 + 1].setPosition(175, y + 7).setText(player.alive ? armorForms[player.armor].name : "Da guc").setVisible(true);
    }

    for (let i = this.players.length * 2; i < this.hudTexts.length; i++) this.hudTexts[i].setVisible(false);
    for (let i = this.players.length * 2; i < this.hudImages.length; i++) this.hudImages[i].setVisible(false);

    const boss = this.enemies.find((enemy) => enemy.kind === "boss");
    if (boss) {
      if (!this.bossHudImage) this.bossHudImage = this.add.image(W / 2, 24, "hud-boss").setOrigin(0.5, 0).setScale(0.6).setScrollFactor(0).setDepth(998);
      this.bossHudImage.setVisible(true).setAlpha(1);
    } else {
      this.bossHudImage?.setVisible(false);
    }
  }

  private spawnBurst(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const spark = this.add.image(x, y, "hit-sparks").setBlendMode(Phaser.BlendModes.ADD).setDepth(95);
      const frame = Phaser.Math.Between(0, 4);
      const size = 14 + Math.random() * 20;
      spark.setCrop(frame * 71, 0, 71, 145).setDisplaySize(size, size);
      const angle = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 46;
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2 + Math.random() * 0.6,
        duration: 260 + Math.random() * 180,
        onComplete: () => spark.destroy(),
      });
    }
  }

  private spawnJet(x: number, y: number, color: number) {
    const jet = this.add.image(x, y, "energy-blasts").setCrop(286, 0, 160, 145).setDisplaySize(130, 42).setAlpha(0.58).setBlendMode(Phaser.BlendModes.ADD).setDepth(45);
    this.effects.push({ image: jet, life: 0.18, maxLife: 0.18 });
  }

  private addAfterimage(player: PlayerState) {
    const ghost = this.add.image(player.sprite.x, player.sprite.y, player.sprite.texture.key).setOrigin(0.5, 1).setFlipX(player.facing < 0).setTint(armorForms[player.armor].colors.accent).setAlpha(0.38).setBlendMode(Phaser.BlendModes.ADD).setDepth(48);
    this.effects.push({ image: ghost, life: 0.22, maxLife: 0.22 });
  }

  private drawBackground() {
    const scale = 2.84;
    const tileWidth = 930 * scale;
    for (let x = 0; x < WORLD_W + tileWidth; x += tileWidth - 2) {
      this.add.image(x, 0, "bg-city-neon").setOrigin(0, 0).setScale(scale).setDepth(-20);
    }
  }
}

function showOverlay(title: string, copy: string, buttonText: string) {
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  startButton.textContent = buttonText;
  overlay.classList.add("is-visible");
}

function hideOverlay() {
  overlay.classList.remove("is-visible");
}

function bootDom() {
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedPlayers = Number(button.dataset.mode ?? "1");
      modeButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    });
  });
  startButton.addEventListener("click", () => {
    hideOverlay();
    gameScene?.startRun(selectedPlayers);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    const action = button.dataset.action as Action;
    const start = (event: Event) => {
      event.preventDefault();
      touchHeld.add(action);
      touchJust.add(action);
      button.classList.add("is-pressed");
    };
    const end = (event: Event) => {
      event.preventDefault();
      touchHeld.delete(action);
      button.classList.remove("is-pressed");
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });
}

bootDom();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "gameMount",
  width: W,
  height: H,
  backgroundColor: "#06111f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  scene: MainScene,
});
