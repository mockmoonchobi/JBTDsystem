import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, RefreshCw, Sparkles, Keyboard } from 'lucide-react';

interface MobileQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export const MobileQrScannerModal: React.FC<MobileQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [manualIdInput, setManualIdInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerDivId = 'mobile-qr-reader-container';

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              scannerRef.current?.clear();
            }).catch(() => {});
          }
        } catch (e) {
          // ignore
        }
        scannerRef.current = null;
      }
      setCameraError(null);
      setIsStarting(true);
      setShowManualInput(false);
      return;
    }

    let isMounted = true;
    setIsStarting(true);
    setCameraError(null);

    const timer = setTimeout(() => {
      try {
        const scanner = new Html5Qrcode(readerDivId);
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        };

        scanner
          .start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
              if (isMounted && decodedText) {
                // Audio feedback if possible
                try {
                  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
                  gain.gain.setValueAtTime(0.2, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.15);
                } catch (e) {
                  // ignore
                }

                // Stop scanning and pass text
                try {
                  scanner.stop().then(() => scanner.clear()).catch(() => {});
                } catch (e) {
                  // ignore
                }
                onScan(decodedText.trim());
              }
            },
            () => {
              // Ignore standard frame scan errors
            }
          )
          .then(() => {
            if (isMounted) setIsStarting(false);
          })
          .catch((err) => {
            if (isMounted) {
              console.warn('QR camera start failed:', err);
              setCameraError(
                'カメラの起動に失敗しました。ブラウザのカメラアクセス権限を許可するか、下の檀家ID手入力をご利用ください。'
              );
              setIsStarting(false);
            }
          });
      } catch (err: any) {
        if (isMounted) {
          setCameraError('QRスキャナーの初期化に失敗しました。');
          setIsStarting(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              scannerRef.current?.clear();
            }).catch(() => {});
          }
        } catch (e) {
          // ignore
        }
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualIdInput.trim()) {
      onScan(manualIdInput.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div className="bg-[#1A1A1A] border border-[#3A3A3A] w-full max-w-sm rounded-lg overflow-hidden shadow-2xl flex flex-col text-white">
        {/* Header */}
        <div className="p-3 bg-[#242424] border-b border-[#3A3A3A] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Camera className="w-5 h-5 text-[#D4AF37]" />
            <span className="font-bold text-sm text-white">檀家受付QRコード読込</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-[#333] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner View Area */}
        <div className="p-4 flex flex-col items-center justify-center space-y-3">
          <div className="relative w-full max-w-[280px] aspect-square bg-black rounded-lg overflow-hidden border-2 border-[#D4AF37]/80 flex items-center justify-center">
            {/* HTML5 QR Container */}
            <div id={readerDivId} className="w-full h-full" />

            {isStarting && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center space-y-2 text-center p-4">
                <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin" />
                <span className="text-xs text-gray-300 font-medium">カメラを起動しています...</span>
              </div>
            )}

            {/* Target Reticle Overlay */}
            {!isStarting && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-dashed border-[#D4AF37] rounded-lg animate-pulse" />
              </div>
            )}
          </div>

          <p className="text-xs text-center text-gray-300 font-medium">
            案内状やハガキに印刷された「檀家QRコード」を枠内に収めてください
          </p>

          {/* Camera Error Message */}
          {cameraError && (
            <div className="w-full bg-red-950/60 border border-red-800/80 p-2.5 rounded text-red-200 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Input Toggle / Form */}
          <div className="w-full pt-1 border-t border-[#333]">
            {!showManualInput ? (
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="w-full py-2 text-xs text-[#D4AF37] hover:underline flex items-center justify-center space-x-1 font-bold"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>QRが読めない場合は檀家IDを手入力</span>
              </button>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-2 pt-1">
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    placeholder="例: H001 または DK-001"
                    value={manualIdInput}
                    onChange={(e) => setManualIdInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#2A2A2A] border border-[#555] rounded text-white text-xs font-mono focus:border-[#D4AF37] outline-hidden"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] text-xs font-bold rounded shadow-xs"
                  >
                    選択
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#242424] border-t border-[#3A3A3A] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#333] hover:bg-[#444] text-gray-200 text-xs font-bold rounded"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
