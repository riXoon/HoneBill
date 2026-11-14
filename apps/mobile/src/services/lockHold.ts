/**
 * Lets work that must not be cut off (a payment in flight) hold off the auto-lock. The lock waits for every hold to be
 * released, then runs, so leaving the app mid-transaction never aborts it or hides how it ended.
 */
let holds = 0;
const waiting = new Set<() => void>();

/** Starts a hold; call the returned function to release it. Releasing twice is harmless. */
export function holdLock(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) [...waiting].forEach((cb) => cb());
  };
}

export const isLockHeld = () => holds > 0;

/** Calls `cb` once, as soon as no hold is active (immediately if none is). Returns a cancel function. */
export function whenLockFree(cb: () => void): () => void {
  if (holds === 0) {
    cb();
    return () => {};
  }
  const once = () => {
    waiting.delete(once);
    cb();
  };
  waiting.add(once);
  return () => waiting.delete(once);
}
