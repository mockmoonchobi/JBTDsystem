import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit2, 
  RotateCcw, 
  Settings, 
  FileSpreadsheet, 
  Check, 
  GripVertical, 
  Building2, 
  Copy, 
  Layers
} from 'lucide-react';
import { MasterOptions, TempleProfile } from '../types';
import { INITIAL_MASTER_OPTIONS, EMPTY_MASTER_OPTIONS } from '../data/initialData';
import { SaveConfirmModal } from './SaveConfirmModal';

type TabKey = 'householdTypes' | 'statuses' | 'districts' | 'incomeCategories' | 'expenseCategories' | 'paymentMethods';

interface MasterOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterOptions: MasterOptions;
  onSave: (newOptions: MasterOptions, templeId?: string, allMap?: Record<string, MasterOptions>) => void;
  defaultTab?: TabKey;
  temples?: TempleProfile[];
  activeTempleId?: string;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
}

export const MasterOptionsModal: React.FC<MasterOptionsModalProps> = ({
  isOpen,
  onClose,
  masterOptions,
  onSave,
  defaultTab = 'householdTypes',
  temples = [],
  activeTempleId = 'temple-main',
  templeMasterOptionsMap = {},
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  
  // Normalized temple list
  const allTemples: TempleProfile[] = temples.length > 0
    ? temples
    : [{ id: 'temple-main', name: '寺院名称', mountainName: '', isMain: true, sect: '宗派', chiefPriest: '', postalCode: '', address: '', phone: '', color: '#D4AF37' }];

  // Selected temple for editing in modal
  const initialTempleId = activeTempleId === 'ALL' || !activeTempleId ? (allTemples[0]?.id || 'temple-main') : activeTempleId;
  const [selectedTempleId, setSelectedTempleId] = useState<string>(initialTempleId);

  // Per-temple state map for all temples
  const [templeStateMap, setTempleStateMap] = useState<Record<string, MasterOptions>>(() => {
    const map: Record<string, MasterOptions> = {};
    allTemples.forEach((t) => {
      const id = t.id || 'temple-main';
      map[id] = templeMasterOptionsMap[id] || t.masterOptions || masterOptions || EMPTY_MASTER_OPTIONS;
    });
    return map;
  });

  const [newItemText, setNewItemText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState<boolean>(false);

  // Sync state when modal opens or props change
  useEffect(() => {
    const map: Record<string, MasterOptions> = {};
    allTemples.forEach((t) => {
      const id = t.id || 'temple-main';
      map[id] = templeMasterOptionsMap[id] || t.masterOptions || (id === activeTempleId ? masterOptions : (masterOptions || EMPTY_MASTER_OPTIONS));
    });
    // Ensure active/selected temple has masterOptions if present
    if (activeTempleId && activeTempleId !== 'ALL' && masterOptions) {
      map[activeTempleId] = masterOptions;
    }
    setTempleStateMap(map);

    const validInitialId = activeTempleId === 'ALL' || !activeTempleId ? (allTemples[0]?.id || 'temple-main') : activeTempleId;
    setSelectedTempleId(validInitialId);
  }, [masterOptions, templeMasterOptionsMap, temples, activeTempleId, isOpen]);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, isOpen]);

  if (!isOpen) return null;

  const currentTemple = allTemples.find((t) => (t.id || 'temple-main') === selectedTempleId) || allTemples[0];
  const currentTempleId = currentTemple?.id || 'temple-main';
  const currentOptions: MasterOptions = templeStateMap[currentTempleId] || masterOptions || EMPTY_MASTER_OPTIONS;
  const currentList = currentOptions[activeTab] ?? [];

  const updateCurrentTempleOptions = (updatedOptions: MasterOptions) => {
    setTempleStateMap((prev) => ({
      ...prev,
      [currentTempleId]: updatedOptions,
    }));
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newItemText.trim();
    if (!trimmed) return;

    if (currentList.includes(trimmed)) {
      alert('同じ名前の項目が既に存在します。');
      return;
    }

    const updatedList = [...currentList, trimmed];
    updateCurrentTempleOptions({
      ...currentOptions,
      [activeTab]: updatedList,
    });
    setNewItemText('');
  };

  const handleDeleteItem = (indexToDelete: number) => {
    const updatedList = currentList.filter((_, idx) => idx !== indexToDelete);
    updateCurrentTempleOptions({
      ...currentOptions,
      [activeTab]: updatedList,
    });
    if (editingIndex === indexToDelete) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > indexToDelete) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= currentList.length || toIndex >= currentList.length) {
      return;
    }
    const updatedList = [...currentList];
    const [movedItem] = updatedList.splice(fromIndex, 1);
    updatedList.splice(toIndex, 0, movedItem);

    updateCurrentTempleOptions({
      ...currentOptions,
      [activeTab]: updatedList,
    });

    if (editingIndex === fromIndex) {
      setEditingIndex(toIndex);
    } else if (editingIndex !== null) {
      if (fromIndex < editingIndex && toIndex >= editingIndex) {
        setEditingIndex(editingIndex - 1);
      } else if (fromIndex > editingIndex && toIndex <= editingIndex) {
        setEditingIndex(editingIndex + 1);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      handleReorder(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleClearCurrentTab = () => {
    if (currentList.length === 0) return;
    if (window.confirm(`【${currentTemple.name}】の「${tabLabels[activeTab].title}」登録項目（${currentList.length}件）をすべて削除して空にしますか？`)) {
      updateCurrentTempleOptions({
        ...currentOptions,
        [activeTab]: [],
      });
      setEditingIndex(null);
    }
  };

  const handleClearAllMaster = () => {
    if (window.confirm(`【${currentTemple.name}】の区分・勘定科目マスタの【すべての項目（全カテゴリ）】を一括削除して空にしますか？\n\n※ 削除後、必要に応じて手動で追加するか「デフォルトに戻す」で初期値を復元できます。`)) {
      updateCurrentTempleOptions({
        householdTypes: [],
        statuses: [],
        districts: [],
        tobaTypes: [],
        incomeCategories: [],
        expenseCategories: [],
        paymentMethods: [],
        accountingCategories: [],
      });
      setEditingIndex(null);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingText(currentList[index]);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    
    const updatedList = [...currentList];
    updatedList[index] = trimmed;
    updateCurrentTempleOptions({
      ...currentOptions,
      [activeTab]: updatedList,
    });
    setEditingIndex(null);
    setEditingText('');
  };

  const handleResetCurrentTab = () => {
    if (confirm(`【${currentTemple.name}】の「${tabLabels[activeTab].title}」の候補項目をデフォルト初期設定に戻しますか？`)) {
      updateCurrentTempleOptions({
        ...currentOptions,
        [activeTab]: INITIAL_MASTER_OPTIONS[activeTab] || [],
      });
    }
  };

  // Copy options from main temple or another temple
  const handleCopyFromTemple = (sourceTempleId: string) => {
    const sourceOptions = templeStateMap[sourceTempleId];
    const sourceTemple = allTemples.find((t) => (t.id || 'temple-main') === sourceTempleId);
    if (!sourceOptions) return;

    if (confirm(`「${sourceTemple?.name || '指定寺院'}」のマスタ設定（区分・勘定科目すべて）を「${currentTemple.name}」にコピーして上書きしますか？`)) {
      updateCurrentTempleOptions({
        ...sourceOptions,
      });
    }
  };

  // Copy current temple options to ALL temples
  const handleApplyToAllTemples = () => {
    if (confirm(`現在設定中の「${currentTemple.name}」のマスタ設定（区分・勘定科目）を、登録されている【すべての寺院】に一括適用しますか？`)) {
      const nextMap: Record<string, MasterOptions> = {};
      allTemples.forEach((t) => {
        const id = t.id || 'temple-main';
        nextMap[id] = { ...currentOptions };
      });
      setTempleStateMap(nextMap);
      alert(`すべての寺院に「${currentTemple.name}」の設定を適用しました。`);
    }
  };

  const executeSaveAndClose = () => {
    // Prepare cleaned map with accountingCategories updated
    const finalMap: Record<string, MasterOptions> = {};
    Object.keys(templeStateMap).forEach((tId) => {
      const opt = templeStateMap[tId] || EMPTY_MASTER_OPTIONS;
      const incList = opt.incomeCategories || [];
      const expList = opt.expenseCategories || [];
      finalMap[tId] = {
        ...opt,
        accountingCategories: Array.from(new Set([...incList, ...expList])),
      };
    });

    const activeFinal = finalMap[currentTempleId] || finalMap[allTemples[0]?.id || 'temple-main'] || EMPTY_MASTER_OPTIONS;
    onSave(activeFinal, currentTempleId, finalMap);
    setShowSaveConfirm(false);
    onClose();
  };

  const handleSubmitAll = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    setShowSaveConfirm(true);
  };

  const tabLabels: Record<string, { title: string; subtitle: string; placeholder: string }> = {
    householdTypes: {
      title: '区分１ (檀家区分)',
      subtitle: '檀家名簿の区分１（正檀家、役員、信徒、墓地のみ等）の選択肢・表示順',
      placeholder: '例: 永代供養会員, 名誉総代',
    },
    statuses: {
      title: '区分２ (状態区分)',
      subtitle: '世帯の区分２の選択肢・表示順（未設定時は空欄運用可能）',
      placeholder: '例: 健在, 遠方, 転居注意 等',
    },
    districts: {
      title: '役職・地区',
      subtitle: '檀家世帯の役職・地区（総代、世話人、役員、東区等）の選択肢・表示順',
      placeholder: '例: 総代, 世話人, 役員',
    },
    incomeCategories: {
      title: '収入の部 (勘定科目)',
      subtitle: '出納記帳・決算書（収入の部）で表示される勘定科目の選択肢および決算書印刷時の掲載順',
      placeholder: '例: 繰越金, 永代供養料, 寄付金',
    },
    expenseCategories: {
      title: '支出の部 (勘定科目)',
      subtitle: '出納記帳・決算書（支出の部）で表示される勘定科目の選択肢および決算書印刷時の掲載順',
      placeholder: '例: 事務経費, 光熱水費, 繰越金',
    },
    paymentMethods: {
      title: '決済方法',
      subtitle: '会計管理の出納入力で選択できる決済方法（現金受付、QR受付時、銀行振込、郵便振替等）の選択肢・表示順',
      placeholder: '例: クレジットカード, PayPay, 電子マネー',
    },
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif animate-fade-in">
      <div className="bg-white border border-[#D1CEC7] p-6 max-w-3xl w-full text-[#2D2D2D] space-y-4 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#1A1A1A] text-[#D4AF37]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1A1A1A] flex items-center gap-2">
                寺院別マスタ設定 (各種区分・役職・勘定科目)
              </h3>
              <p className="text-xs text-[#666666] font-sans flex items-center gap-1.5 mt-0.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>寺院ごとに個別の区分や勘定科目を設定できます。左端（⠿）をつかんで並び順の入れ替えが可能です。</span>
              </p>
            </div>
          </div>
          <button onClick={handleRequestClose} className="text-[#888888] hover:text-[#1A1A1A] p-1 cursor-pointer" title="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Temple Selector Header Bar */}
        <div className="bg-[#FAF8F5] border border-[#D4AF37]/50 p-3 space-y-2 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-xs font-bold text-[#1A1A1A]">設定対象の寺院を選択:</span>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center space-x-2 text-[11px]">
              {allTemples.length > 1 && (
                <>
                  {currentTempleId !== allTemples[0]?.id && (
                    <button
                      type="button"
                      onClick={() => handleCopyFromTemple(allTemples[0]?.id || 'temple-main')}
                      className="px-2 py-1 bg-white hover:bg-[#EBE7DF] border border-[#D1CEC7] text-[#444444] font-medium flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                      title="本寺のマスタ設定をこの寺院にコピー"
                    >
                      <Copy className="w-3 h-3 text-[#D4AF37]" />
                      <span>本寺の設定をコピー</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyToAllTemples}
                    className="px-2 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37]/50 font-bold flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                    title="この寺院の設定をすべての登録寺院に一括適用"
                  >
                    <Layers className="w-3 h-3 text-[#D4AF37]" />
                    <span>全寺院へ一括適用</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Temple Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {allTemples.map((t) => {
              const tId = t.id || 'temple-main';
              const isSelected = selectedTempleId === tId;
              return (
                <button
                  key={tId}
                  type="button"
                  onClick={() => {
                    setSelectedTempleId(tId);
                    setEditingIndex(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-none border transition-all cursor-pointer flex items-center space-x-2 ${
                    isSelected
                      ? 'bg-[#1A1A1A] text-white border-[#D4AF37] shadow-sm'
                      : 'bg-white text-[#555555] border-[#D1CEC7] hover:border-[#999999] hover:bg-[#F0EEEA]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: t.color || '#D4AF37' }}
                  />
                  <span>
                    {t.mountainName ? `${t.mountainName} ` : ''}
                    {t.name}
                  </span>
                  <span className={`text-[10px] px-1 py-0.2 ${isSelected ? 'bg-[#333333] text-[#D4AF37]' : 'bg-[#EAE8E2] text-[#666666]'}`}>
                    {t.isMain ? '本寺' : '兼務'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-[#D1CEC7] font-sans text-xs bg-[#F9F7F2] overflow-x-auto shrink-0">
          {(Object.keys(tabLabels) as TabKey[]).map((tabKey) => {
            const isActive = activeTab === tabKey;
            const count = (currentOptions[tabKey] ?? []).length;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => {
                  setActiveTab(tabKey);
                  setEditingIndex(null);
                }}
                className={`py-2.5 px-3 border-b-2 font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
                  isActive
                    ? 'border-[#D4AF37] text-[#1A1A1A] bg-white'
                    : 'border-transparent text-[#666666] hover:text-[#1A1A1A] hover:bg-[#EBE7DF]'
                }`}
              >
                <span>{tabLabels[tabKey].title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-[#E5E0D8] text-[#666666]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Description & Temple Indicator */}
        <div className="bg-[#F9F7F2] p-3 border border-[#EBE7DF] flex justify-between items-center text-xs font-sans">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-[#1A1A1A]">{tabLabels[activeTab].title}</span>
              <span className="text-[11px] text-[#888888]">|</span>
              <span className="text-[11px] font-bold text-[#D4AF37] bg-[#1A1A1A] px-1.5 py-0.5">
                {currentTemple.mountainName ? `${currentTemple.mountainName} ` : ''}{currentTemple.name} 専用設定
              </span>
            </div>
            <p className="text-[11px] text-[#666666] mt-0.5">{tabLabels[activeTab].subtitle}</p>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {currentList.length > 0 && (
              <button
                type="button"
                onClick={handleClearCurrentTab}
                className="text-rose-700 hover:text-rose-900 text-[11px] font-bold flex items-center space-x-1 px-2 py-1 bg-white border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                title="このタブの登録項目をすべて削除"
              >
                <Trash2 className="w-3 h-3" />
                <span>このタブを全消去</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleResetCurrentTab}
              className="text-[#666666] hover:text-[#1A1A1A] text-[11px] font-bold flex items-center space-x-1 px-2 py-1 bg-white border border-[#D1CEC7] hover:bg-[#EBE7DF] transition-colors cursor-pointer"
              title="初期デフォルトの選択肢に戻す"
            >
              <RotateCcw className="w-3 h-3" />
              <span>初期設定に戻す</span>
            </button>
          </div>
        </div>

        {/* Form to Add New Item */}
        <form onSubmit={handleAddItem} className="flex gap-2 font-sans">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder={`新しい${tabLabels[activeTab].title}を入力 (${tabLabels[activeTab].placeholder})`}
            className="flex-1 px-3 py-2 border border-[#D1CEC7] text-sm focus:outline-hidden focus:ring-1 focus:ring-[#D4AF37]"
          />
          <button
            type="submit"
            disabled={!newItemText.trim()}
            className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 text-[#D4AF37] text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>項目を追加</span>
          </button>
        </form>

        {/* Items List with Drag-and-Drop Reordering */}
        <div className="flex-1 overflow-y-auto border border-[#EBE7DF] bg-[#FAF8F5] p-2 min-h-[220px]">
          {currentList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#888888] text-xs p-6 space-y-2">
              <p>現在登録されている項目がありません。</p>
              <p className="text-[11px]">上の入力欄から項目を追加するか、「初期設定に戻す」をクリックしてください。</p>
            </div>
          ) : (
            <div className="space-y-1">
              {currentList.map((item, index) => {
                const isEditing = editingIndex === index;
                const isDragged = draggedIndex === index;
                const isOver = dragOverIndex === index;

                return (
                  <div
                    key={`${index}-${item}`}
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-2 text-xs border transition-all ${
                      isEditing
                        ? 'bg-amber-50/60 border-[#D4AF37]'
                        : isDragged
                        ? 'opacity-40 bg-gray-200 border-dashed border-[#888888]'
                        : isOver
                        ? 'border-t-2 border-t-[#D4AF37] bg-amber-50/30'
                        : 'bg-white border-[#EBE7DF] hover:border-[#D1CEC7]'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center space-x-2 flex-1 font-sans">
                        <span className="w-5 text-[#888888] font-mono text-[10px] text-right">{index + 1}.</span>
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(index);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                          className="flex-1 px-2 py-1 border border-[#D4AF37] text-xs bg-white focus:outline-hidden"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(index)}
                          className="px-2 py-1 bg-[#1A1A1A] text-[#D4AF37] font-bold text-[11px] cursor-pointer"
                        >
                          確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIndex(null)}
                          className="px-2 py-1 bg-[#EBE7DF] text-[#444444] font-bold text-[11px] cursor-pointer"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center space-x-2 font-bold text-[#1A1A1A] flex-1">
                          {/* Drag Handle */}
                          <div
                            className="p-1 text-[#888888] hover:text-[#1A1A1A] cursor-grab active:cursor-grabbing hover:bg-[#EBE7DF] rounded-xs transition-colors"
                            title="ドラッグして並び順を移動"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <span className="w-5 text-[#888888] font-mono text-[10px] text-right">{index + 1}.</span>
                          <span className="truncate">{item}</span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(index)}
                            className="p-1 text-[#666666] hover:text-[#1A1A1A] hover:bg-[#EBE7DF] cursor-pointer"
                            title="名前を編集"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(index)}
                            className="p-1 text-rose-700 hover:text-rose-900 hover:bg-rose-50 cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-[#D1CEC7] shrink-0 font-sans">
          <button
            type="button"
            onClick={handleClearAllMaster}
            className="text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-2.5 py-1.5 text-xs border border-rose-200 flex items-center space-x-1 transition-colors cursor-pointer"
            title="選択中寺院のすべてのタブの登録項目を一括削除します"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>【{currentTemple.name}】のマスタ全消去</span>
          </button>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmitAll}
              className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 shadow cursor-pointer"
            >
              <Check className="w-4 h-4 text-[#D4AF37]" />
              <span>マスタ設定を保存・同期</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="マスタ設定の保存確認"
        message="編集中のマスタ設定（区分・役職・勘定科目）を保存しますか？"
        description="「保存して閉じる」を押すと、変更したマスタ選択肢や並び順を反映して閉じます。「保存せずに閉じる」を押すと今回の編集は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          onClose();
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />
    </div>
  );
};
