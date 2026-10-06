import React from 'react';
import { 
  FileText, 
  Truck, 
  CalendarDays, 
  StickyNote, 
  Users,
  TrendingUp
} from 'lucide-react';

export type ActiveTab = 'quotes' | 'orders' | 'customers' | 'calendar' | 'notes';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  quotesCount: number;
  ordersCount: number;
  eventsCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  quotesCount,
  ordersCount,
  eventsCount,
}) => {
  const tabs = [
    {
      id: 'quotes' as ActiveTab,
      label: 'Teklif Yönetimi',
      shortLabel: 'Teklifler',
      icon: FileText,
      badge: quotesCount > 0 ? quotesCount : null,
      badgeColor: 'bg-brand-500',
    },
    {
      id: 'orders' as ActiveTab,
      label: 'Sipariş & Sevkiyat Takibi',
      shortLabel: 'Sevkiyat',
      icon: Truck,
      badge: ordersCount > 0 ? ordersCount : null,
      badgeColor: 'bg-emerald-600',
    },
    {
      id: 'customers' as ActiveTab,
      label: 'Müşteriler',
      shortLabel: 'Müşteriler',
      icon: Users,
      badge: null,
      badgeColor: 'bg-slate-500',
    },
    {
      id: 'calendar' as ActiveTab,
      label: 'Ortak Takvim & Ajanda',
      shortLabel: 'Takvim',
      icon: CalendarDays,
      badge: eventsCount > 0 ? eventsCount : null,
      badgeColor: 'bg-sky-600',
    },
    {
      id: 'notes' as ActiveTab,
      label: 'Ofis/Saha Notları & Akış',
      shortLabel: 'Notlar',
      icon: StickyNote,
      badge: null,
      badgeColor: 'bg-amber-500',
    },
  ];

  return (
    <>
      {/* Desktop / Tablet Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-xs hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex space-x-1 lg:space-x-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-sm font-semibold transition-all relative ${
                    isActive
                      ? 'border-brand-500 text-brand-600 bg-brand-50/50'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} />
                  <span className="2xl:hidden whitespace-nowrap">{tab.shortLabel}</span>
                  <span className="hidden 2xl:inline whitespace-nowrap">{tab.label}</span>
                  {tab.badge !== null && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold text-white ${tab.badgeColor}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Mobile Fixed Bottom Navigation Bar (optimized for phone usage in Isparta field) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 px-2 py-1 shadow-lg pb-safe">
        <div className="grid grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative ${
                  isActive ? 'text-brand-600 font-bold bg-brand-50/70' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                  {tab.badge !== null && (
                    <span className={`absolute -top-1.5 -right-2 px-1 min-w-[16px] h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${tab.badgeColor}`}>
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 leading-tight truncate w-full text-center">
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
