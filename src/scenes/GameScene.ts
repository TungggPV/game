import Phaser from "phaser";
import { AssetKeys } from "../config/assets";
import { DEPTHS, GAME_HEIGHT, GAME_WIDTH, GRAVITY, PLATFORM_Y, PLAYER_START_X, PlayerInput, WORLD_WIDTH } from "../config/gameConfig";
import { HeroConfig, getHeroById } from "../config/heroes";
import { Enemy, EnemyKind } from "../entities/Enemy";
import { BlastSpawn, Player } from "../entities/Player";
import { HUD } from "../ui/HUD";
import { RectLike, overlaps } from "../utils/geometry";
import { touchControls } from "../utils/touchControls";

type GameSceneData = {
  heroId?: string;
};

type BlastProjectile = {
  image: Phaser.GameObjects.Image;
  vx: number;
  damage: number;
  life: number;
  facing: -1 | 1;
};

type WaveSpawn = {
  triggerX: number;
  spawned: boolean;
  enemies: Array<{ kind: EnemyKind; x: number }>;
};

export class GameScene extends Phaser.Scene {
  private hero!: HeroConfig;
  private player!: Player;
  private hud!: HUD;
  private background?: Phaser.GameObjects.TileSprite;
  private enemies: Enemy[] = [];
  private projectiles: BlastProjectile[] = [];
  private waves: WaveSpawn[] = [];
  private score = 0;
  private running = true;
  private messageText?: Phaser.GameObjects.Text;
  private messageTimer = 0;
  private keys!: Record<"leftA" | "rightD" | "left" | "right" | "space" | "up" | "slash" | "blast" | "dash", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData) {
    this.hero = getHeroById(data.heroId ?? "");
  }

  create() {
    this.running = true;
    this.score = 0;
    this.enemies = [];
    this.projectiles = [];
    this.waves = [
      {
        triggerX: 980,
        spawned: false,
        enemies: [
          { kind: "crawler", x: 1320 },
          { kind: "horned_mutant", x: 1540 },
        ],
      },
      {
        triggerX: 1780,
        spawned: false,
        enemies: [
          { kind: "crawler", x: 2160 },
          { kind: "crawler", x: 2320 },
          { kind: "horned_mutant", x: 2520 },
        ],
      },
    ];

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.createBackground();
    this.drawPlatform();
    this.createKeys();
    this.player = new Player(this, this.hero, PLAYER_START_X);
    this.spawnEnemy("crawler", 820);
    this.spawnEnemy("horned_mutant", 1110);
    this.hud = new HUD(this, this.hero);
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
      .setDepth(DEPTHS.hud + 4);
    this.showMessage("ARMOR CORE ONLINE", 1.1);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.033, deltaMs / 1000);
    const input = this.readInput();

    if (this.running) {
      if (input.dash && this.player.tryDash()) this.spawnDashTrail();

      const slashHitbox = input.slash ? this.player.trySlash() : undefined;
      if (slashHitbox) {
        this.spawnSlashEffect();
        this.hitEnemies(slashHitbox, this.hero.meleeDamage);
      }

      const blast = input.blast ? this.player.tryBlast() : undefined;
      if (blast) this.spawnBlastProjectile(blast);

      this.player.update(dt, input);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.cleanupDeadEnemies();
      this.spawnWaves();
      this.updateCamera(dt);
      this.checkRunState();
    }

    this.updateHudAndMessage(dt);
    touchControls.clearJust();
  }

  private createBackground() {
    this.cameras.main.setBackgroundColor("#02070d");
    this.background = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, AssetKeys.backgroundCity)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(2.49)
      .setDepth(DEPTHS.background);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.12).setOrigin(0).setScrollFactor(0).setDepth(DEPTHS.background + 1);
  }

  private drawPlatform() {
    if (this.textures.exists(AssetKeys.cityTiles)) {
      this.add
        .tileSprite(0, PLATFORM_Y + 36, WORLD_WIDTH, 150, AssetKeys.cityTiles)
        .setOrigin(0, 0)
        .setTileScale(1.4)
        .setAlpha(0.22)
        .setDepth(DEPTHS.platformBack);
    }

    const g = this.add.graphics().setDepth(DEPTHS.platformBack + 1);
    g.fillStyle(0x07121c, 0.96);
    g.fillRect(0, PLATFORM_Y, WORLD_WIDTH, GAME_HEIGHT - PLATFORM_Y);
    g.fillStyle(0x10212e, 0.94);
    g.fillRect(0, PLATFORM_Y + 5, WORLD_WIDTH, 42);
    g.lineStyle(4, 0x18e6ff, 0.92);
    g.lineBetween(0, PLATFORM_Y, WORLD_WIDTH, PLATFORM_Y);
    g.lineStyle(2, 0xf6c65a, 0.88);
    g.lineBetween(0, PLATFORM_Y + 19, WORLD_WIDTH, PLATFORM_Y + 19);
    g.lineStyle(1, 0x2a5970, 0.42);
    for (let x = 0; x < WORLD_WIDTH; x += 154) {
      g.fillStyle(x % 308 === 0 ? 0x12293a : 0x0d1c28, 0.78);
      g.fillRect(x + 7, PLATFORM_Y + 32, 136, 56);
      g.strokeRect(x + 7, PLATFORM_Y + 32, 136, 56);
      g.lineStyle(1, 0x18e6ff, 0.18);
      g.lineBetween(x + 22, PLATFORM_Y + 47, x + 126, PLATFORM_Y + 47);
      g.lineStyle(1, 0x2a5970, 0.42);
    }
    g.fillStyle(0x02070d, 0.28);
    g.fillRect(0, PLATFORM_Y + 92, WORLD_WIDTH, GAME_HEIGHT - PLATFORM_Y - 92);
  }

  private createKeys() {
    const keyboard = this.input.keyboard!;
    this.keys = {
      leftA: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      rightD: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      slash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      blast: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      dash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };
  }

  private readInput(): PlayerInput {
    return {
      left: this.keys.leftA.isDown || this.keys.left.isDown || touchControls.isHeld("left"),
      right: this.keys.rightD.isDown || this.keys.right.isDown || touchControls.isHeld("right"),
      jump:
        Phaser.Input.Keyboard.JustDown(this.keys.space) ||
        Phaser.Input.Keyboard.JustDown(this.keys.up) ||
        touchControls.consumeJust("jump"),
      slash: Phaser.Input.Keyboard.JustDown(this.keys.slash) || touchControls.consumeJust("slash"),
      blast: Phaser.Input.Keyboard.JustDown(this.keys.blast) || touchControls.consumeJust("blast"),
      dash: Phaser.Input.Keyboard.JustDown(this.keys.dash) || touchControls.consumeJust("dash"),
    };
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      const hitbox = enemy.update(dt, this.player.sprite.x);
      if (hitbox && this.player.alive && overlaps(hitbox, this.player.getBounds())) {
        this.player.takeDamage(enemy.data.damage, enemy.facing);
        this.spawnHitSpark(this.player.sprite.x - enemy.facing * 26, this.player.sprite.y - 92);
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.image.x += projectile.vx * dt;
      projectile.image.rotation += projectile.facing * dt * 4;
      const hitbox = this.projectileBounds(projectile.image);
      for (const enemy of this.enemies) {
        if (enemy.alive && overlaps(hitbox, enemy.getBounds())) {
          enemy.takeDamage(projectile.damage, projectile.facing);
          this.player.energize(5);
          this.spawnHitSpark(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48);
          projectile.life = 0;
          break;
        }
      }
      if (projectile.image.x < -80 || projectile.image.x > WORLD_WIDTH + 80) projectile.life = 0;
    }
    for (const projectile of this.projectiles.filter((item) => item.life <= 0)) projectile.image.destroy();
    this.projectiles = this.projectiles.filter((item) => item.life > 0);
  }

  private hitEnemies(hitbox: RectLike, damage: number) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (overlaps(hitbox, enemy.getBounds())) {
        enemy.takeDamage(damage, this.player.facing);
        this.player.energize(4);
        this.spawnHitSpark(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.48);
      }
    }
  }

  private cleanupDeadEnemies() {
    const dead = this.enemies.filter((enemy) => !enemy.alive);
    for (const enemy of dead) {
      this.score += enemy.scoreValue;
      this.spawnExplosion(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.45, enemy.kind === "horned_mutant");
      enemy.destroy();
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  private spawnWaves() {
    for (const wave of this.waves) {
      if (wave.spawned || this.player.sprite.x < wave.triggerX) continue;
      wave.spawned = true;
      for (const entry of wave.enemies) this.spawnEnemy(entry.kind, entry.x);
      this.showMessage("ENEMY CONTACT", 0.9);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number) {
    this.enemies.push(new Enemy(this, kind, x));
  }

  private spawnBlastProjectile(spawn: BlastSpawn) {
    const image = this.add
      .image(spawn.x, spawn.y, AssetKeys.energyBlastSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.projectile)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(spawn.facing < 0);
    image.setCrop(246, 0, 190, 145).setDisplaySize(174, 50);
    image.setTint(spawn.color);
    this.projectiles.push({
      image,
      vx: spawn.facing * 830,
      damage: spawn.damage,
      life: 1.05,
      facing: spawn.facing,
    });
  }

  private spawnSlashEffect() {
    const key = this.textures.exists(AssetKeys.slash2) ? AssetKeys.slash2 : AssetKeys.slash1;
    const slash = this.add
      .image(this.player.sprite.x + this.player.facing * 82, this.player.sprite.y - 90, key)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(this.player.facing < 0)
      .setTint(this.hero.themeColor)
      .setDisplaySize(168, 116);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: slash.scaleX * 1.22,
      scaleY: slash.scaleY * 1.22,
      duration: 260,
      onComplete: () => slash.destroy(),
    });
  }

  private spawnHitSpark(x: number, y: number) {
    const spark = this.add
      .image(x, y, AssetKeys.hitSparksSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
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

  private spawnExplosion(x: number, y: number, large: boolean) {
    const explosion = this.add
      .image(x, y, AssetKeys.explosionsSheet)
      .setOrigin(0.5)
      .setDepth(DEPTHS.effect + 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    explosion.setCrop(330, 0, 155, 155).setDisplaySize(large ? 190 : 132, large ? 164 : 116);
    this.tweens.add({
      targets: explosion,
      alpha: 0,
      scaleX: explosion.scaleX * 1.45,
      scaleY: explosion.scaleY * 1.45,
      duration: large ? 360 : 260,
      onComplete: () => explosion.destroy(),
    });
  }

  private spawnDashTrail() {
    const ghost = this.add
      .image(this.player.sprite.x, this.player.sprite.y, this.player.sprite.texture.key)
      .setOrigin(0.5, 1)
      .setScale(this.player.sprite.scaleX, this.player.sprite.scaleY)
      .setFlipX(this.player.facing < 0)
      .setTint(this.hero.themeColor)
      .setAlpha(0.38)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTHS.player - 2);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      x: ghost.x - this.player.facing * 44,
      duration: 230,
      onComplete: () => ghost.destroy(),
    });
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
    const target = Phaser.Math.Clamp(this.player.sprite.x - GAME_WIDTH * 0.38, 0, WORLD_WIDTH - GAME_WIDTH);
    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, target, Math.min(1, dt * 5));
    if (this.background) this.background.tilePositionX = this.cameras.main.scrollX * 0.18;
  }

  private updateHudAndMessage(dt: number) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageText) {
      this.messageText.setVisible(this.messageTimer > 0);
      this.messageText.setAlpha(Math.min(1, this.messageTimer));
    }
    const bossLike = this.enemies
      .filter((enemy) => enemy.kind === "horned_mutant")
      .sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
    this.hud.update(this.hero, this.player.hp, this.player.maxHp, this.player.energy, this.player.maxEnergy, this.score, bossLike?.getBarState());
  }

  private checkRunState() {
    if (!this.player.alive) {
      this.finishRun("ARMOR DOWN", "Core offline.");
      return;
    }
    const allWavesSpawned = this.waves.every((wave) => wave.spawned);
    if (allWavesSpawned && this.enemies.length === 0) {
      this.finishRun("STAGE CLEAR", "Neon sector secured.");
    }
  }

  private showMessage(message: string, seconds: number) {
    this.messageText?.setText(message);
    this.messageTimer = seconds;
  }

  private finishRun(title: string, detail: string) {
    if (!this.running) return;
    this.running = false;
    this.showMessage(title, 1.2);
    this.time.delayedCall(1300, () => {
      this.scene.start("MenuScene", {
        heroId: this.hero.id,
        result: {
          title,
          detail,
          score: this.score,
          heroId: this.hero.id,
        },
      });
    });
  }
}
