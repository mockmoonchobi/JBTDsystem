import React, { useState, useMemo } from 'react';
import { 
  Household, 
  PastRecord, 
  MemorialService, 
  TempleInfo, 
  TempleProfile, 
  MasterOptions, 
  TempleTodo,
  Transaction 
} from '../../types';
import { Calendar, ListTodo } from 'lucide-react';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav, MobileTab } from './MobileBottomNav';
import { MobileHouseholdView } from './MobileHouseholdView';
import { MobileKakochoView } from './MobileKakochoView';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileTodoView } from './MobileTodoView';
import { MobileReceptionView } from './MobileReceptionView';
import { MobileServiceModal } from './MobileServiceModal';
import { MobileKakochoModal } from './MobileKakochoModal';
import { getTodayDateString } from '../../utils/calendarUtils';

interface MobileAppProps {
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  households: Household[];
  allHouseholds?: Household[];
  pastRecords: PastRecord[];
  allPastRecords?: PastRecord[];
  memorialServices: MemorialService[];
  allMemorialServices?: MemorialService[];
  templeTodos?: TempleTodo[];
  masterOptions?: MasterOptions;
  onSaveHousehold: (household: Household) => void;
  onDeleteHousehold: (id: string) => void;
  onSavePastRecord: (record: PastRecord) => void;
  onDeletePastRecord: (id: string) => void;
  onBatchAddPastRecords?: (records: PastRecord[], description?: string) => void;
  onSaveService: (service: MemorialService) => void;
  onDeleteService: (id: string) => void;
  onSaveTodo?: (todo: TempleTodo) => void;
  onDeleteTodo?: (id: string) => void;
  onAddTransaction?: (transaction: Transaction) => void;
  onSwitchToDesktop: () => void;
  onOpenGoogleSheetsModal?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error' | 'disconnected';
  lastSyncTime?: string | null;
  onTriggerManualSync?: () => void;
  isStaffMode?: boolean;
}

export const MobileApp: React.FC<MobileAppProps> = ({
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  households = [],
  allHouseholds,
  pastRecords = [],
  allPastRecords,
  memorialServices = [],
  allMemorialServices,
  templeTodos = [],
  masterOptions,
  onSaveHousehold,
  onDeleteHousehold,
  onSavePastRecord,
  onDeletePastRecord,
  onBatchAddPastRecords,
  onSaveService,
  onDeleteService,
  onSaveTodo = () => {},
  onDeleteTodo = () => {},
  onAddTransaction = () => {},
  onSwitchToDesktop,
  onOpenGoogleSheetsModal,
  syncStatus = 'disconnected',
  lastSyncTime,
  onTriggerManualSync,
  isStaffMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('households');
  const [scheduleSubTab, setScheduleSubTab] = useState<'calendar' | 'todos'>('calendar');
  const todayStr = getTodayDateString();

  // Resolved list of all households and past records for lookups / modals
  const effectiveAllHouseholds = allHouseholds && allHouseholds.length > 0 ? allHouseholds : households;
  const effectiveAllPastRecords = allPastRecords && allPastRecords.length > 0 ? allPastRecords : pastRecords;

  // Tab change handler enforcing temple merge rules (exact PC parity)
  const handleTabChange = (newTab: MobileTab) => {
    setActiveTab(newTab);
    // 住所録では合算表示は不可（PC版と同じく個別寺院のみ）
    if (newTab === 'households' && activeTempleId === 'ALL') {
      const defaultTempleId = temples.find((t) => t.isMain)?.id || temples[0]?.id || 'temple-main';
      onSelectTemple?.(defaultTempleId);
    }
  };

  // Cross-tab direct modal triggers
  const [quickServiceModalOpen, setQuickServiceModalOpen] = useState(false);
  const [quickServiceTargetHhId, setQuickServiceTargetHhId] = useState<string | undefined>(undefined);
  const [quickServiceTargetPastId, setQuickServiceTargetPastId] = useState<string | undefined>(undefined);

  const [quickKakochoModalOpen, setQuickKakochoModalOpen] = useState(false);
  const [quickKakochoTargetHhId, setQuickKakochoTargetHhId] = useState<string | undefined>(undefined);

  // Today's service count
  const todayServices = useMemo(() => {
    return memorialServices.filter((s) => s.scheduledDate === todayStr);
  }, [memorialServices, todayStr]);

  // Upcoming service count (future + today)
  const upcomingServices = useMemo(() => {
    return memorialServices.filter((s) => (s.scheduledDate || '') >= todayStr);
  }, [memorialServices, todayStr]);

  // Pending todo count
  const pendingTodos = useMemo(() => {
    return templeTodos.filter((t) => !t.completed);
  }, [templeTodos]);

  // Trigger service booking from Household
  const handleOpenAddServiceFromHousehold = (householdId: string) => {
    setQuickServiceTargetHhId(householdId);
    setQuickServiceTargetPastId(undefined);
    setQuickServiceModalOpen(true);
  };

  // Trigger past record creation from Household
  const handleOpenAddPastRecordFromHousehold = (householdId: string) => {
    if (isStaffMode) return;
    setQuickKakochoTargetHhId(householdId);
    setQuickKakochoModalOpen(true);
  };

  // Trigger service booking from Kakocho spirit
  const handleOpenAddServiceFromSpirit = (record: PastRecord) => {
    setQuickServiceTargetHhId(record.householdId || undefined);
    setQuickServiceTargetPastId(record.id);
    setQuickServiceModalOpen(true);
  };

  const isScheduleSection = activeTab === 'schedule' || activeTab === 'calendar' || activeTab === 'todos';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1A1A] flex flex-col font-sans select-none antialiased">
      {/* Mobile Top Header */}
      <MobileHeader
        templeInfo={templeInfo}
        temples={temples}
        activeTempleId={activeTempleId}
        onSelectTemple={onSelectTemple}
        onSwitchToDesktop={onSwitchToDesktop}
        todayServiceCount={todayServices.length}
        onOpenGoogleSheetsModal={onOpenGoogleSheetsModal}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        onTriggerManualSync={onTriggerManualSync}
        activeTab={activeTab}
        isStaffMode={isStaffMode}
      />

      {/* Main View Container */}
      <main className="flex-1 w-full max-w-lg mx-auto overflow-x-hidden">
        {activeTab === 'households' && (
          <MobileHouseholdView
            households={households}
            pastRecords={effectiveAllPastRecords}
            memorialServices={memorialServices}
            masterOptions={masterOptions}
            templeInfo={templeInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            onSelectTemple={onSelectTemple}
            onSaveHousehold={onSaveHousehold}
            onDeleteHousehold={onDeleteHousehold}
            onOpenAddPastRecord={handleOpenAddPastRecordFromHousehold}
            onOpenAddService={handleOpenAddServiceFromHousehold}
            onBatchAddPastRecords={onBatchAddPastRecords}
            isStaffMode={isStaffMode}
          />
        )}

        {activeTab === 'kakocho' && (
          <MobileKakochoView
            pastRecords={pastRecords}
            households={effectiveAllHouseholds}
            temples={temples}
            activeTempleId={activeTempleId}
            onSelectTemple={onSelectTemple}
            onSavePastRecord={onSavePastRecord}
            onDeletePastRecord={onDeletePastRecord}
            onOpenAddServiceFromSpirit={handleOpenAddServiceFromSpirit}
            isStaffMode={isStaffMode}
          />
        )}

        {/* Combined Schedule Tab (予定帳 & ToDo) */}
        {isScheduleSection && (
          <div className="flex flex-col min-h-[calc(100vh-8rem)]">
            {/* Top Sub-tab Switcher directly under Header */}
            <div className="px-2.5 py-1.5 bg-[#F5F2EB] border-b border-[#D1CEC7] shadow-2xs">
              <div className="grid grid-cols-2 p-1 bg-[#E5E0D5] rounded-xs font-bold text-xs gap-1">
                <button
                  type="button"
                  onClick={() => setScheduleSubTab('calendar')}
                  className={`py-1.5 rounded-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    scheduleSubTab === 'calendar'
                      ? 'bg-white text-[#8C2D19] shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">予定帳</span>
                  {upcomingServices.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white text-[10px] rounded-full">
                      {upcomingServices.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleSubTab('todos')}
                  className={`py-1.5 rounded-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    scheduleSubTab === 'todos'
                      ? 'bg-white text-[#8C2D19] shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <ListTodo className="w-4 h-4" />
                  <span className="text-xs">ToDo</span>
                  {pendingTodos.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-[#D4AF37] text-[#1A1A1A] text-[10px] font-bold rounded-full">
                      {pendingTodos.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Subtab Content */}
            {scheduleSubTab === 'calendar' ? (
              <MobileCalendarView
                memorialServices={memorialServices}
                households={effectiveAllHouseholds}
                pastRecords={effectiveAllPastRecords}
                temples={temples}
                activeTempleId={activeTempleId}
                onSelectTemple={onSelectTemple}
                templeTodos={templeTodos}
                onSaveService={onSaveService}
                onSaveTodo={onSaveTodo}
                onDeleteService={onDeleteService}
              />
            ) : (
              <MobileTodoView
                templeTodos={templeTodos}
                households={effectiveAllHouseholds}
                pastRecords={effectiveAllPastRecords}
                memorialServices={memorialServices}
                temples={temples}
                activeTempleId={activeTempleId}
                onSaveTodo={onSaveTodo}
                onDeleteTodo={onDeleteTodo}
              />
            )}
          </div>
        )}

        {/* Reception Tab (簡易受付・QRモード) */}
        {activeTab === 'reception' && (
          <MobileReceptionView
            households={households}
            allHouseholds={effectiveAllHouseholds}
            pastRecords={effectiveAllPastRecords}
            templeInfo={templeInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            onSelectTemple={onSelectTemple}
            onAddTransaction={onAddTransaction}
          />
        )}
      </main>

      {/* Bottom Fixed Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        householdCount={households.length}
        kakochoCount={pastRecords.length}
        upcomingServiceCount={upcomingServices.length}
        pendingTodoCount={pendingTodos.length}
      />

      {/* Cross-feature Quick Service Modal */}
      <MobileServiceModal
        isOpen={quickServiceModalOpen}
        onClose={() => {
          setQuickServiceModalOpen(false);
          setQuickServiceTargetHhId(undefined);
          setQuickServiceTargetPastId(undefined);
        }}
        service={null}
        households={effectiveAllHouseholds}
        pastRecords={effectiveAllPastRecords}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={(service) => {
          onSaveService(service);
          setActiveTab('schedule');
          setScheduleSubTab('calendar');
        }}
        onSaveTodo={(todo) => {
          if (onSaveTodo) {
            onSaveTodo(todo);
          }
          setActiveTab('schedule');
          setScheduleSubTab('todos');
        }}
        initialHouseholdId={quickServiceTargetHhId}
        initialPastRecordId={quickServiceTargetPastId}
      />

      {/* Cross-feature Quick Kakocho Modal */}
      <MobileKakochoModal
        isOpen={quickKakochoModalOpen}
        onClose={() => {
          setQuickKakochoModalOpen(false);
          setQuickKakochoTargetHhId(undefined);
        }}
        record={null}
        households={effectiveAllHouseholds}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={(record) => {
          onSavePastRecord(record);
          setActiveTab('kakocho');
        }}
        onDelete={onDeletePastRecord}
        initialHouseholdId={quickKakochoTargetHhId}
      />
    </div>
  );
};
