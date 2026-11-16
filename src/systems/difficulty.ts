export type DifficultyLevel = "easy" | "normal" | "hard";

export type DifficultyModifier = {
  hpMult: number;
  damageMult: number;
  telegraphMult: number;
  waveCountDelta: number;
  dodgeWindowMult: number;
};

export const DIFFICULTY_CONFIG: Record<DifficultyLevel, DifficultyModifier> = {
  easy: {
    hpMult: 0.8,
    damageMult: 0.7,
    telegraphMult: 1.2,
    waveCountDelta: -1,
    dodgeWindowMult: 1.2,
  },
  normal: {
    hpMult: 1.0,
    damageMult: 1.0,
    telegraphMult: 1.0,
    waveCountDelta: 0,
    dodgeWindowMult: 1.0,
  },
  hard: {
    hpMult: 1.25,
    damageMult: 1.3,
    telegraphMult: 0.85,
    waveCountDelta: 1,
    dodgeWindowMult: 0.85,
  },
};

const STORAGE_KEY = "element-armor.difficulty";

const loadStoredDifficulty = (): DifficultyLevel => {
  try {
    const val = localStorage.getItem(STORAGE_KEY) as DifficultyLevel | null;
    if (val === "easy" || val === "normal" || val === "hard") {
      return val;
    }
  } catch {
    // fallback
  }
  return "normal";
};

let currentDifficulty: DifficultyLevel = loadStoredDifficulty();

export const getDifficulty = (): DifficultyLevel => currentDifficulty;

export const setDifficulty = (lvl: DifficultyLevel) => {
  currentDifficulty = lvl;
  try {
    localStorage.setItem(STORAGE_KEY, lvl);
  } catch {
    // storage unavailable
  }
};

export const getDifficultyModifiers = (): DifficultyModifier => {
  return DIFFICULTY_CONFIG[currentDifficulty];
};
