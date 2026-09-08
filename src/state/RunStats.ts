/** Score-keeping for the end card, plus one-shot hint flags. */
export class RunStats {
  answered = 0;
  joined = 0;
  lost = 0;
  fed = 0;
  chorus = 0;

  /** one-shot latches so a hint fires only once per run */
  readonly shown = new Set<string>();

  once(key: string): boolean {
    if (this.shown.has(key)) return false;
    this.shown.add(key);
    return true;
  }
}
