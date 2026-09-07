import { Household, TempleInfo, TempleProfile, PastRecord } from '../types';
import { getHouseholdNiibonStatus } from './memorialCalculator';

interface TanagyoSlotData {
  timeSlot: string;
  households: Household[];
}

interface TanagyoDateData {
  date: string;
  slots: TanagyoSlotData[];
}

interface GenerateTanagyoMailParams {
  priestName: string;
  priestRole?: string;
  priestTemple?: string;
  dates: TanagyoDateData[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  pastRecords?: PastRecord[];
}

/**
 * 寺院名取得ヘルパー（本寺・兼務表記を除去）
 */
function resolveTempleName(templeId: string | undefined, templeInfo: TempleInfo, temples: TempleProfile[] = []): string {
  const mainTemple = temples.find((t) => t.isMain) || temples[0];
  const targetId = templeId || mainTemple?.id || templeInfo.id || 'damt-main';
  const found = temples.find((t) => t.id === targetId);
  return found?.name || templeInfo.name || '自寺';
}

/**
 * スマホ版巡回計画（MobileTanagyoView）のレイアウト・デザインを完全再現した
 * インラインスタイル付きHTMLメール本文を生成する
 */
export function generateTanagyoMailHtml({
  priestName,
  priestRole,
  priestTemple,
  dates,
  templeInfo,
  temples = [],
  pastRecords = [],
}: GenerateTanagyoMailParams): string {
  const totalCount = dates.reduce(
    (acc, d) => acc + d.slots.reduce((sAcc, s) => sAcc + s.households.length, 0),
    0
  );

  const templeDisplayName = `${templeInfo.mountainName ? templeInfo.mountainName + ' ' : ''}${templeInfo.name}`;
  const outputDate = new Date().toLocaleDateString('ja-JP');

  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>お盆棚経 巡回計画（${priestName} 師）</title>
</head>
<body style="margin: 0; padding: 12px; background-color: #f4f2ee; font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif; color: #1a1a1a; -webkit-text-size-adjust: 100%;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #d1cec7; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    
    <!-- 1. 最上部ヘッダー（スマホ版上部バーと同一デザイン） -->
    <div style="background-color: #1f1f1f; color: #ffffff; padding: 16px 18px; border-bottom: 2px solid #d4af37;">
      <div style="font-size: 11px; color: #d4af37; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase;">
        お盆棚経 巡回計画
      </div>
      <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px; flex-wrap: wrap;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 900; color: #f5f2eb; letter-spacing: 0.03em;">
          担当: ${priestName} 師
          ${priestRole ? `<span style="font-size: 11px; font-weight: normal; color: #aaaaaa; margin-left: 6px;">(${priestRole})</span>` : ''}
          ${priestTemple ? `<span style="font-size: 11px; font-weight: normal; color: #aaaaaa; margin-left: 4px;">(${priestTemple})</span>` : ''}
        </h1>
        <div style="background-color: #2a2a2a; border: 1px solid #444444; border-radius: 4px; padding: 3px 10px; font-size: 12px; font-weight: bold; color: #f5f2eb; margin-top: 6px;">
          巡回予定合計: <strong style="color: #d4af37; font-size: 14px;">${totalCount}</strong> 軒
        </div>
      </div>
      <div style="font-size: 11px; color: #999999; margin-top: 6px;">
        ${templeDisplayName} ・ 送信日: ${outputDate}
      </div>
    </div>

    <!-- 案内テキスト -->
    <div style="background-color: #faf7f0; border-bottom: 1px solid #e5e0d8; padding: 10px 16px; font-size: 12px; color: #665c49; line-height: 1.5;">
      💡 訪問先ごとの<strong>【Googleマップで開く】</strong>ボタンをタップすると、スマートフォンですぐにナビゲーション・地図が起動します。
    </div>

    <!-- メインコンテンツ -->
    <div style="padding: 16px;">
`;

  if (dates.length === 0 || totalCount === 0) {
    html += `
      <div style="padding: 32px 16px; text-align: center; color: #666666; font-size: 14px;">
        現在割り当てられている巡回予定はありません。
      </div>
    `;
  } else {
    dates.forEach((dObj) => {
      const dateTotal = dObj.slots.reduce((acc, s) => acc + s.households.length, 0);

      html += `
      <!-- 日程グループ（例: ⚫️8月13日） -->
      <div style="margin-bottom: 24px;">
        <div style="background-color: #2b2724; color: #ffffff; padding: 10px 14px; border-left: 5px solid #d4af37; border-radius: 4px; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 15px; font-weight: 900; letter-spacing: 0.05em;">
            📅 訪問日: ${dObj.date}
          </span>
          <span style="background-color: rgba(0,0,0,0.4); border-radius: 12px; padding: 2px 10px; font-size: 11px; font-weight: bold; color: #d4af37;">
            ${dateTotal} 軒
          </span>
        </div>

        <div style="margin-top: 10px;">
`;

      dObj.slots.forEach((slot) => {
        const slotTitle = `${dObj.date} ${slot.timeSlot}`;
        const slotCount = slot.households.length;

        html += `
          <!-- 時間帯ブロック（午前・午後など） -->
          <div style="background-color: #ffffff; border: 1px solid #d1cec7; border-radius: 4px; margin-bottom: 14px; overflow: hidden;">
            <!-- 時間帯バー -->
            <div style="background-color: #faf7f0; border-bottom: 1px solid #e5e0d8; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 13px; font-weight: bold; color: #8c2d19;">
                ⏰ ${slotTitle}
              </span>
              <span style="font-size: 11px; font-weight: bold; color: #666666;">
                ${slotCount} 軒
              </span>
            </div>

            <!-- 世帯リスト -->
            <div style="padding: 0;">
`;

        slot.households.forEach((h, idx) => {
          const overallOrder = idx + 1;
          const displayOrder = h.tanagyoOrder ?? overallOrder;
          const address = h.tanagyoAddress || h.address || '住所未登録';
          const templeName = resolveTempleName(h.templeId, templeInfo, temples);
          const niibonStatus = getHouseholdNiibonStatus(
            pastRecords,
            h.id,
            templeInfo.bonSeason || '8月盆'
          );
          const phone = h.phone || h.mobile || '';
          const singleMapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
          const borderBottom = idx < slot.households.length - 1 ? 'border-bottom: 1px solid #eeeeee;' : '';

          html += `
              <div style="padding: 12px; ${borderBottom} display: flex; align-items: flex-start;">
                <!-- 順序番号バッジ -->
                <div style="width: 26px; height: 26px; min-width: 26px; border-radius: 50%; background-color: #faf7f0; border: 1px solid rgba(212,175,55,0.8); color: #8c2d19; font-size: 12px; font-weight: 900; text-align: center; line-height: 26px; margin-right: 10px; margin-top: 2px;">
                  ${displayOrder}
                </div>

                <!-- メイン詳細情報 -->
                <div style="flex: 1; min-width: 0;">
                  <div style="margin-bottom: 4px;">
                    <strong style="font-size: 15px; color: #1a1a1a; margin-right: 6px;">
                      ${h.familyHead} 様
                    </strong>
                    <span style="display: inline-block; font-size: 10px; font-weight: bold; color: #555555; background-color: #f0f0f0; border: 1px solid #dcdcdc; border-radius: 3px; padding: 1px 6px; margin-right: 4px;">
                      ${templeName}
                    </span>
                    ${niibonStatus.isCurrentYearNiibon ? `
                    <span style="display: inline-block; font-size: 10px; font-weight: bold; color: #78350f; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 3px; padding: 1px 6px; margin-right: 4px;">
                      ${niibonStatus.currentYearLabel}
                    </span>` : ''}
                    ${niibonStatus.isNextYearNiibon ? `
                    <span style="display: inline-block; font-size: 10px; font-weight: bold; color: #075985; background-color: #e0f2fe; border: 1px solid #bae6fd; border-radius: 3px; padding: 1px 6px; margin-right: 4px;">
                      ${niibonStatus.nextYearLabel}
                    </span>` : ''}
                  </div>

                  <!-- 住所 -->
                  <div style="font-size: 12px; color: #444444; margin-bottom: 4px; line-height: 1.4;">
                    📍 ${address}
                  </div>

                  <!-- 電話番号 -->
                  ${phone ? `
                  <div style="font-size: 12px; color: #555555; margin-bottom: 4px;">
                    📞 <a href="tel:${phone.replace(/[^0-9]/g, '')}" style="color: #1d4ed8; text-decoration: underline; font-family: monospace; font-weight: bold;">${phone}</a>
                  </div>` : ''}

                  <!-- 特記事項 -->
                  ${h.tanagyoNotes ? `
                  <div style="font-size: 11px; color: #854d0e; background-color: #fef9c3; border: 1px dashed #facc15; border-radius: 3px; padding: 3px 6px; margin-bottom: 6px;">
                    📝 特記: ${h.tanagyoNotes}
                  </div>` : ''}

                  <!-- Googleマップリンクボタン -->
                  <div style="margin-top: 6px;">
                    <a href="${singleMapUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 5px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 11px;">
                      🗺️ Googleマップで開く
                    </a>
                  </div>
                </div>
              </div>
`;
        });

        html += `
            </div>
          </div>
`;
      });

      html += `
        </div>
      </div>
`;
    });
  }

  html += `
    </div>

    <!-- フッター -->
    <div style="background-color: #f5f2eb; border-top: 1px solid #d1cec7; padding: 14px 16px; font-size: 11px; color: #666666; text-align: center; line-height: 1.6;">
      <div>${templeDisplayName}</div>
      <div>※交通事情やご不在等により巡回順序・時間が前後する場合がございます。</div>
    </div>

  </div>
</body>
</html>
`;

  return html;
}

/**
 * プレーンテキスト版の巡回計画を生成する（メール本文・LINE送信用）
 */
export function generateTanagyoMailPlainText({
  priestName,
  priestRole,
  priestTemple,
  dates,
  templeInfo,
  temples = [],
  pastRecords = [],
}: GenerateTanagyoMailParams): string {
  const totalCount = dates.reduce(
    (acc, d) => acc + d.slots.reduce((sAcc, s) => sAcc + s.households.length, 0),
    0
  );
  const templeDisplayName = `${templeInfo.mountainName ? templeInfo.mountainName + ' ' : ''}${templeInfo.name}`;

  let text = `【お盆棚経 巡回計画】\n`;
  text += `担当僧侶: ${priestName} 師`;
  if (priestRole) text += ` (${priestRole})`;
  if (priestTemple) text += ` (${priestTemple})`;
  text += `\n`;
  text += `寺院: ${templeDisplayName}\n`;
  text += `巡回合計: ${totalCount} 軒\n`;
  text += `出力日: ${new Date().toLocaleDateString('ja-JP')}\n`;
  text += `========================================\n\n`;

  dates.forEach((dObj) => {
    const dateTotal = dObj.slots.reduce((acc, s) => acc + s.households.length, 0);
    text += `■ 訪問日: ${dObj.date} (計 ${dateTotal} 軒)\n`;
    text += `----------------------------------------\n`;

    dObj.slots.forEach((slot) => {
      text += `【${slot.timeSlot}】 (${slot.households.length} 軒)\n`;

      slot.households.forEach((h, idx) => {
        const order = h.tanagyoOrder ?? idx + 1;
        const address = h.tanagyoAddress || h.address || '住所未登録';
        const templeName = resolveTempleName(h.templeId, templeInfo, temples);
        const niibonStatus = getHouseholdNiibonStatus(
          pastRecords,
          h.id,
          templeInfo.bonSeason || '8月盆'
        );
        const phone = h.phone || h.mobile || '';
        const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

        text += `${order}. ${h.familyHead} 様 [${templeName}]`;
        if (niibonStatus.isCurrentYearNiibon) text += ` (${niibonStatus.currentYearLabel})`;
        if (niibonStatus.isNextYearNiibon) text += ` (${niibonStatus.nextYearLabel})`;
        text += `\n`;
        text += `   住所: ${address}\n`;
        if (phone) text += `   電話: ${phone}\n`;
        if (h.tanagyoNotes) text += `   特記: ${h.tanagyoNotes}\n`;
        text += `   地図: ${mapUrl}\n\n`;
      });
    });

    text += `\n`;
  });

  text += `※本メールは寺院管理システムより発行された巡回計画です。\n`;
  return text;
}

/**
 * リッチHTMLおよびプレーンテキストをクリップボードに書き込む（ブラウザ標準API対応）
 */
export async function copyTanagyoRichHtmlToClipboard(html: string, plainText: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn('ClipboardItem copy failed, falling back to text copy:', err);
  }

  // フォールバック: プレーンテキストのコピー
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plainText);
      return true;
    }
  } catch (e) {
    console.error('Text copy failed:', e);
  }
  return false;
}
