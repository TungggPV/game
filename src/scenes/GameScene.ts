import Phaser from "phaser";
import { ARENA_WIDTH, DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, type GameMode } from "../config/constants";
import { STAGES, UPGRADES, type EnemyType, type StageDef, type Upgrade } from "../config/content";
import { heroById, type SkillDef } from "../config/heroes";
import type { Actor, Hit } from "../entities/Actor";
import { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { consumeTouch, PlayerControls, setSceneFlag } from "../systems/controls";
import { Fx, PALETTE, type Palette } from "../systems/Fx";
import { sfx } from "../systems/sfx";

export type GameData = { mode: GameMode; heroes: string[] };

export type ProjectileStyle = "plasma" | "fire" | "volt" | "wind" | "enemy";

export type ProjectileSpec = {
  owner: Actor;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  pierce: number;
  style: ProjectileStyle;
  explodeRadius?: number;
  chain?: number;
  hit: Hit;
};

type Projectile = ProjectileSpec & {
  parts: Phaser.GameObjects.Image[];
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  crackle?: Phaser.GameObjects.Graphics;
  life: number;
  age: number;
  hitSet: Set<Actor>;
};

type FieldStyle = "cage" | "spiral";

type Field = {
  owner: Hero;
  offset: number;
  x: number;
  y: number;
  radius: number;
  time: number;
  tick: number;
  acc: number;
  hit: Hit;
  style: FieldStyle;
  glyph: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  bars?: Phaser.GameObjects.Graphics;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter;
};

type Hazard = {
  owner: Enemy;
  rect: Phaser.Geom.Rectangle;
  vx: number;
  life: number;
  maxLife: number;
  hitSet: Set<Actor>;
  damage: number;
  parts: Phaser.GameObjects.Image[];
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  kind: "shock" | "beam";
};
type Pickup = { kind: "health" | "energy" | "coin"; img: Phaser.GameObjects.Image; x: number; y: number; vy: number; life: number };

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
  combo = 0;
  comboTimer = 0;
  pkTimer = 99;
  pkRound = 1;
  pkWins = [0, 0];
  boss?: Enemy;

  private projectiles: Projectile[] = [];
  private fields: Field[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private spawnQueue: EnemyType[] = [];
  private spawnTimer = 0;
  private spawnSide = 1;
  private arenaMin = 0;
  private arenaMax = ARENA_WIDTH;
  private hitstop = 0;
  private phaseTimer = 0;
  private bg!: Phaser.GameObjects.TileSprite;
  private bgScale = 1;
  private floor!: Phaser.GameObjects.TileSprite;
  private floorGlow!: Phaser.GameObjects.Rectangle;
  private pauseKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super("game");
  }

  init(data: GameData) {
    this.mode = data.mode;
    this.heroIds = data.heroes;
    this.heroes = [];
    this.enemies = [];
    this.projectiles = [];
    this.fields = [];
    this.hazards = [];
    this.pickups = [];
    this.spawnQueue = [];
    this.stageIndex = 0;
    this.waveIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.pkRound = 1;
    this.pkWins = [0, 0];
    this.boss = undefined;
    this.hitstop = 0;
  }

  get stage(): StageDef {
    return STAGES[this.mode === "pk" ? 0 : this.stageIndex];
  }

  get worldWidth() {
    return this.mode === "pk" ? ARENA_WIDTH : ARENA_WIDTH * this.stage.waves.length;
  }

  create() {
    setSceneFlag("game");
    this.fx = new Fx(this);
    this.buildWorld();

    const count = this.mode === "solo" ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      const def = heroById(this.heroIds[i] ?? this.heroIds[0]);
      const x = this.mode === "pk" ? (i === 0 ? 300 : GAME_WIDTH - 300) : 220 + i * 110;
      const hero = new Hero(this, x, def, i as 0 | 1, new PlayerControls(this, i as 0 | 1), this.mode === "pk" ? 360 : undefined);
      if (this.mode === "pk") hero.energy = 20;
      this.heroes.push(hero);
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.pauseKeys = [K.P, K.ESC].map((k) => this.input.keyboard!.addKey(k));
    this.scene.launch("ui");
    this.scene.bringToTop("ui");

    if (this.mode === "pk") this.startPkRound();
    else this.startStage();
  }

  // ---------- world ----------

  private buildWorld() {
    const stage = this.stage;
    const tex = this.textures.get(stage.background).getSourceImage();
    this.bgScale = (GROUND_Y + 30) / tex.height;
    this.bg?.destroy();
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GROUND_Y + 30, stage.background)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(this.bgScale)
      .setDepth(DEPTH.bg);
    this.floor?.destroy();
    this.floor = this.add
      .tileSprite(0, GROUND_Y, ARENA_WIDTH * 3 + GAME_WIDTH, GAME_HEIGHT - GROUND_Y, "floor")
      .setOrigin(0)
      .setTint(Phaser.Display.Color.ValueToColor(stage.floor).brighten(60).color)
      .setDepth(DEPTH.floor);
    this.floorGlow?.destroy();
    this.floorGlow = this.add.rectangle(0, GROUND_Y, ARENA_WIDTH * 3 + GAME_WIDTH, 3, stage.accent, 0.9).setOrigin(0, 0.5).setDepth(DEPTH.floor + 1);
    this.cameras.main.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(stage.floor);
  }

  arenaBounds(): [number, number] {
    return [this.arenaMin, this.arenaMax];
  }

  /** Drop key presses latched while paused so resuming doesn't re-pause or attack. */
  resumeFromPause() {
    this.pauseKeys.forEach((k) => k.reset());
    this.input.keyboard?.resetKeys();
  }

  // ---------- stage flow ----------

  private startStage() {
    this.waveIndex = 0;
    this.arenaMin = 0;
    this.arenaMax = ARENA_WIDTH;
    this.buildWorld();
    this.cameras.main.setScroll(0, 0);
    this.heroes.forEach((h, i) => {
      h.x = 200 + i * 110;
      h.y = GROUND_Y;
      h.vx = h.vy = 0;
      h.facing = 1;
      if (h.dead) h.revive(0.6);
    });
    this.setPhase("intro", 2.2);
    this.events.emit("banner", this.stage.subtitle.toUpperCase(), this.stage.name, this.stage.accent);
    this.lockHeroes(true);
  }

  private startWave() {
    const waves = this.stage.waves;
    this.spawnQueue = [...waves[this.waveIndex]];
    this.spawnTimer = 0.3;
    this.setPhase("fight", 0);
    this.lockHeroes(false);
    const last = this.stageIndex === STAGES.length - 1 && this.waveIndex === waves.length - 1;
    if (last) {
      this.events.emit("banner", "CẢNH BÁO", "Abyssal Colossus xuất hiện!", 0xff3355);
      sfx.warn();
    } else {
      this.events.emit("toast", `Đợt ${this.waveIndex + 1}/${waves.length}`);
    }
  }

  private setPhase(phase: Phase, timer: number) {
    this.phase = phase;
    this.phaseTimer = timer;
  }

  private lockHeroes(locked: boolean) {
    this.heroes.forEach((h) => (h.locked = locked));
  }

  private onWaveCleared() {
    this.heroes.forEach((h) => {
      if (h.dead && this.anyHeroAlive()) h.revive(0.4);
    });
    if (this.waveIndex < this.stage.waves.length - 1) {
      this.setPhase("advance", 0);
      this.arenaMax = this.arenaMin + ARENA_WIDTH * 2;
      this.events.emit("go", true);
      sfx.confirm();
    } else {
      this.setPhase("stageClear", 2.6);
      this.events.emit("banner", "HOÀN THÀNH", this.stage.name, 0x7dffb0);
      sfx.win();
      this.lockHeroes(true);
    }
  }

  private afterStageClear() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.finish(true);
      return;
    }
    this.setPhase("upgrade", 0);
    const choices = Phaser.Utils.Array.Shuffle([...UPGRADES]).slice(0, 3);
    this.events.emit("upgrade", choices);
  }

  chooseUpgrade(upgrade: Upgrade) {
    this.heroes.forEach((h) => {
      upgrade.apply(h.mods);
      h.applyMods();
    });
    this.stageIndex += 1;
    this.startStage();
  }

  finish(win: boolean) {
    if (this.phase === "over") return;
    this.setPhase("over", 0);
    this.lockHeroes(true);
    const solo = this.mode !== "pk";
    if (solo) this.score += win ? 3000 : 0;
    this.events.emit("result", {
      win,
      title: win ? "CHIẾN THẮNG" : "THẤT BẠI",
      detail: win ? "Thành phố đã an toàn. Giáp Hào Quang bất bại!" : `Ngã xuống ở ${this.stage.name} — đợt ${this.waveIndex + 1}`,
      score: this.score,
      best: 0,
      mode: this.mode,
    } satisfies ResultData);
    if (win) sfx.win();
    else sfx.lose();
  }

  // ---------- PK ----------

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

  // ---------- main loop ----------

  update(_time: number, deltaMs: number) {
    const real = Math.min(deltaMs / 1000, 1 / 30);
    if (this.pauseKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) || consumeTouch("pause")) {
      if (this.phase !== "over" && this.phase !== "upgrade") this.events.emit("pause");
      return;
    }
    this.heroes.forEach((h) => h.readInput());

    if (this.hitstop > 0) {
      this.hitstop -= real;
      return;
    }
    this.dt = real;

    this.updatePhase(real);
    this.heroes.forEach((h) => h.update(real));
    this.enemies.forEach((e) => e.update(real));
    this.enemies = this.enemies.filter((e) => {
      if (e.removable) e.destroy();
      return !e.removable;
    });
    this.updateProjectiles(real);
    this.updateFields(real);
    this.updateHazards(real);
    this.updatePickups(real);

    this.comboTimer -= real;
    if (this.comboTimer <= 0) this.combo = 0;

    this.updateCamera(real);
    this.bg.tilePositionX = (this.cameras.main.scrollX * 0.35) / this.bgScale;
  }

  private updatePhase(dt: number) {
    this.phaseTimer -= dt;
    switch (this.phase) {
      case "intro":
        if (this.phaseTimer <= 0) this.startWave();
        break;
      case "fight":
        this.spawnTimer -= dt;
        if (this.spawnQueue.length && this.spawnTimer <= 0 && this.aliveEnemies().length < (this.mode === "coop" ? 6 : 4)) {
          this.spawnEnemy(this.spawnQueue.shift()!);
          this.spawnTimer = 0.75;
        }
        if (!this.spawnQueue.length && this.aliveEnemies().length === 0) this.onWaveCleared();
        break;
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
      case "stageClear":
        if (this.phaseTimer <= 0) this.afterStageClear();
        break;
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
      case "roundEnd":
        if (this.phaseTimer <= 0) this.afterPkRound();
        break;
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    let target = this.arenaMin;
    if (this.phase === "advance") {
      const alive = this.heroes.filter((h) => !h.dead);
      const avg = alive.reduce((s, h) => s + h.x, 0) / Math.max(1, alive.length);
      target = Phaser.Math.Clamp(avg - GAME_WIDTH * 0.4, this.arenaMin, this.arenaMin + ARENA_WIDTH);
    }
    cam.scrollX += (target - cam.scrollX) * Math.min(1, dt * 5);
  }

  // ---------- spawning ----------

  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }

  spawnEnemy(type: EnemyType, side?: "left" | "right") {
    const s = side ? (side === "left" ? -1 : 1) : (this.spawnSide *= -1);
    const x = s > 0 ? this.arenaMax - 70 : this.arenaMin + 70;
    const stageScale = type === "boss" ? 1 : 1 + this.stageIndex * 0.3;
    const coopScale = this.mode === "coop" ? 1.5 : 1;
    const e = new Enemy(this, type, x, stageScale * coopScale);
    e.facing = s > 0 ? -1 : 1;
    this.enemies.push(e);
    if (type === "boss") {
      this.boss = e;
      e.x = this.arenaMax - 260;
      this.fx.shake(0.02, 600);
      this.events.emit("boss", e);
    }
    this.fx.glow(e.x, e.cy, 0xff3355, 3, 400);
  }


  // ---------- combat ----------

  targetsFor(actor: Actor): Actor[] {
    if (actor instanceof Hero) return this.mode === "pk" ? this.heroes.filter((h) => h !== actor) : this.enemies;
    return this.heroes;
  }

  anyHeroAlive() {
    return this.heroes.some((h) => !h.dead);
  }

  paletteFor(actor: Actor | undefined): Palette {
    if (actor instanceof Hero) return PALETTE[actor.def.element];
    if (actor instanceof Enemy && actor.isBoss) return PALETTE.boss;
    return PALETTE.enemy;
  }

  dealDamage(attacker: Actor | undefined, target: Actor, hit: Hit): number {
    if (target.dead || target.invuln > 0) return 0;
    let damage = hit.damage;
    let crit = false;
    if (attacker instanceof Hero) {
      damage *= attacker.def.power * attacker.mods.damage;
      if (Math.random() < attacker.mods.crit) {
        damage *= 2;
        crit = true;
      }
      if (this.mode === "pk") damage *= hit.heavy ? 0.6 : 0.65;
    } else if (attacker instanceof Enemy) {
      damage *= 1 + this.stageIndex * 0.15;
    }

    let knock = hit.knock;
    let blocked = false;
    if (target instanceof Enemy) {
      const shield = target.shieldFactor(hit);
      if (shield < 1) {
        blocked = true;
        damage *= shield;
        knock = (knock ?? 100) * 0.2;
        const sx = target.x + target.facing * target.bodyW * 0.45;
        this.fx.flashCore(sx, target.cy, 0.8);
        this.fx.ring(sx, target.cy, 0x9fe8ff, 60, 220);
        this.fx.sparks(sx, target.cy, 0x9fe8ff, target.facing, 10, 700);
        this.fx.label(target.x, target.y - target.bodyH - 20, "CHẶN", "#9fe8ff");
      }
    }

    const dealt = target.takeHit({ ...hit, damage, knock, source: attacker });
    if (dealt <= 0) return 0;

    const heavy = crit || !!hit.heavy;
    if (!blocked) this.fx.hit(target.cx - hit.dir * target.bodyW * 0.15, target.cy - 10, hit.dir, this.paletteFor(attacker), heavy);
    if (target instanceof Enemy || this.mode === "pk") this.fx.number(target.cx, target.y - target.bodyH - 10, dealt, 0xffffff, crit);
    if (crit) sfx.crit();
    else sfx.hit();
    this.hitstop = Math.max(this.hitstop, heavy ? 0.075 : 0.04);
    if (heavy) {
      this.fx.shake(0.006, 110);
      this.fx.zoomPunch(0.025, 180);
    }

    if (attacker instanceof Hero) {
      this.combo += 1;
      this.comboTimer = 2.2;
      attacker.gainEnergy(1);
    }
    return dealt;
  }

  meleeHit(attacker: Actor, rect: Phaser.Geom.Rectangle, hit: Hit) {
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, t.bounds()) && this.dealDamage(attacker, t, hit) > 0) count += 1;
    }
    return count;
  }

  areaHit(attacker: Actor, cx: number, cy: number, radius: number, hit: Hit, everywhere = false) {
    const circle = new Phaser.Geom.Circle(cx, cy, radius);
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (everywhere || Phaser.Geom.Intersects.CircleToRectangle(circle, t.bounds())) {
        const dir = Math.sign(t.x - attacker.x) || attacker.facing;
        if (this.dealDamage(attacker, t, { ...hit, dir }) > 0) count += 1;
      }
    }
    return count;
  }

  enemyAttack(enemy: Enemy, rect: Phaser.Geom.Rectangle, hit: Hit) {
    this.meleeHit(enemy, rect, { ...hit, source: enemy });
  }

  // ---------- callbacks ----------

  onHeroHurt(hero: Hero, dealt: number) {
    if (this.mode !== "pk") this.combo = 0;
    this.fx.shake(0.004 + Math.min(dealt, 40) / 4000, 140);
    void hero;
  }

  onHeroDown(hero: Hero) {
    const pal = PALETTE[hero.def.element];
    this.fx.shake(0.015, 300);
    this.fx.explosion(hero.cx, hero.cy, pal, 90, false);
    if (this.mode !== "pk" && !this.anyHeroAlive()) this.time.delayedCall(1200, () => this.finish(false));
    else if (this.mode === "coop") this.fx.label(hero.x, hero.y - 190, "Hồi sinh sau 8s", "#ffb0b8");
  }

  onEnemyKilled(enemy: Enemy, hit: Hit) {
    const killer = hit.source instanceof Hero ? hit.source : undefined;
    const mult = 1 + Math.min(this.combo, 50) / 25;
    const points = Math.round(enemy.def.score * mult);
    this.score += points;
    if (killer) {
      killer.kills += 1;
      killer.score += points;
      killer.heal(killer.mods.healOnKill);
    }
    const blast = { main: 0xff8a2a, light: 0xfff0b0, dark: 0x8a1a1a };
    const size = Math.min(160, enemy.bodyH * 0.7);
    this.time.delayedCall(enemy.isBoss ? 0 : 180, () => this.fx.explosion(enemy.cx, enemy.cy, blast, size));
    this.fx.shards(enemy.cx, enemy.cy, { main: 0x6fa8ff, light: 0xdfeaff, dark: 0x203060 }, enemy.isBoss ? 30 : 10, 600);
    sfx.boom();
    this.fx.label(enemy.cx, enemy.y - enemy.bodyH - 30, `+${points}`, "#ffe45c");
    if (enemy.isBoss) {
      this.fx.flash(0xffffff, 400);
      this.fx.shake(0.03, 900);
      for (let i = 0; i < 7; i += 1) {
        this.time.delayedCall(i * 200, () => {
          this.fx.explosion(enemy.x + Phaser.Math.Between(-140, 140), enemy.cy + Phaser.Math.Between(-120, 100), blast, Phaser.Math.Between(90, 160));
          sfx.boom();
        });
      }
      this.time.delayedCall(1500, () => {
        this.fx.pillar(enemy.x, 0xffd890, 3, 1.4, 900);
        this.fx.ring(enemy.x, GROUND_Y - 4, 0xffd890, 700, 900, 0.22);
      });
      this.aliveEnemies().forEach((e) => e.takeHit({ damage: 9999, dir: 1, color: 0xffffff }));
      this.events.emit("boss", null);
      this.boss = undefined;
    }
    this.dropLoot(enemy);
  }

  onBossEnrage(boss: Enemy) {
    this.fx.flash(0xff2040, 300);
    this.fx.shake(0.02, 500);
    this.events.emit("toast", "Colossus nổi giận!");
    sfx.warn();
    this.fx.ring(boss.cx, boss.cy, 0xff3355, 420, 700);
    this.fx.ring(boss.x, GROUND_Y - 4, 0xff3355, 600, 800, 0.22);
    this.fx.embers(boss.cx, boss.cy, PALETTE.enemy, 30, 140);
  }

  ultimateIntro(hero: Hero, skill: SkillDef) {
    const pal = PALETTE[hero.def.element];
    sfx.ultimate();
    this.hitstop = Math.max(this.hitstop, 0.3);
    this.fx.tintScreen(pal.dark, 0.7, 1100);
    this.fx.charge(hero.cx, hero.cy, pal, 320, 220, 30);
    this.fx.ring(hero.x, GROUND_Y - 4, pal.main, 220, 600, 0.25, "glyph");
    this.events.emit("cutin", hero, skill);
  }

  // ---------- projectiles ----------

  spawnProjectile(spec: ProjectileSpec) {
    const pal = spec.owner instanceof Hero ? PALETTE[spec.owner.def.element] : PALETTE.enemy;
    const add = (tex: string, tint: number, sx: number, sy: number, depth = DEPTH.projectile) =>
      this.add.image(spec.x, spec.y, tex).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sy).setDepth(depth);
    const s = spec.size / 20;
    const parts: Phaser.GameObjects.Image[] = [];
    let trail: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    let crackle: Phaser.GameObjects.Graphics | undefined;
    const p = { x: spec.x, y: spec.y };

    switch (spec.style) {
      case "plasma":
        parts.push(add("glow", pal.main, 1.4 * s, 0.9 * s), add("streak", pal.main, 2.2 * s, 3.2 * s), add("streak", 0xffffff, 1.5 * s, 1.6 * s, DEPTH.projectile + 1));
        trail = this.fx.trail(p, "streak", {
          speed: 0, lifespan: 260, frequency: 12, scale: { start: 0.9 * s, end: 0 }, alpha: { start: 0.8, end: 0 },
          color: [pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD, rotate: Math.atan2(spec.vy, spec.vx) * (180 / Math.PI),
        });
        break;
      case "fire":
        parts.push(add("glow", pal.main, 1.8 * s, 1.8 * s), add("core", pal.light, 0.9 * s, 0.9 * s, DEPTH.projectile + 1));
        trail = this.fx.trail(p, "flame", {
          speedX: { min: -spec.vx * 0.15, max: -spec.vx * 0.05 }, speedY: { min: -90, max: -20 },
          lifespan: { min: 220, max: 420 }, frequency: 14, quantity: 2,
          scale: { start: 0.75 * s, end: 0.1 }, alpha: { start: 0.9, end: 0 }, rotate: { min: -20, max: 20 },
          color: [0xffffff, pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "volt":
        parts.push(add("glow", pal.main, 1.2 * s, 0.8 * s), add("streak", 0xffffff, 2.6 * s, 2 * s, DEPTH.projectile + 1));
        crackle = this.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
        trail = this.fx.trail(p, "dot", {
          speed: { min: 40, max: 160 }, lifespan: { min: 120, max: 260 }, frequency: 10,
          scale: { start: 0.5, end: 0 }, color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
      case "wind":
        parts.push(add("arc", pal.main, 0.55 * s, 0.85 * s), add("arc", 0xffffff, 0.42 * s, 0.6 * s, DEPTH.projectile + 1), add("glow", pal.main, 1.2 * s, 1.6 * s));
        parts.forEach((o) => o.setRotation(spec.vx < 0 ? Math.PI : 0));
        trail = this.fx.trail(p, "leaf", {
          speedX: { min: -spec.vx * 0.2, max: -spec.vx * 0.05 }, speedY: { min: -120, max: 120 },
          lifespan: { min: 300, max: 600 }, frequency: 25, scale: { start: 0.8, end: 0.2 },
          rotate: { start: 0, end: 720 }, color: [pal.light, pal.main, pal.dark], alpha: { start: 1, end: 0 },
        });
        break;
      case "enemy":
        parts.push(add("glow", pal.main, 1.2 * s, 1.2 * s), add("core", pal.light, 0.6 * s, 0.6 * s, DEPTH.projectile + 1), add("ring", pal.main, 0.22 * s, 0.22 * s));
        trail = this.fx.trail(p, "dot", {
          speed: 0, lifespan: 220, frequency: 16, scale: { start: 0.9 * s, end: 0 }, color: [pal.light, pal.main], blendMode: Phaser.BlendModes.ADD,
        });
        break;
    }
    this.projectiles.push({ ...spec, parts, trail, crackle, life: 1.6, age: 0, hitSet: new Set() });
    // Trail follows a plain object we move each frame.
    (this.projectiles[this.projectiles.length - 1] as Projectile & { anchor: { x: number; y: number } }).anchor = p;
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.age += dt;
      const anchor = (p as Projectile & { anchor: { x: number; y: number } }).anchor;
      anchor.x = p.x;
      anchor.y = p.y;
      const angle = Math.atan2(p.vy, p.vx);
      const pulse = 1 + Math.sin(p.age * 40) * 0.08;
      p.parts.forEach((o, i) => {
        o.setPosition(p.x, p.y);
        if (p.style === "wind") o.setRotation((p.vx < 0 ? Math.PI : 0) + Math.sin(p.age * 30) * 0.12);
        else if (p.style === "fire") o.setRotation(p.age * 8 * (i + 1));
        else o.setRotation(angle);
        if (i === 0) o.setAlpha(0.75 + Math.sin(p.age * 50) * 0.25);
      });
      if (p.style === "enemy") p.parts[2]?.setScale((p.size / 20) * 0.22 * pulse * 1.4);
      if (p.crackle) this.drawCrackle(p);

      const box = new Phaser.Geom.Rectangle(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      for (const t of this.targetsFor(p.owner)) {
        if (t.dead || p.hitSet.has(t) || p.pierce <= 0) continue;
        if (!Phaser.Geom.Intersects.RectangleToRectangle(box, t.bounds())) continue;
        p.hitSet.add(t);
        p.pierce -= 1;
        const dir = Math.sign(p.vx) || 1;
        if (p.explodeRadius) {
          this.explode(p.owner, p.x, p.y, p.explodeRadius, p.hit);
          p.pierce = 0;
        } else {
          this.dealDamage(p.owner, t, { ...p.hit, dir });
        }
        if (p.chain) this.chainFrom(p.owner, t, p.chain, p.hit, p.color);
      }
      const [minX, maxX] = this.arenaBounds();
      if (p.pierce <= 0 || p.life <= 0 || p.x < minX - 60 || p.x > maxX + 60 || p.y > GROUND_Y) {
        if (p.explodeRadius && p.pierce > 0) this.explode(p.owner, p.x, Math.min(p.y, GROUND_Y - 20), p.explodeRadius, p.hit);
        p.life = -1;
        const pal = this.paletteFor(p.owner);
        this.fx.flashCore(p.x, p.y, 0.6);
        this.fx.ring(p.x, p.y, pal.main, 50, 220);
        this.fx.sparks(p.x, p.y, pal.main, -Math.sign(p.vx) || 1, 5, 400, 80);
        p.parts.forEach((o) => o.destroy());
        p.crackle?.destroy();
        this.fx.stopTrail(p.trail, 700);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private drawCrackle(p: Projectile) {
    const g = p.crackle!;
    g.clear();
    const pal = this.paletteFor(p.owner);
    for (let k = 0; k < 3; k += 1) {
      let x = p.x;
      let y = p.y;
      const ang = Math.random() * Math.PI * 2;
      g.lineStyle(k === 0 ? 3 : 2, k === 0 ? 0xffffff : pal.main, 0.9);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s += 1) {
        x += Math.cos(ang) * 10 + (Math.random() - 0.5) * 14 - Math.sign(p.vx) * 8;
        y += Math.sin(ang) * 10 + (Math.random() - 0.5) * 14;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private explode(owner: Actor, x: number, y: number, radius: number, hit: Hit) {
    sfx.boom();
    this.fx.explosion(x, y, this.paletteFor(owner), radius);
    this.fx.shake(0.008, 140);
    this.areaHit(owner, x, y, radius, hit);
  }

  private chainFrom(owner: Actor, from: Actor, count: number, hit: Hit, color: number) {
    const done = new Set<Actor>([from]);
    let cur = from;
    for (let i = 0; i < count; i += 1) {
      const next = this.targetsFor(owner)
        .filter((t) => !t.dead && !done.has(t) && Math.abs(t.x - cur.x) < 360)
        .sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x))[0];
      if (!next) return;
      done.add(next);
      const [fx, fy, tx, ty] = [cur.cx, cur.cy, next.cx, next.cy];
      this.time.delayedCall(i * 70, () => {
        this.fx.lightning(fx, fy, tx, ty, color, 0.7, 1, 220);
        this.fx.flashCore(tx, ty, 0.7);
      });
      this.dealDamage(owner, next, { ...hit, damage: hit.damage * 0.7, dir: Math.sign(next.x - cur.x) || 1, stun: 0.3 });
      cur = next;
    }
  }

  // ---------- fields (Electric Cage, Toxic Spiral) ----------

  spawnField(f: { owner: Hero; offset: number; x: number; y: number; radius: number; duration: number; tick: number; color: number; hit: Hit; style: FieldStyle }) {
    const pal = PALETTE[f.owner.def.element];
    const glyph = this.add.image(f.x, GROUND_Y - 4, "glyph").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.shadow + 1)
      .setScale(0.1, 0.03).setAlpha(0.9);
    this.tweens.add({ targets: glyph, scaleX: f.radius / 120, scaleY: f.radius / 120 * 0.28, duration: 220, ease: "Back.easeOut" });
    const glow = this.add.image(f.x, f.y, "glow").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setScale(f.radius / 60, f.radius / 90).setAlpha(0.4).setDepth(DEPTH.fx - 1);
    let bars: Phaser.GameObjects.Graphics | undefined;
    let emitter: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    if (f.style === "cage") {
      bars = this.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      this.fx.lightning(f.x, this.cameras.main.worldView.y - 20, f.x, GROUND_Y - 10, pal.main, 1.2, 3, 300);
      this.fx.ring(f.x, GROUND_Y - 4, pal.light, f.radius * 1.3, 400, 0.28);
    } else {
      emitter = this.add.particles(f.x, f.y, "bubble", {
        emitZone: { type: "random", source: new Phaser.Geom.Ellipse(0, 40, f.radius * 1.6, 60) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
        speedY: { min: -160, max: -50 }, speedX: { min: -30, max: 30 },
        lifespan: { min: 500, max: 900 }, frequency: 25, quantity: 2,
        scale: { start: 0.25, end: 0.8 }, alpha: { start: 0.9, end: 0 },
        color: [pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD,
      }).setDepth(DEPTH.fx);
      this.fx.ring(f.x, f.y, pal.main, f.radius, 400);
    }
    this.fields.push({ ...f, time: f.duration, acc: f.tick, glyph, glow, bars, emitter });
  }

  private updateFields(dt: number) {
    for (const f of this.fields) {
      f.time -= dt;
      if (f.offset === 0) f.x = f.owner.x;
      const pal = PALETTE[f.owner.def.element];
      const fade = Math.min(1, f.time / 0.3);
      f.glyph.setPosition(f.x, GROUND_Y - 4).setRotation(f.glyph.rotation + dt * (f.style === "spiral" ? 3 : 1.2)).setAlpha(0.9 * fade);
      f.glow.setPosition(f.x, f.y).setAlpha((0.3 + Math.sin(this.time.now / 70) * 0.12) * fade);
      f.emitter?.setPosition(f.x, f.y);
      if (f.bars) this.drawCage(f, pal, fade);
      if (f.style === "spiral" && Math.random() < dt * 30) {
        const a = this.time.now / 140 + Math.random() * 0.4;
        this.fx.particles(f.x + Math.cos(a) * f.radius * 0.8, f.y + Math.sin(a) * 40, "leaf", {
          speedX: { min: -Math.sin(a) * 260, max: -Math.sin(a) * 180 }, speedY: { min: -120, max: -40 },
          lifespan: 420, scale: { start: 0.9, end: 0.2 }, rotate: { start: 0, end: 540 }, color: [pal.light, pal.main], alpha: { start: 1, end: 0 },
        }, 1);
      }
      f.acc += dt;
      if (f.acc >= f.tick) {
        f.acc -= f.tick;
        this.areaHit(f.owner, f.x, f.y, f.radius, f.hit);
      }
      if (f.time <= 0) {
        f.glyph.destroy();
        f.glow.destroy();
        f.bars?.destroy();
        this.fx.stopTrail(f.emitter, 900);
        this.fx.ring(f.x, f.y, pal.main, f.radius, 300);
      }
    }
    this.fields = this.fields.filter((f) => f.time > 0);
  }

  private drawCage(f: Field, pal: Palette, fade: number) {
    const g = f.bars!;
    g.clear();
    const top = f.y - f.radius * 1.1;
    const bottom = GROUND_Y - 4;
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + this.time.now / 600;
      const x = f.x + Math.cos(a) * f.radius;
      const front = Math.sin(a) > 0;
      g.lineStyle(front ? 4 : 2, front ? 0xffffff : pal.main, (front ? 0.9 : 0.45) * fade);
      g.beginPath();
      g.moveTo(x, top);
      for (let y = top; y < bottom; y += 26) g.lineTo(x + (Math.random() - 0.5) * 12, Math.min(bottom, y + 26));
      g.strokePath();
    }
    g.lineStyle(3, pal.main, 0.7 * fade).strokeEllipse(f.x, top, f.radius * 2, f.radius * 0.4);
    if (Math.random() < 0.35) {
      const a1 = Math.random() * Math.PI * 2;
      const a2 = a1 + Math.PI * (0.5 + Math.random());
      g.lineStyle(2, 0xffffff, 0.9 * fade);
      g.lineBetween(f.x + Math.cos(a1) * f.radius, f.y + Math.sin(a1) * 50, f.x + Math.cos(a2) * f.radius, f.y + Math.sin(a2) * 50);
    }
  }

  // ---------- meteors & hazards ----------

  spawnMeteor(owner: Hero, x: number, radius: number, hit: Hit) {
    const pal = PALETTE[owner.def.element];
    const mark = this.add.image(x, GROUND_Y - 4, "glyph").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setScale(radius / 120, radius / 120 * 0.26).setAlpha(0).setDepth(DEPTH.shadow + 1);
    this.tweens.add({ targets: mark, alpha: 0.9, rotation: 2, duration: 420 });
    const startX = x - 320;
    const startY = this.cameras.main.worldView.y - 100;
    const rock = { x: startX, y: startY };
    const head = this.add.image(startX, startY, "glow").setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setDepth(DEPTH.projectile);
    const core = this.add.image(startX, startY, "core").setTint(pal.light).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setDepth(DEPTH.projectile + 1);
    const angle = Math.atan2(GROUND_Y - 40 - startY, x - startX) * (180 / Math.PI);
    const tail = this.fx.trail(rock, "flame", {
      speed: { min: 20, max: 80 }, lifespan: { min: 260, max: 480 }, frequency: 8, quantity: 2,
      scale: { start: 1.3, end: 0.1 }, alpha: { start: 1, end: 0 }, rotate: angle + 90,
      color: [0xffffff, pal.light, pal.main, pal.dark], blendMode: Phaser.BlendModes.ADD,
    });
    const smoke = this.fx.trail(rock, "smoke", { speed: 20, lifespan: 600, frequency: 40, scale: { start: 0.4, end: 1.2 }, alpha: { start: 0.4, end: 0 }, tint: 0x30262a }, DEPTH.projectile - 2);
    this.tweens.add({
      targets: [head, core, rock],
      x,
      y: GROUND_Y - 40,
      delay: 120,
      duration: 360,
      ease: "Quad.easeIn",
      onComplete: () => {
        head.destroy();
        core.destroy();
        mark.destroy();
        this.fx.stopTrail(tail, 500);
        this.fx.stopTrail(smoke, 700);
        this.fx.pillar(x, pal.main, 1.4, 0.8, 500);
        this.explode(owner, x, GROUND_Y - 60, radius, hit);
      },
    });
  }

  spawnShockwave(owner: Enemy, x: number, dir: number, speed: number, damage: number) {
    const pal = PALETTE.boss;
    const mk = (tex: string, tint: number, sx: number, sy: number, d: number) =>
      this.add.image(x, GROUND_Y - 10, tex).setOrigin(0.5, 1).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sy).setDepth(d);
    const parts = [mk("flame", pal.main, 1.4, 1.4, DEPTH.fx), mk("flame", pal.light, 0.7, 0.9, DEPTH.fx + 1), mk("glow", pal.main, 1.6, 1.0, DEPTH.fx - 1)];
    const anchor = { x, y: GROUND_Y - 10 };
    const trail = this.fx.trail(anchor, "shard", {
      speedY: { min: -420, max: -160 }, speedX: { min: -80, max: 80 }, gravityY: 1200,
      lifespan: { min: 300, max: 600 }, frequency: 25, scale: { start: 0.7, end: 0.2 }, rotate: { start: 0, end: 360 },
      color: [pal.light, 0x7a86a0], 
    }, DEPTH.fx);
    this.hazards.push({
      owner, rect: new Phaser.Geom.Rectangle(x - 30, GROUND_Y - 60, 60, 60), vx: dir * speed, life: 2.2, maxLife: 2.2,
      hitSet: new Set(), damage, parts, trail, kind: "shock",
    });
    (this.hazards[this.hazards.length - 1] as Hazard & { anchor: { x: number; y: number } }).anchor = anchor;
  }

  spawnBeam(owner: Enemy, x0: number, x1: number, y: number, height: number, damage: number) {
    sfx.boom();
    this.fx.shake(0.014, 450);
    const pal = PALETTE.boss;
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const mk = (tint: number, sy: number, d: number) =>
      this.add.image(cx, y, "beam").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w, height * sy).setDepth(d);
    const parts = [mk(pal.dark, 2.2, DEPTH.fx - 1), mk(pal.main, 1.2, DEPTH.fx), mk(0xffffff, 0.45, DEPTH.fx + 1)];
    const muzzleX = owner.facing > 0 ? x0 : x1;
    this.fx.flashCore(muzzleX, y, 2);
    this.fx.glow(muzzleX, y, pal.main, 4, 500);
    const anchor = { x: owner.facing > 0 ? x1 : x0, y };
    const trail = this.fx.trail(anchor, "streak", {
      speed: { min: 200, max: 600 }, angle: owner.facing > 0 ? { min: 120, max: 240 } : { min: -60, max: 60 },
      lifespan: 300, frequency: 20, quantity: 3, scale: { start: 0.7, end: 0 }, rotate: { onEmit: () => 0, onUpdate: (p: Phaser.GameObjects.Particles.Particle) => Math.atan2(p.velocityY, p.velocityX) * (180 / Math.PI) },
      color: [0xffffff, pal.main], blendMode: Phaser.BlendModes.ADD,
    }, DEPTH.fx + 2);
    this.hazards.push({
      owner, rect: new Phaser.Geom.Rectangle(x0, y - height / 2, w, height), vx: 0, life: 0.55, maxLife: 0.55,
      hitSet: new Set(), damage, parts, trail, kind: "beam",
    });
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      h.life -= dt;
      h.rect.x += h.vx * dt;
      if (h.kind === "shock") {
        const anchor = (h as Hazard & { anchor: { x: number; y: number } }).anchor;
        anchor.x = h.rect.centerX;
        h.parts.forEach((o, i) => o.setPosition(h.rect.centerX, GROUND_Y - (i === 2 ? 30 : 6)).setScale(
          (i === 0 ? 1.4 : i === 1 ? 0.7 : 1.6) * (0.9 + Math.random() * 0.2),
          (i === 0 ? 1.4 : i === 1 ? 0.9 : 1.0) * (0.85 + Math.random() * 0.3),
        ));
        if (Math.random() < 0.5) this.fx.dust(h.rect.centerX, Math.sign(h.vx), 0.8);
      } else {
        const t = 1 - h.life / h.maxLife;
        const thick = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
        const sizes = [2.2, 1.2, 0.45];
        h.parts.forEach((o, i) => o.setDisplaySize(h.rect.width, h.rect.height * sizes[i] * thick * (0.85 + Math.random() * 0.3)));
      }
      for (const hero of this.heroes) {
        if (hero.dead || h.hitSet.has(hero)) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(h.rect, hero.bounds())) {
          if (this.dealDamage(h.owner, hero, { damage: h.damage, dir: Math.sign(hero.x - h.owner.x) || 1, knock: 460, launch: 420, color: 0x6fb6ff }) > 0) h.hitSet.add(hero);
        }
      }
      const [minX, maxX] = this.arenaBounds();
      if (h.life <= 0 || h.rect.right < minX || h.rect.left > maxX) {
        h.life = -1;
        h.parts.forEach((o) => o.destroy());
        this.fx.stopTrail(h.trail, 700);
      }
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  // ---------- pickups ----------

  private dropLoot(enemy: Enemy) {
    const drops: Pickup["kind"][] = ["coin"];
    const r = Math.random();
    if (enemy.isBoss) drops.push("health", "energy", "coin", "coin");
    else if (r < 0.22) drops.push("health");
    else if (r < 0.5) drops.push("energy");
    drops.forEach((kind, i) => {
      const key = kind === "health" ? "item_health" : kind === "energy" ? "item_energy" : "item_coin";
      const x = Phaser.Math.Clamp(enemy.x + (i - drops.length / 2) * 40, this.arenaMin + 40, this.arenaMax - 40);
      const img = this.add.image(x, enemy.cy, key).setScale(kind === "coin" ? 0.45 : 0.6).setDepth(DEPTH.projectile);
      this.pickups.push({ kind, img, x, y: Math.min(enemy.cy, GROUND_Y - 40), vy: -420 - Math.random() * 200, life: 12 });
    });
  }

  private updatePickups(dt: number) {
    for (const p of this.pickups) {
      p.life -= dt;
      p.vy += 1800 * dt;
      p.y = Math.min(GROUND_Y - 24, p.y + p.vy * dt);
      if (p.y >= GROUND_Y - 24) p.vy = 0;
      const bob = p.vy === 0 ? Math.sin(this.time.now / 200 + p.x) * 5 : 0;
      p.img.setPosition(p.x, p.y + bob).setAlpha(p.life < 2 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1);
      const hero = this.heroes.find((h) => !h.dead && Math.abs(h.x - p.x) < 60 && Math.abs(h.y - 60 - p.y) < 110);
      if (hero && p.vy === 0) {
        p.life = -1;
        sfx.pickup();
        const color = p.kind === "health" ? 0x7dff9a : p.kind === "energy" ? 0x7de8ff : 0xffe45c;
        if (p.kind === "health") {
          hero.heal(45);
          this.fx.label(hero.x, hero.y - 170, "+45 HP", "#7dff9a");
        } else if (p.kind === "energy") {
          hero.gainEnergy(30);
          this.fx.label(hero.x, hero.y - 170, "+30 NL", "#7de8ff");
        } else {
          this.score += 50;
          hero.score += 50;
        }
        this.fx.ring(p.x, p.y, color, 50, 260);
        this.fx.embers(p.x, p.y, { main: color, light: 0xffffff, dark: color }, 8, 16);
      }
      if (p.life <= 0) p.img.destroy();
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }
}
