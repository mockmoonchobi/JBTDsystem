// All same-origin tabs share a conservative rolling request budget. No tokens or
// spreadsheet contents are stored here. Reads/writes have independent budgets.
interface Budget { requests: number[]; until: number }
interface Environment {
  now: () => number; sleep: (ms: number) => Promise<void>;
  read: (key: string) => Budget | undefined; write: (key: string, value: Budget) => void;
  exclusive: <T>(key: string, work: () => T) => Promise<T>;
}
export function createSheetsQuota(env: Environment) {
  const keyFor = (method?: string) => 'jbtd-sheets-quota-v1:' + (!method || method === 'GET' ? 'read' : 'write');
  const budget = (key: string): Budget => {
    const v = env.read(key);
    return { requests: Array.isArray(v?.requests) ? v.requests.filter(n => Number.isFinite(n) && n > env.now() - 60000) : [], until: Number.isFinite(v?.until) ? v!.until : 0 };
  };
  return {
    async acquire(method?: string) {
      const key = keyFor(method);
      for (;;) {
        const wait = await env.exclusive(key, () => {
          const b = budget(key), now = env.now();
          const delay = Math.max(0, b.until - now, b.requests.length >= 45 ? b.requests[0] + 60000 - now : 0);
          if (!delay) { b.requests.push(now); env.write(key, b); }
          return delay;
        });
        if (!wait) return;
        await env.sleep(wait);
      }
    },
    async limited(method?: string, retryAfter?: string | null) {
      const key = keyFor(method);
      await env.exclusive(key, () => {
        const b = budget(key), seconds = Number(retryAfter);
        const delay = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) - env.now() : seconds * 1000;
        b.until = Math.max(b.until, env.now() + Math.max(60000, Number.isFinite(delay) ? delay : 0));
        env.write(key, b);
      });
    },
  };
}
const memory = new Map<string, Budget>();
let serial: Promise<unknown> = Promise.resolve();
const gate = createSheetsQuota({
  now: () => Date.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  read: key => { try { return JSON.parse(localStorage.getItem(key) || 'null') || memory.get(key); } catch { return memory.get(key); } },
  write: (key, value) => { memory.set(key, value); try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* same-window pacing remains available */ } },
  exclusive: (key, work) => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, work);
    const next = serial.catch(() => {}).then(work); serial = next; return next;
  },
});
export async function waitForSheetsQuota(url: string, method?: string) {
  if (typeof window !== 'undefined' && url.startsWith('https://sheets.googleapis.com/')) await gate.acquire(method);
}
export async function recordSheetsQuota(url: string, response: Response, method?: string) {
  if (typeof window !== 'undefined' && url.startsWith('https://sheets.googleapis.com/') && response.status === 429) await gate.limited(method, response.headers.get('Retry-After'));
}
