import React, { useState, useEffect } from 'react';
import {
  NenkiFilterSettings,
  DEFAULT_NENKI_FILTER_SETTINGS,
} from '../utils/memorialCalculator';
import { Filter, Check, RotateCcw, X, CheckSquare, Square } from 'lucide-react';

interface NenkiFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: NenkiFilterSettings;
  onSaveSettings: (newSettings: NenkiFilterSettings) => void;
}

const STANDARD_MILESTONES: { key: string; label: string; subLabel: string }[] = [
  { key: '一周忌', label: '一周忌', subLabel: '満1年（2年目）' },
  { key: '三回忌', label: '三回忌', subLabel: '満2年（3年目）' },
  { key: '七回忌', label: '七回忌', subLabel: '満6年（7年目）' },
  { key: '十三回忌', label: '十三回忌', subLabel: '満12年（13年目）' },
  { key: '十七回忌', label: '十七回忌', subLabel: '満16年（17年目）' },
  { key: '二十三回忌', label: '二十三回忌', subLabel: '満22年（23年目）' },
  { key: '二十七回忌', label: '二十七回忌', subLabel: '満26年（27年目）' },
  { key: '三十三回忌', label: '三十三回忌', subLabel: '満32年（33年目）' },
  { key: '三十七回忌', label: '三十七回忌', subLabel: '満36年（37年目）' },
  { key: '五十回忌', label: '五十回忌', subLabel: '満49年（50年目）' },
  { key: '百回忌', label: '百回忌', subLabel: '満99年（100年目）' },
  { key: '百五十回忌', label: '百五十回忌', subLabel: '満149年（150年目）' },
  { key: '二百回忌', label: '二百回忌', subLabel: '満199年（200年目）' },
];

export const NenkiFilterModal: React.FC<NenkiFilterModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<NenkiFilterSettings>(settings);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleToggleMilestone = (key: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      enabledMilestones: {
        ...prev.enabledMilestones,
        [key]: !prev.enabledMilestones[key],
      },
    }));
  };

  const handleSelectAll = () => {
    const allEnabled: Record<string, boolean> = {};
    STANDARD_MILESTONES.forEach((m) => {
      allEnabled[m.key] = true;
    });
    setLocalSettings((prev) => ({
      ...prev,
      include49Days: true,
      include100Days: true,
      enabledMilestones: allEnabled,
      after200Mode: 'every100',
    }));
  };

  const handleResetToDefault = () => {
    setLocalSettings(DEFAULT_NENKI_FILTER_SETTINGS);
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-stone-300 w-full max-w-xl overflow-hidden font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-stone-900 text-stone-100 px-5 py-4 flex items-center justify-between border-b border-stone-700">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-base font-bold tracking-wide font-serif">表示年忌設定</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Quick Actions */}
          <div className="flex items-center justify-between text-xs pb-3 border-b border-stone-200">
            <span className="text-stone-500">一覧および印刷で対象とする年回忌を選択してください</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 text-xs text-stone-700 bg-stone-100 hover:bg-stone-200 rounded border border-stone-300 transition-colors cursor-pointer flex items-center space-x-1"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>全選択</span>
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2.5 py-1 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 rounded border border-amber-300 transition-colors cursor-pointer flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>標準に戻す</span>
              </button>
            </div>
          </div>

          {/* Section 1: 中陰・百ヶ日 */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-stone-700 font-serif border-l-3 border-[#D4AF37] pl-2">
              中陰忌日・百ヶ日
            </h4>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <label className="flex items-center space-x-2 p-2.5 rounded border border-stone-200 hover:bg-stone-50 cursor-pointer text-xs font-serif transition-colors">
                <input
                  type="checkbox"
                  checked={localSettings.include49Days}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      include49Days: e.target.checked,
                    }))
                  }
                  className="rounded text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-stone-900">四十九日忌</span>
                  <span className="text-[11px] text-stone-500 ml-1 font-sans">（満48日）</span>
                </div>
              </label>
              <label className="flex items-center space-x-2 p-2.5 rounded border border-stone-200 hover:bg-stone-50 cursor-pointer text-xs font-serif transition-colors">
                <input
                  type="checkbox"
                  checked={localSettings.include100Days}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      include100Days: e.target.checked,
                    }))
                  }
                  className="rounded text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-stone-900">百ヶ日忌</span>
                  <span className="text-[11px] text-stone-500 ml-1 font-sans">（満99日）</span>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: 主な年回忌 */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-stone-700 font-serif border-l-3 border-[#D4AF37] pl-2">
              年回忌（一周忌〜二百回忌）
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {STANDARD_MILESTONES.map((m) => {
                const isChecked = Boolean(localSettings.enabledMilestones[m.key]);
                return (
                  <label
                    key={m.key}
                    className={`flex items-start space-x-2 p-2 rounded border cursor-pointer text-xs transition-colors ${
                      isChecked
                        ? 'bg-amber-50/60 border-amber-300 text-stone-900'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleMilestone(m.key)}
                      className="mt-0.5 rounded text-[#D4AF37] focus:ring-0 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-serif font-bold text-stone-900">{m.label}</span>
                      <span className="text-[10px] text-stone-500">{m.subLabel}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 3: 二百回忌以降の設定 */}
          <div className="space-y-2 bg-stone-50 p-3.5 rounded-md border border-stone-200">
            <h4 className="text-xs font-bold text-stone-800 font-serif">
              二百回忌以降の表示間隔
            </h4>
            <p className="text-[11px] text-stone-500">
              二百回忌を超える遠忌精霊の表示ルールを設定します。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <label
                className={`flex items-center space-x-2 p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                  localSettings.after200Mode === 'every100'
                    ? 'bg-white border-[#D4AF37] font-bold text-stone-900 shadow-xs'
                    : 'bg-white/80 border-stone-200 text-stone-700 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="after200Mode"
                  value="every100"
                  checked={localSettings.after200Mode === 'every100'}
                  onChange={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      after200Mode: 'every100',
                    }))
                  }
                  className="text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div>百年間隔</div>
                  <div className="text-[10px] text-stone-500 font-normal">300・400・500回忌...</div>
                </div>
              </label>

              <label
                className={`flex items-center space-x-2 p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                  localSettings.after200Mode === 'every50'
                    ? 'bg-white border-[#D4AF37] font-bold text-stone-900 shadow-xs'
                    : 'bg-white/80 border-stone-200 text-stone-700 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="after200Mode"
                  value="every50"
                  checked={localSettings.after200Mode === 'every50'}
                  onChange={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      after200Mode: 'every50',
                    }))
                  }
                  className="text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div>五十年間隔</div>
                  <div className="text-[10px] text-stone-500 font-normal">250・300・350回忌...</div>
                </div>
              </label>

              <label
                className={`flex items-center space-x-2 p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                  localSettings.after200Mode === 'none'
                    ? 'bg-white border-[#D4AF37] font-bold text-stone-900 shadow-xs'
                    : 'bg-white/80 border-stone-200 text-stone-700 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="after200Mode"
                  value="none"
                  checked={localSettings.after200Mode === 'none'}
                  onChange={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      after200Mode: 'none',
                    }))
                  }
                  className="text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div>表示しない</div>
                  <div className="text-[10px] text-stone-500 font-normal">200回忌超は非表示</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-stone-100 px-5 py-3.5 border-t border-stone-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200 rounded border border-stone-300 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 rounded shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4 text-[#D4AF37]" />
            <span>設定を保存して適用</span>
          </button>
        </div>
      </div>
    </div>
  );
};
