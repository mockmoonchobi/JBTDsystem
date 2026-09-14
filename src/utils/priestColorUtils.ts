import { Priest } from '../types';

export interface PriestColorOption {
  key: string;
  name: string;
  hex: string;
  bgLight: string;
  borderLight: string;
  textDark: string;
  badgeBg: string;
  badgeText: string;
}

export const PRIEST_COLOR_PALETTE: PriestColorOption[] = [
  {
    key: 'indigo',
    name: '藍色 (インディゴ)',
    hex: '#1E40AF',
    bgLight: 'bg-blue-50',
    borderLight: 'border-blue-300',
    textDark: 'text-blue-900',
    badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
    badgeText: 'text-blue-800',
  },
  {
    key: 'emerald',
    name: '翡翠 (エメラルド)',
    hex: '#047857',
    bgLight: 'bg-emerald-50',
    borderLight: 'border-emerald-300',
    textDark: 'text-emerald-900',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    badgeText: 'text-emerald-800',
  },
  {
    key: 'amber',
    name: '琥珀 (アンバー)',
    hex: '#B45309',
    bgLight: 'bg-amber-50',
    borderLight: 'border-amber-300',
    textDark: 'text-amber-900',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeText: 'text-amber-800',
  },
  {
    key: 'purple',
    name: '紫苑 (パープル)',
    hex: '#6D28D9',
    bgLight: 'bg-purple-50',
    borderLight: 'border-purple-300',
    textDark: 'text-purple-900',
    badgeBg: 'bg-purple-100 text-purple-900 border-purple-300',
    badgeText: 'text-purple-800',
  },
  {
    key: 'crimson',
    name: '茜・深緋 (クリムゾン)',
    hex: '#B91C1C',
    bgLight: 'bg-rose-50',
    borderLight: 'border-rose-300',
    textDark: 'text-rose-900',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
    badgeText: 'text-rose-800',
  },
  {
    key: 'teal',
    name: '藍鉄 (ティール)',
    hex: '#0F766E',
    bgLight: 'bg-teal-50',
    borderLight: 'border-teal-300',
    textDark: 'text-teal-900',
    badgeBg: 'bg-teal-100 text-teal-900 border-teal-300',
    badgeText: 'text-teal-800',
  },
  {
    key: 'rust',
    name: '弁柄・唐茶 (テラコッタ)',
    hex: '#C2410C',
    bgLight: 'bg-orange-50',
    borderLight: 'border-orange-300',
    textDark: 'text-orange-900',
    badgeBg: 'bg-orange-100 text-orange-900 border-orange-300',
    badgeText: 'text-orange-800',
  },
  {
    key: 'slate',
    name: '墨黒・濃藍 (スレート)',
    hex: '#334155',
    bgLight: 'bg-slate-50',
    borderLight: 'border-slate-300',
    textDark: 'text-slate-900',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
    badgeText: 'text-slate-800',
  },
];

/**
 * 僧侶IDまたは名前から一貫した色を取得
 */
export function getPriestColor(priestId?: string, priests?: Priest[], fallbackIndex?: number): string {
  if (!priestId) return '#64748B'; // 未定・未割当はスレートグレー

  if (priests && priests.length > 0) {
    const p = priests.find((item) => item.id === priestId || item.name === priestId);
    if (p && p.color) {
      return p.color;
    }
    const idx = priests.findIndex((item) => item.id === priestId || item.name === priestId);
    if (idx !== -1) {
      return PRIEST_COLOR_PALETTE[idx % PRIEST_COLOR_PALETTE.length].hex;
    }
  }

  if (fallbackIndex !== undefined && fallbackIndex >= 0) {
    return PRIEST_COLOR_PALETTE[fallbackIndex % PRIEST_COLOR_PALETTE.length].hex;
  }

  // 文字列ハッシュでフォールバック
  let hash = 0;
  for (let i = 0; i < priestId.length; i++) {
    hash = (hash << 5) - hash + priestId.charCodeAt(i);
    hash |= 0;
  }
  const pos = Math.abs(hash) % PRIEST_COLOR_PALETTE.length;
  return PRIEST_COLOR_PALETTE[pos].hex;
}

/**
 * カラーHEXからパレットオプションまたは生成スタイルを取得
 */
export function getPriestColorStyle(hexColor: string) {
  const match = PRIEST_COLOR_PALETTE.find((c) => c.hex.toLowerCase() === hexColor.toLowerCase());
  if (match) {
    return match;
  }
  // カスタムHEX用の汎用フォールバック
  return {
    key: 'custom',
    name: 'カスタム色',
    hex: hexColor,
    bgLight: 'bg-gray-50',
    borderLight: 'border-gray-300',
    textDark: 'text-gray-900',
    badgeBg: 'bg-gray-100 text-gray-800 border-gray-300',
    badgeText: 'text-gray-800',
  };
}

/**
 * 選択中寺院の住職が最上位に来るように僧侶一覧を並び替える
 */
export function sortPriestsForTemple(
  priests: Priest[],
  templeId: string,
  chiefPriestName?: string
): Priest[] {
  const list = [...priests];
  const cleanChief = (chiefPriestName || '').trim();

  return list.sort((a, b) => {
    // 1. 選択中寺院の住職かどうか
    const aIsChiefOfTemple =
      (cleanChief && a.name.trim() === cleanChief) ||
      (a.templeId === templeId && (a.isAutoChief || a.role.includes('住職')));
    const bIsChiefOfTemple =
      (cleanChief && b.name.trim() === cleanChief) ||
      (b.templeId === templeId && (b.isAutoChief || b.role.includes('住職')));

    if (aIsChiefOfTemple && !bIsChiefOfTemple) return -1;
    if (!aIsChiefOfTemple && bIsChiefOfTemple) return 1;

    // 2. 選択中寺院に所属しているか
    const aInTemple = a.templeId === templeId;
    const bInTemple = b.templeId === templeId;
    if (aInTemple && !bInTemple) return -1;
    if (!aInTemple && bInTemple) return 1;

    // 3. 本寺の住職かどうか
    if (a.isMainChief && !b.isMainChief) return -1;
    if (!a.isMainChief && b.isMainChief) return 1;

    // 4. 役職の優先度（住職 > 副住職 > 衆僧 > 助法）
    const getRolePriority = (role: string = '') => {
      if (role.includes('住職')) return 1;
      if (role.includes('副住職')) return 2;
      if (role.includes('僧') || role.includes('法師')) return 3;
      return 4;
    };
    const prioA = getRolePriority(a.role);
    const prioB = getRolePriority(b.role);
    if (prioA !== prioB) return prioA - prioB;

    return a.name.localeCompare(b.name, 'ja');
  });
}

/**
 * 僧侶の背景色に対する最適な文字色（明暗に応じた白または濃色）を返す
 */
export function getPriestTextColor(hexColor?: string): string {
  if (!hexColor) return '#FFFFFF';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length !== 6) return '#FFFFFF';
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  // 輝度計算
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1E293B' : '#FFFFFF';
}

/**
 * 予定種別に応じた担当候補僧侶のフィルタリング
 * - 棚経（isTanagyo === true）: 全ての僧侶
 * - 法事・葬儀等の通常檀務: isDanmu !== false の僧侶
 */
export function filterDanmuPriests(priests: Priest[], isTanagyo: boolean = false): Priest[] {
  if (isTanagyo) {
    return priests;
  }
  return priests.filter((p) => p.isDanmu !== false);
}
