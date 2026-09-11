import React, { useState } from 'react';
import { Search, Loader2, Check, AlertCircle } from 'lucide-react';
import { lookupAddressByPostalCode } from '../utils/postalCodeUtils';

interface PostalAddressSearchButtonProps {
  postalCode: string;
  currentAddress?: string;
  onAddressFound: (address: string, formattedPostalCode: string) => void;
  className?: string;
  buttonClassName?: string;
  showStatusMessage?: boolean;
  compact?: boolean;
}

export const PostalAddressSearchButton: React.FC<PostalAddressSearchButtonProps> = ({
  postalCode,
  currentAddress = '',
  onAddressFound,
  className = '',
  buttonClassName = '',
  showStatusMessage = true,
  compact = false,
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSearch = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setStatus(null);
    setIsSearching(true);

    try {
      const res = await lookupAddressByPostalCode(postalCode);

      if (res.success && res.address) {
        // すでに番地等の記載がある場合の処理
        let targetAddress = res.address;
        if (currentAddress && currentAddress.trim()) {
          // もし既存の住所が、取得した住所（都道府県市区町村町域）で始まっていない場合は
          // 番地や号の可能性がある部分（数字や丁目以降）を保持するか、またはそのまま町域を置換
          // 安全のため、ユーザーが確認・修正しやすいよう、取得住所を反映
          targetAddress = res.address;
        }

        onAddressFound(targetAddress, res.formattedPostalCode || postalCode);
        setStatus({
          type: 'success',
          message: `住所を反映しました: ${res.address}`,
        });

        // 3.5秒後にステータスメッセージをフェードアウト
        setTimeout(() => {
          setStatus((prev) => (prev?.type === 'success' ? null : prev));
        }, 3500);
      } else {
        setStatus({
          type: 'error',
          message: res.error || '住所が見つかりませんでした。',
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: '住所検索中にエラーが発生しました。',
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={handleSearch}
        disabled={isSearching}
        title="郵便番号から住所を自動入力"
        className={`inline-flex items-center justify-center gap-1 font-serif text-xs px-2.5 py-1.5 transition-colors border select-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
          buttonClassName ||
          'bg-[#1A1A1A] hover:bg-[#333333] text-[#F9F7F2] border-[#1A1A1A] shadow-2xs'
        }`}
      >
        {isSearching ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
            {!compact && <span>検索中...</span>}
          </>
        ) : (
          <>
            <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>住所検索</span>
          </>
        )}
      </button>

      {showStatusMessage && status && (
        <div
          className={`flex items-center gap-1 text-[11px] mt-1 leading-tight ${
            status.type === 'success' ? 'text-emerald-700' : 'text-rose-600 font-medium'
          }`}
        >
          {status.type === 'success' ? (
            <Check className="w-3 h-3 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-3 h-3 shrink-0 text-rose-500" />
          )}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
};
