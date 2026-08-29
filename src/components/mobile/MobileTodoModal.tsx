import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Trash2, Calendar, Clock, AlertTriangle, Building2, User, FileText, CheckSquare, Square } from 'lucide-react';
import { TempleTodo, Household, TempleProfile, TodoCategory } from '../../types';
import { getTodayDateString, normalizeDateInput } from '../../utils/calendarUtils';
import { sortHouseholdsByGojuon, getHouseholdSponsorName } from '../../utils/memorialCalculator';

interface MobileTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: TempleTodo | null;
  households: Household[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSave: (todo: TempleTodo) => void;
  onDelete?: (id: string) => void;
  initialHouseholdId?: string;
}

const CATEGORY_OPTIONS: { value: TodoCategory; label: string }[] = [
  { value: '法要準備', label: '法要準備' },
  { value: '塔婆揮毫', label: '塔婆揮毫' },
  { value: '案内発送', label: '案内発送' },
  { value: '境内整備', label: '境内整備' },
  { value: '会計処理', label: '会計処理' },
  { value: '棚経準備', label: '棚経準備' },
  { value: '寺務・事務', label: '寺務・事務' },
  { value: 'その他', label: 'その他' },
];

export const MobileTodoModal: React.FC<MobileTodoModalProps> = ({
  isOpen,
  onClose,
  todo,
  households = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSave,
  onDelete,
  initialHouseholdId,
}) => {
  const todayStr = getTodayDateString();

  const [formData, setFormData] = useState<Partial<TempleTodo>>({
    id: '',
    title: '',
    dueDate: todayStr,
    dueTime: '17:00',
    priority: 'medium',
    category: '法要準備',
    completed: false,
    templeId: activeTempleId !== 'ALL' ? activeTempleId : (temples.find((t) => t.isMain)?.id || 'temple-main'),
    householdId: '',
    householdHeadName: '',
    notes: '',
  });

  const [searchHousehold, setSearchHousehold] = useState('');
  const [showHouseholdPicker, setShowHouseholdPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (todo) {
      setFormData({
        ...todo,
        dueDate: normalizeDateInput(todo.dueDate) || todayStr,
        dueTime: todo.dueTime || '17:00',
        templeId: todo.templeId || (activeTempleId !== 'ALL' ? activeTempleId : 'temple-main'),
      });
      setSearchHousehold('');
      setShowHouseholdPicker(false);
      setShowDeleteConfirm(false);
    } else {
      const defaultTemple = activeTempleId !== 'ALL' ? activeTempleId : (temples.find((t) => t.isMain)?.id || 'temple-main');
      const initialHh = initialHouseholdId ? households.find((h) => h.id === initialHouseholdId) : null;

      setFormData({
        id: `TD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: '',
        dueDate: todayStr,
        dueTime: '17:00',
        priority: 'medium',
        category: '法要準備',
        completed: false,
        templeId: initialHh?.templeId || defaultTemple,
        householdId: initialHh?.id || '',
        householdHeadName: initialHh ? (getHouseholdSponsorName(initialHh) || initialHh.familyHead || '') : '',
        notes: '',
      });
      setSearchHousehold('');
      setShowHouseholdPicker(false);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, todo, initialHouseholdId, activeTempleId, temples, households, todayStr]);

  if (!isOpen) return null;

  const isEditing = Boolean(todo && todo.id);

  // Quick date offsets
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setFormData((prev) => ({ ...prev, dueDate: `${y}/${m}/${day}` }));
  };

  // Filter and sort households for search (五十音順)
  const filteredHouseholds = useMemo(() => {
    const list = households.filter((h) => {
      if (!searchHousehold.trim()) return true;
      const q = searchHousehold.toLowerCase();
      return (
        (h.familyHead && h.familyHead.toLowerCase().includes(q)) ||
        (h.furigana && h.furigana.toLowerCase().includes(q)) ||
        (h.address && h.address.toLowerCase().includes(q)) ||
        (h.district && h.district.toLowerCase().includes(q))
      );
    });
    return sortHouseholdsByGojuon(list).slice(0, 20);
  }, [households, searchHousehold]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim() && !formData.dueDate) return;

    const savedTodo: TempleTodo = {
      id: formData.id || `TD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: formData.title?.trim() || '無題のタスク',
      dueDate: normalizeDateInput(formData.dueDate || '') || todayStr,
      dueTime: formData.dueTime || '17:00',
      priority: formData.priority || 'medium',
      category: (formData.category as TodoCategory) || '法要準備',
      completed: Boolean(formData.completed),
      templeId: formData.templeId || (activeTempleId !== 'ALL' ? activeTempleId : 'temple-main'),
      householdId: formData.householdId || '',
      householdHeadName: formData.householdHeadName || '',
      relatedServiceId: formData.relatedServiceId || '',
      notes: formData.notes || '',
      createdAt: formData.createdAt || todayStr,
      completedAt: formData.completed ? (formData.completedAt || new Date().toISOString()) : undefined,
    };

    onSave(savedTodo);
    onClose();
  };

  const handleDelete = () => {
    if (todo?.id && onDelete) {
      onDelete(todo.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div 
        className="w-full max-w-lg bg-[#FAF8F5] border-t sm:border border-[#D1CEC7] rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
        id="mobile-todo-modal"
      >
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-white px-4 py-3.5 flex items-center justify-between border-b border-[#D4AF37]/40 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-[#D4AF37] font-bold text-base">
              {isEditing ? 'タスク・ToDoの編集' : '新規タスク・ToDoの登録'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-md cursor-pointer transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-sm">
          {/* Completion Status Toggle (if editing) */}
          <div 
            onClick={() => setFormData((prev) => ({ ...prev, completed: !prev.completed }))}
            className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
              formData.completed
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-white border-[#D1CEC7] text-gray-800'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {formData.completed ? (
                <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <Square className="w-5 h-5 text-gray-400 shrink-0" />
              )}
              <span className="font-bold">
                {formData.completed ? '完了済みタスク' : '未完了のタスク'}
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/5">
              タップで切替
            </span>
          </div>

          {/* Task Title */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              タスク内容・件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例: 一周忌法要 塔婆作成、墓地清掃、案内状印刷など"
              value={formData.title || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white border border-[#D1CEC7] rounded-lg text-sm font-bold text-[#1A1A1A] focus:ring-2 focus:ring-[#D4AF37] focus:outline-hidden"
            />
          </div>

          {/* Due Date & Time */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700">
              期日・予定時刻 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="YYYY/MM/DD"
                  value={formData.dueDate || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1CEC7] rounded-lg text-sm font-bold text-[#1A1A1A]"
                />
              </div>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="17:00"
                  value={formData.dueTime || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dueTime: e.target.value }))}
                  className="w-full pl-8 pr-2 py-2 bg-white border border-[#D1CEC7] rounded-lg text-sm text-[#1A1A1A]"
                />
              </div>
            </div>

            {/* Quick date shortcuts */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className="px-2.5 py-1 text-xs font-bold bg-[#EFECE6] text-gray-800 rounded-md hover:bg-[#D4AF37]/20 border border-[#D1CEC7]"
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(1)}
                className="px-2.5 py-1 text-xs font-bold bg-[#EFECE6] text-gray-800 rounded-md hover:bg-[#D4AF37]/20 border border-[#D1CEC7]"
              >
                明日
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(3)}
                className="px-2.5 py-1 text-xs font-bold bg-[#EFECE6] text-gray-800 rounded-md hover:bg-[#D4AF37]/20 border border-[#D1CEC7]"
              >
                3日後
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(7)}
                className="px-2.5 py-1 text-xs font-bold bg-[#EFECE6] text-gray-800 rounded-md hover:bg-[#D4AF37]/20 border border-[#D1CEC7]"
              >
                1週間後
              </button>
            </div>
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              区分・カテゴリ
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = formData.category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, category: cat.value }))}
                    className={`py-1.5 px-1 text-center text-xs font-bold rounded-md border transition-all ${
                      isSelected
                        ? cat.value === '塔婆揮毫'
                          ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                          : 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                        : 'bg-white text-gray-700 border-[#D1CEC7] hover:bg-gray-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              優先度
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { value: 'urgent', label: '至急', style: 'bg-red-600 text-white border-red-600' },
                  { value: 'high', label: '高', style: 'bg-amber-600 text-white border-amber-600' },
                  { value: 'medium', label: '中', style: 'bg-blue-600 text-white border-blue-600' },
                  { value: 'low', label: '低', style: 'bg-gray-600 text-white border-gray-600' },
                ] as const
              ).map((p) => {
                const isSelected = (formData.priority || 'medium') === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, priority: p.value }))}
                    className={`py-1.5 px-2 text-center text-xs font-bold rounded-md border transition-all ${
                      isSelected ? p.style : 'bg-white text-gray-700 border-[#D1CEC7]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Affiliated / Main Temple Picker (Multi-Temple Support) */}
          {temples.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#8C2D19]" />
                <span>所属寺院（本寺・兼務寺）</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {temples.map((t) => {
                  const isSelected = (formData.templeId || 'temple-main') === t.id;
                  const isAffiliated = !t.isMain;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, templeId: t.id }))}
                      className={`p-2 rounded-lg border text-left flex flex-col justify-center transition-all ${
                        isSelected
                          ? isAffiliated
                            ? 'bg-purple-900 text-white border-purple-500 font-bold shadow-xs'
                            : 'bg-[#1A1A1A] text-[#D4AF37] border-[#D4AF37] font-bold shadow-xs'
                          : 'bg-white border-[#D1CEC7] text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className={isSelected ? 'text-white/80' : 'text-gray-500'}>
                          {isAffiliated ? '兼務寺院' : '本寺'}
                        </span>
                        {isSelected && <Check className="w-3 h-3 text-[#D4AF37]" />}
                      </div>
                      <div className="font-bold text-xs truncate">
                        {t.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Household / Sponsor Picker */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-gray-500" />
                <span>関連施主・檀家（任意）</span>
              </span>
              {formData.householdHeadName && (
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, householdId: '', householdHeadName: '' }))}
                  className="text-xs text-red-600 hover:underline font-normal"
                >
                  解除
                </button>
              )}
            </label>

            {formData.householdHeadName ? (
              <div className="p-2.5 bg-white border border-[#D1CEC7] rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-[#1A1A1A]">
                    👤 {formData.householdHeadName} 様
                  </div>
                  {formData.householdId && (
                    <div className="text-[11px] text-gray-500">ID: {formData.householdId}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowHouseholdPicker(true)}
                  className="px-2 py-1 text-xs bg-[#EFECE6] text-gray-800 font-bold rounded-md border border-[#D1CEC7]"
                >
                  変更
                </button>
              </div>
            ) : (
              <div>
                {!showHouseholdPicker ? (
                  <button
                    type="button"
                    onClick={() => setShowHouseholdPicker(true)}
                    className="w-full py-2 px-3 border border-dashed border-[#D1CEC7] bg-white rounded-lg text-xs text-gray-600 font-bold text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>＋ 檀家・施主を選択して紐付け</span>
                    <span className="text-gray-400">一覧</span>
                  </button>
                ) : (
                  <div className="p-3 bg-white border border-[#D1CEC7] rounded-lg space-y-2">
                    <input
                      type="text"
                      placeholder="施主名・住所で検索..."
                      value={searchHousehold}
                      onChange={(e) => setSearchHousehold(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#FAFAF8] border border-[#D1CEC7] rounded-md text-xs"
                      autoFocus
                    />
                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-100 text-xs">
                      {filteredHouseholds.map((h) => {
                        const sponsorName = getHouseholdSponsorName(h) || h.familyHead;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                householdId: h.id,
                                householdHeadName: sponsorName,
                                templeId: prev.templeId || h.templeId,
                              }));
                              setShowHouseholdPicker(false);
                            }}
                            className="w-full py-2 px-2 text-left hover:bg-[#FAF2EB] flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-bold text-[#1A1A1A]">{sponsorName} 様</span>
                            <span className="text-gray-500 text-[11px] truncate max-w-[150px]">{h.address || h.district || ''}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHouseholdPicker(false)}
                      className="w-full py-1 text-center text-xs text-gray-500 hover:text-gray-800"
                    >
                      閉じる
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes & Memos */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-500" />
              <span>備考・特記事項・メモ</span>
            </label>
            <textarea
              rows={3}
              placeholder="作業メモ、持ち物、注意事項など"
              value={formData.notes || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-[#D1CEC7] rounded-lg text-xs text-[#1A1A1A] focus:ring-2 focus:ring-[#D4AF37] focus:outline-hidden"
            />
          </div>

          {/* Delete Button (when editing) */}
          {isEditing && onDelete && (
            <div className="pt-2 border-t border-gray-200">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>このタスクを削除する</span>
                </button>
              ) : (
                <div className="p-3 bg-red-50 border border-red-300 rounded-lg space-y-2 text-center">
                  <div className="text-xs font-bold text-red-800 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>本当にこのタスクを削除しますか？</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-1.5 text-xs font-bold bg-white text-gray-700 border border-gray-300 rounded-md"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex-1 py-1.5 text-xs font-bold bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      削除する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Modal Footer Controls */}
        <div className="bg-[#FAFAF8] border-t border-[#D1CEC7] p-3 px-4 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-bold bg-[#EFECE6] text-gray-700 rounded-lg border border-[#D1CEC7] hover:bg-[#E5E0D8]"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 py-2.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#C59B27] text-[#1A1A1A] rounded-lg shadow-md flex items-center justify-center gap-1"
          >
            <Check className="w-4 h-4" />
            <span>{isEditing ? '更新を保存' : 'タスクを登録'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
