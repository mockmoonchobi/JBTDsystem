import React from 'react';
import { Users, BookOpen, Calendar as CalendarIcon, Receipt } from 'lucide-react';

export type MobileTab = 'households' | 'kakocho' | 'schedule' | 'reception' | 'calendar' | 'todos';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  householdCount: number;
  kakochoCount: number;
  upcomingServiceCount: number;
  pendingTodoCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onChangeTab,
  householdCount,
  kakochoCount,
  upcomingServiceCount,
  pendingTodoCount = 0,
}) => {
  const isScheduleActive = activeTab === 'schedule' || activeTab === 'calendar' || activeTab === 'todos';
  const totalScheduleBadge = upcomingServiceCount + pendingTodoCount;

  const tabs = [
    {
      id: 'households' as MobileTab,
      label: '住所録',
      sublabel: '檀家名簿',
      icon: Users,
      badge: householdCount > 0 ? `${householdCount}` : undefined,
    },
    {
      id: 'kakocho' as MobileTab,
      label: '過去帳',
      sublabel: '諸精霊・回忌',
      icon: BookOpen,
      badge: kakochoCount > 0 ? `${kakochoCount}` : undefined,
    },
    {
      id: 'schedule' as MobileTab,
      label: '予定',
      sublabel: '予定帳・ToDo',
      icon: CalendarIcon,
      badge: totalScheduleBadge > 0 ? `${totalScheduleBadge}` : undefined,
      highlightBadge: upcomingServiceCount > 0,
      isActive: isScheduleActive,
    },
    {
      id: 'reception' as MobileTab,
      label: '受付',
      sublabel: '簡易受付・QR',
      icon: Receipt,
      isActive: activeTab === 'reception',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#1F1F1F] border-t border-[#3A3A3A] shadow-2xl safe-area-bottom">
      <div className="grid grid-cols-4 h-16">
        {tabs.map((t) => {
          const isActive = t.isActive !== undefined ? t.isActive : activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTab(t.id)}
              className={`flex flex-col items-center justify-center relative cursor-pointer select-none transition-colors ${
                isActive
                  ? 'bg-[#2B2724] text-[#D4AF37]'
                  : 'text-[#9E988E] hover:text-[#E5E0D8] active:bg-[#252525]'
              }`}
            >
              {/* Active Indicator Line on top */}
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-0.5 bg-[#D4AF37] rounded-full" />
              )}

              <div className="relative">
                <Icon className={`w-6 h-6 ${isActive ? 'text-[#D4AF37]' : 'text-[#9E988E]'}`} />
                {t.badge && (
                  <span
                    className={`absolute -top-1.5 -right-3.5 px-1 py-0.2 text-[10px] font-black rounded-full leading-none shadow-xs ${
                      t.highlightBadge
                        ? 'bg-[#8C2D19] text-white ring-1 ring-white/30'
                        : isActive
                        ? 'bg-[#D4AF37] text-[#1A1A1A]'
                        : 'bg-[#333333] text-[#CCCCCC]'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </div>
              <span className={`text-xs mt-1 font-bold ${isActive ? 'text-[#F5F2EB]' : 'text-[#9E988E]'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

