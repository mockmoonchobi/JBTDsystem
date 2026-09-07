import React, { useState, useMemo } from 'react';
import { 
  Mail, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  Eye, 
  FileText, 
  User, 
  AlertCircle,
  Smartphone
} from 'lucide-react';
import { Household, TempleInfo, TempleProfile, PastRecord, Priest } from '../types';
import { 
  generateTanagyoMailHtml, 
  generateTanagyoMailPlainText, 
  copyTanagyoRichHtmlToClipboard 
} from '../utils/tanagyoMailUtils';

interface TanagyoEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  priestName: string;
  priestRole?: string;
  priestTemple?: string;
  dates: {
    date: string;
    slots: {
      timeSlot: string;
      households: Household[];
    }[];
  }[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  pastRecords?: PastRecord[];
  priests?: Priest[];
  onUpdatePriest?: (priest: Priest) => void;
}

export const TanagyoEmailModal: React.FC<TanagyoEmailModalProps> = ({
  isOpen,
  onClose,
  priestName,
  priestRole,
  priestTemple,
  dates,
  templeInfo,
  temples = [],
  pastRecords = [],
  priests = [],
  onUpdatePriest,
}) => {
  // 担当僧侶マスタの検索
  const matchedPriest = useMemo(() => {
    return priests.find((p) => p.name === priestName || p.id === priestName);
  }, [priests, priestName]);

  // 入力用メールアドレス
  const [recipientEmail, setRecipientEmail] = useState<string>(() => {
    return matchedPriest?.email || '';
  });

  // 僧侶マスタにも保存するフラグ
  const [saveToMaster, setSaveToMaster] = useState(true);

  // 件名
  const [subject, setSubject] = useState<string>(() => {
    return `【お盆棚経 巡回計画】${priestName} 師 （${templeInfo.mountainName ? templeInfo.mountainName + ' ' : ''}${templeInfo.name}）`;
  });

  // 表示タブ: 'html' | 'text'
  const [activeTab, setActiveTab] = useState<'html' | 'text'>('html');

  // コピー完了ステート
  const [copyStatus, setCopyStatus] = useState<'idle' | 'html-copied' | 'text-copied' | 'gmail-opened' | 'mailer-opened'>('idle');

  // HTML & プレーンテキストの生成
  const htmlContent = useMemo(() => {
    return generateTanagyoMailHtml({
      priestName,
      priestRole,
      priestTemple,
      dates,
      templeInfo,
      temples,
      pastRecords,
    });
  }, [priestName, priestRole, priestTemple, dates, templeInfo, temples, pastRecords]);

  const plainTextContent = useMemo(() => {
    return generateTanagyoMailPlainText({
      priestName,
      priestRole,
      priestTemple,
      dates,
      templeInfo,
      temples,
      pastRecords,
    });
  }, [priestName, priestRole, priestTemple, dates, templeInfo, temples, pastRecords]);

  if (!isOpen) return null;

  // 僧侶情報のメールアドレス保存
  const handleSaveEmailIfRequested = () => {
    if (saveToMaster && matchedPriest && onUpdatePriest && recipientEmail.trim() !== (matchedPriest.email || '')) {
      onUpdatePriest({
        ...matchedPriest,
        email: recipientEmail.trim(),
      });
    }
  };

  // 1. HTML表のクリップボードコピー
  const handleCopyHtml = async () => {
    const success = await copyTanagyoRichHtmlToClipboard(htmlContent, plainTextContent);
    if (success) {
      setCopyStatus('html-copied');
      setTimeout(() => setCopyStatus('idle'), 3500);
    }
  };

  // 2. プレーンテキストのクリップボードコピー
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(plainTextContent);
      setCopyStatus('text-copied');
      setTimeout(() => setCopyStatus('idle'), 3500);
    } catch (e) {
      console.error(e);
    }
  };

  // 3. メーラー起動（mailto:）
  const handleLaunchMailer = async () => {
    handleSaveEmailIfRequested();
    // HTMLリッチテキストをクリップボードにコピー
    await copyTanagyoRichHtmlToClipboard(htmlContent, plainTextContent);
    setCopyStatus('mailer-opened');
    setTimeout(() => setCopyStatus('idle'), 8000);

    // mailto URL長制限（OS上限約2,000文字）があるため、本文は含めず起動（クリップボード貼り付けを推奨）
    const toParam = encodeURIComponent(recipientEmail.trim());
    const subjectParam = encodeURIComponent(subject.trim());
    const mailtoUrl = `mailto:${toParam}?subject=${subjectParam}`;
    window.location.href = mailtoUrl;
  };

  // 4. Web版Gmail作成画面を開く
  const handleOpenGmail = async () => {
    handleSaveEmailIfRequested();
    // HTMLリッチテキストをクリップボードにコピー
    await copyTanagyoRichHtmlToClipboard(htmlContent, plainTextContent);
    setCopyStatus('gmail-opened');
    setTimeout(() => setCopyStatus('idle'), 8000);

    // GmailのURL長制限（HTTP 400 Bad Request / 414 Request-URI Too Long防止）のため、
    // 長大な本文をURLクエリに含めず、宛先と件名のみをセットしてGmail作成画面を起動します。
    // クリップボードにリッチHTML表（スマホ版デザイン）がコピーされているため、
    // 開いた画面の本文に「貼り付け（Ctrl+V / Cmd+V）」するだけでカラー表組みがそのまま貼り付きます。
    const toParam = recipientEmail.trim() ? `&to=${encodeURIComponent(recipientEmail.trim())}` : '';
    const subjectParam = subject.trim() ? `&su=${encodeURIComponent(subject.trim())}` : '';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1${toParam}${subjectParam}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  };

  const totalCount = dates.reduce(
    (acc, d) => acc + d.slots.reduce((sAcc, s) => sAcc + s.households.length, 0),
    0
  );

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white border-2 border-[#1A1A1A] w-full max-w-3xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden rounded-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-[#D4AF37] px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 font-bold text-sm tracking-wider">
            <Mail className="w-4 h-4 text-[#D4AF37]" />
            <span>担当僧侶へ巡回計画メール送信（{priestName} 師）</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-[#1A1A1A]">
          
          {/* Notification banner */}
          <div className="bg-[#FAF7F0] border border-[#E5E0D8] p-3 rounded-xs text-xs text-[#554E41] flex items-start gap-2 leading-relaxed">
            <Smartphone className="w-4 h-4 text-[#8C2D19] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#8C2D19] font-bold">スマホ版の巡回計画と同じデザインのHTML表</strong>を送付できます。
              各施主宅に<strong>Googleマップを開くリンク</strong>が付いており、担当僧侶がスマホでタップするだけでナビゲーションが立ち上がります。
              <div className="text-[11px] text-gray-600 mt-1">
                ※「Gmailで開く」または「メールソフトで送信」を押すと、宛先と件名が自動入力された状態で起動し、HTML表がクリップボードにコピーされます。メール本文で<strong>【貼り付け（Ctrl+V / ⌘+V）】</strong>してください。
              </div>
            </div>
          </div>

          {/* Email Settings */}
          <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xs space-y-3">
            {/* Recipient */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>宛先（担当僧侶のメールアドレス）</span>
                </span>
                {matchedPriest?.email && (
                  <span className="text-[11px] font-normal text-green-700 bg-green-50 px-1.5 py-0.2 rounded border border-green-200">
                    登録済み連絡先
                  </span>
                )}
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="例: priest@example.jp （未登録の場合は入力してください）"
                className="w-full text-xs sm:text-sm px-3 py-2 border border-gray-300 rounded-xs focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-hidden bg-white"
              />
              {matchedPriest && (
                <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToMaster}
                    onChange={(e) => setSaveToMaster(e.target.checked)}
                    className="rounded-xs border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span>入力したアドレスを僧侶台帳（{priestName} 師）に自動保存する</span>
                </label>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                メール件名
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-xs focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-hidden bg-white"
              />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center justify-between border-b border-gray-200 pt-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setActiveTab('html')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'html'
                    ? 'border-[#8C2D19] text-[#8C2D19]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>HTML表プレビュー (スマホ版デザイン)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'text'
                    ? 'border-[#8C2D19] text-[#8C2D19]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>プレーンテキスト</span>
              </button>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              合計: <strong className="text-black font-bold">{totalCount}</strong> 軒
            </div>
          </div>

          {/* Copy Toast Message */}
          {copyStatus === 'html-copied' && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xs flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>HTML表がクリップボードにコピーされました！</strong> メールソフトの本文にそのまま「貼り付け（Ctrl+V / 右クリック貼り付け）」してください。
                </span>
              </div>
            </div>
          )}

          {copyStatus === 'text-copied' && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xs flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>テキストがコピーされました！</strong> LINEやSMS等に貼り付けて送信できます。
                </span>
              </div>
            </div>
          )}

          {copyStatus === 'gmail-opened' && (
            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-500 text-emerald-950 text-xs rounded-xs flex items-start justify-between animate-in fade-in shadow-xs">
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-emerald-900 text-[13px]">
                    Gmail作成画面を開きました（HTML表のコピー完了）
                  </div>
                  <div className="text-emerald-800 leading-relaxed">
                    巡回計画のHTML表がクリップボードにコピーされています。開いたGmail画面の本文で<strong>【貼り付け（Ctrl+V または ⌘+V）】</strong>を行ってください。スマートフォン用のカラー表組み・Googleマップリンクがそのまま美しく貼り付けられます。
                  </div>
                </div>
              </div>
            </div>
          )}

          {copyStatus === 'mailer-opened' && (
            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-500 text-emerald-950 text-xs rounded-xs flex items-start justify-between animate-in fade-in shadow-xs">
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-emerald-900 text-[13px]">
                    メールソフトを起動しました（HTML表のコピー完了）
                  </div>
                  <div className="text-emerald-800 leading-relaxed">
                    巡回計画のHTML表がクリップボードにコピーされています。メールソフトの本文で<strong>【貼り付け（Ctrl+V または ⌘+V）】</strong>を行ってください。
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview Container */}
          <div className="border border-gray-300 rounded-xs bg-gray-100 overflow-hidden">
            {activeTab === 'html' ? (
              <div className="p-3 max-h-[380px] overflow-y-auto">
                <iframe
                  title="HTML Mail Preview"
                  srcDoc={htmlContent}
                  className="w-full min-h-[360px] bg-white border border-gray-200 rounded shadow-xs"
                />
              </div>
            ) : (
              <div className="p-3 max-h-[380px] overflow-y-auto">
                <pre className="text-[11px] font-mono whitespace-pre-wrap bg-white p-3 border border-gray-200 rounded leading-relaxed text-gray-800">
                  {plainTextContent}
                </pre>
              </div>
            )}
          </div>

          {/* Guidance Note */}
          <div className="text-[11px] text-gray-500 flex items-start gap-1.5 leading-normal">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              GmailやOutlook等では<strong>【HTML表をコピー】</strong>を押してメール本文に貼り付けると、上記のスマホ用リッチデザインのまま送信できます。
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-gray-100 border-t border-gray-300 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyHtml}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="リッチテキストHTMLをクリップボードにコピーします"
            >
              <Copy className="w-3.5 h-3.5 text-[#8C2D19]" />
              <span>HTML表をコピー</span>
            </button>
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="プレーンテキストをコピーします"
            >
              <FileText className="w-3.5 h-3.5 text-gray-600" />
              <span>テキストをコピー</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenGmail}
              className="px-3 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-300 text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Web版Gmailの作成画面を開きます"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Gmailで開く</span>
            </button>

            <button
              type="button"
              onClick={handleLaunchMailer}
              className="px-4 py-2 bg-[#8C2D19] hover:bg-[#732414] text-white text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="標準メールソフトを起動してHTML表をコピーします"
            >
              <Send className="w-3.5 h-3.5" />
              <span>メールソフトで送信</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
