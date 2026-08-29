import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  description?: string;
  itemName?: string;
  confirmButtonText?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title = '削除の確認',
  message = '削除しますか？',
  description,
  itemName,
  confirmButtonText,
  confirmLabel,
  onConfirm,
  onCancel,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleCancel = onCancel || onClose || (() => {});
  const buttonText = confirmButtonText || confirmLabel || '削除';

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
      <div className="bg-white border-2 border-rose-800 p-6 max-w-sm w-full text-[#2D2D2D] space-y-4 shadow-2xl rounded-xs">
        <div className="flex items-center space-x-3 text-rose-800 border-b border-[#EBE7DF] pb-3">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <h3 className="text-lg font-bold tracking-wider">{title}</h3>
        </div>

        <div className="space-y-2 text-sm text-[#333333] font-sans">
          <p className="font-bold text-base text-[#1A1A1A]">{message}</p>
          {itemName && (
            <div className="p-2.5 bg-[#FFF0F0] border border-rose-200 text-rose-900 font-serif font-bold text-xs">
              対象: {itemName}
            </div>
          )}
          {description ? (
            <p className="text-xs text-[#666666] leading-relaxed whitespace-pre-wrap">{description}</p>
          ) : (
            <p className="text-xs text-[#666666]">この操作は取り消せません。本当に削除してよろしいですか？</p>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#EBE7DF] font-sans">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-white border border-[#D1CEC7] text-[#333333] hover:bg-[#F9F7F2] font-bold text-xs transition-colors"
          >
            取り消し
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-rose-800 hover:bg-rose-900 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};
