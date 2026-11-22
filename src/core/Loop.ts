export class Loop {
  private frameId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private simTime = 0;
  private running = false;

  private static readonly FIXED_STEP = 1 / 60; // 60Hz physics/combat simulation tick (~16.6667ms)
  private static readonly MAX_SUB_STEPS = 3;   // Clamp to prevent spiral of death

  constructor(
    private readonly update: (deltaSeconds: number, elapsedSeconds: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    if (this.simTime === 0) {
      this.simTime = this.lastTime / 1000;
    }
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  /**
   * [Purpose]: Drives the fixed 60Hz timestep accumulator, stepping game updates before scheduling render frame.
   * @condition Executed continuously via requestAnimationFrame while loop state is active.
   * @param time High-resolution timestamp passed by requestAnimationFrame in milliseconds.
   * @returns Steps physics/game state in fixed 1/60s increments and triggers per-frame render callback.
   */
  private readonly tick = (time: number) => {
    if (!this.running) return;
    const deltaSeconds = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this.accumulator += deltaSeconds;

    let subSteps = 0;
    while (this.accumulator >= Loop.FIXED_STEP && subSteps < Loop.MAX_SUB_STEPS) {
      this.simTime += Loop.FIXED_STEP;
      this.update(Loop.FIXED_STEP, this.simTime);
      this.accumulator -= Loop.FIXED_STEP;
      subSteps++;
    }

    // Clamp remaining accumulator debt if frame fell too far behind
    if (this.accumulator >= Loop.FIXED_STEP) {
      this.accumulator = 0;
    }

    this.render();
    this.frameId = requestAnimationFrame(this.tick);
  };
}
