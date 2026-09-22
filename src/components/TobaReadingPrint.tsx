import React from 'react';

interface ReadingPatron { key: string; personName: string; segakiTamegaki?: string; }
/** A3: read from the right of the upper row, then the right of the lower row. */
export function TobaReadingPrint({patrons, orientation}: {patrons: ReadingPatron[]; orientation: 'portrait' | 'landscape'}) {
  const columns = orientation === 'landscape' ? 20 : 14;
  const perPage = columns * 2;
  const pages = Array.from({length: Math.ceil(patrons.length / perPage)}, (_, i) => patrons.slice(i * perPage, (i + 1) * perPage));
  return <div className="toba-reading-pages">
    <style>{`
      .toba-reading-page { container-type: inline-size; width: 100%; aspect-ratio: ${orientation === 'landscape' ? '404 / 281' : '281 / 404'}; display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); direction: rtl; background: white; color: black; margin-bottom: 24px; }
      .toba-reading-person { direction: ltr; display: flex; flex-direction: column; align-items: center; padding-top: 2mm; min-width: 0; font-family: 'Yu Mincho', 'Hiragino Mincho ProN', serif; }
      .toba-reading-name, .toba-reading-tamegaki { writing-mode: vertical-rl; text-orientation: upright; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.15; max-width: 100%; }
      .toba-reading-name { font-size: clamp(12px, 2cqw, 22pt); max-height: 62%; }
      .toba-reading-tamegaki { font-size: clamp(9px, 1.2cqw, 14pt); margin-top: 5mm; max-height: 28%; }
      @media print {
        .toba-reading-page { height: ${orientation === 'landscape' ? '280' : '403'}mm; aspect-ratio: auto; margin: 0; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
        .toba-reading-page:last-child { break-after: auto; page-break-after: auto; }
        .toba-reading-name { font-size: 22pt; }
        .toba-reading-tamegaki { font-size: 14pt; }
      }
    `}</style>
    {pages.map((page, pageIndex) => <div className="toba-reading-page" key={pageIndex} aria-label={`読上用 ${pageIndex + 1}ページ`}>
      {page.map(p => <div key={p.key} className="toba-reading-person">
        <div className="toba-reading-name">{p.personName.trim().replace(/[ \t　]+/g, '　')}</div>
        {p.segakiTamegaki?.trim() && <div className="toba-reading-tamegaki">{p.segakiTamegaki.trim()}</div>}
      </div>)}
    </div>)}
  </div>;
}

