import React from 'react';
import { AlertTriangle, X, FileSpreadsheet, Download, Undo2, Redo2, ShieldAlert } from 'lucide-react';

interface GoogleSheetsUndoInterruptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionType?: 'undo' | 'redo';
}

export const GoogleSheetsUndoInterruptModal: React.FC<GoogleSheetsUndoInterruptModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionType = 'undo',
}) => {
  if (!isOpen) return null;

  const isUndo = actionType === 'undo';
  const actionLabel = isUndo ? '元に戻す' : 'やり直す';
  const confirmButtonText = isUndo ? '元に戻すを実行' : 'やり直すを実行';

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
      <div className="bg-[#FAF8F5] border-2 border-amber-600 max-w-lg w-full text-[#2D2D2D] shadow-2xl rounded-xs overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#222222] text-[#F9F7F2] px-5 py-3.5 flex items-center justify-between border-b border-amber-600/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider text-[#F9F7F2]">
                Googleシート連携の中断確認
              </h3>
              <p className="text-[11px] font-sans text-amber-300/90 font-normal">
                {actionLabel}の実行に伴う同期一時停止
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#999999] hover:text-[#FFFFFF] p-1 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 font-sans text-sm">
          {/* Exact Prompt Message Box */}
          <div className="p-4 bg-amber-50 border border-amber-200 text-[#2D2D2D] rounded-xs shadow-xs space-y-2">
            <p className="leading-relaxed font-bold text-sm text-[#1A1A1A]">
              Googleシート連携中は「元に戻す」「やり直す」が機能しない為、バックアップを実行後、一時シートとの連携を中断します。処理が終わった後に「Googleシートを初期化して書込」を押して連携を開始してください。
            </p>
          </div>

          {/* Sequence summary */}
          <div className="bg-white border border-[#E0DBD1] p-3.5 rounded-xs space-y-2 text-xs text-[#555555]">
            <div className="font-bold text-[#1A1A1A] flex items-center gap-1.5 pb-1 border-b border-[#EBE7DF]">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>「{confirmButtonText}」を押した際の実行フロー:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-[#444444] pl-1 leading-normal">
              <li>
                <strong className="text-[#1A1A1A]">Googleシート連携の解除:</strong> 常時同期を一旦安全に停止します。
              </li>
              <li>
                <strong className="text-[#1A1A1A]">全寺院データの一括書き出し:</strong> 現在のデータをExcelファイル（.xlsx）として即座に自動バックアップ保存します。
              </li>
              <li>
                <strong className="text-[#1A1A1A]">{actionLabel}の実行:</strong> 直前の状態へデータを巻き戻します。
              </li>
            </ol>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="bg-[#EFECE6] px-5 py-3.5 border-t border-[#DCD7CD] flex items-center justify-end space-x-3 font-sans">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[#F3F0E9] border border-[#CCCCCC] text-[#444444] font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 bg-[#8C2D19] hover:bg-[#A3351E] active:bg-[#732414] text-white font-bold text-xs tracking-wider transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            {isUndo ? <Undo2 className="w-3.5 h-3.5" /> : <Redo2 className="w-3.5 h-3.5" />}
            <span>{confirmButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
