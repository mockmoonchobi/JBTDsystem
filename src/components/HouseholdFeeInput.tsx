import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Household, TempleInfo } from '../types';
import { getHouseholdFeeAmount, setHouseholdFeeAmount } from '../utils/feeUtils';

interface HouseholdFeeInputProps {
  household: Household;
  activeFeeType: string;
  currentActiveTemple: TempleInfo;
  onEditHousehold: (updated: Household) => void;
}

/**
 * 檀家名簿一覧テーブルの集金・護持会費セル入力コンポーネント
 * 
 * 【パフォーマンス最適化】
 * 入力中（タイピング・数字の打ち込み）はローカルステートのみで即時更新し、
 * 親コンポーネント（App / HouseholdList）の全檀家データ更新および全行再描画を100%遮断します。
 * フォーカス離脱（onBlur）、Enterキー押下、またはタイピング停止後の自動保存により、
 * 確実に入力データを永続化します。
 */
export const HouseholdFeeInput: React.FC<HouseholdFeeInputProps> = React.memo(({
  household,
  activeFeeType,
  currentActiveTemple,
  onEditHousehold,
}) => {
  const currentAmount = getHouseholdFeeAmount(household, activeFeeType, currentActiveTemple);
  
  const [localText, setLocalText] = useState<string>(
    currentAmount !== undefined ? String(currentAmount) : ''
  );
  
  const isFocusedRef = useRef(false);
  const committedAmountRef = useRef<number | undefined>(currentAmount);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 外部からの更新（他のモーダルや一括操作で金額が変わった場合、または世帯/集金種別が変わった場合）に同期
  useEffect(() => {
    const extAmount = getHouseholdFeeAmount(household, activeFeeType, currentActiveTemple);
    committedAmountRef.current = extAmount;
    if (!isFocusedRef.current) {
      setLocalText(extAmount !== undefined ? String(extAmount) : '');
    }
  }, [household.id, household.fee1Amount, household.fee2Amount, household.fee3Amount, activeFeeType, currentActiveTemple]);

  const commitValue = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const cleanDigits = localText.trim().replace(/[^0-9]/g, '');
    const newAmount = cleanDigits !== '' ? parseInt(cleanDigits, 10) : undefined;

    // 前回の保存値と差分がある場合のみ親に通知
    if (newAmount !== committedAmountRef.current) {
      committedAmountRef.current = newAmount;
      const updated = setHouseholdFeeAmount(household, activeFeeType, newAmount, currentActiveTemple);
      onEditHousehold(updated);
    }
  }, [localText, household, activeFeeType, currentActiveTemple, onEditHousehold]);

  // コンポーネント破棄時に未保存分があればコミット
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setLocalText(raw);

    // タイピング停止後 1秒で自動コミット（EnterやTabを押さなくても安心）
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const cleanDigits = raw.trim();
      const newAmount = cleanDigits !== '' ? parseInt(cleanDigits, 10) : undefined;
      if (newAmount !== committedAmountRef.current) {
        committedAmountRef.current = newAmount;
        const updated = setHouseholdFeeAmount(household, activeFeeType, newAmount, currentActiveTemple);
        onEditHousehold(updated);
      }
    }, 1000);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      // ESCキーで元の値に戻す
      setLocalText(committedAmountRef.current !== undefined ? String(committedAmountRef.current) : '');
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      e.currentTarget.blur();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    e.currentTarget.select();
  };

  return (
    <div className="flex items-center justify-center">
      <div className="relative flex items-center">
        <span className="absolute left-1.5 text-[10px] text-[#888888] font-bold select-none pointer-events-none">
          ¥
        </span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="—"
          value={localText}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-20 pl-4 pr-1.5 py-1 text-xs text-right font-mono font-bold bg-white border border-[#D1CEC7] hover:border-[#888888] focus:border-[#D4AF37] focus:bg-[#FAF9F5] focus:outline-none transition-colors"
          title={`${household.familyHead || '世帯主'} 様: ${activeFeeType} 金額（半角数字）`}
        />
      </div>
    </div>
  );
});
