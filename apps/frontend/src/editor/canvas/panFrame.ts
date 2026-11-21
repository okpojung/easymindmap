export interface LatestFrameQueueDeps<T> {
  requestFrame: (cb: () => void) => number;
  cancelFrame: (id: number) => void;
  apply: (value: T) => void;
}

export interface LatestFrameQueue<T> {
  push(value: T): void;
  flush(): void;
  cancel(): void;
}

export function createLatestFrameQueue<T>(deps: LatestFrameQueueDeps<T>): LatestFrameQueue<T> {
  const { requestFrame, cancelFrame, apply } = deps;
  let frameId: number | null = null; // null (not 0) means no frame scheduled
  let hasPending = false;
  let pending: T | undefined;
  let generation = 0;

  const take = (): { value: T } | null => {
    if (!hasPending) return null;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    return { value };
  };

  const run = (gen: number): void => {
    if (gen !== generation) return; // stale callback after cancel/flush
    frameId = null; // clear before apply so reentrant push can schedule
    const item = take();
    if (item) apply(item.value);
  };

  return {
    push(value: T): void {
      pending = value;
      hasPending = true;
      if (frameId !== null) return;
      const gen = generation;
      frameId = requestFrame(() => run(gen));
    },
    flush(): void {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
        generation++; // invalidate the cancelled callback
      }
      const item = take();
      if (item) apply(item.value); // no new frame scheduled
    },
    cancel(): void {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      generation++;
      pending = undefined;
      hasPending = false;
    },
  };
}
