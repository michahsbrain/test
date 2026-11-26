import {
  ActivityDefinition,
  CalendarEvent,
  EventCategory,
  ImportanceLevel,
  PlannerSettings,
  RoutineEntry,
  TagDefinition,
  UndoSnapshot,
} from '../types/planner';
import {addDays, getTodayISO} from '../utils/dateUtils';

const DB_NAME = 'TempoLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'planner_state';
const LS_FALLBACK_KEY = 'tempolocal_state_v1';

export interface PersistedPlannerState {
  settings: PlannerSettings;
  activities: ActivityDefinition[];
  routineProgram: RoutineEntry[];
  tags: TagDefinition[];
  events: CalendarEvent[];
  undoStack: UndoSnapshot[];
  lastGeneratedAt: number | null;
}

export function categoryToDefaultTagId(cat: EventCategory): string {
  switch (cat) {
    case 'focus':
      return 'tag-focus';
    case 'work':
      return 'tag-work';
    case 'health':
      return 'tag-health';
    case 'personal':
    default:
      return 'tag-personal';
  }
}

export function createDefaultTags(): TagDefinition[] {
  return [
    {
      id: 'tag-focus',
      name: 'Travail profond',
      color: '#1A73E8',
      goal: {
        enabled: true,
        metric: 'duration',
        period: 'day',
        minTarget: 1.5,
        maxTarget: 4,
      },
    },
    {
      id: 'tag-work',
      name: 'Travail & RDV',
      color: '#6366F1',
    },
    {
      id: 'tag-health',
      name: 'Sport & Santé',
      color: '#10B981',
      goal: {
        enabled: true,
        metric: 'duration',
        period: 'week',
        minTarget: 3,
        maxTarget: 7,
      },
    },
    {
      id: 'tag-personal',
      name: 'Personnel',
      color: '#F59E0B',
    },
  ];
}

export function createDefaultSettings(): PlannerSettings {
  const start = getTodayISO();
  return {
    theme: 'light',
    generationStartDate: start,
    generationEndDate: addDays(start, 13),
    rules: {
      conflictStrategy: 'shift_first',
      bufferMinutes: 10,
      minReducedDurationMin: 20,
      confirmBeforeReorganize: true,
    },
  };
}

export function createDefaultActivities(): ActivityDefinition[] {
  return [
    {
      id: 'act-morning',
      title: 'Préparation & Petit-déjeuner',
      durationMin: 45,
      importance: 3, // Irréductible
      category: 'personal',
      tagId: 'tag-personal',
      rules: {canShift: true, canReduce: false, canCrossDayShift: false, allowCoexistence: false},
    },
    {
      id: 'act-deepwork',
      title: 'Travail profond / Priorité du jour',
      durationMin: 120,
      importance: 1, // Important
      category: 'focus',
      tagId: 'tag-focus',
      rules: {canShift: false, canReduce: false, canCrossDayShift: false, allowCoexistence: false},
    },
    {
      id: 'act-lunch',
      title: 'Pause déjeuner',
      durationMin: 60,
      importance: 3, // Irréductible
      category: 'personal',
      tagId: 'tag-personal',
      rules: {canShift: true, canReduce: false, canCrossDayShift: false, allowCoexistence: false},
    },
    {
      id: 'act-sport',
      title: 'Activité physique / Sport',
      durationMin: 60,
      importance: 4, // Facultatif
      category: 'health',
      tagId: 'tag-health',
      rules: {
        canShift: true,
        canReduce: true,
        canCrossDayShift: true,
        allowCoexistence: false,
        minDurationMin: 30,
      },
    },
    {
      id: 'act-winddown',
      title: 'Détente & lecture du soir',
      durationMin: 45,
      importance: 4, // Facultatif
      category: 'personal',
      tagId: 'tag-personal',
      rules: {
        canShift: true,
        canReduce: true,
        canCrossDayShift: false,
        allowCoexistence: false,
        minDurationMin: 15,
      },
    },
  ];
}

export function createDefaultRoutineProgram(): RoutineEntry[] {
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  return [
    {
      id: 'rentry-morning',
      activityId: 'act-morning',
      startMin: 7 * 60 + 10,
      durationMin: 45,
      daysOfWeek: allDays,
    },
    {
      id: 'rentry-deepwork',
      activityId: 'act-deepwork',
      startMin: 9 * 60,
      durationMin: 120,
      daysOfWeek: allDays,
    },
    {
      id: 'rentry-lunch',
      activityId: 'act-lunch',
      startMin: 12 * 60 + 30,
      durationMin: 60,
      daysOfWeek: allDays,
    },
    {
      id: 'rentry-sport',
      activityId: 'act-sport',
      startMin: 17 * 60 + 30,
      durationMin: 60,
      daysOfWeek: allDays,
    },
    {
      id: 'rentry-winddown',
      activityId: 'act-winddown',
      startMin: 22 * 60,
      durationMin: 45,
      daysOfWeek: allDays,
    },
  ];
}

function normalizeImportance(raw: unknown): ImportanceLevel {
  if (raw === 1 || raw === 2 || raw === 3 || raw === 4) return raw;
  switch (raw) {
    case 'fixed':
      return 1;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 4;
    default:
      return 2; // Niveau 2 - Unique par défaut
  }
}

function normalizeCategory(raw: unknown): EventCategory {
  if (raw === 'work' || raw === 'focus' || raw === 'health' || raw === 'personal') {
    return raw;
  }
  return 'personal';
}

function normalizeTagId(rawTagId: unknown, category: EventCategory): string {
  if (rawTagId === '') return '';
  if (typeof rawTagId === 'string' && rawTagId && rawTagId !== 'tag-routine' && rawTagId !== 'tag-sleep') {
    return rawTagId;
  }
  return rawTagId === undefined ? categoryToDefaultTagId(category) : '';
}

interface LegacyRoutineLike {
  id: string;
  title: string;
  enabled?: boolean;
  preferredStartMin?: number;
  durationMin: number;
  importance: unknown;
  category: unknown;
  tagId?: string;
  daysOfWeek?: number[];
  rules?: ActivityDefinition['rules'];
  goal?: ActivityDefinition['goal'];
}

export function normalizePersistedState(raw: Record<string, unknown>): PersistedPlannerState {
  const defaultTags = createDefaultTags();
  const rawTags = Array.isArray(raw.tags) ? (raw.tags as TagDefinition[]) : defaultTags;
  const tags = rawTags
    .filter((t) => t.id !== 'tag-routine' && t.id !== 'tag-sleep')
    .map((t) => ({...t, isSystem: false}));

  const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;
  const rawRules = (rawSettings.rules ?? {}) as Record<string, unknown>;
  const legacyCrossDay =
    typeof rawRules.allowCrossDayShift === 'boolean' ? rawRules.allowCrossDayShift : false;

  let activities: ActivityDefinition[];
  let routineProgram: RoutineEntry[];

  if (Array.isArray(raw.activities)) {
    activities = (raw.activities as Array<Record<string, unknown>>).map((a) => {
      const category = normalizeCategory(a.category);
      const rawActRules = (a.rules ?? {}) as Record<string, unknown>;
      return {
        id: String(a.id ?? `act-${Math.random().toString(36).slice(2, 7)}`),
        title: String(a.title ?? 'Activité'),
        durationMin: a.durationMin !== undefined ? Number(a.durationMin) || undefined : undefined,
        importance: normalizeImportance(a.importance),
        category,
        tagId: normalizeTagId(a.tagId, category),
        rules: {
          canShift: typeof rawActRules.canShift === 'boolean' ? rawActRules.canShift : true,
          canReduce: typeof rawActRules.canReduce === 'boolean' ? rawActRules.canReduce : true,
          canCrossDayShift:
            typeof rawActRules.canCrossDayShift === 'boolean'
              ? rawActRules.canCrossDayShift
              : legacyCrossDay,
          allowCoexistence:
            typeof rawActRules.allowCoexistence === 'boolean'
              ? rawActRules.allowCoexistence
              : false,
          minDurationMin:
            typeof rawActRules.minDurationMin === 'number'
              ? rawActRules.minDurationMin
              : undefined,
        },
        goal: a.goal as ActivityDefinition['goal'],
      };
    });

    routineProgram = Array.isArray(raw.routineProgram)
      ? (raw.routineProgram as RoutineEntry[]).map((entry) => ({
          ...entry,
          daysOfWeek: Array.isArray(entry.daysOfWeek)
            ? entry.daysOfWeek
            : [0, 1, 2, 3, 4, 5, 6],
        }))
      : createDefaultRoutineProgram();
  } else if (Array.isArray(raw.routines)) {
    // Migrate legacy routines -> activities + routineProgram
    const legacy = raw.routines as LegacyRoutineLike[];
    activities = legacy.map((r) => {
      const category = normalizeCategory(r.category);
      return {
        id: r.id,
        title: r.title,
        durationMin: r.durationMin || 45,
        importance: normalizeImportance(r.importance),
        category,
        tagId: normalizeTagId(r.tagId, category),
        rules: {
          canShift: r.rules?.canShift ?? true,
          canReduce: r.rules?.canReduce ?? true,
          canCrossDayShift: r.rules?.canCrossDayShift ?? legacyCrossDay,
          allowCoexistence: r.rules?.allowCoexistence ?? false,
          minDurationMin: r.rules?.minDurationMin,
        },
        goal: r.goal,
      };
    });
    routineProgram = legacy
      .filter((r) => r.enabled !== false)
      .map((r, idx) => ({
        id: `rentry-mig-${idx}-${r.id}`,
        activityId: r.id,
        startMin: r.preferredStartMin ?? 9 * 60,
        durationMin: r.durationMin || 45,
        daysOfWeek: Array.isArray(r.daysOfWeek) ? r.daysOfWeek : [1, 2, 3, 4, 5],
      }));
  } else {
    activities = createDefaultActivities();
    routineProgram = createDefaultRoutineProgram();
  }

  const rawEvents = Array.isArray(raw.events) ? (raw.events as Array<Record<string, unknown>>) : [];
  const events: CalendarEvent[] = rawEvents
    .filter((ev) => {
      const id = String(ev.id ?? '');
      return !id.startsWith('sim-') && ev.source !== 'sleep' && ev.category !== 'sleep';
    })
    .map((ev) => {
      const category = normalizeCategory(ev.category);
      return {
        id: String(ev.id),
        title: String(ev.title ?? 'Activité'),
        date: String(ev.date),
        startMin: Number(ev.startMin) || 0,
        endMin: Number(ev.endMin) || 60,
        importance: normalizeImportance(ev.importance),
        category,
        tagId: normalizeTagId(ev.tagId, category),
        source: ev.source === 'routine' ? 'routine' : 'manual',
        routineEntryId: ev.routineEntryId as string | undefined,
        activityId: (ev.activityId ?? ev.routineId) as string | undefined,
        notes: ev.notes as string | undefined,
        customRules: ev.customRules as CalendarEvent['customRules'],
      };
    });

  const defaultSettings = createDefaultSettings();
  const startDate =
    typeof rawSettings.generationStartDate === 'string' && rawSettings.generationStartDate
      ? rawSettings.generationStartDate
      : defaultSettings.generationStartDate;
  const legacyWeeks =
    typeof rawSettings.generationWeeks === 'number'
      ? Math.max(1, Math.min(8, rawSettings.generationWeeks))
      : 2;
  const rawEndDate =
    typeof rawSettings.generationEndDate === 'string' && rawSettings.generationEndDate
      ? rawSettings.generationEndDate
      : addDays(startDate, legacyWeeks * 7 - 1);
  const endDate = rawEndDate >= startDate ? rawEndDate : startDate;

  const normalizedSettings: PlannerSettings = {
    theme: rawSettings.theme === 'dark' ? 'dark' : 'light',
    generationStartDate: startDate,
    generationEndDate: endDate,
    rules: {
      conflictStrategy:
        rawRules.conflictStrategy === 'reduce_first' ||
        rawRules.conflictStrategy === 'strict_replace'
          ? rawRules.conflictStrategy
          : defaultSettings.rules.conflictStrategy,
      bufferMinutes:
        typeof rawRules.bufferMinutes === 'number'
          ? rawRules.bufferMinutes
          : defaultSettings.rules.bufferMinutes,
      minReducedDurationMin:
        typeof rawRules.minReducedDurationMin === 'number'
          ? rawRules.minReducedDurationMin
          : defaultSettings.rules.minReducedDurationMin,
      confirmBeforeReorganize:
        typeof rawRules.confirmBeforeReorganize === 'boolean'
          ? rawRules.confirmBeforeReorganize
          : defaultSettings.rules.confirmBeforeReorganize,
    },
  };

  const rawUndo = Array.isArray(raw.undoStack) ? (raw.undoStack as UndoSnapshot[]) : [];

  return {
    settings: normalizedSettings,
    activities,
    routineProgram,
    tags,
    events,
    undoStack: rawUndo,
    lastGeneratedAt: (raw.lastGeneratedAt as number | null) ?? null,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPlannerState(): Promise<PersistedPlannerState | null> {
  try {
    const db = await openDatabase();
    const result = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('root');
      getReq.onsuccess = () => resolve((getReq.result as Record<string, unknown>) ?? null);
      getReq.onerror = () => reject(getReq.error);
    });
    if (result) return normalizePersistedState(result);
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    return normalizePersistedState(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function savePlannerState(state: PersistedPlannerState): Promise<void> {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota error on localStorage mirror
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, 'root');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable; localStorage already persisted
  }
}
