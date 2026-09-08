import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Eye,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { TempleInfo, TempleProfile, PastRecord } from '../types';
import {
  TanagyoDateSlotGroup,
  generateTanagyoEmailHtml,
  generateTanagyoEmailPlainText,
  copyHtmlToClipboard,
} from '../utils/tanagyoEmailUtils';

interface TanagyoEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  priest: {
    id?: string;
    name: string;
    role?: string;
    email?: string;
  };
  dateGroups: TanagyoDateSlotGroup[];
  totalCount: number;
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  pastRecords?: PastRecord[];
  onUpdatePriestEmail?: (priestId: string, email: string) => void;
}

export const TanagyoEmailModal: React.FC<TanagyoEmailModalProps> = ({
  isOpen,
  onClose,
  priest,
  dateGroups,
  totalCount,
  templeInfo,
  temples = [],
  pastRecords = [],
  onUpdatePriestEmail,
}) => {
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'preview' | 'text'>('preview');
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  // 初期値のセット
  useEffect(() => {
    if (isOpen) {
      const email = priest.email || '';
      setRecipientEmail(email);
      const tName = templeInfo.name || '寺院';
      setSubject(`【お盆棚経巡回計画】${priest.name} 師 （${tName}）`);
      setHasCopied(false);
    }
  }, [isOpen, priest, templeInfo]);

  // HTMLおよびテキストの生成
  const emailHtml = useMemo(() => {
    return generateTanagyoEmailHtml({
      priestName: priest.name,
      priestRole: priest.role,
      priestEmail: recipientEmail,
      templeInfo,
      temples,
      dateGroups,
      totalCount,
      pastRecords,
    });
  }, [priest, recipientEmail, templeInfo, temples, dateGroups, totalCount, pastRecords]);

  const emailPlainText = useMemo(() => {
    return generateTanagyoEmailPlainText({
      priestName: priest.name,
      priestRole: priest.role,
      templeInfo,
      temples,
      dateGroups,
      totalCount,
      pastRecords,
    });
  }, [priest, templeInfo, temples, dateGroups, totalCount, pastRecords]);

  // モーダルが開いた際に自動でクリップボードへコピー
  useEffect(() => {
    if (isOpen && emailHtml) {
      copyHtmlToClipboard(emailHtml, emailPlainText).then((success) => {
        if (success) {
          setHasCopied(true);
        }
      });
    }
  }, [isOpen, emailHtml, emailPlainText]);

  if (!isOpen) return null;

  // 手動またはメーラー起動時のコピー実行
  const performCopy = async (): Promise<boolean> => {
    const success = await copyHtmlToClipboard(emailHtml, emailPlainText);
    if (success) {
      setHasCopied(true);
      setTimeout(() => setHasCopied(true), 1500);
    }
    // メールアドレスが変更された場合の保存
    if (priest.id && onUpdatePriestEmail && recipientEmail.trim() !== priest.email) {
      onUpdatePriestEmail(priest.id, recipientEmail.trim());
    }
    return success;
  };

  // Gmail作成画面を開く
  const handleOpenGmail = async () => {
    await performCopy();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      recipientEmail.trim()
    )}&su=${encodeURIComponent(subject.trim())}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  };

  // 規定のメーラーを開く
  const handleOpenDefaultMailer = async () => {
    await performCopy();
    const mailtoUrl = `mailto:${encodeURIComponent(
      recipientEmail.trim()
    )}?subject=${encodeURIComponent(subject.trim())}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 font-sans no-print animate-in fade-in">
      <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-3xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden rounded-xs">
        {/* ヘッダー */}
        <div className="bg-[#1A1A1A] text-[#D4AF37] p-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 font-bold text-sm tracking-wider">
            <Mail className="w-4 h-4 text-[#D4AF37]" />
            <span>担当僧侶へ巡回計画メール送信 （{priest.name} 師）</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コピー完了・送信案内のトップバナー */}
        <div className="bg-amber-50 border-b-2 border-amber-300 p-3.5 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <div className="flex-1">
              <div className="text-xs sm:text-sm font-black text-[#8C2D19] leading-snug">
                下記の内容がコピーされていますので、メーラーを開いたら貼り付けをして送信してください。
              </div>
              <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                ※「Gmailを開く」または「規定のメーラーを開く」を押すと、宛先と件名がセットされた新規メールが開きます。本文に貼り付け（Ctrl+V または右クリックで「貼り付け」）してそのまま送信できます。
              </p>
            </div>
          </div>
        </div>

        {/* 宛先・件名フォーム ＆ メーラー起動ボタン */}
        <div className="p-3.5 bg-[#FAFAF8] border-b border-gray-300 shrink-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 送信先メールアドレス */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                <span>
                  宛先（担当僧侶のメールアドレス） <span className="text-red-600">*</span>
                </span>
                {!priest.email && (
                  <span className="text-[10px] text-amber-700 font-normal">
                    ※僧侶台帳に未登録
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="example@temple.jp"
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-bold border border-gray-300 rounded-xs bg-white text-gray-900 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden"
                />
                <Mail className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
              </div>
            </div>

            {/* 件名 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                メール件名
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-xs bg-white text-gray-900 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden"
              />
            </div>
          </div>

          {/* 2つの主要ボタン（Gmailを開く / 規定のメーラーを開く） */}
          <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* タブ切り替え */}
            <div className="flex items-center space-x-1 border border-gray-300 rounded-xs p-0.5 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-[#1A1A1A] text-[#D4AF37]'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>HTML表プレビュー</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'text'
                    ? 'bg-[#1A1A1A] text-[#D4AF37]'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>テキスト形式</span>
              </button>
            </div>

            {/* 2つのボタン */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenGmail}
                className="flex-1 sm:flex-initial px-4 py-2 bg-[#EA4335] hover:bg-[#D93025] active:bg-[#B31412] text-white text-xs font-bold rounded-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                title="Gmailの新規メール作成画面を開きます（内容はコピー済み）"
              >
                <ExternalLink className="w-3.5 h-3.5 text-white" />
                <span>Gmailを開く</span>
              </button>

              <button
                type="button"
                onClick={handleOpenDefaultMailer}
                className="flex-1 sm:flex-initial px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white text-xs font-bold rounded-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                title="OutlookやMac Mailなどの既定メールアプリを開きます（内容はコピー済み）"
              >
                <Mail className="w-3.5 h-3.5 text-white" />
                <span>規定のメーラーを開く</span>
              </button>

              {/* 手動再コピーボタン */}
              <button
                type="button"
                onClick={() => performCopy()}
                className="px-2.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors shrink-0"
                title="念のため再度クリップボードにコピー"
              >
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span className="hidden md:inline">{hasCopied ? 'コピー済' : '再コピー'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* プレビューエリア */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
          {activeTab === 'preview' ? (
            <div className="bg-white border border-gray-300 rounded-xs p-1 shadow-xs max-w-2xl mx-auto">
              <iframe
                title="メールHTMLプレビュー"
                srcDoc={emailHtml}
                className="w-full h-[430px] border-none rounded-xs"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-2">
              <pre className="p-4 bg-white border border-gray-300 rounded-xs text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed shadow-xs">
                {emailPlainText}
              </pre>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-3 bg-white border-t border-gray-300 flex items-center justify-between gap-2 text-xs text-gray-600 shrink-0">
          <div className="text-[11px] text-gray-500">
            巡回件数: <strong className="text-gray-800 font-black">{totalCount}</strong> 軒 | 担当: <strong className="text-gray-800 font-black">{priest.name} 師</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenGmail}
              className="px-3 py-1.5 bg-[#EA4335] hover:bg-[#D93025] text-white font-bold text-xs rounded-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors sm:hidden"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Gmailを開く</span>
            </button>
            <button
              type="button"
              onClick={handleOpenDefaultMailer}
              className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors sm:hidden"
            >
              <Mail className="w-3 h-3" />
              <span>規定メーラー</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xs cursor-pointer transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
