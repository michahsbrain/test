import {
  ActivityDefinition,
  CalendarEvent,
  IcsImportPlan,
  ImportanceLevel,
  PlannerSettings,
  ReorganizationChange,
  ReorganizationPlan,
  RoutineEntry,
  RoutineGenerationPlan,
} from '../types/planner';
import {addDays, diffDaysInclusive, formatDateShortFr, minToTime, parseISO} from '../utils/dateUtils';

export const DEFAULT_IMPORTANCE: ImportanceLevel = 2; // Niveau 2 : Unique

export const IMPORTANCE_LABELS: Record<ImportanceLevel, string> = {
  1: 'Important',
  2: 'Unique',
  3: 'Irréductible',
  4: 'Facultatif',
};

export const IMPORTANCE_DESCRIPTIONS: Record<ImportanceLevel, string> = {
  1: 'Important (niv. 1) — jamais déplacé ni supprimé automatiquement en cas de conflit',
  2: 'Unique (niv. 2, défaut) — réduit ou supprimé uniquement sur confirmation, jamais déplacé',
  3: 'Irréductible (niv. 3) — déplaçable uniquement avec confirmation, jamais supprimé',
  4: 'Facultatif (niv. 4) — décalé, réduit ou supprimé automatiquement si besoin',
};

export function createId(prefix = 'act'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

interface Interval {
  startMin: number;
  endMin: number;
}

function intervalsOverlap(a: Interval, b: Interval, buffer = 0): boolean {
  return a.startMin < b.endMin + buffer && a.endMin + buffer > b.startMin;
}

/**
 * Deux activités ne peuvent coexister en même temps que si TOUTES DEUX autorisent explicitement la coexistence.
 * Si une activité ne permet pas la coexistence, aucune autre activité ne doit être planifiée en même temps.
 */
export function canEventsCoexist(a: CalendarEvent, b: CalendarEvent): boolean {
  return Boolean(a.customRules?.allowCoexistence) && Boolean(b.customRules?.allowCoexistence);
}

export function findNearestFreeSlot(
  dayEvents: CalendarEvent[],
  duration: number,
  preferredStart: number,
  windowStart: number,
  windowEnd: number,
  buffer: number
): Interval | null {
  const minStart = Math.max(0, windowStart);
  const maxEnd = Math.min(1440, windowEnd);
  if (maxEnd - minStart < duration) return null;

  const sorted = [...dayEvents].sort((a, b) => a.startMin - b.startMin);

  const gaps: Interval[] = [];
  let cursor = minStart;

  for (const ev of sorted) {
    const evStart = Math.max(minStart, ev.startMin - buffer);
    const evEnd = Math.min(maxEnd, ev.endMin + buffer);
    if (evStart > cursor) {
      gaps.push({startMin: cursor, endMin: evStart});
    }
    if (evEnd > cursor) {
      cursor = evEnd;
    }
  }
  if (cursor < maxEnd) {
    gaps.push({startMin: cursor, endMin: maxEnd});
  }

  let bestSlot: Interval | null = null;
  let bestDist = Infinity;

  for (const gap of gaps) {
    if (gap.endMin - gap.startMin < duration) continue;
    const clampedStart = Math.max(gap.startMin, Math.min(preferredStart, gap.endMin - duration));
    const snapped = Math.round(clampedStart / 5) * 5;
    const candidateStart = Math.max(gap.startMin, Math.min(snapped, gap.endMin - duration));
    const dist = Math.abs(candidateStart - preferredStart);
    if (dist < bestDist) {
      bestDist = dist;
      bestSlot = {startMin: candidateStart, endMin: candidateStart + duration};
    }
  }

  return bestSlot;
}

function findLargestFreeGap(
  dayEvents: CalendarEvent[],
  minDuration: number,
  preferredStart: number,
  windowStart: number,
  windowEnd: number,
  buffer: number
): Interval | null {
  const minStart = Math.max(0, windowStart);
  const maxEnd = Math.min(1440, windowEnd);
  const sorted = [...dayEvents].sort((a, b) => a.startMin - b.startMin);

  const gaps: Interval[] = [];
  let cursor = minStart;

  for (const ev of sorted) {
    const evStart = Math.max(minStart, ev.startMin - buffer);
    const evEnd = Math.min(maxEnd, ev.endMin + buffer);
    if (evStart > cursor) gaps.push({startMin: cursor, endMin: evStart});
    if (evEnd > cursor) cursor = evEnd;
  }
  if (cursor < maxEnd) gaps.push({startMin: cursor, endMin: maxEnd});

  const valid = gaps.filter((g) => g.endMin - g.startMin >= minDuration);
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const lenDiff = b.endMin - b.startMin - (a.endMin - a.startMin);
    if (Math.abs(lenDiff) >= 15) return lenDiff;
    return Math.abs(a.startMin - preferredStart) - Math.abs(b.startMin - preferredStart);
  });

  return valid[0];
}

/**
 * Génère un nouveau planning du `generationStartDate` jusqu'au `generationEndDate` inclus
 * en répétant les activités configurées dans la routine selon leurs jours choisis.
 * Si une activité dépasse minuit (`startMin + durationMin > 1440`), elle continue sur la journée suivante.
 */
export function generatePlanning(
  settings: PlannerSettings,
  activities: ActivityDefinition[],
  routineProgram: RoutineEntry[]
): CalendarEvent[] {
  const startDate = settings.generationStartDate;
  const endDate =
    settings.generationEndDate && settings.generationEndDate >= startDate
      ? settings.generationEndDate
      : startDate;
  const totalDays = Math.min(366, diffDaysInclusive(startDate, endDate));
  const generated: CalendarEvent[] = [];

  const activityById = new Map(activities.map((a) => [a.id, a]));

  const sortedEntries = [...routineProgram].sort((a, b) => {
    const impA = activityById.get(a.activityId)?.importance ?? DEFAULT_IMPORTANCE;
    const impB = activityById.get(b.activityId)?.importance ?? DEFAULT_IMPORTANCE;
    if (impA !== impB) return impA - impB;
    return a.startMin - b.startMin;
  });

  for (let d = 0; d < totalDays; d++) {
    const dateStr = addDays(startDate, d);
    const dayOfWeek = parseISO(dateStr).getDay();

    for (const entry of sortedEntries) {
      if (Array.isArray(entry.daysOfWeek) && !entry.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }
      const activity = activityById.get(entry.activityId);
      const entryStart = Math.max(0, Math.min(1439, entry.startMin));
      let remaining = Math.max(5, entry.durationMin || activity?.durationMin || 60);
      let dayOffset = 0;

      while (remaining > 0) {
        const segDate = dayOffset === 0 ? dateStr : addDays(dateStr, dayOffset);
        const segStart = dayOffset === 0 ? entryStart : 0;
        const segDur = Math.min(1440 - segStart, remaining);

        generated.push({
          id: createId('rtn'),
          title: activity?.title ?? 'Activité',
          date: segDate,
          startMin: segStart,
          endMin: segStart + segDur,
          importance: activity?.importance ?? DEFAULT_IMPORTANCE,
          category: activity?.category ?? 'personal',
          tagId: activity?.tagId ?? '',
          source: 'routine',
          routineEntryId: entry.id,
          activityId: activity?.id ?? entry.activityId,
          customRules: activity?.rules,
        });

        remaining -= segDur;
        dayOffset += 1;
      }
    }
  }

  return generated.sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
  );
}

export interface PlanInsertionOptions {
  editingEventId?: string;
  isUserDirectEdit?: boolean; // Autorité niveau 0 : modification directe par l'utilisateur
}

function subtractBlockersFromInterval(
  base: Interval,
  blockers: CalendarEvent[],
  buffer: number
): Interval[] {
  let segments: Interval[] = [{startMin: base.startMin, endMin: base.endMin}];

  for (const b of blockers) {
    const bStart = b.startMin - buffer;
    const bEnd = b.endMin + buffer;
    const next: Interval[] = [];
    for (const seg of segments) {
      if (bEnd <= seg.startMin || bStart >= seg.endMin) {
        next.push(seg);
      } else {
        if (bStart > seg.startMin) {
          next.push({startMin: seg.startMin, endMin: bStart});
        }
        if (bEnd < seg.endMin) {
          next.push({startMin: bEnd, endMin: seg.endMin});
        }
      }
    }
    segments = next;
    if (segments.length === 0) break;
  }

  return segments;
}

interface VictimResolutionResult {
  fixedAnchors: CalendarEvent[];
  resolvedOthers: CalendarEvent[];
  changes: ReorganizationChange[];
  unresolvedConflicts: CalendarEvent[];
  warnings: string[];
  touchesLevel3OrHigher: boolean;
}

/**
 * Les activités entrantes (`fixedAnchors`) sont programmées telles quelles.
 * Les activités préexistantes en conflit (lorsqu'au moins une des deux n'autorise pas la coexistence)
 * se décalent, se réduisent ou se suppriment selon leurs règles d'importance (1, 2, 3, 4).
 * Tout conflit qu'aucune règle automatique ne permet de résoudre est signalé dans `unresolvedConflicts`.
 */
function resolveConflictsAgainstFixedAnchors(
  fixedAnchors: CalendarEvent[],
  existingPool: CalendarEvent[],
  settings: PlannerSettings,
  causeDescriptionForVictim: (victim: CalendarEvent, overlappingAnchors: CalendarEvent[]) => string
): VictimResolutionResult {
  const rules = settings.rules;
  const buffer = rules.bufferMinutes;
  const awakeStart = 0;
  const awakeEnd = 1440;

  const anchors = fixedAnchors.map((a) => ({...a}));
  const workingOthers = existingPool.map((e) => ({...e}));

  const overlappingAnchorsByVictim = new Map<string, CalendarEvent[]>();
  for (const other of workingOthers) {
    const hits = anchors.filter(
      (anchor) =>
        anchor.date === other.date &&
        anchor.id !== other.id &&
        intervalsOverlap(anchor, other, buffer) &&
        !canEventsCoexist(anchor, other)
    );
    if (hits.length > 0) {
      overlappingAnchorsByVictim.set(other.id, hits);
    }
  }

  const victims = workingOthers
    .filter((ev) => overlappingAnchorsByVictim.has(ev.id))
    .sort((a, b) =>
      a.importance !== b.importance ? a.importance - b.importance : a.startMin - b.startMin
    );

  const removedIds = new Set<string>();
  const modifiedMap = new Map<string, CalendarEvent>();
  const changes: ReorganizationChange[] = [];
  const unresolvedConflicts: CalendarEvent[] = [];
  const warnings: string[] = [];
  let touchesLevel3OrHigher = false;

  const getCurrentPool = (): CalendarEvent[] => {
    const pool: CalendarEvent[] = [...anchors];
    for (const ev of workingOthers) {
      if (removedIds.has(ev.id)) continue;
      pool.push(modifiedMap.get(ev.id) ?? ev);
    }
    return pool;
  };

  for (const victim of victims) {
    const victimDuration = victim.endMin - victim.startMin;
    const winStart = awakeStart;
    const winEnd = awakeEnd;
    const canShiftVictim = victim.customRules?.canShift ?? true;
    const canReduceVictim = victim.customRules?.canReduce ?? true;
    const victimBuffer = buffer;
    const hits = overlappingAnchorsByVictim.get(victim.id) ?? [];

    // --- NIVEAU 1 : IMPORTANT (jamais déplacé ni supprimé automatiquement) ---
    if (victim.importance === 1) {
      touchesLevel3OrHigher = true;
      unresolvedConflicts.push(victim);
      warnings.push(
        `Conflit non résolu avec l’activité Important « ${victim.title} » (${formatDateShortFr(victim.date)} · ${minToTime(victim.startMin)}–${minToTime(victim.endMin)}).`
      );
      continue;
    }

    const tryShiftSameDay = (): boolean => {
      if (!canShiftVictim && victim.importance !== 3) return false;
      const poolOnDay = getCurrentPool().filter(
        (e) => e.date === victim.date && e.id !== victim.id && !canEventsCoexist(victim, e)
      );
      const slot = findNearestFreeSlot(
        poolOnDay,
        victimDuration,
        victim.startMin,
        winStart,
        winEnd,
        victimBuffer
      );
      if (!slot) return false;

      const updated: CalendarEvent = {
        ...victim,
        startMin: slot.startMin,
        endMin: slot.endMin,
      };
      modifiedMap.set(victim.id, updated);
      changes.push({
        type: 'shifted',
        eventId: victim.id,
        title: victim.title,
        importance: victim.importance,
        before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
        after: {date: updated.date, startMin: updated.startMin, endMin: updated.endMin},
        reason: causeDescriptionForVictim(victim, hits),
      });
      return true;
    };

    const tryShiftNextDays = (): boolean => {
      if (!victim.customRules?.canCrossDayShift) return false;
      if (!canShiftVictim && victim.importance !== 3) return false;
      for (let offset = 1; offset <= 3; offset++) {
        const nextDate = addDays(victim.date, offset);
        const poolOnNextDay = getCurrentPool().filter(
          (e) => e.date === nextDate && !canEventsCoexist(victim, e)
        );
        const slot = findNearestFreeSlot(
          poolOnNextDay,
          victimDuration,
          victim.startMin,
          awakeStart,
          awakeEnd,
          buffer
        );
        if (slot) {
          const updated: CalendarEvent = {
            ...victim,
            date: nextDate,
            startMin: slot.startMin,
            endMin: slot.endMin,
          };
          modifiedMap.set(victim.id, updated);
          changes.push({
            type: 'shifted',
            eventId: victim.id,
            title: victim.title,
            importance: victim.importance,
            before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
            after: {date: updated.date, startMin: updated.startMin, endMin: updated.endMin},
            reason: `Reportée au jour suivant (${IMPORTANCE_LABELS[victim.importance]})`,
          });
          return true;
        }
      }
      return false;
    };

    const tryReduce = (): boolean => {
      if (!canReduceVictim && victim.importance !== 2) return false;
      const effectiveBuf = victimBuffer;
      const minDur = victim.customRules?.minDurationMin ?? rules.minReducedDurationMin;

      const poolWithoutVictim = getCurrentPool().filter(
        (e) => e.date === victim.date && e.id !== victim.id && !canEventsCoexist(victim, e)
      );

      const candidates = subtractBlockersFromInterval(
        {startMin: victim.startMin, endMin: victim.endMin},
        poolWithoutVictim,
        effectiveBuf
      ).filter((seg) => seg.endMin - seg.startMin >= minDur);

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const lenDiff = b.endMin - b.startMin - (a.endMin - a.startMin);
          if (lenDiff !== 0) return lenDiff;
          return Math.abs(a.startMin - victim.startMin) - Math.abs(b.startMin - victim.startMin);
        });
        const chosen = candidates[0];
        const updated: CalendarEvent = {
          ...victim,
          startMin: chosen.startMin,
          endMin: chosen.endMin,
        };
        modifiedMap.set(victim.id, updated);
        changes.push({
          type: 'reduced',
          eventId: victim.id,
          title: victim.title,
          importance: victim.importance,
          before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
          after: {date: updated.date, startMin: updated.startMin, endMin: updated.endMin},
          reason: `Durée réduite (${victimDuration} min → ${chosen.endMin - chosen.startMin} min)`,
        });
        return true;
      }

      // Pour Facultatif (4) uniquement, autoriser la recherche d'un espace réduit ailleurs dans la journée
      if (victim.importance === 4) {
        const gap = findLargestFreeGap(
          poolWithoutVictim,
          minDur,
          victim.startMin,
          winStart,
          winEnd,
          effectiveBuf
        );
        if (gap) {
          const gapLen = gap.endMin - gap.startMin;
          const newLen = Math.min(victimDuration, gapLen);
          const updated: CalendarEvent = {
            ...victim,
            startMin: gap.startMin,
            endMin: gap.startMin + newLen,
          };
          modifiedMap.set(victim.id, updated);
          changes.push({
            type: 'reduced',
            eventId: victim.id,
            title: victim.title,
            importance: victim.importance,
            before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
            after: {date: updated.date, startMin: updated.startMin, endMin: updated.endMin},
            reason: `Déplacée et réduite (${victimDuration} min → ${newLen} min)`,
          });
          return true;
        }
      }

      return false;
    };

    // --- NIVEAU 3 : IRRÉDUCTIBLE (déplaçable uniquement, jamais réduit ni supprimé) ---
    if (victim.importance === 3) {
      touchesLevel3OrHigher = true;
      const shifted = tryShiftSameDay() || tryShiftNextDays();
      if (!shifted) {
        unresolvedConflicts.push(victim);
        warnings.push(
          `Impossible de déplacer l’activité Irréductible « ${victim.title} » (${formatDateShortFr(victim.date)} · ${minToTime(victim.startMin)}–${minToTime(victim.endMin)}) faute de plage libre sans chevauchement.`
        );
      }
      continue;
    }

    // --- NIVEAU 2 : UNIQUE (réduit ou supprimé uniquement avec confirmation, jamais déplacé) ---
    if (victim.importance === 2) {
      touchesLevel3OrHigher = true;
      const reduced = tryReduce();
      if (!reduced) {
        removedIds.add(victim.id);
        changes.push({
          type: 'deleted',
          eventId: victim.id,
          title: victim.title,
          importance: victim.importance,
          before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
          reason: `Supprimée (activité Unique : impossible à réduire sur place sans chevauchement)`,
        });
      }
      continue;
    }

    // --- NIVEAU 4 : FACULTATIF (décalé, réduit ou supprimé) ---
    let resolved = false;
    if (rules.conflictStrategy === 'shift_first') {
      resolved = tryShiftSameDay() || tryReduce() || tryShiftNextDays();
    } else if (rules.conflictStrategy === 'reduce_first') {
      resolved = tryReduce() || tryShiftSameDay() || tryShiftNextDays();
    } else {
      resolved = false;
    }

    if (!resolved) {
      removedIds.add(victim.id);
      changes.push({
        type: 'deleted',
        eventId: victim.id,
        title: victim.title,
        importance: victim.importance,
        before: {date: victim.date, startMin: victim.startMin, endMin: victim.endMin},
        reason: `Supprimée faute de plage disponible (${IMPORTANCE_LABELS[victim.importance]})`,
      });
    }
  }

  const resolvedOthers = workingOthers
    .filter((ev) => !removedIds.has(ev.id))
    .map((ev) => modifiedMap.get(ev.id) ?? ev);

  return {
    fixedAnchors: anchors,
    resolvedOthers,
    changes,
    unresolvedConflicts,
    warnings,
    touchesLevel3OrHigher,
  };
}

/**
 * Programme la nouvelle activité (ou l'activité modifiée) telle quelle à l'horaire choisi,
 * et décale / réduit / supprime les anciennes activités en conflit selon leurs règles d'importance.
 */
export function planEventInsertion(
  incomingEvent: CalendarEvent,
  existingEvents: CalendarEvent[],
  settings: PlannerSettings,
  options: PlanInsertionOptions = {}
): ReorganizationPlan {
  const {editingEventId} = options;

  const baseEvents = editingEventId
    ? existingEvents.filter((e) => e.id !== editingEventId)
    : [...existingEvents];

  const targetEvent: CalendarEvent = {...incomingEvent};

  const resolution = resolveConflictsAgainstFixedAnchors(
    [targetEvent],
    baseEvents,
    settings,
    (victim, anchors) =>
      `Déplacée (${IMPORTANCE_LABELS[victim.importance]}) pour laisser place à « ${anchors[0]?.title ?? targetEvent.title} »`
  );

  const finalTarget = resolution.fixedAnchors[0] ?? targetEvent;
  const nextEvents = [...resolution.fixedAnchors, ...resolution.resolvedOthers].sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
  );

  const requiresConfirmation =
    resolution.unresolvedConflicts.length > 0 ||
    resolution.touchesLevel3OrHigher ||
    (settings.rules.confirmBeforeReorganize &&
      (resolution.changes.length > 0 || resolution.warnings.length > 0));

  return {
    newEvent: finalTarget,
    nextEvents,
    changes: resolution.changes,
    unresolvedConflicts: resolution.unresolvedConflicts,
    requiresConfirmation,
    warnings: resolution.warnings,
  };
}

/**
 * Écrase l'ancienne routine, génère toutes les activités de la routine telles quelles,
 * détecte les éventuels chevauchements internes non autorisés au sein de la routine,
 * puis réarrange les anciennes activités non-routine en conflit selon leurs règles d'importance.
 */
export function planRoutineGeneration(
  settings: PlannerSettings,
  activities: ActivityDefinition[],
  routineProgram: RoutineEntry[],
  existingEvents: CalendarEvent[]
): RoutineGenerationPlan {
  // L'ancienne routine est écrasée ; les autres activités existantes sont conservées et décalées si besoin
  const preservedManualEvents = existingEvents.filter((ev) => ev.source !== 'routine');
  const routineEvents = generatePlanning(settings, activities, routineProgram);

  // Vérifier que les activités de la routine ne se chevauchent pas entre elles si la coexistence est désactivée
  const internalUnresolved: CalendarEvent[] = [];
  const internalUnresolvedIds = new Set<string>();
  const internalWarnings: string[] = [];
  const reportedPairKeys = new Set<string>();
  const buffer = settings.rules.bufferMinutes;

  const routineByDate = new Map<string, CalendarEvent[]>();
  for (const ev of routineEvents) {
    const bucket = routineByDate.get(ev.date);
    if (bucket) bucket.push(ev);
    else routineByDate.set(ev.date, [ev]);
  }

  for (const [dateStr, dayList] of routineByDate.entries()) {
    for (let i = 0; i < dayList.length; i++) {
      for (let j = i + 1; j < dayList.length; j++) {
        const a = dayList[i];
        const b = dayList[j];
        if (intervalsOverlap(a, b, buffer) && !canEventsCoexist(a, b)) {
          if (!internalUnresolvedIds.has(a.id)) {
            internalUnresolvedIds.add(a.id);
            internalUnresolved.push(a);
          }
          if (!internalUnresolvedIds.has(b.id)) {
            internalUnresolvedIds.add(b.id);
            internalUnresolved.push(b);
          }
          const pairKey = [a.routineEntryId ?? a.id, b.routineEntryId ?? b.id].sort().join('|');
          if (!reportedPairKeys.has(pairKey)) {
            reportedPairKeys.add(pairKey);
            internalWarnings.push(
              `Conflit dans votre routine (ex. le ${formatDateShortFr(dateStr)}) : « ${a.title} » (${minToTime(a.startMin)}–${minToTime(a.endMin)}) et « ${b.title} » (${minToTime(b.startMin)}–${minToTime(b.endMin)}) ne permettent pas la coexistence.`
            );
          }
        }
      }
    }
  }

  const resolution = resolveConflictsAgainstFixedAnchors(
    routineEvents,
    preservedManualEvents,
    settings,
    (victim, anchors) =>
      `Déplacée (${IMPORTANCE_LABELS[victim.importance]}) suite à la routine « ${anchors[0]?.title ?? 'Routine'} »`
  );

  const unresolvedSet = new Set(internalUnresolved.map((c) => c.id));
  const mergedUnresolved = [...internalUnresolved];
  for (const c of resolution.unresolvedConflicts) {
    if (!unresolvedSet.has(c.id)) {
      unresolvedSet.add(c.id);
      mergedUnresolved.push(c);
    }
  }

  const nextEvents = [...resolution.fixedAnchors, ...resolution.resolvedOthers].sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
  );

  const mergedWarnings = [...internalWarnings, ...resolution.warnings];
  const requiresConfirmation =
    mergedUnresolved.length > 0 ||
    resolution.touchesLevel3OrHigher ||
    (settings.rules.confirmBeforeReorganize &&
      (resolution.changes.length > 0 || mergedWarnings.length > 0));

  return {
    routineEventsCount: routineEvents.length,
    nextEvents,
    changes: resolution.changes,
    unresolvedConflicts: mergedUnresolved,
    requiresConfirmation,
    warnings: mergedWarnings,
  };
}

/**
 * Planifie l'import d'activités issues d'un fichier .ics :
 * - ignore les doublons exacts déjà présents dans le planning,
 * - vérifie les chevauchements internes non autorisés au sein du fichier .ics,
 * - réarrange les activités existantes en conflit selon les règles d'importance.
 */
export function planIcsImport(
  importedEvents: CalendarEvent[],
  existingEvents: CalendarEvent[],
  settings: PlannerSettings
): IcsImportPlan {
  const signature = (ev: CalendarEvent) =>
    `${ev.date}|${ev.startMin}|${ev.endMin}|${ev.title.trim().toLowerCase()}`;

  const seenSignatures = new Set(existingEvents.map(signature));
  const toInsert: CalendarEvent[] = [];
  let skippedDuplicatesCount = 0;

  for (const ev of importedEvents) {
    const sig = signature(ev);
    if (seenSignatures.has(sig)) {
      skippedDuplicatesCount++;
      continue;
    }
    seenSignatures.add(sig);
    toInsert.push(ev);
  }

  // Vérifier les chevauchements internes entre événements importés
  const internalUnresolved: CalendarEvent[] = [];
  const internalUnresolvedIds = new Set<string>();
  const internalWarnings: string[] = [];
  const reportedPairKeys = new Set<string>();
  const buffer = settings.rules.bufferMinutes;

  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of toInsert) {
    const bucket = byDate.get(ev.date);
    if (bucket) bucket.push(ev);
    else byDate.set(ev.date, [ev]);
  }

  for (const [dateStr, dayList] of byDate.entries()) {
    for (let i = 0; i < dayList.length; i++) {
      for (let j = i + 1; j < dayList.length; j++) {
        const a = dayList[i];
        const b = dayList[j];
        if (intervalsOverlap(a, b, buffer) && !canEventsCoexist(a, b)) {
          if (!internalUnresolvedIds.has(a.id)) {
            internalUnresolvedIds.add(a.id);
            internalUnresolved.push(a);
          }
          if (!internalUnresolvedIds.has(b.id)) {
            internalUnresolvedIds.add(b.id);
            internalUnresolved.push(b);
          }
          const pairKey = [a.title, b.title, String(a.startMin), String(b.startMin)]
            .sort()
            .join('|');
          if (!reportedPairKeys.has(pairKey)) {
            reportedPairKeys.add(pairKey);
            internalWarnings.push(
              `Conflit dans le fichier .ics (le ${formatDateShortFr(dateStr)}) : « ${a.title} » (${minToTime(a.startMin)}–${minToTime(a.endMin)}) et « ${b.title} » (${minToTime(b.startMin)}–${minToTime(b.endMin)}) se chevauchent sans coexistence autorisée.`
            );
          }
        }
      }
    }
  }

  const resolution = resolveConflictsAgainstFixedAnchors(
    toInsert,
    existingEvents,
    settings,
    (victim, anchors) =>
      `Déplacée (${IMPORTANCE_LABELS[victim.importance]}) suite à l’import .ics « ${anchors[0]?.title ?? 'Import'} »`
  );

  const unresolvedSet = new Set(internalUnresolved.map((c) => c.id));
  const mergedUnresolved = [...internalUnresolved];
  for (const c of resolution.unresolvedConflicts) {
    if (!unresolvedSet.has(c.id)) {
      unresolvedSet.add(c.id);
      mergedUnresolved.push(c);
    }
  }

  const nextEvents = [...resolution.fixedAnchors, ...resolution.resolvedOthers].sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
  );

  const mergedWarnings = [...internalWarnings, ...resolution.warnings];
  const requiresConfirmation =
    mergedUnresolved.length > 0 ||
    resolution.touchesLevel3OrHigher ||
    resolution.changes.length > 0 ||
    mergedWarnings.length > 0;

  return {
    importedEvents: toInsert,
    skippedDuplicatesCount,
    nextEvents,
    changes: resolution.changes,
    unresolvedConflicts: mergedUnresolved,
    requiresConfirmation,
    warnings: mergedWarnings,
  };
}
