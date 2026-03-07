type Raf = (callback: FrameRequestCallback) => number;
type Caf = (handle: number) => void;

export class ConnectedRenderQueue {
  private readonly renderGenerations = new WeakMap<HTMLElement, number>();
  private readonly renderFrames = new WeakMap<HTMLElement, number>();

  schedule(
    container: HTMLElement,
    wrapper: HTMLElement,
    run: () => void,
    options: {
      requestFrame?: Raf;
      cancelFrame?: Caf;
    } = {}
  ) {
    const requestFrame = options.requestFrame ?? requestAnimationFrame;
    const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
    const pendingFrame = this.renderFrames.get(container);
    if (typeof pendingFrame === "number") {
      cancelFrame(pendingFrame);
      this.renderFrames.delete(container);
    }

    const resume = () => {
      if (!wrapper.isConnected) {
        if (!container.isConnected) {
          this.renderFrames.delete(container);
          return;
        }
        const nextFrame = requestFrame(resume);
        this.renderFrames.set(container, nextFrame);
        return;
      }
      this.renderFrames.delete(container);
      run();
    };

    const frame = requestFrame(resume);
    this.renderFrames.set(container, frame);
  }

  bumpGeneration(container: HTMLElement): number {
    const generation = (this.renderGenerations.get(container) ?? 0) + 1;
    this.renderGenerations.set(container, generation);
    return generation;
  }

  isCurrentGeneration(container: HTMLElement, generation: number): boolean {
    return this.renderGenerations.get(container) === generation;
  }
}
