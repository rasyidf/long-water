import type { Input } from "./Input";

/** Maps real keyboard events onto the core `Input` controller. WASD/arrows
 *  just land as ordinary held keys — `Input.moveAxis()` reads them; Escape
 *  and R are one-shot actions dispatched straight through instead. */
export class KeyboardMapper {
  constructor(private readonly input: Input) {}

  attach(): void {
    addEventListener("keydown", this.handleDown);
    addEventListener("keyup", this.handleUp);
  }

  detach(): void {
    removeEventListener("keydown", this.handleDown);
    removeEventListener("keyup", this.handleUp);
  }

  private handleDown = (e: KeyboardEvent): void => {
    if (e.code === "Escape") {
      this.input.requestPause();
      return;
    }
    this.input.setKey(e.code, true);
    // a focused menu button owns Space as its own click — don't eat the
    // keystroke, or Space can never activate "New Game" et al.
    if (e.code === "Space" && document.activeElement === document.body)
      e.preventDefault();
    if (e.code === "KeyR") this.input.requestRestart();
  };

  private handleUp = (e: KeyboardEvent): void => {
    this.input.setKey(e.code, false);
  };
}
