/**
 * 郵便番号正規化および住所検索ユーティリティ
 */

// 全角数字・全角ハイフンを半角に正規化し、数字のみ抽出
export function extractPostalDigits(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[ーｰ―−‐-]/g, '')
    .replace(/[^\d]/g, '')
    .trim();
}

// 7桁の郵便番号を 123-4567 形式に整形
export function formatPostalCode(raw: string): string {
  const digits = extractPostalDigits(raw);
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return raw.trim();
}

export interface PostalLookupResult {
  success: boolean;
  address?: string;
  formattedPostalCode?: string;
  prefecture?: string;
  city?: string;
  town?: string;
  error?: string;
}

/**
 * 郵便番号から住所を検索（zipcloud APIを使用）
 * CORS対応・登録不要のオープンAPI
 */
export async function lookupAddressByPostalCode(rawPostalCode: string): Promise<PostalLookupResult> {
  const digits = extractPostalDigits(rawPostalCode);

  if (!digits) {
    return {
      success: false,
      error: '郵便番号を入力してください。',
    };
  }

  if (digits.length !== 7) {
    return {
      success: false,
      error: `郵便番号は7桁で入力してください（現在${digits.length}桁）。`,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒タイムアウト

    const response = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`,
      {
        method: 'GET',
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `サーバーエラーが発生しました (${response.status})。`,
      };
    }

    const data = await response.json();

    if (data.status !== 200) {
      return {
        success: false,
        error: data.message || '住所の検索に失敗しました。',
      };
    }

    if (!data.results || data.results.length === 0) {
      return {
        success: false,
        error: '該当する住所が見つかりませんでした。郵便番号をご確認ください。',
      };
    }

    // 先頭の候補を採用（同一郵便番号で複数町域がある場合も通常先頭または結合）
    const res = data.results[0];
    const prefecture = res.address1 || '';
    const city = res.address2 || '';
    const town = res.address3 && res.address3 !== '以下に掲載がない場合' ? res.address3 : '';
    const fullAddress = `${prefecture}${city}${town}`;

    return {
      success: true,
      address: fullAddress,
      formattedPostalCode: `${digits.slice(0, 3)}-${digits.slice(3)}`,
      prefecture,
      city,
      town,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: '通信がタイムアウトしました。通信環境をご確認ください。',
      };
    }
    console.error('Postal code lookup error:', err);
    return {
      success: false,
      error: '住所検索の通信に失敗しました。オフラインまたは接続制限をご確認ください。',
    };
  }
}
