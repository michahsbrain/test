import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CalendarPlus, Plus} from 'lucide-react';
import {useSwipeNavigation} from '../hooks/useSwipeNavigation';
import {CalendarEvent, TagDefinition} from '../types/planner';
import {
  addDays,
  formatDuration,
  getDayNumber,
  getTodayISO,
  getWeekdayLong,
  minToTime,
  parseISO,
} from '../utils/dateUtils';
import {IMPORTANCE_META, resolveEventStyle, resolveTagInfo} from '../utils/eventStyles';

interface AgendaViewProps {
  selectedDate: string;
  events: CalendarEvent[];
  tags: TagDefinition[];
  onSelectDate: (date: string) => void;
  onSlotClick: (date: string, startMin: number, endMin: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onOpenSettings: () => void;
  onNavigatePeriod: (direction: -1 | 1) => void;
}

const AGENDA_DAYS_WINDOW = 14;
const LONG_PRESS_MS = 360;
const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

interface FreeGap {
  kind: 'gap';
  startMin: number;
  endMin: number;
}

interface EventRow {
  kind: 'event';
  event: CalendarEvent;
}

type SequenceItem = EventRow | FreeGap;

export const AgendaView: React.FC<AgendaViewProps> = ({
  selectedDate,
  events,
  tags,
  onSelectDate,
  onSlotClick,
  onEventClick,
  onOpenSettings,
  onNavigatePeriod,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayISO = getTodayISO();
  const [showFreeGaps, setShowFreeGaps] = useState(true);
  const [activePressId, setActivePressId] = useState<string | null>(null);

  const pressSessionRef = useRef<{
    timerId: number | null;
    pointerId: number;
    event: CalendarEvent;
    startX: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  const {swipeOffsetX, swipeHandlers} = useSwipeNavigation({
    onPrev: () => onNavigatePeriod(-1),
    onNext: () => onNavigatePeriod(1),
    scrollContainerRef: scrollRef,
    disabled: Boolean(activePressId),
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
      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
      if (dist > 10) {
        clearTimer();
        pressSessionRef.current = null;
        setActivePressId(null);
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      clearTimer();
      const wasActivated = session.activated;
      const ev = session.event;
      pressSessionRef.current = null;
      setActivePressId(null);

      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
      if (wasActivated || dist < 10) {
        onEventClick(ev);
      }
    };

    const handleWindowPointerCancel = (e: PointerEvent) => {
      const session = pressSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      clearTimer();
      pressSessionRef.current = null;
      setActivePressId(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      clearTimer();
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [onEventClick]);

  const handleEventPointerDown = (e: React.PointerEvent<HTMLButtonElement>, ev: CalendarEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pressSessionRef.current?.timerId) {
      window.clearTimeout(pressSessionRef.current.timerId);
    }

    const pointerId = e.pointerId;
    const timerId = window.setTimeout(() => {
      if (!pressSessionRef.current || pressSessionRef.current.pointerId !== pointerId) return;
      pressSessionRef.current.activated = true;
      pressSessionRef.current.timerId = null;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      setActivePressId(ev.id);
    }, LONG_PRESS_MS);

    pressSessionRef.current = {
      timerId,
      pointerId,
      event: ev,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
    };
  };

  const windowDates = useMemo(
    () => Array.from({length: AGENDA_DAYS_WINDOW}, (_, i) => addDays(selectedDate, i)),
    [selectedDate]
  );

  const daySequences = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const d of windowDates) byDate.set(d, []);

    for (const ev of events) {
      if (!byDate.has(ev.date)) continue;
      byDate.get(ev.date)!.push(ev);
    }

    return windowDates.map((dateStr) => {
      const sorted = (byDate.get(dateStr) ?? []).sort((a, b) => a.startMin - b.startMin);
      const items: SequenceItem[] = [];

      if (showFreeGaps) {
        const dayStart = 0;
        const dayEnd = 1440;
        let cursor = dayStart;

        for (const ev of sorted) {
          if (ev.startMin > cursor + 14) {
            items.push({
              kind: 'gap',
              startMin: cursor,
              endMin: Math.min(ev.startMin, dayEnd),
            });
          }
          items.push({kind: 'event', event: ev});
          cursor = Math.max(cursor, ev.endMin);
        }

        if (dayEnd - cursor >= 15) {
          items.push({kind: 'gap', startMin: cursor, endMin: dayEnd});
        }
      } else {
        for (const ev of sorted) {
          items.push({kind: 'event', event: ev});
        }
      }

      const activeCount = sorted.length;
      const totalPlannedMin = sorted.reduce((acc, ev) => acc + (ev.endMin - ev.startMin), 0);

      return {
        date: dateStr,
        items,
        activeCount,
        totalPlannedMin,
      };
    });
  }, [windowDates, events, showFreeGaps]);

  const totalEventsInWindow = daySequences.reduce((acc, d) => acc + d.activeCount, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/40 dark:bg-slate-900/50 relative">
      {/* Sub-toolbar for Sequence Options */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFreeGaps}
              onChange={(e) => setShowFreeGaps(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-[#1A73E8] focus:ring-[#1A73E8]"
            />
            <span>Afficher les plages libres disponibles</span>
          </label>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {totalEventsInWindow} activité{totalEventsInWindow > 1 ? 's' : ''} sur {AGENDA_DAYS_WINDOW} jours
        </span>
      </div>

      {/* Sequence List */}
      <div
        ref={scrollRef}
        onTouchStart={swipeHandlers.onTouchStart}
        onTouchMove={swipeHandlers.onTouchMove}
        onTouchEnd={swipeHandlers.onTouchEnd}
        onTouchCancel={swipeHandlers.onTouchCancel}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none calendar-scroll touch-pan-y pb-20 md:pb-0"
      >
        <div
          className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6 transition-transform duration-100 ease-out"
          style={
            swipeOffsetX !== 0
              ? {transform: `translate3d(${swipeOffsetX}px, 0, 0)`}
              : undefined
          }
        >
          {totalEventsInWindow === 0 && !showFreeGaps ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Aucune activité planifiée sur cette période de 14 jours.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onSlotClick(selectedDate, 9 * 60, 10 * 60)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un événement
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Générer un planning
                </button>
              </div>
            </div>
          ) : (
            daySequences.map(({date, items, activeCount, totalPlannedMin}) => {
              const dt = parseISO(date);
              const isToday = date === todayISO;
              const isSelected = date === selectedDate;
              const monthShort = MONTHS_SHORT[dt.getMonth()];

              return (
                <section
                  key={date}
                  className="flex flex-col sm:flex-row gap-3 sm:gap-6 border-b border-slate-200 dark:border-slate-800 pb-6 last:border-b-0"
                >
                  {/* Day Header Column */}
                  <div className="sm:w-40 shrink-0 flex sm:flex-col items-baseline sm:items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDate(date)}
                      className="flex items-center gap-2.5 text-left group cursor-pointer"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums shrink-0 ${
                          isToday
                            ? 'bg-[#1A73E8] text-white'
                            : isSelected
                            ? 'bg-blue-100 dark:bg-blue-950 text-[#174EA6] dark:text-blue-300'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 group-hover:bg-slate-100 dark:group-hover:bg-slate-800'
                        }`}
                      >
                        {getDayNumber(date)}
                      </span>
                      <div>
                        <div
                          className={`text-sm font-semibold ${
                            isToday ? 'text-[#1A73E8] dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {getWeekdayLong(date)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {monthShort} {dt.getFullYear()}
                        </div>
                      </div>
                    </button>

                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums sm:pl-11">
                      {activeCount > 0 ? (
                        <span>
                          {activeCount} activité{activeCount > 1 ? 's' : ''}
                          {totalPlannedMin > 0 ? ` · ${formatDuration(totalPlannedMin)}` : ''}
                        </span>
                      ) : (
                        <span>Journée libre</span>
                      )}
                    </div>
                  </div>

                  {/* Chronological Sequence of Slots */}
                  <div className="flex-1 space-y-2">
                    {items.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => onSlotClick(date, 9 * 60, 10 * 60)}
                        className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left text-xs text-slate-500 dark:text-slate-400 hover:border-[#1A73E8] hover:text-[#1A73E8] dark:hover:text-blue-400 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>Aucun événement ce jour</span>
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Plus className="w-3.5 h-3.5" />
                          Planifier
                        </span>
                      </button>
                    ) : (
                      items.map((item, idx) => {
                        if (item.kind === 'gap') {
                          const gapLen = item.endMin - item.startMin;
                          if (gapLen <= 0) return null;
                          return (
                            <button
                              key={`gap-${date}-${idx}`}
                              type="button"
                              onClick={() =>
                                onSlotClick(
                                  date,
                                  item.startMin,
                                  Math.min(item.endMin, item.startMin + 60)
                                )
                              }
                              className="w-full rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-transparent px-3.5 py-2 text-left text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 w-24 shrink-0">
                                  {minToTime(item.startMin)} – {minToTime(item.endMin)}
                                </span>
                                <span className="truncate">
                                  Plage libre · {formatDuration(gapLen)}
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1A73E8] dark:text-blue-400 shrink-0">
                                <Plus className="w-3 h-3" />
                                Insérer
                              </span>
                            </button>
                          );
                        }

                        const ev = item.event;
                        const style = resolveEventStyle(ev, tags);
                        const tagInfo = resolveTagInfo(ev.tagId, ev.category, tags);
                        const dur = ev.endMin - ev.startMin;
                        const isActivePress = activePressId === ev.id;

                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onPointerDown={(e) => handleEventPointerDown(e, ev)}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => e.preventDefault()}
                            title="Appuyez pour voir le détail"
                            className={`w-full rounded-lg border px-4 py-3 text-left transition-all flex items-start justify-between gap-4 select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A73E8] ${style.bg} ${style.border} ${style.text} ${
                              isActivePress ? 'ring-2 ring-[#1A73E8] shadow-md scale-[0.99]' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-sm mt-1.5 shrink-0 ${style.swatch}`} />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold truncate">
                                    {ev.title}
                                  </span>
                                </div>
                                <div className={`flex flex-wrap items-center gap-1.5 text-xs ${style.subtext}`}>
                                  <span>{tagInfo.name}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{IMPORTANCE_META[ev.importance].shortLabel}</span>
                                  {ev.notes && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="truncate max-w-md opacity-85">{ev.notes}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-mono tabular-nums text-xs font-semibold">
                                {minToTime(ev.startMin)} – {minToTime(ev.endMin)}
                              </div>
                              <div className={`font-mono tabular-nums text-[11px] ${style.subtext}`}>
                                {formatDuration(dur)}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
