import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Plus} from 'lucide-react';
import {useSwipeNavigation} from '../hooks/useSwipeNavigation';
import {CalendarEvent, TagDefinition} from '../types/planner';
import {
  getDayNumber,
  getMonthCalendarGrid,
  getTodayISO,
  minToTime,
  parseISO,
} from '../utils/dateUtils';
import {IMPORTANCE_META, resolveEventStyle} from '../utils/eventStyles';

interface MonthViewProps {
  selectedDate: string;
  events: CalendarEvent[];
  tags: TagDefinition[];
  onSelectDate: (date: string) => void;
  onOpenDayView: (date: string) => void;
  onSlotClick: (date: string, startMin: number, endMin: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onMoveEvent: (
    event: CalendarEvent,
    targetDate: string,
    targetStartMin: number,
    targetEndMin: number
  ) => void;
  onNavigatePeriod: (direction: -1 | 1) => void;
}

const WEEKDAYS_HEADER = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX_EVENTS_PER_CELL = 3;
const LONG_PRESS_MS = 360;

export const MonthView: React.FC<MonthViewProps> = ({
  selectedDate,
  events,
  tags,
  onSelectDate,
  onOpenDayView,
  onSlotClick,
  onEventClick,
  onMoveEvent,
  onNavigatePeriod,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayISO = getTodayISO();
  const anchor = parseISO(selectedDate);

  const [dragState, setDragState] = useState<{
    event: CalendarEvent;
    targetDate: string;
    hasMoved: boolean;
  } | null>(null);

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const pressSessionRef = useRef<{
    timerId: number | null;
    pointerId: number;
    event: CalendarEvent;
    startX: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  const cellTouchDownRef = useRef<{x: number; y: number; date: string} | null>(null);
  const lastEmptyTapRef = useRef<{time: number; x: number; y: number; date: string} | null>(null);
  const lastDoubleCreatedAtRef = useRef<number>(0);

  const {swipeOffsetX, swipeHandlers} = useSwipeNavigation({
    onPrev: () => onNavigatePeriod(-1),
    onNext: () => onNavigatePeriod(1),
    scrollContainerRef: scrollRef,
    disabled: Boolean(dragState),
  });

  useEffect(() => {
    const clearTimer = () => {
      if (pressSessionRef.current?.timerId !== null && pressSessionRef.current?.timerId !== undefined) {
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

      const targetEl = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-month-date]');
      const hoverDate = targetEl?.dataset.monthDate ?? dragStateRef.current?.targetDate ?? session.event.date;

      setDragState((prev) => {
        if (!prev) return null;
        const moved = prev.hasMoved || dist > 10 || hoverDate !== prev.event.date;
        if (prev.targetDate === hoverDate && prev.hasMoved === moved) return prev;
        return {
          ...prev,
          targetDate: hoverDate,
          hasMoved: moved,
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

      const currentDrag = dragStateRef.current;
      setDragState(null);

      if (!currentDrag) return;
      if (!currentDrag.hasMoved || currentDrag.targetDate === ev.date) {
        if (!currentDrag.hasMoved) {
          onEventClick(ev);
        }
        return;
      }

      onMoveEvent(ev, currentDrag.targetDate, ev.startMin, ev.endMin);
    };

    const handleWindowPointerCancel = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      clearTimer();
      pressSessionRef.current = null;
      setDragState(null);
    };

    const preventTouchScrollWhileDragging = (e: TouchEvent) => {
      if (dragStateRef.current) {
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

  const cells = useMemo(
    () => getMonthCalendarGrid(anchor.getFullYear(), anchor.getMonth()),
    [anchor]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date);
      if (list) list.push(ev);
      else map.set(ev.date, [ev]);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.startMin - b.startMin);
    }
    return map;
  }, [events]);

  const triggerCreateForDate = (dateStr: string) => {
    const now = Date.now();
    if (now - lastDoubleCreatedAtRef.current < 280) return;
    lastDoubleCreatedAtRef.current = now;
    onSlotClick(dateStr, 9 * 60, 10 * 60);
  };

  const handleEventPointerDown = (e: React.PointerEvent<HTMLButtonElement>, ev: CalendarEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();

    if (pressSessionRef.current?.timerId) {
      window.clearTimeout(pressSessionRef.current.timerId);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;

    const timerId = window.setTimeout(() => {
      if (!pressSessionRef.current || pressSessionRef.current.pointerId !== pointerId) return;
      pressSessionRef.current.activated = true;
      pressSessionRef.current.timerId = null;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      setDragState({
        event: ev,
        targetDate: ev.date,
        hasMoved: false,
      });
    }, LONG_PRESS_MS);

    pressSessionRef.current = {
      timerId,
      pointerId,
      event: ev,
      startX,
      startY,
      activated: false,
    };
  };

  return (
    <div
      ref={scrollRef}
      onTouchStart={swipeHandlers.onTouchStart}
      onTouchMove={swipeHandlers.onTouchMove}
      onTouchEnd={swipeHandlers.onTouchEnd}
      onTouchCancel={swipeHandlers.onTouchCancel}
      className={`flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-950 overflow-y-auto overflow-x-hidden overscroll-x-none calendar-scroll pb-16 md:pb-0 relative ${
        dragState ? 'touch-none select-none' : 'touch-pan-y'
      }`}
    >
      <div
        className="w-full flex-1 flex flex-col transition-transform duration-100 ease-out"
        style={
          swipeOffsetX !== 0
            ? {transform: `translate3d(${swipeOffsetX}px, 0, 0)`}
            : undefined
        }
      >
        {/* Weekday Column Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
          {WEEKDAYS_HEADER.map((dayName) => (
            <div
              key={dayName}
              className="py-2 px-0.5 sm:px-3 text-center text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 last:border-r-0 truncate"
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* 6x7 Month Cells */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6">
          {cells.map((cell) => {
            const isToday = cell.date === todayISO;
            const isSelected = cell.date === selectedDate;
            const isDropTarget = dragState?.hasMoved && dragState.targetDate === cell.date;
            const dayEvents = eventsByDate.get(cell.date) ?? [];
            const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_CELL);
            const overflowCount = dayEvents.length - visibleEvents.length;

            return (
              <div
                key={cell.date}
                data-month-date={cell.date}
                onClick={() => onSelectDate(cell.date)}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-event-card="true"]')) return;
                  triggerCreateForDate(cell.date);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== 'touch') return;
                  if ((e.target as HTMLElement).closest('button, [data-event-card="true"]')) {
                    cellTouchDownRef.current = null;
                    return;
                  }
                  cellTouchDownRef.current = {x: e.clientX, y: e.clientY, date: cell.date};
                }}
                onPointerUp={(e) => {
                  if (e.pointerType !== 'touch') return;
                  const down = cellTouchDownRef.current;
                  cellTouchDownRef.current = null;
                  if (!down || down.date !== cell.date) return;
                  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;

                  const now = Date.now();
                  const prev = lastEmptyTapRef.current;
                  if (
                    prev &&
                    prev.date === cell.date &&
                    now - prev.time <= 340 &&
                    Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 36
                  ) {
                    lastEmptyTapRef.current = null;
                    triggerCreateForDate(cell.date);
                  } else {
                    lastEmptyTapRef.current = {
                      time: now,
                      x: e.clientX,
                      y: e.clientY,
                      date: cell.date,
                    };
                  }
                }}
                className={`group min-w-0 overflow-hidden min-h-[76px] sm:min-h-[104px] border-r border-b border-slate-200 dark:border-slate-800 last:border-r-0 p-1 sm:p-1.5 flex flex-col gap-1 transition-colors ${
                  cell.inMonth
                    ? 'bg-white dark:bg-slate-950'
                    : 'bg-slate-50/70 dark:bg-slate-900/50'
                } ${
                  isDropTarget
                    ? 'ring-2 ring-inset ring-[#1A73E8] bg-blue-50/70 dark:bg-blue-950/60'
                    : isSelected
                    ? 'ring-1 ring-inset ring-[#1A73E8]/50 bg-blue-50/20 dark:bg-blue-950/25'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 px-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDayView(cell.date);
                    }}
                    title="Ouvrir la journée"
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                      isToday
                        ? 'bg-[#1A73E8] text-white'
                        : isSelected
                        ? 'bg-blue-100 dark:bg-blue-900 text-[#174EA6] dark:text-blue-200'
                        : cell.inMonth
                        ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {getDayNumber(cell.date)}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSlotClick(cell.date, 9 * 60, 10 * 60);
                    }}
                    aria-label={`Ajouter une activité le ${cell.date}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-slate-400 dark:text-slate-500 hover:text-[#1A73E8] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-opacity cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                  {visibleEvents.map((ev) => {
                    const style = resolveEventStyle(ev, tags);
                    const isActiveDrag = dragState?.event.id === ev.id;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        data-event-card="true"
                        onPointerDown={(e) => handleEventPointerDown(e, ev)}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => e.stopPropagation()}
                        title={`${minToTime(ev.startMin)}–${minToTime(ev.endMin)} · ${ev.title} (${IMPORTANCE_META[ev.importance].shortLabel}) — Appuyez pour voir le détail · maintenez appuyé pour déplacer`}
                        className={`w-full rounded border px-1 sm:px-1.5 py-0.5 text-left text-[10px] sm:text-[11px] leading-snug flex items-center gap-1 sm:gap-1.5 truncate transition-all select-none cursor-pointer active:cursor-grabbing ${style.bg} ${style.border} ${style.text} ${
                          isActiveDrag ? 'ring-2 ring-[#1A73E8] shadow-md opacity-70 scale-[0.98]' : ''
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-xs shrink-0 ${style.swatch}`} />
                        <span className="hidden sm:inline font-mono tabular-nums text-[10px] opacity-80 shrink-0">
                          {minToTime(ev.startMin)}
                        </span>
                        <span className="font-medium truncate flex-1">{ev.title}</span>
                      </button>
                    );
                  })}

                  {overflowCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDayView(cell.date);
                      }}
                      className="px-1.5 py-0.5 text-left text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-[#1A73E8] dark:hover:text-blue-400 cursor-pointer"
                    >
                      +{overflowCount} autre{overflowCount > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
