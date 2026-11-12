export class DoublePress {
  private lastPressAt: number | undefined;

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  press(): boolean {
    const at = this.now();
    const previous = this.lastPressAt;
    if (previous !== undefined && at - previous <= this.windowMs) {
      this.lastPressAt = undefined;
      return true;
    }
    this.lastPressAt = at;
    return false;
  }
}
