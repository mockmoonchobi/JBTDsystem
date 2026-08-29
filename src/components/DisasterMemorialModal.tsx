import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, RotateCcw, Save, AlertTriangle, Calendar, Info, Check } from 'lucide-react';
import { DisasterMemorialEvent } from '../types';
import { 
  getSavedDisasterMemorialEvents, 
  saveDisasterMemorialEvents, 
  DEFAULT_DISASTER_MEMORIAL_EVENTS 
} from '../utils/disasterMemorialUtils';
import { normalizeDateInput, getJapaneseEra, getSpiritMemorialForDate } from '../utils/memorialCalculator';

interface DisasterMemorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (events: DisasterMemorialEvent[]) => void;
}

export const DisasterMemorialModal: React.FC<DisasterMemorialModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [events, setEvents] = useState<DisasterMemorialEvent[]>([]);
  const [initialEvents, setInitialEvents] = useState<DisasterMemorialEvent[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<boolean>(false);

  // Load saved events when opening
  useEffect(() => {
    if (isOpen) {
      const loaded = getSavedDisasterMemorialEvents();
      setEvents(JSON.parse(JSON.stringify(loaded)));
      setInitialEvents(JSON.parse(JSON.stringify(loaded)));
      setShowCloseConfirm(false);
      setValidationError(null);
      setSaveSuccessMsg(false);
    }
  }, [isOpen]);

  // Check if data has been modified
  const isModified = useMemo(() => {
    return JSON.stringify(events) !== JSON.stringify(initialEvents);
  }, [events, initialEvents]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    const newId = `disaster-${Date.now()}`;
    setEvents((prev) => [
      ...prev,
      {
        id: newId,
        date: '',
        name: '',
        notes: '',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  const handleFieldChange = (id: string, field: 'date' | 'name' | 'notes', value: string) => {
    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id === id) {
          return { ...ev, [field]: value };
        }
        return ev;
      })
    );
  };

  const handleResetToDefaults = () => {
    if (window.confirm('戦没・災害物故者命日設定を初期プリセットデータ（6件）に戻しますか？')) {
      setEvents(JSON.parse(JSON.stringify(DEFAULT_DISASTER_MEMORIAL_EVENTS)));
    }
  };

  const handleSave = () => {
    // Validate
    const invalidRow = events.find((ev) => {
      const norm = normalizeDateInput(ev.date);
      return !norm || !ev.name.trim();
    });

    if (invalidRow) {
      setValidationError('有効な年月日（例: 2011/3/11 や 平成23年3月11日）および対象名称を入力してください。');
      return;
    }

    // Save
    saveDisasterMemorialEvents(events);
    setInitialEvents(JSON.parse(JSON.stringify(events)));
    setValidationError(null);
    setSaveSuccessMsg(true);

    if (onSaved) {
      onSaved(events);
    }

    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleRequestClose = () => {
    if (isModified) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmSaveAndClose = () => {
    handleSave();
  };

  const handleConfirmDiscardAndClose = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex items-center justify-center p-3 sm:p-4 print:hidden">
      <div className="bg-[#FAF9F5] text-[#1A1A1A] border-2 border-[#D4AF37] shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden rounded-xs">
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-6 py-4 border-b border-[#D4AF37] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-[#2A2A2A] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                戦没・災害物故者命日設定
              </h2>
              <p className="text-[11px] text-[#D4AF37] tracking-wider">
                日別供養精霊案内・直近供養精霊印刷時の命日特別表記管理
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="text-stone-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Guide */}
        <div className="bg-[#F3EFE6] px-6 py-3 border-b border-[#E5E0D5] flex items-start space-x-2.5 text-xs text-[#555555]">
          <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            ここで設定した年月日が到来した際、直近の供養精霊印刷の表題部（通常「供養精霊」）が、設定した対象名称に置き換わります。<br />
            例: 3月11日印刷時 → <span className="font-bold text-[#1A1A1A]">「三月十一日　東日本大震災物故者精霊　十七回忌」</span>（忌日該当時は回忌名も自動追記）
          </div>
        </div>

        {/* Error Alert */}
        {validationError && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-2.5 text-xs text-red-700 font-bold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Table Body Container */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="border border-[#D1CEC7] rounded bg-white shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F0ECE1] text-[#333333] border-b border-[#D1CEC7] font-serif font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">No</th>
                  <th className="py-2.5 px-3 w-48">命日・発生年月日</th>
                  <th className="py-2.5 px-3 w-44">和暦・回忌目安</th>
                  <th className="py-2.5 px-3">対象名称（印刷表記）</th>
                  <th className="py-2.5 px-3 w-48">備考・由来</th>
                  <th className="py-2.5 px-3 w-14 text-center">削除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE6DD]">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400 font-bold">
                      設定されている戦没・災害物故者命日データがありません。「行を追加」ボタンから追加してください。
                    </td>
                  </tr>
                ) : (
                  events.map((ev, idx) => {
                    const norm = normalizeDateInput(ev.date);
                    let eraStr = '—';
                    let currentYearMilestone = '';
                    if (norm) {
                      const p = norm.split('/');
                      if (p.length === 3) {
                        const y = parseInt(p[0], 10);
                        const m = parseInt(p[1], 10);
                        const d = parseInt(p[2], 10);
                        eraStr = getJapaneseEra(y, m, d);
                        const now = new Date();
                        const thisYearStr = `${now.getFullYear()}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
                        currentYearMilestone = getSpiritMemorialForDate(norm, thisYearStr);
                      }
                    }

                    return (
                      <tr key={ev.id} className="hover:bg-[#FAF9F5] transition-colors">
                        <td className="py-2.5 px-3 text-center text-stone-500 font-mono font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={ev.date}
                            onChange={(e) => handleFieldChange(ev.id, 'date', e.target.value)}
                            placeholder="2011/3/11 または 平成23年3月11日"
                            className="w-full bg-white border border-[#CCCCCC] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded px-2.5 py-1.5 text-xs font-mono text-[#1A1A1A] outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-stone-600 font-serif">
                          <div className="font-bold text-[#1A1A1A]">{eraStr}</div>
                          {currentYearMilestone && (
                            <div className="text-[11px] text-amber-700 font-bold mt-0.5">
                              当年: {currentYearMilestone}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={ev.name}
                            onChange={(e) => handleFieldChange(ev.id, 'name', e.target.value)}
                            placeholder="例: 東日本大震災物故者精霊"
                            className="w-full bg-white border border-[#CCCCCC] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded px-2.5 py-1.5 text-xs font-serif font-bold text-[#1A1A1A] outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={ev.notes || ''}
                            onChange={(e) => handleFieldChange(ev.id, 'notes', e.target.value)}
                            placeholder="例: 平成23年 東日本大震災"
                            className="w-full bg-white border border-[#CCCCCC] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded px-2.5 py-1.5 text-xs text-stone-600 outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(ev.id)}
                            className="p-1 text-stone-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="この行を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="px-3.5 py-2 bg-white hover:bg-[#F3EFE6] text-[#1A1A1A] border border-[#CCCCCC] hover:border-[#D4AF37] rounded text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>新規行を追加</span>
              </button>

              <button
                type="button"
                onClick={handleResetToDefaults}
                className="px-3 py-2 bg-transparent hover:bg-stone-200 text-stone-600 rounded text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                title="初期プリセットデータ（6件）に初期化"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>初期データに戻す</span>
              </button>
            </div>

            <div className="text-xs text-stone-500">
              全 <span className="font-bold text-[#1A1A1A]">{events.length}</span> 件登録中
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#F0ECE1] px-6 py-3.5 border-t border-[#D1CEC7] flex items-center justify-between">
          <div className="text-xs text-stone-500">
            {isModified ? (
              <span className="text-amber-700 font-bold">※ 変更が加えられています</span>
            ) : (
              <span>※ 変更はありません</span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded text-xs font-bold transition-colors cursor-pointer"
            >
              閉じる
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] rounded text-xs font-bold flex items-center space-x-1.5 transition-colors shadow cursor-pointer"
            >
              {saveSuccessMsg ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>保存完了</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-[#D4AF37]" />
                  <span>保存して閉じる</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Save Confirmation Dialog when closing with unsaved changes */}
        {showCloseConfirm && (
          <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white border border-[#D4AF37] rounded-xs shadow-2xl max-w-md w-full p-5 space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-bold text-stone-900">
                    変更内容を保存しますか？
                  </h3>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                    戦没・災害物故者命日設定に変更が加えられています。保存せずに閉じると、変更内容は破棄されます。
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowCloseConfirm(false)}
                  className="w-full sm:w-auto px-3.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  編集を続ける
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscardAndClose}
                  className="w-full sm:w-auto px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  保存せずに閉じる
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveAndClose}
                  className="w-full sm:w-auto px-4 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] rounded text-xs font-bold flex items-center justify-center space-x-1 transition-colors shadow cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>保存して閉じる</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
