import { ENEMIES, type EnemyDef } from "./content";
import { HEROES, type HeroDef } from "./heroes";

export type CodexEntry = {
  id: string;
  name: string;
  category: "hero" | "enemy";
  elementOrRole: string;
  desc: string;
  stats: string;
};

export const CODEX_ENTRIES: CodexEntry[] = [
  ...HEROES.map((h: HeroDef): CodexEntry => ({
    id: h.id,
    name: h.name,
    category: "hero",
    elementOrRole: `${h.element.toUpperCase()} · ${h.role}`,
    desc: `Chiến binh Giáp Hào Quang sử dụng năng lượng ${h.element}. Đòn cơ bản: ${h.basic.name}.`,
    stats: `HP ${h.hp} | Tốc ${h.speed} | Công ${h.power}x`,
  })),
  ...Object.values(ENEMIES).map((e: EnemyDef): CodexEntry => ({
    id: e.type,
    name: e.name,
    category: "enemy",
    elementOrRole: e.flying ? "Không kích" : e.type === "boss" ? "Trùm Tối Thượng" : "Quái Chiến Binh",
    desc: `Kẻ thù trong khu vực chiến sự. ${e.type === "aegis" ? "Sở hữu khiên chặn đòn trực diện." : e.type === "boss" ? "Khổng lồ với các đòn đập rung chuyển sàn đấu." : "Tấn công dồn dập theo bầy đàn."}`,
    stats: `HP ${e.hp} | Tốc ${e.speed} | Sát thương ${e.damage}`,
  })),
];
