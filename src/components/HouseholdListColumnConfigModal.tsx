import React, { useState, useEffect } from 'react';
import { X, Check, ArrowUp, ArrowDown, RotateCcw, SlidersHorizontal, CheckSquare, Square, Eye, EyeOff, Lock } from 'lucide-react';
import { ListColumnConfig, ListColumnKey } from './HouseholdList';

interface HouseholdListColumnConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ListColumnConfig[];
  onSave: (newColumns: ListColumnConfig[]) => void;
  defaultColumns: ListColumnConfig[];
}

export const HouseholdListColumnConfigModal: React.FC<HouseholdListColumnConfigModalProps> = ({
  isOpen,
  onClose,
  columns,
  onSave,
  defaultColumns,
}) => {
  const [localColumns, setLocalColumns] = useState<ListColumnConfig[]>(columns);

  useEffect(() => {
    if (isOpen) {
      setLocalColumns(columns);
    }
  }, [isOpen, columns]);

  if (!isOpen) return null;

  const handleToggle = (key: ListColumnKey) => {
    setLocalColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setLocalColumns((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= localColumns.length - 1) return;
    setLocalColumns((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleSelectAll = (enabled: boolean) => {
    setLocalColumns((prev) => prev.map((c) => ({ ...c, enabled })));
  };

  const handleResetToDefault = () => {
    setLocalColumns(defaultColumns.map((c) => ({ ...c })));
  };

  const handleSave = () => {
    onSave(localColumns);
    onClose();
  };

  const enabledCount = localColumns.filter((c) => c.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-[#FAF9F5] border border-[#1A1A1A] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-6 py-4 flex items-center justify-between border-b border-[#D4AF37]">
          <div className="flex items-center space-x-2.5">
            <SlidersHorizontal className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base font-bold tracking-wider">名簿リスト表示項目の編集・並び順設定</h2>
              <p className="text-[11px] text-[#AAAAAA] mt-0.5">
                表示する項目を選択し、矢印ボタンでリストの列順序を自由に並び替えます
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#CCCCCC] hover:text-white hover:bg-[#333333] transition-colors rounded-xs cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info & Tool Bar */}
        <div className="p-4 bg-[#F0EFEA] border-b border-[#D1CEC7] space-y-3">
          {/* Constant Columns Notification */}
          <div className="flex items-center space-x-2 text-xs text-[#555555] bg-white border border-[#D1CEC7] p-2.5">
            <Lock className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>
              <strong>「施主名」</strong>および<strong>「抽出外ボタン」</strong>は名簿の必須基本情報のため、常時表示されます。
            </span>
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleSelectAll(true)}
                className="px-2.5 py-1 bg-white hover:bg-[#EBE7DF] border border-[#D1CEC7] text-[#2D2D2D] font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[#1A1A1A]" />
                <span>全て表示 ({localColumns.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectAll(false)}
                className="px-2.5 py-1 bg-white hover:bg-[#EBE7DF] border border-[#D1CEC7] text-[#2D2D2D] font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
              >
                <Square className="w-3.5 h-3.5 text-[#888888]" />
                <span>全て非表示</span>
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-[#D1CEC7] hover:border-amber-300 text-amber-900 font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                title="初期配置（デフォルト）の設定に戻します"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>初期設定に戻す</span>
              </button>
            </div>
            <div className="text-xs text-[#666666] font-bold">
              表示選択中: <strong className="text-[#1A1A1A] font-mono text-sm">{enabledCount}</strong> / {localColumns.length} 項目
            </div>
          </div>
        </div>

        {/* Scrollable Column List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
          {localColumns.map((col, index) => {
            return (
              <div
                key={col.key}
                className={`flex items-center justify-between p-3 border transition-colors ${
                  col.enabled
                    ? 'bg-white border-[#1A1A1A] shadow-xs'
                    : 'bg-[#F5F4F0] border-[#D1CEC7] text-[#888888] opacity-75'
                }`}
              >
                {/* Left: Checkbox & Label */}
                <div
                  className="flex items-center space-x-3 flex-1 cursor-pointer select-none"
                  onClick={() => handleToggle(col.key)}
                >
                  <div className="font-mono text-xs font-bold text-[#888888] w-6 text-center">
                    {index + 1}
                  </div>
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => handleToggle(col.key)}
                    className="w-4 h-4 text-[#1A1A1A] rounded-none border-[#888888] focus:ring-[#D4AF37] cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-bold ${col.enabled ? 'text-[#1A1A1A]' : 'text-[#777777]'}`}>
                        {col.label}
                      </span>
                      {col.enabled ? (
                        <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          <Eye className="w-3 h-3 mr-0.5 inline" /> 表示
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-300">
                          <EyeOff className="w-3 h-3 mr-0.5 inline" /> 非表示
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#777777] mt-0.5">{col.description}</p>
                  </div>
                </div>

                {/* Right: Move Up / Down Buttons */}
                <div className="flex items-center space-x-1 pl-3 border-l border-[#EBE7DF]">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMoveUp(index)}
                    className={`p-1.5 border transition-colors ${
                      index === 0
                        ? 'border-transparent text-gray-300 cursor-not-allowed'
                        : 'border-[#D1CEC7] hover:border-[#1A1A1A] bg-white hover:bg-[#FAF9F5] text-[#2D2D2D] cursor-pointer shadow-2xs'
                    }`}
                    title="上へ移動（列の左側へ）"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === localColumns.length - 1}
                    onClick={() => handleMoveDown(index)}
                    className={`p-1.5 border transition-colors ${
                      index === localColumns.length - 1
                        ? 'border-transparent text-gray-300 cursor-not-allowed'
                        : 'border-[#D1CEC7] hover:border-[#1A1A1A] bg-white hover:bg-[#FAF9F5] text-[#2D2D2D] cursor-pointer shadow-2xs'
                    }`}
                    title="下へ移動（列の右側へ）"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#F0EFEA] border-t border-[#D1CEC7] flex items-center justify-between">
          <div className="text-xs text-[#666666]">
            ※ 設定はブラウザに自動保存されます
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#D1CEC7] bg-white hover:bg-[#FAF9F5] text-[#444444] font-bold text-xs transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs tracking-wider transition-colors cursor-pointer flex items-center space-x-1.5 shadow-xs"
            >
              <Check className="w-4 h-4 text-[#D4AF37]" />
              <span>設定を保存して適用</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
