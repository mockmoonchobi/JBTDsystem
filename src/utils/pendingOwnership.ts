// Each page lifetime has a different owner, including after a refresh.
const owner = crypto.randomUUID();
let ready: Promise<string> | undefined;
export function pendingOwner(): Promise<string> {
  return ready ||= (async () => {
    if (typeof window === 'undefined') return owner;
    if (!navigator.locks) throw new Error('未送信操作のタブを確認できません。');
    await new Promise<void>((resolve, reject) => {
      navigator.locks.request('jbtd-pending-owner-' + owner, () => {
        resolve(); return new Promise<void>(() => {});
      }).catch(reject);
    });
    return owner;
  })();
}
export async function isClosedPendingOwner(id?: string): Promise<boolean> {
  // Legacy entries predate ownership. Their discard on startup is explicitly authorized.
  if (!id) return true;
  if (id === owner) return false;
  if (typeof window === 'undefined') return true;
  if (!navigator.locks) return false;
  return navigator.locks.request('jbtd-pending-owner-' + id, {ifAvailable:true}, lock => !!lock);
}
