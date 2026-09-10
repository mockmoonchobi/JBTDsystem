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
 * 写真二枚目の仕様に準拠: 「令和八年九月十一日」
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

  // Filter services for the selected date
  const dayServices = useMemo(() => {
    return services.filter((s) => s.scheduledDate === targetDateStr);
  }, [services, targetDateStr]);

  // Separate timed services vs all-day services
  const { timedServices, allDayServices } = useMemo(() => {
    const timed: MemorialService[] = [];
    const allDay: MemorialService[] = [];

    dayServices.forEach((s) => {
      const isAll =
        s.scheduledTime === '終日' ||
        s.isAllDay ||
        s.memorialType === '塔婆供養' ||
        s.memorialType === '塔婆';

      if (isAll) {
        allDay.push(s);
      } else {
        timed.push(s);
      }
    });

    // Sort timed services by time
    timed.sort((a, b) => {
      const tA = a.scheduledTime || '99:99';
      const tB = b.scheduledTime || '99:99';
      return tA.localeCompare(tB);
    });

    return { timedServices: timed, allDayServices: allDay };
  }, [dayServices]);

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex flex-col items-center justify-start p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible">
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
          body * {
            visibility: hidden;
          }
          .schedule-print-container, .schedule-print-container * {
            visibility: visible;
          }
          .schedule-print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 10mm 15mm !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
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

          {/* 予定が1件もない場合 */}
          {dayServices.length === 0 && (
            <div className="text-gray-600" style={{ marginLeft: '2rem', marginBlockEnd: '2rem' }}>
              予定はありません
            </div>
          )}

          {/* 1. 時間指定のある予定 */}
          {timedServices.map((s, idx) => {
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

            // 塔婆明細の抽出
            const tobaLines = extractServiceTobaLines(s, pastRecords, templeTodos, services);
            // 塔婆志主名のリスト (重複を除去し、志主氏名を順に並べる)
            const rawSponsors = tobaLines
              .map((t) => (t.sponsorName || '').replace(/(家|様)+$/g, '').trim())
              .filter((name) => Boolean(name))
              .map((name) => name.replace(/\s+/g, '　'));
            const uniqueSponsors = Array.from(new Set(rawSponsors));
            const sponsorsList = uniqueSponsors.map((name) => `${name}様`);

            // 写真二枚目の配置: 「施主」「塔婆志主」の開始位置は時間の文字数分インデント
            // 例: 「午前十一時　」は5文字+全角空白1文字 = 6文字分インデント
            //     「午後三時　」は4文字+全角空白1文字 = 5文字分インデント
            const timeIndentLength = timeStr ? timeStr.length + 1 : 0;
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

                {/* 2行目: 施主名（二枚目の写真通り、時間枠の直後から開始） */}
                {chiefWithSama && (
                  <div>
                    {timeIndent}施主　{chiefWithSama}
                  </div>
                )}

                {/* 3行目: 塔婆志主（二枚目の写真通り、施主と開始位置を揃える） */}
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

          {/* 2. 終日予定 */}
          {allDayServices.length > 0 && (
            <div
              style={{ marginLeft: '2.5rem', marginBlockEnd: '2.5rem' }}
            >
              <div>終日予定</div>

              {/* 終日予定の中の塔婆 */}
              {(() => {
                const tobaServices = allDayServices.filter(
                  (s) =>
                    s.memorialType === '塔婆供養' ||
                    s.memorialType === '塔婆' ||
                    (s.tobaCount && s.tobaCount > 0) ||
                    (s.tobaItems && s.tobaItems.length > 0)
                );

                const nonTobaServices = allDayServices.filter(
                  (s) => !tobaServices.includes(s)
                );

                return (
                  <>
                    {tobaServices.length > 0 && (
                      <div className="my-1">
                        <div>　　塔婆</div>
                        {tobaServices.map((ts, tsIdx) => {
                          const tobaLines = extractServiceTobaLines(
                            ts,
                            pastRecords,
                            templeTodos,
                            services
                          );

                          if (tobaLines.length > 0) {
                            return tobaLines.map((line, lIdx) => {
                              const hasDharma = Boolean(line.dharmaName || ts.dharmaName);
                              const dName = line.dharmaName || ts.dharmaName || '先祖代々';
                              const deceasedFormatted = hasDharma
                                ? getDeceasedFormattedName(
                                    ts.deceasedName,
                                    ts.deceasedId,
                                    dName,
                                    pastRecords
                                  )
                                : '';
                              const mType = formatMemorialTypeKanji(line.memorialType || ts.memorialType || '');
                              const rawSName = (line.sponsorName || ts.chiefMourner || '志主')
                                .replace(/(家|様)+$/g, '')
                                .trim()
                                .replace(/\s+/g, '　');
                              return (
                                <div key={`${tsIdx}-${lIdx}`}>
                                  　　　{dName}
                                  {deceasedFormatted && (
                                    <span
                                      className="font-normal opacity-90 inline-block align-middle"
                                      style={{ fontSize: '0.78em' }}
                                    >
                                      {deceasedFormatted}
                                    </span>
                                  )}
                                  {mType ? `　${mType}` : ''}　志主　{rawSName}様
                                </div>
                              );
                            });
                          }

                          // fallback if no lines extracted
                          const hasDharma = Boolean(ts.dharmaName);
                          const dName = ts.dharmaName || (ts.deceasedName ? `${ts.deceasedName}儀` : '先祖代々');
                          const deceasedFormatted = hasDharma
                            ? getDeceasedFormattedName(ts.deceasedName, ts.deceasedId, ts.dharmaName, pastRecords)
                            : '';
                          const mType = formatMemorialTypeKanji(ts.memorialType || '');
                          const rawSName = (ts.chiefMourner || '志主')
                            .replace(/(家|様)+$/g, '')
                            .trim()
                            .replace(/\s+/g, '　');
                          return (
                            <div key={tsIdx}>
                              　　　{dName}
                              {deceasedFormatted && (
                                <span
                                  className="font-normal opacity-90 inline-block align-middle"
                                  style={{ fontSize: '0.78em' }}
                                >
                                  {deceasedFormatted}
                                </span>
                              )}
                              {mType ? `　${mType}` : ''}　志主　{rawSName}様
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 塔婆以外の一般終日予定 */}
                    {nonTobaServices.map((ns, nsIdx) => {
                      const title =
                        ns.chiefMourner ||
                        ns.notes ||
                        ns.memorialType ||
                        '行事';
                      return (
                        <div key={nsIdx}>
                          　　{title}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
