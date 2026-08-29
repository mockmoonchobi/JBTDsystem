import React, { useState } from 'react';
import { 
  Calendar, 
  Plus, 
  Sparkles, 
  Printer, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Send, 
  Users, 
  Edit, 
  Trash2, 
  X
} from 'lucide-react';
import { MemorialService, Household, PastRecord, MemorialStatus, TempleInfo } from '../types';
import { formatCurrency, formatJapaneseEraDate, normalizeDateInput, getHouseholdSponsorName } from '../utils/memorialCalculator';
import { SaveConfirmModal } from './SaveConfirmModal';

interface MemorialServiceManagerProps {
  memorialServices: MemorialService[];
  households: Household[];
  pastRecords: PastRecord[];
  templeInfo: TempleInfo;
  onAddService: (service: MemorialService) => void;
  onUpdateService: (service: MemorialService) => void;
  onDeleteService: (id: string) => void;
  onNavigateToPrintWithNotice: (householdId: string, noticeText: string) => void;
}

export const MemorialServiceManager: React.FC<MemorialServiceManagerProps> = ({
  memorialServices,
  households,
  pastRecords,
  templeInfo,
  onAddService,
  onUpdateService,
  onDeleteService,
  onNavigateToPrintWithNotice,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // AI Generator Modal State
  const [aiModalService, setAiModalService] = useState<MemorialService | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [aiAdditionalNotes, setAiAdditionalNotes] = useState('');

  // Add/Edit Service Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [editingService, setEditingService] = useState<MemorialService | null>(null);
  const [formData, setFormData] = useState<Partial<MemorialService>>({
    id: '',
    householdId: '',
    deceasedId: '',
    deceasedName: '',
    dharmaName: '',
    memorialType: '七回忌',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '11:00',
    venue: '本堂',
    status: '未入金',
    chiefMourner: '',
    attendeeCount: 10,
    offeringAmount: 100000,
    notes: '',
  });

  const normalizeTimeForSort = (time?: string): string => {
    if (!time) return '99:99';
    const clean = time.trim();
    if (clean.includes(':')) {
      const [h, m] = clean.split(':');
      return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
    }
    return clean.padStart(5, '0');
  };

  const filteredServices = memorialServices.filter((s) => {
    const matchesSearch =
      s.deceasedName.includes(searchTerm) ||
      s.dharmaName.includes(searchTerm) ||
      s.chiefMourner.includes(searchTerm) ||
      s.memorialType.includes(searchTerm);

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const dateComp = (b.scheduledDate || '').localeCompare(a.scheduledDate || '');
    if (dateComp !== 0) return dateComp;
    return normalizeTimeForSort(a.scheduledTime).localeCompare(normalizeTimeForSort(b.scheduledTime));
  });

  const handleOpenAddModal = () => {
    setEditingService(null);
    const firstHousehold = households[0];
    const firstPast = pastRecords[0];

    setFormData({
      id: `MS-${Date.now()}`,
      householdId: firstHousehold?.id || '',
      deceasedId: firstPast?.id || '',
      deceasedName: firstPast?.secularName || '',
      dharmaName: firstPast?.dharmaName || '',
      memorialType: '七回忌',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '11:00',
      venue: '本堂',
      status: '未入金',
      chiefMourner: firstHousehold ? (getHouseholdSponsorName(firstHousehold) || firstHousehold.familyHead) : '',
      attendeeCount: 10,
      offeringAmount: 100000,
      notes: '',
      receptionCheckedIn: false,
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (service: MemorialService) => {
    setEditingService(service);
    setFormData(service);
    setShowAddModal(true);
  };

  const executeSaveAndClose = () => {
    const selectedHousehold = households.find((h) => h.id === formData.householdId);
    const normalizedDate = normalizeDateInput(formData.scheduledDate || '') || '2026/08/25';

    const completeService: MemorialService = {
      id: formData.id || `MS-${Date.now()}`,
      householdId: formData.householdId || households[0]?.id || '',
      deceasedId: formData.deceasedId || '',
      deceasedName: formData.deceasedName || '',
      dharmaName: formData.dharmaName || '',
      memorialType: formData.memorialType || '年忌法要',
      scheduledDate: normalizedDate,
      scheduledTime: formData.scheduledTime || '11:00',
      venue: formData.venue || '本堂',
      status: (formData.status as MemorialStatus) || '未入金',
      chiefMourner: formData.chiefMourner || selectedHousehold?.familyHead || '施主',
      attendeeCount: Number(formData.attendeeCount) || 1,
      offeringAmount: Number(formData.offeringAmount) || 0,
      noticeText: formData.noticeText || '',
      notes: formData.notes || '',
      receptionCheckedIn: formData.receptionCheckedIn || false,
    };

    if (editingService) {
      onUpdateService(completeService);
    } else {
      onAddService(completeService);
    }
    setShowSaveConfirm(false);
    setShowAddModal(false);
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    setShowSaveConfirm(true);
  };

  // Trigger Gemini AI Notice Text Generation
  const handleGenerateAiNotice = async () => {
    if (!aiModalService) return;
    setAiGenerating(true);

    try {
      const res = await fetch('/api/ai/generate-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templeName: templeInfo.name,
          deceasedName: aiModalService.deceasedName,
          dharmaName: aiModalService.dharmaName,
          memorialType: aiModalService.memorialType,
          eventDate: aiModalService.scheduledDate,
          time: aiModalService.scheduledTime,
          location: aiModalService.venue,
          additionalNotes: aiAdditionalNotes,
        }),
      });

      const data = await res.json();
      if (data.text) {
        setAiGeneratedText(data.text);
      } else {
        alert(data.error || '案内文生成に失敗しました。');
      }
    } catch (err: any) {
      alert('AI通信エラーが発生しました。');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyAiNoticeToService = () => {
    if (aiModalService && aiGeneratedText) {
      const updated = {
        ...aiModalService,
        noticeText: aiGeneratedText,
        status: '案内送付済' as MemorialStatus,
      };
      onUpdateService(updated);
      setAiModalService(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37] p-6 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-serif text-[#F9F7F2]">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs">
              法要
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">法要案内・予約・参列履歴管理</h2>
          </div>
          <p className="text-xs text-[#CCCCCC] mt-1.5 font-sans tracking-wide">
            各家の年忌法要・命日法要のスケジュール・出欠状況・布施受領額・案内状（はがき本文）を一元管理します。
          </p>
        </div>

        <div className="flex items-center space-x-2 font-sans text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#2A2A2A] border border-[#444444] text-[#F9F7F2] px-3 py-2 focus:border-[#D4AF37] focus:outline-none"
          >
            <option value="ALL">すべての案内状態</option>
            <option value="案内送付済">案内送付済</option>
            <option value="出席">出席・確定</option>
            <option value="欠席">欠席</option>
            <option value="未入金">未入金</option>
            <option value="入金済">入金済</option>
            <option value="完了">完了</option>
          </select>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold uppercase tracking-wider transition-colors flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>法要スケジュール追加</span>
          </button>
        </div>
      </div>

      {/* Services Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredServices.map((service, sIdx) => {
          const household = households.find((h) => h.id === service.householdId);

          let statusBadgeClass = 'bg-[#F9F7F2] text-[#666666] border-[#D1CEC7]';
          if (service.status === '出席') statusBadgeClass = 'bg-emerald-50 text-emerald-900 border-emerald-200';
          if (service.status === '案内送付済') statusBadgeClass = 'bg-amber-50 text-amber-900 border-amber-200';
          if (service.status === '未入金') statusBadgeClass = 'bg-amber-50 text-amber-900 border-amber-200';
          if (service.status === '入金済') statusBadgeClass = 'bg-emerald-50 text-emerald-900 border-emerald-200';

          return (
            <div
              key={`ms-card-${service.id || sIdx}-${sIdx}`}
              className="bg-white border border-[#D1CEC7] hover:border-[#1A1A1A] p-5 shadow-sm flex flex-col justify-between space-y-4 transition-colors font-serif"
            >
              <div>
                <div className="flex items-start justify-between border-b border-[#F0EFEA] pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs px-2.5 py-0.5 font-sans font-bold bg-[#1A1A1A] text-[#D4AF37] uppercase tracking-wider">
                        {service.memorialType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 border font-sans font-bold ${statusBadgeClass}`}>
                        {service.status}
                      </span>
                      {service.receptionCheckedIn && (
                        <span className="text-[10px] bg-emerald-800 text-white font-sans font-bold px-1.5 py-0.5 tracking-wider uppercase">
                          QR受付完了
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-[#1A1A1A] mt-2">
                      {service.dharmaName || service.deceasedName}
                    </h3>
                    <p className="text-xs text-[#555555] font-sans mt-0.5">
                      故人名: <strong className="text-[#1A1A1A]">{service.deceasedName}</strong> | 施主: <strong className="text-[#1A1A1A]">{service.chiefMourner} 殿</strong>
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-[#1A1A1A]">
                      {service.scheduledDate} <span className="text-xs font-serif text-[#666666] font-normal">{formatJapaneseEraDate(service.scheduledDate)}</span>
                    </div>
                    <div className="text-xs text-[#888888] font-sans">{service.scheduledTime}〜 / {service.venue}</div>
                  </div>
                </div>

                <div className="py-2.5 text-xs text-[#444444] font-sans grid grid-cols-2 gap-2">
                  <div className="bg-[#F9F7F2] p-2.5 border border-[#EBE7DF]">
                    参列予定人数: <strong className="text-[#1A1A1A] font-mono font-bold text-sm">{service.attendeeCount}</strong> 名
                  </div>
                  <div className="bg-[#F9F7F2] p-2.5 border border-[#EBE7DF]">
                    預り御布施: <strong className="text-[#1A1A1A] font-bold text-sm">{formatCurrency(service.offeringAmount)}</strong>
                  </div>
                </div>

                {service.noticeText ? (
                  <div className="text-[11px] bg-[#F9F7F2] p-3 border border-[#EBE7DF] text-[#444444] font-sans line-clamp-3">
                    <strong className="text-[#1A1A1A] block mb-0.5 font-serif">案内状本文:</strong>
                    {service.noticeText}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#888888] font-sans italic py-1">
                    案内本文未生成。「Gemini AI 案内文自動作成」ボタンから作成できます。
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#F0EFEA] flex items-center justify-between gap-2 font-sans">
                <button
                  onClick={() => {
                    setAiModalService(service);
                    setAiGeneratedText(service.noticeText || '');
                    setAiAdditionalNotes('');
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs transition-colors font-bold tracking-wider uppercase"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>AI案内文作成</span>
                </button>

                <div className="flex items-center space-x-2">
                  {service.noticeText && (
                    <button
                      onClick={() => onNavigateToPrintWithNotice(service.householdId, service.noticeText || '')}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold transition-colors"
                      title="封筒・はがき印刷へ送信"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#1A1A1A]" />
                      <span>印刷画面へ</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleOpenEditModal(service)}
                    className="p-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-white transition-colors"
                    title="編集"
                  >
                    <Edit className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`この法要スケジュールを削除しますか？`)) {
                        onDeleteService(service.id);
                      }
                    }}
                    className="p-1.5 bg-[#F9F7F2] hover:bg-rose-50 text-rose-700 border border-[#D1CEC7] transition-colors"
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-xl w-full text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <h3 className="text-lg font-bold text-[#1A1A1A]">
                {editingService ? '法要スケジュールの編集' : '法要スケジュールの新規登録'}
              </h3>
              <button
                type="button"
                onClick={handleRequestClose}
                className="text-[#888888] hover:text-[#1A1A1A] p-1 transition-colors cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1A1A1A] font-bold mb-1">施主世帯 (檀家) *</label>
                  <select
                    value={formData.householdId}
                    onChange={(e) => {
                      const h = households.find((item) => item.id === e.target.value);
                      setFormData({
                        ...formData,
                        householdId: e.target.value,
                        chiefMourner: h ? (getHouseholdSponsorName(h) || h.familyHead) : (formData.chiefMourner || ''),
                      });
                    }}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                    required
                  >
                    {households.map((h) => {
                      const sponsor = getHouseholdSponsorName(h) || h.familyHead;
                      const isSpecialSponsor = sponsor && sponsor !== h.familyHead;
                      return (
                        <option key={h.id} value={h.id}>
                          {sponsor} 様{isSpecialSponsor ? ` (世帯主: ${h.familyHead})` : ''} ({h.district || '地区なし'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">施主氏名</label>
                  <input
                    type="text"
                    value={formData.chiefMourner}
                    onChange={(e) => setFormData({ ...formData, chiefMourner: e.target.value })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">故人氏名 (俗名)</label>
                  <input
                    type="text"
                    placeholder="例: 田中 孝雄"
                    value={formData.deceasedName}
                    onChange={(e) => setFormData({ ...formData, deceasedName: e.target.value })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#1A1A1A] font-bold mb-1">戒名 / 法名</label>
                  <input
                    type="text"
                    placeholder="例: 徳山道修大居士"
                    value={formData.dharmaName}
                    onChange={(e) => setFormData({ ...formData, dharmaName: e.target.value })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] font-serif font-bold focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">法要種別</label>
                  <select
                    value={formData.memorialType}
                    onChange={(e) => setFormData({ ...formData, memorialType: e.target.value as any })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  >
                    <option value="初七日">初七日</option>
                    <option value="四十九日">四十九日</option>
                    <option value="一周忌">一周忌</option>
                    <option value="三回忌">三回忌</option>
                    <option value="七回忌">七回忌</option>
                    <option value="十三回忌">十三回忌</option>
                    <option value="十七回忌">十七回忌</option>
                    <option value="二十三回忌">二十三回忌</option>
                    <option value="二十七回忌">二十七回忌</option>
                    <option value="三十三回忌">三十三回忌</option>
                    <option value="五十回忌">五十回忌</option>
                    <option value="百回忌">百回忌</option>
                    <option value="二百回忌">二百回忌</option>
                    <option value="三百回忌">三百回忌</option>
                    <option value="四百回忌">四百回忌</option>
                    <option value="五百回忌">五百回忌</option>
                    <option value="六百回忌">六百回忌</option>
                    <option value="七百回忌">七百回忌</option>
                    <option value="八百回忌">八百回忌</option>
                    <option value="九百回忌">九百回忌</option>
                    <option value="千回忌">千回忌</option>
                    <option value="命日法要">命日法要</option>
                    <option value="彼岸会">彼岸会</option>
                    <option value="盆法要">盆法要</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">状態</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as MemorialStatus })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  >
                    <option value="未入金">未入金</option>
                    <option value="入金済">入金済</option>
                    <option value="案内送付済">案内送付済</option>
                    <option value="出席">出席・確定</option>
                    <option value="欠席">欠席</option>
                    <option value="完了">完了</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">開催予定日</label>
                  <input
                    type="text"
                    placeholder="例: 20260607, 2026.6.7, 令和8年6月7日"
                    value={formData.scheduledDate || ''}
                    onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const normalized = normalizeDateInput(e.target.value);
                      if (normalized) {
                        setFormData({ ...formData, scheduledDate: formatJapaneseEraDate(normalized, false) });
                      }
                    }}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] font-mono font-bold focus:border-[#1A1A1A] focus:outline-none"
                  />
                  {formData.scheduledDate && (
                    <div className="text-[11px] text-[#2e6b38] font-semibold mt-1">
                      保存形式: {normalizeDateInput(formData.scheduledDate)} {formatJapaneseEraDate(formData.scheduledDate)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">開始時刻 / 会場</label>
                  <div className="flex space-x-1">
                    <input
                      type="text"
                      placeholder="11:00"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                      className="w-20 bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="本堂 / 客殿"
                      value={formData.venue}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                      className="flex-1 bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#444444] font-bold mb-1">参列予定人数</label>
                  <input
                    type="number"
                    value={formData.attendeeCount}
                    onChange={(e) => setFormData({ ...formData, attendeeCount: Number(e.target.value) })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#1A1A1A] font-bold mb-1">御布施受領額 (円)</label>
                  <input
                    type="number"
                    value={formData.offeringAmount}
                    onChange={(e) => setFormData({ ...formData, offeringAmount: Number(e.target.value) })}
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] font-mono font-bold focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#444444] font-bold mb-1">案内状本文</label>
                <textarea
                  rows={3}
                  value={formData.noticeText}
                  onChange={(e) => setFormData({ ...formData, noticeText: e.target.value })}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                  placeholder="案内はがき・手紙に記載する本文..."
                ></textarea>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="法要スケジュールの保存確認"
        message="編集中の法要スケジュールを保存しますか？"
        description="「保存して閉じる」を押すと、入力内容を反映して法要スケジュールを保存します。「保存せずに閉じる」を押すと今回の編集内容は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          setShowAddModal(false);
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* AI Notice Text Generator Modal */}
      {aiModalService && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-2xl w-full text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-[#1A1A1A]">
                  Gemini AI 法要案内文 自動生成
                </h3>
              </div>
              <button onClick={() => setAiModalService(null)} className="text-[#888888] hover:text-[#1A1A1A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-[#F9F7F2] border border-[#EBE7DF] p-3 font-sans">
              <div>故人: <strong className="text-[#1A1A1A] font-serif text-sm">{aiModalService.deceasedName}</strong> ({aiModalService.dharmaName})</div>
              <div>施主: {aiModalService.chiefMourner} 殿</div>
              <div>種別: {aiModalService.memorialType}</div>
              <div>日時: {aiModalService.scheduledDate} {aiModalService.scheduledTime}〜</div>
            </div>

            <div className="font-sans">
              <label className="block text-xs text-[#444444] font-bold mb-1">補足連絡事項 (お斎の有無、準備物など)</label>
              <input
                type="text"
                placeholder="例: 法要後、客殿にてお斎（食事）をご用意しております。平服でお越しください。"
                value={aiAdditionalNotes}
                onChange={(e) => setAiAdditionalNotes(e.target.value)}
                className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
              />
            </div>

            <button
              onClick={handleGenerateAiNotice}
              disabled={aiGenerating}
              className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider font-sans transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <span>{aiGenerating ? 'AIが正式な案内文を生成中...' : '拝啓・敬具付き案内文をAI生成する'}</span>
            </button>

            {aiGeneratedText && (
              <div className="space-y-2 font-sans">
                <label className="block text-xs font-bold text-[#1A1A1A]">生成結果 (編集可能):</label>
                <textarea
                  rows={6}
                  value={aiGeneratedText}
                  onChange={(e) => setAiGeneratedText(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-3 text-xs text-[#2D2D2D] font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                ></textarea>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#D1CEC7] font-sans">
              <button
                onClick={() => setAiModalService(null)}
                className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF]"
              >
                キャンセル
              </button>

              <button
                onClick={handleApplyAiNoticeToService}
                disabled={!aiGeneratedText}
                className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider disabled:opacity-50"
              >
                案内状に反映して送付済みに更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
