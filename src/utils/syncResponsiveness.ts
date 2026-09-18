/** Give input and paint tasks a turn during large read-only conversions. */
export function createSyncYield(now = () => performance.now(), pause = () => new Promise<void>(resolve => setTimeout(resolve, 0))) {
  let last = now();
  return () => {
    if (now() - last < 8) return undefined;
    return pause().then(() => { last = now(); });
  };
}
