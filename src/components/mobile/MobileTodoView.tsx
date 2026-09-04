import React, { useState, useMemo } from 'react';
import { 
  CheckSquare, 
  Square, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  Tag, 
  Filter, 
  ChevronRight,
  ListTodo
} from 'lucide-react';
import { TempleTodo, Household, PastRecord, MemorialService, TempleProfile } from '../../types';
import { MobileTodoModal } from './MobileTodoModal';
import { getTodayDateString, normalizeDateInput } from '../../utils/calendarUtils';
import { extractTobaLines, extractTobaTaskCoreInfo } from '../ReservationCalendarManager';

interface MobileTodoViewProps {
  templeTodos: TempleTodo[];
  households: Household[];
  pastRecords: PastRecord[];
  memorialServices: MemorialService[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSaveTodo: (todo: TempleTodo) => void;
  onDeleteTodo: (id: string) => void;
}

export const MobileTodoView: React.FC<MobileTodoViewProps> = ({
  templeTodos = [],
  households = [],
  pastRecords = [],
  memorialServices = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSaveTodo,
  onDeleteTodo,
}) => {
  const todayStr = getTodayDateString();

  // Filters
  const [filterTab, setFilterTab] = useState<'pending' | 'today' | 'toba' | 'all' | 'completed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TempleTodo | null>(null);

  // Helper to determine temple labeling for a todo
  const getTodoTempleInfo = (t: TempleTodo): { id?: string; name: string; isAffiliated: boolean } => {
    const mainTemple = temples.find((item) => item.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';

    let targetTempleId = t.templeId;
    if (!targetTempleId && t.relatedServiceId) {
      const s = memorialServices.find((item) => item.id === t.relatedServiceId);
      if (s?.templeId) targetTempleId = s.templeId;
    }
    if (!targetTempleId && t.householdId) {
      const hh = households.find((h) => h.id === t.householdId);
      if (hh?.templeId) targetTempleId = hh.templeId;
    }

    if (targetTempleId && targetTempleId !== mainTempleId && targetTempleId !== 'temple-main') {
      const foundTemple = temples.find((item) => item.id === targetTempleId);
      return { id: targetTempleId, name: foundTemple?.name || '兼務寺', isAffiliated: true };
    }
    return { id: mainTempleId, name: mainTemple?.name || '本寺', isAffiliated: false };
  };

  // Toggle todo completed status
  const handleToggleComplete = (todo: TempleTodo, e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveTodo({
      ...todo,
      completed: !todo.completed,
      completedAt: !todo.completed ? new Date().toISOString() : undefined,
    });
  };

  // Filtered Todos (with unique ID deduplication)
  const filteredTodos = useMemo(() => {
    const seen = new Set<string>();
    return templeTodos.filter((t) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);

      // 1. Tab Filter
      const normDue = normalizeDateInput(t.dueDate) || t.dueDate || '';
      if (filterTab === 'pending' && t.completed) return false;
      if (filterTab === 'completed' && !t.completed) return false;
      if (filterTab === 'today') {
        if (t.completed) return false;
        if (normDue > todayStr) return false;
      }
      if (filterTab === 'toba') {
        const isToba = t.category === '塔婆揮毫' || t.title.includes('塔婆') || (t.notes && t.notes.includes('塔婆'));
        if (!isToba) return false;
      }

      // 2. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (t.title || '').toLowerCase().includes(q);
        const matchHead = (t.householdHeadName || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchCat = (t.category || '').toLowerCase().includes(q);
        if (!matchTitle && !matchHead && !matchNotes && !matchCat) return false;
      }

      return true;
    }).sort((a, b) => {
      // Pending first, then by dueDate ascending
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const da = normalizeDateInput(a.dueDate) || a.dueDate || '';
      const db = normalizeDateInput(b.dueDate) || b.dueDate || '';
      if (da !== db) return da.localeCompare(db);
      return (a.dueTime || '17:00').localeCompare(b.dueTime || '17:00');
    });
  }, [templeTodos, filterTab, searchQuery, todayStr]);

  // Overall Statistics
  const pendingCount = templeTodos.filter((t) => !t.completed).length;
  const overdueCount = templeTodos.filter((t) => !t.completed && (normalizeDateInput(t.dueDate) || t.dueDate || '') < todayStr).length;
  const todayDueCount = templeTodos.filter((t) => !t.completed && (normalizeDateInput(t.dueDate) || t.dueDate || '') === todayStr).length;
  const tobaPendingCount = templeTodos.filter((t) => !t.completed && (t.category === '塔婆揮毫' || t.title.includes('塔婆'))).length;

  return (
    <div className="pb-24 pt-2 px-3 space-y-3 font-sans">
      {/* Top Header Summary & Action */}
      <div className="bg-[#1A1A1A] text-white p-3.5 rounded-xl border border-[#D4AF37]/30 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ListTodo className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-base font-bold text-[#D4AF37] tracking-wider">
              寺院ToDo・タスク管理
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingTodo(null);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs sm:text-sm rounded-lg hover:bg-[#C59B27] shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>＋追加</span>
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-white/10 text-center">
          <div className="bg-white/5 rounded-lg p-1.5">
            <div className="text-[10px] text-gray-400">未完了</div>
            <div className="text-sm font-black text-amber-400">{pendingCount}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-1.5">
            <div className="text-[10px] text-gray-400">本日期日</div>
            <div className="text-sm font-black text-amber-300">{todayDueCount}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-1.5">
            <div className="text-[10px] text-gray-400">期限切れ</div>
            <div className={`text-sm font-black ${overdueCount > 0 ? 'text-red-400' : 'text-gray-300'}`}>
              {overdueCount}
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-1.5">
            <div className="text-[10px] text-gray-400">塔婆作成</div>
            <div className="text-sm font-black text-orange-300">{tobaPendingCount}</div>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="タスク名・施主名・メモ検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1CEC7] rounded-lg text-xs sm:text-sm font-bold text-[#1A1A1A] focus:outline-hidden focus:ring-2 focus:ring-[#D4AF37]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700"
          >
            クリア
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs sm:text-sm font-bold scrollbar-none">
        <button
          type="button"
          onClick={() => setFilterTab('pending')}
          className={`px-3 py-2 rounded-lg shrink-0 border transition-all ${
            filterTab === 'pending'
              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-xs'
              : 'bg-white text-gray-700 border-[#D1CEC7]'
          }`}
        >
          未完了 ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('today')}
          className={`px-3 py-2 rounded-lg shrink-0 border transition-all ${
            filterTab === 'today'
              ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs'
              : 'bg-white text-gray-700 border-[#D1CEC7]'
          }`}
        >
          今日・期限切れ ({todayDueCount + overdueCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('toba')}
          className={`px-3 py-2 rounded-lg shrink-0 border transition-all ${
            filterTab === 'toba'
              ? 'bg-orange-700 text-white border-orange-700 shadow-xs'
              : 'bg-white text-gray-700 border-[#D1CEC7]'
          }`}
        >
          🎋 塔婆作成 ({tobaPendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`px-3 py-1.5 rounded-lg shrink-0 border transition-all ${
            filterTab === 'all'
              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-xs'
              : 'bg-white text-gray-700 border-[#D1CEC7]'
          }`}
        >
          すべて ({templeTodos.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('completed')}
          className={`px-3 py-1.5 rounded-lg shrink-0 border transition-all ${
            filterTab === 'completed'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
              : 'bg-white text-gray-700 border-[#D1CEC7]'
          }`}
        >
          完了済
        </button>
      </div>

      {/* Task List */}
      <div className="space-y-2.5">
        {filteredTodos.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-[#D1CEC7] text-gray-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
            <div className="text-sm font-bold text-gray-700">該当するタスクはありません</div>
            <div className="text-xs text-gray-500">
              {filterTab === 'pending' ? 'すべてのタスクが完了しています！' : '条件に一致するToDoは見つかりませんでした。'}
            </div>
          </div>
        ) : (
          filteredTodos.map((t) => {
            const isToba = t.category === '塔婆揮毫' || t.title.includes('塔婆') || (t.notes && t.notes.includes('塔婆'));
            const tobaInfo = isToba ? extractTobaTaskCoreInfo(t, memorialServices, pastRecords) : null;
            const normDue = normalizeDateInput(t.dueDate) || t.dueDate || '';
            const isOverdue = !t.completed && normDue < todayStr;
            const isToday = !t.completed && normDue === todayStr;
            const templeInfo = getTodoTempleInfo(t);

            return (
              <div
                key={t.id}
                onClick={() => {
                  setEditingTodo(t);
                  setIsModalOpen(true);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer shadow-xs active:scale-[0.99] ${
                  t.completed
                    ? 'bg-[#F3F1ED] border-gray-200 opacity-60'
                    : isToba
                    ? 'bg-[#FFF9F6] border-[#8C2D19]/40 hover:border-[#8C2D19]'
                    : isOverdue
                    ? 'bg-[#FFF5F5] border-red-300'
                    : 'bg-white border-[#D1CEC7] hover:border-[#D4AF37]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Quick Toggle Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleComplete(t, e)}
                    className="mt-0.5 text-gray-400 hover:text-emerald-600 p-0.5 shrink-0 cursor-pointer"
                    aria-label={t.completed ? '未完了に戻す' : '完了にする'}
                  >
                    {t.completed ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Header Badges: Category, Affiliated Temple, Priority, Due Date */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      {isToba ? (
                        <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white font-black rounded-xs">
                          🎋 塔婆作成
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 bg-[#EFECE6] text-gray-800 font-bold rounded-xs">
                          {t.category}
                        </span>
                      )}

                      {/* Affiliated / Branch Temple Badge (Explicit labeling) */}
                      {templeInfo.isAffiliated ? (
                        <span className="px-1.5 py-0.2 bg-purple-900 text-purple-100 font-black rounded-xs border border-purple-400 shadow-2xs">
                          兼務: {templeInfo.name}
                        </span>
                      ) : temples.length > 1 ? (
                        <span className="px-1.5 py-0.2 bg-[#1A1A1A] text-[#D4AF37] font-bold rounded-xs">
                          本寺: {templeInfo.name}
                        </span>
                      ) : null}

                      {/* Priority Badge */}
                      {t.priority === 'urgent' && (
                        <span className="px-1.5 py-0.2 bg-red-600 text-white font-black rounded-xs">
                          至急
                        </span>
                      )}
                      {t.priority === 'high' && (
                        <span className="px-1.5 py-0.2 bg-amber-600 text-white font-bold rounded-xs">
                          高優先
                        </span>
                      )}

                      {/* Due Date Indicator */}
                      <span
                        className={`ml-auto font-bold flex items-center gap-0.5 ${
                          isOverdue
                            ? 'text-red-600 font-black'
                            : isToday
                            ? 'text-amber-700 font-black'
                            : 'text-gray-500'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{normDue}</span>
                        {t.dueTime && <span className="text-[10px]">({t.dueTime})</span>}
                      </span>
                    </div>

                    {/* Main Title / Toba Spirit Display */}
                    {isToba ? (() => {
                      const tobaLines = extractTobaLines(t, memorialServices, pastRecords);
                      return (
                        <div className="space-y-1.5 w-full">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 bg-[#8C2D19] text-white text-xs font-bold rounded-2xs">
                              🎋 塔婆作成 ({tobaLines.length}本)
                            </span>
                          </div>

                          {/* Toba Lines: 1 line per toba, enlarged font size, vertically expands for any number of tobas */}
                          <div className={`space-y-2 bg-[#FAF8F5] p-2.5 sm:p-3 rounded-xs border border-[#E5DFD5] w-full ${t.completed ? 'opacity-50 line-through' : ''}`}>
                            {tobaLines.map((line, idx) => (
                              <div
                                key={idx}
                                className="text-base sm:text-lg font-black font-serif text-[#1A1A1A] leading-relaxed tracking-wide break-words border-b border-[#EBE5DA] pb-1.5 last:border-b-0 last:pb-0"
                              >
                                {line.formattedLine}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="space-y-1">
                        <div
                          className={`text-sm font-bold leading-snug ${
                            t.completed ? 'line-through text-gray-500 font-normal' : 'text-[#1A1A1A]'
                          }`}
                        >
                          {t.title}
                        </div>
                        {t.householdHeadName && (
                          <div className="text-xs text-gray-600 flex items-center gap-1 font-bold">
                            <span>👤 施主: {t.householdHeadName} 様</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes preview if any (hide for toba tasks since full details are rendered above) */}
                    {t.notes && !isToba && (
                      <div className="text-[11px] text-gray-500 line-clamp-2 bg-black/[0.02] p-1.5 rounded-md border border-black/5">
                        💬 {t.notes}
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 self-center shrink-0" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Todo Add / Edit Modal */}
      <MobileTodoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTodo(null);
        }}
        todo={editingTodo}
        households={households}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={onSaveTodo}
        onDelete={onDeleteTodo}
      />
    </div>
  );
};
