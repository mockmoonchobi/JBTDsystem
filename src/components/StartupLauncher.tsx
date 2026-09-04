import React, { useRef, useState } from 'react';
import { 
  FolderUp, 
  FileSpreadsheet, 
  FilePlus2, 
  Sparkles, 
  Upload, 
  Cloud, 
  CheckCircle2, 
  ArrowRight,
  Database,
  ShieldCheck,
  Building2,
  HelpCircle
} from 'lucide-react';

interface StartupLauncherProps {
  isOpen: boolean;
  onStartWithEmpty: () => void;
  onStartWithTutorial: () => void;
  onStartWithFile: (file: File) => Promise<void>;
  onStartWithGoogleSheets: () => Promise<void> | void;
  onCancelLoading?: () => void;
  isLoading?: boolean;
  loadingMessage?: string;
  isStaffInvite?: boolean;
}

export const StartupLauncher: React.FC<StartupLauncherProps> = ({
  isOpen,
  onStartWithEmpty,
  onStartWithTutorial,
  onStartWithFile,
  onStartWithGoogleSheets,
  onCancelLoading,
  isLoading = false,
  loadingMessage = 'データを読み込み中...',
  isStaffInvite = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setErrorMsg(null);
      try {
        await onStartWithFile(files[0]);
      } catch (err: any) {
        setErrorMsg(err.message || 'ファイルの読み込みに失敗しました。');
      }
    }
  };

  const handleGoogleSheetsClick = async () => {
    if (isLoading) return;
    setErrorMsg(null);
    try {
      await onStartWithGoogleSheets();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('closed-by-user') ||
        err?.message?.includes('キャンセル')
      ) {
        // キャンセルの場合はエラー表示を行わず待機状態に戻す
        setErrorMsg(null);
      } else {
        setErrorMsg(err?.message || 'Googleシートとの連携に失敗しました。');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      try {
        await onStartWithFile(e.dataTransfer.files[0]);
      } catch (err: any) {
        setErrorMsg(err.message || 'ファイルの読み込みに失敗しました。');
      }
    }
  };

  const triggerFileInput = () => {
    setErrorMsg(null);
    fileInputRef.current?.click();
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-[#0D0D0D]/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input for JSON / Excel */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="w-full max-w-4xl bg-[#1A1A1A] border-2 border-[#D4AF37]/70 rounded-md shadow-2xl overflow-hidden text-[#F9F7F2] font-sans my-auto">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-[#141414] via-[#242424] to-[#141414] px-5 py-6 sm:px-8 sm:py-7 border-b border-[#D4AF37]/40 text-center relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rotate-45 border-2 border-[#D4AF37] bg-[#2A2A2A] text-[#D4AF37] mb-3 shadow-md">
            <span className="-rotate-45 font-serif font-black text-xl">蓮</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-serif font-black tracking-widest text-[#F9F7F2]">
            蓮華 <span className="text-[#D4AF37] font-normal text-base sm:text-2xl">| 寺院総合管理システム</span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-[#CCCCCC] max-w-xl mx-auto font-sans leading-relaxed">
            起動方法を選択してください。お使いの運用スタイルに合わせてデータ読込または新規作成を開始できます。
          </p>
        </div>

        {/* Error / Loading Notification */}
        {isLoading && (
          <div className="bg-amber-950/80 border-b border-amber-500/60 p-4 text-center text-amber-200 text-sm font-bold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="truncate">{loadingMessage}</span>
            </div>
            {onCancelLoading && (
              <button
                type="button"
                onClick={onCancelLoading}
                className="text-xs bg-amber-900/80 hover:bg-amber-800 text-amber-100 border border-amber-500/40 px-3 py-1 rounded transition-colors shrink-0"
              >
                中断
              </button>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-950/80 border-b border-rose-500/60 p-3.5 text-center text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        {/* 4 Launch Options Grid */}
        <div className="p-4 sm:p-7">
          {isStaffInvite && (
            <div className="mb-5 p-4 sm:p-5 rounded-sm border-2 border-amber-500 bg-[#241C12] shadow-xl text-left animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm sm:text-base">
                  <span className="text-xl sm:text-2xl">👤</span>
                  <span>スタッフモードで招待されました</span>
                </div>
                <span className="px-2.5 py-1 bg-amber-500 text-stone-950 font-bold text-xs sm:text-sm rounded-xs">
                  スマホ版・機能制限モード
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-100/90 mt-2 leading-relaxed">
                寺院管理者様から共有されたスプレッドシートへのデータ連携が準備されています。
                「Googleアカウントでスタッフ連携を開始」を押すと、共有データに直接接続しスタッフモード（世帯・過去帳の追加/削除不可、予定・受付は全機能可能）として起動します。
              </p>
              <button
                type="button"
                onClick={handleGoogleSheetsClick}
                disabled={isLoading}
                className="mt-3.5 w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:from-amber-600 active:to-amber-700 text-stone-950 font-bold text-sm sm:text-base rounded-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                <Cloud className="w-5 h-5 text-stone-950" />
                <span>Googleアカウントでスタッフ連携を開始</span>
                <ArrowRight className="w-5 h-5 text-stone-950" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            
            {/* 1. PCからデータ読み込み */}
            <div
              onClick={triggerFileInput}
              className={`group relative flex flex-col justify-between p-4 sm:p-5 rounded-sm border-2 transition-all cursor-pointer ${
                isDragging
                  ? 'border-[#D4AF37] bg-[#2A2A2A]'
                  : 'border-[#444444] hover:border-[#D4AF37] bg-[#222222] hover:bg-[#282828]'
              } shadow-sm hover:shadow-lg`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-sm bg-[#333333] group-hover:bg-[#D4AF37] text-[#D4AF37] group-hover:text-[#1A1A1A] flex items-center justify-center transition-colors">
                    <FolderUp className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 bg-[#333333] text-[#D4AF37] text-[10px] sm:text-xs font-bold rounded-sm border border-[#555555]">
                    JSON / Excel対応
                  </span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-[#F9F7F2] group-hover:text-[#D4AF37] transition-colors flex items-center gap-1.5">
                    <span>PCからデータ読み込み</span>
                  </h3>
                  <p className="text-xs text-[#AAAAAA] mt-1 leading-relaxed">
                    以前保存したバックアップ（JSONファイル）または檀家・過去帳のExcelデータを取り込んで立ち上げます。
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#383838] flex items-center justify-between text-xs font-bold text-[#D4AF37]">
                <span className="flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  ファイルを選択またはドロップ
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 2. Googleシートとデータ連携 */}
            <div
              onClick={handleGoogleSheetsClick}
              className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-sm border-2 border-[#444444] hover:border-emerald-500 bg-[#222222] hover:bg-[#282828] transition-all cursor-pointer shadow-sm hover:shadow-lg"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-sm bg-[#333333] group-hover:bg-emerald-600 text-emerald-400 group-hover:text-white flex items-center justify-center transition-colors">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] sm:text-xs font-bold rounded-sm border border-emerald-700/60">
                    Googleシートと連携
                  </span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-[#F9F7F2] group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                    <span>Googleシートとデータ連携</span>
                  </h3>
                  <p className="text-xs text-[#AAAAAA] mt-1 leading-relaxed">
                    Googleシートのデータを読み込み、Googleアカウントと認証連携して自動同期を開始します。
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#383838] flex items-center justify-between text-xs font-bold text-emerald-400">
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Googleシートと連携
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 3. データ無しで立ち上げ */}
            <div
              onClick={onStartWithEmpty}
              className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-sm border-2 border-[#444444] hover:border-sky-500 bg-[#222222] hover:bg-[#282828] transition-all cursor-pointer shadow-sm hover:shadow-lg"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-sm bg-[#333333] group-hover:bg-sky-600 text-sky-400 group-hover:text-white flex items-center justify-center transition-colors">
                    <FilePlus2 className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 bg-sky-950 text-sky-300 text-[10px] sm:text-xs font-bold rounded-sm border border-sky-700/60">
                    新規作成 (空データ)
                  </span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-[#F9F7F2] group-hover:text-sky-300 transition-colors flex items-center gap-1.5">
                    <span>データ無しで立ち上げ</span>
                  </h3>
                  <p className="text-xs text-[#AAAAAA] mt-1 leading-relaxed">
                    寺院情報や檀家名簿・過去帳を完全に空の状態で立ち上げ、新しい寺院データの入力を始めます。
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#383838] flex items-center justify-between text-xs font-bold text-sky-400">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  白紙の状態で新規スタート
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 4. チュートリアルデータ（ダミーデータ）ありで立ち上げ */}
            <div
              onClick={onStartWithTutorial}
              className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-sm border-2 border-[#444444] hover:border-amber-500 bg-[#222222] hover:bg-[#282828] transition-all cursor-pointer shadow-sm hover:shadow-lg"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-sm bg-[#333333] group-hover:bg-amber-600 text-amber-400 group-hover:text-white flex items-center justify-center transition-colors">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 bg-amber-950 text-amber-300 text-[10px] sm:text-xs font-bold rounded-sm border border-amber-700/60">
                    体験・サンプル
                  </span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-[#F9F7F2] group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                    <span>チュートリアルデータありで立ち上げ</span>
                  </h3>
                  <p className="text-xs text-[#AAAAAA] mt-1 leading-relaxed">
                    本寺「圓福寺」と兼務寺院「宝蔵寺」のサンプル檀家・過去帳・法要・会計データが入った状態で機能をお試しいただけます。
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#383838] flex items-center justify-between text-xs font-bold text-amber-400">
                <span className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5" />
                  サンプルデータで開始
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

          </div>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-[#333333] flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#888888] gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>入力されたデータはブラウザおよび連携したGoogleドライブ内に安全に保持されます。</span>
            </div>
            <div className="text-[#AAAAAA]">
              いつでもヘッダーからデータの書き出し・読み込みが可能です
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
