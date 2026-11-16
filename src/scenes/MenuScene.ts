import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, hex, loadBest, type GameMode } from "../config/constants";
import { getDailyDateString } from "../config/daily";
import { HEROES } from "../config/heroes";
import { heroKey } from "../systems/assets";
import { setSceneFlag } from "../systems/controls";
import { getDifficulty, setDifficulty, type DifficultyLevel } from "../systems/difficulty";
import { getDailyRecord, getEndlessLeaderboard, loadProgress } from "../systems/progress";
import { sfx } from "../systems/sfx";
import { Button, text } from "../ui/widgets";

const MODES: { id: GameMode; label: string; hint: string }[] = [
  { id: "solo", label: "CHIẾN DỊCH", hint: "Vượt 4 màn phiêu lưu, hạ trùm Abyssal Colossus" },
  { id: "coop", label: "CO-OP 2P", hint: "Hai người cùng chiến đấu, tương trợ lẫn nhau" },
  { id: "pk", label: "ĐỐI KHÁNG", hint: "Đấu tay đôi 1v1 · Người vs Người hoặc Đấu Bot AI" },
  { id: "endless", label: "VÔ TẬN", hint: "Sóng quái vô hạn, điều kiện môi trường ngẫu nhiên mỗi 5 đợt" },
  { id: "bossrush", label: "BOSS RUSH", hint: "3 Đại Trùm liên tiếp, hồi 30% HP sau mỗi trận thắng" },
  { id: "daily", label: "HẰNG NGÀY", hint: "Thử thách chung theo ngày, cùng hạt giống ngẫu nhiên (seed)" },
];

const STAT_LABELS: [keyof (typeof HEROES)[number]["stats"], string][] = [
  ["atk", "Công"],
  ["def", "Thủ"],
  ["spd", "Tốc"],
  ["skill", "Kỹ năng"],
];

export class MenuScene extends Phaser.Scene {
  private mode = 0;
  private picks: [number, number] = [0, 1];
  private modeButtons: Button[] = [];
  private diffButtons: Button[] = [];
  private cards: { root: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Rectangle; p1: Phaser.GameObjects.Text; p2: Phaser.GameObjects.Text }[] = [];
  private detail!: Phaser.GameObjects.Container;
  private extraOptions!: Phaser.GameObjects.Container;
  private art!: Phaser.GameObjects.Image;
  private artGlow!: Phaser.GameObjects.Image;
  private modeHint!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.TileSprite;
  private modal?: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // PK & Difficulty options
  private pkBotLevel: "none" | "easy" | "normal" | "hard" = "none";
  private pkHandicap: number = 1.0;
  private pkAllowSameHero = true;

  constructor() {
    super("menu");
  }

  create() {
    setSceneFlag("menu");
    this.cards = [];
    this.modeButtons = [];
    this.diffButtons = [];
    this.modal = undefined;

    const src = this.textures.get("bg_city_neon").getSourceImage();
    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_city_neon").setOrigin(0).setTileScale(GAME_HEIGHT / src.height);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.55).setOrigin(0);
    this.add.rectangle(0, 0, 640, GAME_HEIGHT, 0x02070d, 0.6).setOrigin(0);

    text(this, 60, 32, "ELEMENT ARMOR", 18, "#18e6ff", "900").setLetterSpacing(6);
    text(this, 56, 50, "HÀO QUANG GIÁP", 48, "#ffffff", "900");
    const prog = loadProgress();
    text(this, GAME_WIDTH - 40, 32, `KỶ LỤC ${prog.bestScore || loadBest()}`, 16, "#ffe45c", "900").setOrigin(1, 0);
    text(this, GAME_WIDTH - 40, 54, `🪙 ${prog.coins} XU`, 16, "#7dffb0", "900").setOrigin(1, 0);
    text(this, GAME_WIDTH - 40, 76, `🏆 ${prog.achievements.length} THÀNH TỰU`, 14, "#9fe8ff", "700").setOrigin(1, 0);

    // Mode Buttons: 2 rows of 3 buttons
    MODES.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = 115 + col * 165;
      const by = 138 + row * 44;
      const b = new Button(this, bx, by, 155, 38, m.label, () => this.setMode(i));
      this.modeButtons.push(b);
    });
    this.modeHint = text(this, 40, 230, "", 14, "#9fb8cc", "700");

    // Difficulty Selector
    const curDiff = getDifficulty();
    text(this, 40, 258, "ĐỘ KHÓ:", 14, "#7dffb0", "800");
    const diffLevels: DifficultyLevel[] = ["easy", "normal", "hard"];
    const diffNames = ["DỄ", "THƯỜNG", "KHÓ"];
    diffLevels.forEach((lvl, idx) => {
      const b = new Button(this, 160 + idx * 100, 258, 90, 32, diffNames[idx], () => {
        setDifficulty(lvl);
        sfx.select();
        this.diffButtons.forEach((btn, j) => btn.setSelected(j === idx));
      });
      if (lvl === curDiff) b.setSelected(true);
      this.diffButtons.push(b);
    });

    this.extraOptions = this.add.container(40, 286);

    this.artGlow = this.add.image(950, 280, "glow").setBlendMode(Phaser.BlendModes.ADD).setScale(4.5).setAlpha(0.35);
    this.art = this.add.image(950, 270, `${HEROES[0].id}_art`).setScale(0.85);
    this.tweens.add({ targets: this.art, y: 252, yoyo: true, repeat: -1, duration: 1600, ease: "Sine.easeInOut" });

    this.detail = this.add.container(60, 335);

    const unlockedHeroes = HEROES.filter((h) => prog.unlocks.includes(h.id));
    const cardSpacing = unlockedHeroes.length > 4 ? 112 : 132;
    unlockedHeroes.forEach((h, i) => {
      const x = (unlockedHeroes.length > 4 ? 640 : 690) + i * cardSpacing;
      const root = this.add.container(x, 548);
      const frame = this.add.rectangle(0, 0, 114, 124, 0x0a1a2c, 0.95).setOrigin(0).setStrokeStyle(2, h.color, 0.4);
      const idle = this.add.image(57, 118, heroKey(h.id, "idle")).setOrigin(0.5, 1);
      idle.setScale(104 / idle.height);
      const p1 = text(this, 6, 4, "P1", 15, "#18e6ff", "900");
      const p2 = text(this, 108, 4, "P2", 15, "#ff6a8a", "900").setOrigin(1, 0);
      root.add([frame, idle, p1, p2]);
      frame.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.pick(0, i));
      this.cards.push({ root, frame, p1, p2 });
    });
    text(this, 690, 684, "P1: A/D  ·  P2: ←/→  ·  Tab: đổi chế độ  ·  H: hướng dẫn", 14, "#7f95a8", "700");

    new Button(this, 160, 652, 210, 54, "BẮT ĐẦU", () => this.start(), 0xffe45c).setSelected(true);
    new Button(this, 310, 652, 130, 46, "Xưởng Giáp", () => this.scene.start("workshop"), 0x18e6ff);
    new Button(this, 445, 652, 130, 46, "Sổ Tay & TT", () => this.scene.start("codex"), 0x7dffb0);
    new Button(this, 580, 652, 130, 46, "BXH Vô Tận", () => this.openEndlessLeaderboard(), 0xffa500);
    new Button(this, 705, 652, 110, 46, "Giúp (H)", () => this.toggleHelp());

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      a: K.A, d: K.D, left: K.LEFT, right: K.RIGHT, tab: K.TAB, enter: K.ENTER, j: K.J, space: K.SPACE, h: K.H, esc: K.ESC,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture([K.TAB, K.SPACE]);
    this.input.once("pointerdown", () => sfx.unlock());
    this.input.keyboard!.once("keydown", () => sfx.unlock());

    this.setMode(this.mode, true);
    this.refresh();
  }

  update(_t: number, dms: number) {
    this.bg.tilePositionX += dms * 0.01;
    const jd = (k: string) => Phaser.Input.Keyboard.JustDown(this.keys[k]);
    if (this.modal) {
      if (jd("h") || jd("esc") || jd("enter") || jd("j")) this.closeModal();
      return;
    }
    if (jd("a")) this.pick(0, this.picks[0] - 1);
    if (jd("d")) this.pick(0, this.picks[0] + 1);
    if (this.isTwoPlayerOrPk()) {
      if (jd("left")) this.pick(1, this.picks[1] - 1);
      if (jd("right")) this.pick(1, this.picks[1] + 1);
    }
    if (jd("tab")) this.setMode(this.mode + 1);
    if (jd("h")) this.toggleHelp();
    if (jd("enter") || jd("j") || jd("space")) this.start();
  }

  private isTwoPlayerOrPk() {
    const cur = MODES[this.mode].id;
    return cur === "coop" || cur === "pk";
  }

  private setMode(i: number, silent = false) {
    this.mode = (i + MODES.length) % MODES.length;
    this.modeButtons.forEach((b, j) => b.setSelected(j === this.mode));
    this.modeHint.setText(MODES[this.mode].hint);
    if (!silent) sfx.select();
    this.refreshExtraOptions();
    this.refresh();
  }

  private refreshExtraOptions() {
    this.extraOptions.removeAll(true);
    const mode = MODES[this.mode].id;

    if (mode === "pk") {
      this.extraOptions.add(text(this, 0, 0, "P2 Đối thủ:", 13, "#ff6a8a", "800"));
      const botLevels: ("none" | "easy" | "normal" | "hard")[] = ["none", "easy", "normal", "hard"];
      const botLabels = ["Người", "Bot Dễ", "Bot Thường", "Bot Khó"];
      botLevels.forEach((lvl, idx) => {
        const btn = new Button(this, 110 + idx * 95, 0, 88, 28, botLabels[idx], () => {
          this.pkBotLevel = lvl;
          sfx.select();
          this.refreshExtraOptions();
        });
        if (lvl === this.pkBotLevel) btn.setSelected(true);
        this.extraOptions.add(btn);
      });

      this.extraOptions.add(text(this, 0, 32, "Máu P2:", 13, "#ff6a8a", "800"));
      const handicaps = [1.0, 0.85, 0.7];
      const hcLabels = ["100%", "85%", "70%"];
      handicaps.forEach((h, idx) => {
        const btn = new Button(this, 110 + idx * 80, 32, 74, 28, hcLabels[idx], () => {
          this.pkHandicap = h;
          sfx.select();
          this.refreshExtraOptions();
        });
        if (Math.abs(h - this.pkHandicap) < 0.01) btn.setSelected(true);
        this.extraOptions.add(btn);
      });

      const lockLabel = this.pkAllowSameHero ? "Trùng Hero: BẬT" : "Trùng Hero: KHÓA";
      const lockBtn = new Button(this, 395, 32, 140, 28, lockLabel, () => {
        this.pkAllowSameHero = !this.pkAllowSameHero;
        sfx.select();
        this.refreshExtraOptions();
        this.refresh();
      });
      if (!this.pkAllowSameHero) lockBtn.setSelected(true);
      this.extraOptions.add(lockBtn);
    } else if (mode === "daily") {
      const dateStr = getDailyDateString();
      const dailyBest = getDailyRecord(dateStr);
      this.extraOptions.add(text(this, 0, 6, `Hạt giống hôm nay: ${dateStr}  ·  Kỷ lục ngày: ${dailyBest} điểm`, 13, "#ffe45c", "800"));
    } else if (mode === "endless") {
      const top = getEndlessLeaderboard()[0];
      const bestText = top ? `Kỷ lục Vô Tận: Đợt ${top.wave} · ${top.score} điểm (${top.hero})` : "Chưa có kỷ lục Vô Tận. Hãy là người đầu tiên!";
      this.extraOptions.add(text(this, 0, 6, bestText, 13, "#18e6ff", "800"));
    }
  }

  private pick(player: 0 | 1, i: number) {
    const prog = loadProgress();
    const unlocked = HEROES.filter((h) => prog.unlocks.includes(h.id));
    let targetIndex = (i + unlocked.length) % unlocked.length;

    // Prevent same hero pick in PK mode when locked
    if (MODES[this.mode].id === "pk" && !this.pkAllowSameHero) {
      const other = this.picks[player === 0 ? 1 : 0];
      if (targetIndex === other) {
        targetIndex = (targetIndex + 1) % unlocked.length;
      }
    }

    this.picks[player] = targetIndex;
    sfx.select();
    this.refresh();
  }

  private refresh() {
    const twoPlayer = this.isTwoPlayerOrPk();
    const prog = loadProgress();
    const unlocked = HEROES.filter((h) => prog.unlocks.includes(h.id));
    this.cards.forEach((c, i) => {
      const sel1 = this.picks[0] === i;
      const sel2 = twoPlayer && this.picks[1] === i;
      c.frame.setStrokeStyle(sel1 || sel2 ? 4 : 2, sel1 ? 0x18e6ff : sel2 ? 0xff6a8a : unlocked[i]?.color ?? 0x18e6ff, sel1 || sel2 ? 1 : 0.35);
      c.frame.setFillStyle(sel1 || sel2 ? 0x14304a : 0x0a1a2c, 0.95);
      c.p1.setVisible(sel1);
      c.p2.setVisible(sel2);
      c.root.y = sel1 ? 540 : 548;
    });

    const hero = unlocked[this.picks[0]] ?? unlocked[0];
    this.art.setTexture(`${hero.id}_art`).setScale(0.85);
    this.artGlow.setTint(hero.color);
    this.art.setAlpha(0).setX(990);
    this.tweens.add({ targets: this.art, alpha: 1, x: 950, duration: 220, ease: "Cubic.easeOut" });

    this.detail.removeAll(true);
    const d = this.detail;
    d.add(text(this, 0, -50, hero.name.toUpperCase(), 32, hex(hero.color), "900"));
    d.add(text(this, 0, -14, hero.role, 15, "#c8dcea", "700"));
    STAT_LABELS.forEach(([k, label], i) => {
      const y = 14 + i * 20;
      d.add(text(this, 0, y, label, 13, "#9fb8cc", "700"));
      for (let s = 0; s < 5; s += 1) d.add(this.add.rectangle(75 + s * 28, y + 3, 24, 9, s < hero.stats[k] ? hero.color : 0x1d2b3a).setOrigin(0));
    });
    const skills = [
      { key: "J", slot: "basic", name: hero.basic.name, desc: hero.basic.desc },
      ...(["skill1", "skill2", "ultimate"] as const).map((s, i) => ({ key: ["K", "L", "U"][i], slot: s, name: hero.skills[s].name, desc: hero.skills[s].desc })),
    ];
    skills.forEach((s, i) => {
      const y = 100 + i * 44;
      d.add(this.add.image(18, y + 16, `${hero.id}_icon_${s.slot}`).setDisplaySize(34, 34));
      d.add(text(this, 44, y, `${s.key} · ${s.name}`, 15, "#ffffff", "800"));
      d.add(text(this, 44, y + 20, s.desc, 13, "#9fb8cc", "600"));
    });
    if (twoPlayer) {
      const p2 = unlocked[this.picks[1]] ?? unlocked[0];
      const botLabel = this.pkBotLevel !== "none" ? ` (Bot ${this.pkBotLevel.toUpperCase()})` : "";
      d.add(text(this, 630, 210, `P2: ${p2.name}${botLabel}`, 16, "#ff6a8a", "900"));
    }
  }

  private closeModal() {
    if (this.modal) {
      this.modal.destroy();
      this.modal = undefined;
    }
  }

  private openEndlessLeaderboard() {
    this.closeModal();
    sfx.select();
    const root = this.add.container(0, 0).setDepth(15);
    root.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.94).setOrigin(0).setInteractive().on("pointerdown", () => this.closeModal()));
    root.add(text(this, GAME_WIDTH / 2, 70, "BẢNG XẾP HẠNG VÔ TẬN", 38, "#18e6ff", "900").setOrigin(0.5));
    root.add(text(this, GAME_WIDTH / 2, 110, "Top 10 Chiến Binh Trụ Vững Lâu Nhất", 17, "#9fb8cc", "700").setOrigin(0.5));

    const board = getEndlessLeaderboard();
    if (board.length === 0) {
      root.add(text(this, GAME_WIDTH / 2, 280, "Chưa có kỷ lục nào. Hãy tham gia Chế độ Vô Tận ngay!", 20, "#ffffff", "700").setOrigin(0.5));
    } else {
      // Table Header
      const y0 = 160;
      root.add(text(this, 240, y0, "HẠNG", 16, "#ffe45c", "900"));
      root.add(text(this, 350, y0, "ANH HÙNG", 16, "#ffe45c", "900"));
      root.add(text(this, 560, y0, "ĐỢT ĐẠT", 16, "#ffe45c", "900"));
      root.add(text(this, 730, y0, "ĐIỂM SỐ", 16, "#ffe45c", "900"));
      root.add(text(this, 930, y0, "NGÀY", 16, "#ffe45c", "900"));

      board.forEach((item, idx) => {
        const rowY = y0 + 36 + idx * 34;
        const color = idx === 0 ? "#ffe45c" : idx === 1 ? "#18e6ff" : idx === 2 ? "#7dffb0" : "#c8dcea";
        root.add(text(this, 240, rowY, `#${idx + 1}`, 16, color, "800"));
        root.add(text(this, 350, rowY, item.hero.toUpperCase(), 16, color, "700"));
        root.add(text(this, 560, rowY, `Đợt ${item.wave}`, 16, color, "700"));
        root.add(text(this, 730, rowY, `${item.score}`, 16, color, "800"));
        root.add(text(this, 930, rowY, item.date, 15, "#7f95a8", "600"));
      });
    }

    new Button(this, GAME_WIDTH / 2, 630, 200, 48, "Đóng (Esc)", () => this.closeModal(), 0x18e6ff);
    this.modal = root;
  }

  private toggleHelp() {
    if (this.modal) {
      this.closeModal();
      return;
    }
    sfx.select();
    const root = this.add.container(0, 0).setDepth(10);
    root.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.92).setOrigin(0).setInteractive().on("pointerdown", () => this.closeModal()));
    root.add(text(this, GAME_WIDTH / 2, 70, "HƯỚNG DẪN", 44, "#18e6ff", "900").setOrigin(0.5));
    const col = (x: number, title: string, lines: string[], color: string) => {
      root.add(text(this, x, 130, title, 24, color, "900"));
      lines.forEach((l, i) => root.add(text(this, x, 172 + i * 32, l, 18, "#eaf8ff", "700")));
    };
    col(110, "P1 / 1 NGƯỜI", ["A / D — di chuyển", "W / Space — nhảy (nhảy kép)", "Shift / F — lướt né (bất tử ngắn)", "J — đánh thường (combo 3)", "K / L — kỹ năng 1 / 2", "U hoặc I — tuyệt kỹ (100 năng lượng)", "P / Esc — tạm dừng"], "#18e6ff");
    col(700, "P2", ["← / → — di chuyển", "↑ — nhảy", "↓ hoặc Numpad 0 — lướt", "Numpad 1 hoặc , — đánh thường", "Numpad 2/3 hoặc . / — kỹ năng", "Numpad 4 hoặc ' — tuyệt kỹ"], "#ff6a8a");
    const tips = [
      "• Đánh trúng và nhận đòn đều nạp năng lượng. Kỹ năng tiêu năng lượng.",
      "• Kẻ địch nháy đỏ và hiện dấu ! trước khi tấn công — hãy lướt hoặc nhảy né.",
      "• Né hoàn hảo đúng thời điểm đòn đánh sẽ kích hoạt làm chậm thời gian và hồi lướt.",
      "• Chế độ Vô Tận: thử thách sống sót với các điều kiện khắc nghiệt thay đổi mỗi 5 đợt.",
      "• Boss Rush: chiến đấu 3 trận trùm liên tiếp, chỉ hồi 30% HP sau mỗi trận.",
    ];
    tips.forEach((t, i) => root.add(text(this, 110, 430 + i * 30, t, 17, "#c8dcea", "600")));
    root.add(text(this, GAME_WIDTH / 2, 680, "Nhấn H / Esc hoặc chạm để đóng", 15, "#7f95a8", "700").setOrigin(0.5));
    this.modal = root;
  }

  private start() {
    sfx.unlock();
    sfx.confirm();
    const mode = MODES[this.mode].id;
    const prog = loadProgress();
    const unlocked = HEROES.filter((h) => prog.unlocks.includes(h.id));
    const h1 = (unlocked[this.picks[0]] ?? unlocked[0]).id;
    let h2 = (unlocked[this.picks[1]] ?? unlocked[0]).id;
    if (mode === "pk" && !this.pkAllowSameHero && h1 === h2) {
      const alt = unlocked.find((h) => h.id !== h1) ?? unlocked[0];
      h2 = alt.id;
    }
    const isSingle = mode === "solo" || mode === "endless" || mode === "bossrush" || mode === "daily";
    const heroes = isSingle ? [h1] : [h1, h2];

    this.cameras.main.fadeOut(250, 2, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("game", {
        mode,
        heroes,
        botDifficulty: mode === "pk" && this.pkBotLevel !== "none" ? this.pkBotLevel : undefined,
        handicaps: mode === "pk" ? [1.0, this.pkHandicap] : undefined,
        sameHeroAllowed: this.pkAllowSameHero,
      });
    });
  }
}
