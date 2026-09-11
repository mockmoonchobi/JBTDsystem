import React from 'react';
import { useAutoKana } from '../hooks/useAutoKana';

interface HouseholdHeadInlineEditorProps {
  familyHead: string;
  furigana: string;
  onChangeHead: (head: string) => void;
  onChangeFurigana: (furi: string) => void;
}

export const HouseholdHeadInlineEditor: React.FC<HouseholdHeadInlineEditorProps> = ({
  familyHead,
  furigana,
  onChangeHead,
  onChangeFurigana,
}) => {
  const { isCustomized, resetFurigana, nameInputProps, furiganaInputProps } = useAutoKana({
    nameValue: familyHead || '',
    furiganaValue: furigana || '',
    onNameChange: onChangeHead,
    onFuriganaChange: onChangeFurigana,
  });

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center space-x-2 max-w-sm">
        <input
          type="text"
          placeholder="フリガナ（自動入力）"
          {...furiganaInputProps}
          className="bg-[#2A2A2A] text-white border border-[#555] px-2 py-1 text-xs flex-1 focus:outline-none focus:border-[#D4AF37]"
        />
        {isCustomized && furigana && (
          <button
            type="button"
            onClick={resetFurigana}
            className="text-[10px] text-[#AAAAAA] hover:text-white underline cursor-pointer shrink-0"
            title="フリガナを自動再同期"
          >
            再同期
          </button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="世帯主名"
          {...nameInputProps}
          className="bg-white text-[#1A1A1A] border border-[#D4AF37] px-3 py-1 font-bold text-lg w-full max-w-sm focus:outline-none"
        />
        <span className="text-[#CCCCCC]">様</span>
      </div>
    </div>
  );
};
