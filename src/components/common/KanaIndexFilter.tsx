import React from 'react';
import { ArrowUpDown, X } from 'lucide-react';
import { KANA_ROWS, KANA_ROW_MAP } from '../../utils/memorialCalculator';

export interface KanaIndexFilterProps {
  selectedRow: string;
  selectedCol?: string;
  onSelectRow: (row: string) => void;
  onSelectCol?: (col: string) => void;
  onReset: () => void;
  className?: string;
  compact?: boolean;
  accentColor?: 'wine' | 'gold' | 'dark';
}

export const KanaIndexFilter: React.FC<KanaIndexFilterProps> = ({
  selectedRow,
  selectedCol = 'ALL',
  onSelectRow,
  onSelectCol,
  onReset,
  className = '',
  compact = false,
  accentColor = 'wine',
}) => {
  const isRowSelected = selectedRow !== 'ALL' && selectedRow !== 'all';
  const subCols = isRowSelected ? KANA_ROW_MAP[selectedRow] || [] : [];

  const getButtonActiveClasses = () => {
    if (accentColor === 'gold') {
      return 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37] shadow-xs font-bold';
    }
    if (accentColor === 'dark') {
      return 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A] shadow-xs font-bold';
    }
    return 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs font-bold';
  };

  const getSubActiveClasses = () => {
    if (accentColor === 'gold') {
      return 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs font-bold';
    }
    return 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37] shadow-xs font-bold';
  };

  return (
    <div className={`space-y-1.5 font-sans ${className}`}>
      {/* Top row: Label and Reset */}
      <div className="flex items-center justify-between text-xs text-gray-500 font-bold px-0.5">
        <span className="flex items-center gap-1.5 text-[#8C2D19]">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>五十音インデックス:</span>
        </span>
        {isRowSelected && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-[#8C2D19] hover:underline font-bold text-xs sm:text-sm cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>解除</span>
          </button>
        )}
      </div>

      {/* Row Buttons (全 あ か さ た な は ま や ら わ) */}
      <div className="grid grid-cols-11 gap-1 text-center font-bold text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => {
            onSelectRow('ALL');
            onSelectCol?.('ALL');
          }}
          className={`py-1.5 rounded-xs transition-all cursor-pointer text-xs sm:text-sm font-bold border ${
            !isRowSelected
              ? getButtonActiveClasses()
              : 'bg-[#FAF8F5] hover:bg-[#EBE7DF] text-gray-700 border-[#D1CEC7]'
          }`}
        >
          全
        </button>

        {KANA_ROWS.map((row) => {
          const isSelected = selectedRow === row;
          return (
            <button
              key={row}
              type="button"
              onClick={() => {
                if (isSelected) {
                  onSelectRow('ALL');
                  onSelectCol?.('ALL');
                } else {
                  onSelectRow(row);
                  onSelectCol?.('ALL');
                }
              }}
              className={`py-1.5 rounded-xs transition-all cursor-pointer text-xs sm:text-sm font-bold border ${
                isSelected
                  ? getButtonActiveClasses()
                  : 'bg-[#FAF8F5] hover:bg-[#EBE7DF] text-gray-700 border-[#D1CEC7]'
              }`}
            >
              {row}
            </button>
          );
        })}
      </div>

      {/* Sub-Column 2nd Level Drill-down (あ い う え お) when row is selected */}
      {isRowSelected && subCols.length > 0 && onSelectCol && (
        <div className="bg-amber-50/80 p-2 rounded-xs border border-amber-300/80 flex items-center gap-1.5 text-xs animate-fadeIn">
          <span className="text-xs text-[#8C2D19] font-bold shrink-0 px-1">
            【{selectedRow}行】
          </span>
          <button
            type="button"
            onClick={() => onSelectCol('ALL')}
            className={`px-2.5 py-1 rounded-xs text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
              selectedCol === 'ALL' || selectedCol === 'all' || !selectedCol
                ? getSubActiveClasses()
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            すべて
          </button>
          {subCols.map((col) => {
            const isColSelected = selectedCol === col;
            return (
              <button
                key={col}
                type="button"
                onClick={() => onSelectCol(isColSelected ? 'ALL' : col)}
                className={`flex-1 py-1 rounded-xs text-xs sm:text-sm font-bold border transition-colors cursor-pointer text-center ${
                  isColSelected
                    ? getSubActiveClasses()
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-amber-100/50'
                }`}
              >
                {col}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
