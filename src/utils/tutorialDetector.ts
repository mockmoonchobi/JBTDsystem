import { TempleInfo, Household, TempleProfile } from '../types';

/**
 * チュートリアルデータが端末上に残置しているかを判定する。
 *
 * トリガー条件（いずれか1つでも該当すれば true）:
 * １・寺院情報の寺院名と住所が本寺、兼務寺どちらか一方でもチュートリアルデータと一致すること
 *    - 本寺チュートリアル: 寺院名「圓福寺」、住所「東京都港区芝公園4-7-35」
 *    - 兼務寺チュートリアル: 寺院名「宝蔵寺」、住所「東京都品川区西五反田5-12-8」
 * ２・檀家名簿の檀家IDの頭が「DA」あるいは「D1」でかつ、電話番号に「●●●●」のレコードが混入していること
 */
export function isTutorialDataRemaining(
  temples: TempleProfile[] | TempleInfo[] = [],
  templeInfo?: TempleInfo,
  households: Household[] = []
): boolean {
  // トリガー1: 寺院情報の寺院名と住所が本寺、兼務寺どちらか一方でもチュートリアルデータと一致すること
  const checkTempleMatch = (t?: { name?: string; address?: string }) => {
    if (!t) return false;
    const name = (t.name || '').trim();
    const address = (t.address || '').trim();
    const isMainMatch = name === '圓福寺' && address === '東京都港区芝公園4-7-35';
    const isSubMatch = name === '宝蔵寺' && address === '東京都品川区西五反田5-12-8';
    return isMainMatch || isSubMatch;
  };

  const isTempleTutorial =
    checkTempleMatch(templeInfo) ||
    temples.some((t) => checkTempleMatch(t));

  if (isTempleTutorial) {
    return true;
  }

  // トリガー2: 檀家名簿の檀家IDの頭が「DA」あるいは「D1」でかつ、電話番号に「●●●●」のレコードが混入していること
  const hasMaskedCircles = (phoneStr?: string) => {
    if (!phoneStr) return false;
    // 「●●●●」(U+25CF)、「⚫⚫⚫⚫」(U+26AB)、「⚫️⚫️⚫️⚫️」(絵文字セレクタ付き)および4連続の伏字記号に対応
    return (
      phoneStr.includes('●●●●') ||
      phoneStr.includes('⚫⚫⚫⚫') ||
      phoneStr.includes('⚫️⚫️⚫️⚫️') ||
      /(?:[●⚫]|\uFE0F){4}/.test(phoneStr)
    );
  };

  const isHouseholdTutorial = households.some((h) => {
    const id = (h.id || '').toUpperCase();
    const isTargetId = id.startsWith('DA') || id.startsWith('D1');
    if (!isTargetId) return false;
    return hasMaskedCircles(h.phone) || hasMaskedCircles(h.mobile);
  });

  return isHouseholdTutorial;
}
