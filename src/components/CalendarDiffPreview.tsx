import React, {useMemo, useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {
  CalendarEvent,
  ReorganizationChange,
  TagDefinition,
} from '../types/planner';
import {
  formatDateShortFr,
  formatWeekRangeFr,
  getDayNumber,
  getMondayOfWeek,
  getWeekDates,
  getWeekdayShort,
  minToTime,
} from '../utils/dateUtils';
import {resolveEventStyle} from '../utils/eventStyles';

interface CalendarDiffPreviewProps {
  beforeEvents: CalendarEvent[];
  afterEvents: CalendarEvent[];
  changes: ReorganizationChange[];
  unresolvedConflicts: CalendarEvent[];
  tags: TagDefinition[];
  focusDate: string;
  highlightAfterIds?: string[];
  highlightNewRoutine?: boolean;
}

const PREVIEW_HOUR_HEIGHT = 20;

interface PositionedBlock {
  event: CalendarEvent;
  colIndex: number;
  colCount: number;
}

function layoutDayBlocks(dayEvents: CalendarEvent[]): PositionedBlock[] {
  if (dayEvents.length === 0) return [];
  const sorted = [...dayEvents].sort((a, b) =>
    a.startMin !== b.startMin ? a.startMin - b.startMin : a.endMin - b.endMin
  );

  const clusters: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [];
  let clusterEnd = -1;

  for (const ev of sorted) {
    if (current.length === 0 || ev.startMin < clusterEnd) {
      current.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    } else {
      clusters.push(current);
      current = [ev];
      clusterEnd = ev.endMin;
    }
  }
  if (current.length > 0) clusters.push(current);

  const out: PositionedBlock[] = [];
  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const placed: Array<{ev: CalendarEvent; col: number}> = [];
    for (const ev of cluster) {
      let col = colEnds.findIndex((end) => end <= ev.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.endMin);
      } else {
        colEnds[col] = ev.endMin;
      }
      placed.push({ev, col});
    }
    const colCount = colEnds.length;
    for (const p of placed) {
      out.push({event: p.ev, colIndex: p.col, colCount});
    }
  }
  return out;
}

export const CalendarDiffPreview: React.FC<CalendarDiffPreviewProps> = ({
  beforeEvents,
  afterEvents,
  changes,
  unresolvedConflicts,
  tags,
  focusDate,
  highlightAfterIds = [],
  highlightNewRoutine = false,
}) => {
  const highlightSet = useMemo(() => new Set(highlightAfterIds), [highlightAfterIds]);
  const changedIds = useMemo(() => new Set(changes.map((c) => c.eventId)), [changes]);
  const deletedIds = useMemo(
    () => new Set(changes.filter((c) => c.type === 'deleted').map((c) => c.eventId)),
    [changes]
  );
  const conflictIds = useMemo(
    () => new Set(unresolvedConflicts.map((c) => c.id)),
    [unresolvedConflicts]
  );

  const impactedDates = useMemo(() => {
    const set = new Set<string>([focusDate]);
    for (const ch of changes) {
      set.add(ch.before.date);
      if (ch.after) set.add(ch.after.date);
    }
    for (const c of unresolvedConflicts) set.add(c.date);
    for (const ev of afterEvents) {
      if (highlightSet.has(ev.id)) set.add(ev.date);
    }
    return set;
  }, [afterEvents, changes, focusDate, highlightSet, unresolvedConflicts]);

  const impactedWeeks = useMemo(() => {
    const weekMap = new Map<string, number>();
    for (const d of impactedDates) {
      const monday = getMondayOfWeek(d);
      if (!weekMap.has(monday)) weekMap.set(monday, 0);
    }
    for (const ch of changes) {
      const m1 = getMondayOfWeek(ch.before.date);
      weekMap.set(m1, (weekMap.get(m1) ?? 0) + 1);
      if (ch.after) {
        const m2 = getMondayOfWeek(ch.after.date);
        if (m2 !== m1) weekMap.set(m2, (weekMap.get(m2) ?? 0) + 1);
      }
    }
    for (const c of unresolvedConflicts) {
      const m = getMondayOfWeek(c.date);
      weekMap.set(m, (weekMap.get(m) ?? 0) + 1);
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, count]) => ({
        monday,
        dates: getWeekDates(monday),
        changeCount: count,
      }));
  }, [changes, impactedDates, unresolvedConflicts]);

  const defaultMonday = getMondayOfWeek(focusDate);
  const [selectedMonday, setSelectedMonday] = useState<string>(() =>
    impactedWeeks.some((w) => w.monday === defaultMonday)
      ? defaultMonday
      : (impactedWeeks[0]?.monday ?? defaultMonday)
  );

  const activeWeekDates = useMemo(() => getWeekDates(selectedMonday), [selectedMonday]);
  const activeWeekSet = useMemo(() => new Set(activeWeekDates), [activeWeekDates]);

  const {minHour, maxHour} = useMemo(() => {
    let earliest = 7 * 60;
    let latest = 22 * 60;
    const scan = (list: CalendarEvent[]) => {
      for (const ev of list) {
        if (!activeWeekSet.has(ev.date)) continue;
        if (ev.startMin < earliest) earliest = ev.startMin;
        if (ev.endMin > latest) latest = ev.endMin;
      }
    };
    scan(beforeEvents);
    scan(afterEvents);
    return {
      minHour: Math.max(0, Math.floor(earliest / 60)),
      maxHour: Math.min(24, Math.ceil(latest / 60)),
    };
  }, [activeWeekSet, afterEvents, beforeEvents]);

  const hours = useMemo(
    () => Array.from({length: Math.max(1, maxHour - minHour)}, (_, i) => minHour + i),
    [maxHour, minHour]
  );
  const gridHeight = hours.length * PREVIEW_HOUR_HEIGHT;
  const minBoundMin = minHour * 60;

  const renderWeekPanel = (mode: 'before' | 'after', list: CalendarEvent[]) => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const d of activeWeekDates) byDate.set(d, []);
    for (const ev of list) {
      const bucket = byDate.get(ev.date);
      if (bucket) bucket.push(ev);
    }

    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden flex flex-col">
        {/* Panel Title */}
        <div
          className={`px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 ${
            mode === 'after'
              ? 'bg-blue-50/70 dark:bg-blue-950/40'
              : 'bg-slate-50/80 dark:bg-slate-900/70'
          }`}
        >
          <span
            className={`text-xs font-semibold ${
              mode === 'after'
                ? 'text-[#174EA6] dark:text-blue-300'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {mode === 'before' ? 'Avant' : 'Après'}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
            {formatWeekRangeFr(activeWeekDates)}
          </span>
        </div>

        {/* 7-day header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="w-9 shrink-0 border-r border-slate-200 dark:border-slate-800" />
          <div className="flex-1 grid grid-cols-7 min-w-0">
            {activeWeekDates.map((d) => {
              const hasImpact = impactedDates.has(d);
              return (
                <div
                  key={d}
                  className={`py-1 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 ${
                    hasImpact ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-none">
                    {getWeekdayShort(d).slice(0, 2)}
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] font-mono tabular-nums leading-none ${
                      hasImpact
                        ? 'font-bold text-[#1A73E8] dark:text-blue-400'
                        : 'font-medium text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {getDayNumber(d)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="flex relative overflow-hidden" style={{height: gridHeight}}>
          {/* Time axis */}
          <div className="w-9 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 relative select-none">
            {hours.map((h, idx) => (
              <div
                key={h}
                style={{height: PREVIEW_HOUR_HEIGHT}}
                className="relative"
              >
                {idx > 0 && h % 2 === 0 && (
                  <span className="absolute -top-1.5 right-1 font-mono tabular-nums text-[9px] text-slate-400 dark:text-slate-500">
                    {String(h).padStart(2, '0')}h
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 7 Columns */}
          <div className="flex-1 grid grid-cols-7 min-w-0 relative">
            <div className="pointer-events-none absolute inset-0">
              {hours.map((h) => (
                <div
                  key={h}
                  style={{height: PREVIEW_HOUR_HEIGHT}}
                  className="border-b border-slate-100 dark:border-slate-800/70"
                />
              ))}
            </div>

            {activeWeekDates.map((d) => {
              const blocks = layoutDayBlocks(byDate.get(d) ?? []);
              return (
                <div
                  key={d}
                  className="relative min-w-0 border-r border-slate-200 dark:border-slate-800 last:border-r-0"
                >
                  {blocks.map(({event, colIndex, colCount}) => {
                    const style = resolveEventStyle(event, tags);
                    const topPx = ((event.startMin - minBoundMin) / 60) * PREVIEW_HOUR_HEIGHT;
                    const heightPx = Math.max(
                      12,
                      ((event.endMin - event.startMin) / 60) * PREVIEW_HOUR_HEIGHT - 1
                    );
                    const widthPct = 100 / colCount;
                    const leftPct = colIndex * widthPct;

                    const isConflict =
                      conflictIds.has(event.id) ||
                      (mode === 'after' &&
                        unresolvedConflicts.length > 0 &&
                        highlightSet.has(event.id));
                    const isDeletedBefore = mode === 'before' && deletedIds.has(event.id);
                    const isChanged = changedIds.has(event.id) && !isDeletedBefore;
                    const isAddedAfter =
                      mode === 'after' &&
                      (highlightSet.has(event.id) ||
                        (highlightNewRoutine && event.source === 'routine'));
                    const isReplacedRoutineBefore =
                      mode === 'before' && highlightNewRoutine && event.source === 'routine';

                    let accentClass = '';
                    if (isConflict) {
                      accentClass = 'ring-2 ring-rose-500 z-20';
                    } else if (isDeletedBefore) {
                      accentClass = 'border-rose-500 border-dashed opacity-70 line-through z-10';
                    } else if (isAddedAfter) {
                      accentClass = 'ring-2 ring-[#1A73E8] z-20';
                    } else if (isChanged) {
                      accentClass = 'ring-2 ring-amber-500 z-20';
                    } else if (isReplacedRoutineBefore) {
                      accentClass = 'opacity-55 border-dashed';
                    }

                    return (
                      <div
                        key={event.id}
                        title={`${formatDateShortFr(event.date)} · ${minToTime(event.startMin)}–${minToTime(event.endMin)} · ${event.title}`}
                        style={{
                          top: topPx + 0.5,
                          height: heightPx,
                          left: `calc(${leftPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                        className={`absolute rounded-xs border px-0.5 overflow-hidden text-[9px] leading-tight ${style.bg} ${style.border} ${style.text} ${accentClass}`}
                      >
                        <div className="truncate font-medium">{event.title}</div>
                        {heightPx >= 22 && (
                          <div className="truncate font-mono tabular-nums text-[8px] opacity-75">
                            {minToTime(event.startMin)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header + Multi-week switcher if needed */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Vue globale du calendrier — Avant / Après
        </div>

        {impactedWeeks.length > 1 && (
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {impactedWeeks.map((w) => {
              const active = w.monday === selectedMonday;
              return (
                <button
                  key={w.monday}
                  type="button"
                  onClick={() => setSelectedMonday(w.monday)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Sem. {formatDateShortFr(w.monday)}
                  {w.changeCount > 0 ? ` (${w.changeCount})` : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Side-by-side Global Calendar Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {renderWeekPanel('before', beforeEvents)}
        {renderWeekPanel('after', afterEvents)}
      </div>

      {/* Unboxed Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs border-2 border-[#1A73E8] shrink-0" />
          <span>Ajoutée / Routine</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs border-2 border-amber-500 shrink-0" />
          <span>Déplacée / Réduite</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs border-2 border-rose-500 shrink-0" />
          <span>Supprimée / Conflit non résolu</span>
        </span>
      </div>

      {/* Detailed line-by-line summary */}
      {changes.length > 0 && (
        <div className="space-y-2 pt-1">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Récapitulatif des ajustements ({changes.length})
          </h3>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 max-h-44 overflow-y-auto">
            {changes.map((ch, idx) => {
              const actionLabel =
                ch.type === 'shifted'
                  ? 'Déplacée'
                  : ch.type === 'reduced'
                  ? 'Réduite'
                  : ch.type === 'deleted'
                  ? 'Supprimée'
                  : 'Ajustée';
              const actionColor =
                ch.type === 'deleted'
                  ? 'text-rose-700 dark:text-rose-400'
                  : ch.type === 'reduced'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#1A73E8] dark:text-blue-400';

              return (
                <div key={`${ch.eventId}-${idx}`} className="px-3 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {ch.title}
                    </span>
                    <span className={`text-[11px] font-semibold shrink-0 ${actionColor}`}>
                      {actionLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                    <span>
                      {formatDateShortFr(ch.before.date)} {minToTime(ch.before.startMin)}–
                      {minToTime(ch.before.endMin)}
                    </span>
                    {ch.after ? (
                      <>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {ch.after.date !== ch.before.date
                            ? `${formatDateShortFr(ch.after.date)} `
                            : ''}
                          {minToTime(ch.after.startMin)}–{minToTime(ch.after.endMin)}
                        </span>
                      </>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-400 font-sans">
                        · Retirée du planning
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{ch.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
