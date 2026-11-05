/**
 * Resolves after the next frame has been drawn. Await it right after a state change that must be visible
 * (a button turning to "Please wait…") and before any heavy synchronous work. React schedules the repaint as
 * its own task, and code that keeps running without yielding would hold that task back until it finished.
 */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Lets the event loop run once (touches, timers, repaints) between two heavy steps. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
