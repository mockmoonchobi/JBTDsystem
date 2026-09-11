import React from 'react';
import { Trash2, ScrollText, Sparkles } from 'lucide-react';
import { FamilyMember, TempleProfile } from '../types';
import { useAutoKana } from '../hooks/useAutoKana';
import { getFamilyMemberTobaApplication, setFamilyMemberTobaApplication, TobaSlotDef } from '../utils/tobaUtils';

interface FamilyMemberInputRowProps {
  member: FamilyMember;
  index: number;
  currentTemple?: TempleProfile;
  configuredTobaSlots: TobaSlotDef[];
  onUpdateField: (field: keyof FamilyMember, value: any) => void;
  onUpdateMember: (updatedMember: FamilyMember) => void;
  onRemove: () => void;
}

export const FamilyMemberInputRow: React.FC<FamilyMemberInputRowProps> = ({
  member,
  index,
  currentTemple,
  configuredTobaSlots,
  onUpdateField,
  onUpdateMember,
  onRemove,
}) => {
  // 家族員の氏名・ふりがな自動入力
  const { isCustomized, resetFurigana, nameInputProps, furiganaInputProps } = useAutoKana({
    nameValue: member.name || '',
    furiganaValue: member.furigana || '',
    onNameChange: (newName) => onUpdateField('name', newName),
    onFuriganaChange: (newFurigana) => onUpdateField('furigana', newFurigana),
  });

  return (
    <div className="bg-white p-3 border border-[#D1CEC7] space-y-2 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* 氏名 */}
        <div className="flex-1 min-w-[140px]">
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] font-bold text-[#666666]">氏名</label>
            <span className="text-[9px] text-[#D4AF37] font-sans flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              <span>よみ自動</span>
            </span>
          </div>
          <input
            type="text"
            placeholder="例: 山田 花子"
            {...nameInputProps}
            className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] font-bold w-full focus:border-[#1A1A1A] focus:outline-none"
          />
        </div>

        {/* ふりがな */}
        <div className="flex-1 min-w-[140px]">
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] font-bold text-[#666666]">ふりがな</label>
            {isCustomized && member.furigana && (
              <button
                type="button"
                onClick={resetFurigana}
                className="text-[9px] text-[#888888] hover:text-[#1A1A1A] underline cursor-pointer"
                title="ふりがなを再自動生成"
              >
                自動再同期
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="例: やまだ はなこ"
            {...furiganaInputProps}
            className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
          />
        </div>

        {/* 続柄 */}
        <div className="w-24">
          <label className="block text-[10px] font-bold text-[#666666] mb-0.5">続柄</label>
          <input
            type="text"
            placeholder="妻, 長男等"
            value={member.relationship}
            onChange={(e) => onUpdateField('relationship', e.target.value)}
            className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
          />
        </div>

        {/* 電話番号 */}
        <div className="w-32">
          <label className="block text-[10px] font-bold text-[#666666] mb-0.5">電話番号</label>
          <input
            type="text"
            placeholder="電話番号"
            value={member.phone || ''}
            onChange={(e) => onUpdateField('phone', e.target.value)}
            className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
          />
        </div>

        {/* 削除ボタン */}
        <div className="pt-4">
          <button
            type="button"
            onClick={onRemove}
            className="text-rose-800 hover:text-rose-900 p-1 bg-rose-50 border border-rose-200 cursor-pointer"
            title="家族を削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 住所・施主指定 */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F0ECE1]">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="住所（別居・現住所などが世帯と異なる場合に入力）"
            value={member.address || ''}
            onChange={(e) => onUpdateField('address', e.target.value)}
            className="bg-[#FAF9F5] border border-[#D1CEC7] px-2 py-1 text-[11px] text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
          />
        </div>
        <label
          className={`flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 border transition-colors shrink-0 ${
            member.isChiefMourner || member.isSponsor
              ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
              : 'bg-stone-100 text-[#1A1A1A] border-[#CCCCCC] hover:border-[#8C2D19]'
          }`}
          title="この人物を世帯の「現在の施主」として指定（他地域在住の子息など）"
        >
          <input
            type="checkbox"
            checked={!!(member.isChiefMourner || member.isSponsor)}
            onChange={(e) => onUpdateField('isChiefMourner', e.target.checked)}
            className="w-3.5 h-3.5 accent-[#8C2D19]"
          />
          <span className="font-bold text-[11px]">★ 施主に指定</span>
        </label>
      </div>

      {/* 塔婆申込み（家族メンバー・各種塔婆） */}
      <div className="bg-amber-50/50 p-2 border border-amber-200/80 space-y-1.5 mt-1">
        <div className="text-[10px] font-bold text-amber-950 flex items-center gap-1">
          <ScrollText className="w-3 h-3 text-amber-800" />
          <span>塔婆申込・為書き（{member.name || `家族 ${index + 1}`}）:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {configuredTobaSlots.map((slot) => {
            const tobaType = slot.name;
            const memApp = getFamilyMemberTobaApplication(member, tobaType, currentTemple);
            return (
              <div key={slot.slot} className="bg-white p-1.5 border border-amber-200 text-xs space-y-1">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memApp.applied}
                    onChange={(e) => {
                      const updatedMem = setFamilyMemberTobaApplication(member, tobaType, e.target.checked, memApp.tamegaki, currentTemple);
                      onUpdateMember(updatedMem);
                    }}
                    className="w-3.5 h-3.5 accent-[#1A1A1A]"
                  />
                  <span className="font-bold text-[11px] text-[#1A1A1A]">
                    【{tobaType}】
                  </span>
                </label>

                {memApp.applied && (
                  <div className="flex items-center space-x-1 pt-1 border-t border-[#F0ECE1]">
                    <span className="text-[10px] font-bold text-amber-950 whitespace-nowrap">為書き:</span>
                    <input
                      type="text"
                      placeholder={`例: 為 亡${member.relationship || '家族'}〇〇`}
                      value={memApp.tamegaki || ''}
                      onChange={(e) => {
                        const updatedMem = setFamilyMemberTobaApplication(member, tobaType, true, e.target.value, currentTemple);
                        onUpdateMember(updatedMem);
                      }}
                      className="bg-amber-50/20 border border-[#1A1A1A] px-1.5 py-0.5 text-[11px] text-[#1A1A1A] font-serif w-full focus:outline-none focus:bg-white"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
