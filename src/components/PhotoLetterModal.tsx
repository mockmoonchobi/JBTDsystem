import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Camera,
  X,
  Printer,
  RotateCcw,
  Sparkles,
  QrCode,
  Check,
  Upload,
  AlertCircle,
  FileText
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Household, TempleInfo, TempleProfile } from '../types';
import { 
  NoticeTemplateItem, 
  getAllSavedNoticeTemplates,
  applyNoticeTemplate,
  getHouseholdSponsorName,
  DEFAULT_A4_MEMORIAL_TEMPLATE
} from '../utils/memorialCalculator';
import { VerticalNoticeContent } from './VerticalNoticeContent';

interface PhotoLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: Household;
  templeInfo?: Partial<TempleInfo>;
  temples?: TempleProfile[];
}

export const PhotoLetterModal: React.FC<PhotoLetterModalProps> = ({
  isOpen,
  onClose,
  household,
  templeInfo = {},
  temples = [],
}) => {
  // カメラ撮影用状態
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // ダウンサイジング済みBase64 (175dpi, 482x965)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 案内文テンプレート一覧と選択状態
  const [a4Templates, setA4Templates] = useState<NoticeTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customContent, setCustomContent] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState<boolean>(true);

  // 所属寺院情報（兼務寺院対応）
  const currentTemple: TempleInfo = useMemo(() => {
    const found = temples.find((t) => (t.id || 'temple-main') === (household.templeId || 'temple-main'));
    const base = found || templeInfo || {};
    return {
      name: base.name || '当寺',
      sect: base.sect || '',
      mountainName: base.mountainName || '',
      chiefPriest: base.chiefPriest || '',
      postalCode: base.postalCode || '',
      address: base.address || '',
      phone: base.phone || '',
      fax: base.fax || '',
      website: base.website || (base as any).websiteUrl || '',
      websiteUrl: (base as any).websiteUrl || base.website || '',
      ...base,
    } as TempleInfo;
  }, [temples, household.templeId, templeInfo]);

  // 案内文テンプレートの読み込み
  useEffect(() => {
    if (!isOpen) return;
    const all = getAllSavedNoticeTemplates();
    const a4List = all.filter((t) => t.type === 'a4' || (!t.type && t.category !== 'postcard'));
    const finalTemplates = a4List.length > 0 ? a4List : all;
    setA4Templates(finalTemplates);

    if (finalTemplates.length > 0) {
      const initial = finalTemplates[0];
      setSelectedTemplateId(initial.id);
      setCustomTitle(initial.title || initial.name || '年回忌法要のご案内');
      setCustomContent(initial.content || DEFAULT_A4_MEMORIAL_TEMPLATE);
    } else {
      setSelectedTemplateId('default');
      setCustomTitle('年回忌法要のご案内');
      setCustomContent(DEFAULT_A4_MEMORIAL_TEMPLATE);
    }
  }, [isOpen]);

  // カメラストリームの停止ヘルパー
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // モーダルオープン時またはキャンセル時のリセット
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCapturedImage(null);
      setCameraError(null);
    } else {
      // 開いた直後にカメラ撮影モードを試行
      startCamera();
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, stopCameraStream]);

  // カメラの起動（背面カメラ環境を優先）
  const startCamera = async () => {
    setCameraError(null);
    stopCameraStream();

    // navigator.mediaDevices が存在しない場合のフォールバック案内
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('このブラウザではカメラの直接起動がサポートされていません。下の「写真ファイルを選択」をご利用ください。');
      setCameraActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // スマホの背面カメラ優先
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      setCameraError('カメラの起動に失敗しました（アクセス拒否または非対応）。下の「写真ファイルを選択」から撮影・選択してください。');
      setCameraActive(false);
    }
  };

  // 画像を 175dpi 相当（幅7cm × 高さ14cm ≒ 482px × 965px）にアスペクト比 1:2 でクロップ＆ダウンサイジング
  const processAndDownsizeImage = (imageSource: HTMLVideoElement | HTMLImageElement) => {
    const TARGET_WIDTH = 482;   // 7cm @ 175dpi
    const TARGET_HEIGHT = 965;  // 14cm @ 175dpi
    const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT; // 1:2 (0.5)

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let srcWidth = 0;
    let srcHeight = 0;

    if (imageSource instanceof HTMLVideoElement) {
      srcWidth = imageSource.videoWidth || 1280;
      srcHeight = imageSource.videoHeight || 720;
    } else {
      srcWidth = imageSource.naturalWidth || imageSource.width;
      srcHeight = imageSource.naturalHeight || imageSource.height;
    }

    const srcRatio = srcWidth / srcHeight;

    let cropWidth = srcWidth;
    let cropHeight = srcHeight;
    let cropX = 0;
    let cropY = 0;

    if (srcRatio > TARGET_RATIO) {
      // 元画像の方が横長：左右を切り落として中央の 1:2 枠を抽出
      cropWidth = srcHeight * TARGET_RATIO;
      cropHeight = srcHeight;
      cropX = (srcWidth - cropWidth) / 2;
      cropY = 0;
    } else {
      // 元画像の方が縦長：上下を切り落として中央の 1:2 枠を抽出
      cropWidth = srcWidth;
      cropHeight = srcWidth / TARGET_RATIO;
      cropX = 0;
      cropY = (srcHeight - cropHeight) / 2;
    }

    // Canvas 上で高品質リサイズ描画
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      imageSource,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      TARGET_WIDTH,
      TARGET_HEIGHT
    );

    // JPEG 85% で Base64 生成（約100〜150KB程度の軽量サイズ）
    const downsizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(downsizedDataUrl);
    stopCameraStream();
  };

  // ビデオからの撮影実行
  const handleCaptureFromVideo = () => {
    if (!videoRef.current) return;
    processAndDownsizeImage(videoRef.current);
  };

  // ファイル選択からの画像読み込み＆ダウンサイジング
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        processAndDownsizeImage(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    // input リセット
    e.target.value = '';
  };

  // テンプレート変更ハンドラ
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = a4Templates.find((t) => t.id === templateId);
    if (found) {
      setCustomTitle(found.title || found.name || '年回忌法要のご案内');
      setCustomContent(found.content || DEFAULT_A4_MEMORIAL_TEMPLATE);
    }
  };

  // 本文の置換処理
  const sponsorName = getHouseholdSponsorName(household) || household.familyHead;
  const personalizedMessage = useMemo(() => {
    return applyNoticeTemplate(
      customContent,
      [],
      '',
      household.familyHead,
      currentTemple,
      sponsorName,
      household
    );
  }, [customContent, household, currentTemple, sponsorName]);

  // 文字数に応じたフォントサイズの微小自動調整（2ページ目に送らないよう計算）
  const { fontSizePt, lineHeight } = useMemo(() => {
    const len = personalizedMessage.length;
    if (len <= 200) {
      return { fontSizePt: 12.5, lineHeight: 1.75 };
    } else if (len <= 320) {
      return { fontSizePt: 11.2, lineHeight: 1.65 };
    } else if (len <= 450) {
      return { fontSizePt: 10.0, lineHeight: 1.55 };
    } else if (len <= 600) {
      return { fontSizePt: 9.0, lineHeight: 1.48 };
    } else {
      return { fontSizePt: 8.2, lineHeight: 1.40 };
    }
  }, [personalizedMessage]);

  // PDF保存 / 印刷ダイアログの起動
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* 印刷専用スタイル（A4横向き固定・余白ゼロ・背景印刷強制） */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #photo-letter-print-root, #photo-letter-print-root * {
            visibility: visible !important;
          }
          #photo-letter-print-root {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
            margin: 0 !important;
            padding: 12mm 16mm !important;
            background: #ffffff !important;
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            z-index: 999999 !important;
          }
        }
      ` }} />

      <div className="bg-[#FAF8F5] border border-[#D1CEC7] rounded-xs shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col font-sans text-[#1A1A1A] overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center justify-between border-b border-[#D4AF37] shrink-0">
          <div className="flex items-center space-x-2.5">
            <Camera className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#D4AF37]">
                写真付書状の作成（A4横・PDF保存）
              </h3>
              <p className="text-[11px] text-gray-300">
                {sponsorName} 様宛ての案内文と墓地写真をその場でA4書状に合成し、PDF保存または印刷します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* STEP 1: 写真撮影・未撮影時のカメラビューまたはフォールバック */}
          {!capturedImage ? (
            <div className="bg-stone-900 rounded-sm p-3 flex flex-col items-center justify-center relative overflow-hidden min-h-[360px] sm:min-h-[460px]">
              {cameraActive ? (
                <div className="relative w-full max-w-md h-[420px] flex items-center justify-center bg-black overflow-hidden rounded-sm">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* 縦長ガイド枠（1:2 横7cm : 縦14cm の比率） */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative border-2 border-dashed border-[#D4AF37] bg-white/5 shadow-2xl w-[180px] h-[360px] flex flex-col justify-between p-2">
                      <div className="text-[11px] font-bold text-[#D4AF37] bg-black/70 px-2 py-0.5 rounded-2xs self-center tracking-wider">
                        墓石・塔婆 ガイド枠 (1:2)
                      </div>
                      <div className="text-[10px] text-white/90 text-center bg-black/60 px-1 py-0.5 rounded-2xs">
                        枠内に墓石と塔婆を収めてください
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3 text-stone-200">
                  <Camera className="w-12 h-12 text-[#D4AF37] mx-auto opacity-75" />
                  <p className="text-sm font-bold">カメラを準備中または起動できませんでした</p>
                  {cameraError && (
                    <div className="text-xs text-amber-300 max-w-md bg-amber-950/60 border border-amber-500/40 p-2.5 rounded-xs flex items-center gap-2 text-left">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{cameraError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* カメラ操作バー */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 w-full">
                {cameraActive && (
                  <button
                    type="button"
                    onClick={handleCaptureFromVideo}
                    className="px-6 py-2.5 bg-[#8C2D19] hover:bg-[#A3341D] text-white rounded-xs font-bold text-sm shadow-md flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>写真を撮影して書状を生成</span>
                  </button>
                )}

                {/* ファイル選択フォールバック */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-100 rounded-xs font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>端末から写真を選択 / 撮影</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!cameraActive && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xs font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>カメラを再起動</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: 撮影済み・A4書状プレビュー ＆ オプション設定 */
            <div className="space-y-3">
              {/* コントロールパネル（テンプレート選択・QR有無・再撮影） */}
              <div className="bg-white p-3 border border-[#D1CEC7] rounded-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* 案内文テンプレート選択 */}
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <FileText className="w-4 h-4 text-[#8C2D19] shrink-0" />
                  <span className="font-bold text-stone-700 shrink-0">案内文（A4）:</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="flex-1 bg-[#FAF7F0] border border-[#D1CEC7] rounded-xs px-2.5 py-1 text-xs font-sans text-stone-800 focus:outline-none focus:border-[#8C2D19]"
                  >
                    {a4Templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.title || '案内文'}
                      </option>
                    ))}
                    {a4Templates.length === 0 && (
                      <option value="default">標準の案内文</option>
                    )}
                  </select>
                </div>

                {/* 寺院HP QRコード有無 */}
                <label className="flex items-center gap-1.5 cursor-pointer text-stone-700 font-bold select-none">
                  <input
                    type="checkbox"
                    checked={showQrCode}
                    onChange={(e) => setShowQrCode(e.target.checked)}
                    className="rounded-2xs text-[#8C2D19] focus:ring-[#8C2D19]"
                  />
                  <QrCode className="w-3.5 h-3.5 text-stone-600" />
                  <span>寺院HP QRコードを含める</span>
                </label>

                {/* 写真の再撮影 */}
                <button
                  type="button"
                  onClick={() => {
                    setCapturedImage(null);
                    startCamera();
                  }}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-xs font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>写真を取り直す</span>
                </button>
              </div>

              {/* 実寸A4横プレビュー（比率 297 : 210） */}
              <div className="bg-gray-200 p-2 sm:p-4 rounded-xs overflow-x-auto flex justify-center">
                <div
                  id="photo-letter-print-root"
                  className="bg-white shadow-xl relative border border-stone-300 flex flex-row-reverse justify-between items-stretch box-border select-none"
                  style={{
                    width: '297mm',
                    height: '210mm',
                    minWidth: '297mm',
                    minHeight: '210mm',
                    padding: '12mm 16mm',
                    transform: 'scale(0.68)',
                    transformOrigin: 'top center',
                    marginBottom: '-65mm', // スケール縮小分の下部余白相殺
                    writingMode: 'horizontal-tb',
                    fontFamily: '"Noto Serif JP", "Shippori Mincho", "Yu Mincho", serif',
                  }}
                >
                  {/* ① 右端: 文書タイトル（縦書き） */}
                  <div
                    className="h-full pr-1 pl-4 flex flex-col justify-start items-center shrink-0"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                    }}
                  >
                    <div
                      className="font-bold tracking-widest text-stone-950 whitespace-nowrap"
                      style={{
                        fontSize: `${(fontSizePt * 1.35).toFixed(1)}pt`,
                        lineHeight: '1.2',
                        letterSpacing: '0.22em',
                        maxHeight: '170mm',
                      }}
                    >
                      {customTitle || '年回忌法要のご案内'}
                    </div>
                  </div>

                  {/* ② 中央: 縦書き案内本文（文字数自動フィット、2ページ目に送らない） */}
                  <div
                    className="h-full flex-1 px-4 overflow-hidden text-stone-900"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      letterSpacing: '0.05em',
                      maxHeight: '170mm',
                    }}
                  >
                    <VerticalNoticeContent
                      text={personalizedMessage}
                      household={household}
                      templeInfo={currentTemple}
                      variant="a4"
                      fontSize={`${fontSizePt}pt`}
                      style={{
                        lineHeight: `${lineHeight}`,
                        maxHeight: '165mm',
                      }}
                    />
                  </div>

                  {/* ③ 中左: 縦長写真（175dpi、縦14cm × 横7cm ≒ 70mm × 140mm） */}
                  <div
                    className="h-full px-4 flex flex-col justify-center items-center shrink-0"
                    style={{
                      writingMode: 'horizontal-tb',
                    }}
                  >
                    <div
                      className="border border-stone-400 bg-stone-100 overflow-hidden shadow-sm flex items-center justify-center"
                      style={{
                        width: '70mm',
                        height: '140mm',
                        minWidth: '70mm',
                        minHeight: '140mm',
                        boxSizing: 'border-box',
                      }}
                    >
                      {capturedImage && (
                        <img
                          src={capturedImage}
                          alt="墓地写真"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </div>

                  {/* ④ 最左端: 寺院名 ＋ QRコード（縦書き・下揃え） */}
                  <div
                    className="h-full pl-2 pr-4 flex flex-col justify-end items-center shrink-0"
                    style={{
                      writingMode: 'horizontal-tb',
                    }}
                  >
                    <div className="flex flex-col items-center justify-end gap-3">
                      {/* 山号・寺院名 */}
                      <div
                        className="font-bold text-stone-950 whitespace-nowrap"
                        style={{
                          writingMode: 'vertical-rl',
                          textOrientation: 'upright',
                          fontSize: `${(fontSizePt * 1.35).toFixed(1)}pt`,
                          letterSpacing: '0.22em',
                          lineHeight: '1.2',
                        }}
                      >
                        {currentTemple.mountainName ? `${currentTemple.mountainName}　${currentTemple.name}` : currentTemple.name}
                      </div>

                      {/* 寺院HP QRコード（濃紅） */}
                      {showQrCode && (
                        <div className="flex items-center justify-center shrink-0 pt-1">
                          <QRCodeSVG
                            value={currentTemple?.website || currentTemple?.websiteUrl || 'https://temple-portal.jp'}
                            size={44}
                            fgColor="#8B0000"
                            bgColor="transparent"
                            level="M"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#FAF7F0] px-4 py-3 border-t border-[#D1CEC7] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-stone-700 border border-stone-300 rounded-xs font-bold text-xs cursor-pointer transition-colors shadow-2xs"
          >
            キャンセル
          </button>

          <div className="flex items-center gap-2">
            {capturedImage && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-2 bg-[#8C2D19] hover:bg-[#A3341D] text-white rounded-xs font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-md transition-colors"
                title="A4横向きでPDF保存またはプリンター印刷"
              >
                <Printer className="w-4 h-4" />
                <span>PDF保存 / 印刷</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
