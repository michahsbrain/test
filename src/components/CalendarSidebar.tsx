import React, {useMemo, useRef, useState} from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {CalendarEvent, PlannerSettings, TagDefinition, UndoSnapshot} from '../types/planner';
import {
  diffDaysInclusive,
  formatDateShortFr,
  formatMonthYear,
  getDayNumber,
  getMonthCalendarGrid,
  getTodayISO,
  getWeekDates,
  parseISO,
} from '../utils/dateUtils';

interface CalendarSidebarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  events: CalendarEvent[];
  tags: TagDefinition[];
  settings: PlannerSettings;
  undoStack: UndoSnapshot[];
  undoRemainingSec: number;
  onUndo: () => void;
  onKeepAction: () => void;
  onOpenSettings: () => void;
  onExportIcs: () => void;
  onImportIcs: (file: File) => Promise<void>;
}

const MINI_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  selectedDate,
  onSelectDate,
  events,
  tags,
  settings,
  undoStack,
  undoRemainingSec,
  onUndo,
  onKeepAction,
  onOpenSettings,
  onExportIcs,
  onImportIcs,
}) => {
  const icsInputRef = useRef<HTMLInputElement | null>(null);
  const initialDate = parseISO(selectedDate);
  const [viewMonth, setViewMonth] = useState<{year: number; month: number}>({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth(),
  });

  const todayISO = getTodayISO();
  const activeWeekSet = useMemo(() => new Set(getWeekDates(selectedDate)), [selectedDate]);

  const monthCells = useMemo(
    () => getMonthCalendarGrid(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month]
  );

  const datesWithEvents = useMemo(() => {
    const map = new Set<string>();
    for (const ev of events) {
      map.add(ev.date);
    }
    return map;
  }, [events]);

  const monthLabel = useMemo(() => {
    const d = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-01`;
    return formatMonthYear(d);
  }, [viewMonth]);

  const shiftMonth = (delta: number) => {
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1, 12);
      return {year: next.getFullYear(), month: next.getMonth()};
    });
  };

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 select-none overflow-y-auto calendar-scroll">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{monthLabel}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Mois précédent"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Mois suivant"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {MINI_WEEKDAYS.map((w, idx) => (
            <div key={idx} className="text-[11px] font-medium text-slate-400 dark:text-slate-500 py-1">
              {w}
            </div>
          ))}
          {monthCells.map((cell) => {
            const isToday = cell.date === todayISO;
            const isSelected = cell.date === selectedDate;
            const inActiveWeek = activeWeekSet.has(cell.date);
            const hasEvents = datesWithEvents.has(cell.date);

            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => onSelectDate(cell.date)}
                className={`relative h-7 w-7 mx-auto flex items-center justify-center rounded-full text-xs tabular-nums transition-colors cursor-pointer ${
                  isToday
                    ? 'bg-[#1A73E8] text-white font-semibold'
                    : isSelected
                    ? 'bg-blue-100 dark:bg-blue-900 text-[#174EA6] dark:text-blue-200 font-semibold'
                    : inActiveWeek
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                    : cell.inMonth
                    ? 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                {getDayNumber(cell.date)}
                {hasEvents && !isToday && (
                  <span className="sr-only">Contient des activités</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Génération</h2>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1A73E8] dark:text-blue-400 hover:underline cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Modifier
          </button>
        </div>
        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          <div className="flex items-center justify-between gap-2">
            <span>Du</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {formatDateShortFr(settings.generationStartDate)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Jusqu’au</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {formatDateShortFr(settings.generationEndDate)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Durée</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {diffDaysInclusive(settings.generationStartDate, settings.generationEndDate)} j
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tags de suivi</h2>
        <div className="space-y-1.5">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{backgroundColor: tag.color}}
              />
              <span className="truncate">{tag.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Fichiers .ics
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => icsInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Upload className="w-3 h-3 shrink-0 text-[#1A73E8] dark:text-blue-400" />
            <span>Importer</span>
          </button>
          <button
            type="button"
            onClick={onExportIcs}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3 shrink-0 text-[#1A73E8] dark:text-blue-400" />
            <span>Exporter</span>
          </button>
          <input
            ref={icsInputRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                try {
                  await onImportIcs(file);
                } catch {
                  // Handled via parent toast
                }
              }
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>

      {undoStack.length > 0 && undoRemainingSec > 0 && (
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Action récente
            </h2>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {undoRemainingSec}s
            </span>
          </div>
          <p
            className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed truncate"
            title={undoStack[0].label}
          >
            {undoStack[0].label}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>Revenir</span>
            </button>
            <button
              type="button"
              onClick={onKeepAction}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#1A73E8] px-2.5 py-2 text-xs font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
            >
              <Check className="w-3 h-3 shrink-0" />
              <span>Garder</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
