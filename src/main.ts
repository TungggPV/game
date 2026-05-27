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
type Pose = "idle" | "walk1" | "walk2" | "jump" | "attack" | "dash" | "hurt";

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

const playerPalettes: Colors[] = [
  armorForms[0].colors,
  { primary: 0x13a7ff, plate: 0xe9f4ff, accent: 0x94fbff, visor: 0xc7fdff, dark: 0x061728, trim: 0x0b65d8 },
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
  private hud!: Phaser.GameObjects.Graphics;
  private hudTexts: Phaser.GameObjects.Text[] = [];
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

  create() {
    gameScene = this;
    this.cameras.main.setBounds(0, 0, WORLD_W, H);
    this.cameras.main.setBackgroundColor("#06111f");
    this.createTextures();
    this.drawBackground();
    this.createControls();
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
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
    this.players = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.hudTexts = [];
  }

  private createPlayers(playerCount: number): PlayerState[] {
    const result: PlayerState[] = [];
    for (let i = 0; i < playerCount; i++) {
      const armor = i % armorForms.length;
      const sprite = this.add.image(140 + i * 72, GROUND_Y, `hero-p${i + 1}-${armorForms[armor].id}-idle`).setOrigin(0.5, 1).setDepth(60);
      const portrait = this.add.image(60, 56 + i * 74, `hero-p${i + 1}-${armorForms[armor].id}-idle`).setOrigin(0.5, 0.85).setScale(0.32).setScrollFactor(0).setDepth(1002);
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
      if (enemy.kind !== "boss" && enemy.kind !== "drone") {
        const walk = Math.floor(this.time.now * 0.008 + enemy.id) % 2 === 0 ? "walk1" : "walk2";
        enemy.sprite.setTexture(`${enemy.kind}-${Math.abs(enemy.vx) > 8 ? walk : "idle"}`);
      }
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
    if (elite && kind !== "boss") sprite.setTint(0xc9fdff);
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
    slash.setTint(form.colors.accent);
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
    const bolt = this.add.image(player.sprite.x + player.facing * 64, player.sprite.y - 92, "player-bolt").setOrigin(0.5).setFlipX(player.facing < 0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    bolt.setTint(form.colors.accent);
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
    const flash = this.add.image(enemy.sprite.x + enemy.facing * 62, enemy.sprite.y - 78, "enemy-spark").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(91).setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push({ image: flash, life: 0.16, maxLife: 0.16 });
    for (const player of this.players) {
      if (player.alive && this.intersects(hit, this.playerBounds(player))) this.damagePlayer(player, enemy.damage, enemy.facing);
    }
  }

  private enemyProjectile(enemy: EnemyState, target: PlayerState) {
    const bolt = this.add.image(enemy.sprite.x + enemy.facing * 34, enemy.sprite.y - 52, "enemy-bolt").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(70).setBlendMode(Phaser.BlendModes.ADD);
    this.projectiles.push({ image: bolt, owner: "enemy", vx: enemy.facing * 420, vy: (target.sprite.y - 110 - enemy.sprite.y) * 0.45, damage: enemy.damage, life: 1.45, facing: enemy.facing });
  }

  private bossSmash(enemy: EnemyState) {
    const impactX = enemy.sprite.x + enemy.facing * 95;
    const ring = this.add.image(impactX, GROUND_Y - 34, "impact").setDepth(92).setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push({ image: ring, life: 0.26, maxLife: 0.26 });
    this.shakeTimer = 0.28;
    const hit = { x: impactX - 120, y: GROUND_Y - 156, width: 240, height: 150 };
    for (const player of this.players) {
      if (player.alive && this.intersects(hit, this.playerBounds(player))) this.damagePlayer(player, enemy.damage + 8, enemy.facing);
    }
  }

  private bossBeam(enemy: EnemyState, target: PlayerState) {
    const beam = this.add.image(enemy.sprite.x + enemy.facing * 190, target.sprite.y - 96, "boss-beam").setOrigin(0.5).setFlipX(enemy.facing < 0).setDepth(88).setBlendMode(Phaser.BlendModes.ADD);
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
      player.sprite.setTexture(`hero-p${player.id + 1}-${armorForms[player.armor].id}-hurt`).setAlpha(0.65).setRotation(-0.65);
    }
  }

  private textureForPlayer(player: PlayerState) {
    const base = `hero-p${player.id + 1}`;
    const armor = armorForms[player.armor].id;
    if (player.hurtTime > 0) return `${base}-${armor}-hurt`;
    if (player.attackTime > 0) return `${base}-${armor}-attack`;
    if (player.dashTime > 0) return `${base}-${armor}-dash`;
    if (!player.grounded) return `${base}-${armor}-jump`;
    if (Math.abs(player.vx) > 40) return `${base}-${armor}-${Math.floor(player.step) % 2 === 0 ? "walk1" : "walk2"}`;
    return `${base}-${armor}-idle`;
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
    return { x: player.sprite.x - 34, y: player.sprite.y - 146, width: 68, height: 140 };
  }

  private enemyBounds(enemy: EnemyState) {
    if (enemy.kind === "boss") return { x: enemy.sprite.x - 100, y: enemy.sprite.y - 214, width: 200, height: 210 };
    if (enemy.kind === "drone") return { x: enemy.sprite.x - 48, y: enemy.sprite.y - 82, width: 96, height: 76 };
    if (enemy.kind === "crawler") return { x: enemy.sprite.x - 44, y: enemy.sprite.y - 64, width: 88, height: 64 };
    return { x: enemy.sprite.x - 42, y: enemy.sprite.y - 128, width: 84, height: 126 };
  }

  private endRun(title: string, copy: string) {
    if (!this.running) return;
    this.running = false;
    showOverlay(title, `${copy} Diem: ${this.score}.`, "Choi lai");
  }

  private drawHud() {
    this.hud.clear();
    this.hud.fillStyle(0x020b18, 0.78);
    this.hud.lineStyle(2, 0x18e6ff, 0.72);
    this.roundPanel(W - 244, 21, 214, 42, 8);
    this.scoreText.setText(`DIEM ${this.score}`);
    this.messageText.setText(this.messageTimer > 0 ? this.message : "");
    this.messageText.setAlpha(Math.min(1, this.messageTimer));

    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      const y = 26 + i * 74;
      this.hud.fillStyle(0x02152f, 0.84);
      this.hud.lineStyle(2, player.alive ? 0x18e6ff : 0xff6d57, 0.68);
      this.roundPanel(34, y, 356, 62, 8);
      this.hud.lineStyle(1, 0x18e6ff, 0.16);
      for (let k = 0; k < 6; k++) {
        this.hud.strokeTriangle(72 + k * 46, y + 8, 91 + k * 46, y + 31, 72 + k * 46, y + 54);
      }
      player.portrait.setPosition(67, y + 54).setVisible(true).setTexture(`hero-p${player.id + 1}-${armorForms[player.armor].id}-idle`);
      this.drawBar(128, y + 27, 172, 12, player.hp / player.maxHp, player.alive ? 0x45f06b : 0x682232);
      this.drawBar(128, y + 44, 172, 10, player.core / player.maxCore, 0x18e6ff);
      if (player.overdrive > 0) this.drawBar(310, y + 45, 58, 8, player.overdrive / 7.5, armorForms[player.armor].colors.accent);
      this.hud.fillStyle(0x8cf8ff, 1);
      this.hud.fillRect(315, y + 23, 16, 14);
      for (let k = 0; k < 4; k++) {
        this.hud.fillStyle(k === player.armor ? armorForms[k].colors.primary : 0xe9f4ff, k === player.armor ? 1 : 0.12);
        this.hud.fillRoundedRect(314 + k * 22, y + 23, 17, 14, 3);
        this.hud.lineStyle(1, k === player.armor ? armorForms[k].colors.accent : 0xe9f4ff, k === player.armor ? 0.9 : 0.24);
        this.hud.strokeRoundedRect(314 + k * 22, y + 23, 17, 14, 3);
      }

      if (!this.hudTexts[i * 2]) {
        this.hudTexts[i * 2] = this.add.text(128, y + 8, "", { fontFamily: "Inter, Arial, sans-serif", fontSize: "13px", fontStyle: "900", color: "#8cf8ff" }).setScrollFactor(0).setDepth(1001);
        this.hudTexts[i * 2 + 1] = this.add.text(160, y + 8, "", { fontFamily: "Inter, Arial, sans-serif", fontSize: "15px", fontStyle: "900", color: "#eaf8ff" }).setScrollFactor(0).setDepth(1001);
      }
      this.hudTexts[i * 2].setPosition(128, y + 8).setText(player.tag).setVisible(true);
      this.hudTexts[i * 2 + 1].setPosition(160, y + 8).setText(player.alive ? armorForms[player.armor].name : "Da guc").setVisible(true);
    }

    for (let i = this.players.length * 2; i < this.hudTexts.length; i++) this.hudTexts[i].setVisible(false);
    const progress = this.players.length > 0 ? Phaser.Math.Clamp(Math.max(...this.players.map((player) => player.sprite.x)) / (WORLD_W - 160), 0, 1) : 0;
    this.hud.fillStyle(0x020b18, 0.76);
    this.hud.fillRoundedRect(454, H - 40, 372, 16, 6);
    this.hud.lineStyle(2, 0x18e6ff, 0.38);
    this.hud.strokeRoundedRect(454, H - 40, 372, 16, 6);
    this.hud.fillStyle(0x18e6ff, 0.9);
    this.hud.fillRoundedRect(458, H - 36, 364 * progress, 8, 4);
  }

  private drawBar(x: number, y: number, w: number, h: number, value: number, color: number) {
    const width = Math.max(0, w * Phaser.Math.Clamp(value, 0, 1));
    this.hud.fillStyle(0x000000, 0.58);
    this.hud.fillRoundedRect(x, y, w, h, 4);
    this.hud.lineStyle(1, 0xffffff, 0.18);
    this.hud.strokeRoundedRect(x, y, w, h, 4);
    this.hud.fillStyle(color, 1);
    this.hud.fillRoundedRect(x, y, width, h, 4);
    this.hud.fillStyle(0xffffff, 0.32);
    this.hud.fillRoundedRect(x + 2, y + 2, Math.max(0, width - 4), Math.max(2, h * 0.28), 3);
  }

  private roundPanel(x: number, y: number, w: number, h: number, r: number) {
    this.hud.fillRoundedRect(x, y, w, h, r);
    this.hud.strokeRoundedRect(x, y, w, h, r);
  }

  private spawnBurst(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const spark = this.add.image(x, y, "spark").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(95);
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
    const jet = this.add.image(x, y, "impact").setTint(color).setAlpha(0.55).setScale(0.5, 0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(45);
    this.effects.push({ image: jet, life: 0.18, maxLife: 0.18 });
  }

  private addAfterimage(player: PlayerState) {
    const ghost = this.add.image(player.sprite.x, player.sprite.y, player.sprite.texture.key).setOrigin(0.5, 1).setFlipX(player.facing < 0).setTint(armorForms[player.armor].colors.accent).setAlpha(0.38).setBlendMode(Phaser.BlendModes.ADD).setDepth(48);
    this.effects.push({ image: ghost, life: 0.22, maxLife: 0.22 });
  }

  private drawBackground() {
    const back = this.add.graphics().setDepth(-20);
    back.fillGradientStyle(0x07132a, 0x07132a, 0x08111d, 0x03070d, 1);
    back.fillRect(0, 0, WORLD_W, H);
    back.fillStyle(0x102f67, 0.34);
    for (let i = 0; i < 55; i++) {
      const x = 80 + i * 84;
      const h = 130 + ((i * 47) % 240);
      back.fillRect(x, GROUND_Y - 86 - h, 56 + (i % 4) * 22, h);
      back.fillStyle(i % 5 === 0 ? 0x18e6ff : 0x3457ff, 0.4);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 3; col++) {
          if ((row + col + i) % 3 !== 0) back.fillRect(x + 10 + col * 17, GROUND_Y - 72 - h + 20 + row * 25, 7, 10);
        }
      }
      back.fillStyle(0x102f67, 0.34);
    }
    back.lineStyle(2, 0x18e6ff, 0.5);
    for (let i = 0; i < 14; i++) {
      const x = 260 + i * 320;
      back.strokeRect(x, GROUND_Y - 286, 104, 42);
      back.fillStyle(i % 2 ? 0x0b65d8 : 0x18e6ff, 0.18);
      back.fillRect(x + 5, GROUND_Y - 281, 94, 32);
    }

    const mid = this.add.graphics().setDepth(-10);
    mid.fillStyle(0x121a25, 1);
    mid.fillRect(0, GROUND_Y - 54, WORLD_W, 72);
    mid.lineStyle(4, 0x0d1d32, 1);
    for (let x = -20; x < WORLD_W; x += 120) {
      mid.fillStyle(0x222c38, 1);
      mid.fillRoundedRect(x, GROUND_Y - 65, 124, 60, 4);
      mid.lineStyle(2, 0x03070d, 1);
      mid.strokeRoundedRect(x, GROUND_Y - 65, 124, 60, 4);
      mid.fillStyle(0x18e6ff, 0.52);
      mid.fillRect(x + 18, GROUND_Y - 28, 66, 5);
      mid.fillStyle(0xf9b62e, 0.62);
      mid.fillRect(x + 90, GROUND_Y - 57, 22, 4);
    }
    mid.fillStyle(0x070b12, 1);
    mid.fillRect(0, GROUND_Y, WORLD_W, H - GROUND_Y);
    mid.lineStyle(2, 0x18e6ff, 0.32);
    mid.strokeRect(0, GROUND_Y - 76, WORLD_W, 16);
  }

  private createTextures() {
    for (let p = 0; p < 2; p++) {
      for (const form of armorForms) {
        const playerAccent = playerPalettes[p];
        const colors = {
          ...form.colors,
          visor: p === 0 ? form.colors.visor : playerAccent.visor,
          plate: p === 0 ? form.colors.plate : playerAccent.plate,
          trim: p === 0 ? form.colors.trim : playerAccent.trim,
        };
        for (const pose of ["idle", "walk1", "walk2", "jump", "attack", "dash", "hurt"] as Pose[]) {
          drawHeroTexture(this, `hero-p${p + 1}-${form.id}-${pose}`, colors, pose);
        }
      }
    }
    drawCrawlerTexture(this, "crawler-idle", "idle");
    drawCrawlerTexture(this, "crawler-walk1", "walk1");
    drawCrawlerTexture(this, "crawler-walk2", "walk2");
    drawMutantTexture(this, "mutant-idle", "mutant", "idle");
    drawMutantTexture(this, "mutant-walk1", "mutant", "walk1");
    drawMutantTexture(this, "mutant-walk2", "mutant", "walk2");
    drawMutantTexture(this, "elite-idle", "elite", "idle");
    drawMutantTexture(this, "elite-walk1", "elite", "walk1");
    drawMutantTexture(this, "elite-walk2", "elite", "walk2");
    drawDroneTexture(this, "drone");
    drawBossTexture(this, "boss");
    drawSlashTexture(this, "slash");
    drawBoltTexture(this, "player-bolt", 0x18e6ff);
    drawBoltTexture(this, "enemy-bolt", 0x67e8ff);
    drawBeamTexture(this, "boss-beam");
    drawImpactTexture(this, "impact");
    drawSparkTexture(this, "spark");
    drawSparkSlashTexture(this, "enemy-spark");
  }
}

function drawHeroTexture(scene: Phaser.Scene, key: string, colors: Colors, pose: Pose) {
  const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);
  const cx = 76;
  const feet = 166;
  const walk = pose === "walk1" ? 5 : pose === "walk2" ? -5 : 0;
  const attack = pose === "attack";
  const dash = pose === "dash";
  const jump = pose === "jump";
  const hurt = pose === "hurt";
  g.clear();
  g.lineStyle(4, 0x02060c, 1);
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(cx, feet + 2, 70, 16);
  limb(g, cx - 18, feet - 56, cx - 31 - walk, feet - 15, 15, colors.dark, colors.plate, colors.accent);
  limb(g, cx + 18, feet - 56, cx + 31 + walk, feet - 15, 15, colors.dark, colors.plate, colors.accent);
  poly(g, [[cx - 46, feet - 90], [cx - 34, feet - 116], [cx - 10, feet - 127], [cx + 11, feet - 127], [cx + 36, feet - 116], [cx + 48, feet - 90], [cx + 34, feet - 45], [cx + 10, feet - 36], [cx - 10, feet - 36], [cx - 34, feet - 45]], colors.plate, colors.accent);
  poly(g, [[cx - 24, feet - 104], [cx, feet - 122], [cx + 24, feet - 104], [cx + 16, feet - 72], [cx, feet - 61], [cx - 16, feet - 72]], colors.primary, colors.accent);
  poly(g, [[cx - 60, feet - 94], [cx - 36, feet - 119], [cx - 10, feet - 101], [cx - 29, feet - 76], [cx - 54, feet - 72]], colors.primary, colors.accent);
  poly(g, [[cx + 60, feet - 94], [cx + 36, feet - 119], [cx + 10, feet - 101], [cx + 29, feet - 76], [cx + 54, feet - 72]], colors.primary, colors.accent);
  const leftArmEnd = attack ? [cx - 54, feet - 78] : [cx - 47, feet - 47];
  const rightArmEnd = attack ? [cx + 86, feet - 78] : dash ? [cx + 62, feet - 48] : [cx + 49, feet - 48];
  limb(g, cx - 25, feet - 82, leftArmEnd[0], leftArmEnd[1], 15, colors.dark, colors.plate, colors.accent);
  limb(g, cx + 25, feet - 82, rightArmEnd[0], rightArmEnd[1], 15, colors.dark, colors.plate, colors.accent);
  poly(g, [[cx - 38 - walk, feet - 29], [cx - 13 - walk, feet - 29], [cx - 6 - walk, feet - 6], [cx - 42 - walk, feet - 6]], colors.primary, colors.accent);
  poly(g, [[cx + 38 + walk, feet - 29], [cx + 13 + walk, feet - 29], [cx + 6 + walk, feet - 6], [cx + 42 + walk, feet - 6]], colors.primary, colors.accent);
  poly(g, [[cx - 12, feet - 94], [cx, feet - 102], [cx + 12, feet - 94], [cx + 10, feet - 78], [cx, feet - 71], [cx - 10, feet - 78]], colors.accent, 0xffffff);
  helmet(g, cx, feet - (jump ? 134 : 132), colors);
  if (attack) {
    g.lineStyle(7, colors.accent, 0.9);
    g.strokeEllipse(cx + 78, feet - 78, 72, 32);
  }
  if (dash) {
    g.fillStyle(colors.accent, 0.35);
    g.fillTriangle(cx - 72, feet - 104, cx - 15, feet - 86, cx - 68, feet - 70);
  }
  if (hurt) g.setAlpha(0.72);
  g.generateTexture(key, 152, 178);
  g.destroy();
}

function helmet(g: Phaser.GameObjects.Graphics, cx: number, top: number, colors: Colors) {
  poly(g, [[cx - 34, top + 24], [cx - 21, top + 5], [cx - 6, top - 4], [cx, top - 15], [cx + 7, top - 4], [cx + 22, top + 5], [cx + 35, top + 24], [cx + 27, top + 50], [cx + 10, top + 59], [cx - 10, top + 59], [cx - 27, top + 50]], colors.plate, colors.accent);
  poly(g, [[cx - 44, top + 24], [cx - 24, top + 8], [cx - 29, top + 32], [cx - 48, top + 43]], colors.primary, colors.accent);
  poly(g, [[cx + 44, top + 24], [cx + 24, top + 8], [cx + 29, top + 32], [cx + 48, top + 43]], colors.primary, colors.accent);
  poly(g, [[cx - 24, top + 31], [cx, top + 21], [cx + 24, top + 31], [cx + 15, top + 45], [cx, top + 51], [cx - 15, top + 45]], colors.visor, 0xffffff);
  poly(g, [[cx - 6, top + 3], [cx, top - 17], [cx + 8, top + 3], [cx + 5, top + 34], [cx - 5, top + 34]], colors.primary, colors.accent);
}

function drawCrawlerTexture(scene: Phaser.Scene, key: string, pose: "idle" | "walk1" | "walk2") {
  const g = scene.add.graphics().setVisible(false);
  const cx = 64;
  const feet = 78;
  const wiggle = pose === "walk1" ? -5 : pose === "walk2" ? 5 : 0;
  g.lineStyle(3, 0x02060c, 1);
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(cx, feet + 2, 76, 12);
  limb(g, cx - 24, feet - 24, cx - 44, feet - 8 + wiggle, 8, 0x121824, 0xd7e3f0, 0x18e6ff);
  limb(g, cx + 24, feet - 24, cx + 44, feet - 8 - wiggle, 8, 0x121824, 0xd7e3f0, 0x18e6ff);
  limb(g, cx - 8, feet - 20, cx - 22, feet - 4 - wiggle, 8, 0x121824, 0x0b65d8, 0x18e6ff);
  limb(g, cx + 8, feet - 20, cx + 22, feet - 4 + wiggle, 8, 0x121824, 0x0b65d8, 0x18e6ff);
  poly(g, [[cx - 42, feet - 42], [cx - 20, feet - 62], [cx + 28, feet - 62], [cx + 46, feet - 40], [cx + 32, feet - 20], [cx - 31, feet - 20]], 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 18, feet - 50], [cx + 14, feet - 50], [cx + 24, feet - 32], [cx - 24, feet - 32]], 0x0b65d8, 0x18e6ff);
  g.fillStyle(0x18e6ff, 1);
  g.fillCircle(cx, feet - 41, 9);
  g.generateTexture(key, 128, 88);
  g.destroy();
}

function drawMutantTexture(scene: Phaser.Scene, key: string, variant: "mutant" | "elite", pose: "idle" | "walk1" | "walk2") {
  const g = scene.add.graphics().setVisible(false);
  const cx = 72;
  const feet = 146;
  const walk = pose === "walk1" ? 6 : pose === "walk2" ? -6 : 0;
  const blue = variant === "elite" ? 0x0b65d8 : 0x1f8ee8;
  g.lineStyle(4, 0x02060c, 1);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(cx, feet + 2, 78, 16);
  limb(g, cx - 20, feet - 48, cx - 35 - walk, feet - 9, 15, 0x141b27, 0xc7d2e1, 0x18e6ff);
  limb(g, cx + 20, feet - 48, cx + 35 + walk, feet - 9, 15, 0x141b27, 0xc7d2e1, 0x18e6ff);
  limb(g, cx - 34, feet - 92, cx - 58, feet - 55, 17, 0x141b27, 0xd7e3f0, 0x18e6ff);
  limb(g, cx + 34, feet - 92, cx + 61, feet - 55, 17, 0x141b27, 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 51, feet - 105], [cx - 28, feet - 128], [cx, feet - 135], [cx + 31, feet - 128], [cx + 54, feet - 105], [cx + 42, feet - 42], [cx + 15, feet - 32], [cx, feet - 38], [cx - 16, feet - 32], [cx - 42, feet - 42]], 0x202838, 0x18e6ff);
  poly(g, [[cx - 34, feet - 96], [cx, feet - 118], [cx + 35, feet - 96], [cx + 22, feet - 62], [cx, feet - 52], [cx - 22, feet - 62]], 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 18, feet - 91], [cx, feet - 104], [cx + 18, feet - 91], [cx + 12, feet - 75], [cx, feet - 67], [cx - 12, feet - 75]], blue, 0x18e6ff);
  poly(g, [[cx - 30, feet - 137], [cx - 8, feet - 153], [cx + 10, feet - 153], [cx + 32, feet - 137], [cx + 25, feet - 112], [cx, feet - 104], [cx - 25, feet - 112]], 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 33, feet - 137], [cx - 55, feet - 151], [cx - 40, feet - 121]], blue, 0x18e6ff);
  poly(g, [[cx + 33, feet - 137], [cx + 55, feet - 151], [cx + 40, feet - 121]], blue, 0x18e6ff);
  poly(g, [[cx - 16, feet - 128], [cx, feet - 137], [cx + 16, feet - 128], [cx + 10, feet - 120], [cx - 10, feet - 120]], 0x8cf8ff, 0xffffff);
  g.generateTexture(key, 144, 158);
  g.destroy();
}

function drawDroneTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  const cx = 80;
  const cy = 72;
  g.lineStyle(3, 0x02060c, 1);
  g.fillStyle(0x18e6ff, 0.28);
  g.fillEllipse(cx - 56, cy, 74, 16);
  g.fillEllipse(cx + 56, cy, 74, 16);
  poly(g, [[cx - 72, cy - 18], [cx - 28, cy - 28], [cx - 6, cy], [cx - 50, cy + 15]], 0x0b65d8, 0x18e6ff);
  poly(g, [[cx + 72, cy - 18], [cx + 28, cy - 28], [cx + 6, cy], [cx + 50, cy + 15]], 0x0b65d8, 0x18e6ff);
  poly(g, [[cx - 28, cy - 33], [cx, cy - 50], [cx + 28, cy - 33], [cx + 22, cy + 18], [cx, cy + 35], [cx - 22, cy + 18]], 0xf2f8ff, 0x18e6ff);
  poly(g, [[cx - 18, cy - 18], [cx, cy - 29], [cx + 18, cy - 18], [cx + 12, cy + 2], [cx, cy + 10], [cx - 12, cy + 2]], 0x0b65d8, 0x67f6ff);
  g.fillStyle(0x8cf8ff, 1);
  g.fillRoundedRect(cx - 17, cy - 17, 34, 7, 3);
  g.generateTexture(key, 160, 118);
  g.destroy();
}

function drawBossTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  const cx = 128;
  const feet = 234;
  g.lineStyle(5, 0x02060c, 1);
  g.fillStyle(0x000000, 0.24);
  g.fillEllipse(cx, feet + 2, 150, 24);
  limb(g, cx - 54, feet - 76, cx - 78, feet - 10, 24, 0x121925, 0x667287, 0x18e6ff);
  limb(g, cx + 54, feet - 76, cx + 80, feet - 10, 24, 0x121925, 0x667287, 0x18e6ff);
  limb(g, cx - 75, feet - 138, cx - 126, feet - 88, 28, 0x121925, 0xd7e3f0, 0x18e6ff);
  limb(g, cx + 75, feet - 138, cx + 132, feet - 88, 28, 0x121925, 0xd7e3f0, 0x18e6ff);
  for (let i = 0; i < 7; i++) poly(g, [[cx - 68 + i * 22, feet - 172], [cx - 58 + i * 22, feet - 202 - (i % 2) * 8], [cx - 46 + i * 22, feet - 172]], i % 2 ? 0x18e6ff : 0x0b65d8, 0x18e6ff);
  poly(g, [[cx - 88, feet - 154], [cx - 42, feet - 196], [cx, feet - 204], [cx + 46, feet - 196], [cx + 92, feet - 154], [cx + 68, feet - 56], [cx + 27, feet - 38], [cx, feet - 48], [cx - 30, feet - 38], [cx - 68, feet - 56]], 0x202838, 0x18e6ff);
  poly(g, [[cx - 70, feet - 148], [cx - 32, feet - 174], [cx, feet - 182], [cx + 34, feet - 174], [cx + 72, feet - 148], [cx + 51, feet - 78], [cx + 18, feet - 64], [cx, feet - 70], [cx - 20, feet - 64], [cx - 51, feet - 78]], 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 38, feet - 156], [cx, feet - 178], [cx + 40, feet - 156], [cx + 25, feet - 104], [cx - 24, feet - 104]], 0x0b65d8, 0x18e6ff);
  poly(g, [[cx - 38, feet - 196], [cx - 18, feet - 220], [cx, feet - 228], [cx + 20, feet - 220], [cx + 40, feet - 196], [cx + 29, feet - 170], [cx, feet - 160], [cx - 30, feet - 170]], 0xd7e3f0, 0x18e6ff);
  poly(g, [[cx - 22, feet - 190], [cx, feet - 200], [cx + 22, feet - 190], [cx + 15, feet - 178], [cx - 15, feet - 178]], 0x8cf8ff, 0xffffff);
  g.fillStyle(0x67f6ff, 0.95);
  g.fillCircle(cx, feet - 132, 18);
  g.generateTexture(key, 256, 248);
  g.destroy();
}

function drawSlashTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  g.lineStyle(13, 0x18e6ff, 0.86);
  g.beginPath();
  g.arc(58, 58, 52, Phaser.Math.DegToRad(216), Phaser.Math.DegToRad(330), false);
  g.strokePath();
  g.lineStyle(5, 0xffffff, 0.92);
  g.beginPath();
  g.arc(58, 58, 38, Phaser.Math.DegToRad(220), Phaser.Math.DegToRad(328), false);
  g.strokePath();
  g.generateTexture(key, 116, 116);
  g.destroy();
}

function drawSparkSlashTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  g.lineStyle(6, 0x18e6ff, 0.9);
  g.lineBetween(10, 42, 78, 20);
  g.lineStyle(3, 0xffffff, 0.9);
  g.lineBetween(18, 48, 92, 40);
  g.generateTexture(key, 104, 68);
  g.destroy();
}

function drawBoltTexture(scene: Phaser.Scene, key: string, color: number) {
  const g = scene.add.graphics().setVisible(false);
  g.fillStyle(color, 0.8);
  g.fillTriangle(0, 18, 66, 0, 78, 18);
  g.fillTriangle(0, 18, 66, 36, 78, 18);
  g.fillStyle(0xffffff, 0.9);
  g.fillTriangle(12, 18, 54, 8, 66, 18);
  g.fillTriangle(12, 18, 54, 28, 66, 18);
  g.generateTexture(key, 82, 38);
  g.destroy();
}

function drawBeamTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  g.fillStyle(0x18e6ff, 0.45);
  g.fillRoundedRect(0, 22, 420, 36, 18);
  g.fillStyle(0xffffff, 0.85);
  g.fillRoundedRect(16, 32, 330, 14, 7);
  g.lineStyle(4, 0x18e6ff, 0.85);
  g.strokeCircle(350, 40, 30);
  g.generateTexture(key, 430, 80);
  g.destroy();
}

function drawImpactTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  g.lineStyle(5, 0x18e6ff, 0.82);
  g.strokeEllipse(64, 34, 110, 44);
  g.fillStyle(0x18e6ff, 0.35);
  g.fillEllipse(64, 34, 90, 25);
  g.generateTexture(key, 128, 68);
  g.destroy();
}

function drawSparkTexture(scene: Phaser.Scene, key: string) {
  const g = scene.add.graphics().setVisible(false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(6, 6, 5);
  g.generateTexture(key, 12, 12);
  g.destroy();
}

function limb(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, width: number, dark: number, plate: number, accent: number) {
  g.lineStyle(width, dark, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(Math.max(4, width * 0.45), plate, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(2, accent, 0.72);
  g.lineBetween(x1, y1, x2, y2);
}

function poly(g: Phaser.GameObjects.Graphics, points: number[][], fill: number, glow: number) {
  const phaserPoints = points.map(([x, y]) => new Phaser.Geom.Point(x, y));
  g.fillStyle(fill, 1);
  g.fillPoints(phaserPoints, true);
  g.lineStyle(3, 0x02060c, 1);
  g.strokePoints(phaserPoints, true);
  g.lineStyle(1, glow, 0.85);
  g.strokePoints(phaserPoints, true);
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
