import React from 'react';
import { CloudOff, ArrowLeft, PlusCircle, AlertCircle } from 'lucide-react';

interface GoogleDriveEmptyConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  mode: 'startup' | 'inApp';
  isLoading?: boolean;
}

export const GoogleDriveEmptyConfirmModal: React.FC<GoogleDriveEmptyConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const isStartup = mode === 'startup';

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md bg-[#1E1E1E] border-2 border-[#D4AF37]/80 rounded-md shadow-2xl text-[#F9F7F2] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#141414] border-b border-[#333333] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
            <CloudOff className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-serif font-bold text-[#F9F7F2]">
              Googleドライブにデータがありません
            </h3>
            <p className="text-[11px] text-[#AAAAAA]">
              寺院データ（スプレッドシート）の確認
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs sm:text-sm leading-relaxed text-[#DDDDDD]">
          <div className="bg-[#282828] p-3.5 rounded border border-[#3E3E3E] space-y-2">
            <div className="flex items-start gap-2 text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-bold">
                Googleドライブ内にデータファイルが見つかりませんでした。
              </span>
            </div>
            <p className="text-[#BBBBBB] pl-6 text-xs leading-relaxed">
              {isStartup ? (
                <>
                  ログインされたGoogleアカウントのドライブ内に「寺院管理・檀家過去帳データ」が存在しません。
                  <br className="hidden sm:inline" />
                  新たに<strong className="text-white">データ無しのGoogleシートを作成</strong>して立ち上げますか？
                </>
              ) : (
                <>
                  ログインされたGoogleアカウントのドライブ内に「寺院管理・檀家過去帳データ」が存在しません。
                  <br className="hidden sm:inline" />
                  <strong className="text-white">現在端末に記憶されているデータを書き込んで</strong>、新たにGoogleシートを作成しますか？
                </>
              )}
            </p>
          </div>

          <p className="text-[11px] text-[#999999]">
            ※「戻る」を押すと作成は行われず、元の画面に戻ります。
          </p>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#171717] px-5 py-3.5 border-t border-[#333333] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xs border border-[#555555] bg-[#2A2A2A] hover:bg-[#383838] active:bg-[#202020] text-[#DDDDDD] font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>戻る</span>
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2 rounded-xs bg-[#D4AF37] hover:bg-[#C29F2D] active:bg-[#B08F23] text-stone-950 font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
                <span>作成中...</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{isStartup ? '新たにデータ無しのGoogleシートを作成' : '新たにGoogleシートを作成'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
