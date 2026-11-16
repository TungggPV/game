import Phaser from "phaser";
import { ARENA_WIDTH } from "../config/constants";
import { STAGES, type EnemyType } from "../config/content";
import { getDailySeed, mulberry32 } from "../config/daily";
import { Enemy } from "../entities/Enemy";
import type { GameScene } from "../scenes/GameScene";
import { getDifficultyModifiers } from "./difficulty";
import { unlockEntry } from "./progress";

const ENDLESS_MODIFIERS = [
  { id: "fast" as const, label: "⚡ QUÁI NHANH (+35% Tốc độ)" },
  { id: "lava" as const, label: "🔥 SÀN DUNG NHAM (Phun trào định kỳ)" },
  { id: "no_heal" as const, label: "☠️ KHÔNG HỒI MÁU (Không rớt vật phẩm máu)" },
  { id: "double_shot" as const, label: "🎯 ĐẠN ĐÔI (Quái bắn 2 phát đạn)" },
];

export class SpawnDirector {
  spawnQueue: EnemyType[] = [];
  spawnTimer = 0;
  spawnSide = 1;

  constructor(private scene: GameScene) {}

  update(dt: number) {
    if (this.scene.phase === "fight") {
      this.spawnTimer -= dt;
      const maxAlive = this.scene.mode === "coop" ? 6 : 4;
      if (this.spawnQueue.length && this.spawnTimer <= 0 && this.aliveEnemies().length < maxAlive) {
        this.spawnEnemy(this.spawnQueue.shift()!);
        this.spawnTimer = 0.75;
      }
      if (!this.spawnQueue.length && this.aliveEnemies().length === 0) {
        this.scene.onWaveCleared();
      }
    }
  }

  clear() {
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnSide = 1;
  }

  aliveEnemies(): Enemy[] {
    return this.scene.enemies.filter((e) => !e.dead);
  }

  startStage() {
    this.scene.waveIndex = 0;
    this.scene.arenaMin = 0;
    this.scene.arenaMax = ARENA_WIDTH;
    this.scene.buildWorld();
    this.scene.cameras.main.setScroll(0, 0);
    this.scene.heroes.forEach((h, i) => {
      h.x = 200 + i * 110;
      h.y = this.scene.groundY;
      h.vx = h.vy = 0;
      h.facing = 1;
      if (h.dead) h.revive(0.6);
    });
    this.scene.setPhase("intro", 2.2);

    if (this.scene.mode === "endless") {
      this.scene.events.emit("banner", "CHẾ ĐỘ VÔ TẬN", "Chiến đấu đến hơi thở cuối cùng", 0x18e6ff);
    } else if (this.scene.mode === "bossrush") {
      this.scene.events.emit("banner", "BOSS RUSH", "Hạ gục 3 Đại Trùm liên tiếp", 0xff3355);
    } else if (this.scene.mode === "daily") {
      this.scene.events.emit("banner", "THỬ THÁCH NGÀY", this.scene.stage.name, this.scene.stage.accent);
    } else {
      this.scene.events.emit("banner", this.scene.stage.subtitle.toUpperCase(), this.scene.stage.name, this.scene.stage.accent);
    }
    this.scene.lockHeroes(true);
  }

  startWave() {
    this.scene.setPhase("fight", 0);
    this.scene.lockHeroes(false);
    this.spawnTimer = 0.3;

    // 1. Boss Rush Mode
    if (this.scene.mode === "bossrush") {
      if (this.scene.waveIndex === 0) {
        this.spawnQueue = ["aegis_prime"];
        this.scene.events.emit("banner", "TRÙM 1 / 3", "Aegis Prime xuất hiện!", 0x33e6ff);
      } else if (this.scene.waveIndex === 1) {
        this.spawnQueue = ["boss"];
        this.scene.events.emit("banner", "TRÙM 2 / 3", "Abyssal Colossus xuất hiện!", 0xff4d6d);
      } else {
        this.spawnQueue = ["boss"];
        this.scene.events.emit("banner", "TRÙM CUỐI", "Abyssal Colossus Nổi Giận!", 0xff1133);
      }
      return;
    }

    // 2. Endless Mode
    if (this.scene.mode === "endless") {
      const w = this.scene.waveIndex;
      // Infinite wave scaling: count = 2 + Math.floor(wave / 2)
      const count = 2 + Math.floor(w / 2);

      // Determine mob unlock tier
      let pool: EnemyType[] = ["crawler", "hunter"];
      if (w >= 3) pool = ["crawler", "hunter", "aegis", "bomber"];
      if (w >= 6) pool = ["crawler", "hunter", "aegis", "bomber", "drone", "sniper"];
      if (w >= 9) pool = ["crawler", "hunter", "aegis", "bomber", "drone", "sniper", "mutant"];

      // Check boss wave every 10 waves
      if ((w + 1) % 10 === 0) {
        const bossType: EnemyType = (w + 1) % 20 === 0 ? "boss" : "aegis_prime";
        this.spawnQueue = ["aegis", bossType, "drone"];
        this.scene.events.emit("banner", `ĐỢT ${w + 1}`, `Đại trùm xuất hiện!`, 0xff3355);
      } else {
        const generated: EnemyType[] = [];
        for (let i = 0; i < count; i += 1) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          generated.push(picked);
        }
        this.spawnQueue = generated;
        this.scene.events.emit("banner", `ĐỢT ${w + 1}`, `${count} Kẻ địch đang tiến đến`, 0x18e6ff);
      }

      // Modifier every 5 waves
      if ((w + 1) % 5 === 0 && (w + 1) % 10 !== 0) {
        const mod = ENDLESS_MODIFIERS[Math.floor(Math.random() * ENDLESS_MODIFIERS.length)];
        this.scene.activeModifier = mod.id;
        this.scene.events.emit("banner", "ĐIỀU KIỆN ĐẶC BIỆT", mod.label, 0xffa500);
      } else if ((w + 1) % 10 === 0) {
        this.scene.activeModifier = "none";
      }
      return;
    }

    // 3. Daily Challenge Mode
    if (this.scene.mode === "daily") {
      const seed = getDailySeed() + this.scene.stageIndex * 100 + this.scene.waveIndex;
      const rng = mulberry32(seed);
      const pool: EnemyType[] = ["crawler", "hunter", "aegis", "bomber", "drone", "sniper", "mutant"];
      const count = 3 + this.scene.stageIndex + Math.floor(rng() * 2);
      const isBoss = this.scene.waveIndex === 2;

      if (isBoss) {
        const bossType: EnemyType = this.scene.stageIndex === 1 ? "aegis_prime" : "boss";
        this.spawnQueue = ["aegis", bossType];
      } else {
        const generated: EnemyType[] = [];
        for (let i = 0; i < count; i += 1) {
          generated.push(pool[Math.floor(rng() * pool.length)]);
        }
        this.spawnQueue = generated;
      }
      return;
    }

    // 4. Standard Solo & Co-op Stages
    const waves = this.scene.stage.waves;
    const baseWave = [...waves[this.scene.waveIndex]];
    const diff = getDifficultyModifiers();

    if (diff.waveCountDelta > 0 && baseWave.length > 0) {
      const nonBoss = baseWave.filter((e) => e !== "boss" && e !== "aegis_prime");
      if (nonBoss.length > 0) {
        baseWave.push(nonBoss[Math.floor(Math.random() * nonBoss.length)]);
      }
    } else if (diff.waveCountDelta < 0 && baseWave.length > 2) {
      baseWave.pop();
    }

    this.spawnQueue = baseWave;
    const last = this.scene.stageIndex === STAGES.length - 1 && this.scene.waveIndex === waves.length - 1;
    if (last) {
      this.scene.events.emit("banner", "CẢNH BÁO", "Abyssal Colossus xuất hiện!", 0xff3355);
    }
  }

  spawnEnemy(type: EnemyType, side?: "left" | "right"): Enemy {
    const s = side ? (side === "left" ? -1 : 1) : (this.spawnSide *= -1);
    const x = s > 0 ? this.scene.arenaMax - 70 : this.scene.arenaMin + 70;
    const isBoss = type === "boss" || type === "aegis_prime";
    const stageScale = isBoss ? 1 : 1 + this.scene.stageIndex * 0.3;
    const coopScale = this.scene.mode === "coop" ? 1.35 : 1;
    const e = new Enemy(this.scene, type, x, stageScale * coopScale);
    e.facing = s > 0 ? -1 : 1;
    this.scene.enemies.push(e);
    unlockEntry("codex", type);
    if (isBoss) {
      this.scene.boss = e;
      this.scene.bossStartTime = Date.now();
      e.x = this.scene.arenaMax - 260;
      this.scene.fx.shake(0.02, 600);
      this.scene.events.emit("boss", e);
    }
    this.scene.fx.glow(e.x, e.cy, 0xff3355, 3, 400);
    return e;
  }
}
