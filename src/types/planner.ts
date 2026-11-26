export type ImportanceLevel = 1 | 2 | 3 | 4;

export type EventCategory = 'work' | 'focus' | 'health' | 'personal';

export type EventSource = 'routine' | 'manual';

export type GoalMetric = 'duration' | 'frequency';
export type GoalPeriod = 'day' | 'week';

export interface TrackingGoal {
  enabled: boolean;
  metric: GoalMetric;
  period: GoalPeriod;
  minTarget?: number; // hours when duration, sessions when frequency
  maxTarget?: number; // hours when duration, sessions when frequency
}

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
  isSystem?: boolean;
  goal?: TrackingGoal;
}

export interface ActivityRules {
  canShift: boolean;
  canReduce: boolean;
  canCrossDayShift?: boolean;
  allowCoexistence?: boolean;
  minDurationMin?: number;
}

export interface ActivityDefinition {
  id: string;
  title: string;
  durationMin?: number;
  importance: ImportanceLevel;
  category: EventCategory;
  tagId: string;
  rules?: ActivityRules;
  goal?: TrackingGoal;
}

export interface RoutineEntry {
  id: string;
  activityId: string;
  startMin: number; // 0..1439
  durationMin: number;
  daysOfWeek: number[]; // 0 (Dim) .. 6 (Sam)
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startMin: number; // 0..1440
  endMin: number; // 0..1440
  importance: ImportanceLevel;
  category: EventCategory;
  tagId: string;
  source: EventSource;
  routineEntryId?: string;
  activityId?: string;
  notes?: string;
  customRules?: ActivityRules;
}

export type ConflictStrategy = 'shift_first' | 'reduce_first' | 'strict_replace';

export interface AutomationRules {
  conflictStrategy: ConflictStrategy;
  bufferMinutes: number;
  minReducedDurationMin: number;
  confirmBeforeReorganize: boolean;
}

export type ThemeMode = 'light' | 'dark';

export interface PlannerSettings {
  theme: ThemeMode;
  generationStartDate: string; // YYYY-MM-DD
  generationEndDate: string; // YYYY-MM-DD ("Jusqu'au")
  rules: AutomationRules;
}

export type ChangeType = 'shifted' | 'reduced' | 'deleted' | 'adjusted_new';

export interface ReorganizationChange {
  type: ChangeType;
  eventId: string;
  title: string;
  importance: ImportanceLevel;
  before: {
    date: string;
    startMin: number;
    endMin: number;
  };
  after?: {
    date: string;
    startMin: number;
    endMin: number;
  };
  reason: string;
}

export interface ReorganizationPlan {
  newEvent: CalendarEvent;
  nextEvents: CalendarEvent[];
  changes: ReorganizationChange[];
  unresolvedConflicts: CalendarEvent[];
  requiresConfirmation: boolean;
  warnings: string[];
}

export interface RoutineGenerationPlan {
  routineEventsCount: number;
  nextEvents: CalendarEvent[];
  changes: ReorganizationChange[];
  unresolvedConflicts: CalendarEvent[];
  requiresConfirmation: boolean;
  warnings: string[];
}

export interface IcsImportPlan {
  importedEvents: CalendarEvent[];
  skippedDuplicatesCount: number;
  nextEvents: CalendarEvent[];
  changes: ReorganizationChange[];
  unresolvedConflicts: CalendarEvent[];
  requiresConfirmation: boolean;
  warnings: string[];
}

export interface UndoSnapshot {
  id: string;
  label: string;
  timestamp: number;
  events: CalendarEvent[];
}

export type ActiveVolet = 'planning' | 'creation' | 'tracking' | 'settings';
export type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda';
