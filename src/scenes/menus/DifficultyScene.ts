import { hex, type GameData } from "../../config/constants";
import { STAGES } from "../../config/content";
import { HEROES } from "../../config/heroes";
import { DIFFICULTIES } from "../../config/meta";
import { saveProfile, settings } from "../../systems/save";
import { text } from "../../ui/widgets";
import { MODE_INFO, type Flow } from "./data";
import { MenuScreen } from "./MenuScreen";
import { body, GOLD, MUTED, panel, Tile } from "./ui";

export class DifficultyScene extends MenuScreen {
  private flow!: Flow;
  private cards: Tile[] = [];

  constructor() {
    super("menu_difficulty");
  }

  create(flow: Flow) {
    this.flow = { ...flow };
    this.cards = [];
    const info = MODE_INFO[flow.mode];
    this.setupScreen({
      title: "CHỌN ĐỘ KHÓ",
      subtitle: info.name.toUpperCase(),
      accent: info.color,
      hint: "A / D: đổi độ khó   ·   J / Enter: xuất kích   ·   Esc / K: quay lại",
    });

    const heroes = (flow.heroes ?? []).map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join("  +  ");
    const parts = [`Chế độ: ${info.name}`];
    if (flow.stage !== undefined) parts.push(`${STAGES[flow.stage].subtitle}: ${STAGES[flow.stage].name}`);
    parts.push(`Anh hùng: ${heroes}`);
    panel(this, 70, 104, 1140, 52, { alpha: 0.75, stroke: info.color, strokeAlpha: 0.3, radius: 26 });
    body(this, 640, 130, parts.join("     ·     "), 17, "#eaf8ff", { weight: "800" }).setOrigin(0.5);

    DIFFICULTIES.forEach((d, i) => {
      const x = 70 + i * 390;
      const card = new Tile(this, x, 186, 360, 340, { title: "", accent: d.color, onPress: () => this.pressCard(i) });
      const c = card;
      c.add(text(this, 0, -132, d.name.toUpperCase(), 38, hex(d.color), "900").setOrigin(0.5));
      c.add(body(this, 0, -82, d.desc, 16, "#c8dcea", { wrap: 300, align: "center", weight: "700" }).setOrigin(0.5, 0));
      const rows: [string, string][] = [
        ["Máu kẻ địch", `x${d.enemyHp}`],
        ["Sát thương kẻ địch", `x${d.enemyDmg}`],
        ["Tỉ lệ tinh anh", `${Math.round(d.eliteChance * 100)}%`],
        ["Phần thưởng", `x${d.reward}`],
      ];
      rows.forEach(([k, v], j) => {
        const y = -6 + j * 36;
        c.add(this.add.rectangle(0, y + 26, 300, 1, 0xffffff, 0.08));
        c.add(body(this, -150, y, k, 16, MUTED, { weight: "700" }));
        c.add(body(this, 150, y, v, 17, j === 3 ? hex(GOLD) : "#ffffff", { weight: "900" }).setOrigin(1, 0));
      });
      this.cards.push(this.addFocusable(card));
      // Tap selects, a second tap starts; hover must not pre-select or one tap would start.
      card.onHover = undefined;
    });

    const start = new Tile(this, 440, 560, 400, 84, { title: "XUẤT KÍCH  ›", sub: "J / Enter", titleSize: 28, align: "center", accent: GOLD, onPress: () => this.start() });
    start.onHover = () => start.setFocus(true);
    start.on("hoverout", () => start.setFocus(false));

    const current = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === (this.flow.difficulty ?? settings().difficulty)));
    this.focus(current, true);
  }

  protected onFocusChanged(i: number) {
    this.cards.forEach((c, j) => c.setSelected(j === i));
    this.flow.difficulty = DIFFICULTIES[i].id;
  }

  protected onConfirmKey() {
    this.start();
    return true;
  }

  protected onBack() {
    const { mode, heroes, stage } = this.flow;
    if (mode === "campaign") this.go("menu_stage", { mode, heroes, stage });
    else this.go("menu_heroes", { mode });
  }

  private pressCard(i: number) {
    if (this.focusIndex === i) this.start();
    else this.focus(i);
  }

  private start() {
    const difficulty = DIFFICULTIES[this.focusIndex].id;
    settings().difficulty = difficulty;
    saveProfile();
    const data: GameData = { mode: this.flow.mode, heroes: this.flow.heroes ?? [HEROES[0].id], difficulty };
    if (this.flow.mode === "campaign") data.stage = this.flow.stage ?? 0;
    this.go("game", data);
  }
}
