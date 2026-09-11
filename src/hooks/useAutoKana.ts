import { useRef, useCallback, useEffect } from 'react';
import { normalizeFurigana } from '../utils/memorialCalculator';

export interface UseAutoKanaOptions {
  /** 氏名フィールドの現在値 */
  nameValue: string;
  /** ふりがなフィールドの現在値 */
  furiganaValue: string;
  /** 氏名変更時のコールバック */
  onNameChange: (newName: string) => void;
  /** ふりがな変更時のコールバック */
  onFuriganaChange: (newFurigana: string) => void;
  /**
   * 初期状態でふりがながカスタマイズ済み（自動上書きしない）か
   * 省略時は、furiganaValue が既に存在していれば true になります。
   */
  initialCustomized?: boolean;
}

/**
 * 漢字判定（漢字が含まれているかどうか）
 */
function containsKanji(str: string): boolean {
  return /[\u4E00-\u9FAF\u3400-\u4DBF]/.test(str);
}

/**
 * 全角・半角スペースを保持しながらカタカナ・ひらがなを正規化
 */
function convertKanaPreservingSpaces(text: string): string {
  if (!text) return '';
  // 全角スペース・半角スペースの区切りをキャプチャして保持
  const parts = text.split(/([ \u3000]+)/);
  return parts
    .map((part) => {
      if (/^[ \u3000]+$/.test(part)) {
        return part;
      }
      return normalizeFurigana(part);
    })
    .join('');
}

/**
 * 連続する全角・半角スペースを1つに統合（2つ以上の連続スペースを防止）
 */
function collapseSpaces(str: string): string {
  return str.replace(/[ \u3000]+/g, (match) => (match.includes('　') ? '　' : ' '));
}

/**
 * 日本語IME入力を検知し、氏名の入力・確定時にふりがなを自動入力するカスタムフック
 * 
 * - 氏名のタイピング（ひらがな・カタカナ打鍵）をリアルタイムにバッファへ保持
 * - 漢字変換確定（compositionend）時に自動でふりがな欄へひらがなを反映
 * - ひらがな・カタカナ直接確定時も自動反映
 * - 全角/半角スペース（姓と名の間: 「吉岡　忠志」→「よしおか　ただし」）を確実に1文字分同期
 * - ユーザーが手動でふりがなを編集した場合は自動上書きを停止（誤上書き防止）
 * - 氏名欄を全消去した場合は自動同期モードにリセット
 */
export function useAutoKana({
  nameValue,
  furiganaValue,
  onNameChange,
  onFuriganaChange,
  initialCustomized,
}: UseAutoKanaOptions) {
  const isComposingRef = useRef(false);
  // 漢字に変換される直前の打鍵文字（ひらがな・カタカナ・スペース）
  const lastNonKanjiKanaRef = useRef('');
  // 最新の値を非同期・イベント間でも即時参照するためのRef
  const nameValueRef = useRef(nameValue);
  nameValueRef.current = nameValue;
  const furiganaValueRef = useRef(furiganaValue);
  furiganaValueRef.current = furiganaValue;

  // 手動でふりがなが修正されたかどうかのフラグ
  const isCustomizedRef = useRef(
    initialCustomized !== undefined
      ? initialCustomized
      : (Boolean(furiganaValue) && furiganaValue.trim().length > 0)
  );

  // 外部からの更新でふりがなが空になった場合は自動同期モードを復帰
  useEffect(() => {
    if (!furiganaValue || furiganaValue.trim() === '') {
      isCustomizedRef.current = false;
    }
  }, [furiganaValue]);

  // 氏名入力欄の compositionstart イベント（IME入力開始）
  const handleNameCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    lastNonKanjiKanaRef.current = '';
  }, []);

  // 氏名入力欄の compositionupdate イベント（IME入力中・変換前候補）
  const handleNameCompositionUpdate = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    const data = e.data;
    if (data && !containsKanji(data)) {
      lastNonKanjiKanaRef.current = data;
    } else if (!data) {
      lastNonKanjiKanaRef.current = '';
    }
  }, []);

  // 氏名入力欄の compositionend イベント（変換確定時）
  const handleNameCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const finalData = e.data;

    // バックスペースやEscape等で入力をキャンセル・消去した場合、何も追加しない
    if (!finalData) {
      lastNonKanjiKanaRef.current = '';
      return;
    }

    let kanaToAppend = '';
    // 確定文字列に漢字が含まれる場合 -> 変換前のひらがなバッファを採用
    if (containsKanji(finalData)) {
      if (lastNonKanjiKanaRef.current) {
        kanaToAppend = convertKanaPreservingSpaces(lastNonKanjiKanaRef.current);
      }
    } else {
      // 確定文字列自体がひらがな・カタカナ・スペース等の場合
      kanaToAppend = convertKanaPreservingSpaces(finalData);
    }

    // 手動編集されていない場合のみ、ふりがなに反映
    if (kanaToAppend && !isCustomizedRef.current) {
      let currentFuri = furiganaValueRef.current || '';

      // スペース確定時の二重追加防止
      if (kanaToAppend === '　' || kanaToAppend === ' ') {
        // ふりがなが空、または既に末尾がスペースの場合は追加しない
        if (!currentFuri || currentFuri.endsWith('　') || currentFuri.endsWith(' ')) {
          kanaToAppend = '';
        }
      } else {
        // 【スペース補正レイヤー】
        // 「吉岡（変換）　（スペース）忠志（変換）」のように氏名欄にスペースが存在し、
        // かつふりがな側にまだスペースが1つも含まれていない場合のみ、姓名間のスペースを1つ挿入
        const inputEl = e.currentTarget as HTMLInputElement | null;
        const currentNameInput = inputEl ? inputEl.value : (nameValueRef.current || '');
        
        if (!currentFuri.includes('　') && !currentFuri.includes(' ')) {
          if (currentNameInput.includes('　')) {
            currentFuri = `${currentFuri}　`;
          } else if (currentNameInput.includes(' ')) {
            currentFuri = `${currentFuri} `;
          }
        }
      }

      if (kanaToAppend || currentFuri !== (furiganaValueRef.current || '')) {
        let newFuri = currentFuri ? `${currentFuri}${kanaToAppend}` : kanaToAppend;
        newFuri = collapseSpaces(newFuri);
        furiganaValueRef.current = newFuri;
        onFuriganaChange(newFuri);
      }
    }

    lastNonKanjiKanaRef.current = '';
  }, [onFuriganaChange]);

  // 氏名入力欄の onChange イベント
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    const prevName = nameValueRef.current || '';
    nameValueRef.current = newName;

    // 氏名欄の入力を最優先で通知（バックスペースや文字入力を絶対に妨げない）
    onNameChange(newName);

    // 氏名が完全に空になった場合のみ、ふりがなもクリアして自動同期モードを復帰
    if (newName === '') {
      furiganaValueRef.current = '';
      onFuriganaChange('');
      isCustomizedRef.current = false;
      lastNonKanjiKanaRef.current = '';
      return;
    }

    // スペースの即時追従（文字追加時のみ実行。二重スペースは絶対に作らない）
    if (!isCustomizedRef.current && newName.length > prevName.length) {
      const currentFuri = furiganaValueRef.current || '';

      // 氏名の末尾に全角または半角スペースが新たに入力された場合
      if (newName.endsWith('　') && !prevName.endsWith('　')) {
        if (currentFuri && !currentFuri.endsWith('　') && !currentFuri.endsWith(' ')) {
          const nextFuri = collapseSpaces(`${currentFuri}　`);
          furiganaValueRef.current = nextFuri;
          onFuriganaChange(nextFuri);
        }
      } else if (newName.endsWith(' ') && !prevName.endsWith(' ')) {
        if (currentFuri && !currentFuri.endsWith('　') && !currentFuri.endsWith(' ')) {
          const nextFuri = collapseSpaces(`${currentFuri} `);
          furiganaValueRef.current = nextFuri;
          onFuriganaChange(nextFuri);
        }
      }
    }
  }, [onNameChange, onFuriganaChange]);

  // ふりがな入力欄の onChange イベント（手動編集時）
  const handleFuriganaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    isCustomizedRef.current = true; // 手動編集されたので自動補完を停止
    furiganaValueRef.current = val;
    onFuriganaChange(val);
  }, [onFuriganaChange]);

  // ふりがな自動生成モードをリセット・再開
  const resetFurigana = useCallback(() => {
    isCustomizedRef.current = false;
    lastNonKanjiKanaRef.current = '';
    furiganaValueRef.current = '';
    onFuriganaChange('');
  }, [onFuriganaChange]);

  return {
    isCustomized: isCustomizedRef.current,
    resetFurigana,
    nameInputProps: {
      value: nameValue,
      onChange: handleNameChange,
      onCompositionStart: handleNameCompositionStart,
      onCompositionUpdate: handleNameCompositionUpdate,
      onCompositionEnd: handleNameCompositionEnd,
    },
    furiganaInputProps: {
      value: furiganaValue,
      onChange: handleFuriganaChange,
    },
  };
}
