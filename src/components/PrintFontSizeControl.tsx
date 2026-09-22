import React from 'react';
import { Type, RotateCcw } from 'lucide-react';

interface PrintFontSizeControlProps {
  scale: number;
  onChange: (newScale: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

const PRESET_OPTIONS = [
  { value: 0.75, label: '極小 (75%)' },
  { value: 0.85, label: '小 (85%)' },
  { value: 0.9, label: 'やや小 (90%)' },
  { value: 1.0, label: '標準 (100%)' },
  { value: 1.1, label: 'やや大 (110%)' },
  { value: 1.15, label: '大 (115%)' },
  { value: 1.25, label: '特大 (125%)' },
  { value: 1.35, label: '極大 (135%)' },
  { value: 1.5, label: '最大 (150%)' },
];

export const PrintFontSizeControl: React.FC<PrintFontSizeControlProps> = ({
  scale,
  onChange,
  min = 0.7,
  max = 1.6,
  step = 0.05,
  className = '',
}) => {
  const roundedPercent = Math.round(scale * 100);

  const handleDecrease = () => {
    const next = Math.max(min, Math.round((scale - step) * 100) / 100);
    onChange(next);
  };

  const handleIncrease = () => {
    const next = Math.min(max, Math.round((scale + step) * 100) / 100);
    onChange(next);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onChange(val);
    }
  };

  const handleReset = () => {
    onChange(1.0);
  };

  // Find if current scale matches a preset
  const isPreset = PRESET_OPTIONS.some((opt) => Math.abs(opt.value - scale) < 0.01);

  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-white border border-[#CCCCCC] px-2 py-1 select-none text-xs ${className}`}
      title="印刷・画面表示の文字サイズを調整"
    >
      <div className="flex items-center gap-1 text-[#444444] font-bold shrink-0">
        <Type className="w-3.5 h-3.5 text-[#8B7024]" />
        <span>文字サイズ:</span>
      </div>

      <select
        value={isPreset ? scale.toFixed(2) : ''}
        onChange={handleSelect}
        aria-label="文字サイズの基準倍率"
        className="bg-transparent border-none text-xs font-bold text-[#1A1A1A] cursor-pointer focus:outline-none pr-1"
      >
        {!isPreset && <option value="">カスタム ({roundedPercent}%)</option>}
        {PRESET_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value.toFixed(2)}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="flex items-center border border-[#DDDDDD] bg-[#F7F6F2] rounded-none overflow-hidden shrink-0">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={scale <= min}
          aria-label="文字サイズを縮小"
          title="文字を小さく (5%縮小)"
          className="px-1.5 py-0.5 text-xs font-bold text-[#333333] hover:bg-[#EBE7DF] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          −
        </button>
        <span className="px-1.5 py-0.5 text-[11px] font-mono font-bold text-[#1A1A1A] min-w-[36px] text-center bg-white border-x border-[#DDDDDD]">
          {roundedPercent}%
        </span>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={scale >= max}
          aria-label="文字サイズを拡大"
          title="文字を大きく (5%拡大)"
          className="px-1.5 py-0.5 text-xs font-bold text-[#333333] hover:bg-[#EBE7DF] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          ＋
        </button>
      </div>

      {Math.abs(scale - 1.0) >= 0.02 && (
        <button
          type="button"
          onClick={handleReset}
          aria-label="文字サイズを標準(100%)に戻す"
          title="標準(100%)に戻す"
          className="text-[#666666] hover:text-[#1A1A1A] p-0.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
