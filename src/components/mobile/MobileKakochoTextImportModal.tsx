import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Plus, 
  Trash2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';
import { Household, PastRecord, TempleInfo, TempleProfile } from '../../types';
import { 
  normalizeDateInput, 
  formatJapaneseEraDate, 
  calculateNiibonFromDeathDate, 
  getHouseholdSponsorName 
} from '../../utils/memorialCalculator';

export interface MobileKakochoTextImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetHousehold: Household | null;
  existingPastRecords?: PastRecord[];
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  onImportPastRecords: (records: PastRecord[], description?: string) => void;
}

export interface MobileExtractedKakochoItem {
  id: string;
  selected: boolean;
  dharmaName: string;
  secularName: string;
  furigana: string;
  deathDate: string;
  ageAtDeath: number | undefined;
  relationship: string;
  householdHeadName: string;
  burialLocation: string;
  notes: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
  isExpanded?: boolean;
}

export type KakochoPromptFormatType = 'csv' | 'label' | 'tsv';

/**
 * Super robust client-side parser that handles CSV, TSV, Markdown Tables, Key-Value Labels, JSON, and smart column auto-correction.
 */
function parseMobileTextToItems(
  text: string, 
  household: Household, 
  existingRecords: PastRecord[]
): MobileExtractedKakochoItem[] {
  if (!text || !text.trim()) return [];

  // Step 1: Clean markdown code fences and extraneous AI chatter
  let cleanedText = text
    .replace(/^```[a-zA-Z]*\s*/gm, '')
    .replace(/```$/gm, '')
    .trim();

  // Try parsing JSON first if input is JSON array
  if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
    try {
      const jsonArr = JSON.parse(cleanedText);
      if (Array.isArray(jsonArr) && jsonArr.length > 0) {
        const jsonItems: MobileExtractedKakochoItem[] = jsonArr.map((obj: any, idx: number) => {
          const dharma = obj.dharmaName || obj.dharma || obj.戒名 || obj.法名 || obj.法号 || '';
          const secular = obj.secularName || obj.secular || obj.俗名 || obj.氏名 || obj.名前 || '';
          const furi = obj.furigana || obj.ふりがな || obj.フリガナ || '';
          const death = obj.deathDate || obj.death || obj.没年月日 || obj.命日 || obj.死亡日 || '';
          const rawAge = obj.ageAtDeath ?? obj.age ?? obj.享年 ?? obj.行年 ?? '';
          const rel = obj.relationship || obj.rel || obj.続柄 || '';
          const note = obj.notes || obj.note || obj.備考 || '';

          const ageNum = typeof rawAge === 'number' ? rawAge : parseInt(String(rawAge).replace(/[^0-9]/g, ''), 10);
          const normalizedDeath = normalizeDateInput(death, { mode: 'pastRecord' });
          const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : death;

          return {
            id: `mob-kakocho-json-${Date.now()}-${idx}`,
            selected: true,
            dharmaName: String(dharma).trim(),
            secularName: String(secular).trim(),
            furigana: String(furi).trim(),
            deathDate: (displayDeath || '').trim(),
            ageAtDeath: !isNaN(ageNum) && ageNum > 0 ? ageNum : undefined,
            relationship: String(rel).trim(),
            householdHeadName: household.familyHead || '',
            burialLocation: household.tombNumber || '',
            notes: String(note).trim(),
            isExpanded: true,
          };
        }).filter(item => item.dharmaName || item.secularName);

        if (jsonItems.length > 0) {
          return attachDuplicateInfo(jsonItems, existingRecords);
        }
      }
    } catch (e) {
      // Ignore JSON parse error and fallback to text parsing
    }
  }

  // Filter out comments and common conversational AI greetings
  const rawLines = cleanedText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (l.startsWith('#') || l.startsWith('//')) return false;
      if (/^(はい[、,]|以下[はがに]|文字起こし結果|承知いた|抽出結果|データを出力)/.test(l)) return false;
      if (/^(上記[のテキスト]|コピーして|寺院管理アプリ)/.test(l)) return false;
      return true;
    });

  if (rawLines.length === 0) return [];

  // Check if it's Key-Value / Label format (e.g. 【戒名】... 【俗名】...)
  const isLabelFormat = rawLines.some(l => 
    /^[【\[]?(戒名|法名|法号|俗名|氏名|没年月日|命日|享年|行年|続柄|備考)[】\]]?\s*[:：]/.test(l) ||
    /【(戒名|法名|俗名|氏名|没年月日|命日|享年|続柄)】/.test(l)
  );

  if (isLabelFormat) {
    const items = parseLabelFormat(rawLines, household);
    if (items.length > 0) {
      return attachDuplicateInfo(items, existingRecords);
    }
  }

  // Check if it's a Markdown Table (e.g. | 戒名 | 俗名 | ... |)
  const isMarkdownTable = rawLines.some(l => l.startsWith('|') && l.endsWith('|') && l.includes('|'));
  if (isMarkdownTable) {
    const items = parseMarkdownTable(rawLines, household);
    if (items.length > 0) {
      return attachDuplicateInfo(items, existingRecords);
    }
  }

  // Standard Delimited parser (CSV, TSV, Semicolon, Pipe)
  const items = parseDelimitedOrSmartLines(rawLines, household);
  return attachDuplicateInfo(items, existingRecords);
}

/**
 * Key-Value / Label based parser (e.g. 【戒名】〇〇 【俗名】〇〇 etc.)
 */
function parseLabelFormat(lines: string[], household: Household): MobileExtractedKakochoItem[] {
  const items: MobileExtractedKakochoItem[] = [];
  let current: Partial<MobileExtractedKakochoItem> = {
    householdHeadName: household.familyHead || '',
    burialLocation: household.tombNumber || '',
    selected: true,
    isExpanded: true,
  };

  const flushCurrent = () => {
    if (current.dharmaName || current.secularName) {
      const normalizedDeath = normalizeDateInput(current.deathDate || '', { mode: 'pastRecord' });
      const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : (current.deathDate || '');

      items.push({
        id: `mob-kakocho-lbl-${Date.now()}-${items.length}`,
        selected: true,
        dharmaName: (current.dharmaName || '').trim(),
        secularName: (current.secularName || '').trim(),
        furigana: (current.furigana || '').trim(),
        deathDate: displayDeath.trim(),
        ageAtDeath: current.ageAtDeath,
        relationship: (current.relationship || '').trim(),
        householdHeadName: current.householdHeadName || household.familyHead || '',
        burialLocation: current.burialLocation || household.tombNumber || '',
        notes: (current.notes || '').trim(),
        isExpanded: true,
      });
    }
    current = {
      householdHeadName: household.familyHead || '',
      burialLocation: household.tombNumber || '',
      selected: true,
      isExpanded: true,
    };
  };

  for (const line of lines) {
    // Delimiter between spirits
    if (/^[-=_*]{3,}$/.test(line) || /^精霊\s*\d+/i.test(line) || /^第?\d+霊/.test(line)) {
      flushCurrent();
      continue;
    }

    // In-line multiple tags: 【戒名】〇〇 【俗名】〇〇 ...
    if ((line.match(/【/g) || []).length >= 2) {
      const tags = line.split(/(?=【)/);
      for (const t of tags) {
        extractTagValue(t.trim(), current);
      }
      continue;
    }

    // Single line tag: 戒名: 〇〇
    extractTagValue(line, current);
  }

  flushCurrent();
  return items;
}

function extractTagValue(str: string, target: Partial<MobileExtractedKakochoItem>) {
  const match = str.match(/^[【\[]?\s*(戒名|法名|法号|俗名|氏名|名前|ふりがな|フリガナ|よみ|没年月日|命日|死亡日|没日|没|享年|行年|年齢|歳|続柄|関係|施主|世帯主|墓地|納骨|区画|備考|特記|メモ)\s*[】\]]?\s*[:：\s]\s*(.*)$/);
  if (!match) return;

  const key = match[1];
  const val = match[2].trim().replace(/^["']|["']$/g, '');
  if (val === 'なし' || val === '無' || val === '-' || val === '―') return;

  if (/戒名|法名|法号/.test(key)) {
    target.dharmaName = val;
  } else if (/俗名|氏名|名前/.test(key)) {
    target.secularName = val;
  } else if (/ふりがな|フリガナ|よみ/.test(key)) {
    target.furigana = val;
  } else if (/没年月日|命日|死亡日|没日|没/.test(key)) {
    target.deathDate = val.replace(/[寂没]$/, '').trim();
  } else if (/享年|行年|年齢|歳/.test(key)) {
    const ageNum = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(ageNum) && ageNum > 0 && ageNum < 130) {
      target.ageAtDeath = ageNum;
    }
  } else if (/続柄|関係/.test(key)) {
    target.relationship = val;
  } else if (/施主|世帯主/.test(key)) {
    target.householdHeadName = val;
  } else if (/墓地|納骨|区画/.test(key)) {
    target.burialLocation = val;
  } else if (/備考|特記|メモ/.test(key)) {
    target.notes = val;
  }
}

/**
 * Markdown Table Parser (| 戒名 | 俗名 | 没年月日 | ... |)
 */
function parseMarkdownTable(lines: string[], household: Household): MobileExtractedKakochoItem[] {
  const tableLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
  if (tableLines.length < 2) return [];

  const rows = tableLines.map(l => 
    l.slice(1, -1).split('|').map(c => c.trim())
  ).filter(r => !r.every(c => /^[-:\s]+$/.test(c))); // remove separator line

  if (rows.length < 2) return [];

  const headerRow = rows[0].map(c => c.toLowerCase());
  const headerMap: { [key: string]: number } = {};

  headerRow.forEach((col, idx) => {
    if (col.includes('戒名') || col.includes('法名') || col.includes('法号')) headerMap.dharma = idx;
    else if (col.includes('俗名') || col.includes('氏名') || col.includes('名前')) headerMap.secular = idx;
    else if (col.includes('ふりがな') || col.includes('フリガナ') || col.includes('よみ')) headerMap.furigana = idx;
    else if (col.includes('没') || col.includes('命日') || col.includes('死亡')) headerMap.death = idx;
    else if (col.includes('享年') || col.includes('行年') || col.includes('歳') || col.includes('年齢')) headerMap.age = idx;
    else if (col.includes('続柄') || col.includes('関係')) headerMap.rel = idx;
    else if (col.includes('備考') || col.includes('特記') || col.includes('メモ')) headerMap.notes = idx;
  });

  const items: MobileExtractedKakochoItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => !c)) continue;

    const dharma = headerMap.dharma !== undefined ? row[headerMap.dharma] : (row[0] || '');
    const secular = headerMap.secular !== undefined ? row[headerMap.secular] : (row[1] || '');
    const furi = headerMap.furigana !== undefined ? row[headerMap.furigana] : (row[2] || '');
    const death = headerMap.death !== undefined ? row[headerMap.death] : (row[3] || '');
    const ageStr = headerMap.age !== undefined ? row[headerMap.age] : (row[4] || '');
    const rel = headerMap.rel !== undefined ? row[headerMap.rel] : (row[5] || '');
    const notes = headerMap.notes !== undefined ? row[headerMap.notes] : (row[6] || '');

    if (!dharma && !secular) continue;

    const ageNum = parseInt((ageStr || '').replace(/[^0-9]/g, ''), 10);
    const normalizedDeath = normalizeDateInput(death || '', { mode: 'pastRecord' });
    const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : (death || '');

    items.push({
      id: `mob-kakocho-tbl-${Date.now()}-${i}`,
      selected: true,
      dharmaName: (dharma || '').trim(),
      secularName: (secular || '').trim(),
      furigana: (furi || '').trim(),
      deathDate: displayDeath.trim(),
      ageAtDeath: !isNaN(ageNum) && ageNum > 0 ? ageNum : undefined,
      relationship: (rel || '').trim(),
      householdHeadName: household.familyHead || '',
      burialLocation: household.tombNumber || '',
      notes: (notes || '').trim(),
      isExpanded: true,
    });
  }

  return items;
}

/**
 * Delimited parser with smart column assignment (CSV / TSV / Semicolon / Space fallback)
 */
function parseDelimitedOrSmartLines(lines: string[], household: Household): MobileExtractedKakochoItem[] {
  const items: MobileExtractedKakochoItem[] = [];

  // Determine delimiter
  let delimiter = ',';
  const sample = lines.slice(0, 5).join('\n');
  if (sample.includes('\t')) delimiter = '\t';
  else if (sample.includes(';') && !sample.includes(',')) delimiter = ';';
  else if (sample.includes('|') && !sample.includes(',')) delimiter = '|';

  // Parse lines into token cells
  const parsedRows: string[][] = lines.map(line => {
    // Strip bullet points like '1. ', '- ', '* ', '● '
    const cleanLine = line.replace(/^[\s*\-•●\d+.)\]】]+\s*/, '').trim();
    if (!cleanLine) return [];

    if (delimiter === '\t') {
      return cleanLine.split('\t').map(c => cleanCell(c));
    }
    if (delimiter === ';') {
      return cleanLine.split(';').map(c => cleanCell(c));
    }
    if (delimiter === '|') {
      return cleanLine.split('|').map(c => cleanCell(c));
    }

    // CSV regex split (supports quotes)
    if (cleanLine.includes(',')) {
      return cleanLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => cleanCell(c));
    }

    // Space or full-width space split
    return cleanLine.split(/[\s　]+/).map(c => cleanCell(c));
  }).filter(r => r.length > 0);

  if (parsedRows.length === 0) return [];

  // Check if first row is header
  const firstRow = parsedRows[0].map(c => c.toLowerCase());
  const hasHeader = firstRow.some(c => 
    c.includes('戒名') || c.includes('法名') || c.includes('法号') || 
    c.includes('俗名') || c.includes('氏名') || c.includes('名前') || 
    c.includes('命日') || c.includes('没') || c.includes('死亡') || 
    c.includes('享年') || c.includes('行年') || c.includes('歳') || 
    c.includes('続柄') || c.includes('関係')
  );

  let startIdx = 0;
  const headerMap: { [key: string]: number } = {};

  if (hasHeader) {
    firstRow.forEach((col, idx) => {
      if (col.includes('戒名') || col.includes('法名') || col.includes('法号')) headerMap.dharma = idx;
      else if (col.includes('俗名') || col.includes('氏名') || col.includes('名前')) headerMap.secular = idx;
      else if (col.includes('ふりがな') || col.includes('フリガナ') || col.includes('よみ')) headerMap.furigana = idx;
      else if (col.includes('命日') || col.includes('没') || col.includes('死亡')) headerMap.death = idx;
      else if (col.includes('享年') || col.includes('行年') || col.includes('年齢') || col.includes('歳')) headerMap.age = idx;
      else if (col.includes('続柄') || col.includes('関係')) headerMap.rel = idx;
      else if (col.includes('施主') || col.includes('世帯主')) headerMap.head = idx;
      else if (col.includes('墓地') || col.includes('納骨') || col.includes('区画')) headerMap.burial = idx;
      else if (col.includes('備考') || col.includes('特記') || col.includes('メモ')) headerMap.notes = idx;
    });
    startIdx = 1;
  }

  for (let i = startIdx; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.length === 0 || row.every(c => !c)) continue;

    let dharma = '';
    let secular = '';
    let furigana = '';
    let deathDate = '';
    let ageStr = '';
    let rel = '';
    let head = household.familyHead || '';
    let burial = household.tombNumber || '';
    let notes = '';

    if (hasHeader && Object.keys(headerMap).length > 0) {
      if (headerMap.dharma !== undefined) dharma = row[headerMap.dharma] || '';
      if (headerMap.secular !== undefined) secular = row[headerMap.secular] || '';
      if (headerMap.furigana !== undefined) furigana = row[headerMap.furigana] || '';
      if (headerMap.death !== undefined) deathDate = row[headerMap.death] || '';
      if (headerMap.age !== undefined) ageStr = row[headerMap.age] || '';
      if (headerMap.rel !== undefined) rel = row[headerMap.rel] || '';
      if (headerMap.head !== undefined) head = row[headerMap.head] || head;
      if (headerMap.burial !== undefined) burial = row[headerMap.burial] || burial;
      if (headerMap.notes !== undefined) notes = row[headerMap.notes] || '';
    } else {
      // Smart Auto-Mapping without Header
      // Standard 7-column order: 0:戒名, 1:俗名, 2:ふりがな, 3:没年月日, 4:享年, 5:続柄, 6:備考
      const mapped = smartAutoAssignColumns(row);
      dharma = mapped.dharma;
      secular = mapped.secular;
      furigana = mapped.furigana;
      deathDate = mapped.deathDate;
      ageStr = mapped.ageStr;
      rel = mapped.rel;
      notes = mapped.notes;
    }

    if (!dharma && !secular) continue;

    const ageNum = parseInt(ageStr.replace(/[^0-9]/g, ''), 10);
    const normalizedDeath = normalizeDateInput(deathDate, { mode: 'pastRecord' });
    const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : deathDate;

    items.push({
      id: `mob-kakocho-csv-${Date.now()}-${i}`,
      selected: true,
      dharmaName: dharma.trim(),
      secularName: secular.trim(),
      furigana: furigana.trim(),
      deathDate: (displayDeath || '').trim(),
      ageAtDeath: !isNaN(ageNum) && ageNum > 0 && ageNum < 130 ? ageNum : undefined,
      relationship: rel.trim(),
      householdHeadName: head.trim(),
      burialLocation: burial.trim(),
      notes: notes.trim(),
      isExpanded: true,
    });
  }

  return items;
}

function cleanCell(cell: string): string {
  if (!cell) return '';
  const trimmed = cell.trim().replace(/^["']|["']$/g, '').trim();
  if (trimmed === 'なし' || trimmed === '無' || trimmed === '-' || trimmed === '―' || trimmed === 'null' || trimmed === 'undefined') {
    return '';
  }
  return trimmed;
}

/**
 * Intelligently classifies unheadered cells into the correct boxes
 */
function smartAutoAssignColumns(cells: string[]) {
  const res = {
    dharma: '',
    secular: '',
    furigana: '',
    deathDate: '',
    ageStr: '',
    rel: '',
    notes: '',
  };

  const unused: string[] = [];

  for (let idx = 0; idx < cells.length; idx++) {
    const cell = cells[idx];
    if (!cell) continue;

    // Check if Date (e.g. 令和4年8月10日, 2022-08-10, H22.3.3)
    if (!res.deathDate && /(?:令和|平成|昭和|大正|明治|R|H|S|T|M|\d{4})[年/\-.\s]?[0-9０-９]+[月/\-.\s]?[0-9０-９]+日?|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(cell)) {
      res.deathDate = cell.replace(/[寂没]$/, '').trim();
      continue;
    }

    // Check if Age (e.g. 88歳, 享年88, 88)
    if (!res.ageStr && /(?:享年|行年|満)?\s*([0-9０-９]{1,3})\s*歳?/.test(cell)) {
      const match = cell.match(/(?:享年|行年|満)?\s*([0-9０-９]{1,3})\s*歳?/);
      if (match) {
        const num = parseInt(match[1].replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0)), 10);
        if (num > 0 && num < 130) {
          res.ageStr = String(num);
          continue;
        }
      }
    }

    // Check if Relationship (e.g. 父, 母, 祖父, 祖母, 夫, 妻, 長男, 叔父 etc.)
    if (!res.rel && /^(父|母|祖父|祖母|夫|妻|長男|長女|二男|次男|二女|次女|三男|三女|子供|兄|弟|姉|妹|本人|伯父|叔父|伯母|叔母|養父|養母|義父|義母)$/.test(cell.replace(/[（()）]/g, '').trim())) {
      res.rel = cell.replace(/[（()）]/g, '').trim();
      continue;
    }

    // Check if Furigana (All Hiragana or Katakana)
    if (!res.furigana && /^[ぁ-んー\s]+$/.test(cell) && cell.length >= 2) {
      res.furigana = cell;
      continue;
    }

    // Unassigned tokens
    unused.push(cell);
  }

  // Assign remaining tokens to Dharma name, Secular name, and Notes
  if (unused.length === 1) {
    // If it has typical dharma suffixes or prefixes, assign to dharmaName
    if (/院|居士|大姉|信士|信女|釋|釈|童子|童女|大居士|清信|水子/.test(unused[0])) {
      res.dharma = unused[0];
    } else {
      res.secular = unused[0];
    }
  } else if (unused.length >= 2) {
    // Standard 1st is dharma, 2nd is secular
    if (/院|居士|大姉|信士|信女|釋|釈|童子|童女|水子/.test(unused[0])) {
      res.dharma = unused[0];
      res.secular = unused[1];
      if (unused.length > 2) {
        res.notes = unused.slice(2).join(' ');
      }
    } else if (/院|居士|大姉|信士|信女|釋|釈|童子|童女|水子/.test(unused[1])) {
      res.secular = unused[0];
      res.dharma = unused[1];
      if (unused.length > 2) {
        res.notes = unused.slice(2).join(' ');
      }
    } else {
      res.dharma = unused[0];
      res.secular = unused[1];
      if (unused.length > 2) {
        res.notes = unused.slice(2).join(' ');
      }
    }
  }

  return res;
}

function attachDuplicateInfo(items: MobileExtractedKakochoItem[], existingRecords: PastRecord[]): MobileExtractedKakochoItem[] {
  return items.map((item) => {
    let isDup = false;
    let dupReason = '';
    const existingMatch = existingRecords.find((ex) => {
      if (item.dharmaName && ex.dharmaName && ex.dharmaName === item.dharmaName) return true;
      if (item.secularName && ex.secularName && ex.secularName === item.secularName) return true;
      return false;
    });

    if (existingMatch) {
      isDup = true;
      dupReason = `既存（${existingMatch.dharmaName || existingMatch.secularName}）と同名`;
    }

    return {
      ...item,
      isDuplicate: isDup,
      duplicateReason: dupReason,
    };
  });
}

export const MobileKakochoTextImportModal: React.FC<MobileKakochoTextImportModalProps> = ({
  isOpen,
  onClose,
  targetHousehold,
  existingPastRecords = [],
  templeInfo,
  temples = [],
  onImportPastRecords,
}) => {
  const [currentStep, setCurrentStep] = useState<'input' | 'review' | 'complete'>('input');
  const [promptFormat, setPromptFormat] = useState<KakochoPromptFormatType>('csv');
  const [pastedText, setPastedText] = useState<string>('');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showPromptHelp, setShowPromptHelp] = useState<boolean>(false);

  // Records state
  const [extractedRecords, setExtractedRecords] = useState<MobileExtractedKakochoItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);

  // Household display info
  const householdName = targetHousehold
    ? getHouseholdSponsorName(targetHousehold) || targetHousehold.familyHead || `世帯 ID: ${targetHousehold.id}`
    : '檀家世帯';

  const householdTomb = targetHousehold?.tombNumber || '';
  const currentHouseholdExistingRecords = useMemo(() => {
    if (!targetHousehold) return [];
    return existingPastRecords.filter((p) => p.householdId === targetHousehold.id);
  }, [existingPastRecords, targetHousehold]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('input');
      setPastedText('');
      setCopiedPrompt(false);
      setShowPromptHelp(false);
      setExtractedRecords([]);
      setErrorMessage(null);
      setImportedCount(0);
    }
  }, [isOpen]);

  // Generate Optimal AI Prompt for External AI Camera / Image recognition
  const generateAiPromptText = (format: KakochoPromptFormatType = promptFormat) => {
    if (format === 'label') {
      return `【寺院過去帳・墓碑OCR文字起こし依頼（項目ラベル形式）】
添付の写真（墓碑・墓誌・霊標・位牌・過去帳等）から、記載されている精霊（故人）の情報を漏れなく読み取り、以下の【出力フォーマット】に従って1霊ずつ出力してください。

【対象世帯情報】
・施主/世帯主: ${householdName} 様
・墓地番号: ${householdTomb || '未設定'}

【出力フォーマット】
【戒名】〇〇院釈光徳居士
【俗名】佐藤 徳蔵
【ふりがな】さとう とくぞう
【没年月日】令和4年8月10日
【享年】88歳
【続柄】父
【備考】墓誌右端
---

【厳守ルール】
1. 写真に複数霊ある場合は「---」で区切って全員分を出力してください。
2. 記載がない項目は「なし」または省略してください。
3. 享年は数字または「〇〇歳」、没年月日は元号または西暦で年月日まで記載してください。
4. 挨拶文や前置き文は不要です。データのみを出力してください。`;
    }

    // Default: High-precision CSV format
    return `【寺院過去帳・墓碑OCR文字起こし依頼（CSV形式）】
添付の写真（墓碑・墓誌・霊標・位牌・過去帳原本・メモ等）から精霊（故人）の情報を読み取り、以下の【厳守ルール】に従ってカンマ区切り（CSV形式）で出力してください。

【対象世帯情報】
・施主/世帯主: ${householdName} 様
・墓地番号: ${householdTomb || '未設定'}

【出力列の定義（全7項目・この順番を厳守）】
1. 戒名（法名・法号）
2. 俗名（氏名・本名）
3. ふりがな（ひらがな）
4. 没年月日（例: 令和4年8月10日 または 2022-08-10）
5. 享年（数字のみ または 88歳）
6. 続柄（例: 父、母、祖父、祖母、夫、妻、長男など）
7. 備考（特記事項や墓誌の位置など）

【出力フォーマット】
戒名,俗名,ふりがな,没年月日,享年,続柄,備考
〇〇院釈光徳居士,佐藤 徳蔵,さとう とくぞう,令和4年8月10日,88,父,
清心妙法大姉,佐藤 静江,さとう しずえ,平成22年3月3日,82,母,
智照童子,佐藤 一郎,さとう いちろう,昭和45年5月12日,3,長男,

【厳格な指示】
1. 1行目に必ず上記のヘッダー「戒名,俗名,ふりがな,没年月日,享年,続柄,備考」を出力してください。
2. 1霊につき1行で出力してください。
3. 記載がない項目（例: ふりがなや備考がない場合）は空欄にし、カンマの数を減らさないでください（例: 〇〇院釈光徳居士,佐藤 徳蔵,,令和4年8月10日,88,父,）。
4. 戒名や俗名の間の空白（スペース）は自由ですが、項目を区切るカンマ「,」以外の余分なカンマは含めないでください。
5. 前置き・挨拶文（「はい」「文字起こししました」等）や後書きは一切不要です。純粋なCSVテキストのみを出力してください。`;
  };

  // Copy AI Prompt
  const handleCopyAiPrompt = async (formatToCopy?: KakochoPromptFormatType) => {
    const fmt = formatToCopy || promptFormat;
    const prompt = generateAiPromptText(fmt);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = prompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 4000);
    } catch (e) {
      console.error('Failed to copy prompt', e);
      alert('プロンプトのコピーに失敗しました。');
    }
  };

  // Paste from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setPastedText(clipText);
          setErrorMessage(null);
          return;
        }
      }
    } catch (e) {
      // Permission denied or not supported in iframe/browser
    }
    // If auto paste failed, focus textarea
    const el = document.getElementById('mobile-kakocho-textarea');
    if (el) {
      el.focus();
    }
  };

  // Insert Sample Text
  const handleInsertSample = () => {
    setPastedText(
`戒名,俗名,ふりがな,没年月日,享年,続柄,備考
〇〇院釈光徳居士,佐藤 徳蔵,さとう とくぞう,令和4年8月10日,88,父,墓誌正面
清心妙法大姉,佐藤 静江,さとう しずえ,平成22年3月3日,82,母,
智照童子,佐藤 一郎,さとう いちろう,昭和45年5月12日,3,長男,`
    );
  };

  // Parse Text and Go to Step 2
  const handleParseAndReview = () => {
    if (!targetHousehold) return;
    if (!pastedText.trim()) {
      setErrorMessage('テキストデータを入力または貼り付けてください。');
      return;
    }

    setErrorMessage(null);
    const parsed = parseMobileTextToItems(
      pastedText.trim(),
      targetHousehold,
      currentHouseholdExistingRecords
    );

    if (parsed.length === 0) {
      parsed.push({
        id: `mob-kakocho-${Date.now()}-0`,
        selected: true,
        dharmaName: '',
        secularName: '',
        furigana: '',
        deathDate: '',
        ageAtDeath: undefined,
        relationship: '',
        householdHeadName: targetHousehold.familyHead || '',
        burialLocation: targetHousehold.tombNumber || '',
        notes: '',
        isExpanded: true,
      });
    }

    setExtractedRecords(parsed);
    setCurrentStep('review');
  };

  // Manual Review Entry Mode
  const handleProceedToManual = () => {
    if (!targetHousehold) return;
    setErrorMessage(null);
    setExtractedRecords([
      {
        id: `mob-kakocho-${Date.now()}-0`,
        selected: true,
        dharmaName: '',
        secularName: '',
        furigana: '',
        deathDate: '',
        ageAtDeath: undefined,
        relationship: '',
        householdHeadName: targetHousehold.familyHead || '',
        burialLocation: targetHousehold.tombNumber || '',
        notes: '',
        isExpanded: true,
      },
    ]);
    setCurrentStep('review');
  };

  // Row update helpers
  const handleUpdateItem = (id: string, field: keyof MobileExtractedKakochoItem, value: any) => {
    setExtractedRecords(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const handleNormalizeDate = (id: string) => {
    setExtractedRecords(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const normalized = normalizeDateInput(row.deathDate, { mode: 'pastRecord' });
        if (normalized) {
          return {
            ...row,
            deathDate: formatJapaneseEraDate(normalized, false),
          };
        }
        return row;
      })
    );
  };

  const handleToggleExpand = (id: string) => {
    setExtractedRecords(prev =>
      prev.map(row => row.id === id ? { ...row, isExpanded: !row.isExpanded } : row)
    );
  };

  const handleDeleteItem = (id: string) => {
    setExtractedRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleAddNewItem = () => {
    if (!targetHousehold) return;
    setExtractedRecords(prev => [
      ...prev,
      {
        id: `mob-kakocho-${Date.now()}-${prev.length}`,
        selected: true,
        dharmaName: '',
        secularName: '',
        furigana: '',
        deathDate: '',
        ageAtDeath: undefined,
        relationship: '',
        householdHeadName: targetHousehold.familyHead || '',
        burialLocation: targetHousehold.tombNumber || '',
        notes: '',
        isExpanded: true,
      },
    ]);
  };

  const handleToggleSelectAll = () => {
    const allSelected = extractedRecords.every(r => r.selected);
    setExtractedRecords(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  // Final Import
  const handleExecuteImport = () => {
    if (!targetHousehold) return;

    const selectedItems = extractedRecords.filter(r => r.selected && (r.dharmaName || r.secularName));
    if (selectedItems.length === 0) {
      setErrorMessage('取り込む精霊が選択されていません。戒名または俗名を入力したカードをチェックしてください。');
      return;
    }

    const newPastRecords: PastRecord[] = [];

    selectedItems.forEach((item, idx) => {
      const normalizedDeath = normalizeDateInput(item.deathDate, { mode: 'pastRecord' });
      const autoNiibon = normalizedDeath
        ? calculateNiibonFromDeathDate(normalizedDeath, templeInfo?.bonSeason || '8月盆')
        : undefined;

      const record: PastRecord = {
        id: `past-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
        templeId: targetHousehold.templeId || 'temple-main',
        householdId: targetHousehold.id,
        householdHeadName: item.householdHeadName || targetHousehold.familyHead,
        dharmaName: item.dharmaName || '',
        secularName: item.secularName || '',
        furigana: item.furigana || undefined,
        deathDate: item.deathDate || '',
        ageAtDeath: item.ageAtDeath,
        relationship: item.relationship || '',
        burialLocation: item.burialLocation || targetHousehold.tombNumber || '',
        niibon: autoNiibon,
        notes: item.notes || '',
      };

      newPastRecords.push(record);
    });

    onImportPastRecords(
      newPastRecords,
      `【${householdName} 様】スマホ過去帳取り込み（${newPastRecords.length}霊追加）`
    );

    setImportedCount(newPastRecords.length);
    setCurrentStep('complete');
  };

  if (!isOpen || !targetHousehold) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex flex-col z-50 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-[#1A1A1A] text-[#F9F7F2] px-3.5 py-3 flex items-center justify-between border-b-2 border-[#D4AF37] shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold shrink-0 rounded-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif font-black text-sm text-[#D4AF37] truncate">
              【{householdName} 様】過去帳取込
            </h2>
            <div className="text-[10px] text-gray-400 flex items-center gap-1.5 truncate">
              {householdTomb && <span>墓地: {householdTomb}</span>}
              <span>登録済: {currentHouseholdExistingRecords.length}霊</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1.5 -mr-1 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Wizard Step Progress */}
      <div className="bg-[#EBE7DF] border-b border-[#D1CEC7] px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#444444] shrink-0">
        <div className="flex items-center space-x-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'input' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            1. テキスト貼付
          </span>
          <span>&gt;</span>
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'review' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            2. 精霊確認・校正
          </span>
          <span>&gt;</span>
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'complete' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            3. 完了
          </span>
        </div>
      </div>

      {/* Error Notification */}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-xs text-red-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-bold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 font-bold text-sm px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#F9F7F2]">
        {/* STEP 1: INPUT & AI PROMPT COPY */}
        {currentStep === 'input' && (
          <div className="space-y-3">
            {/* AI Prompt Assistant Banner */}
            <div className="bg-gradient-to-br from-[#FAF5EB] to-[#FFF9F0] border border-[#D4AF37] p-3 rounded-xs shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 font-serif font-black text-xs text-[#8C2D19]">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>AIアプリ（ChatGPT/Gemini等）で撮影して取込</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromptHelp(!showPromptHelp)}
                  className="text-gray-500 hover:text-gray-800 p-0.5 cursor-pointer"
                  title="使い方の説明"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-[#555555] leading-relaxed">
                スマホのカメラで墓碑や過去帳を撮影し、コピーしたプロンプトと一緒にAIへ送信すると、各項目（箱）にぴったり収まるテキストが自動生成されます。
              </p>

              {/* Format selection tabs */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-gray-700 flex items-center justify-between">
                  <span>プロンプト形式を選択:</span>
                  <span className="text-[#8C2D19] font-normal text-[9.5px]">※高精度な「CSV形式」がおすすめ</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-[#EAE5D9] rounded-xs">
                  <button
                    type="button"
                    onClick={() => setPromptFormat('csv')}
                    className={`py-1.5 px-2 text-[10.5px] font-bold rounded-2xs transition-all cursor-pointer text-center ${
                      promptFormat === 'csv'
                        ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs'
                        : 'text-gray-700 hover:bg-white/60'
                    }`}
                  >
                    CSV形式（カンマ区切り・推奨）
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptFormat('label')}
                    className={`py-1.5 px-2 text-[10.5px] font-bold rounded-2xs transition-all cursor-pointer text-center ${
                      promptFormat === 'label'
                        ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs'
                        : 'text-gray-700 hover:bg-white/60'
                    }`}
                  >
                    項目ラベル形式（【戒名】等）
                  </button>
                </div>
              </div>

              {/* Column Box Breakdown Guide */}
              <div className="bg-white/80 border border-[#E0DACB] p-2 rounded-xs space-y-1">
                <div className="text-[10px] font-bold text-[#8C2D19] flex items-center gap-1">
                  <span>📥 自動格納される7つの箱（フィールド順）:</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[9.5px]">
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">① 戒名（法名）</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">② 俗名</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">③ ふりがな</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">④ 没年月日</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">⑤ 享年</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">⑥ 続柄</span>
                  <span className="bg-[#FAF5EB] border border-[#D4AF37]/50 text-gray-800 px-1.5 py-0.5 rounded-2xs">⑦ 備考</span>
                </div>
              </div>

              {/* Prompt Copy Action Button */}
              <button
                type="button"
                onClick={() => handleCopyAiPrompt()}
                className={`w-full py-2.5 px-3 rounded-xs font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs ${
                  copiedPrompt
                    ? 'bg-emerald-700 text-white'
                    : 'bg-[#8C2D19] hover:bg-[#732414] text-white active:scale-[0.98]'
                }`}
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>{promptFormat === 'csv' ? 'CSV用' : 'ラベル用'}プロンプトをコピーしました！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#D4AF37]" />
                    <span>{promptFormat === 'csv' ? 'CSV形式' : 'ラベル形式'}の指示プロンプトをコピー</span>
                  </>
                )}
              </button>

              {/* Copy success guide message */}
              {copiedPrompt && (
                <div className="bg-emerald-50 border border-emerald-300 p-2 rounded-xs text-[11px] text-emerald-900 animate-fade-in space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>クリップボードにコピー完了！</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-emerald-800">
                    <li>スマホのAIアプリ（ChatGPT / Gemini等）を開く</li>
                    <li>墓碑や過去帳の写真を撮影・添付し、このプロンプトを貼り付けて送信</li>
                    <li>AIが出力したテキストをコピーして、下の枠に貼り付けてください（自動で各箱へ振り分けられます）</li>
                  </ol>
                </div>
              )}

              {/* Collapsible Help Steps */}
              {showPromptHelp && (
                <div className="bg-white/90 p-2.5 border border-[#E0DACB] text-[10px] text-[#444444] space-y-1.5 rounded-xs">
                  <div className="font-bold text-[#8C2D19]">💡 かんたん4ステップ:</div>
                  <div className="space-y-1">
                    <div><strong>① 上のボタンを押す</strong>: 最適な文字起こし指示文がコピーされます。</div>
                    <div><strong>② 外部AIアプリを開く</strong>: ChatGPTやGeminiアプリ等を開きます。</div>
                    <div><strong>③ 写真と一緒に送信</strong>: 墓石や位牌の写真を撮影・選択し、プロンプトを貼り付けて送信。</div>
                    <div><strong>④ アプリに戻って貼付</strong>: AIの返信テキストをコピーし、下のテキスト枠にペーストします。</div>
                  </div>
                </div>
              )}
            </div>

            {/* Text Paste Section */}
            <div className="bg-white border border-[#D1CEC7] p-3 rounded-xs space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#1A1A1A] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#8C2D19]" />
                  <span>メモ帳・テキスト内容を貼り付け:</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="px-2 py-0.5 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] border border-[#D4AF37] text-[10px] font-bold rounded-xs flex items-center gap-0.5 cursor-pointer"
                  >
                    <ClipboardPaste className="w-3 h-3 text-[#8C2D19]" />
                    <span>貼付</span>
                  </button>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      className="text-[10px] text-gray-500 hover:text-red-600 underline cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id="mobile-kakocho-textarea"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="ここにテキストを貼り付けてください。&#10;&#10;例:&#10;〇〇院釈光徳居士　佐藤 徳蔵　令和4年8月10日　88歳　父&#10;清心妙法大姉　佐藤 静江　平成22年3月3日　82歳　母"
                rows={7}
                className="w-full bg-[#FAF9F5] border border-[#D1CEC7] p-2.5 text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none rounded-xs"
              />

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleInsertSample}
                  className="text-[10px] text-gray-500 hover:text-[#8C2D19] underline cursor-pointer"
                >
                  サンプルテキストを入力
                </button>
                <button
                  type="button"
                  onClick={handleProceedToManual}
                  className="text-[10px] text-[#1A1A1A] hover:underline font-bold cursor-pointer"
                >
                  直接手動入力で進む &gt;
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 bg-white border border-[#D1CEC7] text-gray-700 text-xs font-bold rounded-xs cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleParseAndReview}
                disabled={!pastedText.trim()}
                className="flex-1 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-[#D4AF37] border border-[#D4AF37] font-bold text-xs rounded-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
              >
                <span>精霊データを展開・確認</span>
                <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & EDIT (MOBILE OPTIMIZED CARDS) */}
        {currentStep === 'review' && (
          <div className="space-y-3">
            {/* Header Controls */}
            <div className="bg-white border border-[#D1CEC7] p-2.5 rounded-xs flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-[11px] font-bold text-[#8C2D19] bg-[#FAF7F0] px-2 py-1 border border-[#D4AF37] rounded-xs cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>{extractedRecords.every(r => r.selected) ? '全解除' : '全選択'}</span>
                </button>
                <span className="text-xs text-gray-700 font-bold">
                  {extractedRecords.filter(r => r.selected).length} / {extractedRecords.length} 霊 選択中
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddNewItem}
                className="px-2.5 py-1 bg-[#1A1A1A] text-[#D4AF37] font-bold text-xs rounded-xs flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>精霊追加</span>
              </button>
            </div>

            {/* Mobile Cards List */}
            <div className="space-y-2.5">
              {extractedRecords.map((item, idx) => {
                const isDup = item.isDuplicate;
                return (
                  <div
                    key={item.id}
                    className={`bg-white border-2 rounded-xs shadow-xs transition-all overflow-hidden ${
                      !item.selected
                        ? 'border-gray-200 opacity-60 bg-gray-50'
                        : isDup
                        ? 'border-amber-400 bg-amber-50/20'
                        : 'border-[#1A1A1A]'
                    }`}
                  >
                    {/* Card Header (Tap to select / expand) */}
                    <div className="bg-[#FAF9F5] border-b border-[#E5E0D8] p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => handleUpdateItem(item.id, 'selected', e.target.checked)}
                          className="w-4 h-4 accent-[#1A1A1A] cursor-pointer shrink-0"
                        />
                        <span className="text-[10px] font-mono text-gray-400 shrink-0">#{idx + 1}</span>
                        <div className="font-serif font-black text-xs text-[#8C2D19] truncate">
                          {item.dharmaName || item.secularName || '（未入力の精霊）'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDup && (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.5 rounded-2xs font-bold">
                            重複注意
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item.id)}
                          className="text-gray-500 hover:text-gray-800 p-1 cursor-pointer"
                        >
                          {item.isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Card Body - Fields for mobile input */}
                    {item.isExpanded && (
                      <div className="p-3 space-y-2.5 text-xs font-sans">
                        {/* Duplicate Alert */}
                        {isDup && (
                          <div className="bg-amber-50 border border-amber-200 p-1.5 rounded-2xs text-[10px] text-amber-900 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{item.duplicateReason}</span>
                          </div>
                        )}

                        {/* 戒名・法名 */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            戒名・法名 <span className="text-red-600">*</span>:
                          </label>
                          <input
                            type="text"
                            value={item.dharmaName}
                            onChange={(e) => handleUpdateItem(item.id, 'dharmaName', e.target.value)}
                            placeholder="例: 〇〇院釈光徳居士"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-2 text-xs font-serif font-bold rounded-xs"
                          />
                        </div>

                        {/* 俗名 & ふりがな */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">俗名:</label>
                            <input
                              type="text"
                              value={item.secularName}
                              onChange={(e) => handleUpdateItem(item.id, 'secularName', e.target.value)}
                              placeholder="例: 佐藤 徳蔵"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs font-serif"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">ふりがな:</label>
                            <input
                              type="text"
                              value={item.furigana}
                              onChange={(e) => handleUpdateItem(item.id, 'furigana', e.target.value)}
                              placeholder="例: さとう とくぞう"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                            />
                          </div>
                        </div>

                        {/* 没年月日 & 享年 */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">没年月日:</label>
                            <input
                              type="text"
                              value={item.deathDate}
                              onChange={(e) => handleUpdateItem(item.id, 'deathDate', e.target.value)}
                              onBlur={() => handleNormalizeDate(item.id)}
                              placeholder="例: 令和4年8月10日"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs font-serif"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">享年:</label>
                            <input
                              type="number"
                              value={item.ageAtDeath !== undefined ? item.ageAtDeath : ''}
                              onChange={(e) => {
                                const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                handleUpdateItem(item.id, 'ageAtDeath', isNaN(val as any) ? undefined : val);
                              }}
                              placeholder="88"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs text-center"
                            />
                          </div>
                        </div>

                        {/* 続柄 (Chips + input) */}
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="block text-[10px] font-bold text-gray-600">続柄:</label>
                            <div className="flex items-center gap-1">
                              {['本人', '父', '母', '夫', '妻', '祖父', '祖母'].map((rel) => (
                                <button
                                  key={rel}
                                  type="button"
                                  onClick={() => handleUpdateItem(item.id, 'relationship', rel)}
                                  className="text-[9px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-1 py-0.5 rounded-2xs cursor-pointer"
                                >
                                  {rel}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={item.relationship}
                            onChange={(e) => handleUpdateItem(item.id, 'relationship', e.target.value)}
                            placeholder="例: 父, 祖母, 長男"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                          />
                        </div>

                        {/* 備考 */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">備考:</label>
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => handleUpdateItem(item.id, 'notes', e.target.value)}
                            placeholder="墓誌記載事項や特記事項"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center gap-2 sticky bottom-0 bg-[#F9F7F2] py-2 border-t border-[#D1CEC7]">
              <button
                type="button"
                onClick={() => setCurrentStep('input')}
                className="w-1/3 py-2.5 bg-white border border-[#D1CEC7] text-gray-700 text-xs font-bold rounded-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>戻る</span>
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                className="flex-1 py-2.5 bg-[#8C2D19] hover:bg-[#732414] text-white font-bold text-xs rounded-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#D4AF37]" />
                <span>
                  {extractedRecords.filter(r => r.selected && (r.dharmaName || r.secularName)).length} 霊を一括取り込み
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: COMPLETE */}
        {currentStep === 'complete' && (
          <div className="bg-white border-2 border-[#1A1A1A] p-6 text-center space-y-4 my-auto shadow-sm rounded-xs">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-black text-base text-[#1A1A1A]">
                過去帳データの取り込みが完了しました
              </h3>
              <p className="text-xs text-gray-600">
                【{householdName} 様】の過去帳に <strong>{importedCount}</strong> 霊の精霊が正常に追加登録されました。
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs rounded-xs cursor-pointer shadow-md"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
