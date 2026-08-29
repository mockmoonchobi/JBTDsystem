import React, { useState, useEffect, useMemo } from 'react';
import { PastRecord, Household, TempleProfile } from '../../types';
import { X, Save, Trash2, BookOpen, Building2 } from 'lucide-react';
import { DateInputWithEra } from '../DateTimeInputs';
import { getTodayDateString } from '../../utils/calendarUtils';
import { sortHouseholdsByGojuon, getHouseholdSponsorName } from '../../utils/memorialCalculator';

interface MobileKakochoModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PastRecord | null;
  households: Household[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSave: (record: PastRecord) => void;
  onDelete?: (id: string) => void;
  initialHouseholdId?: string;
}

export const MobileKakochoModal: React.FC<MobileKakochoModalProps> = ({
  isOpen,
  onClose,
  record,
  households = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSave,
  onDelete,
  initialHouseholdId,
}) => {
  const isEditing = !!record;
  const todayStr = getTodayDateString();

  const [formData, setFormData] = useState<Partial<PastRecord>>({
    dharmaName: '',
    secularName: '',
    deathDate: todayStr,
    ageAtDeath: undefined,
    householdId: initialHouseholdId || '',
    householdHeadName: '',
    relationship: '',
    burialLocation: '境内墓地',
    notes: '',
    templeId: activeTempleId !== 'ALL' ? activeTempleId : 'temple-main',
  });

  useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        relationship: record.relationship || '',
      });
    } else {
      const defaultHh = households.find((h) => h.id === initialHouseholdId);
      setFormData({
        dharmaName: '',
        secularName: '',
        deathDate: todayStr,
        ageAtDeath: undefined,
        householdId: initialHouseholdId || '',
        householdHeadName: defaultHh ? (getHouseholdSponsorName(defaultHh) || defaultHh.familyHead) : '',
        relationship: '',
        burialLocation: '境内墓地',
        notes: '',
        templeId: defaultHh?.templeId || (activeTempleId !== 'ALL' ? activeTempleId : 'temple-main'),
      });
    }
  }, [record, isOpen, initialHouseholdId, households, activeTempleId]);

  const sortedHouseholds = useMemo(() => {
    return sortHouseholdsByGojuon(households);
  }, [households]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.dharmaName?.trim() && !formData.secularName?.trim()) {
      alert('戒名または俗名を入力してください。');
      return;
    }

    const matchedHh = households.find((h) => h.id === formData.householdId);
    const finalHeadName = formData.householdHeadName?.trim() || (matchedHh ? (getHouseholdSponsorName(matchedHh) || matchedHh.familyHead) : '');

    const savedRecord: PastRecord = {
      id: record?.id || `PR-${Date.now()}`,
      dharmaName: formData.dharmaName?.trim() || '',
      secularName: formData.secularName?.trim() || '',
      deathDate: formData.deathDate || todayStr,
      ageAtDeath: formData.ageAtDeath ? Number(formData.ageAtDeath) : undefined,
      householdId: formData.householdId || '',
      householdHeadName: finalHeadName,
      relationship: formData.relationship || '精霊',
      burialLocation: formData.burialLocation || '境内墓地',
      notes: formData.notes || '',
      templeId: formData.templeId || matchedHh?.templeId || 'temple-main',
    };

    onSave(savedRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 overflow-hidden">
      <div className="bg-[#FAF8F5] flex-1 flex flex-col max-w-lg w-full mx-auto shadow-2xl h-full">
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center justify-between border-b border-[#D4AF37]/50 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-sm font-bold font-serif text-[#D4AF37]">
              {isEditing ? `過去帳の編集 (${record.dharmaName || record.secularName || ''})` : '過去帳の新規登録'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Temple selector (if multiple temples exist) */}
          {temples.length > 1 && (
            <div className="p-2.5 bg-[#F0ECE1] border border-[#D1CEC7] rounded-xs">
              <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#8C2D19]" />
                所属寺院 (本寺 / 兼務寺)
              </label>
              <select
                value={formData.templeId || 'temple-main'}
                onChange={(e) => setFormData({ ...formData, templeId: e.target.value })}
                className="w-full p-2 bg-white border border-[#D1CEC7] text-xs font-bold"
              >
                {temples.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isAffiliated || (!t.isMain && t.id !== 'temple-main') ? '【兼務寺】' : '【本寺】'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dharma Name & Secular Name */}
          <div className="space-y-3 p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs">
            <div>
              <label className="block font-bold text-[#8C2D19] mb-1">
                戒名・法名 (院号・道号・戒名・位号)
              </label>
              <input
                type="text"
                placeholder="例: 慈光院清心妙法院大姉"
                value={formData.dharmaName || ''}
                onChange={(e) => setFormData({ ...formData, dharmaName: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-sm font-bold font-serif text-[#8C2D19]"
              />
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">俗名 (故人氏名)</label>
              <input
                type="text"
                placeholder="例: 山田 花子"
                value={formData.secularName || ''}
                onChange={(e) => setFormData({ ...formData, secularName: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              />
            </div>
          </div>

          {/* Death Date & Age */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">
                命日・没年月日 (和暦/西暦)
              </label>
              <DateInputWithEra
                value={formData.deathDate || todayStr}
                onChange={(val) => setFormData({ ...formData, deathDate: val })}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">享年 / 行年</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="例: 88"
                    min={0}
                    max={150}
                    value={formData.ageAtDeath || ''}
                    onChange={(e) => setFormData({ ...formData, ageAtDeath: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full p-2 border border-[#D1CEC7] bg-white text-xs text-center font-bold"
                  />
                  <span className="text-xs font-bold">歳</span>
                </div>
              </div>
              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">続柄</label>
                <select
                  value={formData.relationship || ''}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
                >
                  <option value="">（未設定・空欄）</option>
                  {['父', '母', '夫', '妻', '長男', '長女', '二男', '二女', '祖父', '祖母', '義父', '義母', '叔父', '叔母', '兄弟', '姉妹', '精霊', '先祖代々', 'その他'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Linked Household Selection & 当時の施主名 */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-2">
            <label className="block font-bold text-[#1A1A1A]">
              🏠 紐づく世帯・現在の施主家
            </label>
            <select
              value={formData.householdId || ''}
              onChange={(e) => {
                const hId = e.target.value;
                const hh = households.find((h) => h.id === hId);
                const currentSponsor = hh ? (getHouseholdSponsorName(hh) || hh.familyHead) : '';
                setFormData({
                  ...formData,
                  householdId: hId,
                  // もし当時の施主名が未入力なら、選択した世帯の施主名を初期補完
                  householdHeadName: formData.householdHeadName || currentSponsor,
                  templeId: hh?.templeId || formData.templeId,
                });
              }}
              className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
            >
              <option value="">-- 世帯を選択（五十音順） --</option>
              {sortedHouseholds.map((h) => {
                const sponsor = getHouseholdSponsorName(h) || h.familyHead;
                return (
                  <option key={h.id} value={h.id}>
                    {sponsor} 様 ({h.district || '地区なし'}) {h.address ? ` - ${h.address}` : ''}
                  </option>
                );
              })}
            </select>

            {/* 当時の施主名（故人逝去時） */}
            <div className="pt-1">
              <label className="block text-[11px] font-bold text-[#1A1A1A] mb-0.5">
                当時の施主名 (故人逝去時):
              </label>
              <input
                type="text"
                placeholder="例: 山田 太郎 (逝去当時の施主名)"
                value={formData.householdHeadName || ''}
                onChange={(e) => setFormData({ ...formData, householdHeadName: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                ※ スマホ表示の過去帳にはこちらの「当時の施主名」が表示されます。
              </p>
            </div>
          </div>

          {/* Burial Location & Notes */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">納骨・墓地位置</label>
              <input
                type="text"
                placeholder="例: 境内墓地 A-12, 納骨堂, 永代供養墓"
                value={formData.burialLocation || ''}
                onChange={(e) => setFormData({ ...formData, burialLocation: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">特記事項・備考</label>
              <textarea
                rows={2}
                placeholder="例: 葬儀時の導師、納骨日、新盆記録など"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
          </div>

          {/* Delete action */}
          {isEditing && onDelete && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`本当に過去帳「${formData.dharmaName || formData.secularName}」を削除しますか？`)) {
                    onDelete(record.id);
                    onClose();
                  }
                }}
                className="text-red-600 hover:text-red-800 text-xs font-bold py-1.5 px-3 border border-red-200 bg-red-50 rounded-xs flex items-center gap-1 mx-auto cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>この過去帳レコードを削除</span>
              </button>
            </div>
          )}
        </form>

        {/* Modal Footer / Save Button */}
        <div className="p-3 bg-[#EBE7DF] border-t border-[#D1CEC7] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-white hover:bg-gray-100 border border-[#D1CEC7] rounded-xs font-bold text-xs text-[#333333] cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-[#8C2D19] hover:bg-[#722413] text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? '更新を保存' : '過去帳を登録'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
