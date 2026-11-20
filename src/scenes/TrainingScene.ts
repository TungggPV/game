import Phaser from "phaser";
import { ARENA_WIDTH, DEPTH, FONT, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, hex } from "../config/constants";
import { ENEMIES, type EnemyType } from "../config/content";
import { ARMOR_CORES, type ArmorCore, calculateSynergies, RARITY_COLORS } from "../systems/armorCores";
import { cycleSelectedSkin, getSkinDef, heroById } from "../config/heroes";
import { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { PlayerControls, setSceneFlag } from "../systems/controls";
import { music } from "../systems/music";
import { sfx } from "../systems/sfx";
import { Button, text } from "../ui/widgets";
import { GameScene } from "./GameScene";

type HitRecord = { time: number; damage: number };

export class TrainingScene extends GameScene {
  private dummy!: Enemy;
  private dummyType: EnemyType = "mutant";
  private dummyTypes: EnemyType[] = ["crawler", "mutant", "aegis", "archon_zero"];
  private dummyTypeIndex = 1;

  // Training options
  private dummyAttack = false;
  private dummyAttackTimer = 2.4;
  private infiniteEnergy = false;
  private coreSelectorOpen = false;

  // Metrics
  private recentHits: HitRecord[] = [];
  private rollingDPS = 0;
  private currentComboDamage = 0;
  private maxComboDamage = 0;
  private lastCombo = 0;

  // UI elements
  private dpsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private shortcutBar!: Phaser.GameObjects.Container;
  private coreModal?: Phaser.GameObjects.Container;

  constructor() {
    super("training");
  }

  override init(data?: Partial<import("./GameScene").GameData> & { heroId?: string }) {
    this.mode = "training";
    const pickedHero = data?.heroes?.[0] ?? data?.heroId ?? "nova_blade";
    this.heroIds = [pickedHero];
    this.heroes = [];
    this.enemies = [];
    this.stageIndex = 0;
    this.waveIndex = 0;
    this.score = 0;
    this.recentHits = [];
  }

  override create() {
    super.create();

    // Replace default stage setup with Dojo
    this.spawnDirector.clear();
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];

    this.setupDojoArena();
    this.spawnTrainingDummy();
    this.setupTrainingUI();
    this.bindShortcuts();
    this.setPhase("fight", 0);
    this.lockHeroes(false);
    this.cameras.main.fadeIn(180, 2, 7, 13);

    music.start("menu");
    this.events.once("shutdown", () => {
      if (this.scene.isActive("ui")) this.scene.setVisible(true, "ui");
      music.stop();
    });
  }

  private setupDojoArena() {
    // High-tech matrix training background
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, GAME_HEIGHT);
    this.arenaMin = 0;
    this.arenaMax = ARENA_WIDTH;

    // Reset Hero position
    const hero = this.heroes[0];
    if (hero) {
      hero.x = 280;
      hero.y = GROUND_Y;
      hero.vx = hero.vy = 0;
      hero.facing = 1;
    }
  }

  private spawnTrainingDummy() {
    if (this.dummy) {
      this.dummy.destroy();
    }
    const def = ENEMIES[this.dummyType];
    this.dummy = new Enemy(this, this.dummyType, 780, 1);
    this.dummy.facing = -1;
    // Immortal Dummy stats
    this.dummy.maxHp = 99999;
    this.dummy.hp = 99999;
    this.dummy.maxPosture = 300;
    this.dummy.posture = 300;
    this.enemies.push(this.dummy);
  }

  private setupTrainingUI() {
    // Bottom Left: Back Button (clear of Hero HUD and fighting area)
    new Button(this, 88, 684, 128, 34, "← Menu", () => this.toMenu()).setDepth(150);

    // Top Center Header: clear of Hero HUD (24..394) and DPS Box (955..1175)
    text(this, 670, 22, "VÕ ĐƯỜNG HUẤN LUYỆN", 20, "#18e6ff", "900").setOrigin(0.5);

    this.shortcutBar = this.add.container(670, 48);
    const guide1 = text(
      this,
      0,
      0,
      "[F1] Quái đánh: TẮT  ·  [F2] Vô hạn NL: TẮT",
      13,
      "#9fb8cc",
      "700",
    ).setOrigin(0.5);
    const guide2 = text(
      this,
      0,
      20,
      `[F3] Lắp Lõi · [F4] Đổi Quái · [F5] Skin: ${getSkinDef().name} · [Esc] Menu`,
      12,
      "#9fb8cc",
      "700",
    ).setOrigin(0.5);
    this.shortcutBar.add([guide1, guide2]);

    // DPS & Combo metrics box at top right (clear of DOM fullscreen button at x=1220..1268)
    const box = this.add.container(1065, 52);
    const bg = this.add.rectangle(0, 0, 220, 84, 0x061424, 0.85).setStrokeStyle(1.5, 0x18e6ff, 0.6);
    this.dpsText = text(this, -96, -30, "DPS: 0", 18, "#ffe45c", "900");
    this.statusText = text(this, -96, 0, "Combo Dmg: 0\nMax: 0", 13, "#7dffb0", "700");
    box.add([bg, this.dpsText, this.statusText]);
  }

  private bindShortcuts() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const keys = this.input.keyboard!.addKeys({
      f1: K.F1,
      f2: K.F2,
      f3: K.F3,
      f4: K.F4,
      f5: K.F5,
      esc: K.ESC,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    keys.f1.on("down", () => this.toggleDummyAttack());
    keys.f2.on("down", () => this.toggleInfiniteEnergy());
    keys.f3.on("down", () => this.openQuickCoreSelector());
    keys.f4.on("down", () => this.cycleDummyType());
    keys.f5.on("down", () => this.cycleTrainingSkin());
    keys.esc.on("down", () => {
      if (this.coreSelectorOpen) this.closeCoreSelector();
      else this.toMenu();
    });
  }

  private toggleDummyAttack() {
    this.dummyAttack = !this.dummyAttack;
    this.dummyAttackTimer = 1.0;
    sfx.select();
    this.updateShortcutText();
    this.events.emit("toast", `Dummy Tấn Công: ${this.dummyAttack ? "BẬT" : "TẮT"}`);
  }

  private toggleInfiniteEnergy() {
    this.infiniteEnergy = !this.infiniteEnergy;
    sfx.select();
    this.updateShortcutText();
    this.events.emit("toast", `Vô Hạn Năng Lượng: ${this.infiniteEnergy ? "BẬT" : "TẮT"}`);
  }

  private cycleDummyType() {
    this.dummyTypeIndex = (this.dummyTypeIndex + 1) % this.dummyTypes.length;
    this.dummyType = this.dummyTypes[this.dummyTypeIndex];
    sfx.confirm();
    this.spawnTrainingDummy();
    this.events.emit("toast", `Đã đổi bia tập: ${ENEMIES[this.dummyType].name}`);
  }

  private cycleTrainingSkin() {
    const next = cycleSelectedSkin();
    sfx.confirm();
    const g2 = this.shortcutBar.getAt(1) as Phaser.GameObjects.Text;
    if (g2) g2.setText(`[F3] Lắp Lõi · [F4] Đổi Quái · [F5] Skin: ${next.name} · [Esc] Menu`);
    this.events.emit("toast", `Đã đổi Skin Giáp: ${next.name}`);
  }

  private updateShortcutText() {
    const guide = this.shortcutBar.getAt(0) as Phaser.GameObjects.Text;
    if (guide) {
      guide.setText(
        `[F1] Quái đánh: ${this.dummyAttack ? "BẬT" : "TẮT"}  ·  [F2] Vô hạn NL: ${this.infiniteEnergy ? "BẬT" : "TẮT"}`,
      );
    }
  }

  private openQuickCoreSelector() {
    if (this.coreSelectorOpen) {
      this.closeCoreSelector();
      return;
    }
    this.coreSelectorOpen = true;
    this.scene.setVisible(false, "ui");
    sfx.confirm();

    const root = this.add.container(0, 0).setDepth(200);
    root.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.88).setInteractive());
    root.add(text(this, GAME_WIDTH / 2, 30, "CHỌN LÕI GIÁP THỬ NGHIỆM", 28, "#ffe45c", "900").setOrigin(0.5));
    root.add(text(this, GAME_WIDTH / 2, 58, "Nhấp vào lõi để lắp cho nhân vật ngay lập tức", 14, "#9fb8cc", "700").setOrigin(0.5));

    const hero = this.heroes[0];
    const equippedIds = new Set((hero?.equippedCores || []).map((c) => c.id));

    // Render 18 cores in 3 rows of 6 cards (row 0 top = 80, clear of subtitle at y=58)
    ARMOR_CORES.forEach((core, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 127 + col * 205;
      const y = 152 + row * 158;
      const rColor = RARITY_COLORS[core.rarity];
      const isEquipped = equippedIds.has(core.id);

      const card = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, 195, 144, isEquipped ? 0x14324c : 0x0a1a2c, 0.95)
        .setStrokeStyle(isEquipped ? 3 : 1.5, rColor.main, isEquipped ? 1 : 0.6)
        .setInteractive({ useHandCursor: true });

      const name = text(this, 0, -50, core.name, 14, "#ffffff", "900").setOrigin(0.5);
      const tags = text(this, 0, -30, core.tags.join(" • "), 12, "#7dffb0", "800").setOrigin(0.5);
      const desc = this.add
        .text(0, 12, core.desc, {
          fontFamily: FONT,
          fontSize: "11px",
          color: "#c8dcea",
          align: "center",
          wordWrap: { width: 175 },
          lineSpacing: 2,
        })
        .setOrigin(0.5);
      const status = text(this, 0, 56, isEquipped ? "ĐÃ LẮP ✓" : "+ LẮP VÀO", 12, isEquipped ? "#ffe45c" : "#18e6ff", "900").setOrigin(0.5);

      bg.on("pointerdown", () => {
        if (!hero) return;
        if (isEquipped) {
          hero.equippedCores = hero.equippedCores.filter((c) => c.id !== core.id);
          sfx.select();
        } else {
          hero.equippedCores.push(core);
          core.apply(hero);
          hero.applyMods();
          sfx.confirm();
        }
        this.closeCoreSelector();
        this.openQuickCoreSelector();
      });

      card.add([bg, name, tags, desc, status]);
      root.add(card);
    });

    // Close button
    const closeBtn = new Button(this, GAME_WIDTH / 2, 668, 180, 44, "Đóng (Esc)", () => this.closeCoreSelector());
    root.add(closeBtn);

    this.coreModal = root;
  }

  private closeCoreSelector() {
    this.coreModal?.destroy();
    this.coreModal = undefined;
    this.coreSelectorOpen = false;
    this.scene.setVisible(true, "ui");
  }

  override dealDamage(attacker: import("../entities/Actor").Actor | undefined, target: import("../entities/Actor").Actor, hit: import("../entities/Actor").Hit): number {
    const dealt = super.dealDamage(attacker, target, hit);
    if (dealt > 0 && target === this.dummy) {
      const now = this.time.now;
      this.recentHits.push({ time: now, damage: dealt });
      this.currentComboDamage += dealt;
      if (this.currentComboDamage > this.maxComboDamage) {
        this.maxComboDamage = this.currentComboDamage;
      }
    }
    return dealt;
  }

  override update(time: number, deltaMs: number) {
    super.update(time, deltaMs);
    const real = Math.min(deltaMs / 1000, 1 / 30);
    const hero = this.heroes[0];

    // 1. Infinite Energy
    if (this.infiniteEnergy && hero) {
      hero.energy = 100;
    }

    // 2. Dummy Maintenance
    if (this.dummy) {
      // Dummy never dies
      if (this.dummy.hp < 50000) {
        this.dummy.hp = 99999;
      }
      // Rapid posture recovery for parry practice
      if (this.dummy.isBroken() && this.dummy.brokenTimer < 1.0) {
        this.dummy.brokenTimer = 0;
        this.dummy.posture = this.dummy.maxPosture;
      }

      // Dummy Attack Mode
      if (this.dummyAttack) {
        this.dummyAttackTimer -= real;
        if (this.dummyAttackTimer <= 0) {
          this.dummyAttackTimer = 2.6;
          // Trigger melee punch attack on hero
          if (hero) {
            this.fx.ring(this.dummy.x, this.dummy.y - 40, 0xff3355, 60, 600);
            sfx.warn();
            this.time.delayedCall(600, () => {
              if (this.dummy && !this.dummy.dead) {
                const rect = new Phaser.Geom.Rectangle(this.dummy.x - 140, this.dummy.y - 120, 160, 120);
                this.enemyAttack(this.dummy, rect, { damage: 15, dir: -1, knock: 300, color: 0xff3355 });
              }
            });
          }
        }
      }
    }

    // 3. Rolling DPS Calculation (3-second window)
    const cutoff = time - 3000;
    this.recentHits = this.recentHits.filter((h) => h.time >= cutoff);
    const sum = this.recentHits.reduce((acc, h) => acc + h.damage, 0);
    this.rollingDPS = Math.round(sum / 3.0);

    // Combo streak check
    if (this.combo < this.lastCombo && this.combo === 0) {
      this.currentComboDamage = 0;
    }
    this.lastCombo = this.combo;

    // 4. Update HUD only when text changes (avoids 60Hz Canvas re-rasterization)
    const dpsStr = `DPS: ${this.rollingDPS}`;
    if (this.dpsText && this.dpsText.text !== dpsStr) {
      this.dpsText.setText(dpsStr);
    }
    const statusStr = `Combo Dmg: ${Math.round(this.currentComboDamage)}\nMax: ${Math.round(this.maxComboDamage)}`;
    if (this.statusText && this.statusText.text !== statusStr) {
      this.statusText.setText(statusStr);
    }
  }

  private toMenu() {
    this.scene.stop("ui");
    setSceneFlag("menu");
    this.scene.start("menu");
  }
}
