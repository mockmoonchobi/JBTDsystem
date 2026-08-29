import React, { useState, useEffect } from 'react';
import { Household, MasterOptions, TempleProfile, FamilyMember } from '../../types';
import { X, Save, Trash2, Plus, Phone, MapPin, Building2, User, UserPlus } from 'lucide-react';
import { cleanAndNormalizeHouseholdId, generateNewHouseholdId } from '../../utils/dankaIdUtils';

interface MobileHouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: Household | null;
  masterOptions?: MasterOptions;
  temples?: TempleProfile[];
  activeTempleId?: string;
  existingHouseholds?: Household[];
  onSave: (household: Household) => void;
  onDelete?: (id: string) => void;
}

export const MobileHouseholdModal: React.FC<MobileHouseholdModalProps> = ({
  isOpen,
  onClose,
  household,
  masterOptions,
  temples = [],
  activeTempleId = 'temple-main',
  existingHouseholds = [],
  onSave,
  onDelete,
}) => {
  const isEditing = !!household;

  const [formData, setFormData] = useState<Partial<Household>>({
    id: '',
    familyHead: '',
    furigana: '',
    postalCode: '',
    address: '',
    phone: '',
    mobile: '',
    householdType: masterOptions?.householdTypes?.[0] || '一般檀家',
    district: masterOptions?.districts?.[0] || '',
    status: '',
    tombNumber: '',
    notes: '',
    templeId: activeTempleId !== 'ALL' ? activeTempleId : 'temple-main',
    familyMembers: [],
  });

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRel, setNewMemberRel] = useState('長男');
  const [newMemberPhone, setNewMemberPhone] = useState('');

  useEffect(() => {
    if (household) {
      setFormData({
        ...household,
        familyMembers: household.familyMembers || [],
      });
    } else {
      const targetTemple = activeTempleId !== 'ALL' ? activeTempleId : (temples[0]?.id || 'temple-main');
      const autoId = generateNewHouseholdId(targetTemple, existingHouseholds, temples);
      setFormData({
        id: autoId,
        familyHead: '',
        furigana: '',
        postalCode: '',
        address: '',
        phone: '',
        mobile: '',
        householdType: masterOptions?.householdTypes?.[0] || '一般檀家',
        district: masterOptions?.districts?.[0] || '',
        status: '',
        tombNumber: '',
        notes: '',
        templeId: targetTemple,
        familyMembers: [],
      });
    }
  }, [household, isOpen, activeTempleId, masterOptions, existingHouseholds, temples]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.familyHead?.trim()) {
      alert('世帯主名を入力してください。');
      return;
    }

    const targetTemple = formData.templeId || (activeTempleId !== 'ALL' ? activeTempleId : (temples[0]?.id || 'temple-main'));
    const finalId = cleanAndNormalizeHouseholdId(formData.id || household?.id, targetTemple, temples) || generateNewHouseholdId(targetTemple, existingHouseholds, temples);

    const savedData: Household = {
      id: finalId,
      familyHead: formData.familyHead.trim(),
      furigana: formData.furigana?.trim() || '',
      postalCode: formData.postalCode?.trim() || '',
      address: formData.address?.trim() || '',
      phone: formData.phone?.trim() || '',
      mobile: formData.mobile?.trim() || '',
      email: formData.email?.trim() || '',
      householdType: formData.householdType || '一般檀家',
      district: formData.district || '',
      tombNumber: formData.tombNumber?.trim() || '',
      status: formData.status?.trim() || '',
      notes: formData.notes?.trim() || '',
      templeId: targetTemple,
      familyMembers: (formData.familyMembers || []).map((fm) => ({
        ...fm,
        householdId: finalId,
      })),
      createdAt: household?.createdAt || new Date().toISOString(),
    };

    onSave(savedData);
    onClose();
  };

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;
    const newMember: FamilyMember = {
      id: `FM-${Date.now()}`,
      householdId: household?.id || '',
      name: newMemberName.trim(),
      relationship: newMemberRel || '家族',
      phone: newMemberPhone.trim() || undefined,
    };
    setFormData((prev) => ({
      ...prev,
      familyMembers: [...(prev.familyMembers || []), newMember],
    }));
    setNewMemberName('');
    setNewMemberPhone('');
  };

  const handleRemoveMember = (memberId: string) => {
    setFormData((prev) => ({
      ...prev,
      familyMembers: (prev.familyMembers || []).filter((m) => m.id !== memberId),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 overflow-hidden">
      <div className="bg-[#FAF8F5] flex-1 flex flex-col max-w-lg w-full mx-auto shadow-2xl h-full">
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center justify-between border-b border-[#D4AF37]/50 shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-sm font-bold font-serif text-[#D4AF37]">
              {isEditing ? `世帯情報の編集 (${formData.familyHead || ''} 家)` : '新しい世帯の登録'}
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

          {/* Family Head & Furigana */}
          <div className="space-y-3 p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">
                世帯主氏名 <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例: 山田 太郎"
                value={formData.familyHead || ''}
                onChange={(e) => setFormData({ ...formData, familyHead: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-sm font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-[#555555] mb-1">フリガナ</label>
              <input
                type="text"
                placeholder="例: ヤマダ タロウ"
                value={formData.furigana || ''}
                onChange={(e) => setFormData({ ...formData, furigana: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
          </div>

          {/* Phone Numbers */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-[#8C2D19]" />
                電話番号 (固定)
              </label>
              <input
                type="tel"
                placeholder="例: 03-1234-5678"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-[#555555] mb-1">携帯電話</label>
              <input
                type="tel"
                placeholder="例: 090-1234-5678"
                value={formData.mobile || ''}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
          </div>

          {/* Address & Postal Code */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#8C2D19]" />
                郵便番号
              </label>
              <input
                type="text"
                placeholder="例: 123-4567"
                value={formData.postalCode || ''}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">ご住所</label>
              <input
                type="text"
                placeholder="例: 東京都世田谷区経堂1-2-3 ○○マンション101"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
              />
            </div>
          </div>

          {/* Categories / District / Tomb */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs">
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">檀家区分</label>
              <select
                value={formData.householdType || '一般檀家'}
                onChange={(e) => setFormData({ ...formData, householdType: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              >
                {(masterOptions?.householdTypes || ['一般檀家', '特別檀家', '信徒', '寺族', 'その他']).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">担当地区</label>
              <select
                value={formData.district || ''}
                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              >
                {(masterOptions?.districts || ['中央地区', '東部地区', '西部地区', '南部地区', '北部地区', '市外地区']).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">区分２ (現況/状態)</label>
              <input
                type="text"
                list="mobile-status-suggestions"
                placeholder="例: 健在, 遠方等 (空欄可)"
                value={formData.status || ''}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              />
              <datalist id="mobile-status-suggestions">
                {(masterOptions?.statuses || []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block font-bold text-[#1A1A1A] mb-1">墓地番号</label>
              <input
                type="text"
                placeholder="例: A-12"
                value={formData.tombNumber || ''}
                onChange={(e) => setFormData({ ...formData, tombNumber: e.target.value })}
                className="w-full p-2 border border-[#D1CEC7] bg-white text-xs font-bold"
              />
            </div>
          </div>

          {/* Family Members Section */}
          <div className="p-3 bg-[#FAF7F0] border border-[#D4AF37]/60 rounded-xs space-y-2">
            <label className="block font-bold text-[#8C2D19] flex items-center justify-between">
              <span>👨‍👩‍👧 家族構成 ({formData.familyMembers?.length || 0}名)</span>
            </label>

            {/* List of existing members */}
            {formData.familyMembers && formData.familyMembers.length > 0 && (
              <div className="space-y-1">
                {formData.familyMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-1.5 bg-white border border-[#E5E0D8] rounded-xs flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#1A1A1A]">{m.name}</span>
                      <span className="text-gray-500 ml-1.5">({m.relationship})</span>
                      {m.phone && <span className="text-gray-600 text-[10px] ml-1.5">{m.phone}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id)}
                      className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new member input */}
            <div className="pt-1.5 border-t border-[#E5E0D8] space-y-1.5">
              <div className="grid grid-cols-3 gap-1">
                <input
                  type="text"
                  placeholder="家族名"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="col-span-2 p-1.5 border border-[#D1CEC7] bg-white text-xs"
                />
                <input
                  type="text"
                  placeholder="続柄 (例: 長男)"
                  value={newMemberRel}
                  onChange={(e) => setNewMemberRel(e.target.value)}
                  className="p-1.5 border border-[#D1CEC7] bg-white text-xs"
                />
              </div>
              <div className="flex gap-1">
                <input
                  type="tel"
                  placeholder="電話番号 (任意)"
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value)}
                  className="flex-1 p-1.5 border border-[#D1CEC7] bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="px-2.5 py-1.5 bg-[#8C2D19] text-white rounded-xs font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加</span>
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs">
            <label className="block font-bold text-[#1A1A1A] mb-1">備考・特記事項</label>
            <textarea
              rows={2}
              placeholder="例: 年末カレンダー不要、施主は長男様など"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border border-[#D1CEC7] bg-white text-xs"
            />
          </div>

          {/* Delete action for editing */}
          {isEditing && onDelete && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`本当に「${formData.familyHead} 家」の世帯データを削除しますか？`)) {
                    onDelete(household.id);
                    onClose();
                  }
                }}
                className="text-red-600 hover:text-red-800 text-xs font-bold py-1.5 px-3 border border-red-200 bg-red-50 rounded-xs flex items-center gap-1 mx-auto cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>この世帯を削除する</span>
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
            <span>{isEditing ? '更新を保存' : '世帯を新規登録'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
