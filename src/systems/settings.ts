export type Settings = {
  v: 1;
  muted: boolean;
  volume: number;
  musicVolume: number;
  shake: boolean;
  damageNumbers: boolean;
  motionInterpolation: boolean;
  graphicsQuality: "high" | "balanced";
};

const KEY = "element-armor.settings.v1";

const DEFAULT_SETTINGS: Settings = {
  v: 1,
  muted: false,
  volume: 1,
  musicVolume: 0.75,
  shake: true,
  damageNumbers: true,
  motionInterpolation: true,
  graphicsQuality: "high",
};

let cachedSettings: Settings | null = null;

export const loadSettings = (): Settings => {
  if (cachedSettings) return { ...cachedSettings };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        cachedSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          v: 1,
        } as Settings;
        return { ...cachedSettings };
      }
    }
  } catch {
    // fallback to defaults on error
  }
  cachedSettings = { ...DEFAULT_SETTINGS };
  return { ...cachedSettings };
};

export const saveSettings = (patch: Partial<Settings>): Settings => {
  const current = loadSettings();
  const next: Settings = {
    ...current,
    ...patch,
    v: 1,
  };
  cachedSettings = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore local storage quota / private browsing errors
  }
  return { ...next };
};
