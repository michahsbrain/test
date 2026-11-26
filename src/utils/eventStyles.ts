import {CalendarEvent, EventCategory, ImportanceLevel, TagDefinition} from '../types/planner';

export interface EventCardStyle {
  bg: string;
  border: string;
  text: string;
  subtext: string;
  swatch: string;
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  focus: 'Travail profond',
  work: 'Travail & RDV',
  health: 'Sport & Santé',
  personal: 'Personnel',
};

export const TAG_COLOR_PALETTE = [
  {name: 'Cobalt', hex: '#1A73E8'},
  {name: 'Ciel', hex: '#0EA5E9'},
  {name: 'Indigo', hex: '#6366F1'},
  {name: 'Émeraude', hex: '#10B981'},
  {name: 'Turquoise', hex: '#14B8A6'},
  {name: 'Ambre', hex: '#F59E0B'},
  {name: 'Rose', hex: '#EC4899'},
  {name: 'Violet', hex: '#8B5CF6'},
  {name: 'Ardoise', hex: '#64748B'},
];

export const CATEGORY_STYLES: Record<EventCategory, EventCardStyle> = {
  focus: {
    bg: 'bg-blue-50/95 hover:bg-blue-100/90 dark:bg-blue-950/75 dark:hover:bg-blue-900/75',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-950 dark:text-blue-100',
    subtext: 'text-blue-700 dark:text-blue-300',
    swatch: 'bg-[#1A73E8]',
  },
  work: {
    bg: 'bg-indigo-50/95 hover:bg-indigo-100/90 dark:bg-indigo-950/75 dark:hover:bg-indigo-900/75',
    border: 'border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-950 dark:text-indigo-100',
    subtext: 'text-indigo-700 dark:text-indigo-300',
    swatch: 'bg-indigo-500',
  },
  health: {
    bg: 'bg-emerald-50/95 hover:bg-emerald-100/90 dark:bg-emerald-950/75 dark:hover:bg-emerald-900/75',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-950 dark:text-emerald-100',
    subtext: 'text-emerald-700 dark:text-emerald-300',
    swatch: 'bg-emerald-600 dark:bg-emerald-500',
  },
  personal: {
    bg: 'bg-amber-50/95 hover:bg-amber-100/90 dark:bg-amber-950/75 dark:hover:bg-amber-900/75',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-950 dark:text-amber-100',
    subtext: 'text-amber-700 dark:text-amber-300',
    swatch: 'bg-amber-500',
  },
};

const COLOR_HEX_STYLES: Record<string, EventCardStyle> = {
  '#1A73E8': CATEGORY_STYLES.focus,
  '#0EA5E9': {
    bg: 'bg-sky-50/95 hover:bg-sky-100/90 dark:bg-sky-950/75 dark:hover:bg-sky-900/75',
    border: 'border-sky-200 dark:border-sky-800',
    text: 'text-sky-950 dark:text-sky-100',
    subtext: 'text-sky-700 dark:text-sky-300',
    swatch: 'bg-sky-500',
  },
  '#6366F1': CATEGORY_STYLES.work,
  '#10B981': CATEGORY_STYLES.health,
  '#14B8A6': {
    bg: 'bg-teal-50/95 hover:bg-teal-100/90 dark:bg-teal-950/75 dark:hover:bg-teal-900/75',
    border: 'border-teal-200 dark:border-teal-800',
    text: 'text-teal-950 dark:text-teal-100',
    subtext: 'text-teal-700 dark:text-teal-300',
    swatch: 'bg-teal-500',
  },
  '#F59E0B': CATEGORY_STYLES.personal,
  '#EC4899': {
    bg: 'bg-pink-50/95 hover:bg-pink-100/90 dark:bg-pink-950/75 dark:hover:bg-pink-900/75',
    border: 'border-pink-200 dark:border-pink-800',
    text: 'text-pink-950 dark:text-pink-100',
    subtext: 'text-pink-700 dark:text-pink-300',
    swatch: 'bg-pink-500',
  },
  '#8B5CF6': {
    bg: 'bg-violet-50/95 hover:bg-violet-100/90 dark:bg-violet-950/75 dark:hover:bg-violet-900/75',
    border: 'border-violet-200 dark:border-violet-800',
    text: 'text-violet-950 dark:text-violet-100',
    subtext: 'text-violet-700 dark:text-violet-300',
    swatch: 'bg-violet-500',
  },
  '#64748B': {
    bg: 'bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-700/85',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-800 dark:text-slate-100',
    subtext: 'text-slate-600 dark:text-slate-300',
    swatch: 'bg-slate-400 dark:bg-slate-500',
  },
};

const NEUTRAL_UNTAGGED_STYLE: EventCardStyle = {
  bg: 'bg-slate-50/95 hover:bg-slate-100/90 dark:bg-slate-900/80 dark:hover:bg-slate-800/85',
  border: 'border-slate-300 dark:border-slate-700',
  text: 'text-slate-900 dark:text-slate-100',
  subtext: 'text-slate-600 dark:text-slate-400',
  swatch: 'bg-slate-400 dark:bg-slate-500',
};

export function resolveEventStyle(
  event: Pick<CalendarEvent, 'source' | 'tagId' | 'category'>,
  tags?: TagDefinition[]
): EventCardStyle {
  if (!event.tagId) return NEUTRAL_UNTAGGED_STYLE;
  if (tags) {
    const tag = tags.find((t) => t.id === event.tagId);
    if (tag) {
      const matched = COLOR_HEX_STYLES[tag.color.toUpperCase()];
      if (matched) return matched;
    }
  }
  return CATEGORY_STYLES[event.category] ?? NEUTRAL_UNTAGGED_STYLE;
}

export function inferCategoryFromTagId(tagId: string | undefined): EventCategory {
  if (tagId === 'tag-focus') return 'focus';
  if (tagId === 'tag-work') return 'work';
  if (tagId === 'tag-health') return 'health';
  return 'personal';
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveTagInfo(
  tagId: string | undefined,
  category: EventCategory,
  tags: TagDefinition[]
): {name: string; color: string} {
  if (tagId) {
    const found = tags.find((t) => t.id === tagId);
    if (found) return {name: found.name, color: found.color};
  }
  if (!tagId) {
    return {name: 'Sans tag', color: '#94A3B8'};
  }
  const fallbackName = CATEGORY_LABELS[category] ?? 'Autre';
  const colorMap: Record<EventCategory, string> = {
    focus: '#1A73E8',
    work: '#6366F1',
    health: '#10B981',
    personal: '#F59E0B',
  };
  return {name: fallbackName, color: colorMap[category] ?? '#94A3B8'};
}

export const IMPORTANCE_META: Record<
  ImportanceLevel,
  {label: string; shortLabel: string; hint: string; textColor: string}
> = {
  4: {
    label: 'Niveau 4 · Facultatif',
    shortLabel: 'Facultatif',
    hint: 'Peut être décalé, réduit ou supprimé en cas de conflit',
    textColor: 'text-slate-600 dark:text-slate-400',
  },
  3: {
    label: 'Niveau 3 · Irréductible',
    shortLabel: 'Irréductible',
    hint: 'Peut être déplacé mais jamais supprimé (confirmation requise)',
    textColor: 'text-sky-700 dark:text-sky-400',
  },
  2: {
    label: 'Niveau 2 · Unique',
    shortLabel: 'Unique',
    hint: 'Défaut : peut être réduit ou supprimé avec confirmation, jamais déplacé',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  1: {
    label: 'Niveau 1 · Important',
    shortLabel: 'Important',
    hint: 'Jamais déplacé ni supprimé automatiquement en cas de conflit',
    textColor: 'text-rose-700 dark:text-rose-400',
  },
};
