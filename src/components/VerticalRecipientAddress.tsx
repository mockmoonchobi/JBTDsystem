import React, { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { layoutVerticalAddress } from '../utils/addressPrintLayout';

export function VerticalRecipientAddress({ address, heightMm, fontPt, secondPt, className }: {
  address: string; heightMm: number; fontPt: number; secondPt: number; className: string;
}) {
  const probe = useRef<HTMLSpanElement>(null);
  const initial = () => layoutVerticalAddress(address, heightMm, fontPt, secondPt);
  const [layout, setLayout] = useState(initial);
  useLayoutEffect(() => {
    let disposed = false;
    const update = () => {
      if (disposed) return;
      const next = layoutVerticalAddress(address, heightMm, fontPt, secondPt, (text, pt) => {
        const element = probe.current;
        if (!element) return Array.from(text).length * pt * 96 / 72 * 1.025;
        element.textContent = text;
        element.style.fontSize = `${pt}pt`;
        // offsetHeight is unaffected by transforms used in the print preview.
        return element.offsetHeight || Array.from(text).length * pt * 96 / 72 * 1.025;
      });
      setLayout(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    update();
    void document.fonts?.ready.then(update);
    document.fonts?.addEventListener('loadingdone', update);
    const beforePrint = () => flushSync(update);
    window.addEventListener('beforeprint', beforePrint);
    return () => {
      disposed = true;
      document.fonts?.removeEventListener('loadingdone', update);
      window.removeEventListener('beforeprint', beforePrint);
    };
  }, [address, heightMm, fontPt, secondPt]);
  const vertical: React.CSSProperties = { writingMode: 'vertical-rl', textOrientation: 'upright', whiteSpace: 'pre', letterSpacing: '0.025em', lineHeight: 1.4 };
  return <div className={className} data-recipient-address style={{ alignItems: 'flex-end', maxHeight: `${heightMm}mm` }}>
    <span ref={probe} aria-hidden="true" style={{ ...vertical, position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 'max-content', width: 'max-content' }} />
    {layout.lines.map((line, index) => <div key={index} className="text-stone-900 select-none" style={{ ...vertical, fontSize: `${layout.sizes[index]}pt`, flexShrink: 0 }}>{line}</div>)}
  </div>;
}
