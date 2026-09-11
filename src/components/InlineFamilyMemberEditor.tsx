import React from 'react';
import { Trash2 } from 'lucide-react';
import { FamilyMember, TempleProfile } from '../types';
import { useAutoKana } from '../hooks/useAutoKana';
import { TobaSlotDef, getFamilyMemberTobaApplication, setFamilyMemberTobaApplication } from '../utils/tobaUtils';

interface InlineFamilyMemberEditorProps {
  member: FamilyMember;
  index: number;
  tobaSlots?: TobaSlotDef[];
  temple?: TempleProfile;
  onUpdateField: (field: keyof FamilyMember, value: any) => void;
  onUpdateMember: (updated: FamilyMember) => void;
  onRemove: () => void;
  onSetChiefMourner: (checked: boolean) => void;
}

export const InlineFamilyMemberEditor: React.FC<InlineFamilyMemberEditorProps> = ({
  member,
  index,
  tobaSlots = [],
  temple,
  onUpdateField,
  onUpdateMember,
  onRemove,
  onSetChiefMourner,
}) => {
  const { isCustomized, resetFurigana, nameInputProps, furiganaInputProps } = useAutoKana({
    nameValue: member.name || '',
    furiganaValue: member.furigana || '',
    onNameChange: (newName) => onUpdateField('name', newName),
    onFuriganaChange: (newFuri) => onUpdateField('furigana', newFuri),
  });

  return (
    <div
      className={`bg-white border p-3 space-y-2 shadow-xs ${
        member.isChiefMourner || member.isSponsor
          ? 'border-[#8C2D19] ring-1 ring-[#8C2D19]/40'
          : 'border-[#1A1A1A]'
      }`}
    >
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="氏名（例: 山田 太郎）"
          {...nameInputProps}
          className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] font-bold w-full focus:border-[#1A1A1A] focus:outline-none"
        />
        <div className="relative">
          <input
            type="text"
            placeholder="ふりがな"
            {...furiganaInputProps}
            className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] w-28 focus:border-[#1A1A1A] focus:outline-none"
          />
          {isCustomized && member.furigana && (
            <button
              type="button"
              onClick={resetFurigana}
              className="absolute -top-3.5 right-0 text-[8px] text-[#888888] hover:text-[#1A1A1A] underline cursor-pointer"
              title="自動再同期"
            >
              再同期
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="続柄"
          value={member.relationship}
          onChange={(e) => onUpdateField('relationship', e.target.value)}
          className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] font-bold w-20 focus:border-[#1A1A1A] focus:outline-none"
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="電話番号"
          value={member.phone || ''}
          onChange={(e) => onUpdateField('phone', e.target.value)}
          className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs font-mono text-[#1A1A1A] w-full focus:border-[#1A1A1A] focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold shrink-0 cursor-pointer"
          title="この家族を削除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F0ECE1]">
        <input
          type="text"
          placeholder="住所（別居・現住所等）"
          value={member.address || ''}
          onChange={(e) => onUpdateField('address', e.target.value)}
          className="bg-[#FAF9F5] border border-[#D1CEC7] p-1 text-[11px] text-[#1A1A1A] flex-1 min-w-[140px] focus:border-[#1A1A1A] focus:outline-none"
        />
        {/* 施主指定チェックボックス */}
        <label
          className={`flex items-center space-x-1 cursor-pointer px-2 py-1 border shrink-0 transition-colors ${
            member.isChiefMourner || member.isSponsor
              ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
              : 'bg-stone-100 text-[#1A1A1A] border-[#CCCCCC] hover:border-[#8C2D19]'
          }`}
          title="この人物を世帯の「現在の施主」として指定（他地域在住の子息など）"
        >
          <input
            type="checkbox"
            checked={!!(member.isChiefMourner || member.isSponsor)}
            onChange={(e) => onSetChiefMourner(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#8C2D19]"
          />
          <span className="font-bold text-[10px]">★ 施主指定</span>
        </label>
      </div>

      {/* 家族の塔婆申込 & 為書き設定 (スロット一覧) */}
      {tobaSlots.length > 0 && (
        <div className="pt-2 border-t border-[#F0ECE1] space-y-1.5 bg-[#FAF9F5] p-2">
          <span className="block text-[10px] font-bold text-[#555555]">塔婆申込・為書き:</span>
          {tobaSlots.map((slot) => {
            const tobaType = slot.name;
            const app = getFamilyMemberTobaApplication(member, tobaType, temple);
            return (
              <div key={slot.slot} className="space-y-1 p-1 bg-white border border-[#E5E2DC]">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!app.applied}
                    onChange={(e) => {
                      const updatedMember = setFamilyMemberTobaApplication(
                        member,
                        tobaType,
                        e.target.checked,
                        app.tamegaki,
                        temple
                      );
                      onUpdateMember(updatedMember);
                    }}
                    className="w-3.5 h-3.5 accent-[#1A1A1A]"
                  />
                  <span className="font-bold text-[10px] text-[#1A1A1A]">{tobaType}</span>
                </label>
                {app.applied && (
                  <input
                    type="text"
                    placeholder="為書き (例: 亡〇〇)"
                    value={app.tamegaki || ''}
                    onChange={(e) => {
                      const updatedMember = setFamilyMemberTobaApplication(
                        member,
                        tobaType,
                        true,
                        e.target.value,
                        temple
                      );
                      onUpdateMember(updatedMember);
                    }}
                    className="bg-[#FAF9F5] border border-[#1A1A1A] p-1 text-[11px] text-[#1A1A1A] font-serif w-full focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
