import { Household, TempleInfo, TempleProfile } from '../types';

export interface HouseholdTempleMeta {
  id: string;
  name: string;
  mountainName?: string;
  fullName: string;
  isMain: boolean;
  isAffiliated: boolean;
  color?: string;
  badgeLabel: string;
  shortBadgeLabel: string;
}

/**
 * 檀家（世帯）が所属する寺院（本寺または兼務寺）のメタ情報を判定・取得します
 */
export function getHouseholdTempleMeta(
  household?: { templeId?: string } | null,
  temples: TempleProfile[] = [],
  mainTempleInfo?: TempleInfo
): HouseholdTempleMeta {
  const mainTemple = temples.find((t) => t.isMain) || temples[0];
  const mainTempleId = mainTemple?.id || mainTempleInfo?.id || 'temple-main';
  const mainTempleName = mainTemple?.name || mainTempleInfo?.name || '本寺';
  const mainMountain = mainTemple?.mountainName || mainTempleInfo?.mountainName || '';

  const hTempleId = household?.templeId || mainTempleId;

  // 対象の寺院を検索
  let matchedTemple = temples.find((t) => t.id === hTempleId);
  if (!matchedTemple && (hTempleId === 'temple-main' || hTempleId === mainTempleId)) {
    matchedTemple = mainTemple;
  }

  const isMain = Boolean(
    !matchedTemple ||
    matchedTemple.isMain ||
    matchedTemple.id === 'temple-main' ||
    matchedTemple.id === mainTempleId
  );
  const isAffiliated = !isMain;

  const templeId = matchedTemple?.id || (isMain ? mainTempleId : hTempleId);
  const name = matchedTemple?.name || (isMain ? mainTempleName : '兼務寺');
  const mountainName = matchedTemple?.mountainName || (isMain ? mainMountain : undefined);
  const fullName = mountainName ? `${mountainName} ${name}` : name;
  const color = matchedTemple?.color;

  const badgeLabel = isMain ? `本寺: ${name}` : `兼務: ${name}`;
  const shortBadgeLabel = isMain ? '本寺' : `兼務: ${name}`;

  return {
    id: templeId,
    name,
    mountainName,
    fullName,
    isMain,
    isAffiliated,
    color,
    badgeLabel,
    shortBadgeLabel,
  };
}

/**
 * 寺院一覧からID指定で寺院メタ情報を取得します
 */
export function getTempleMetaById(
  templeId: string | undefined,
  temples: TempleProfile[] = [],
  mainTempleInfo?: TempleInfo
): HouseholdTempleMeta {
  return getHouseholdTempleMeta({ templeId }, temples, mainTempleInfo);
}
