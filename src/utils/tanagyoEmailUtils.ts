/**
 * お盆棚経巡回計画のメール送信・HTML表生成ユーティリティ
 * スマホ版の巡回計画レイアウトに合わせたHTML形式の表を生成します。
 */

import { Household, TempleInfo, TempleProfile, PastRecord, Priest } from '../types';
import { getHouseholdNiibonStatus } from './memorialCalculator';

export interface TanagyoDateSlotGroup {
  date: string;
  totalInDate: number;
  slots: {
    timeSlot: string;
    households: Household[];
  }[];
}

export interface GenerateTanagyoEmailOptions {
  priestName: string;
  priestRole?: string;
  priestEmail?: string;
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  dateGroups: TanagyoDateSlotGroup[];
  totalCount: number;
  pastRecords?: PastRecord[];
  appUrl?: string;
}

/**
 * 寺院名解決ヘルパー（兼務寺などの名称解決）
 */
function getTempleName(templeId: string | undefined, temples: TempleProfile[] = [], defaultName: string = ''): string {
  if (!templeId) return defaultName;
  const found = temples.find((t) => t.id === templeId);
  return found?.name || defaultName;
}

/**
 * スマホ版巡回計画と同じデザインのHTML形式の表を生成する
 */
export function generateTanagyoEmailHtml(options: GenerateTanagyoEmailOptions): string {
  const {
    priestName,
    priestRole,
    templeInfo,
    temples = [],
    dateGroups,
    totalCount,
    pastRecords = [],
    appUrl,
  } = options;

  const bonSeason = templeInfo.bonSeason || '8月盆';
  const currentDateStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const mainTempleName = templeInfo.mountainName
    ? `${templeInfo.mountainName} ${templeInfo.name}`
    : templeInfo.name;

  let sectionsHtml = '';

  for (const dGroup of dateGroups) {
    let slotsHtml = '';

    for (const slot of dGroup.slots) {
      let rowsHtml = '';

      slot.households.forEach((h, idx) => {
        const orderNum = h.tanagyoOrder ?? idx + 1;
        const address = h.tanagyoAddress || h.address || '住所未登録';
        const templeName = getTempleName(h.templeId, temples, templeInfo.name);
        const niibonStatus = getHouseholdNiibonStatus(pastRecords, h.id, bonSeason);
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        const phone = h.phone || h.mobile || '';

        // 新盆バッジ
        let niibonBadge = '';
        if (niibonStatus.isCurrentYearNiibon) {
          niibonBadge = `<span style="display:inline-block;padding:2px 6px;font-size:11px;font-weight:bold;color:#78350f;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:3px;margin-left:6px;">${niibonStatus.currentYearLabel}</span>`;
        } else if (niibonStatus.isNextYearNiibon) {
          niibonBadge = `<span style="display:inline-block;padding:2px 6px;font-size:11px;font-weight:bold;color:#075985;background-color:#e0f2fe;border:1px solid #7dd3fc;border-radius:3px;margin-left:6px;">${niibonStatus.nextYearLabel}</span>`;
        }

        const phoneLink = phone
          ? `<a href="tel:${phone.replace(/[^0-9]/g, '')}" style="color:#1d4ed8;text-decoration:none;font-weight:bold;font-family:monospace;">📞 ${phone}</a>`
          : `<span style="color:#9ca3af;">-</span>`;

        const mapBtn = address && address !== '住所未登録'
          ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:4px 9px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:11px;font-weight:bold;border-radius:3px;white-space:nowrap;">📍 地図を開く</a>`
          : `<span style="color:#9ca3af;font-size:11px;">住所未登録</span>`;

        rowsHtml += `
          <tr style="border-bottom:1px solid #e5e7eb;background-color:${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
            <td style="padding:10px 8px;text-align:center;font-weight:bold;color:#8c2d19;font-size:13px;width:38px;border-right:1px solid #e5e7eb;vertical-align:middle;">
              <div style="width:26px;height:26px;line-height:26px;border-radius:50%;background-color:#faf7f0;border:1px solid #d4af37;text-align:center;margin:0 auto;font-size:12px;font-weight:900;">
                ${orderNum}
              </div>
            </td>
            <td style="padding:10px 10px;vertical-align:top;border-right:1px solid #e5e7eb;">
              <div style="font-size:14px;font-weight:bold;color:#111827;line-height:1.4;">
                ${h.familyHead} <span style="font-size:12px;font-weight:normal;color:#4b5563;">様</span>
                ${niibonBadge}
              </div>
              <div style="margin-top:3px;font-size:11px;color:#4b5563;">
                <span style="display:inline-block;background-color:#f3f4f6;border:1px solid #e5e7eb;padding:1px 5px;border-radius:2px;font-weight:bold;color:#374151;">
                  ${templeName}
                </span>
              </div>
            </td>
            <td style="padding:10px 10px;vertical-align:top;border-right:1px solid #e5e7eb;font-size:12px;color:#374151;line-height:1.4;">
              <div style="color:#111827;margin-bottom:3px;">
                ${address}
              </div>
              <div>${mapBtn}</div>
            </td>
            <td style="padding:10px 10px;vertical-align:middle;text-align:left;font-size:12px;white-space:nowrap;">
              ${phoneLink}
            </td>
          </tr>
        `;
      });

      slotsHtml += `
        <div style="margin-bottom:16px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;background-color:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <div style="background-color:#faf7f0;border-bottom:2px solid #d4af37;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;font-weight:bold;color:#8c2d19;">
              ⏰ ${dGroup.date} ${slot.timeSlot} （${slot.households.length} 軒）
            </span>
          </div>
          <table style="width:100%;border-collapse:collapse;text-align:left;font-family:sans-serif;" cellpadding="0" cellspacing="0">
            <thead>
              <tr style="background-color:#f3f4f6;color:#374151;font-size:11px;border-bottom:1px solid #d1d5db;">
                <th style="padding:7px 6px;text-align:center;width:38px;border-right:1px solid #e5e7eb;">順</th>
                <th style="padding:7px 10px;border-right:1px solid #e5e7eb;">施主名</th>
                <th style="padding:7px 10px;border-right:1px solid #e5e7eb;">訪問先住所 / GoogleMap</th>
                <th style="padding:7px 10px;">電話番号</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    sectionsHtml += `
      <div style="margin-bottom:24px;">
        <div style="background-color:#2b2724;color:#ffffff;padding:8px 14px;border-radius:4px 4px 0 0;border-left:5px solid #d4af37;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:space-between;">
          <span>📅 訪問日: ${dGroup.date}</span>
          <span style="background-color:rgba(0,0,0,0.4);color:#d4af37;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;">
            計 ${dGroup.totalInDate} 軒
          </span>
        </div>
        <div style="padding-top:10px;">
          ${slotsHtml}
        </div>
      </div>
    `;
  }

  const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>【棚経巡回計画】${priestName} 師</title>
</head>
<body style="margin:0;padding:16px;background-color:#f4f4f5;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Sans', 'Noto Sans JP', sans-serif;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <!-- ヘッダー -->
    <div style="background-color:#1a1a1a;color:#ffffff;padding:16px 20px;border-bottom:3px solid #d4af37;">
      <div style="font-size:12px;color:#d4af37;font-weight:bold;letter-spacing:1px;margin-bottom:4px;">
        ${mainTempleName}
      </div>
      <div style="font-size:18px;font-weight:bold;color:#f9fafb;margin-bottom:6px;">
        【お盆棚経】巡回計画・訪問先一覧
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:#d1d5db;border-top:1px solid #374151;padding-top:8px;margin-top:6px;">
        <div>
          担当僧侶: <strong style="color:#ffffff;font-size:15px;">${priestName} 師</strong>
          ${priestRole ? `<span style="font-size:11px;color:#9ca3af;margin-left:4px;">(${priestRole})</span>` : ''}
        </div>
        <div>
          巡回予定総数: <strong style="color:#d4af37;font-size:15px;">${totalCount}</strong> 軒
        </div>
      </div>
    </div>

    <!-- 案内文 -->
    <div style="padding:14px 20px;background-color:#fffbeb;border-bottom:1px solid #fef3c7;font-size:12px;color:#92400e;line-height:1.5;">
      💡 スマホから各檀家様の「📍 地図を開く」をタップすると、Google Mapsで目的地ピンとルート案内がすぐに起動します。
    </div>

    <!-- コンテンツエリア -->
    <div style="padding:20px;">
      ${sectionsHtml || '<p style="text-align:center;color:#6b7280;padding:20px;">巡回予定の世帯がありません。</p>'}
    </div>

    <!-- フッター -->
    <div style="background-color:#fafaf9;border-top:1px solid #e5e7eb;padding:14px 20px;font-size:11px;color:#6b7280;text-align:center;line-height:1.6;">
      <div><strong>${mainTempleName}</strong></div>
      ${templeInfo.address ? `<div>住所: ${templeInfo.address}</div>` : ''}
      ${templeInfo.phone ? `<div>電話番号: ${templeInfo.phone}</div>` : ''}
      <div style="margin-top:4px;color:#9ca3af;">出力日: ${currentDateStr}</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return emailHtml;
}

/**
 * プレーンテキスト版のメール本文を生成する
 */
export function generateTanagyoEmailPlainText(options: GenerateTanagyoEmailOptions): string {
  const {
    priestName,
    priestRole,
    templeInfo,
    temples = [],
    dateGroups,
    totalCount,
    pastRecords = [],
  } = options;

  const bonSeason = templeInfo.bonSeason || '8月盆';
  const mainTempleName = templeInfo.mountainName
    ? `${templeInfo.mountainName} ${templeInfo.name}`
    : templeInfo.name;

  let text = `【お盆棚経 巡回計画・訪問先一覧】\n`;
  text += `寺院: ${mainTempleName}\n`;
  text += `担当僧侶: ${priestName} 師 ${priestRole ? `(${priestRole})` : ''}\n`;
  text += `総訪問件数: ${totalCount} 軒\n`;
  text += `出力日: ${new Date().toLocaleDateString('ja-JP')}\n`;
  text += `-------------------------------------------\n\n`;

  for (const dGroup of dateGroups) {
    text += `■ 訪問日: ${dGroup.date} (計 ${dGroup.totalInDate} 軒)\n`;

    for (const slot of dGroup.slots) {
      text += `\n▼ ${slot.timeSlot} (${slot.households.length} 軒)\n`;

      slot.households.forEach((h, idx) => {
        const orderNum = h.tanagyoOrder ?? idx + 1;
        const address = h.tanagyoAddress || h.address || '住所未登録';
        const templeName = getTempleName(h.templeId, temples, templeInfo.name);
        const niibonStatus = getHouseholdNiibonStatus(pastRecords, h.id, bonSeason);
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        const phone = h.phone || h.mobile || '未登録';

        let niibonStr = '';
        if (niibonStatus.isCurrentYearNiibon) niibonStr = ` [${niibonStatus.currentYearLabel}]`;
        if (niibonStatus.isNextYearNiibon) niibonStr = ` [${niibonStatus.nextYearLabel}]`;

        text += `${orderNum}. ${h.familyHead} 様 (${templeName})${niibonStr}\n`;
        text += `   住所: ${address}\n`;
        text += `   地図: ${mapUrl}\n`;
        text += `   電話: ${phone}\n`;
      });
    }
    text += `\n`;
  }

  text += `-------------------------------------------\n`;
  text += `${mainTempleName}\n`;
  if (templeInfo.phone) text += `TEL: ${templeInfo.phone}\n`;

  return text;
}

/**
 * リッチテキスト(HTML)とプレーンテキストの両方をクリップボードにコピーする
 */
export async function copyHtmlToClipboard(htmlContent: string, plainText: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      const blobHtml = new Blob([htmlContent], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const item = new window.ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn('ClipboardItem failed, falling back to plain text writeText', err);
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(plainText);
      return true;
    }
  } catch (err2) {
    console.error('All clipboard operations failed', err2);
  }

  return false;
}
