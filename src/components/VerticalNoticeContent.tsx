import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Household, TempleInfo } from '../types';

interface VerticalNoticeContentProps {
  text: string;
  household?: Household | null;
  templeInfo?: TempleInfo | null;
  variant: 'postcard' | 'a4';
  fontSize?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders vertical-rl notice content with embedded QR code tokens ([[QR_HOUSEHOLD]], [[QR_TEMPLE]]).
 * - For postcard: renders compact QR code (~44px)
 * - For A4 notice: renders larger QR code (~72px)
 * - The household QR code specification contains ONLY the simple household ID (e.g. "H001")
 */
export const VerticalNoticeContent: React.FC<VerticalNoticeContentProps> = ({
  text,
  household,
  templeInfo,
  variant,
  fontSize,
  className = '',
  style = {},
}) => {
  if (!text) return null;

  // Split by [[QR_HOUSEHOLD]] and [[QR_TEMPLE]] tokens
  const parts = text.split(/(\[\[QR_HOUSEHOLD\]\]|\[\[QR_TEMPLE\]\])/g);

  const isA4 = variant === 'a4';
  const qrSize = isA4 ? 72 : 44;
  const householdId = (household?.id || 'H001').trim();
  const templeWebsite = templeInfo?.website || templeInfo?.websiteUrl || 'https://temple-portal.jp';

  return (
    <div
      className={className}
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'upright',
        whiteSpace: 'pre-wrap',
        fontSize: fontSize,
        ...style,
      }}
    >
      {parts.map((part, idx) => {
        if (part === '[[QR_HOUSEHOLD]]') {
          return (
            <span
              key={`qr-hh-${idx}`}
              className="inline-flex flex-col items-center justify-center p-0.5 bg-white select-none my-1 mx-1 align-middle"
              style={{
                writingMode: 'horizontal-tb',
                display: 'inline-flex',
                verticalAlign: 'middle',
              }}
            >
              <QRCodeSVG
                value={householdId}
                size={qrSize}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
              />
              <span
                className="font-serif text-stone-900 font-bold text-center block mt-0.5 tracking-wider whitespace-nowrap"
                style={{
                  fontSize: isA4 ? '8.5pt' : '6.5pt',
                  lineHeight: '1.2',
                  writingMode: 'horizontal-tb',
                }}
              >
                御檀家様QR
              </span>
            </span>
          );
        }

        if (part === '[[QR_TEMPLE]]') {
          return (
            <span
              key={`qr-temple-${idx}`}
              className="inline-flex flex-col items-center justify-center p-0.5 bg-white select-none my-1 mx-1 align-middle"
              style={{
                writingMode: 'horizontal-tb',
                display: 'inline-flex',
                verticalAlign: 'middle',
              }}
            >
              <QRCodeSVG
                value={templeWebsite}
                size={qrSize}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#8B0000"
                includeMargin={false}
              />
              <span
                className="font-sans text-stone-700 font-bold text-center block mt-0.5 whitespace-nowrap"
                style={{
                  fontSize: isA4 ? '8.5pt' : '6.5pt',
                  lineHeight: '1.2',
                  writingMode: 'horizontal-tb',
                }}
              >
                {(templeInfo?.name || '寺院').trim()} HP
              </span>
            </span>
          );
        }

        return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
      })}
    </div>
  );
};
