import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Save,
  Printer,
  HeartHandshake,
  Building,
  Filter,
  X,
  Edit2
} from 'lucide-react';
import { FamilyMember, Household } from '../types';

interface FamilyManagerProps {
  familyMembers: FamilyMember[];
  households: Household[];
  onAddFamilyMember: (member: FamilyMember) => void;
  onUpdateFamilyMember: (member: FamilyMember) => void;
  onDeleteFamilyMember: (id: string) => void;
}

export const FamilyManager: React.FC<FamilyManagerProps> = ({
  familyMembers,
  households,
  onAddFamilyMember,
  onUpdateFamilyMember,
  onDeleteFamilyMember,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHouseholdFilter, setSelectedHouseholdFilter] = useState('ALL');
  const [relationshipFilter, setRelationshipFilter] = useState('ALL');

  // Inline edit state
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<Partial<FamilyMember> | null>(null);

  // Bottom inline entry state for adding new member
  const [newMemberForm, setNewMemberForm] = useState<Partial<FamilyMember>>({
    householdId: households[0]?.id || '',
    name: '',
    relationship: '妻',
    phone: '',
    notes: '',
  });

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<FamilyMember | null>(null);

  // Filter family members
  const filteredMembers = familyMembers.filter((m) => {
    const household = households.find((h) => h.id === m.householdId);
    const householdHead = household ? household.familyHead : '';

    const matchesHousehold =
      selectedHouseholdFilter === 'ALL' || m.householdId === selectedHouseholdFilter;

    const matchesRelationship =
      relationshipFilter === 'ALL' || m.relationship === relationshipFilter;

    const matchesSearch =
      m.name.includes(searchTerm) ||
      m.relationship.includes(searchTerm) ||
      (m.phone && m.phone.includes(searchTerm)) ||
      (m.notes && m.notes.includes(searchTerm)) ||
      m.householdId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      householdHead.includes(searchTerm);

    return matchesHousehold && matchesRelationship && matchesSearch;
  });

  // Unique relationships list for filter dropdown
  const relationshipOptions = Array.from(
    new Set(familyMembers.map((m) => m.relationship).filter(Boolean))
  );

  // Save Inline Edit
  const handleSaveInlineEdit = () => {
    if (!inlineForm || !editingMemberId) return;
    if (!inlineForm.name?.trim()) {
      alert('氏名を入力してください。');
      return;
    }

    const updated: FamilyMember = {
      id: editingMemberId,
      householdId: inlineForm.householdId || households[0]?.id || '',
      name: inlineForm.name.trim(),
      furigana: inlineForm.furigana?.trim() || '',
      relationship: inlineForm.relationship || '家族',
      phone: inlineForm.phone || '',
      address: inlineForm.address || '',
      isChiefMourner: !!(inlineForm.isChiefMourner || inlineForm.isSponsor),
      isSponsor: !!(inlineForm.isChiefMourner || inlineForm.isSponsor),
      isSegakiToba: !!inlineForm.isSegakiToba,
      segakiTamegaki: inlineForm.segakiTamegaki?.trim() || '',
      notes: inlineForm.notes || '',
    };

    onUpdateFamilyMember(updated);
    setEditingMemberId(null);
    setInlineForm(null);
  };

  // Save New Bottom Inline Member
  const handleSaveNewMember = () => {
    if (!newMemberForm.name?.trim()) {
      alert('氏名を入力してください。');
      return;
    }

    const newMember: FamilyMember = {
      id: `FM-${Date.now()}`,
      householdId: newMemberForm.householdId || households[0]?.id || '',
      name: newMemberForm.name.trim(),
      furigana: newMemberForm.furigana?.trim() || '',
      relationship: newMemberForm.relationship || '家族',
      phone: newMemberForm.phone || '',
      address: newMemberForm.address || '',
      isChiefMourner: !!(newMemberForm.isChiefMourner || newMemberForm.isSponsor),
      isSponsor: !!(newMemberForm.isChiefMourner || newMemberForm.isSponsor),
      isSegakiToba: !!newMemberForm.isSegakiToba,
      segakiTamegaki: newMemberForm.segakiTamegaki?.trim() || '',
      notes: newMemberForm.notes || '',
    };

    onAddFamilyMember(newMember);

    // Reset form
    setNewMemberForm({
      householdId: newMemberForm.householdId,
      name: '',
      furigana: '',
      relationship: newMemberForm.relationship || '妻',
      phone: '',
      address: '',
      isChiefMourner: false,
      isSponsor: false,
      isSegakiToba: false,
      segakiTamegaki: '',
      notes: '',
    });
  };

  return (
    <div className="space-y-6 font-serif">
      {/* Top Banner */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37] p-5 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 text-[#F9F7F2] no-print">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs">
              親族
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">
              家族構成・存命親族名簿管理
            </h2>
          </div>
          <p className="text-xs text-[#CCCCCC] mt-1.5 font-sans tracking-wide">
            檀家ID（筆頭者）と紐づく存命ご家族・ご親族のリレーショナル名簿です。行の末尾で直接入力・追加が可能です。
          </p>
        </div>

        <div className="flex items-center space-x-2 font-sans text-xs">
          <button
            onClick={() => {
              try {
                window.focus();
                window.print();
              } catch (e) {
                alert("印刷エラー: [Ctrl + P] で印刷してください。");
              }
            }}
            className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold tracking-wider uppercase flex items-center space-x-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>家族構成名簿を印刷</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#D1CEC7] p-4 shadow-sm space-y-3 font-sans no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#888888] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="氏名・筆頭者名・続柄・電話番号で検索..."
              className="w-full pl-9 pr-3 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-xs font-sans text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Household Filter */}
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-[#888888] shrink-0" />
            <select
              value={selectedHouseholdFilter}
              onChange={(e) => setSelectedHouseholdFilter(e.target.value)}
              className="w-full p-2 bg-[#F9F7F2] border border-[#D1CEC7] text-xs font-sans font-bold text-[#1A1A1A]"
            >
              <option value="ALL">全世帯を表示 ({households.length}世帯)</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  【ID:{h.id}】{h.familyHead} 家 ({h.district || '地区未定'})
                </option>
              ))}
            </select>
          </div>

          {/* Relationship Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-[#888888] shrink-0" />
            <select
              value={relationshipFilter}
              onChange={(e) => setRelationshipFilter(e.target.value)}
              className="w-full p-2 bg-[#F9F7F2] border border-[#D1CEC7] text-xs font-sans font-bold text-[#1A1A1A]"
            >
              <option value="ALL">全続柄を表示</option>
              {relationshipOptions.map((rel) => (
                <option key={rel} value={rel}>
                  続柄: {rel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center text-xs text-[#666666] pt-1">
          <div>
            該当件数: <strong className="text-[#1A1A1A] font-bold">{filteredMembers.length}</strong> 件 / 全 {familyMembers.length} 名
          </div>
          {(searchTerm || selectedHouseholdFilter !== 'ALL' || relationshipFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedHouseholdFilter('ALL');
                setRelationshipFilter('ALL');
              }}
              className="text-xs text-rose-700 hover:underline flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>フィルター解除</span>
            </button>
          )}
        </div>
      </div>

      {/* Relational Family Table */}
      <div className="overflow-x-auto bg-white border border-[#D1CEC7] shadow-sm font-sans print-ink-saver">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#1A1A1A] text-[#D4AF37] uppercase tracking-wider font-bold border-b border-[#D4AF37]">
            <tr>
              <th className="p-3 whitespace-nowrap">檀家ID / 所属世帯</th>
              <th className="p-3 whitespace-nowrap">氏名 / ふりがな</th>
              <th className="p-3 whitespace-nowrap">続柄</th>
              <th className="p-3 whitespace-nowrap text-center">施主指定</th>
              <th className="p-3 whitespace-nowrap">連絡先（電話）/ 住所</th>
              <th className="p-3 whitespace-nowrap">施餓鬼塔婆 / 為書き</th>
              <th className="p-3 whitespace-nowrap">備考・メモ</th>
              <th className="p-3 text-right whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBE7DF] text-[#2D2D2D]">
            {filteredMembers.map((member) => {
              const isEditing = editingMemberId === member.id && inlineForm;
              const household = households.find((h) => h.id === member.householdId);

              if (isEditing && inlineForm) {
                return (
                  <tr key={member.id} className="bg-[#FFFDF0]">
                    {/* 所属世帯選択 */}
                    <td className="p-2">
                      <select
                        value={inlineForm.householdId || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, householdId: e.target.value })}
                        className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs font-bold"
                      >
                        {households.map((h) => (
                          <option key={h.id} value={h.id}>
                            【{h.id}】{h.familyHead} 家
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 氏名 & ふりがな */}
                    <td className="p-2 space-y-1">
                      <input
                        type="text"
                        placeholder="氏名"
                        value={inlineForm.name || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, name: e.target.value })}
                        className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold"
                      />
                      <input
                        type="text"
                        placeholder="ふりがな"
                        value={inlineForm.furigana || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, furigana: e.target.value })}
                        className="w-full bg-white border border-[#D1CEC7] p-1 text-xs"
                      />
                    </td>

                    {/* 続柄 */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={inlineForm.relationship || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, relationship: e.target.value })}
                        className="w-20 bg-white border border-[#1A1A1A] p-1.5 text-xs font-bold"
                      />
                    </td>

                    {/* 施主指定 */}
                    <td className="p-2 text-center">
                      <label className={`inline-flex items-center space-x-1 px-2 py-1 border cursor-pointer ${inlineForm.isChiefMourner || inlineForm.isSponsor ? 'bg-[#8C2D19] text-white border-[#8C2D19]' : 'bg-white border-[#CCCCCC]'}`} title="この人物を世帯の「現在の施主」に指定">
                        <input
                          type="checkbox"
                          checked={!!(inlineForm.isChiefMourner || inlineForm.isSponsor)}
                          onChange={(e) => setInlineForm({ ...inlineForm, isChiefMourner: e.target.checked, isSponsor: e.target.checked })}
                          className="w-3.5 h-3.5 accent-[#8C2D19]"
                        />
                        <span className="font-bold text-[10px]">施主</span>
                      </label>
                    </td>

                    {/* 連絡先 & 住所 */}
                    <td className="p-2 space-y-1">
                      <input
                        type="text"
                        value={inlineForm.phone || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, phone: e.target.value })}
                        placeholder="電話番号"
                        className="w-full bg-white border border-[#1A1A1A] p-1 font-mono text-xs"
                      />
                      <input
                        type="text"
                        value={inlineForm.address || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, address: e.target.value })}
                        placeholder="住所（別居等）"
                        className="w-full bg-white border border-[#D1CEC7] p-1 text-xs"
                      />
                    </td>

                    {/* 施餓鬼塔婆 & 為書き */}
                    <td className="p-2 space-y-1">
                      <label className="flex items-center space-x-1.5 cursor-pointer bg-white px-2 py-1 border border-amber-400">
                        <input
                          type="checkbox"
                          checked={!!inlineForm.isSegakiToba}
                          onChange={(e) => setInlineForm({ ...inlineForm, isSegakiToba: e.target.checked })}
                          className="w-3.5 h-3.5 accent-[#1A1A1A]"
                        />
                        <span className="font-bold text-[11px] text-amber-950">塔婆申込</span>
                      </label>
                      {inlineForm.isSegakiToba && (
                        <input
                          type="text"
                          value={inlineForm.segakiTamegaki || ''}
                          onChange={(e) => setInlineForm({ ...inlineForm, segakiTamegaki: e.target.value })}
                          placeholder="為書き (例: 〇〇家先祖代々)"
                          className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-serif"
                        />
                      )}
                    </td>

                    {/* 備考 */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={inlineForm.notes || ''}
                        onChange={(e) => setInlineForm({ ...inlineForm, notes: e.target.value })}
                        placeholder="備考"
                        className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs"
                      />
                    </td>

                    {/* 操作 */}
                    <td className="p-2 text-right whitespace-nowrap space-x-1">
                      <button
                        onClick={handleSaveInlineEdit}
                        className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm cursor-pointer"
                      >
                        <Save className="w-3 h-3" />
                        <span>保存</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingMemberId(null);
                          setInlineForm(null);
                        }}
                        className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
                      >
                        <span>取消</span>
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={member.id}
                  onDoubleClick={() => {
                    setEditingMemberId(member.id);
                    setInlineForm({ ...member });
                  }}
                  className={`hover:bg-[#F9F7F2] transition-colors cursor-pointer border-b border-[#F0EFEA] ${member.isChiefMourner || member.isSponsor ? 'bg-[#FFFDF0]/60' : ''}`}
                  title="ダブルクリックで行のまま編集"
                >
                  {/* 所属世帯 */}
                  <td className="p-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                    <span className="font-mono text-[#666666] mr-1.5">【ID:{member.householdId}】</span>
                    <span>{household ? `${household.familyHead} 家` : '世帯不明'}</span>
                  </td>

                  {/* 氏名 & ふりがな */}
                  <td className="p-3 whitespace-nowrap">
                    {member.furigana && <div className="text-[10px] text-[#888888]">{member.furigana}</div>}
                    <div className="font-bold text-[#1A1A1A] text-sm flex items-center space-x-1.5">
                      <span>{member.name}</span>
                      {(member.isChiefMourner || member.isSponsor) && (
                        <span className="text-[9px] bg-[#8C2D19] text-white px-1.5 py-0.5 font-bold shadow-xs">
                          ★ 施主
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 続柄 */}
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-[#F9F7F2] border border-[#D1CEC7] text-[#1A1A1A] text-xs font-bold">
                      {member.relationship}
                    </span>
                  </td>

                  {/* 施主指定 */}
                  <td className="p-3 text-center whitespace-nowrap">
                    {(member.isChiefMourner || member.isSponsor) ? (
                      <span className="px-2 py-0.5 bg-[#8C2D19] text-white text-[10px] font-bold shadow-xs">
                        ★ 施主
                      </span>
                    ) : (
                      <span className="text-[#AAAAAA] text-xs">—</span>
                    )}
                  </td>

                  {/* 連絡先 / 住所 */}
                  <td className="p-3 whitespace-nowrap">
                    <div className="font-mono text-[#444444]">{member.phone || '—'}</div>
                    {member.address && <div className="text-[11px] text-[#666666]">{member.address}</div>}
                  </td>

                  {/* 施餓鬼塔婆 / 為書き */}
                  <td className="p-3">
                    {member.isSegakiToba ? (
                      <div className="space-y-0.5">
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] inline-block">
                          ✓ 塔婆申込
                        </span>
                        {member.segakiTamegaki && (
                          <div className="text-xs font-serif font-bold text-amber-950">
                            為 {member.segakiTamegaki}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[#888888] text-[11px]">—</span>
                    )}
                  </td>

                  {/* 備考 */}
                  <td className="p-3 text-[#555555]">
                    {member.notes || '—'}
                  </td>

                  {/* 操作 */}
                  <td className="p-3 text-right whitespace-nowrap space-x-1">
                    <button
                      onClick={() => {
                        setEditingMemberId(member.id);
                        setInlineForm({ ...member });
                      }}
                      className="p-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] transition-colors cursor-pointer"
                      title="編集"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(member)}
                      className="p-1.5 bg-[#F9F7F2] hover:bg-rose-50 text-rose-700 border border-[#D1CEC7] transition-colors cursor-pointer"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* ALWAYS-VISIBLE INLINE ENTRY ROW AT BOTTOM */}
            <tr className="bg-[#FFFDF0] border-2 border-[#D4AF37]">
              {/* 所属世帯 */}
              <td className="p-2">
                <select
                  value={newMemberForm.householdId || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, householdId: e.target.value })}
                  className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs font-bold"
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      【{h.id}】{h.familyHead} 家
                    </option>
                  ))}
                </select>
              </td>

              {/* 氏名 & ふりがな */}
              <td className="p-2 space-y-1">
                <input
                  type="text"
                  value={newMemberForm.name || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
                  placeholder="氏名 (例: 佐藤 恵子)"
                  className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold"
                />
                <input
                  type="text"
                  value={newMemberForm.furigana || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, furigana: e.target.value })}
                  placeholder="ふりがな (例: さとう けいこ)"
                  className="w-full bg-white border border-[#D1CEC7] p-1 text-xs"
                />
              </td>

              {/* 続柄 */}
              <td className="p-2">
                <input
                  type="text"
                  value={newMemberForm.relationship || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, relationship: e.target.value })}
                  placeholder="続柄 (例: 妻)"
                  className="w-20 bg-white border border-[#1A1A1A] p-1.5 text-xs font-bold"
                />
              </td>

              {/* 施主指定 */}
              <td className="p-2 text-center">
                <label className={`inline-flex items-center space-x-1 px-2 py-1 border cursor-pointer ${newMemberForm.isChiefMourner || newMemberForm.isSponsor ? 'bg-[#8C2D19] text-white border-[#8C2D19]' : 'bg-white border-[#CCCCCC]'}`} title="この人物を世帯の「現在の施主」に指定">
                  <input
                    type="checkbox"
                    checked={!!(newMemberForm.isChiefMourner || newMemberForm.isSponsor)}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, isChiefMourner: e.target.checked, isSponsor: e.target.checked })}
                    className="w-3.5 h-3.5 accent-[#8C2D19]"
                  />
                  <span className="font-bold text-[10px]">施主</span>
                </label>
              </td>

              {/* 連絡先 & 住所 */}
              <td className="p-2 space-y-1">
                <input
                  type="text"
                  value={newMemberForm.phone || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
                  placeholder="電話番号"
                  className="w-full bg-white border border-[#1A1A1A] p-1 font-mono text-xs"
                />
                <input
                  type="text"
                  value={newMemberForm.address || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, address: e.target.value })}
                  placeholder="別居等住所"
                  className="w-full bg-white border border-[#D1CEC7] p-1 text-xs"
                />
              </td>

              {/* 施餓鬼塔婆 & 為書き */}
              <td className="p-2 space-y-1">
                <label className="flex items-center space-x-1.5 cursor-pointer bg-white px-2 py-1 border border-amber-400">
                  <input
                    type="checkbox"
                    checked={!!newMemberForm.isSegakiToba}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, isSegakiToba: e.target.checked })}
                    className="w-3.5 h-3.5 accent-[#1A1A1A]"
                  />
                  <span className="font-bold text-[11px] text-amber-950">塔婆申込</span>
                </label>
                {newMemberForm.isSegakiToba && (
                  <input
                    type="text"
                    value={newMemberForm.segakiTamegaki || ''}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, segakiTamegaki: e.target.value })}
                    placeholder="為書き (例: 〇〇家先祖代々)"
                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-serif"
                  />
                )}
              </td>

              {/* 備考 */}
              <td className="p-2">
                <input
                  type="text"
                  value={newMemberForm.notes || ''}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, notes: e.target.value })}
                  placeholder="備考・メモ"
                  className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs"
                />
              </td>

              {/* 追加ボタン */}
              <td className="p-2 text-right whitespace-nowrap">
                <button
                  onClick={handleSaveNewMember}
                  className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>登録</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-sm w-full space-y-4 shadow-2xl text-[#2D2D2D]">
            <h3 className="text-base font-bold text-rose-800">家族構成レコードの削除</h3>
            <p className="text-xs leading-relaxed text-[#444444]">
              「<strong className="text-[#1A1A1A]">{deleteTarget.name}</strong>」（続柄: {deleteTarget.relationship}）のレコードを削除しますか？
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF]"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  onDeleteFamilyMember(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 bg-rose-800 hover:bg-rose-900 text-white font-bold text-xs"
              >
                削除を実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
