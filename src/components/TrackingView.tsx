import React, {useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Target} from 'lucide-react';
import {
  ActivityDefinition,
  CalendarEvent,
  GoalMetric,
  TagDefinition,
  TrackingGoal,
} from '../types/planner';
import {
  addDays,
  addMonths,
  formatDateRangeShortFr,
  formatDateShortFr,
  formatDuration,
  formatMonthYear,
  formatWeekRangeFr,
  getDayNumber,
  getTodayISO,
  getWeekDates,
  getWeekdayShort,
  parseISO,
  toISO,
} from '../utils/dateUtils';
import {hexToRgba, resolveTagInfo} from '../utils/eventStyles';

interface TrackingViewProps {
  selectedDate: string;
  events: CalendarEvent[];
  tags: TagDefinition[];
  activities: ActivityDefinition[];
}

type TrackingScope = 'day' | 'week' | 'month';
type ChartMode = 'both' | 'pie' | 'curve';
type MonthCurveBucket = 'day' | 'week';

interface TagSummary {
  tagId: string;
  name: string;
  color: string;
  totalMinutes: number;
  sessions: number;
  percentage: number;
}

interface CurveBucket {
  key: string;
  label: string;
  fullLabel: string;
  valuesByTarget: Record<string, number>;
}

function getMonthDates(anchorDateStr: string): string[] {
  const dt = parseISO(anchorDateStr);
  const year = dt.getFullYear();
  const month = dt.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({length: daysInMonth}, (_, i) =>
    toISO(new Date(year, month, i + 1, 12, 0, 0, 0))
  );
}

function getScopeDates(scope: TrackingScope, anchorDate: string): string[] {
  if (scope === 'day') return [anchorDate];
  if (scope === 'week') return getWeekDates(anchorDate);
  return getMonthDates(anchorDate);
}

function getScopeLabel(scope: TrackingScope, anchorDate: string, dates: string[]): string {
  if (scope === 'day') return formatDateShortFr(anchorDate);
  if (scope === 'week') return formatWeekRangeFr(dates);
  return formatMonthYear(anchorDate);
}

function stepAnchorDate(scope: TrackingScope, anchorDate: string, dir: -1 | 1): string {
  if (scope === 'day') return addDays(anchorDate, dir);
  if (scope === 'week') return addDays(anchorDate, dir * 7);
  return addMonths(anchorDate, dir);
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describePieSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = endAngle - startAngle >= 359.99 ? startAngle + 359.99 : endAngle;
  const p1 = polarToCartesian(cx, cy, rOuter, clampedEnd);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle);
  const p4 = polarToCartesian(cx, cy, rInner, clampedEnd);
  const largeArc = clampedEnd - startAngle <= 180 ? '0' : '1';
  return [
    'M', p1.x, p1.y,
    'A', rOuter, rOuter, 0, largeArc, 0, p2.x, p2.y,
    'L', p3.x, p3.y,
    'A', rInner, rInner, 0, largeArc, 1, p4.x, p4.y,
    'Z',
  ].join(' ');
}

function useChartDragNavigation(onPrev: () => void, onNext: () => void) {
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const sessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    axis: 'none' | 'horizontal' | 'vertical';
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      axis: 'none',
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sessionRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (s.axis === 'none') {
      if (Math.hypot(dx, dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'horizontal' : 'vertical';
    }

    if (s.axis === 'horizontal') {
      const clamped = Math.max(-36, Math.min(36, dx * 0.25));
      setDragOffsetX(clamped);
    }
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sessionRef.current;
    sessionRef.current = null;
    setDragOffsetX(0);
    if (!s || s.pointerId !== e.pointerId || s.axis === 'vertical') return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.abs(dx) < 42) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.15) return;
    if (dx > 0) onPrev();
    else onNext();
  };

  const onPointerCancel = () => {
    sessionRef.current = null;
    setDragOffsetX(0);
  };

  return {
    dragOffsetX,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel,
    },
  };
}

function ScopeBoundsBar({
  scope,
  onChangeScope,
  label,
  onToday,
  onPrev,
  onNext,
  ariaPrefix,
}: {
  scope: TrackingScope;
  onChangeScope: (next: TrackingScope) => void;
  label: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  ariaPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Aujourd’hui
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label={`${ariaPrefix} : période précédente`}
          className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={`${ariaPrefix} : période suivante`}
          className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="ml-1 font-display text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
          {label}
        </span>
      </div>

      <div
        role="group"
        aria-label={`Bornes de ${ariaPrefix}`}
        className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0"
      >
        {(
          [
            {id: 'day', label: 'Jour'},
            {id: 'week', label: 'Semaine'},
            {id: 'month', label: 'Mois'},
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChangeScope(item.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              scope === item.id
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const TrackingView: React.FC<TrackingViewProps> = ({
  selectedDate,
  events,
  tags,
  activities,
}) => {
  const todayISO = getTodayISO();
  const [chartMode, setChartMode] = useState<ChartMode>('both');

  // Independent bounds & period navigation for Camembert
  const [pieScope, setPieScope] = useState<TrackingScope>('week');
  const [pieAnchorDate, setPieAnchorDate] = useState<string>(selectedDate);
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);

  // Independent bounds & period navigation for Courbe
  const [curveScope, setCurveScope] = useState<TrackingScope>('week');
  const [curveAnchorDate, setCurveAnchorDate] = useState<string>(selectedDate);
  const defaultFocusTarget = useMemo(() => {
    const tagWithGoal = tags.find((t) => t.goal?.enabled);
    return tagWithGoal ? `tag:${tagWithGoal.id}` : 'all';
  }, [tags]);
  const [curveTarget, setCurveTarget] = useState<string>(defaultFocusTarget);
  const [curveMetricOverride, setCurveMetricOverride] = useState<GoalMetric | null>(null);
  const [monthBucket, setMonthBucket] = useState<MonthCurveBucket>('day');
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);

  // Swipe / Drag navigation handlers for each chart
  const pieDrag = useChartDragNavigation(
    () => setPieAnchorDate((d) => stepAnchorDate(pieScope, d, -1)),
    () => setPieAnchorDate((d) => stepAnchorDate(pieScope, d, 1))
  );

  const curveDrag = useChartDragNavigation(
    () => setCurveAnchorDate((d) => stepAnchorDate(curveScope, d, -1)),
    () => setCurveAnchorDate((d) => stepAnchorDate(curveScope, d, 1))
  );

  // --- Camembert Calculations ---
  const pieDates = useMemo(() => getScopeDates(pieScope, pieAnchorDate), [pieScope, pieAnchorDate]);
  const pieLabel = useMemo(
    () => getScopeLabel(pieScope, pieAnchorDate, pieDates),
    [pieScope, pieAnchorDate, pieDates]
  );

  const pieData = useMemo(() => {
    const dateSet = new Set(pieDates);
    const map = new Map<string, TagSummary>();
    let grandTotalMin = 0;

    for (const ev of events) {
      if (!dateSet.has(ev.date)) continue;
      const dur = Math.max(0, ev.endMin - ev.startMin);
      if (dur === 0) continue;
      grandTotalMin += dur;
      const info = resolveTagInfo(ev.tagId, ev.category, tags);
      const key = ev.tagId || 'untagged';
      const existing = map.get(key);
      if (existing) {
        existing.totalMinutes += dur;
        existing.sessions += 1;
      } else {
        map.set(key, {
          tagId: key,
          name: info.name,
          color: info.color,
          totalMinutes: dur,
          sessions: 1,
          percentage: 0,
        });
      }
    }

    const items = Array.from(map.values())
      .map((item) => ({
        ...item,
        percentage: grandTotalMin > 0 ? (item.totalMinutes / grandTotalMin) * 100 : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    return {items, grandTotalMin};
  }, [events, pieDates, tags]);

  const hoveredSlice = pieData.items.find((i) => i.tagId === hoveredSliceId) ?? null;

  // --- Courbe Calculations ---
  const curveDates = useMemo(
    () => getScopeDates(curveScope, curveAnchorDate),
    [curveScope, curveAnchorDate]
  );
  const curveLabel = useMemo(
    () => getScopeLabel(curveScope, curveAnchorDate, curveDates),
    [curveScope, curveAnchorDate, curveDates]
  );

  const curveEvents = useMemo(() => {
    const dateSet = new Set(curveDates);
    return events.filter((ev) => dateSet.has(ev.date));
  }, [events, curveDates]);

  const hasUntaggedInCurve = useMemo(
    () => curveEvents.some((ev) => !ev.tagId),
    [curveEvents]
  );

  const focusedGoalInfo = useMemo<{
    goal?: TrackingGoal;
    label: string;
    color: string;
  }>(() => {
    if (curveTarget === 'untagged') {
      return {label: 'Activités sans tag', color: '#94A3B8'};
    }
    if (curveTarget.startsWith('tag:')) {
      const id = curveTarget.slice(4);
      const t = tags.find((x) => x.id === id);
      return {
        goal: t?.goal?.enabled ? t.goal : undefined,
        label: t?.name ?? 'Tag',
        color: t?.color ?? '#1A73E8',
      };
    }
    if (curveTarget.startsWith('act:')) {
      const id = curveTarget.slice(4);
      const a = activities.find((x) => x.id === id);
      const t = tags.find((x) => x.id === a?.tagId);
      return {
        goal: a?.goal?.enabled ? a.goal : undefined,
        label: a?.title ?? 'Activité',
        color: t?.color ?? '#1A73E8',
      };
    }
    return {label: 'Tous les tags', color: '#1A73E8'};
  }, [curveTarget, tags, activities]);

  const activeMetric: GoalMetric =
    curveMetricOverride ?? focusedGoalInfo.goal?.metric ?? 'duration';

  const effectiveMonthBucket: MonthCurveBucket =
    curveScope === 'month' && focusedGoalInfo.goal?.period === 'week'
      ? 'week'
      : monthBucket;

  const curveSeries = useMemo(() => {
    if (curveTarget === 'untagged') {
      return [{id: 'untagged', name: 'Sans tag', color: '#94A3B8', kind: 'untagged' as const}];
    }
    if (curveTarget.startsWith('tag:')) {
      const id = curveTarget.slice(4);
      const t = tags.find((x) => x.id === id);
      if (t) return [{id: t.id, name: t.name, color: t.color, kind: 'tag' as const}];
    }
    if (curveTarget.startsWith('act:')) {
      const id = curveTarget.slice(4);
      const a = activities.find((x) => x.id === id);
      const t = tags.find((x) => x.id === a?.tagId);
      if (a) {
        return [{id: a.id, name: a.title, color: t?.color ?? '#1A73E8', kind: 'act' as const}];
      }
    }

    const activeTagIds = new Set(curveEvents.map((e) => e.tagId).filter(Boolean));
    const list: Array<{
      id: string;
      name: string;
      color: string;
      kind: 'tag' | 'act' | 'untagged';
    }> = tags
      .filter((t) => activeTagIds.has(t.id) || curveEvents.length === 0)
      .map((t) => ({id: t.id, name: t.name, color: t.color, kind: 'tag' as const}));

    if (hasUntaggedInCurve) {
      list.push({id: 'untagged', name: 'Sans tag', color: '#94A3B8', kind: 'untagged'});
    }
    return list;
  }, [curveTarget, tags, activities, curveEvents, hasUntaggedInCurve]);

  const curveData = useMemo(() => {
    const buckets: CurveBucket[] = [];

    const matchEvent = (
      ev: CalendarEvent,
      s: {id: string; kind: 'tag' | 'act' | 'untagged'}
    ) => {
      if (s.kind === 'untagged') return !ev.tagId;
      if (s.kind === 'tag') return ev.tagId === s.id;
      return ev.activityId === s.id;
    };

    if (curveScope === 'day') {
      const dayEvs = curveEvents;
      for (let h = 2; h <= 24; h += 2) {
        const cutoffMin = h * 60;
        const valuesByTarget: Record<string, number> = {};
        for (const s of curveSeries) {
          let total = 0;
          for (const ev of dayEvs) {
            if (!matchEvent(ev, s)) continue;
            if (activeMetric === 'duration') {
              const overlap = Math.max(0, Math.min(ev.endMin, cutoffMin) - ev.startMin);
              total += overlap / 60;
            } else {
              if (ev.startMin < cutoffMin) total += 1;
            }
          }
          valuesByTarget[s.id] = Number(total.toFixed(2));
        }
        buckets.push({
          key: `h-${h}`,
          label: `${String(h).padStart(2, '0')}h`,
          fullLabel: `${formatDateShortFr(curveAnchorDate)} à ${String(h).padStart(2, '0')}:00`,
          valuesByTarget,
        });
      }
    } else if (curveScope === 'month' && effectiveMonthBucket === 'week') {
      for (let i = 0; i < curveDates.length; i += 7) {
        const chunk = curveDates.slice(i, i + 7);
        const chunkSet = new Set(chunk);
        const valuesByTarget: Record<string, number> = {};
        for (const s of curveSeries) {
          let total = 0;
          for (const ev of curveEvents) {
            if (!chunkSet.has(ev.date) || !matchEvent(ev, s)) continue;
            total += activeMetric === 'duration' ? (ev.endMin - ev.startMin) / 60 : 1;
          }
          valuesByTarget[s.id] = Number(total.toFixed(2));
        }
        buckets.push({
          key: `w-${i}`,
          label: `S${Math.floor(i / 7) + 1}`,
          fullLabel: formatDateRangeShortFr(chunk[0], chunk[chunk.length - 1]),
          valuesByTarget,
        });
      }
    } else {
      for (const dateStr of curveDates) {
        const valuesByTarget: Record<string, number> = {};
        for (const s of curveSeries) {
          let total = 0;
          for (const ev of curveEvents) {
            if (ev.date !== dateStr || !matchEvent(ev, s)) continue;
            total += activeMetric === 'duration' ? (ev.endMin - ev.startMin) / 60 : 1;
          }
          valuesByTarget[s.id] = Number(total.toFixed(2));
        }
        buckets.push({
          key: dateStr,
          label:
            curveScope === 'week'
              ? `${getWeekdayShort(dateStr)} ${getDayNumber(dateStr)}`
              : String(getDayNumber(dateStr)),
          fullLabel: formatDateShortFr(dateStr),
          valuesByTarget,
        });
      }
    }

    let maxVal = 0;
    for (const b of buckets) {
      for (const s of curveSeries) {
        maxVal = Math.max(maxVal, b.valuesByTarget[s.id] ?? 0);
      }
    }

    const goal = focusedGoalInfo.goal;
    const goalAppliesToScale =
      goal &&
      goal.metric === activeMetric &&
      ((curveScope === 'day' && goal.period === 'day') ||
        (curveScope === 'week' && goal.period === 'day') ||
        (curveScope === 'month' && effectiveMonthBucket === goal.period));

    const minThreshold = goalAppliesToScale ? goal?.minTarget : undefined;
    const maxThreshold = goalAppliesToScale ? goal?.maxTarget : undefined;

    const rawTop = Math.max(
      maxVal * 1.15,
      (maxThreshold ?? 0) * 1.25,
      (minThreshold ?? 0) * 1.35,
      activeMetric === 'duration' ? 4 : 2
    );
    const yMax = Math.ceil(rawTop);

    return {
      buckets,
      yMax,
      minThreshold,
      maxThreshold,
    };
  }, [
    curveScope,
    curveAnchorDate,
    curveDates,
    curveEvents,
    curveSeries,
    activeMetric,
    effectiveMonthBucket,
    focusedGoalInfo.goal,
  ]);

  const focusedPeriodStats = useMemo(() => {
    if (curveSeries.length !== 1) return null;
    const s = curveSeries[0];
    let totalHours = 0;
    let totalSessions = 0;
    const activeDays = new Set<string>();
    for (const ev of curveEvents) {
      const match =
        s.kind === 'untagged'
          ? !ev.tagId
          : s.kind === 'tag'
          ? ev.tagId === s.id
          : ev.activityId === s.id;
      if (!match) continue;
      totalHours += (ev.endMin - ev.startMin) / 60;
      totalSessions += 1;
      activeDays.add(ev.date);
    }
    const dayCount = Math.max(1, activeDays.size || curveDates.length);
    const avgPerDayMin = Math.round((totalHours * 60) / dayCount);
    return {
      totalHours: Number(totalHours.toFixed(1)),
      totalSessions,
      avgPerDayMin,
      goal: focusedGoalInfo.goal,
    };
  }, [focusedGoalInfo.goal, curveSeries, curveEvents, curveDates.length]);

  // SVG Chart Geometry (responsive without horizontal scroll trap so swipe works everywhere)
  const SVG_W = 600;
  const SVG_H = 240;
  const PAD_L = 42;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 30;
  const plotW = SVG_W - PAD_L - PAD_R;
  const plotH = SVG_H - PAD_T - PAD_B;

  const yToPx = (val: number) =>
    PAD_T + plotH - (Math.min(curveData.yMax, Math.max(0, val)) / curveData.yMax) * plotH;

  const xToPx = (idx: number, total: number) => {
    if (total <= 1) return PAD_L + plotW / 2;
    return PAD_L + (idx / (total - 1)) * plotW;
  };

  return (
    <div className="flex-1 overflow-y-auto calendar-scroll bg-slate-50/60 dark:bg-slate-950 pb-20 md:pb-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Header & Chart View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Suivi & Statistiques
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Choisissez les bornes (jour, semaine, mois) sur chaque graphique et glissez horizontalement pour naviguer d’une période à l’autre.
            </p>
          </div>

          <div
            role="group"
            aria-label="Type de graphique"
            className="inline-flex items-center rounded-lg bg-slate-200/70 dark:bg-slate-900 p-1"
          >
            {(
              [
                {id: 'both', label: 'Combinée'},
                {id: 'pie', label: 'Camembert'},
                {id: 'curve', label: 'Courbe'},
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChartMode(item.id)}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartMode === item.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart 1: Camembert (Proportion par Tag) */}
        {(chartMode === 'both' || chartMode === 'pie') && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Camembert — Répartition par tag
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Proportion du temps planifié ({pieLabel}) · glissez horizontalement pour changer de période
                </p>
              </div>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                Total : {formatDuration(pieData.grandTotalMin)}
              </span>
            </div>

            <ScopeBoundsBar
              scope={pieScope}
              onChangeScope={setPieScope}
              label={pieLabel}
              onToday={() => setPieAnchorDate(todayISO)}
              onPrev={() => setPieAnchorDate((d) => stepAnchorDate(pieScope, d, -1))}
              onNext={() => setPieAnchorDate((d) => stepAnchorDate(pieScope, d, 1))}
              ariaPrefix="Camembert"
            />

            <div
              {...pieDrag.handlers}
              style={
                pieDrag.dragOffsetX !== 0
                  ? {transform: `translate3d(${pieDrag.dragOffsetX}px, 0, 0)`}
                  : undefined
              }
              className="touch-pan-y select-none transition-transform duration-100 ease-out cursor-grab active:cursor-grabbing"
            >
              {pieData.items.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Aucune activité enregistrée sur cette période.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  {/* SVG Pie / Donut */}
                  <div className="lg:col-span-5 flex justify-center">
                    <svg
                      viewBox="0 0 240 240"
                      className="w-56 h-56 sm:w-64 sm:h-64 overflow-visible"
                      role="img"
                      aria-label="Graphique en camembert des proportions par tag"
                    >
                      {(() => {
                        let angleCursor = 0;
                        return pieData.items.map((item) => {
                          const sweep = (item.percentage / 100) * 360;
                          const startA = angleCursor;
                          const endA = angleCursor + sweep;
                          angleCursor = endA;
                          const isHovered = hoveredSliceId === item.tagId;
                          return (
                            <path
                              key={item.tagId}
                              d={describePieSlice(120, 120, isHovered ? 108 : 102, 54, startA, endA)}
                              fill={item.color}
                              strokeWidth={2}
                              onMouseEnter={() => setHoveredSliceId(item.tagId)}
                              onMouseLeave={() => setHoveredSliceId(null)}
                              className="stroke-white dark:stroke-slate-900 transition-all duration-150 cursor-pointer"
                            />
                          );
                        });
                      })()}
                      <circle cx={120} cy={120} r={52} className="fill-white dark:fill-slate-900" />
                      <text
                        x={120}
                        y={114}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 text-[11px] font-medium"
                      >
                        {hoveredSlice ? hoveredSlice.name : 'Temps total'}
                      </text>
                      <text
                        x={120}
                        y={135}
                        textAnchor="middle"
                        className="fill-slate-900 dark:fill-slate-100 text-base font-bold font-mono tabular-nums"
                      >
                        {hoveredSlice
                          ? `${hoveredSlice.percentage.toFixed(1)}%`
                          : formatDuration(pieData.grandTotalMin)}
                      </text>
                    </svg>
                  </div>

                  {/* Breakdown Table */}
                  <div className="lg:col-span-7 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    {pieData.items.map((item) => {
                      const isHovered = hoveredSliceId === item.tagId;
                      return (
                        <div
                          key={item.tagId}
                          onMouseEnter={() => setHoveredSliceId(item.tagId)}
                          onMouseLeave={() => setHoveredSliceId(null)}
                          className={`px-4 py-2.5 flex items-center justify-between gap-4 transition-colors ${
                            isHovered ? 'bg-slate-50 dark:bg-slate-800/80' : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{backgroundColor: item.color}}
                            />
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {item.name}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                              {item.sessions} activité{item.sessions > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 font-mono tabular-nums text-xs">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatDuration(item.totalMinutes)}
                            </span>
                            <span className="w-14 text-right text-slate-600 dark:text-slate-400">
                              {item.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Chart 2: Courbe */}
        {(chartMode === 'both' || chartMode === 'curve') && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Courbe — Évolution & Objectifs (majorant / minorant)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Évolution par tag ou activité ({curveLabel}) · glissez horizontalement pour changer de période
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Tag ou activité observé"
                  value={curveTarget}
                  onChange={(e) => {
                    setCurveTarget(e.target.value);
                    setCurveMetricOverride(null);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value="all">Tous les tags</option>
                  {hasUntaggedInCurve && <option value="untagged">Activités sans tag</option>}
                  <optgroup label="Tags">
                    {tags.map((t) => (
                      <option key={t.id} value={`tag:${t.id}`}>
                        Tag : {t.name}
                        {t.goal?.enabled ? ' (objectif actif)' : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Activités">
                    {activities.map((a) => (
                      <option key={a.id} value={`act:${a.id}`}>
                        Activité : {a.title}
                        {a.goal?.enabled ? ' (objectif actif)' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>

                <select
                  aria-label="Métrique"
                  value={activeMetric}
                  onChange={(e) => setCurveMetricOverride(e.target.value as GoalMetric)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value="duration">Durée (heures)</option>
                  <option value="frequency">Fréquence (séances)</option>
                </select>

                {curveScope === 'month' && (
                  <select
                    aria-label="Regroupement mensuel"
                    value={effectiveMonthBucket}
                    onChange={(e) => setMonthBucket(e.target.value as MonthCurveBucket)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                  >
                    <option value="day">Par jour</option>
                    <option value="week">Par semaine</option>
                  </select>
                )}
              </div>
            </div>

            <ScopeBoundsBar
              scope={curveScope}
              onChangeScope={setCurveScope}
              label={curveLabel}
              onToday={() => setCurveAnchorDate(todayISO)}
              onPrev={() => setCurveAnchorDate((d) => stepAnchorDate(curveScope, d, -1))}
              onNext={() => setCurveAnchorDate((d) => stepAnchorDate(curveScope, d, 1))}
              ariaPrefix="Courbe"
            />

            {(focusedGoalInfo.goal || focusedPeriodStats) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#1A73E8] dark:text-blue-400 shrink-0" />
                  {focusedGoalInfo.goal ? (
                    <span>
                      Objectif de <strong>{focusedGoalInfo.label}</strong> :{' '}
                      {focusedGoalInfo.goal.minTarget !== undefined && (
                        <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                          Min {focusedGoalInfo.goal.minTarget}
                          {focusedGoalInfo.goal.metric === 'duration' ? 'h' : ' séance(s)'}
                        </span>
                      )}
                      {focusedGoalInfo.goal.minTarget !== undefined &&
                        focusedGoalInfo.goal.maxTarget !== undefined &&
                        ' · '}
                      {focusedGoalInfo.goal.maxTarget !== undefined && (
                        <span className="font-mono tabular-nums text-rose-700 dark:text-rose-400 font-semibold">
                          Max {focusedGoalInfo.goal.maxTarget}
                          {focusedGoalInfo.goal.metric === 'duration' ? 'h' : ' séance(s)'}
                        </span>
                      )}{' '}
                      ({focusedGoalInfo.goal.period === 'day' ? 'par jour' : 'par semaine'})
                    </span>
                  ) : (
                    <span>
                      Série observée : <strong>{focusedGoalInfo.label}</strong>
                    </span>
                  )}
                </div>

                {focusedPeriodStats && (
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    Moy. {formatDuration(focusedPeriodStats.avgPerDayMin)}/j · Total{' '}
                    {focusedPeriodStats.totalHours}h ({focusedPeriodStats.totalSessions} activité
                    {focusedPeriodStats.totalSessions > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            )}

            {/* SVG Line Chart with horizontal drag/swipe between bounds */}
            <div
              {...curveDrag.handlers}
              style={
                curveDrag.dragOffsetX !== 0
                  ? {transform: `translate3d(${curveDrag.dragOffsetX}px, 0, 0)`}
                  : undefined
              }
              className="relative touch-pan-y select-none transition-transform duration-100 ease-out cursor-grab active:cursor-grabbing"
            >
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="w-full h-auto select-none"
                role="img"
                aria-label="Graphique en courbe des durées et objectifs"
              >
                {Array.from({length: 5}, (_, i) => {
                  const val = (curveData.yMax / 4) * i;
                  const y = yToPx(val);
                  return (
                    <g key={i}>
                      <line
                        x1={PAD_L}
                        y1={y}
                        x2={SVG_W - PAD_R}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeWidth={1}
                      />
                      <text
                        x={PAD_L - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                      >
                        {activeMetric === 'duration'
                          ? `${Number(val.toFixed(1))}h`
                          : `${Math.round(val)}`}
                      </text>
                    </g>
                  );
                })}

                {curveData.minThreshold !== undefined && (
                  <g>
                    <rect
                      x={PAD_L}
                      y={yToPx(curveData.minThreshold)}
                      width={plotW}
                      height={Math.max(0, PAD_T + plotH - yToPx(curveData.minThreshold))}
                      fill="rgba(16, 185, 129, 0.13)"
                    />
                    <line
                      x1={PAD_L}
                      y1={yToPx(curveData.minThreshold)}
                      x2={SVG_W - PAD_R}
                      y2={yToPx(curveData.minThreshold)}
                      stroke="#059669"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      strokeOpacity={0.75}
                    />
                    <text
                      x={SVG_W - PAD_R - 4}
                      y={yToPx(curveData.minThreshold) - 5}
                      textAnchor="end"
                      className="fill-emerald-700 dark:fill-emerald-400 text-[10px] font-semibold font-mono tabular-nums"
                    >
                      Min {curveData.minThreshold}
                      {activeMetric === 'duration' ? 'h' : ''}
                    </text>
                  </g>
                )}

                {curveData.maxThreshold !== undefined && (
                  <g>
                    <rect
                      x={PAD_L}
                      y={PAD_T}
                      width={plotW}
                      height={Math.max(0, yToPx(curveData.maxThreshold) - PAD_T)}
                      fill="rgba(225, 29, 72, 0.12)"
                    />
                    <line
                      x1={PAD_L}
                      y1={yToPx(curveData.maxThreshold)}
                      x2={SVG_W - PAD_R}
                      y2={yToPx(curveData.maxThreshold)}
                      stroke="#E11D48"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      strokeOpacity={0.75}
                    />
                    <text
                      x={SVG_W - PAD_R - 4}
                      y={yToPx(curveData.maxThreshold) + 12}
                      textAnchor="end"
                      className="fill-rose-700 dark:fill-rose-400 text-[10px] font-semibold font-mono tabular-nums"
                    >
                      Max {curveData.maxThreshold}
                      {activeMetric === 'duration' ? 'h' : ''}
                    </text>
                  </g>
                )}

                {curveSeries.map((s) => {
                  const pts = curveData.buckets.map((b, idx) => ({
                    x: xToPx(idx, curveData.buckets.length),
                    y: yToPx(b.valuesByTarget[s.id] ?? 0),
                    val: b.valuesByTarget[s.id] ?? 0,
                  }));
                  const polylinePts = pts.map((p) => `${p.x},${p.y}`).join(' ');
                  const areaPath =
                    pts.length > 0 && curveSeries.length === 1
                      ? `M ${pts[0].x},${PAD_T + plotH} ${pts
                          .map((p) => `L ${p.x},${p.y}`)
                          .join(' ')} L ${pts[pts.length - 1].x},${PAD_T + plotH} Z`
                      : null;

                  return (
                    <g key={s.id}>
                      {areaPath && <path d={areaPath} fill={hexToRgba(s.color, 0.14)} />}
                      <polyline
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={polylinePts}
                      />
                      {pts.map((p, idx) => (
                        <circle
                          key={`${s.id}-${idx}`}
                          cx={p.x}
                          cy={p.y}
                          r={hoveredBucketIdx === idx ? 4.5 : 3}
                          fill={s.color}
                          className="stroke-white dark:stroke-slate-900"
                          strokeWidth={1.5}
                        />
                      ))}
                    </g>
                  );
                })}

                {curveData.buckets.map((b, idx) => {
                  const showEvery =
                    curveData.buckets.length > 16
                      ? idx % 3 === 0 || idx === curveData.buckets.length - 1
                      : true;
                  if (!showEvery) return null;
                  const x = xToPx(idx, curveData.buckets.length);
                  return (
                    <text
                      key={b.key}
                      x={x}
                      y={SVG_H - 8}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {b.label}
                    </text>
                  );
                })}

                {curveData.buckets.map((b, idx) => {
                  const x = xToPx(idx, curveData.buckets.length);
                  const colW =
                    curveData.buckets.length > 1
                      ? plotW / (curveData.buckets.length - 1)
                      : plotW;
                  return (
                    <g key={`hit-${b.key}`}>
                      {hoveredBucketIdx === idx && (
                        <line
                          x1={x}
                          y1={PAD_T}
                          x2={x}
                          y2={PAD_T + plotH}
                          className="stroke-slate-400 dark:stroke-slate-600"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                      )}
                      <rect
                        x={Math.max(PAD_L, x - colW / 2)}
                        y={PAD_T}
                        width={colW}
                        height={plotH}
                        fill="transparent"
                        onMouseEnter={() => setHoveredBucketIdx(idx)}
                        onMouseLeave={() => setHoveredBucketIdx(null)}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {curveSeries.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setCurveTarget(
                        curveTarget === (s.kind === 'untagged' ? 'untagged' : `${s.kind}:${s.id}`)
                          ? 'all'
                          : s.kind === 'untagged'
                          ? 'untagged'
                          : `${s.kind}:${s.id}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{backgroundColor: s.color}}
                    />
                    <span className="font-medium">{s.name}</span>
                  </button>
                ))}
              </div>

              {hoveredBucketIdx !== null && curveData.buckets[hoveredBucketIdx] && (
                <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {curveData.buckets[hoveredBucketIdx].fullLabel} :
                  </span>
                  {curveSeries.map((s) => {
                    const v = curveData.buckets[hoveredBucketIdx].valuesByTarget[s.id] ?? 0;
                    return (
                      <span key={s.id} style={{color: s.color}} className="font-semibold">
                        {s.name} {v}
                        {activeMetric === 'duration' ? 'h' : ''}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
