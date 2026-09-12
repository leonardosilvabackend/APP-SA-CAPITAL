// Deliberately no waiting queue: expensive searches must not starve ordinary API work.
let active = 0;
export function acquireSmartCapacity() {
  if (active >= 2) return null;
  active++;
  let released = false;
  return () => { if (!released) { released = true; active--; } };
}
export function smartCapacity() { return { active, maximum: 2 }; }

const running = new Map<string, Promise<unknown>>();
// Only share work still in progress. Completed results are never cached; reservation
// approval always rechecks stock. At most two distinct candidate snapshots exist.
export function shareSmartWork<T>(key: string, work: () => Promise<T>): Promise<T> | null {
  const existing = running.get(key);
  if (existing) return existing as Promise<T>;
  const release = acquireSmartCapacity();
  if (!release) return null;
  const task = Promise.resolve().then(work).finally(() => { running.delete(key); release(); });
  running.set(key, task);
  return task;
}
