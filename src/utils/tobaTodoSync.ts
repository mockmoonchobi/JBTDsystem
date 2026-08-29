import { MemorialService, TempleTodo, PastRecord, TempleProfile, ServiceDeceasedTarget, ServiceTobaItem } from '../types';
import { getPreviousDay, normalizeDateInput, getTodayDateString } from './calendarUtils';

/**
 * 法要の全供養精霊リストを取得（メイン精霊 + 併修精霊）
 */
export const getAllServiceDeceasedList = (s: MemorialService): ServiceDeceasedTarget[] => {
  const list: ServiceDeceasedTarget[] = [];
  if (s.dharmaName || s.deceasedName || s.deceasedId) {
    list.push({
      id: s.deceasedId || 'main',
      dharmaName: s.dharmaName || '',
      deceasedName: s.deceasedName || '',
      memorialType: s.memorialType || '年忌法要',
      deathDate: (s as any).deathDate,
      isMain: true,
    });
  }
  if (s.additionalDeceased && Array.isArray(s.additionalDeceased)) {
    s.additionalDeceased.forEach((add, idx) => {
      list.push({
        id: add.id || `sub-${idx}`,
        dharmaName: add.dharmaName || '',
        deceasedName: add.deceasedName || '',
        memorialType: add.memorialType || '年忌法要',
        deathDate: add.deathDate,
        isMain: false,
      });
    });
  }
  return list;
};

/**
 * 複数回忌・法要種別の統合表示フォーマット（例: 一周忌・七回忌）
 */
export const formatServiceMemorialTypesDisplay = (s: MemorialService): string => {
  const types: string[] = [];
  if (s.memorialType && s.memorialType !== 'その他') {
    types.push(s.memorialType);
  }
  if (s.additionalDeceased && Array.isArray(s.additionalDeceased)) {
    s.additionalDeceased.forEach((add) => {
      if (add.memorialType && !types.includes(add.memorialType)) {
        types.push(add.memorialType);
      }
    });
  }
  if (types.length === 0) return s.memorialType || '法要';
  return types.join('・');
};

/**
 * 法要データから塔婆ToDo用のタイトル・志主概要・備考（明細）を生成
 */
export function buildTobaTodoInfo(
  service: MemorialService,
  pastRecords?: PastRecord[]
): {
  dharmaStr: string;
  sponsorsSummary: string;
  tobaDetailNotes: string;
  prevDay: string;
} {
  const todayStr = getTodayDateString();
  const normDate = normalizeDateInput(service.scheduledDate || '') || todayStr;
  const prevDay = getPreviousDay(normDate);

  const sponsorsSummary = (service.tobaItems && service.tobaItems.length > 0)
    ? service.tobaItems.map((item) => item.sponsorName).filter(Boolean).join('・')
    : (service.tobaSponsors || []).filter(Boolean).join('・') || service.chiefMourner || '施主';

  const deceasedSummary = getAllServiceDeceasedList(service);
  const dharmaStr = deceasedSummary.length > 0
    ? deceasedSummary.map((d) => `[${d.memorialType || service.memorialType}] ${d.dharmaName || d.deceasedName}`).join(' / ')
    : service.dharmaName || service.deceasedName || `${service.chiefMourner}様先祖代々`;

  let tobaDetailNotes = `法要: ${formatServiceMemorialTypesDisplay(service)}\n本数: ${service.tobaCount || 1}本${service.tobaType ? ` (${service.tobaType})` : ''}\n志主: ${sponsorsSummary}`;

  if (service.tobaItems && service.tobaItems.length > 0) {
    tobaDetailNotes += '\n【塔婆明細】\n' + service.tobaItems.map((item) => {
      const dName = item.dharmaName || item.tamegaki || service.dharmaName || '先祖代々';
      const mType = item.memorialType || service.memorialType || '';
      const sName = (item.sponsorName || service.chiefMourner || '施主').replace(/(家|様)+$/g, '').trim();
      return `${dName} ${mType} 志主 ${sName}`.replace(/\s+/g, ' ').trim();
    }).join('\n');
  } else if (service.tobaSponsors && service.tobaSponsors.length > 0) {
    const mainDharma = service.dharmaName || (service.deceasedId && pastRecords?.find((p) => p.id === service.deceasedId)?.dharmaName) || (service.chiefMourner ? `${service.chiefMourner.replace(/(家|様)+$/g, '')}家先祖代々` : '先祖代々');
    const mainMemorial = service.memorialType || '年忌法要';
    const addDeceased = service.additionalDeceased || [];

    tobaDetailNotes += '\n【塔婆明細】\n' + service.tobaSponsors.map((sp, idx) => {
      const targetDeceased = idx === 0 ? null : addDeceased[idx - 1];
      const dName = targetDeceased?.dharmaName || mainDharma;
      const mType = targetDeceased?.memorialType || mainMemorial;
      const sName = sp.replace(/(家|様)+$/g, '').trim() || service.chiefMourner?.replace(/(家|様)+$/g, '').trim() || '施主';
      return `${dName} ${mType} 志主 ${sName}`.replace(/\s+/g, ' ').trim();
    }).join('\n');
  }

  return {
    dharmaStr,
    sponsorsSummary,
    tobaDetailNotes,
    prevDay,
  };
}

/**
 * 法要の保存/更新時に塔婆ToDoの同期（追加/更新/削除）を計算・反映する共通関数
 */
export function syncTobaTodosList(
  service: MemorialService,
  currentTodos: TempleTodo[],
  options: {
    pastRecords?: PastRecord[];
    temples?: TempleProfile[];
    activeTempleId?: string;
    oldService?: MemorialService | null;
  } = {}
): TempleTodo[] {
  const { pastRecords = [], temples = [], activeTempleId = 'temple-main', oldService } = options;
  const todayStr = getTodayDateString();
  const tobaCount = Number(service.tobaCount) || (service.tobaItems?.length || 0);

  const { dharmaStr, sponsorsSummary, tobaDetailNotes, prevDay } = buildTobaTodoInfo(service, pastRecords);

  const oldPrevDay = oldService ? getPreviousDay(normalizeDateInput(oldService.scheduledDate || '') || todayStr) : null;
  const existingTobaTodo = currentTodos.find(
    (t) => (service.id && t.relatedServiceId === service.id) ||
           (oldService && t.relatedServiceId === oldService.id) ||
           (t.category === '塔婆揮毫' && service.householdId && t.householdId === service.householdId && (t.dueDate === prevDay || (oldPrevDay && t.dueDate === oldPrevDay)))
  );

  let resultTodos: TempleTodo[] = currentTodos;

  if (tobaCount > 0) {
    if (existingTobaTodo) {
      // 既存のToDoを更新
      const updated: TempleTodo = {
        ...existingTobaTodo,
        templeId: service.templeId || existingTobaTodo.templeId,
        title: `${dharmaStr} 塔婆作成`,
        dueDate: prevDay,
        householdId: service.householdId,
        householdHeadName: sponsorsSummary,
        relatedServiceId: service.id,
        notes: tobaDetailNotes,
      };
      resultTodos = currentTodos.map((t) => (t.id === existingTobaTodo.id ? updated : t));
    } else {
      // 新規ToDoを作成（一意のIDを保証）
      const newTobaTodo: TempleTodo = {
        id: `TD-TOBA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        templeId: service.templeId || (activeTempleId !== 'ALL' ? activeTempleId : (temples.find((t) => t.isMain)?.id || 'temple-main')),
        title: `${dharmaStr} 塔婆作成`,
        dueDate: prevDay,
        dueTime: '17:00',
        priority: 'high',
        category: '塔婆揮毫',
        completed: false,
        relatedServiceId: service.id,
        householdId: service.householdId,
        householdHeadName: sponsorsSummary,
        notes: tobaDetailNotes,
        createdAt: todayStr,
      };
      resultTodos = [newTobaTodo, ...currentTodos];
    }
  } else {
    // 塔婆本数が0本になった場合は関連ToDoを削除
    if (existingTobaTodo) {
      resultTodos = currentTodos.filter((t) => t.id !== existingTobaTodo.id);
    }
  }

  // 重複キーの防止（IDベースのユニーク化）
  const seenIds = new Set<string>();
  return resultTodos.filter((t) => {
    if (!t.id || seenIds.has(t.id)) return false;
    seenIds.add(t.id);
    return true;
  });
}
