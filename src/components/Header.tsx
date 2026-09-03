import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  Printer, 
  CreditCard, 
  Building2, 
  FileSpreadsheet,
  Settings,
  Database,
  Undo2,
  Redo2,
  Calendar,
  ChevronDown,
  Plus,
  Layers,
  Smartphone,
  History
} from 'lucide-react';
import { TempleInfo, TempleProfile } from '../types';
import { ImportTargetType } from '../utils/externalImportUtils';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  onOpenTempleModal: () => void;
  onOpenMasterModal: () => void;
  onOpenAddHouseholdModal: () => void;
  onOpenGoogleSheetsModal: () => void;
  onOpenImportModal?: (target?: ImportTargetType) => void;
  onOpenOperationHistory?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error' | 'disconnected';
  lastSyncTime?: string | null;
  unreadCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoDescription?: string;
  redoDescription?: string;
  onSwitchToMobile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  templeInfo,
  temples = [],
  activeTempleId,
  onSelectTemple,
  onOpenTempleModal,
  onOpenMasterModal,
  onOpenGoogleSheetsModal,
  onOpenImportModal,
  onOpenOperationHistory,
  syncStatus = 'disconnected',
  lastSyncTime,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoDescription,
  redoDescription,
  onSwitchToMobile,
}) => {
  const [templeDropdownOpen, setTempleDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setTempleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { id: 'households', label: '檀家名簿・世帯', icon: Users },
    { id: 'kakocho', label: '過去帳・年回忌', icon: BookOpen },
    { id: 'reservations', label: '法事・予約・カレンダー', icon: Calendar },
    { id: 'print', label: '長3封筒・はがき印刷', icon: Printer },
    { id: 'accounting', label: '会計管理', icon: CreditCard },
  ];

  const isCalendarTab = activeTab === 'reservations' || activeTab === 'memorial';
  const isGoogleConnected = syncStatus !== 'disconnected';

  const isAccountingTabCombined =
    activeTab === 'accounting' &&
    (templeInfo?.accountingMode === 'combined' || temples.find((t) => t.isMain)?.accountingMode === 'combined');

  const isAllTemplesAllowed = 
    activeTab === 'kakocho' || 
    activeTab === 'daily_memorial';

  const mainTemple = temples.find((t) => t.isMain) || temples[0] || templeInfo;

  const isAllTemples = isCalendarTab || (isAllTemplesAllowed && activeTempleId === 'ALL');
  const currentTemple = isCalendarTab
    ? {
        id: 'ALL',
        name: '全寺院合算表示',
        sect: templeInfo.sect || '',
        mountainName: '',
        isMain: true,
        color: '#D4AF37',
      }
    : isAccountingTabCombined
    ? mainTemple
    : isAllTemples
    ? {
        id: 'ALL',
        name: '全寺院合算表示',
        sect: templeInfo.sect || '',
        mountainName: '',
        isMain: true,
        color: '#D4AF37',
      }
    : temples.find((t) => t.id === activeTempleId) || templeInfo;

  return (
    <header className="bg-[#1A1A1A] text-[#D4AF37] border-b border-[#D4AF37] shadow-lg sticky top-0 z-30 font-serif no-print">
      {/* Top Info Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Temple Brand & Selector */}
        <div className="flex items-center space-x-3.5">
          <div 
            className="w-8 h-8 rotate-45 flex items-center justify-center shadow-md shrink-0 transition-colors"
            style={{ 
              backgroundColor: currentTemple.color || '#D4AF37',
              borderColor: currentTemple.color || '#D4AF37' 
            }}
          >
            {isAllTemples ? (
              <Layers className="-rotate-45 w-3.5 h-3.5 text-[#1A1A1A]" />
            ) : (
              <span 
                className="-rotate-45 text-xs font-black text-[#1A1A1A] leading-none select-none"
              >
                {currentTemple.isMain === false ? '兼' : '本'}
              </span>
            )}
          </div>

          {/* Temple Switcher Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center space-x-2">
              {currentTemple.sect ? (
                <span className="text-[10px] px-2 py-0.5 bg-[#D4AF37] text-[#1A1A1A] font-bold tracking-wider font-sans uppercase">
                  {currentTemple.sect}
                </span>
              ) : null}
              {isCalendarTab ? (
                <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-300 font-sans font-bold border border-amber-500/40">
                  全寺院合算（固定）
                </span>
              ) : isAccountingTabCombined ? (
                <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-300 font-sans font-bold border border-amber-500/40">
                  全寺院合算（本寺扱い）
                </span>
              ) : isAllTemples ? (
                <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-300 font-sans font-bold border border-amber-500/40">
                  全寺院合算
                </span>
              ) : currentTemple.isMain === false ? (
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-700 text-white font-sans font-bold">
                  兼務寺院
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.2 bg-[#D4AF37]/20 text-[#D4AF37] font-sans font-bold">
                  本寺
                </span>
              )}
            </div>

            {isCalendarTab ? (
              /* Calendar / Reservations tab: Fixed merge display without pulldown */
              <div 
                className="flex items-center space-x-2 text-left mt-0.5 select-none"
                title="法事・予約・カレンダーは全寺院の情報を合算して表示しています（固定）"
              >
                <h1 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider flex items-baseline gap-1.5">
                  <span>全寺院合算表示</span>
                </h1>
                <span className="text-[11px] font-sans tracking-widest text-[#D4AF37]/70 font-normal hidden md:inline">
                  法事・予約カレンダー
                </span>
              </div>
            ) : (
              /* Other tabs: Selectable temple dropdown */
              <button
                type="button"
                onClick={() => setTempleDropdownOpen(!templeDropdownOpen)}
                className="flex items-center space-x-2 text-left group hover:opacity-90 focus:outline-none cursor-pointer"
                title="クリックして寺院（本寺・兼務寺院・全寺院）を切り替え"
              >
                <h1 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider flex items-baseline gap-1.5 mt-0.5">
                  {currentTemple.mountainName && (
                    <span className="text-base sm:text-lg font-serif font-normal text-[#F9F7F2]">
                      {currentTemple.mountainName}
                    </span>
                  )}
                  <span>{currentTemple.name || '（寺院名未設定）'}</span>
                  <ChevronDown className={`w-4 h-4 text-[#D4AF37] self-center transition-transform ${templeDropdownOpen ? 'rotate-180' : ''}`} />
                </h1>
                <span className="text-[11px] font-sans tracking-widest text-[#D4AF37]/70 font-normal hidden md:inline">
                  檀家管理システム
                </span>
              </button>
            )}

            {/* Temple Selector Menu */}
            {!isCalendarTab && templeDropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-[#222222] border border-[#555555] shadow-2xl z-50 py-1 font-sans text-xs animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[#888888] border-b border-[#333333] flex justify-between items-center">
                  <span>表示対象の寺院を選択</span>
                  <span className="text-[10px] text-[#D4AF37]">{temples.length}寺院登録中</span>
                </div>
                
                <div className="max-h-64 overflow-y-auto">
                  {/* All Temples Option only allowed on Kakocho & Memorial Calendar */}
                  {temples.length > 1 && isAllTemplesAllowed && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectTemple) {
                          onSelectTemple('ALL');
                        }
                        setTempleDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between border-b border-[#333333] hover:bg-[#333333] transition-colors ${
                        isAllTemples ? 'bg-[#2E2E2E] text-[#D4AF37] font-bold' : 'text-[#CCCCCC]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 bg-[#333333] border border-[#555555] flex items-center justify-center text-[#D4AF37]">
                          <Layers className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-serif font-bold text-sm text-[#F9F7F2] flex items-center gap-1.5">
                            全寺院合算表示
                            <span className="px-1 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] font-bold">合算</span>
                          </div>
                          <div className="text-[10px] text-[#888888]">
                            本寺・兼務寺院すべてのデータを一覧表示（過去帳・法事カレンダー対応）
                          </div>
                        </div>
                      </div>
                      {isAllTemples && <span className="text-xs text-[#D4AF37] shrink-0">● 選択中</span>}
                    </button>
                  )}

                  {temples.length > 1 && !isAllTemplesAllowed && (
                    <div className="px-3 py-2 bg-[#1A1A1A] border-b border-[#333333] text-[10px] text-[#888888] flex items-center gap-1.5">
                      <span className="text-[#D4AF37] font-bold">※</span>
                      <span>
                        {isAccountingTabCombined
                          ? '会計処理は現在「全寺院合算（本寺集約）」に設定されています'
                          : '檀家名簿・個別会計は寺院ごとに管理されています（過去帳・法事で合算可能）'}
                      </span>
                    </div>
                  )}

                  {temples.map((temple) => {
                    const isSelected = !isAllTemples && temple.id === (activeTempleId || currentTemple.id);
                    return (
                      <button
                        key={temple.id || temple.name}
                        type="button"
                        onClick={() => {
                          if (onSelectTemple && temple.id) {
                            onSelectTemple(temple.id);
                          }
                          setTempleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#333333] transition-colors ${
                          isSelected ? 'bg-[#2E2E2E] text-[#D4AF37] font-bold' : 'text-[#CCCCCC]'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: temple.color || '#D4AF37' }}
                          />
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-serif font-bold text-sm text-[#F9F7F2]">{temple.name}</span>
                              {temple.isMain ? (
                                <span className="px-1 py-0.2 bg-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-bold">本寺</span>
                              ) : (
                                <span className="px-1 py-0.2 bg-emerald-900/60 text-emerald-300 text-[10px] font-bold">兼務</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#888888]">
                              {temple.mountainName ? `${temple.mountainName} ` : ''}{temple.sect || ''}
                            </div>
                          </div>
                        </div>
                        {isSelected && <span className="text-xs text-[#D4AF37] shrink-0">● 選択中</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-[#333333] p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTempleDropdownOpen(false);
                      onOpenTempleModal();
                    }}
                    className="w-full py-1.5 px-2 bg-[#1A1A1A] hover:bg-[#2C2C2C] text-[#D4AF37] text-xs font-bold text-center flex items-center justify-center space-x-1 border border-[#444444]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>兼務寺院の追加・削除・設定</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-sans">
          {/* Undo / Redo Buttons (データ連携中はコンフリクト防止のため非表示) */}
          {!isGoogleConnected && (
            <div className="h-9 flex items-center bg-[#242424] border border-[#444444] rounded-none px-1 shadow-xs">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className={`h-full flex items-center space-x-1 px-2 text-xs transition-colors font-medium ${
                  canUndo
                    ? 'text-[#F9F7F2] hover:bg-[#333333] hover:text-[#D4AF37] cursor-pointer'
                    : 'text-[#666666] opacity-40 cursor-not-allowed'
                }`}
                title={canUndo ? `元に戻す (Ctrl+Z): ${undoDescription || '直前の操作を取り消す'}` : '元に戻す操作はありません'}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-sans text-xs">元に戻す</span>
              </button>

              <div className="w-[1px] h-4 bg-[#444444] mx-1" />

              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className={`h-full flex items-center space-x-1 px-2 text-xs transition-colors font-medium ${
                  canRedo
                    ? 'text-[#F9F7F2] hover:bg-[#333333] hover:text-[#D4AF37] cursor-pointer'
                    : 'text-[#666666] opacity-40 cursor-not-allowed'
                }`}
                title={canRedo ? `やり直す (Ctrl+Y): ${redoDescription || '取り消した操作をやり直す'}` : 'やり直す操作はありません'}
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-sans text-xs">やり直す</span>
              </button>
            </div>
          )}

          {/* Data Link / Google Sheets Sync */}
          <button
            onClick={onOpenGoogleSheetsModal}
            className={`h-9 flex items-center space-x-2 px-3 border transition-colors shadow-xs cursor-pointer ${
              syncStatus === 'synced'
                ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-500/60'
                : syncStatus === 'syncing'
                ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-200 border-amber-500/60'
                : syncStatus === 'error'
                ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border-rose-500/60'
                : 'bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border-[#444444]'
            }`}
            title="Google スプレッドシート常時自動同期・Excel入出力"
          >
            <FileSpreadsheet className={`w-4 h-4 shrink-0 ${
              syncStatus === 'synced' ? 'text-emerald-400' :
              syncStatus === 'syncing' ? 'text-amber-400 animate-spin' :
              syncStatus === 'error' ? 'text-rose-400' : 'text-[#D4AF37]'
            }`} />
            <div className="flex flex-col items-start justify-center text-left leading-none space-y-0.5">
              <span className="font-bold text-xs flex items-center gap-1.5 whitespace-nowrap">
                データ連携
                {syncStatus === 'synced' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </span>
              <span className="text-[10px] opacity-75 font-mono whitespace-nowrap">
                {syncStatus === 'synced' ? (lastSyncTime ? `同期済 (${lastSyncTime})` : '自動同期中') :
                 syncStatus === 'syncing' ? '同期中...' :
                 syncStatus === 'error' ? '同期エラー' : '未連携 / Excel'}
              </span>
            </div>
          </button>

          {/* Operation History / Google Sheets Log */}
          {onOpenOperationHistory && (
            <button
              onClick={onOpenOperationHistory}
              className="h-9 flex items-center space-x-1.5 px-3 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border border-[#444444] transition-colors cursor-pointer shadow-xs"
              title="操作・削除履歴（Googleスプレッドシート連携ログ）の確認"
            >
              <History className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="font-bold text-xs whitespace-nowrap">操作履歴</span>
            </button>
          )}

          {/* Temple Information Settings */}
          <button
            onClick={onOpenTempleModal}
            className="h-9 flex items-center space-x-1.5 px-3 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border border-[#444444] transition-colors cursor-pointer shadow-xs"
            title="寺院情報設定・兼務寺院登録・区分/勘定科目マスタ設定"
          >
            <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span className="font-bold text-xs whitespace-nowrap">寺院情報設定</span>
          </button>

          {/* Switch to Mobile UI button */}
          {onSwitchToMobile && (
            <button
              onClick={onSwitchToMobile}
              className="h-9 flex items-center space-x-1.5 px-3 bg-[#8C2D19] hover:bg-[#A3351E] text-white border border-[#A3351E] transition-colors cursor-pointer shadow-xs font-bold"
              title="スマートフォン専用の縦長・軽量UIに切り替えます"
            >
              <Smartphone className="w-4 h-4 text-[#F9F7F2] shrink-0" />
              <span className="text-xs whitespace-nowrap">📱 スマホ版</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-[#111111] border-t border-[#333333]">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-1 scrollbar-none" aria-label="Tabs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-4 py-2 text-xs sm:text-sm font-bold tracking-wider font-sans transition-all border-b-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#D4AF37]'
                      : 'text-[#999999] hover:text-[#F9F7F2] border-transparent hover:bg-[#1A1A1A]/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#D4AF37]' : 'text-[#888888]'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

