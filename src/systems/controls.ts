import Phaser from "phaser";

export type Action = "left" | "right" | "jump" | "dash" | "basic" | "skill1" | "skill2" | "ultimate";
export const ACTIONS: Action[] = ["left", "right", "jump", "dash", "basic", "skill1", "skill2", "ultimate"];

export interface Controls {
  poll(): void;
  down(action: Action): boolean;
  just(action: Action): boolean;
}

const K = Phaser.Input.Keyboard.KeyCodes;

const KEYMAP: Record<0 | 1, Record<Action, number[]>> = {
  0: {
    left: [K.A],
    right: [K.D],
    jump: [K.W, K.SPACE],
    dash: [K.SHIFT, K.F],
    basic: [K.J],
    skill1: [K.K],
    skill2: [K.L],
    ultimate: [K.U, K.I],
  },
  1: {
    left: [K.LEFT],
    right: [K.RIGHT],
    jump: [K.UP],
    dash: [K.DOWN, K.NUMPAD_ZERO],
    basic: [K.NUMPAD_ONE, K.COMMA],
    skill1: [K.NUMPAD_TWO, K.PERIOD],
    skill2: [K.NUMPAD_THREE, K.FORWARD_SLASH],
    ultimate: [K.NUMPAD_FOUR, K.QUOTES],
  },
};

// ---- Touch (DOM buttons in index.html, P1 only) ----
const touchHeld = new Set<string>();
const touchPressed = new Set<string>();

export const bindTouchControls = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-touch-action]").forEach((button) => {
    const action = button.dataset.touchAction!;
    const start = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      touchHeld.add(action);
      touchPressed.add(action);
      button.classList.add("is-pressed");
      navigator.vibrate?.(8);
    };
    const end = (event: PointerEvent) => {
      event.preventDefault();
      touchHeld.delete(action);
      button.classList.remove("is-pressed");
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("lostpointercapture", end);
    button.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  const reset = () => {
    touchHeld.clear();
    touchPressed.clear();
  };
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
};

export const consumeTouch = (action: string) => {
  const had = touchPressed.has(action);
  touchPressed.delete(action);
  return had;
};

export const setSceneFlag = (scene: string) => {
  document.body.dataset.scene = scene;
};

export class PlayerControls implements Controls {
  private keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private pressed = new Set<Action>();

  constructor(scene: Phaser.Scene, private index: 0 | 1) {
    const kb = scene.input.keyboard!;
    const map = KEYMAP[index];
    this.keys = Object.fromEntries(
      ACTIONS.map((a) => [a, map[a].map((code) => kb.addKey(code, true, false))]),
    ) as Record<Action, Phaser.Input.Keyboard.Key[]>;
  }

  /** Call once per frame before reading. */
  poll() {
    this.pressed.clear();
    for (const a of ACTIONS) {
      if (this.keys[a].some((k) => Phaser.Input.Keyboard.JustDown(k))) this.pressed.add(a);
      if (this.index === 0 && consumeTouch(a)) this.pressed.add(a);
    }
  }

  down(a: Action) {
    return this.keys[a].some((k) => k.isDown) || (this.index === 0 && touchHeld.has(a));
  }

  just(a: Action) {
    return this.pressed.has(a);
  }
}

export interface BotEntityRef {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  energy: number;
  facing: number;
  state: string;
  cooldowns: Record<string, number>;
  dead: boolean;
}

export class BotControls implements Controls {
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private lastTime = performance.now();
  private timer = 0;

  // Reaction delays per specification: Easy 400ms, Normal 250ms, Hard 150ms
  private readonly interval: number;

  constructor(
    private getBot: () => BotEntityRef | undefined,
    private getTarget: () => BotEntityRef | undefined,
    public difficulty: "easy" | "normal" | "hard" = "normal",
  ) {
    this.interval = difficulty === "easy" ? 0.4 : difficulty === "normal" ? 0.25 : 0.15;
  }

  poll() {
    this.pressed.clear();
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      this.decide();
    }
  }

  down(action: Action): boolean {
    return this.held.has(action);
  }

  just(action: Action): boolean {
    return this.pressed.has(action);
  }

  private trigger(action: Action) {
    this.pressed.add(action);
  }

  private decide() {
    const bot = this.getBot();
    const target = this.getTarget();
    if (!bot || !target || bot.dead || target.dead) {
      this.held.clear();
      return;
    }

    const dx = target.x - bot.x;
    const dist = Math.abs(dx);
    const targetAttacking = target.state === "attack" || target.state === "cast";
    const targetJustDashed = target.state === "dash" || (target.cooldowns.dash > 0.35);

    this.held.clear();

    // 1. Defend / Dodge reaction (Normal & Hard)
    if (this.difficulty !== "easy" && targetAttacking && dist < 170) {
      const dodgeChance = this.difficulty === "hard" ? 0.95 : 0.75;
      if (Math.random() < dodgeChance) {
        if (bot.cooldowns.dash <= 0) {
          // Dash away from opponent or through them
          if (dx > 0) this.held.add("left");
          else this.held.add("right");
          this.trigger("dash");
          return;
        } else {
          // Jump over attack if dash is on cooldown
          this.trigger("jump");
          return;
        }
      }
    }

    // 2. Punish opponent dash recovery (Hard mode specific)
    if (this.difficulty === "hard" && targetJustDashed && dist < 160) {
      // Dash towards opponent or cast skill immediately
      if (dx > 0) this.held.add("right");
      else this.held.add("left");

      if (bot.energy >= 35 && (bot.cooldowns.skill1 <= 0 || bot.cooldowns.skill2 <= 0)) {
        if (bot.cooldowns.skill1 <= 0) this.trigger("skill1");
        else this.trigger("skill2");
      } else {
        this.trigger("basic");
      }
      return;
    }

    // 3. Ultimate execution
    if (bot.energy >= 100 && dist < 320) {
      this.trigger("ultimate");
      return;
    }

    // 4. Movement and Spacing
    if (dist > 90) {
      if (dx > 0) this.held.add("right");
      else this.held.add("left");

      // Airborne target interception
      if (target.y < bot.y - 45 && dist < 180 && Math.random() < 0.6) {
        this.trigger("jump");
      }
    } else {
      // In close combat range
      // Face target
      if (dx > 0) this.held.add("right");
      else this.held.add("left");

      // Basic combo
      this.trigger("basic");

      // Weave skills if off cooldown and energy is available
      const skillChance = this.difficulty === "hard" ? 0.7 : this.difficulty === "normal" ? 0.45 : 0.2;
      if (bot.energy >= 35 && Math.random() < skillChance) {
        if (bot.cooldowns.skill1 <= 0) {
          this.trigger("skill1");
        } else if (bot.cooldowns.skill2 <= 0) {
          this.trigger("skill2");
        }
      }
    }
  }
}
