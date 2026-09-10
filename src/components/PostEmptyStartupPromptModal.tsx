import React from 'react';
import { Database, Users, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

interface PostEmptyStartupPromptModalProps {
  isOpen: boolean;
  onSelectImport: () => void;
  onSelectManual: () => void;
}

export const PostEmptyStartupPromptModal: React.FC<PostEmptyStartupPromptModalProps> = ({
  isOpen,
  onSelectImport,
  onSelectManual,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-[#1A1A1A] border-2 border-[#D4AF37] rounded-xl shadow-2xl w-full max-w-xl overflow-hidden text-[#F9F7F2]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#181818] via-[#282828] to-[#181818] px-6 py-5 border-b border-[#D4AF37]/40 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/50 text-[#D4AF37] text-xs font-bold mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>寺院基本情報の登録完了</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold font-serif text-[#F9F7F2] tracking-wide">
            このままデータ取り込みウィザードに移行しますか？
          </h3>
          <p className="text-xs text-[#AAAAAA] mt-2 leading-relaxed max-w-md mx-auto">
            寺院情報の設定が完了しました。続けて、他寺院管理システムやExcel/CSV等の既存名簿データを取り込みますか？
            それとも手動で名簿を入力していきますか？
          </p>
        </div>

        {/* Action Selection Cards */}
        <div className="p-6 space-y-4">
          {/* Option 1: データ取込をする */}
          <button
            type="button"
            onClick={onSelectImport}
            className="w-full text-left p-4 rounded-lg bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-transparent border-2 border-emerald-500/70 hover:border-emerald-400 hover:bg-emerald-950/60 transition-all group cursor-pointer shadow-lg relative overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-emerald-600/30 border border-emerald-500/50 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-colors shrink-0 mt-0.5">
                <Database className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-emerald-300 group-hover:text-white transition-colors">
                      データ取込をする
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      おすすめ
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-emerald-400 transform group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                </div>
                <p className="text-xs text-[#CCCCCC] mt-1.5 leading-relaxed">
                  他社寺院管理ソフトやExcel・CSVから、檀家名簿・過去帳・出納帳・法要履歴などを一括でインポートします。
                </p>
                <div className="mt-2 text-[11px] text-emerald-400/90 font-medium">
                  → 他データベース・CSV/Excel取り込みウィザードを起動
                </div>
              </div>
            </div>
          </button>

          {/* Option 2: 手動で入力する */}
          <button
            type="button"
            onClick={onSelectManual}
            className="w-full text-left p-4 rounded-lg bg-[#222222] border border-[#444444] hover:border-[#D4AF37] hover:bg-[#2A2A2A] transition-all group cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-[#2D2D2D] border border-[#555555] text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-colors shrink-0 mt-0.5">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-[#F9F7F2] group-hover:text-[#D4AF37] transition-colors">
                    手動で入力する
                  </span>
                  <ArrowRight className="w-5 h-5 text-[#888888] group-hover:text-[#D4AF37] transform group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                </div>
                <p className="text-xs text-[#AAAAAA] mt-1.5 leading-relaxed">
                  一括取り込みは行わず、そのまま檀家名簿画面に進んで1件ずつ新規登録を開始します。
                </p>
                <div className="mt-2 text-[11px] text-[#888888] font-medium group-hover:text-[#D4AF37] transition-colors">
                  → 既定の檀家名簿画面へ進む
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 bg-[#141414] border-t border-[#333333] text-center text-[11px] text-[#888888]">
          ※データ取り込みは、後からいつでも画面上部の「データ連携」や各一覧の「外部データ取込」から実行できます。
        </div>
      </div>
    </div>
  );
};
