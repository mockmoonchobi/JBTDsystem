import type { NoticeTemplateItem, NoticeTemplatePaperType } from './memorialCalculator';

export function parseNoticeTemplatePaperType(value: string, id = '', name = ''): NoticeTemplatePaperType {
  const normalized = value.normalize('NFKC').toLowerCase();
  // Older exports incorrectly labelled these memo templates as postcards.
  if (normalized === 'kaku2_memo' || /角2.*メモ/.test(normalized) ||
      id.startsWith('tpl-kaku2-memo-') || /^【角[２2]宛名(?:面)?メモ】/.test(name)) {
    return 'kaku2_memo';
  }
  return normalized.includes('a4') ? 'a4' : 'postcard';
}

export function formatNoticeTemplatePaperType(type: NoticeTemplatePaperType): string {
  return type === 'kaku2_memo' ? '角２宛名面メモ' : type === 'a4' ? 'A4用紙' : '官製はがき';
}

const protectedDefaultIds = new Set(['tpl-higan', 'tpl-niibon', 'tpl-memorial-card', 'tpl-a4-memorial', 'tpl-a4-general']);

export function normalizeNoticeTemplates(templates: NoticeTemplateItem[]): NoticeTemplateItem[] {
  const result: NoticeTemplateItem[] = [];
  const signatures = new Set<string>();
  const usedIds = new Set(templates.map(t => t.id));
  const seenIds = new Set<string>();
  for (const template of templates) {
    const type = parseNoticeTemplatePaperType(template.type || '', template.id, template.name);
    const signature = JSON.stringify([template.id, type, template.name, template.title || '', template.category || 'custom', template.content]);
    // Collapse only identical copies of the same ID. Preserve edited variants.
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    let id = template.id;
    if (seenIds.has(id)) {
      let suffix = 1;
      while (usedIds.has(`${id}-recovered-${suffix}`)) suffix++;
      id = `${id}-recovered-${suffix}`;
      usedIds.add(id);
    }
    seenIds.add(id);
    result.push({ ...template, id, type, isDefault: type !== 'kaku2_memo' && protectedDefaultIds.has(id) });
  }
  return result;
}
