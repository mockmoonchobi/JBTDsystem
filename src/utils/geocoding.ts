/**
 * 国土地理院（GSI）ジオコーディングおよび位置情報キャッシュユーティリティ
 * APIキー不要・完全無料で利用可能
 */

export interface LatLng {
  lat: number;
  lng: number;
}

// 代表的なダミー住所および主要エリアの静的プリセット座標（初回即時表示用キャッシュ）
const PRESET_COORDINATES: Record<string, LatLng> = {
  // 寺院
  '東京都港区芝公園4-7-35': { lat: 35.6581, lng: 139.7482 }, // 圓福寺（芝公園）
  '東京都品川区西五反田5-12-8': { lat: 35.6267, lng: 139.7153 }, // 宝蔵寺（西五反田）
  
  // 港区
  '東京都港区芝公園4-7-1': { lat: 35.6578, lng: 139.7485 },
  '東京都港区芝大門2-2-5': { lat: 35.6558, lng: 139.7533 },
  '東京都港区芝大門1-3-7': { lat: 35.6572, lng: 139.7541 },
  '東京都港区三田2-14-5': { lat: 35.6482, lng: 139.7425 },
  '東京都港区三田4-5-3': { lat: 35.6441, lng: 139.7398 },
  '東京都港区新橋4-20-3': { lat: 35.6645, lng: 139.7547 },
  '東京都港区東麻布1-11-5': { lat: 35.6552, lng: 139.7431 },
  '東京都港区芝3-18-2': { lat: 35.6521, lng: 139.7489 },
  '東京都港区高輪3-15-2': { lat: 35.6361, lng: 139.7342 },
  '東京都港区南青山4-10-8': { lat: 35.6638, lng: 139.7183 },
  '東京都港区虎ノ門1-7-3': { lat: 35.6698, lng: 139.7495 },
  '東京都港区白金台3-19-4': { lat: 35.6382, lng: 139.7247 },
  '東京都港区南麻布2-6-8': { lat: 35.6492, lng: 139.7351 },
  '東京都港区西新橋2-8-4': { lat: 35.6672, lng: 139.7511 },
  '東京都港区赤坂7-14-2': { lat: 35.6711, lng: 139.7325 },
  '東京都港区白金2-3-6': { lat: 35.6432, lng: 139.7291 },
  '東京都港区麻布十番2-9-5': { lat: 35.6548, lng: 139.7348 },
  '東京都港区海岸1-10-4': { lat: 35.6531, lng: 139.7612 },
  '東京都港区海岸1-10-8': { lat: 35.6535, lng: 139.7615 },

  // 品川区
  '東京都品川区上大崎3-1-4': { lat: 35.6342, lng: 139.7188 },
  '東京都品川区上大崎2-18-4': { lat: 35.6358, lng: 139.7162 },
  '東京都品川区東大井5-4-8': { lat: 35.6062, lng: 139.7381 },
  '東京都品川区東大井3-5-2': { lat: 35.6091, lng: 139.7402 },
  '東京都品川区北品川1-9-6': { lat: 35.6212, lng: 139.7395 },
  '東京都品川区平塚2-8-5': { lat: 35.6175, lng: 139.7121 },
  '東京都品川区大崎2-4-7': { lat: 35.6188, lng: 139.7265 },
  '東京都品川区大崎3-1-8': { lat: 35.6205, lng: 139.7241 },
  '東京都品川区西五反田5-18-2': { lat: 35.6258, lng: 139.7142 },
  '東京都品川区西五反田5-18-5': { lat: 35.6261, lng: 139.7145 },
  '東京都品川区西五反田4-14-3': { lat: 35.6272, lng: 139.7118 },
  '東京都品川区西五反田1-2-6': { lat: 35.6265, lng: 139.7225 },
  '東京都品川区西五反田3-8-4': { lat: 35.6288, lng: 139.7171 },
  '東京都品川区東五反田2-10-5': { lat: 35.6252, lng: 139.7268 },
  '東京都品川区小山3-7-8': { lat: 35.6211, lng: 139.7042 },
  '東京都品川区南品川2-6-7': { lat: 35.6112, lng: 139.7428 },
  '東京都品川区戸越1-12-4': { lat: 35.6162, lng: 139.7182 },
  '東京都品川区戸越1-12-7': { lat: 35.6165, lng: 139.7185 },
  '東京都品川区中延2-5-3': { lat: 35.6098, lng: 139.7135 },
  '東京都品川区荏原3-8-2': { lat: 35.6142, lng: 139.7088 },
  '東京都品川区大井1-15-7': { lat: 35.6078, lng: 139.7335 },

  // 渋谷・目黒・新宿・中央・世田谷など
  '東京都渋谷区広尾5-12-3': { lat: 35.6498, lng: 139.7215 },
  '東京都渋谷区広尾5-12-7': { lat: 35.6501, lng: 139.7218 },
  '東京都渋谷区神宮前5-22-3': { lat: 35.6668, lng: 139.7062 },
  '東京都渋谷区恵比寿西1-12-4': { lat: 35.6481, lng: 139.7065 },
  '東京都渋谷区恵比寿3-28-4': { lat: 35.6438, lng: 139.7192 },
  '東京都目黒区中目黒2-4-9': { lat: 35.6402, lng: 139.7018 },
  '東京都目黒区上目黒1-10-5': { lat: 35.6455, lng: 139.6995 },
  '東京都目黒区自由が丘1-16-5': { lat: 35.6085, lng: 139.6698 },
  '東京都中央区銀座6-15-2': { lat: 35.6685, lng: 139.7645 },
  '東京都中央区築地4-12-6': { lat: 35.6651, lng: 139.7712 },
  '東京都中央区新富1-7-5': { lat: 35.6718, lng: 139.7745 },
  '東京都中央区新川1-15-6': { lat: 35.6765, lng: 139.7825 },
  '東京都新宿区新宿3-20-8': { lat: 35.6912, lng: 139.7042 },
  '東京都新宿区神楽坂3-6-4': { lat: 35.7005, lng: 139.7412 },
  '東京都新宿区四谷2-5-7': { lat: 35.6868, lng: 139.7255 },
  '東京都新宿区四谷2-5-9': { lat: 35.6871, lng: 139.7258 },
  '東京都新宿区原町2-14-6': { lat: 35.6985, lng: 139.7231 },
  '東京都新宿区高田馬場2-22-4': { lat: 35.7135, lng: 139.7058 },
  '東京都世田谷区太子堂2-8-4': { lat: 35.6445, lng: 139.6735 },
  '東京都世田谷区桜新町1-10-6': { lat: 35.6318, lng: 139.6452 },
  '東京都世田谷区三軒茶屋1-18-4': { lat: 35.6412, lng: 139.6685 },
  '東京都世田谷区玉川3-15-8': { lat: 35.6128, lng: 139.6255 },
  '東京都世田谷区上馬2-7-5': { lat: 35.6395, lng: 139.6612 },
  '東京都文京区小石川2-15-3': { lat: 35.7118, lng: 139.7512 },
  '東京都文京区本郷4-12-5': { lat: 35.7075, lng: 139.7618 },
  '東京都文京区本駒込3-18-2': { lat: 35.7265, lng: 139.7535 },
  '東京都武蔵野市吉祥寺本町2-8-4': { lat: 35.7045, lng: 139.5788 },
};

const CACHE_KEY = 'temple_geocache_v1';

// ローカルストレージキャッシュの読み書き
function getCache(): Record<string, LatLng> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, LatLng>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

/**
 * 住所文字列の正規化（伏字の除去や丁目表記の補正）
 */
export function normalizeAddressForGeocoding(addr: string): string {
  if (!addr) return '';
  return addr
    .replace(/[⚫️●]/g, '') // 伏字除去
    .replace(/丁目/g, '-')
    .replace(/番地?/g, '-')
    .replace(/号/g, '')
    .replace(/-+/g, '-')
    .replace(/-$/, '')
    .trim();
}

/**
 * 国土地理院（GSI）アドレス検索APIを呼び出して緯度経度を取得
 */
export async function geocodeAddressWithGSI(rawAddress: string): Promise<LatLng | null> {
  const cleanAddr = rawAddress.trim();
  if (!cleanAddr) return null;

  // 1. 静的プリセットから確認
  if (PRESET_COORDINATES[cleanAddr]) {
    return PRESET_COORDINATES[cleanAddr];
  }

  // 2. ローカルキャッシュから確認
  const cache = getCache();
  if (cache[cleanAddr]) {
    return cache[cleanAddr];
  }

  // 3. 検索クエリ候補の生成（完全一致 ➜ 丁目レベル ➜ 町名レベル）
  const queryCandidates: string[] = [cleanAddr];
  
  // 丁目・番地表記のバリエーション
  const norm = normalizeAddressForGeocoding(cleanAddr);
  if (norm !== cleanAddr) {
    queryCandidates.push(norm);
  }

  // 番地を削って丁目まで（例: 東京都港区芝公園4丁目）
  const chomeMatch = cleanAddr.match(/^(.*?[都道府県].*?[市区町村].*?[0-9０-９]+丁目)/);
  if (chomeMatch && !queryCandidates.includes(chomeMatch[1])) {
    queryCandidates.push(chomeMatch[1]);
  }

  // 町名まで（例: 東京都港区芝公園）
  const townMatch = cleanAddr.match(/^(.*?[都道府県].*?[市区町村][^0-9０-９\-]+)/);
  if (townMatch && !queryCandidates.includes(townMatch[1])) {
    queryCandidates.push(townMatch[1]);
  }

  for (const q of queryCandidates) {
    try {
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        if (item.geometry && Array.isArray(item.geometry.coordinates)) {
          const [lng, lat] = item.geometry.coordinates;
          if (typeof lat === 'number' && typeof lng === 'number') {
            const coord: LatLng = { lat, lng };
            // キャッシュに保存
            cache[cleanAddr] = coord;
            saveCache(cache);
            return coord;
          }
        }
      }
    } catch (e) {
      console.warn(`GSI Geocode error for query: ${q}`, e);
    }
  }

  return null;
}

/**
 * 複数住所のバッチジオコーディング（レート制限に配慮した順次/並列実行）
 */
export async function batchGeocodeAddresses(
  addresses: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, LatLng>> {
  const result: Record<string, LatLng> = {};
  const cache = getCache();
  const missingAddresses: string[] = [];

  for (const addr of addresses) {
    const clean = addr.trim();
    if (!clean) continue;
    if (PRESET_COORDINATES[clean]) {
      result[clean] = PRESET_COORDINATES[clean];
    } else if (cache[clean]) {
      result[clean] = cache[clean];
    } else {
      missingAddresses.push(clean);
    }
  }

  let doneCount = addresses.length - missingAddresses.length;
  onProgress?.(doneCount, addresses.length);

  // 未取得のものをリクエスト（サーバーに優しくディレイ付き）
  for (const addr of missingAddresses) {
    const coord = await geocodeAddressWithGSI(addr);
    if (coord) {
      result[addr] = coord;
    }
    doneCount++;
    onProgress?.(doneCount, addresses.length);
    // 50ms ディレイ
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return result;
}
