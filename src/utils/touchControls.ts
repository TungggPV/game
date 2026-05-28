export type TouchAction =
  | "left"
  | "right"
  | "jump"
  | "basic"
  | "skill1"
  | "skill2"
  | "ultimate"
  | "slash"
  | "blast"
  | "dash";

const held = new Set<TouchAction>();
const justPressed = new Set<TouchAction>();

export const touchControls = {
  isHeld(action: TouchAction) {
    return held.has(action);
  },
  consumeJust(action: TouchAction) {
    return justPressed.has(action);
  },
  clearJust() {
    justPressed.clear();
  },
};

export const bindTouchControls = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-touch-action]").forEach((button) => {
    const action = button.dataset.touchAction as TouchAction | undefined;
    if (!action) return;

    const start = (event: Event) => {
      event.preventDefault();
      held.add(action);
      justPressed.add(action);
      button.classList.add("is-pressed");
    };

    const end = (event: Event) => {
      event.preventDefault();
      held.delete(action);
      button.classList.remove("is-pressed");
    };

    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });
};
