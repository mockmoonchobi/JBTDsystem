import React, { useState, useRef, useEffect } from 'react';
import { TempleInfo, TempleProfile } from '../../types';
import { ChevronDown, Monitor, RefreshCw, Cloud, CloudOff, Layers, Check } from 'lucide-react';

interface MobileHeaderProps {
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  onSwitchToDesktop: () => void;
  todayServiceCount?: number;
  onOpenGoogleSheetsModal?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error' | 'disconnected';
  lastSyncTime?: string | null;
  onTriggerManualSync?: () => void;
  activeTab?: string;
  isStaffMode?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  onSwitchToDesktop,
  onOpenGoogleSheetsModal,
  syncStatus = 'disconnected',
  lastSyncTime,
  activeTab = 'households',
  isStaffMode = false,
}) => {
  const [templeDropdownOpen, setTempleDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setTempleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mode rules (exact match with PC version):
  // 1. Calendar & ToDo: Merged all temples only (Fixed)
  const isMergedOnlyTab = activeTab === 'schedule' || activeTab === 'calendar' || activeTab === 'todos';

  // 2. Kakocho: Merge allowed (Can switch between ALL and individual temples)
  const isMergeAllowedTab = activeTab === 'kakocho';

  // 3. Households: Merge NOT allowed (Individual temples only)
  const isAllTemples = isMergedOnlyTab || (isMergeAllowedTab && activeTempleId === 'ALL');

  const matchedTemple = temples.find((t) => t.id === activeTempleId);
  const mainTemple = temples.find((t) => t.isMain) || temples[0] || templeInfo;

  const currentTemple = isMergedOnlyTab
    ? {
        id: 'ALL',
        name: '全寺院合算表示',
        sect: templeInfo.sect || '',
        mountainName: '',
        isMain: true,
        color: '#D4AF37',
      }
    : isMergeAllowedTab && isAllTemples
    ? {
        id: 'ALL',
        name: '全寺院合算表示',
        sect: templeInfo.sect || '',
        mountainName: '',
        isMain: true,
        color: '#D4AF37',
      }
    : matchedTemple && matchedTemple.id !== 'ALL'
    ? matchedTemple
    : mainTemple;

  const isAffiliated = !isAllTemples && (Boolean((currentTemple as any).isAffiliated) || (Boolean(currentTemple.id) && currentTemple.id !== 'temple-main' && !currentTemple.isMain));

  return (
    <header className="bg-[#1A1A1A] text-[#F5F2EB] sticky top-0 z-40 shadow-md border-b border-[#333333] select-none">
      {/* Main Top Bar */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        {/* Left: Temple Selector / Brand */}
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          {isMergedOnlyTab ? (
            /* Fixed Merged Tab (Calendar & ToDo) - Clean display fixed to 全寺院合算表示 */
            <div
              className="flex items-center gap-2 text-left w-full py-1 px-1"
              title="予定表・ToDoは全寺院の情報を合算して全件表示しています（固定）"
            >
              <div className="w-9 h-9 rounded-xs flex items-center justify-center shrink-0 border bg-amber-950/90 border-amber-400 text-amber-300 shadow-xs">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-serif font-black text-[#F9F7F2] truncate tracking-tight">
                  全寺院合算表示
                </span>
                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-xs border border-amber-500/40 shrink-0">
                  合算
                </span>
              </div>
            </div>
          ) : temples.length > 1 ? (
            /* Selectable Temple Dropdown (Households & Kakocho) */
            <>
              <button
                type="button"
                onClick={() => setTempleDropdownOpen(!templeDropdownOpen)}
                className="flex items-center gap-2 text-left w-full cursor-pointer py-1 px-1 rounded-xs hover:bg-[#252525] active:bg-[#2F2F2F] transition-colors focus:outline-hidden"
                title="タップして表示寺院を切り替え"
              >
                <div
                  className={`w-9 h-9 rounded-xs flex items-center justify-center shrink-0 border shadow-xs transition-colors ${
                    isAllTemples
                      ? 'bg-amber-950/90 border-amber-400 text-amber-300'
                      : isAffiliated
                      ? 'bg-purple-950/90 border-purple-400 text-purple-300'
                      : 'bg-[#2A2A2A] border-[#D4AF37]/80 text-[#D4AF37]'
                  }`}
                  style={{
                    backgroundColor: !isAllTemples && currentTemple.color ? currentTemple.color : undefined,
                    color: !isAllTemples && currentTemple.color ? '#1A1A1A' : undefined,
                  }}
                >
                  {isAllTemples ? (
                    <Layers className="w-4.5 h-4.5" />
                  ) : (
                    <span className="text-sm font-black leading-none">
                      {isAffiliated ? '兼' : '本'}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className="text-base sm:text-lg font-serif font-black text-[#F9F7F2] truncate tracking-tight">
                    {currentTemple.name || '（寺院名未設定）'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#D4AF37] opacity-80 shrink-0 transition-transform ${templeDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Temple Dropdown Menu */}
              {templeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={() => setTempleDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1.5 w-76 max-w-[90vw] bg-[#222222] border border-[#555555] rounded-xs shadow-2xl z-50 py-1 divide-y divide-[#333333] animate-in fade-in slide-in-from-top-1">
                    <div className="px-3.5 py-2 text-xs font-bold text-[#D4AF37] bg-[#1A1A1A] flex items-center justify-between">
                      <span>表示対象の寺院を選択</span>
                      <span className="text-[10px] text-[#A0988A]">{temples.length}寺院登録中</span>
                    </div>

                    {/* All Temples Option: ONLY displayed on Kakocho tab */}
                    {isMergeAllowedTab && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTemple?.('ALL');
                          setTempleDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2.5 text-left text-sm font-bold flex items-center justify-between cursor-pointer transition-colors ${
                          isAllTemples
                            ? 'bg-[#2E2E2E] text-[#D4AF37]'
                            : 'text-[#E5E0D8] hover:bg-[#333333]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-xs bg-[#333333] border border-amber-500/60 flex items-center justify-center text-amber-300 shrink-0">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate flex items-center gap-1.5 font-bold text-sm">
                              <span>全寺院合算（全件マージ表示）</span>
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-xs border border-amber-500/40">
                                合算
                              </span>
                            </div>
                            <div className="text-[11px] text-[#888888] truncate font-normal">
                              本寺・兼務寺院すべてのデータを一覧表示
                            </div>
                          </div>
                        </div>
                        {isAllTemples && <span className="text-xs text-[#D4AF37] font-bold ml-1.5 shrink-0">● 選択中</span>}
                      </button>
                    )}

                    {/* Notice for Household Tab: Merge is not allowed */}
                    {!isMergeAllowedTab && (
                      <div className="px-3.5 py-2 bg-[#1A1A1A] text-xs text-[#AAAAAA] flex items-center gap-1.5">
                        <span className="text-[#D4AF37] font-bold">※</span>
                        <span>住所録（檀家名簿）は個別寺院管理のため合算表示はありません</span>
                      </div>
                    )}

                    {/* Individual Temples List */}
                    {temples.map((t) => {
                      const isCur = !isAllTemples && t.id === currentTemple.id;
                      const isAff = t.isAffiliated || (t.id !== 'temple-main' && !t.isMain);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSelectTemple?.(t.id || 'temple-main');
                            setTempleDropdownOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-left text-sm font-bold flex items-center justify-between cursor-pointer transition-colors ${
                            isCur
                              ? 'bg-[#2E2E2E] text-[#D4AF37]'
                              : 'text-[#E5E0D8] hover:bg-[#333333]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: t.color || (isAff ? '#8B5CF6' : '#D4AF37') }}
                            />
                            <div className="min-w-0">
                              <div className="truncate flex items-center gap-1.5 font-bold text-sm">
                                <span>{t.name}</span>
                                <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-xs ${
                                  isAff ? 'bg-emerald-900/80 text-emerald-200' : 'bg-[#D4AF37]/20 text-[#D4AF37]'
                                }`}>
                                  {isAff ? '兼務' : '本寺'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#888888] truncate font-normal">
                                {t.mountainName ? `${t.mountainName} ` : ''}{t.sect || t.address || ''}
                              </div>
                            </div>
                          </div>
                          {isCur && <span className="text-xs text-[#D4AF37] font-bold ml-1.5 shrink-0">● 選択中</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Single Temple Display */
            <div className="flex items-center gap-2 min-w-0 py-1 px-1">
              <div className="w-9 h-9 rounded-xs bg-[#2A2A2A] border border-[#D4AF37]/80 flex items-center justify-center text-[#D4AF37] shrink-0">
                <span className="text-sm font-black leading-none">本</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-serif font-black text-[#F9F7F2] truncate tracking-tight">
                  {templeInfo.name || '（寺院名未設定）'}
                </h1>
              </div>
            </div>
          )}
        </div>

        {/* Right: Data Link & PC View Switch Buttons (Enlarged) */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenGoogleSheetsModal && (
            <button
              type="button"
              onClick={onOpenGoogleSheetsModal}
              className={`px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm border ${
                syncStatus === 'syncing'
                  ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                  : syncStatus === 'synced'
                  ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200 hover:bg-emerald-900'
                  : syncStatus === 'error'
                  ? 'bg-rose-950/80 border-rose-500/80 text-rose-200'
                  : 'bg-[#2A2A2A] hover:bg-[#383838] border-[#555555] text-[#F9F7F2]'
              }`}
              title="Google スプレッドシート / Drive データ連携設定"
            >
              {syncStatus === 'syncing' ? (
                <>
                  <RefreshCw className="w-4.5 h-4.5 animate-spin text-amber-400 shrink-0" />
                  <span className="whitespace-nowrap">同期中</span>
                </>
              ) : syncStatus === 'synced' ? (
                <>
                  <Cloud className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                  <span className="whitespace-nowrap">連携済</span>
                </>
              ) : syncStatus === 'error' ? (
                <>
                  <CloudOff className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                  <span className="whitespace-nowrap">エラー</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4.5 h-4.5 text-[#D4AF37] shrink-0" />
                  <span className="whitespace-nowrap">データ連携</span>
                </>
              )}
            </button>
          )}

          {isStaffMode ? (
            <div 
              className="px-2.5 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-sm text-xs font-bold flex items-center gap-1 shrink-0"
              title="スタッフモードで動作中（機能制限版）"
            >
              <span className="text-amber-400">👤</span>
              <span className="whitespace-nowrap">スタッフ</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSwitchToDesktop}
              className="px-3.5 py-2 sm:px-4 sm:py-2.5 bg-[#2A2A2A] hover:bg-[#383838] active:bg-[#444444] border border-[#666666] rounded-sm text-xs sm:text-sm font-bold text-[#F9F7F2] flex items-center gap-1.5 cursor-pointer shrink-0 transition-all shadow-sm"
              title="PC版のフル画面に切り替えます"
            >
              <Monitor className="w-4.5 h-4.5 text-[#D4AF37] shrink-0" />
              <span className="whitespace-nowrap">PC版</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
