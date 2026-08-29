import React from 'react';
import { Save, AlertCircle, X, Check, ArrowLeft } from 'lucide-react';

interface SaveConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  description?: string;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}

export const SaveConfirmModal: React.FC<SaveConfirmModalProps> = ({
  isOpen,
  title = '保存の確認',
  message = '入力中の変更内容を保存しますか？',
  description = '「保存して閉じる」を押すと、変更内容が反映されて画面が閉じます。「保存せずに閉じる」を押すと、変更内容は破棄されます。',
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
      <div className="bg-white border border-[#D4AF37] p-6 max-w-md w-full text-[#2D2D2D] space-y-4 shadow-2xl rounded-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-3">
          <div className="flex items-center space-x-2.5 text-[#1A1A1A]">
            <div className="w-8 h-8 bg-[#FAF6EC] border border-[#D4AF37] flex items-center justify-center text-[#B8860B] rounded-xs shrink-0">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider">{title}</h3>
              <p className="text-[11px] text-[#888888] font-sans">確認ポップアップ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#999999] hover:text-[#1A1A1A] p-1 transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <div className="space-y-2 text-sm text-[#333333] font-sans py-1">
          <p className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{message}</span>
          </p>
          <p className="text-xs text-[#666666] leading-relaxed">
            {description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-[#EBE7DF] font-sans">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 bg-white border border-[#D1CEC7] text-[#555555] hover:bg-[#F9F7F2] font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>編集を続ける</span>
          </button>

          <button
            type="button"
            onClick={onDiscardAndClose}
            className="px-3.5 py-2 bg-[#FFF5F5] border border-rose-300 text-rose-800 hover:bg-rose-100 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>保存せずに閉じる</span>
          </button>

          <button
            type="button"
            onClick={onSaveAndClose}
            className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Check className="w-4 h-4 text-[#D4AF37]" />
            <span>保存して閉じる</span>
          </button>
        </div>
      </div>
    </div>
  );
};
