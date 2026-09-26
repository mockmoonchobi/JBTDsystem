import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Camera,
  X,
  Printer,
  RotateCcw,
  QrCode,
  Upload,
  AlertCircle,
  FileText,
  Type,
  RefreshCw,
  ZoomIn
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
  // カメラ・撮影関連ステート
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // 175dpi Base64 (482x965)
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // 案内文テンプレート一覧と選択状態
  const [a4Templates, setA4Templates] = useState<NoticeTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customContent, setCustomContent] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState<boolean>(true);

  // 文字サイズ調整（自動 または 任意サイズ指定）
  const [fontSizeMode, setFontSizeMode] = useState<'auto' | 'custom'>('auto');
  const [customFontSize, setCustomFontSize] = useState<number>(11.2);

  // プレビュー表示倍率（画面上のみ）
  const [previewZoom, setPreviewZoom] = useState<number>(0.68);

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

  // カメラストリームの停止
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsCameraStarting(false);
  }, []);

  // カメラの起動（背面カメラ優先、段階的フォールバック）
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraStarting(true);
    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('このブラウザまたはプレビュー枠ではリアルタイムカメラ映像の直接起動が制限されています。下の「標準カメラで撮影」ボタンから直接撮影してください。');
      setIsCameraStarting(false);
      setCameraActive(false);
      return;
    }

    let stream: MediaStream | null = null;

    // ① スマホ背面カメラを優先
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e1) {
      console.warn('Camera attempt 1 failed:', e1);
      // ② 制約を緩めて再試行
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch (e2) {
        console.warn('Camera attempt 2 failed:', e2);
        // ③ 汎用カメラで再試行
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (e3: any) {
          console.error('All camera attempts failed:', e3);
          const errName = e3?.name || '';
          let msg = 'カメラの起動に失敗しました。下の「標準カメラで撮影」ボタンをご利用ください。';
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            msg = 'カメラのアクセス許可が保留されているか、プレビュー環境の権限により制限されています。下の「標準カメラで撮影」ボタンから撮影できます。';
          } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
            msg = 'カメラデバイスが見つかりませんでした。下の「写真ファイルを選択」をご利用ください。';
          }
          setCameraError(msg);
          setIsCameraStarting(false);
          setCameraActive(false);
          return;
        }
      }
    }

    if (stream) {
      streamRef.current = stream;
      setCameraActive(true);
      setIsCameraStarting(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((err) => {
            console.warn('Video play caught:', err);
          });
        };
      }
    }
  }, [stopCameraStream]);

  // モーダルオープン時またはキャンセル時の処理
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCapturedImage(null);
      setCameraError(null);
      document.body.classList.remove('photo-letter-open');
    } else {
      document.body.classList.add('photo-letter-open');
      startCamera();
    }
    return () => {
      stopCameraStream();
      document.body.classList.remove('photo-letter-open');
    };
  }, [isOpen, startCamera, stopCameraStream]);

  // videoRefがマウントされた時にストリームを確実に再バインド
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch((err) => console.warn('Video re-play error:', err));
      }
    }
  }, [cameraActive]);

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

    if (!srcWidth || !srcHeight) {
      srcWidth = 1280;
      srcHeight = 720;
    }

    const srcRatio = srcWidth / srcHeight;

    let cropWidth = srcWidth;
    let cropHeight = srcHeight;
    let cropX = 0;
    let cropY = 0;

    if (srcRatio > TARGET_RATIO) {
      cropWidth = srcHeight * TARGET_RATIO;
      cropHeight = srcHeight;
      cropX = (srcWidth - cropWidth) / 2;
      cropY = 0;
    } else {
      cropWidth = srcWidth;
      cropHeight = srcWidth / TARGET_RATIO;
      cropX = 0;
      cropY = (srcHeight - cropHeight) / 2;
    }

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

    const downsizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(downsizedDataUrl);
    stopCameraStream();
  };

  const handleCaptureFromVideo = () => {
    if (!videoRef.current) return;
    processAndDownsizeImage(videoRef.current);
  };

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
    e.target.value = '';
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = a4Templates.find((t) => t.id === templateId);
    if (found) {
      setCustomTitle(found.title || found.name || '年回忌法要のご案内');
      setCustomContent(found.content || DEFAULT_A4_MEMORIAL_TEMPLATE);
    }
  };

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

  const autoFontSizePt = useMemo(() => {
    const len = personalizedMessage.length;
    if (len <= 200) return 12.5;
    if (len <= 320) return 11.2;
    if (len <= 450) return 10.0;
    if (len <= 600) return 9.0;
    return 8.2;
  }, [personalizedMessage]);

  const effectiveFontSizePt = fontSizeMode === 'auto' ? autoFontSizePt : customFontSize;

  const effectiveLineHeight = useMemo(() => {
    if (effectiveFontSizePt >= 13) return 1.75;
    if (effectiveFontSizePt >= 11) return 1.65;
    if (effectiveFontSizePt >= 9.5) return 1.55;
    if (effectiveFontSizePt >= 8.5) return 1.48;
    return 1.40;
  }, [effectiveFontSizePt]);

  // A4横・単一ページ固定の印刷処理（プレビューと1:1完全一致）
  const handlePrint = () => {
    const existingFrame = document.getElementById('photo-letter-print-frame');
    if (existingFrame) {
      existingFrame.remove();
    }

    const printElement = document.getElementById('photo-letter-print-root');
    if (!printElement) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'photo-letter-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      window.print();
      return;
    }

    // ページのスタイルシートとフォント定義を収集
    const headStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="utf-8">
        <title>写真付書状 - ${sponsorName || '施主'}様</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
        ${headStyles}
        <style>
          @page {
            size: A4 landscape !important;
            margin: 0 !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
            margin: 0;
            padding: 0;
          }
          html, body {
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #1a1a1a !important;
            font-family: "Noto Serif JP", "Shippori Mincho", "Yu Mincho", serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }
          #photo-letter-print-root {
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            min-width: 297mm !important;
            min-height: 210mm !important;
            padding: 14mm 18mm !important;
            display: flex !important;
            flex-direction: row-reverse !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            box-sizing: border-box !important;
            transform: none !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
          }
          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: cover;
          }
        </style>
      </head>
      <body>
        ${printElement.outerHTML}
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print():', err);
        window.print();
      }
    }, 450);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="photo-letter-portal fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:overflow-hidden print:static">
      {/* 印刷専用スタイル（A4横向き固定・余白ゼロ・白紙ページ防止） */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 0 !important;
          }
          html, body {
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .photo-letter-screen-ui {
            display: none !important;
          }
          .photo-letter-preview-scaler {
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            width: 297mm !important;
            height: 210mm !important;
          }
          #photo-letter-print-root {
            display: flex !important;
            flex-direction: row-reverse !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            min-width: 297mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
            padding: 14mm 18mm !important;
            transform: none !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            z-index: 999999 !important;
            overflow: hidden !important;
          }
        }
      ` }} />

      <div className="bg-[#FAF8F5] border border-[#D1CEC7] rounded-xs shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col font-sans text-[#1A1A1A] overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none print:bg-white">
        {/* Modal Header */}
        <div className="photo-letter-screen-ui bg-[#1A1A1A] text-white px-4 py-3 flex items-center justify-between border-b border-[#D4AF37] shrink-0">
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 print:p-0 print:overflow-visible">
          {/* STEP 1: 写真撮影・未撮影時のカメラビューまたはフォールバック */}
          {!capturedImage ? (
            <div className="photo-letter-screen-ui bg-stone-900 rounded-sm p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[380px] sm:min-h-[480px]">
              {/* ビデオ要素：常にDOMに配置してrefを確保 */}
              <div className="relative w-full max-w-md h-[400px] flex items-center justify-center bg-black overflow-hidden rounded-sm shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* 撮影準備中・エラー時のオーバーレイ */}
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-stone-300 space-y-3 bg-stone-900/95">
                    {isCameraStarting ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin" />
                        <p className="text-xs text-stone-300 font-bold">カメラを起動中...</p>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-12 h-12 text-[#D4AF37] opacity-80" />
                        <div>
                          <p className="text-sm font-bold text-stone-100">
                            標準カメラまたは写真選択から撮影できます
                          </p>
                          <p className="text-xs text-stone-400 mt-1">
                            スマホのカメラアプリを直接起動して高画質に撮影いただけます
                          </p>
                        </div>
                        {cameraError && (
                          <div className="text-[11px] text-amber-200 max-w-sm bg-amber-950/70 border border-amber-500/40 p-2.5 rounded-xs flex items-start gap-2 text-left mt-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                            <span>{cameraError}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 縦長ガイド枠（1:2 横7cm : 縦14cm の比率） */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative border-2 border-dashed border-[#D4AF37] bg-white/5 shadow-2xl w-[180px] h-[360px] flex flex-col justify-between p-2">
                      <div className="text-[11px] font-bold text-[#D4AF37] bg-black/75 px-2 py-0.5 rounded-2xs self-center tracking-wider">
                        墓石・塔婆 ガイド枠 (1:2)
                      </div>
                      <div className="text-[10px] text-white/90 text-center bg-black/70 px-1 py-0.5 rounded-2xs">
                        枠内に墓石と塔婆を収めてください
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 撮影・画像選択アクションボタン */}
              <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 w-full max-w-md">
                {cameraActive && (
                  <button
                    type="button"
                    onClick={handleCaptureFromVideo}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#8C2D19] hover:bg-[#A3341D] text-white rounded-xs font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>シャッター（枠内で書状生成）</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#D4AF37] hover:bg-[#B89628] text-stone-900 rounded-xs font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  title="スマホ標準のカメラアプリを起動して撮影します"
                >
                  <Camera className="w-4 h-4 text-stone-900" />
                  <span>標準カメラで撮影</span>
                </button>
                <input
                  ref={nativeCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-100 rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>写真を選択</span>
                </button>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!cameraActive && (
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={isCameraStarting}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xs font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isCameraStarting ? 'animate-spin' : ''}`} />
                    <span>ライブカメラ再試行</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: 撮影済み・A4書状プレビュー ＆ オプション設定 */
            <div className="space-y-3">
              {/* コントロールパネル（テンプレート選択・文字サイズ・QR・表示倍率・再撮影） */}
              <div className="photo-letter-screen-ui bg-white p-3 border border-[#D1CEC7] rounded-xs flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-2xs">
                {/* 案内文テンプレート選択 */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                  <FileText className="w-4 h-4 text-[#8C2D19] shrink-0" />
                  <span className="font-bold text-stone-700 shrink-0">案内文:</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="flex-1 bg-[#FAF7F0] border border-[#D1CEC7] rounded-xs px-2 py-1 text-xs font-sans text-stone-800 focus:outline-none focus:border-[#8C2D19]"
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

                {/* 文字サイズ調整（自動/選択/微調整ステップ） */}
                <div className="flex items-center gap-1 bg-[#FAF7F0] border border-[#D1CEC7] px-2 py-1 rounded-xs">
                  <Type className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                  <span className="font-bold text-stone-700 shrink-0">文字サイズ:</span>
                  <select
                    value={fontSizeMode === 'auto' ? 'auto' : customFontSize.toString()}
                    onChange={(e) => {
                      if (e.target.value === 'auto') {
                        setFontSizeMode('auto');
                      } else {
                        setFontSizeMode('custom');
                        setCustomFontSize(parseFloat(e.target.value));
                      }
                    }}
                    className="bg-white border border-[#D1CEC7] rounded-xs px-1.5 py-0.5 text-xs text-stone-800"
                  >
                    <option value="auto">自動（{autoFontSizePt.toFixed(1)}pt）</option>
                    <option value="15">特大 (15pt)</option>
                    <option value="13.5">大 (13.5pt)</option>
                    <option value="12">中 (12pt)</option>
                    <option value="11">標準 (11pt)</option>
                    <option value="10">やや小 (10pt)</option>
                    <option value="9">小 (9pt)</option>
                    <option value="8">極小 (8pt)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setFontSizeMode('custom');
                      setCustomFontSize((prev) => Math.max(7, Number((prev - 0.5).toFixed(1))));
                    }}
                    title="文字サイズを縮小"
                    className="px-1.5 py-0.5 bg-white hover:bg-stone-100 border border-[#D1CEC7] rounded-2xs font-bold text-stone-700 cursor-pointer"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFontSizeMode('custom');
                      setCustomFontSize((prev) => Math.min(18, Number((prev + 0.5).toFixed(1))));
                    }}
                    title="文字サイズを拡大"
                    className="px-1.5 py-0.5 bg-white hover:bg-stone-100 border border-[#D1CEC7] rounded-2xs font-bold text-stone-700 cursor-pointer"
                  >
                    A+
                  </button>
                  <span className="text-[11px] font-mono text-stone-500 pl-0.5">
                    {effectiveFontSizePt.toFixed(1)}pt
                  </span>
                </div>

                {/* プレビュー表示倍率 */}
                <div className="flex items-center gap-1 bg-[#FAF7F0] border border-[#D1CEC7] px-2 py-1 rounded-xs">
                  <ZoomIn className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                  <span className="font-bold text-stone-700 shrink-0">表示:</span>
                  <select
                    value={previewZoom}
                    onChange={(e) => setPreviewZoom(parseFloat(e.target.value))}
                    className="bg-white border border-[#D1CEC7] rounded-xs px-1.5 py-0.5 text-xs text-stone-800"
                  >
                    <option value={0.55}>55%</option>
                    <option value={0.68}>68%（標準）</option>
                    <option value={0.80}>80%</option>
                    <option value={1.00}>100%（実寸）</option>
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
                  <span>HP QRコード</span>
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
              <div className="photo-letter-screen-ui bg-stone-300 p-2 sm:p-4 rounded-xs overflow-x-auto flex justify-center">
                {/* スケーラー：画面表示時のみ縮小表示し、印刷時はスケーラーを無効化 */}
                <div
                  className="photo-letter-preview-scaler"
                  style={{
                    transform: `scale(${previewZoom})`,
                    transformOrigin: 'top center',
                    marginBottom: `${(210 * (previewZoom - 1))}mm`,
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    id="photo-letter-print-root"
                    style={{
                      width: '297mm',
                      height: '210mm',
                      minWidth: '297mm',
                      minHeight: '210mm',
                      maxWidth: '297mm',
                      maxHeight: '210mm',
                      padding: '14mm 18mm',
                      display: 'flex',
                      flexDirection: 'row-reverse',
                      justifyContent: 'space-between',
                      alignItems: 'stretch',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff',
                      color: '#1a1a1a',
                      fontFamily: '"Noto Serif JP", "Shippori Mincho", "Yu Mincho", serif',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #d6d3d1',
                      overflow: 'hidden',
                      margin: 0,
                    }}
                  >
                    {/* ① 右端: 文書タイトル（縦書き） */}
                    <div
                      style={{
                        height: '100%',
                        paddingRight: '4px',
                        paddingLeft: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        flexShrink: 0,
                        writingMode: 'vertical-rl',
                        textOrientation: 'upright',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 'bold',
                          letterSpacing: '0.22em',
                          color: '#0c0a09',
                          whiteSpace: 'nowrap',
                          fontSize: `${(effectiveFontSizePt * 1.35).toFixed(1)}pt`,
                          lineHeight: '1.2',
                          maxHeight: '180mm',
                        }}
                      >
                        {customTitle || '年回忌法要のご案内'}
                      </div>
                    </div>

                    {/* ② 中央: 縦書き案内本文（文字サイズ動的調整、2ページ目に送らない） */}
                    <div
                      style={{
                        height: '100%',
                        flex: '1 1 0%',
                        paddingLeft: '16px',
                        paddingRight: '16px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        writingMode: 'vertical-rl',
                        textOrientation: 'upright',
                        letterSpacing: '0.05em',
                        boxSizing: 'border-box',
                        color: '#1c1917',
                      }}
                    >
                      <VerticalNoticeContent
                        text={personalizedMessage}
                        household={household}
                        templeInfo={currentTemple}
                        variant="a4"
                        fontSize={`${effectiveFontSizePt}pt`}
                        style={{
                          lineHeight: `${effectiveLineHeight}`,
                          maxHeight: '180mm',
                          height: '100%',
                        }}
                      />
                    </div>

                    {/* ③ 中左: 縦長写真（175dpi、縦14cm × 横7cm ≒ 70mm × 140mm） */}
                    <div
                      style={{
                        height: '100%',
                        paddingLeft: '16px',
                        paddingRight: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexShrink: 0,
                        writingMode: 'horizontal-tb',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          width: '70mm',
                          height: '140mm',
                          minWidth: '70mm',
                          minHeight: '140mm',
                          maxWidth: '70mm',
                          maxHeight: '140mm',
                          border: '1px solid #a8a29e',
                          backgroundColor: '#f5f5f4',
                          overflow: 'hidden',
                          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxSizing: 'border-box',
                        }}
                      >
                        {capturedImage && (
                          <img
                            src={capturedImage}
                            alt="墓地写真"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* ④ 最左端: 寺院名 ＋ QRコード（縦書き・下揃え） */}
                    <div
                      style={{
                        height: '100%',
                        paddingLeft: '8px',
                        paddingRight: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        flexShrink: 0,
                        writingMode: 'horizontal-tb',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '12px',
                          paddingBottom: '2px',
                        }}
                      >
                        {/* 山号・寺院名 */}
                        <div
                          style={{
                            writingMode: 'vertical-rl',
                            textOrientation: 'upright',
                            fontSize: `${(effectiveFontSizePt * 1.35).toFixed(1)}pt`,
                            letterSpacing: '0.22em',
                            lineHeight: '1.2',
                            fontWeight: 'bold',
                            color: '#0c0a09',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {currentTemple.mountainName ? `${currentTemple.mountainName}　${currentTemple.name}` : currentTemple.name}
                        </div>

                        {/* 寺院HP QRコード（濃紅） */}
                        {showQrCode && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              paddingTop: '4px',
                            }}
                          >
                            <QRCodeSVG
                              value={currentTemple?.website || currentTemple?.websiteUrl || 'https://temple-portal.jp'}
                              size={46}
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
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="photo-letter-screen-ui bg-[#FAF7F0] px-4 py-3 border-t border-[#D1CEC7] flex items-center justify-between shrink-0">
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

  return ReactDOM.createPortal(modalContent, document.body);
};
