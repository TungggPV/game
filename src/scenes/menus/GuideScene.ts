import Phaser from "phaser";
import { hex } from "../../config/constants";
import { AFFIXES, POWERUPS, STAGES, type Hazard } from "../../config/content";
import { DIFFICULTIES, HERO_MAX_LEVEL, levelBonus } from "../../config/meta";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";
import { HAZARD_LABEL, MODE_INFO } from "./data";
import { MenuScreen, type Dir } from "./MenuScreen";
import { body, CYAN, drawPanel, GOLD, MUTED, panel, Tile } from "./ui";

type Entry = { label: string; desc: string; color?: number; icon?: string };
type Page = { tab: string; title: string; intro: string; entries?: Entry[]; custom?: "controls" | "ranks" };

const stagesWith = (h: Hazard) =>
  STAGES.map((s, i) => (s.hazard === h ? i + 1 : 0))
    .filter(Boolean)
    .join(", ");

const PAGES: Page[] = [
  {
    tab: "Điều khiển",
    title: "Điều khiển",
    intro: "Hai người chơi chung một bàn phím. Trên điện thoại, dùng các nút cảm ứng trên màn hình (điều khiển P1).",
    custom: "controls",
  },
  {
    tab: "Né hoàn hảo",
    title: "Né hoàn hảo",
    intro: "Lướt (Shift / F) đúng lúc ngay trước khi bị đánh trúng để kích hoạt Né hoàn hảo — kỹ năng quan trọng nhất của một chiến binh giáp.",
    entries: [
      { label: "Làm chậm thời gian", desc: "Thế giới chậm lại trong chốc lát, mở ra cơ hội phản công.", color: CYAN },
      { label: "Hồi năng lượng", desc: "Nhận ngay năng lượng để tung kỹ năng và tuyệt kỹ sớm hơn.", color: 0x7de8ff },
      { label: "Canh thời điểm", desc: "Cửa sổ né rất ngắn: lướt quá sớm chỉ là một cú lướt thường.", color: GOLD },
      { label: "Phản Xạ Thần Kinh", desc: "Nâng cấp trong trận giúp cửa sổ né hoàn hảo rộng gấp đôi.", color: 0xb06cff },
    ],
  },
  {
    tab: "Phong cách",
    title: "Hạng phong cách",
    intro: "Đánh liên tục, đa dạng chiêu thức và né đòn để tăng hạng từ D đến SSS. Hạng càng cao, điểm nhận được càng được nhân lớn. Bị trúng đòn hoặc ngừng đánh quá lâu sẽ tụt hạng.",
    custom: "ranks",
  },
  {
    tab: "Tinh anh",
    title: "Kẻ địch tinh anh",
    intro: "Kẻ địch tinh anh phát sáng theo màu thuộc tính, có nhiều máu hơn và mang một thuộc tính đặc biệt. Hạ chúng để có cơ hội nhận vật phẩm tăng sức.",
    entries: AFFIXES.map((a) => ({ label: a.name, desc: a.desc, color: a.color })),
  },
  {
    tab: "Tăng sức",
    title: "Vật phẩm tăng sức",
    intro: "Rơi ra từ kẻ địch tinh anh và thùng tiếp tế. Hiệu ứng có thời hạn — hãy tận dụng ngay!",
    entries: Object.values(POWERUPS).map((p) => ({ label: p.name, desc: `${p.desc} trong ${p.duration} giây.`, color: p.color, icon: p.icon })),
  },
  {
    tab: "Bẫy",
    title: "Bẫy môi trường",
    intro: "Một số màn có bẫy gây sát thương cho mọi thứ đứng sai chỗ. Quan sát tín hiệu cảnh báo và di chuyển liên tục.",
    entries: [
      { label: `${HAZARD_LABEL.laser} · Màn ${stagesWith("laser")}`, desc: "Hệ thống an ninh còn hoạt động quét tia laser qua chiến trường. Nhảy hoặc lướt để tránh.", color: 0xff4e5f },
      { label: `${HAZARD_LABEL.lava} · Màn ${stagesWith("lava")}`, desc: "Dung nham phun trào từ mặt đất. Đừng đứng yên quá lâu ở một chỗ.", color: 0xff6a2a },
      { label: `${HAZARD_LABEL.storm} · Màn ${stagesWith("storm")}`, desc: "Sét giáng xuống những vùng được đánh dấu. Rời khỏi vùng sáng trước khi sét đánh.", color: 0xffd93a },
      { label: "Mẹo", desc: "Bẫy cũng gây sát thương cho kẻ địch — hãy dụ chúng vào đó!", color: CYAN },
    ],
  },
  {
    tab: "Tiếp tế",
    title: "Thùng tiếp tế",
    intro: "Thùng tiếp tế xuất hiện giữa các đợt địch. Đánh vỡ để nhận vật phẩm hữu ích.",
    entries: [
      { label: "Hộp máu", desc: "Hồi phục máu cho anh hùng nhặt được.", icon: "item_health", color: 0xff6a8a },
      { label: "Pin năng lượng", desc: "Nạp năng lượng cho kỹ năng và tuyệt kỹ.", icon: "item_energy", color: CYAN },
      { label: "Tín dụng", desc: "Dùng để mua nâng cấp vĩnh viễn ở Xưởng Giáp.", icon: "item_coin", color: GOLD },
      { label: "Vật phẩm tăng sức", desc: "Thỉnh thoảng thùng chứa cả vật phẩm tăng sức hiếm.", icon: "item_chip", color: 0xb06cff },
    ],
  },
  {
    tab: "Phát triển",
    title: "Xưởng giáp & cấp anh hùng",
    intro: "Mọi trận đấu đều giúp bạn mạnh hơn, kể cả khi thất bại.",
    entries: [
      { label: "Xưởng Giáp", desc: "Dùng tín dụng mua nâng cấp vĩnh viễn: máu, sát thương, năng lượng, hồi chiêu, hồi sinh…", color: CYAN, icon: "item_chip" },
      { label: "Cấp anh hùng", desc: `Anh hùng nhận XP sau mỗi trận. Mỗi cấp +3% máu và sát thương (cấp ${HERO_MAX_LEVEL}: +${Math.round((levelBonus(HERO_MAX_LEVEL) - 1) * 100)}%).`, color: 0x7dffb0 },
      { label: "Thành tựu", desc: "Hoàn thành thử thách để nhận thêm tín dụng thưởng.", color: GOLD, icon: "item_coin" },
      { label: "Độ khó", desc: DIFFICULTIES.map((d) => `${d.name} x${d.reward}`).join(" · ") + " tín dụng nhận được.", color: 0xff4e5f },
    ],
  },
  {
    tab: "Chế độ",
    title: "Chế độ chơi",
    intro: "Mỗi chế độ là một thử thách khác nhau. Boss Rush mở khóa sau khi hoàn thành Màn 3.",
    entries: (["campaign", "endless", "bossrush", "pk", "training"] as const).map((m) => ({ label: MODE_INFO[m].name, desc: MODE_INFO[m].desc, color: MODE_INFO[m].color })),
  },
];

const CONTROLS: [string, string, string][] = [
  ["Di chuyển", "A / D", "← / →"],
  ["Nhảy (nhảy đôi)", "W / Space", "↑"],
  ["Lướt", "Shift / F", "↓ / Num0"],
  ["Đánh thường (combo)", "J", "Num1 / ,"],
  ["Kỹ năng 1", "K", "Num2 / ."],
  ["Kỹ năng 2", "L", "Num3 / /"],
  ["Tuyệt kỹ", "U / I", "Num4 / '"],
  ["Tạm dừng", "P / Esc", "P / Esc"],
];

const RANKS: [string, number, string][] = [
  ["D", 0x8fa6ba, "Khởi động"],
  ["C", 0x7dffb0, "Ổn định"],
  ["B", 0x18e6ff, "Hăng hái"],
  ["A", 0x7a8dff, "Ấn tượng"],
  ["S", 0xffe45c, "Siêu phàm"],
  ["SS", 0xff9a3a, "Huyền thoại"],
  ["SSS", 0xff4e5f, "Thần thánh"],
];

let lastPage = 0;

export class GuideScene extends MenuScreen {
  private page = 0;
  private tabs: Tile[] = [];
  private content!: Phaser.GameObjects.Container;
  private counter!: Phaser.GameObjects.Text;

  constructor() {
    super("menu_guide");
  }

  create() {
    this.tabs = [];
    this.setupScreen({ title: "HƯỚNG DẪN", subtitle: "ĐIỀU KHIỂN & CƠ CHẾ", hint: "A / D: đổi trang   ·   Chạm thẻ phía trên để chuyển nhanh   ·   Esc / K: quay lại" });
    const tw = (1208 - 8 * (PAGES.length - 1)) / PAGES.length;
    PAGES.forEach((p, i) => {
      const t = new Tile(this, 36 + i * (tw + 8), 96, tw, 40, { title: p.tab, titleSize: 14, align: "center", onPress: () => this.show(i) });
      t.onHover = () => t.setFocus(true);
      t.on("hoverout", () => t.setFocus(false));
      this.tabs.push(t);
    });
    panel(this, 36, 148, 1208, 524, { alpha: 0.86, stroke: CYAN, strokeAlpha: 0.22, radius: 18 });
    this.content = this.add.container(0, 0);
    const prev = new Tile(this, 1060, 616, 76, 40, { title: "‹", titleSize: 22, align: "center", onPress: () => this.show(this.page - 1) });
    const next = new Tile(this, 1148, 616, 76, 40, { title: "›", titleSize: 22, align: "center", onPress: () => this.show(this.page + 1) });
    [prev, next].forEach((t) => {
      t.onHover = () => t.setFocus(true);
      t.on("hoverout", () => t.setFocus(false));
    });
    this.counter = body(this, 1046, 636, "", 15, MUTED, { weight: "800" }).setOrigin(1, 0.5);
    this.page = -1;
    this.show(lastPage, true);
  }

  protected onDirection(dir: Dir) {
    if (dir === "left") this.show(this.page - 1);
    else if (dir === "right") this.show(this.page + 1);
    return true;
  }

  protected onConfirmKey() {
    this.show(this.page + 1);
    return true;
  }

  private show(i: number, silent = false) {
    const n = PAGES.length;
    const next = ((i % n) + n) % n;
    if (next === this.page) return;
    const dir = next > this.page ? 1 : -1;
    this.page = next;
    lastPage = next;
    if (!silent) sfx.select();
    this.tabs.forEach((t, j) => t.setSelected(j === next));
    this.counter.setText(`Trang ${next + 1}/${n}`);
    const c = this.content;
    c.removeAll(true);
    const p = PAGES[next];
    c.add(text(this, 64, 168, p.title, 30, "#ffffff", "900"));
    c.add(body(this, 64, 214, p.intro, 16, "#c8dcea", { wrap: 1150, lineSpacing: 6 }));
    if (p.custom === "controls") this.drawControls(c);
    else if (p.custom === "ranks") this.drawRanks(c);
    else this.drawEntries(c, p.entries ?? []);
    c.setAlpha(0).setX(dir * 30);
    this.tweens.add({ targets: c, alpha: 1, x: 0, duration: 220, ease: "Cubic.easeOut" });
  }

  private drawEntries(c: Phaser.GameObjects.Container, entries: Entry[]) {
    const cols = entries.length > 3 ? 2 : 1;
    const w = cols === 2 ? 560 : 1140;
    entries.forEach((e, i) => {
      const x = 64 + (i % cols) * (w + 20);
      const y = 284 + Math.floor(i / cols) * 92;
      const g = this.add.graphics();
      drawPanel(g, x, y, w, 80, { fill: 0x0d2236, alpha: 0.8, stroke: e.color ?? CYAN, strokeAlpha: 0.35, radius: 12 });
      g.fillStyle(e.color ?? CYAN, 1).fillRoundedRect(x + 10, y + 14, 5, 52, 2);
      c.add(g);
      let tx = x + 28;
      if (e.icon) {
        const img = this.add.image(x + 52, y + 40, e.icon);
        img.setScale(46 / Math.max(img.width, img.height));
        c.add(img);
        tx = x + 88;
      }
      c.add(text(this, tx, y + 12, e.label, 19, hex(e.color ?? CYAN), "900"));
      c.add(body(this, tx, y + 42, e.desc, 15, "#c8dcea", { wrap: x + w - tx - 16 }));
    });
  }

  private drawControls(c: Phaser.GameObjects.Container) {
    const cols = [
      { x: 360, label: "NGƯỜI CHƠI 1", color: CYAN },
      { x: 760, label: "NGƯỜI CHƠI 2", color: 0xff6a8a },
    ];
    cols.forEach((col) => c.add(text(this, col.x, 262, col.label, 15, hex(col.color), "900").setLetterSpacing(2)));
    CONTROLS.forEach(([action, p1, p2], i) => {
      const y = 296 + i * 38;
      if (i % 2 === 0) c.add(this.add.rectangle(64, y - 4, 1100, 36, 0xffffff, 0.04).setOrigin(0));
      c.add(body(this, 84, y + 4, action, 16, "#eaf8ff", { weight: "800" }));
      [p1, p2].forEach((keys, k) => this.keycaps(c, cols[k].x, y, keys, cols[k].color));
    });
  }

  private keycaps(c: Phaser.GameObjects.Container, x: number, y: number, keys: string, color: number) {
    let cx = x;
    keys.split(" / ").forEach((k, i) => {
      if (i > 0) {
        c.add(body(this, cx + 4, y + 5, "hoặc", 13, MUTED, { weight: "700" }));
        cx += 42;
      }
      const label = body(this, 0, 0, k, 15, "#02070d", { weight: "900" });
      const w = Math.max(30, label.width + 18);
      const g = this.add.graphics();
      g.fillStyle(color, 1).fillRoundedRect(cx, y, w, 28, 6);
      g.fillStyle(0x000000, 0.25).fillRect(cx + 3, y + 24, w - 6, 3);
      c.add(g);
      label.setPosition(cx + w / 2, y + 13).setOrigin(0.5);
      c.add(label);
      cx += w + 6;
    });
  }

  private drawRanks(c: Phaser.GameObjects.Container) {
    const w = 150;
    RANKS.forEach(([r, color, name], i) => {
      const x = 64 + i * (w + 15);
      const g = this.add.graphics();
      drawPanel(g, x, 300, w, 180, { fill: 0x0d2236, alpha: 0.85, stroke: color, strokeAlpha: 0.7, radius: 14 });
      c.add(g);
      c.add(this.add.image(x + w / 2, 370, "glow").setScale(1.3).setTint(color).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD));
      c.add(text(this, x + w / 2, 370, r, r.length > 2 ? 46 : 56, hex(color), "900").setOrigin(0.5));
      c.add(body(this, x + w / 2, 440, name, 16, "#eaf8ff", { weight: "800" }).setOrigin(0.5, 0));
      if (i < RANKS.length - 1) c.add(body(this, x + w + 7, 370, "›", 22, MUTED, { weight: "900" }).setOrigin(0.5));
    });
    c.add(body(this, 64, 508, "Điểm nhân theo hạng: hạng càng cao, hệ số càng lớn — SSS cho hệ số điểm tối đa.", 16, hex(GOLD), { weight: "800" }));
    c.add(body(this, 64, 540, "Đạt hạng S và SSS trong trận để mở khóa thành tựu Phong Cách S và Phong Cách SSS.", 15, "#c8dcea"));
  }
}
