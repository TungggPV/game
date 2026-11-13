import Phaser from "phaser";

export type Action = "left" | "right" | "jump" | "dash" | "basic" | "skill1" | "skill2" | "ultimate";
export const ACTIONS: Action[] = ["left", "right", "jump", "dash", "basic", "skill1", "skill2", "ultimate"];

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

export class PlayerControls {
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
