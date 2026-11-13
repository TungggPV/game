import Phaser from "phaser";
import { hex, type GameData, type GameMode } from "../../config/constants";
import { HEROES, type HeroDef } from "../../config/heroes";
import { HERO_MAX_LEVEL, levelBonus, xpToNext } from "../../config/meta";
import { heroProgress, profile, saveProfile } from "../../systems/save";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";
import { MODE_INFO, session, SKILL_KEYS, type Flow } from "./data";
import { MenuScreen, type Dir } from "./MenuScreen";
import { bar, body, CYAN, drawPanel, MUTED, panel, pips, Tile } from "./ui";

const P2 = 0xff6a8a;
const SLOT_COLORS = [CYAN, P2];

export const STAT_LABELS: [keyof HeroDef["stats"], string][] = [
  ["atk", "Tấn công"],
  ["def", "Phòng thủ"],
  ["spd", "Tốc độ"],
  ["skill", "Kỹ năng"],
];

/** Hero detail block (stats + skills) shared with the roster screen. */
export const drawHeroDetail = (scene: Phaser.Scene, root: Phaser.GameObjects.Container, hero: HeroDef, x: number, y: number, w: number) => {
  const prog = heroProgress(hero.id);
  const bonus = levelBonus(prog.level);
  root.add(text(scene, x, y, "CHỈ SỐ", 13, MUTED, "900").setLetterSpacing(2));
  STAT_LABELS.forEach(([k, label], i) => {
    const ry = y + 26 + i * 25;
    root.add(body(scene, x, ry, label, 15, "#c8dcea", { weight: "700" }));
    root.add(pips(scene, x + 100, ry + 4, hero.stats[k], 5, hero.color, 30, 11, 5));
  });
  const facts: [string, string][] = [
    ["Máu", `${Math.round(hero.hp * bonus)}`],
    ["Sát thương", `+${Math.round((bonus - 1) * 100)}%`],
    ["Nhảy", `${hero.jumps} lần`],
    ["Chiến thắng", `${prog.wins}`],
  ];
  facts.forEach(([label, value], i) => {
    const ry = y + 26 + i * 25;
    root.add(body(scene, x + 330, ry, label, 15, "#9fb8cc", { weight: "700" }));
    root.add(body(scene, x + w - 20, ry, value, 15, "#ffffff", { weight: "900" }).setOrigin(1, 0));
  });

  const sy = y + 136;
  root.add(text(scene, x, sy, "KỸ NĂNG", 13, MUTED, "900").setLetterSpacing(2));
  const rows = [
    { slot: "basic" as const, name: hero.basic.name, desc: hero.basic.desc, meta: "Không tốn năng lượng" },
    ...(["skill1", "skill2", "ultimate"] as const).map((slot) => {
      const s = hero.skills[slot];
      return { slot, name: s.name, desc: s.desc, meta: `${s.cost} năng lượng · hồi ${s.cooldown} giây` };
    }),
  ];
  rows.forEach((r, i) => {
    const ry = sy + 24 + i * 66;
    const g = scene.add.graphics();
    drawPanel(g, x - 8, ry - 4, w - 4, 60, { fill: 0x0d2236, alpha: 0.7, radius: 10 });
    root.add(g);
    const icon = scene.add.image(x + 22, ry + 26, `${hero.id}_icon_${r.slot}`);
    icon.setScale(48 / icon.width);
    root.add(icon);
    const badge = scene.add.graphics();
    const ult = r.slot === "ultimate";
    drawPanel(badge, x + 56, ry + 2, 24, 22, { fill: ult ? 0xffe45c : hero.color, alpha: 1, radius: 5 });
    root.add(badge);
    root.add(body(scene, x + 68, ry + 13, SKILL_KEYS[r.slot], 14, "#02070d", { weight: "900" }).setOrigin(0.5));
    root.add(text(scene, x + 88, ry + 2, r.name, 17, ult ? "#ffe45c" : "#ffffff", "900"));
    root.add(body(scene, x + w - 20, ry + 4, r.meta, 13, "#9fb8cc", { weight: "700" }).setOrigin(1, 0));
    root.add(body(scene, x + 56, ry + 30, r.desc, 14, "#c8dcea", { wrap: w - 80 }));
  });
};

export const drawLevel = (scene: Phaser.Scene, root: Phaser.GameObjects.Container, hero: HeroDef, x: number, y: number, w: number) => {
  const prog = heroProgress(hero.id);
  const max = prog.level >= HERO_MAX_LEVEL;
  const need = xpToNext(prog.level);
  root.add(text(scene, x, y, `CẤP ${prog.level}`, 18, hex(hero.color), "900"));
  root.add(body(scene, x + w, y + 3, max ? "TỐI ĐA" : `${prog.xp}/${need} XP`, 13, "#9fb8cc", { weight: "800" }).setOrigin(1, 0));
  root.add(bar(scene, x, y + 28, w, 8, max ? 1 : prog.xp / need, hero.color).g);
};

type Card = { tile: Tile; badges: Phaser.GameObjects.Container[] };

export class HeroSelectScene extends MenuScreen {
  private flow!: Flow;
  private players = 1;
  private picks: number[] = [0, 1];
  private active = 0;
  private forced = false;
  private cards: Card[] = [];
  private slotTiles: Tile[] = [];
  private toggleTiles: Tile[] = [];
  private detail!: Phaser.GameObjects.Container;
  private art!: Phaser.GameObjects.Image;
  private artGlow!: Phaser.GameObjects.Image;
  private confirm!: Tile;

  constructor() {
    super("menu_heroes");
  }

  create(flow: Flow) {
    this.flow = { mode: flow.mode };
    const mode: GameMode = flow.mode;
    const info = MODE_INFO[mode];
    this.forced = mode === "pk" || mode === "training";
    this.players = mode === "pk" ? 2 : mode === "training" ? 1 : session.players;
    const last = profile().lastHeroes;
    const idx = (id: string | undefined, fallback: number) => {
      const i = HEROES.findIndex((h) => h.id === id);
      return i >= 0 ? i : fallback;
    };
    this.picks = [idx(last[0], 0), idx(last[1], 1)];
    this.active = 0;
    this.cards = [];
    this.slotTiles = [];
    this.toggleTiles = [];

    this.setupScreen({
      title: "CHỌN ANH HÙNG",
      subtitle: info.name.toUpperCase(),
      accent: info.color,
      hint: "P1: A / D   ·   P2: ← / →   ·   Tab: số người chơi   ·   J / Enter: tiếp tục   ·   Esc / K: quay lại",
    });

    if (this.forced) {
      const label = mode === "pk" ? "2 NGƯỜI · BẮT BUỘC" : "1 NGƯỜI · LUYỆN TẬP";
      panel(this, 760, 26, 260, 50, { stroke: info.color, strokeAlpha: 0.4, radius: 25 });
      text(this, 890, 51, label, 16, hex(info.color), "900").setOrigin(0.5);
    } else {
      [1, 2].forEach((n, i) => {
        const t = new Tile(this, 740 + i * 146, 26, 136, 50, {
          title: `${n} NGƯỜI`,
          titleSize: 17,
          align: "center",
          accent: info.color,
          onPress: () => this.setPlayers(n),
        });
        t.onHover = () => undefined;
        this.toggleTiles.push(t);
      });
    }

    // Art panel
    panel(this, 36, 98, 420, 468, { alpha: 0.75, stroke: info.color, strokeAlpha: 0.25, radius: 16 });
    this.artGlow = this.add.image(246, 300, "glow").setScale(4.2).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);
    this.art = this.add.image(246, 300, `${HEROES[0].id}_art`);
    [0, 1].forEach((slot) => {
      const t = new Tile(this, 52 + slot * 196, 112, 188, 40, {
        title: "",
        titleSize: 15,
        align: "center",
        accent: SLOT_COLORS[slot],
        onPress: () => this.setActive(slot),
      });
      t.onHover = () => undefined;
      this.slotTiles.push(t);
    });

    panel(this, 472, 98, 772, 468, { alpha: 0.82, stroke: info.color, strokeAlpha: 0.25, radius: 16 });
    this.detail = this.add.container(0, 0);

    HEROES.forEach((h, i) => {
      const tile = new Tile(this, 36 + i * 205, 582, 195, 96, {
        title: h.name,
        sub: `Cấp ${heroProgress(h.id).level}`,
        icon: `${h.id}_idle`,
        iconSize: 74,
        titleSize: 17,
        accent: h.color,
        onPress: () => this.assign(this.active, i),
      });
      tile.onHover = () => undefined;
      const badges = [0, 1].map((slot) => {
        const c = this.add.container(slot === 0 ? -64 : 64, -48);
        const g = this.add.graphics();
        drawPanel(g, -22, -12, 44, 24, { fill: SLOT_COLORS[slot], alpha: 1, radius: 12 });
        c.add([g, body(this, 0, 0, `P${slot + 1}`, 14, "#02070d", { weight: "900" }).setOrigin(0.5)]);
        tile.add(c);
        return c;
      });
      this.cards.push({ tile, badges });
    });

    const cta = this.forced ? "BẮT ĐẦU  ›" : "TIẾP TỤC  ›";
    this.confirm = this.addFocusable(
      new Tile(this, 868, 582, 376, 96, { title: cta, sub: "J / Enter", titleSize: 26, align: "center", accent: 0xffe45c, onPress: () => this.next() }),
    );
    this.focus(0, true);
    this.refresh(true);
  }

  protected onDirection(dir: Dir, code: string) {
    if (dir === "left" || dir === "right") {
      const step = dir === "left" ? -1 : 1;
      const p2Key = code === "ArrowLeft" || code === "ArrowRight";
      const slot = p2Key && this.players === 2 ? 1 : 0;
      this.assign(slot, this.picks[slot] + step);
    } else if (!this.forced && (dir === "up" || dir === "down")) {
      this.setPlayers(dir === "up" ? 1 : 2);
    }
    return true;
  }

  protected onKey(code: string) {
    if (!this.forced && (code === "Tab" || code === "KeyQ")) this.setPlayers(this.players === 1 ? 2 : 1);
  }

  protected onBack() {
    this.go("menu");
  }

  private setPlayers(n: number) {
    if (this.forced || n === this.players) return;
    this.players = n;
    session.players = n;
    if (n === 1) this.active = 0;
    sfx.select();
    this.refresh(false);
  }

  private setActive(slot: number) {
    if (slot >= this.players) return;
    this.active = slot;
    this.refresh(true);
  }

  private assign(slot: number, i: number) {
    this.picks[slot] = (i + HEROES.length) % HEROES.length;
    this.active = slot;
    sfx.select();
    this.refresh(true);
  }

  private refresh(animate: boolean) {
    this.toggleTiles.forEach((t, i) => t.setSelected(i + 1 === this.players));
    this.slotTiles.forEach((t, slot) => {
      const enabled = slot < this.players;
      t.setVisible(enabled || this.players === 1);
      if (!enabled) {
        t.setTitle("P2 · chưa tham gia").setAlpha(0.5).setSelected(false);
        return;
      }
      t.setAlpha(1).setTitle(`P${slot + 1} · ${HEROES[this.picks[slot]].name}`).setSelected(slot === this.active);
    });
    if (this.players === 1) this.slotTiles[1].setVisible(!this.forced);

    this.cards.forEach((c, i) => {
      const p1 = this.picks[0] === i;
      const p2 = this.players === 2 && this.picks[1] === i;
      c.badges[0].setVisible(p1);
      c.badges[1].setVisible(p2);
      c.tile.setSelected(p1 || p2);
    });

    const hero = HEROES[this.picks[this.active]];
    this.art.setTexture(`${hero.id}_art`);
    this.art.setScale(Math.min(390 / this.art.width, 300 / this.art.height));
    this.artGlow.setTint(hero.color);
    if (animate) {
      this.art.setAlpha(0).setX(276);
      this.tweens.add({ targets: this.art, alpha: 1, x: 246, duration: 220, ease: "Cubic.easeOut" });
    }

    this.detail.removeAll(true);
    const d = this.detail;
    d.add(text(this, 56, 462, hero.name.toUpperCase(), 30, hex(hero.color), "900"));
    d.add(body(this, 56, 500, hero.role, 15, "#c8dcea", { weight: "800" }));
    drawLevel(this, d, hero, 248, 498, 188);
    drawHeroDetail(this, d, hero, 496, 112, 740);
  }

  private next() {
    const heroes = this.picks.slice(0, this.players).map((i) => HEROES[i].id);
    const p = profile();
    p.lastHeroes = this.players === 2 ? heroes : [heroes[0], HEROES[this.picks[1]].id];
    saveProfile();
    const mode = this.flow.mode;
    if (mode === "campaign") this.go("menu_stage", { mode, heroes });
    else if (mode === "endless" || mode === "bossrush") this.go("menu_difficulty", { mode, heroes });
    else {
      const data: GameData = { mode, heroes, difficulty: "normal" };
      this.go("game", data);
    }
  }
}
