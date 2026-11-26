import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import {useSwipeNavigation} from '../hooks/useSwipeNavigation';
import {
  CalendarEvent,
  CalendarViewMode,
  PlannerSettings,
  TagDefinition,
} from '../types/planner';
import {
  addDays,
  addMonths,
  formatDateRangeShortFr,
  formatDateShortFr,
  formatMonthYear,
  formatWeekRangeFr,
  getDayNumber,
  getTodayISO,
  getWeekDates,
  getWeekdayShort,
  minToTime,
  timeToMin,
} from '../utils/dateUtils';
import {IMPORTANCE_META, resolveEventStyle} from '../utils/eventStyles';
import {AgendaView} from './AgendaView';
import {MonthView} from './MonthView';

interface CalendarGridProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  viewMode: CalendarViewMode;
  onChangeViewMode: (mode: CalendarViewMode) => void;
  events: CalendarEvent[];
  tags: TagDefinition[];
  settings: PlannerSettings;
  hideRoutine: boolean;
  onToggleHideRoutine: () => void;
  onSlotClick: (date: string, startMin: number, endMin: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onMoveEvent: (
    event: CalendarEvent,
    targetDate: string,
    targetStartMin: number,
    targetEndMin: number
  ) => void;
  onOpenSettings: () => void;
}

const HOUR_HEIGHT = 56; // px per hour
const HOURS = Array.from({length: 24}, (_, i) => i);
const LONG_PRESS_MS = 360;

interface PositionedEvent {
  event: CalendarEvent;
  colIndex: number;
  colCount: number;
}

function layoutDayEvents(dayEvents: CalendarEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];
  const sorted = [...dayEvents].sort((a, b) =>
    a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin
  );

  const clusters: CalendarEvent[][] = [];
  let currentCluster: CalendarEvent[] = [];
  let clusterEnd = -1;

  for (const ev of sorted) {
    if (currentCluster.length === 0 || ev.startMin < clusterEnd) {
      currentCluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [ev];
      clusterEnd = ev.endMin;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const result: PositionedEvent[] = [];

  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const placements: Array<{ev: CalendarEvent; col: number}> = [];

    for (const ev of cluster) {
      let placedCol = colEnds.findIndex((end) => end <= ev.startMin);
      if (placedCol === -1) {
        placedCol = colEnds.length;
        colEnds.push(ev.endMin);
      } else {
        colEnds[placedCol] = ev.endMin;
      }
      placements.push({ev, col: placedCol});
    }

    const totalCols = colEnds.length;
    for (const p of placements) {
      result.push({
        event: p.ev,
        colIndex: p.col,
        colCount: totalCols,
      });
    }
  }

  return result;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  selectedDate,
  onSelectDate,
  viewMode,
  onChangeViewMode,
  events,
  tags,
  settings,
  hideRoutine,
  onToggleHideRoutine,
  onSlotClick,
  onEventClick,
  onMoveEvent,
  onOpenSettings,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const daysGridRef = useRef<HTMLDivElement | null>(null);
  const todayISO = getTodayISO();

  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // Active long-press / drag-move state for events
  const [dragEvent, setDragEvent] = useState<{
    event: CalendarEvent;
    targetDate: string;
    targetStartMin: number;
    targetEndMin: number;
    hasMoved: boolean;
  } | null>(null);

  const dragEventRef = useRef(dragEvent);
  dragEventRef.current = dragEvent;

  const pressSessionRef = useRef<{
    timerId: number | null;
    pointerId: number;
    event: CalendarEvent;
    startX: number;
    startY: number;
    pointerOffsetY: number;
    duration: number;
    activated: boolean;
  } | null>(null);

  const emptyTouchDownRef = useRef<{x: number; y: number; date: string} | null>(null);
  const lastEmptyTapRef = useRef<{time: number; x: number; y: number; date: string} | null>(null);
  const lastDoubleCreatedAtRef = useRef<number>(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Scroll to ~06:15 on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetMin = 6 * 60 + 15;
    scrollRef.current.scrollTop = (targetMin / 60) * HOUR_HEIGHT;
  }, []);

  const visibleDates = useMemo(() => {
    if (viewMode === 'day') return [selectedDate];
    return getWeekDates(selectedDate);
  }, [selectedDate, viewMode]);

  const visibleDatesRef = useRef(visibleDates);
  visibleDatesRef.current = visibleDates;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const d of visibleDates) map.set(d, []);
    for (const ev of events) {
      const list = map.get(ev.date);
      if (list) list.push(ev);
    }
    return map;
  }, [events, visibleDates]);

  const headerTitle = useMemo(() => {
    if (viewMode === 'day') return formatDateShortFr(selectedDate);
    if (viewMode === 'month') return formatMonthYear(selectedDate);
    if (viewMode === 'agenda') return formatDateRangeShortFr(selectedDate, addDays(selectedDate, 13));
    return formatWeekRangeFr(visibleDates);
  }, [viewMode, selectedDate, visibleDates]);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (viewMode === 'month') {
        onSelectDate(addMonths(selectedDate, direction));
        return;
      }
      const step = viewMode === 'day' ? 1 : viewMode === 'agenda' ? 14 : 7;
      onSelectDate(addDays(selectedDate, direction * step));
    },
    [viewMode, selectedDate, onSelectDate]
  );

  const {swipeOffsetX, swipeHandlers} = useSwipeNavigation({
    onPrev: () => navigate(-1),
    onNext: () => navigate(1),
    scrollContainerRef: scrollRef,
    disabled: Boolean(dragEvent),
  });

  // Global pointer tracking for long-press -> edit or drag-and-drop move.
  // If user slides (> 10px) BEFORE 360ms, timer cancels so swipe/scroll proceeds without modifying anything.
  useEffect(() => {
    const clearTimer = () => {
      if (
        pressSessionRef.current?.timerId !== null &&
        pressSessionRef.current?.timerId !== undefined
      ) {
        window.clearTimeout(pressSessionRef.current.timerId);
        pressSessionRef.current.timerId = null;
      }
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      const dist = Math.hypot(dx, dy);

      if (!session.activated) {
        if (dist > 10) {
          clearTimer();
          pressSessionRef.current = null;
        }
        return;
      }

      const gridEl = daysGridRef.current;
      if (!gridEl) return;

      const gridRect = gridEl.getBoundingClientRect();
      const dates = visibleDatesRef.current;
      const colRatio = (e.clientX - gridRect.left) / Math.max(1, gridRect.width);
      const colIndex = Math.max(0, Math.min(dates.length - 1, Math.floor(colRatio * dates.length)));
      const targetDate = dates[colIndex] ?? session.event.date;

      const topInGridY = e.clientY - gridRect.top - session.pointerOffsetY;
      const rawStartMin = (topInGridY / HOUR_HEIGHT) * 60;
      const snappedStart = Math.round(rawStartMin / 15) * 15;
      const targetStartMin = Math.max(0, Math.min(1440 - session.duration, snappedStart));
      const targetEndMin = targetStartMin + session.duration;

      setDragEvent((prev) => {
        if (!prev) return null;
        const hasMoved =
          prev.hasMoved ||
          dist > 8 ||
          targetDate !== prev.event.date ||
          targetStartMin !== prev.event.startMin;
        if (
          prev.targetDate === targetDate &&
          prev.targetStartMin === targetStartMin &&
          prev.targetEndMin === targetEndMin &&
          prev.hasMoved === hasMoved
        ) {
          return prev;
        }
        return {
          ...prev,
          targetDate,
          targetStartMin,
          targetEndMin,
          hasMoved,
        };
      });
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      clearTimer();
      const wasActivated = session.activated;
      const ev = session.event;
      pressSessionRef.current = null;

      if (!wasActivated) {
        const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (dist < 10) {
          onEventClick(ev);
        }
        return;
      }

      const currentDrag = dragEventRef.current;
      setDragEvent(null);

      if (!currentDrag) return;
      if (!currentDrag.hasMoved) {
        onEventClick(ev);
        return;
      }

      if (
        currentDrag.targetDate !== ev.date ||
        currentDrag.targetStartMin !== ev.startMin ||
        currentDrag.targetEndMin !== ev.endMin
      ) {
        onMoveEvent(
          ev,
          currentDrag.targetDate,
          currentDrag.targetStartMin,
          currentDrag.targetEndMin
        );
      }
    };

    const handleWindowPointerCancel = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      clearTimer();
      pressSessionRef.current = null;
      setDragEvent(null);
    };

    const preventTouchScrollWhileDragging = (e: TouchEvent) => {
      if (dragEventRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    window.addEventListener('touchmove', preventTouchScrollWhileDragging, {passive: false});

    return () => {
      clearTimer();
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
      window.removeEventListener('touchmove', preventTouchScrollWhileDragging);
    };
  }, [onEventClick, onMoveEvent]);

  const getStartMinAtClientY = (clientY: number, colEl: HTMLElement) => {
    const rect = colEl.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const rawMin = (y / HOUR_HEIGHT) * 60;
    return Math.min(1380, Math.floor(rawMin / 30) * 30);
  };

  const triggerCreateAtClientY = (dateStr: string, clientY: number, colEl: HTMLElement) => {
    const now = Date.now();
    if (now - lastDoubleCreatedAtRef.current < 280) return;
    lastDoubleCreatedAtRef.current = now;
    const startMin = getStartMinAtClientY(clientY, colEl);
    onSlotClick(dateStr, startMin, Math.min(1440, startMin + 60));
  };

  const handleColDoubleClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    if ((e.target as HTMLElement).closest('[data-event-card="true"]')) return;
    triggerCreateAtClientY(dateStr, e.clientY, e.currentTarget);
  };

  const handleColPointerDown = (e: React.PointerEvent<HTMLDivElement>, dateStr: string) => {
    if (e.pointerType !== 'touch') return;
    if ((e.target as HTMLElement).closest('[data-event-card="true"]')) {
      emptyTouchDownRef.current = null;
      return;
    }
    emptyTouchDownRef.current = {x: e.clientX, y: e.clientY, date: dateStr};
  };

  const handleColPointerUp = (e: React.PointerEvent<HTMLDivElement>, dateStr: string) => {
    if (e.pointerType !== 'touch') return;
    const down = emptyTouchDownRef.current;
    emptyTouchDownRef.current = null;
    if (!down || down.date !== dateStr) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;

    const now = Date.now();
    const prev = lastEmptyTapRef.current;
    if (
      prev &&
      prev.date === dateStr &&
      now - prev.time <= 340 &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 36
    ) {
      lastEmptyTapRef.current = null;
      triggerCreateAtClientY(dateStr, e.clientY, e.currentTarget);
    } else {
      lastEmptyTapRef.current = {
        time: now,
        x: e.clientX,
        y: e.clientY,
        date: dateStr,
      };
    }
  };

  const handleEventPointerDown = (e: React.PointerEvent<HTMLButtonElement>, ev: CalendarEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();

    if (pressSessionRef.current?.timerId) {
      window.clearTimeout(pressSessionRef.current.timerId);
    }

    const cardRect = e.currentTarget.getBoundingClientRect();
    const pointerOffsetY = Math.max(0, e.clientY - cardRect.top);
    const duration = Math.max(15, ev.endMin - ev.startMin);
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;

    const timerId = window.setTimeout(() => {
      if (!pressSessionRef.current || pressSessionRef.current.pointerId !== pointerId) return;
      pressSessionRef.current.activated = true;
      pressSessionRef.current.timerId = null;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      setDragEvent({
        event: ev,
        targetDate: ev.date,
        targetStartMin: ev.startMin,
        targetEndMin: ev.endMin,
        hasMoved: false,
      });
    }, LONG_PRESS_MS);

    pressSessionRef.current = {
      timerId,
      pointerId,
      event: ev,
      startX,
      startY,
      pointerOffsetY,
      duration,
      activated: false,
    };
  };

  const hasVisibleEvents = visibleDates.some((d) => (eventsByDate.get(d)?.length ?? 0) > 0);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 relative">
      {/* Workspace Toolbar — View switcher stays anchored in the exact same position */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 bg-white dark:bg-slate-950 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSelectDate(todayISO)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">Auj.</span>
            <span className="hidden sm:inline">Aujourd’hui</span>
          </button>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Période précédente"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Période suivante"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h1 className="font-display text-sm sm:text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate min-w-0">
            {headerTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleHideRoutine}
            aria-pressed={hideRoutine}
            title={hideRoutine ? 'Afficher les activités de routine' : 'Cacher la routine'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hideRoutine
                ? 'border-[#1A73E8] bg-blue-50 dark:bg-blue-950/70 text-[#174EA6] dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {hideRoutine ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">
              {hideRoutine ? 'Routine cachée' : 'Cacher routine'}
            </span>
          </button>

          <div
            role="group"
            aria-label="Mode d'affichage"
            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-900 p-1 shrink-0"
          >
            {(
              [
                {id: 'day', full: 'Jour', initial: 'J'},
                {id: 'week', full: 'Semaine', initial: 'S'},
                {id: 'month', full: 'Mois', initial: 'M'},
                {id: 'agenda', full: 'Plan', initial: 'P'},
              ] as const
            ).map((v) => {
              const active = viewMode === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChangeViewMode(v.id)}
                  title={`Vue ${v.full}`}
                  aria-label={`Vue ${v.full}`}
                  className={`min-w-[30px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {active ? v.full : v.initial}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Empty Horizon Prompt if user navigates outside generated weeks in Day/Week */}
      {(viewMode === 'day' || viewMode === 'week') && !hasVisibleEvents && (
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Aucune activité planifiée sur cette période. Double-cliquez ou touchez deux fois la grille pour créer une activité.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 font-medium text-[#1A73E8] dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Générer depuis les paramètres
          </button>
        </div>
      )}

      {/* Active View Body */}
      {viewMode === 'month' ? (
        <MonthView
          selectedDate={selectedDate}
          events={events}
          tags={tags}
          onSelectDate={onSelectDate}
          onOpenDayView={(date) => {
            onSelectDate(date);
            onChangeViewMode('day');
          }}
          onSlotClick={onSlotClick}
          onEventClick={onEventClick}
          onMoveEvent={onMoveEvent}
          onNavigatePeriod={navigate}
        />
      ) : viewMode === 'agenda' ? (
        <AgendaView
          selectedDate={selectedDate}
          events={events}
          tags={tags}
          onSelectDate={onSelectDate}
          onSlotClick={onSlotClick}
          onEventClick={onEventClick}
          onOpenSettings={onOpenSettings}
          onNavigatePeriod={navigate}
        />
      ) : (
        <div
          ref={scrollRef}
          onTouchStart={swipeHandlers.onTouchStart}
          onTouchMove={swipeHandlers.onTouchMove}
          onTouchEnd={swipeHandlers.onTouchEnd}
          onTouchCancel={swipeHandlers.onTouchCancel}
          className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none calendar-scroll relative pb-16 md:pb-0 ${
            dragEvent ? 'touch-none select-none' : 'touch-pan-y'
          }`}
        >
          <div
            className="w-full transition-transform duration-100 ease-out"
            style={
              swipeOffsetX !== 0
                ? {transform: `translate3d(${swipeOffsetX}px, 0, 0)`}
                : undefined
            }
          >
            {/* Sticky Day Column Headers */}
            <div className="sticky top-0 z-20 flex bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div className="w-11 sm:w-14 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-end justify-center pb-2">
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">LOC</span>
              </div>
              <div
                className={`flex-1 grid min-w-0 ${
                  viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1'
                }`}
              >
                {visibleDates.map((dateStr) => {
                  const isToday = dateStr === todayISO;
                  const isSelected = dateStr === selectedDate;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => onSelectDate(dateStr)}
                      className="min-w-0 py-2 sm:py-2.5 px-0.5 sm:px-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 flex flex-col items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <span
                        className={`text-[10px] sm:text-[11px] font-medium truncate ${
                          isToday
                            ? 'text-[#1A73E8] dark:text-blue-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {getWeekdayShort(dateStr)}
                      </span>
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold tabular-nums ${
                          isToday
                            ? 'bg-[#1A73E8] text-white'
                            : isSelected
                            ? 'bg-blue-50 dark:bg-blue-950 text-[#174EA6] dark:text-blue-300'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {getDayNumber(dateStr)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hourly Body */}
            <div className="flex relative" style={{height: HOUR_HEIGHT * 24}}>
              {/* Hour Gutter */}
              <div className="w-11 sm:w-14 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 select-none relative">
                {HOURS.map((hour) => (
                  <div key={hour} className="relative" style={{height: HOUR_HEIGHT}}>
                    {hour > 0 && (
                      <span className="absolute -top-2 right-1 sm:right-2 font-mono text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {String(hour).padStart(2, '0')}:00
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              <div
                ref={daysGridRef}
                className={`flex-1 grid min-w-0 relative ${
                  viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1'
                }`}
              >
                {/* Horizontal Hour Lines across all columns */}
                <div className="pointer-events-none absolute inset-0">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{height: HOUR_HEIGHT}}
                      className="border-b border-slate-100 dark:border-slate-800/80"
                    >
                      <div
                        style={{height: HOUR_HEIGHT / 2}}
                        className="border-b border-slate-100/50 dark:border-slate-800/40 border-dashed"
                      />
                    </div>
                  ))}
                </div>

                {visibleDates.map((dateStr) => {
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const positioned = layoutDayEvents(dayEvents);
                  const isToday = dateStr === todayISO;
                  const showDropGhost =
                    dragEvent && dragEvent.hasMoved && dragEvent.targetDate === dateStr;

                  return (
                    <div
                      key={dateStr}
                      onDoubleClick={(e) => handleColDoubleClick(e, dateStr)}
                      onPointerDown={(e) => handleColPointerDown(e, dateStr)}
                      onPointerUp={(e) => handleColPointerUp(e, dateStr)}
                      className={`relative min-w-0 border-r border-slate-200 dark:border-slate-800 last:border-r-0 select-none ${
                        dragEvent ? 'touch-none' : 'touch-pan-y'
                      }`}
                    >
                      {/* Current Time Line */}
                      {isToday && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                          style={{top: (nowMinutes / 60) * HOUR_HEIGHT}}
                        >
                          <div className="w-2 h-2 -ml-1 rounded-full bg-[#1A73E8] shrink-0" />
                          <div className="h-[2px] flex-1 bg-[#1A73E8]" />
                        </div>
                      )}

                      {/* Drag-to-Move Ghost Target Preview */}
                      {showDropGhost && dragEvent && (
                        <div
                          className="pointer-events-none absolute left-1 right-1 z-30 rounded-md border-2 border-[#1A73E8] bg-blue-50/90 dark:bg-blue-950/90 px-2 py-1 text-xs font-medium text-[#174EA6] dark:text-blue-200 shadow-md"
                          style={{
                            top: (dragEvent.targetStartMin / 60) * HOUR_HEIGHT + 1,
                            height: Math.max(
                              22,
                              ((dragEvent.targetEndMin - dragEvent.targetStartMin) / 60) *
                                HOUR_HEIGHT -
                                2
                            ),
                          }}
                        >
                          <div className="truncate font-semibold">{dragEvent.event.title}</div>
                          <div className="font-mono tabular-nums text-[11px]">
                            {minToTime(dragEvent.targetStartMin)}–
                            {minToTime(dragEvent.targetEndMin)}
                          </div>
                        </div>
                      )}

                      {/* Rendered Events */}
                      {positioned.map(({event, colIndex, colCount}) => {
                        const style = resolveEventStyle(event, tags);
                        const topPx = (event.startMin / 60) * HOUR_HEIGHT;
                        const rawHeightPx = ((event.endMin - event.startMin) / 60) * HOUR_HEIGHT;
                        const heightPx = Math.max(22, rawHeightPx - 2);
                        const widthPct = 100 / colCount;
                        const leftPct = colIndex * widthPct;
                        const isCompact = heightPx < 44;
                        const isBeingDragged = dragEvent?.event.id === event.id;

                        return (
                          <button
                            key={event.id}
                            type="button"
                            data-event-card="true"
                            onPointerDown={(e) => handleEventPointerDown(e, event)}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={(e) => e.stopPropagation()}
                            title="Appuyez pour voir le détail · maintenez appuyé pour déplacer"
                            style={{
                              top: topPx + 1,
                              height: heightPx,
                              left:
                                viewMode === 'week'
                                  ? `calc(${leftPct}% + 1.5px)`
                                  : `calc(${leftPct}% + 3px)`,
                              width:
                                viewMode === 'week'
                                  ? `calc(${widthPct}% - 3px)`
                                  : `calc(${widthPct}% - 6px)`,
                            }}
                            className={`absolute rounded-md border px-1 sm:px-2 py-0.5 sm:py-1 text-left transition-all overflow-hidden select-none focus-visible:outline-2 focus-visible:outline-[#1A73E8] ${style.bg} ${style.border} ${style.text} ${
                              isBeingDragged
                                ? dragEvent.hasMoved
                                  ? 'opacity-35 ring-2 ring-[#1A73E8] z-10 cursor-grabbing'
                                  : 'z-30 ring-2 ring-[#1A73E8] shadow-lg scale-[1.02] cursor-grabbing'
                                : 'z-10 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span
                                className={`font-semibold leading-tight truncate ${
                                  viewMode === 'week' ? 'text-[10px] sm:text-xs' : 'text-xs'
                                }`}
                              >
                                {event.title}
                              </span>
                            </div>
                            {!isCompact && (
                              <div
                                className={`mt-0.5 items-center gap-1.5 text-[10px] sm:text-[11px] truncate ${
                                  viewMode === 'week' ? 'hidden sm:flex' : 'flex'
                                } ${style.subtext}`}
                              >
                                <span className="font-mono tabular-nums">
                                  {minToTime(event.startMin)}–{minToTime(event.endMin)}
                                </span>
                                {heightPx >= 64 && event.importance !== 2 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{IMPORTANCE_META[event.importance].shortLabel}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
