import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Building2, UserCheck, Calendar, Clock, ScrollText, Coins } from 'lucide-react';
import { Household, HouseholdType, HouseholdStatus, FamilyMember, MasterOptions, TempleProfile, Priest } from '../types';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SaveConfirmModal } from './SaveConfirmModal';
import { normalizeFurigana, formatCurrency } from '../utils/memorialCalculator';
import { cleanAndNormalizeHouseholdId, generateNewHouseholdId, getTemplePrefix } from '../utils/dankaIdUtils';
import { 
  getTobaSlots,
  getEffectiveTobaTypes, 
  getHouseholdTobaApplication, 
  setHouseholdTobaApplication, 
  getFamilyMemberTobaApplication, 
  setFamilyMemberTobaApplication 
} from '../utils/tobaUtils';
import { getFeeSlots, FeeSlotDef } from '../utils/feeUtils';

interface HouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (household: Household) => void;
  onDeleteHousehold?: (id: string) => void;
  editingHousehold?: Household | null;
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  temples?: TempleProfile[];
  activeTempleId?: string;
  existingHouseholds?: Household[];
  priests?: Priest[];
}

export const HouseholdModal: React.FC<HouseholdModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDeleteHousehold,
  editingHousehold,
  masterOptions,
  templeMasterOptionsMap,
  temples = [],
  activeTempleId,
  existingHouseholds = [],
  priests = [],
}) => {
  const [formData, setFormData] = useState<Partial<Household>>({
    id: '',
    templeId: 'temple-main',
    familyHead: '',
    furigana: '',
    postalCode: '',
    address: '',
    phone: '',
    mobile: '',
    email: '',
    householdType: '',
    district: '',
    tombNumber: '',
    status: '',
    notes: '',
    isSegakiToba: false,
    tanagyoMonthlyVisit: false,
    tanagyoDate: '',
    tanagyoTimeSlot: '',
    tanagyoPriestId: '',
    tanagyoPriestName: '',
    tanagyoOrder: undefined,
    tanagyoAddress: '',
    tanagyoNotes: '',
    familyMembers: [],
  });

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Active master options based on the currently selected household's temple
  const currentHouseholdTempleId = formData.templeId || activeTempleId || 'temple-main';
  const currentTemple = temples.find((t) => (t.id || 'temple-main') === currentHouseholdTempleId) || temples[0];
  const effectiveMasterOptions: MasterOptions = (templeMasterOptionsMap && templeMasterOptionsMap[currentHouseholdTempleId])
    || masterOptions
    || {
      householdTypes: [],
      statuses: [],
      districts: [],
      tobaTypes: [],
    };

  const configuredTobaSlots = getTobaSlots(currentTemple);
  const configuredTobaTypes = configuredTobaSlots.map((s) => s.name);
  const configuredFeeSlots = getFeeSlots(currentTemple);

  useEffect(() => {
    if (editingHousehold) {
      setFormData(editingHousehold);
      setFamilyMembers(editingHousehold.familyMembers || []);
    } else {
      const defaultTemple = activeTempleId && activeTempleId !== 'ALL' ? activeTempleId : (temples[0]?.id || 'temple-main');
      const autoId = generateNewHouseholdId(defaultTemple, existingHouseholds, temples);
      setFormData({
        id: autoId,
        templeId: defaultTemple,
        familyHead: '',
        furigana: '',
        postalCode: '',
        address: '',
        phone: '',
        mobile: '',
        email: '',
        householdType: '',
        district: '',
        tombNumber: '',
        qrToken: `QR-${autoId}`,
        status: '',
        notes: '',
        isSegakiToba: false,
        tanagyoMonthlyVisit: false,
        tanagyoAddress: '',
        tanagyoNotes: '',
        createdAt: new Date().toISOString().split('T')[0],
      });
      setFamilyMembers([]);
    }
  }, [editingHousehold, isOpen, activeTempleId, temples, existingHouseholds]);

  if (!isOpen) return null;

  const handleAddFamilyMember = () => {
    const newMember: FamilyMember = {
      id: `FM-${Date.now()}`,
      householdId: formData.id || '',
      name: '',
      furigana: '',
      relationship: '長男',
      phone: '',
      address: '',
      isSegakiToba: false,
    };
    setFamilyMembers([...familyMembers, newMember]);
  };

  const handleUpdateFamilyMember = (index: number, field: keyof FamilyMember, value: any) => {
    let updated = [...familyMembers];
    if ((field === 'isChiefMourner' || field === 'isSponsor') && value === true) {
      // 排他処理: 施主指定は世帯内で1人のみ
      updated = updated.map((m, i) => ({
        ...m,
        isChiefMourner: i === index,
        isSponsor: i === index,
      }));
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setFamilyMembers(updated);
  };

  const handleRemoveFamilyMember = (index: number) => {
    setFamilyMembers(familyMembers.filter((_, i) => i !== index));
  };

  const executeSaveAndClose = () => {
    if (!formData.familyHead) {
      alert('戸主氏名を入力してください。');
      return;
    }

    const targetTempleId = formData.templeId || (activeTempleId && activeTempleId !== 'ALL' ? activeTempleId : (temples[0]?.id || 'temple-main'));
    const finalId = cleanAndNormalizeHouseholdId(formData.id || '', targetTempleId, temples) || generateNewHouseholdId(targetTempleId, existingHouseholds, temples);

    const completeHousehold: Household = {
      id: finalId,
      templeId: targetTempleId,
      familyHead: formData.familyHead,
      furigana: normalizeFurigana(formData.furigana),
      postalCode: formData.postalCode || '',
      address: formData.address || '',
      phone: formData.phone || '',
      mobile: formData.mobile || '',
      email: formData.email || '',
      householdType: (formData.householdType as HouseholdType) || '',
      district: formData.district || '',
      tombNumber: formData.tombNumber || '',
      qrToken: formData.qrToken || `QR-${finalId}`,
      status: (formData.status as HouseholdStatus) || '',
      notes: formData.notes || '',
      familyMembers: familyMembers.map((m) => ({
        ...m,
        furigana: m.furigana ? normalizeFurigana(m.furigana) : undefined,
      })),
      isSegakiToba: !!formData.isSegakiToba,
      segakiTamegaki: formData.segakiTamegaki || '',
      tobaApplications: formData.tobaApplications || {},
      tanagyoMonthlyVisit: !!formData.tanagyoMonthlyVisit,
      tanagyoDate: formData.tanagyoDate || '',
      tanagyoTimeSlot: formData.tanagyoTimeSlot || '',
      tanagyoPriestId: formData.tanagyoPriestId || '',
      tanagyoPriestName: formData.tanagyoPriestName || '',
      tanagyoOrder: formData.tanagyoOrder !== undefined && formData.tanagyoOrder !== null && !isNaN(Number(formData.tanagyoOrder)) && Number(formData.tanagyoOrder) > 0 ? Number(formData.tanagyoOrder) : undefined,
      tanagyoAddress: formData.tanagyoAddress || '',
      tanagyoNotes: formData.tanagyoNotes || '',
      createdAt: formData.createdAt || new Date().toISOString().split('T')[0],
    };

    onSave(completeHousehold);
    setShowSaveConfirm(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    setShowSaveConfirm(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-serif">
      <div className="bg-white border border-[#D1CEC7] shadow-2xl w-full max-w-3xl overflow-hidden text-[#2D2D2D] my-8">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-6 py-4 border-b border-[#D4AF37] flex items-center justify-between text-[#F9F7F2]">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs">
              世帯
            </div>
            <h2 className="text-lg font-bold text-[#F9F7F2] tracking-wider">
              {editingHousehold ? '檀家世帯情報の編集' : '新規檀家世帯の登録'}
            </h2>
          </div>
          <button
            onClick={handleRequestClose}
            className="text-[#CCCCCC] hover:text-white transition p-1 cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto font-sans">
          {/* Section 1: 基本情報 */}
          <div className="bg-[#F9F7F2] p-4 border border-[#D1CEC7] space-y-4">
            <h3 className="text-xs font-serif font-bold text-[#1A1A1A] border-b border-[#D1CEC7] pb-2 uppercase tracking-wider">
              基本情報
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {temples && temples.length > 1 && (
                <div className="md:col-span-3 bg-white p-2.5 border border-[#D1CEC7] flex items-center justify-between">
                  <label className="font-bold text-[#1A1A1A] flex items-center gap-1.5 whitespace-nowrap">
                    <Building2 className="w-4 h-4 text-[#D4AF37]" />
                    所属寺院:
                  </label>
                  <select
                    value={formData.templeId || (activeTempleId !== 'ALL' ? activeTempleId : temples[0]?.id || 'temple-main')}
                    onChange={(e) => {
                      const newTId = e.target.value;
                      if (!editingHousehold) {
                        const newAutoId = generateNewHouseholdId(newTId, existingHouseholds, temples);
                        setFormData({
                          ...formData,
                          templeId: newTId,
                          id: newAutoId,
                          qrToken: `QR-${newAutoId}`,
                        });
                      } else {
                        setFormData({ ...formData, templeId: newTId });
                      }
                    }}
                    className="bg-[#F9F7F2] border border-[#D1CEC7] px-3 py-1.5 text-xs font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none flex-1 ml-4"
                  >
                    {temples.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.isMain ? '【本寺】' : '【兼務】'} {t.mountainName ? `${t.mountainName} ` : ''}{t.name || '無名寺院'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-[#444444] mb-1">檀家番号 (ID)</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] font-mono focus:border-[#1A1A1A] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">世帯主 *</label>
                <input
                  type="text"
                  placeholder="例: 佐藤 謙一"
                  value={formData.familyHead}
                  onChange={(e) => setFormData({ ...formData, familyHead: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] font-bold focus:border-[#1A1A1A] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">ふりがな</label>
                <input
                  type="text"
                  placeholder="例: さとう けんいち"
                  value={formData.furigana}
                  onChange={(e) => setFormData({ ...formData, furigana: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">区分１</label>
                <input
                  type="text"
                  list="householdType-suggestions"
                  placeholder="例: 正檀家, 役員, 信徒"
                  value={formData.householdType}
                  onChange={(e) => setFormData({ ...formData, householdType: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
                <datalist id="householdType-suggestions">
                  {(effectiveMasterOptions?.householdTypes || ['正檀家', '役員', '特別檀家', '信徒', '寄付檀家', '墓地のみ', '縁者']).map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">区分２</label>
                <input
                  type="text"
                  list="status-suggestions"
                  placeholder="例: 健在, 遠方等 (空欄可)"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
                <datalist id="status-suggestions">
                  {(effectiveMasterOptions?.statuses || []).map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">役職</label>
                <input
                  type="text"
                  list="district-suggestions"
                  placeholder="例: 総代, 世話人, 役員"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
                <datalist id="district-suggestions">
                  {(effectiveMasterOptions?.districts || ['総代', '世話人', '役員', '東区 (世話人)', '西区 (世話人)', '中央区', '南区', '北区']).map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#444444] mb-1">墓地・納骨堂位置</label>
                <input
                  type="text"
                  placeholder="例: A-12 墓地 または 納骨堂 B-302"
                  value={formData.tombNumber}
                  onChange={(e) => setFormData({ ...formData, tombNumber: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              {/* 塔婆申込み（世帯主・各種塔婆） */}
              <div className="md:col-span-3 pt-2 border-t border-[#D1CEC7]">
                <div className="bg-amber-50/70 p-3 border border-amber-300 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-950">
                      <ScrollText className="w-4 h-4 text-amber-800" />
                      <span>塔婆申込・為書き設定（世帯主本人）</span>
                    </div>
                    <span className="text-[11px] text-amber-900">
                      ※寺院設定で定義された塔婆種類（施餓鬼・彼岸・合同供養等）ごとに申込と為書きを管理できます
                    </span>
                  </div>

                  <div className="space-y-2">
                    {configuredTobaSlots.map((slot) => {
                      const tobaType = slot.name;
                      const app = getHouseholdTobaApplication(formData, tobaType, currentTemple);
                      return (
                        <div key={slot.slot} className="bg-white p-2 border border-amber-200 shadow-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={app.applied}
                                onChange={(e) => {
                                  const updated = setHouseholdTobaApplication(formData as Household, tobaType, e.target.checked, app.tamegaki, currentTemple);
                                  setFormData(updated);
                                }}
                                className="w-4 h-4 accent-[#1A1A1A]"
                              />
                              <span className="font-bold text-xs text-[#1A1A1A]">
                                【{tobaType}】申込み
                              </span>
                            </label>
                            {app.applied && (
                              <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                                申込中
                              </span>
                            )}
                          </div>

                          {app.applied && (
                            <div className="flex items-center space-x-2 pt-1 border-t border-[#F0ECE1]">
                              <label className="text-[11px] font-bold text-amber-950 whitespace-nowrap">
                                為書き (回向対象):
                              </label>
                              <input
                                type="text"
                                placeholder={`例: ${formData.familyHead ? formData.familyHead.split(' ')[0] : '〇〇'}家先祖代々精霊、為 亡父〇〇、釈道修居士 等`}
                                value={app.tamegaki || ''}
                                onChange={(e) => {
                                  const updated = setHouseholdTobaApplication(formData as Household, tobaType, true, e.target.value, currentTemple);
                                  setFormData(updated);
                                }}
                                className="flex-1 bg-amber-50/30 border border-[#1A1A1A] px-2.5 py-1 text-xs text-[#1A1A1A] font-serif focus:outline-none focus:bg-white"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 集金項目設定（寺院設定集金項目１〜３・個別金額設定） */}
              <div className="md:col-span-3 pt-2 border-t border-[#D1CEC7]">
                <div className="bg-emerald-50/70 p-3 border border-emerald-300 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-950">
                      <Coins className="w-4 h-4 text-emerald-800" />
                      <span>集金項目・個別金額設定（護持会費・管理費等）</span>
                    </div>
                    <span className="text-[11px] text-emerald-900">
                      ※寺院情報に登録された集金項目１〜３と連動し、各世帯ごとの個別金額を設定できます
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* 集金項目１ */}
                    {(() => {
                      const slot1Name = currentTemple?.feeType1 || '集金項目１ (護持会費等)';
                      const slot1Cat = currentTemple?.feeType1Category || currentTemple?.feeType1 || '護持会費';
                      const currentVal1 = formData.fee1Amount !== undefined ? formData.fee1Amount : (formData.fee1 !== undefined && formData.fee1 !== '' ? Number(formData.fee1) : undefined);

                      return (
                        <div className="bg-white p-2.5 border border-emerald-200 shadow-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-emerald-950 truncate max-w-[150px]" title={slot1Name}>
                              【第1枠】{slot1Name}
                            </span>
                            <span className="text-[10px] bg-emerald-100/70 text-emerald-800 px-1.5 py-0.2 rounded-2xs font-sans">
                              {slot1Cat}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-[#666666] mb-1">
                              <span>世帯個別金額:</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold">¥</span>
                              <input
                                type="number"
                                placeholder="未設定 (円)"
                                value={currentVal1 ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                                  setFormData({ ...formData, fee1Amount: val, fee1: val });
                                }}
                                className="w-full bg-[#FAF9F5] border border-[#D1CEC7] pl-6 pr-2 py-1 text-xs font-mono font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 集金項目２ */}
                    {(() => {
                      const slot2Name = currentTemple?.feeType2 || '集金項目２ (墓地管理費等)';
                      const slot2Cat = currentTemple?.feeType2Category || currentTemple?.feeType2 || '墓地管理費';
                      const currentVal2 = formData.fee2Amount !== undefined ? formData.fee2Amount : (formData.fee2 !== undefined && formData.fee2 !== '' ? Number(formData.fee2) : undefined);

                      return (
                        <div className="bg-white p-2.5 border border-emerald-200 shadow-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-emerald-950 truncate max-w-[150px]" title={slot2Name}>
                              【第2枠】{slot2Name}
                            </span>
                            <span className="text-[10px] bg-emerald-100/70 text-emerald-800 px-1.5 py-0.2 rounded-2xs font-sans">
                              {slot2Cat}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-[#666666] mb-1">
                              <span>世帯個別金額:</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold">¥</span>
                              <input
                                type="number"
                                placeholder="未設定 (円)"
                                value={currentVal2 ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                                  setFormData({ ...formData, fee2Amount: val, fee2: val });
                                }}
                                className="w-full bg-[#FAF9F5] border border-[#D1CEC7] pl-6 pr-2 py-1 text-xs font-mono font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 集金項目３ */}
                    {(() => {
                      const slot3Name = currentTemple?.feeType3 || '集金項目３ (境内整備費等)';
                      const slot3Cat = currentTemple?.feeType3Category || currentTemple?.feeType3 || '特別寄付';
                      const currentVal3 = formData.fee3Amount !== undefined ? formData.fee3Amount : (formData.fee3 !== undefined && formData.fee3 !== '' ? Number(formData.fee3) : undefined);

                      return (
                        <div className="bg-white p-2.5 border border-emerald-200 shadow-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-emerald-950 truncate max-w-[150px]" title={slot3Name}>
                              【第3枠】{slot3Name}
                            </span>
                            <span className="text-[10px] bg-emerald-100/70 text-emerald-800 px-1.5 py-0.2 rounded-2xs font-sans">
                              {slot3Cat}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-[#666666] mb-1">
                              <span>世帯個別金額:</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold">¥</span>
                              <input
                                type="number"
                                placeholder="未設定 (円)"
                                value={currentVal3 ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                                  setFormData({ ...formData, fee3Amount: val, fee3: val });
                                }}
                                className="w-full bg-[#FAF9F5] border border-[#D1CEC7] pl-6 pr-2 py-1 text-xs font-mono font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: 棚経 / 月参り */}
          <div className="bg-[#F9F7F2] p-4 border border-[#D1CEC7] space-y-3">
            <div className="flex items-center justify-between border-b border-[#D1CEC7] pb-2">
              <h3 className="text-xs font-serif font-bold text-[#1A1A1A] uppercase tracking-wider flex items-center gap-1.5">
                <span>棚経 / お盆巡回 伺い先設定</span>
              </h3>
              <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1 border border-[#D1CEC7] hover:border-[#1A1A1A] transition-colors">
                <input
                  type="checkbox"
                  checked={!!formData.tanagyoMonthlyVisit}
                  onChange={(e) => setFormData({ ...formData, tanagyoMonthlyVisit: e.target.checked })}
                  className="w-4 h-4 accent-[#1A1A1A]"
                />
                <span className="font-bold text-xs text-[#1A1A1A]">棚経 / お盆巡回 対象世帯</span>
              </label>
            </div>

            {formData.tanagyoMonthlyVisit && (
              <div className="space-y-3 pt-1">
                {/* 訪問日・午前/午後・担当僧侶 */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs bg-white p-3 border border-[#E5E0D8]">
                  {/* 訪問日 */}
                  <div className="sm:col-span-4">
                    <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#8C2D19]" />
                      <span>訪問日</span>
                    </label>
                    <div className="space-y-1">
                      <input
                        type="text"
                        placeholder="例: 8/13 または 8/14"
                        value={formData.tanagyoDate || ''}
                        onChange={(e) => setFormData({ ...formData, tanagyoDate: e.target.value })}
                        className="w-full bg-[#FDFCFB] border border-[#D1CEC7] px-3 py-1.5 text-xs font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                      />
                      <div className="flex items-center gap-1 flex-wrap">
                        {['8/13', '8/14', '8/15', '8/16'].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setFormData({ ...formData, tanagyoDate: d })}
                            className={`px-1.5 py-0.5 text-[10px] rounded-xs border cursor-pointer font-bold ${
                              formData.tanagyoDate === d
                                ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                                : 'bg-[#FAF8F5] text-[#555] border-[#D1CEC7] hover:bg-[#EBE5DA]'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                        {formData.tanagyoDate && (
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, tanagyoDate: '' })}
                            className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-red-600 underline cursor-pointer"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 午前 / 午後 */}
                  <div className="sm:col-span-3">
                    <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#8C2D19]" />
                      <span>時間帯</span>
                    </label>
                    <select
                      value={formData.tanagyoTimeSlot || ''}
                      onChange={(e) => setFormData({ ...formData, tanagyoTimeSlot: e.target.value })}
                      className="w-full bg-[#FDFCFB] border border-[#D1CEC7] px-2.5 py-1.5 text-xs font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                    >
                      <option value="">未指定</option>
                      <option value="午前">午前</option>
                      <option value="午後">午後</option>
                    </select>
                  </div>

                  {/* 担当僧侶 */}
                  <div className="sm:col-span-3">
                    <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-[#8C2D19]" />
                      <span>担当僧侶</span>
                    </label>
                    <select
                      value={formData.tanagyoPriestId || ''}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const foundPriest = priests.find((p) => p.id === selectedId);
                        setFormData({
                          ...formData,
                          tanagyoPriestId: selectedId,
                          tanagyoPriestName: foundPriest ? foundPriest.name : (selectedId ? selectedId : ''),
                        });
                      }}
                      className="w-full bg-[#FDFCFB] border border-[#D1CEC7] px-2.5 py-1.5 text-xs font-bold text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                    >
                      <option value="">未定 / 担当なし</option>
                      {priests.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.role ? `(${p.role})` : ''} {p.templeName ? `[${p.templeName}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 巡回順序 */}
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#1A1A1A] mb-1 flex items-center gap-1">
                      <span className="text-[#8C2D19] font-mono">No.</span>
                      <span>巡回順序</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="番号"
                      value={formData.tanagyoOrder ?? ''}
                      onChange={(e) => setFormData({ ...formData, tanagyoOrder: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-[#FDFCFB] border border-[#D1CEC7] px-2.5 py-1.5 text-xs font-bold font-mono text-center text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
                      title="巡回ルート上の訪問順序番号（1, 2, 3...）"
                    />
                  </div>
                </div>

                {/* 伺い先住所・特記 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="md:col-span-2">
                    <label className="block font-bold text-[#444444] mb-1">
                      棚経 伺い先住所（通常の世帯住所と異なる場合に入力）
                    </label>
                    <input
                      type="text"
                      placeholder="未入力の場合は、下記の世帯住所へ伺います"
                      value={formData.tanagyoAddress || ''}
                      onChange={(e) => setFormData({ ...formData, tanagyoAddress: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                    />
                    <p className="text-[10px] text-[#888888] mt-0.5">
                      ※空欄の場合は「連絡先・所在地」の世帯住所がデフォルトとして自動適用されます。
                    </p>
                  </div>
                  <div>
                    <label className="block font-bold text-[#444444] mb-1">訪問時特記・時間帯等</label>
                    <input
                      type="text"
                      placeholder="例: 午前中早め希望、仏間は離れ"
                      value={formData.tanagyoNotes || ''}
                      onChange={(e) => setFormData({ ...formData, tanagyoNotes: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: 連絡先・住所 */}
          <div className="bg-[#F9F7F2] p-4 border border-[#D1CEC7] space-y-4">
            <h3 className="text-xs font-serif font-bold text-[#1A1A1A] border-b border-[#D1CEC7] pb-2 uppercase tracking-wider">
              連絡先・所在地
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-[#444444] mb-1">郵便番号</label>
                <input
                  type="text"
                  placeholder="例: 105-0011"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#444444] mb-1">住所</label>
                <input
                  type="text"
                  placeholder="例: 東京都港区芝公園4-7-10"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">固定電話</label>
                <input
                  type="text"
                  placeholder="例: 03-3432-1111"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">携帯電話</label>
                <input
                  type="text"
                  placeholder="例: 090-1234-5678"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444444] mb-1">メールアドレス</label>
                <input
                  type="email"
                  placeholder="例: satou@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-white border border-[#D1CEC7] px-3 py-1.5 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: 家族構成 */}
          <div className="bg-[#F9F7F2] p-4 border border-[#D1CEC7] space-y-4">
            <div className="flex items-center justify-between border-b border-[#D1CEC7] pb-2">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-serif font-bold text-[#1A1A1A] uppercase tracking-wider">
                  家族構成 ({familyMembers.length}名)
                </h3>
                <span className="text-[11px] text-[#666666]">（ふりがな・個別住所・施餓鬼塔婆チェック可）</span>
              </div>
              <button
                type="button"
                onClick={handleAddFamilyMember}
                className="flex items-center space-x-1 text-xs bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] px-2.5 py-1 font-bold uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>家族追加</span>
              </button>
            </div>

            {familyMembers.length === 0 ? (
              <p className="text-xs text-[#888888] py-2 italic text-center">家族構成が未登録です。「家族追加」から登録できます。</p>
            ) : (
              <div className="space-y-3">
                {familyMembers.map((member, idx) => (
                  <div key={member.id || idx} className="bg-white p-3 border border-[#D1CEC7] space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-bold text-[#666666] mb-0.5">氏名</label>
                        <input
                          type="text"
                          placeholder="氏名"
                          value={member.name}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'name', e.target.value)}
                          className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-bold text-[#666666] mb-0.5">ふりがな</label>
                        <input
                          type="text"
                          placeholder="ふりがな"
                          value={member.furigana || ''}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'furigana', e.target.value)}
                          className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-[#666666] mb-0.5">続柄</label>
                        <input
                          type="text"
                          placeholder="妻, 長男等"
                          value={member.relationship}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'relationship', e.target.value)}
                          className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-[10px] font-bold text-[#666666] mb-0.5">電話番号</label>
                        <input
                          type="text"
                          placeholder="電話番号"
                          value={member.phone || ''}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'phone', e.target.value)}
                          className="bg-[#F9F7F2] border border-[#D1CEC7] px-2 py-1 text-xs text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <div className="pt-4">
                        <button
                          type="button"
                          onClick={() => handleRemoveFamilyMember(idx)}
                          className="text-rose-800 hover:text-rose-900 p-1 bg-rose-50 border border-rose-200"
                          title="家族を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F0ECE1]">
                      <div className="flex-1 min-w-[200px]">
                        <input
                          type="text"
                          placeholder="住所（別居・現住所などが世帯と異なる場合に入力）"
                          value={member.address || ''}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'address', e.target.value)}
                          className="bg-[#FAF9F5] border border-[#D1CEC7] px-2 py-1 text-[11px] text-[#2D2D2D] w-full focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <label className={`flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 border transition-colors shrink-0 ${member.isChiefMourner || member.isSponsor ? 'bg-[#8C2D19] text-white border-[#8C2D19]' : 'bg-stone-100 text-[#1A1A1A] border-[#CCCCCC] hover:border-[#8C2D19]'}`} title="この人物を世帯の「現在の施主」として指定（他地域在住の子息など）">
                        <input
                          type="checkbox"
                          checked={!!(member.isChiefMourner || member.isSponsor)}
                          onChange={(e) => handleUpdateFamilyMember(idx, 'isChiefMourner', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#8C2D19]"
                        />
                        <span className="font-bold text-[11px]">★ 施主に指定</span>
                      </label>
                    </div>

                    {/* 塔婆申込み（家族メンバー・各種塔婆） */}
                    <div className="bg-amber-50/50 p-2 border border-amber-200/80 space-y-1.5 mt-1">
                      <div className="text-[10px] font-bold text-amber-950 flex items-center gap-1">
                        <ScrollText className="w-3 h-3 text-amber-800" />
                        <span>塔婆申込・為書き（{member.name || `家族 ${idx + 1}`}）:</span>
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
                                    const updatedList = [...familyMembers];
                                    updatedList[idx] = updatedMem;
                                    setFamilyMembers(updatedList);
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
                                      const updatedList = [...familyMembers];
                                      updatedList[idx] = updatedMem;
                                      setFamilyMembers(updatedList);
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
                ))}
              </div>
            )}
          </div>

          {/* Section 4: 備考 */}
          <div>
            <label className="block text-xs font-bold text-[#444444] mb-1">寺院備考・伝達事項</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] text-xs focus:border-[#1A1A1A] focus:outline-none"
              placeholder="特記事項や役員・護持会での注意事項などを入力..."
            ></textarea>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#D1CEC7]">
            <div>
              {editingHousehold && onDeleteHousehold && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-bold text-xs flex items-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                  <span>世帯データを削除</span>
                </button>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                世帯情報を保存する
              </button>
            </div>
          </div>
        </form>
      </div>

      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="檀家世帯情報の保存確認"
        message="編集中の世帯情報を保存しますか？"
        description="「保存して閉じる」を押すと、変更内容を反映して保存します。「保存せずに閉じる」を押すと入力内容は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          onClose();
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="世帯データの削除"
        message="削除しますか？"
        itemName={editingHousehold ? `${editingHousehold.familyHead} 殿` : undefined}
        onConfirm={() => {
          if (editingHousehold && onDeleteHousehold) {
            onDeleteHousehold(editingHousehold.id);
            setShowDeleteModal(false);
            onClose();
          }
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};
