import React from 'react';
import {BarChart3, CalendarDays, FolderPlus, Plus, Settings} from 'lucide-react';
import {ActiveVolet} from '../types/planner';
import {PWAInstallButton} from './PWAInstallButton';

interface AppNavigationProps {
  activeVolet: ActiveVolet;
  onSelectVolet: (volet: ActiveVolet) => void;
  onNewEvent: () => void;
}

const NAV_ITEMS: Array<{
  id: ActiveVolet;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}> = [
  {id: 'planning', label: 'Planning', icon: CalendarDays},
  {id: 'creation', label: 'Création', icon: FolderPlus},
  {id: 'tracking', label: 'Suivi', icon: BarChart3},
  {id: 'settings', label: 'Paramètres', icon: Settings},
];

export const MobileTopBar: React.FC<AppNavigationProps> = ({
  activeVolet,
  onNewEvent,
}) => {
  const current = NAV_ITEMS.find((i) => i.id === activeVolet);

  return (
    <header className="md:hidden h-12 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md px-3 flex items-center justify-between gap-3 shrink-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-[#1A73E8] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
          T
        </span>
        <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
          TempoLocal
        </span>
        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
          {current?.label}
        </span>
      </div>

      <button
        type="button"
        onClick={onNewEvent}
        aria-label="Nouvel événement"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#1A73E8] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
      >
        <Plus className="w-5 h-5" />
      </button>
    </header>
  );
};

export const DesktopSideRail: React.FC<AppNavigationProps> = ({
  activeVolet,
  onSelectVolet,
  onNewEvent,
}) => {
  return (
    <aside
      aria-label="Navigation principale"
      className="hidden md:flex w-[76px] xl:w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-col justify-between py-4 px-2.5 xl:px-3.5 select-none"
    >
      <div className="space-y-4">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onSelectVolet('planning')}
          className="w-full flex items-center justify-center xl:justify-start gap-2.5 px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
        >
          <span className="w-8 h-8 rounded-lg bg-[#1A73E8] text-white font-display font-bold text-base flex items-center justify-center shrink-0">
            T
          </span>
          <span className="hidden xl:inline font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            TempoLocal
          </span>
        </button>

        {/* Twitter-style Vertical Volet Nav */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeVolet === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectVolet(item.id)}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={`w-full min-h-[44px] flex items-center justify-center xl:justify-start gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A73E8] ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-[#1A73E8] dark:text-blue-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden xl:inline whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Compose / New Event CTA */}
        <button
          type="button"
          onClick={onNewEvent}
          title="Nouvel événement"
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#1A73E8] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1557B0] transition-colors shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A73E8]"
        >
          <Plus className="w-5 h-5 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Nouvel événement</span>
        </button>
      </div>

      <div className="hidden xl:block pt-3 border-t border-slate-100 dark:border-slate-800">
        <PWAInstallButton variant="compact" />
      </div>
    </aside>
  );
};

export const MobileBottomBar: React.FC<{
  activeVolet: ActiveVolet;
  onSelectVolet: (volet: ActiveVolet) => void;
}> = ({activeVolet, onSelectVolet}) => {
  return (
    <nav
      aria-label="Barre de navigation mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md grid grid-cols-4 items-center px-1"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeVolet === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectVolet(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors cursor-pointer ${
              active
                ? 'text-[#1A73E8] dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Icon className="w-[22px] h-[22px]" />
            <span className={`text-[10px] leading-none tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
