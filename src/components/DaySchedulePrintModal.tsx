import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { MemorialService, PastRecord, Household, TempleTodo } from '../types';
import { extractServiceTobaLines } from './ReservationCalendarManager';
import { getHouseholdSponsorName, getJapaneseEra } from '../utils/memorialCalculator';

interface DaySchedulePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDateStr: string;
  services: MemorialService[];
  pastRecords: PastRecord[];
  households: Household[];
  templeTodos?: TempleTodo[];
}

const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 整数を伝統的な漢数字表記に変換（1〜100）
 * ゼロ表記は含みません
 * 例: 1 -> "一", 5 -> "五", 8 -> "八", 10 -> "十", 11 -> "十一", 12 -> "十二", 20 -> "二十", 25 -> "二十五", 31 -> "三十一"
 */
function numberToTraditionalKanji(num: number): string {
  if (num < 0) return String(num);
  if (num < 10) return KANJI_DIGITS[num];
  if (num === 10) return '十';
  if (num < 20) return `十${KANJI_DIGITS[num % 10]}`;
  if (num === 100) return '百';
  const tens = Math.floor(num / 10);
  const units = num % 10;
  if (units === 0) return `${KANJI_DIGITS[tens]}十`;
  return `${KANJI_DIGITS[tens]}十${KANJI_DIGITS[units]}`;
}

/**
 * 年号（元号）の数字を漢数字に変換
 * 例: "令和8年" -> "令和八年", "令和元年" -> "令和元年", "平成31年" -> "平成三十一年"
 */
function eraToKanji(eraStr: string): string {
  if (!eraStr) return '';
  return eraStr.replace(/(\d+)/g, (match) => {
    const n = parseInt(match, 10);
    return isNaN(n) ? match : numberToTraditionalKanji(n);
  });
}

/**
 * 時間を日本語漢字表記に変換
 * 例:
 * "10:00" -> "午前十時"
 * "11:00" -> "午前十一時"
 * "11:30" -> "午前十一時三十分"
 * "13:00" -> "午後一時"
 * "15:00" -> "午後三時"
 * "18:00" -> "午後六時"
 */
function formatScheduledTimeKanji(timeStr?: string): string {
  if (!timeStr || timeStr === '終日' || timeStr === '未定') return '';
  const parts = timeStr.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return timeStr;

  const period = h < 12 ? '午前' : '午後';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const hKanji = numberToTraditionalKanji(displayH);
  const mKanji = m > 0 ? `${numberToTraditionalKanji(m)}分` : '';
  return `${period}${hKanji}時${mKanji}`;
}

/**
 * 日付を漢字の和暦表記に変換（ゼロ表記なし）
 * 「令和八年九月十一日」
 */
function formatDateTitleKanji(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split(/[-/]/);
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;

  // 元号取得 (例: "令和8年")
  const rawEra = getJapaneseEra(y, m, d);
  const kanjiEra = eraToKanji(rawEra); // "令和八年"
  const kanjiMonth = numberToTraditionalKanji(m); // "九"
  const kanjiDay = numberToTraditionalKanji(d); // "十一" (ゼロ表記なし)

  return `${kanjiEra}${kanjiMonth}月${kanjiDay}日`;
}

/**
 * 回忌などの数字も漢字化（例: "3回忌" -> "三回忌", "13回忌" -> "十三回忌", "49日" -> "四十九日"）
 */
function formatMemorialTypeKanji(memType?: string): string {
  if (!memType) return '';
  return memType.replace(/(\d+)/g, (match) => {
    const n = parseInt(match, 10);
    return isNaN(n) ? match : numberToTraditionalKanji(n);
  });
}

/**
 * 俗名を「（故　〇〇　〇〇　様）」の形式に整形
 * 戒名の後に小さめの文字で添える用
 */
function getDeceasedFormattedName(
  rawDeceasedName?: string,
  deceasedId?: string,
  dharmaName?: string,
  pastRecords: PastRecord[] = []
): string {
  let name = (rawDeceasedName || '').trim();
  if (!name && deceasedId) {
    const p = pastRecords.find((rec) => rec.id === deceasedId);
    if (p) name = (p.secularName || p.deceasedName || '').trim();
  }
  if (!name && dharmaName) {
    const p = pastRecords.find((rec) => rec.dharmaName && rec.dharmaName.trim() === dharmaName.trim());
    if (p) name = (p.secularName || p.deceasedName || '').trim();
  }
  if (!name) return '';

  // 先頭の「故」や末尾の「様」「儀」をクリーンアップ
  let cleaned = name.replace(/^故\s*/g, '').replace(/(様|儀)+$/g, '').trim();
  if (!cleaned) return '';

  // 姓名の区切り空白を全角スペースに統一
  cleaned = cleaned.replace(/\s+/g, '　');
  return `（故　${cleaned}　様）`;
}

/**
 * 法事（法要）のみを判定するヘルパー関数
 * 「法事のみの印刷で良い」という要望に基づき、
 * 葬儀（通夜・葬儀・枕経）、一般寺院行事・他寺院助法、会議、住職個人用務、
 * 地域行事、来客、棚経、月参り、純粋な塔婆のみ（塔婆供養）等は除外し、
 * 年忌法要（一周忌、三回忌、七回忌等）、忌日（四十九日等）、納骨法要、
 * 命日法要、特別法要などの法事のみを対象とします。
 */
export function isHojiService(s: MemorialService): boolean {
  const mType = (s.memorialType || '').trim();

  // 1. 葬儀関連を除外
  const funeralTypes = ['通夜', '葬儀', '枕経', '葬儀・枕経', '通夜・葬儀'];
  if (funeralTypes.includes(mType)) return false;

  // 2. 寺院行事・公務・個人用務・来客・棚経・月参りを除外
  const nonHojiCategories = [
    '寺院行事',
    '他寺院助法・出向',
    '会議・教区・公務',
    '住職個人用務・私用',
    '地域行事',
    '来客・相談',
    '会合',
    '来客',
    '法務その他',
    '棚経',
    '月参り',
    '祈祷・厄除',
  ];
  if (nonHojiCategories.includes(mType)) return false;

  // 3. 純粋な塔婆のみの依頼（法事ではない単独塔婆供養）を除外
  if (mType === '塔婆供養' || mType === '塔婆' || mType === '塔婆依頼') {
    return false;
  }

  // 4. 「その他」の場合、戒名や過去帳精霊・法要の詳細がない単なるメモ・予定は除外
  if (mType === 'その他') {
    const hasSpirit = Boolean(s.dharmaName?.trim() || s.deceasedName?.trim() || s.deceasedId);
    if (!hasSpirit) return false;
  }

  return true;
}

/**
 * 法事に申し込まれている全ての塔婆志主の名前を抽出
 * （重複を除去し、志主氏名を整えて配列で返す）
 */
export function getServiceTobaSponsors(
  s: MemorialService,
  pastRecords: PastRecord[] = [],
  templeTodos: TempleTodo[] = [],
  services: MemorialService[] = []
): string[] {
  const sponsors: string[] = [];

  const addSponsorName = (rawName?: string) => {
    if (!rawName) return;
    // 「、」「,」「・」「/」「\n」等で区切られた複数志主の分割にも対応
    const tokens = rawName.split(/[、,・\n\r/]+/).map((t) => t.trim()).filter(Boolean);
    tokens.forEach((tok) => {
      let cleaned = tok
        .replace(/^(塔婆志主|志主名|施主名|志主|施主)\s*[:：]?\s*/g, '')
        .replace(/(家|様)+$/g, '')
        .trim();
      if (!cleaned) return;
      cleaned = cleaned.replace(/\s+/g, '　');
      if (!sponsors.includes(cleaned)) {
        sponsors.push(cleaned);
      }
    });
  };

  // 1. service.tobaItems から志主名を抽出
  if (s.tobaItems && s.tobaItems.length > 0) {
    s.tobaItems.forEach((item) => {
      addSponsorName(item.sponsorName);
    });
  }

  // 2. service.tobaSponsors から志主名を抽出
  if (s.tobaSponsors && s.tobaSponsors.length > 0) {
    s.tobaSponsors.forEach((sp) => {
      addSponsorName(sp);
    });
  }

  // 3. extractServiceTobaLines から志主名を抽出
  const lines = extractServiceTobaLines(s, pastRecords, templeTodos, services);
  lines.forEach((l) => {
    addSponsorName(l.sponsorName);
  });

  // 4. service.notes の志主記載を抽出
  if (s.notes) {
    const noteLines = s.notes.split('\n');
    noteLines.forEach((nl) => {
      const spMatch = nl.match(/(?:塔婆志主|志主名|志主)\s*[:：]?\s*(.*)$/);
      if (spMatch && spMatch[1]) {
        addSponsorName(spMatch[1]);
      }
    });
  }

  // 5. 塔婆の申込（tobaCount > 0 等）があるが、志主名が個別に指定されていない場合は施主名を志主とする
  const hasToba = (s.tobaCount && s.tobaCount > 0) || lines.length > 0;
  if (sponsors.length === 0 && hasToba) {
    const fallbackChief = (s.chiefMourner || '').replace(/(家|様)+$/g, '').trim();
    if (fallbackChief) {
      addSponsorName(fallbackChief);
    }
  }

  return sponsors.map((name) => `${name}様`);
}

export const DaySchedulePrintModal: React.FC<DaySchedulePrintModalProps> = ({
  isOpen,
  onClose,
  targetDateStr,
  services,
  pastRecords,
  households,
  templeTodos = [],
}) => {
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');

  // Filter only 法事 (memorial services) for the selected date
  const hojiServices = useMemo(() => {
    const targetNorm = targetDateStr.replace(/[-/]/g, '/').trim();
    const list = services.filter((s) => {
      const sDateNorm = (s.scheduledDate || '').replace(/[-/]/g, '/').trim();
      if (sDateNorm !== targetNorm) return false;
      return isHojiService(s);
    });

    // 時間順にソート（時間未定または終日は後ろ）
    return list.sort((a, b) => {
      const tA = a.scheduledTime && a.scheduledTime !== '終日' && a.scheduledTime !== '未定' ? a.scheduledTime : '99:99';
      const tB = b.scheduledTime && b.scheduledTime !== '終日' && b.scheduledTime !== '未定' ? b.scheduledTime : '99:99';
      return tA.localeCompare(tB);
    });
  }, [services, targetDateStr]);

  // Clean household & sponsor helper
  const getSponsorAndChief = (s: MemorialService) => {
    const matchedHh = households.find((h) => h.id === s.householdId);
    const fallbackSponsor = matchedHh ? getHouseholdSponsorName(matchedHh) || matchedHh.familyHead : '';
    const rawChief = (s.chiefMourner || fallbackSponsor || '').replace(/(家|様)+$/g, '').trim();
    if (!rawChief) return '';
    const formattedChief = rawChief.replace(/\s+/g, '　');
    return `${formattedChief}様`;
  };

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div className="schedule-print-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-black/75 flex flex-col items-center justify-start p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible">
      {/* Print-specific style */}
      <style>{`
        .schedule-print-container {
          direction: rtl;
        }

        .schedule-vertical-area {
          writing-mode: vertical-rl;
          -webkit-writing-mode: vertical-rl;
          text-orientation: upright;
          -webkit-text-orientation: upright;
          direction: ltr;
          font-family: "Shippori Mincho", "Noto Serif JP", "BIZ UDPMincho", "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", "MS Mincho", serif;
          color: #000000;
          line-height: 2.2;
          white-space: pre-wrap;
          word-break: break-all;
          height: 100%;
          min-height: 550px;
          display: inline-block;
          vertical-align: top;
        }

        @media print {
          /* アプリ本体UI（#root等）を完全に非表示化し、1ページ目の空白を完全に解消 */
          #root,
          header,
          nav,
          aside,
          footer,
          .no-print,
          .no-print * {
            display: none !important;
          }

          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }

          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .schedule-print-modal-overlay {
            position: static !important;
            display: block !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            box-shadow: none !important;
          }

          .schedule-print-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
          }

          .schedule-vertical-area {
            min-height: 0 !important;
            height: auto !important;
            max-height: 265mm !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
          }

          .schedule-vertical-area > div {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Controller Bar (Hidden when printing) */}
      <div className="no-print bg-[#1A1A1A] text-[#F9F7F2] w-full max-w-4xl p-3 mb-3 border border-[#D4AF37] flex items-center justify-between shadow-xl flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <span className="font-serif font-bold text-sm text-[#D4AF37]">
            【予定印刷プレビュー】
          </span>
          <span className="text-xs text-gray-300">
            {formatDateTitleKanji(targetDateStr)}
          </span>
          <span className="text-xs bg-[#2A2A2A] text-[#D4AF37] border border-[#555555] px-2 py-0.5 rounded-2xs">
            法事のみ印刷 ({hojiServices.length}件)
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <div className="flex items-center bg-[#2A2A2A] border border-[#555555] rounded-xs px-2 py-1">
            <span className="text-gray-400 mr-2">文字サイズ:</span>
            <button
              type="button"
              onClick={() => setFontSize('normal')}
              className={`px-2 py-0.5 rounded-2xs cursor-pointer font-bold ${
                fontSize === 'normal'
                  ? 'bg-[#D4AF37] text-[#1A1A1A]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              標準
            </button>
            <button
              type="button"
              onClick={() => setFontSize('large')}
              className={`px-2 py-0.5 rounded-2xs cursor-pointer font-bold ml-1 ${
                fontSize === 'large'
                  ? 'bg-[#D4AF37] text-[#1A1A1A]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              拡大
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-1.5 bg-[#D4AF37] hover:bg-[#C29F2B] text-[#1A1A1A] font-black flex items-center space-x-1.5 cursor-pointer shadow transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>印刷する</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white cursor-pointer ml-1"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Sheet (Pure white background, vertical Japanese calligraphy layout, aligned from right side) */}
      <div
        className="schedule-print-container bg-white w-full max-w-4xl min-h-[650px] p-8 sm:p-14 shadow-2xl border border-gray-200 overflow-x-auto print:border-none print:p-0 print:shadow-none print:w-full"
        style={{ direction: 'rtl' }}
      >
        <div
          className={`schedule-vertical-area min-h-[550px] ${
            fontSize === 'large' ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
          }`}
          style={{ letterSpacing: '0.05em', direction: 'ltr' }}
        >
          {/* 日付見出し（縦書きの最右端・和暦漢数字表記・ゼロ表記なし） */}
          <div
            className="font-bold"
            style={{ marginLeft: '3rem', marginBlockEnd: '3rem' }}
          >
            {formatDateTitleKanji(targetDateStr)}
          </div>

          {/* 法事予定が1件もない場合 */}
          {hojiServices.length === 0 && (
            <div className="text-gray-600" style={{ marginLeft: '2rem', marginBlockEnd: '2rem' }}>
              法事の予定はありません
            </div>
          )}

          {/* 法事の予定一覧 */}
          {hojiServices.map((s, idx) => {
            const timeStr = formatScheduledTimeKanji(s.scheduledTime) || '';
            const chiefWithSama = getSponsorAndChief(s);

            // 精霊（戒名 または 俗名 または 件名）
            const hasDharma = Boolean(s.dharmaName?.trim());
            const dharmaText = s.dharmaName?.trim() || '';
            const deceasedFormatted = hasDharma
              ? getDeceasedFormattedName(s.deceasedName, s.deceasedId, s.dharmaName, pastRecords)
              : '';

            const mainDharma = hasDharma
              ? dharmaText
              : (s.deceasedName?.trim() ? `${s.deceasedName.trim()}儀` : '') ||
                s.notes?.trim() ||
                '法事';
            
            // 回忌・法要種別 (例: 三回忌, 一周忌, 四十九日忌)
            const memType = formatMemorialTypeKanji(s.memorialType?.trim());

            // 塔婆志主名のリスト (申し込んでいる全ての志主名を取得)
            const sponsorsList = getServiceTobaSponsors(s, pastRecords, templeTodos, services);

            // 時間の文字数に応じたインデント（時間の直後から施主・志主を配置）
            // 時間未定・空欄の場合は2文字分インデント
            const timeIndentLength = timeStr ? timeStr.length + 1 : 2;
            const timeIndent = '　'.repeat(timeIndentLength);

            return (
              <div
                key={s.id || idx}
                style={{ marginLeft: '2.5rem', marginBlockEnd: '2.5rem' }}
              >
                {/* 1行目: 時間　戒名（故　⚫️⚫️　⚫️⚫️　様）　法要種別 */}
                <div>
                  {timeStr ? `${timeStr}　` : ''}
                  {mainDharma}
                  {deceasedFormatted && (
                    <span
                      className="font-normal opacity-90 inline-block align-middle"
                      style={{ fontSize: '0.78em' }}
                    >
                      {deceasedFormatted}
                    </span>
                  )}
                  {memType ? `　${memType}` : ''}
                </div>

                {/* 併修がある場合は各精霊を記載 */}
                {(s.additionalDeceased || []).map((sub, sIdx) => {
                  const subHasDharma = Boolean(sub.dharmaName?.trim());
                  const subDharmaText = sub.dharmaName?.trim() || '';
                  const subDeceasedFormatted = subHasDharma
                    ? getDeceasedFormattedName(sub.deceasedName, sub.id, sub.dharmaName, pastRecords)
                    : '';
                  const subDharma = subHasDharma
                    ? subDharmaText
                    : (sub.deceasedName?.trim() ? `${sub.deceasedName.trim()}儀` : '');
                  const subMem = formatMemorialTypeKanji(sub.memorialType?.trim());
                  if (!subDharma) return null;
                  return (
                    <div key={sIdx}>
                      {timeIndent}
                      {subDharma}
                      {subDeceasedFormatted && (
                        <span
                          className="font-normal opacity-90 inline-block align-middle"
                          style={{ fontSize: '0.78em' }}
                        >
                          {subDeceasedFormatted}
                        </span>
                      )}
                      {subMem ? `　${subMem}` : ''}
                    </div>
                  );
                })}

                {/* 2行目: 施主名（時間枠の直後から開始） */}
                {chiefWithSama && (
                  <div>
                    {timeIndent}施主　{chiefWithSama}
                  </div>
                )}

                {/* 3行目以降: 塔婆志主（複数の志主が塔婆を申し込んでいる場合は全ての志主名を表示） */}
                {sponsorsList.length > 0 && (
                  <>
                    {sponsorsList.map((sp, spIdx) => {
                      if (spIdx === 0) {
                        return (
                          <div key={spIdx}>
                            {timeIndent}塔婆志主　{sp}
                          </div>
                        );
                      } else {
                        // 2名以上いる場合は上の「塔婆志主」は省略してお名前の開始位置を揃える（「塔婆志主　」の5文字分空白）
                        return (
                          <div key={spIdx}>
                            {timeIndent}　　　　　{sp}
                          </div>
                        );
                      }
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
