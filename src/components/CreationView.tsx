import React, {useMemo, useState} from 'react';
import {
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Tag,
  Target,
  Trash2,
} from 'lucide-react';
import {createId, DEFAULT_IMPORTANCE, IMPORTANCE_LABELS} from '../engine/scheduler';
import {
  ActivityDefinition,
  CalendarEvent,
  GoalMetric,
  GoalPeriod,
  ImportanceLevel,
  TagDefinition,
  TrackingGoal,
} from '../types/planner';
import {formatDuration} from '../utils/dateUtils';
import {
  IMPORTANCE_META,
  inferCategoryFromTagId,
  TAG_COLOR_PALETTE,
} from '../utils/eventStyles';
import {DurationInput} from './DurationInput';

interface CreationViewProps {
  activities: ActivityDefinition[];
  tags: TagDefinition[];
  events: CalendarEvent[];
  onUpdateActivities: (next: ActivityDefinition[]) => void;
  onUpdateTags: (next: TagDefinition[]) => void;
  onPlanActivity: (activity: ActivityDefinition) => void;
}

type CreationSubView = 'activities' | 'tags';

const IMPORTANCE_LEVELS: ImportanceLevel[] = [4, 3, 2, 1];

function GoalEditor({
  goal,
  onChange,
}: {
  goal?: TrackingGoal;
  onChange: (next: TrackingGoal | undefined) => void;
}) {
  const activeGoal: TrackingGoal = goal ?? {
    enabled: false,
    metric: 'duration',
    period: 'day',
    minTarget: 1,
    maxTarget: 3,
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={activeGoal.enabled}
            onChange={(e) => onChange({...activeGoal, enabled: e.target.checked})}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8] focus:ring-[#1A73E8]"
          />
          <Target className="w-3.5 h-3.5 text-[#1A73E8] dark:text-blue-400" />
          <span>Objectif de suivi (facultatif)</span>
        </label>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Repère visuel uniquement · n’impacte pas la programmation
        </span>
      </div>

      {activeGoal.enabled && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Mesure
            </label>
            <select
              value={activeGoal.metric}
              onChange={(e) => onChange({...activeGoal, metric: e.target.value as GoalMetric})}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
            >
              <option value="duration">Durée (heures)</option>
              <option value="frequency">Fréquence (séances)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Période
            </label>
            <select
              value={activeGoal.period}
              onChange={(e) => onChange({...activeGoal, period: e.target.value as GoalPeriod})}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
            >
              <option value="day">Par jour</option>
              <option value="week">Par semaine</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Minimum ({activeGoal.metric === 'duration' ? 'h' : 'fois'})
            </label>
            <input
              type="number"
              min={0}
              step={activeGoal.metric === 'duration' ? 0.5 : 1}
              placeholder="Aucun"
              value={activeGoal.minTarget ?? ''}
              onChange={(e) => {
                const val =
                  e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value));
                onChange({...activeGoal, minTarget: Number.isNaN(val as number) ? undefined : val});
              }}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Maximum ({activeGoal.metric === 'duration' ? 'h' : 'fois'})
            </label>
            <input
              type="number"
              min={0}
              step={activeGoal.metric === 'duration' ? 0.5 : 1}
              placeholder="Aucun"
              value={activeGoal.maxTarget ?? ''}
              onChange={(e) => {
                const val =
                  e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value));
                onChange({...activeGoal, maxTarget: Number.isNaN(val as number) ? undefined : val});
              }}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const CreationView: React.FC<CreationViewProps> = ({
  activities,
  tags,
  events,
  onUpdateActivities,
  onUpdateTags,
  onPlanActivity,
}) => {
  const [subView, setSubView] = useState<CreationSubView>('activities');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  // Formulaire de création d'une activité
  const [newActTitle, setNewActTitle] = useState('');
  const [newActTagId, setNewActTagId] = useState<string>('');
  const [newActImportance, setNewActImportance] = useState<ImportanceLevel>(DEFAULT_IMPORTANCE);
  const [newActCrossDayShift, setNewActCrossDayShift] = useState<boolean>(false);
  const [newActAllowCoexist, setNewActAllowCoexist] = useState<boolean>(false);

  // Formulaire de création de tag
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PALETTE[0].hex);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((act) => {
      const tag = tags.find((t) => t.id === act.tagId);
      const imp = IMPORTANCE_LABELS[act.importance].toLowerCase();
      return (
        act.title.toLowerCase().includes(q) ||
        (tag?.name.toLowerCase().includes(q) ?? false) ||
        imp.includes(q)
      );
    });
  }, [activities, searchQuery, tags]);

  const handleCreateActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newActTitle.trim();
    if (!title) return;

    const inferredCategory = inferCategoryFromTagId(newActTagId);

    const created: ActivityDefinition = {
      id: createId('act'),
      title,
      importance: newActImportance,
      category: inferredCategory,
      tagId: newActTagId,
      rules: {
        canShift: newActImportance === 3 || newActImportance === 4,
        canReduce: newActImportance === 2 || newActImportance === 4,
        canCrossDayShift: newActCrossDayShift,
        allowCoexistence: newActAllowCoexist,
        minDurationMin: 20,
      },
    };

    onUpdateActivities([created, ...activities]);
    setNewActTitle('');
    setNewActTagId('');
    setNewActImportance(DEFAULT_IMPORTANCE);
    setNewActCrossDayShift(false);
    setNewActAllowCoexist(false);
    setCreateOpen(false);
    setExpandedActivityId(created.id);
  };

  const updateActivity = (id: string, patch: Partial<ActivityDefinition>) => {
    onUpdateActivities(activities.map((a) => (a.id === id ? {...a, ...patch} : a)));
  };

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    const created: TagDefinition = {
      id: createId('tag'),
      name,
      color: newTagColor,
    };
    onUpdateTags([...tags, created]);
    setNewTagName('');
  };

  const updateTag = (id: string, patch: Partial<TagDefinition>) => {
    onUpdateTags(tags.map((t) => (t.id === id ? {...t, ...patch} : t)));
  };

  const deleteTag = (id: string) => {
    onUpdateTags(tags.filter((t) => t.id !== id));
    onUpdateActivities(
      activities.map((a) => (a.tagId === id ? {...a, tagId: ''} : a))
    );
  };

  return (
    <div className="flex-1 overflow-y-auto calendar-scroll bg-slate-50/60 dark:bg-slate-950 pb-20 md:pb-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Header & Sub-view Toggle */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Répertoire d’activités & Tags
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              {subView === 'activities'
                ? 'Centralisez vos activités, leur niveau d’importance (Facultatif, Unique, Irréductible, Important), leurs règles et leurs tags de suivi.'
                : 'Regroupez vos activités sous des tags thématiques et définissez des repères facultatifs pour votre suivi graphique.'}
            </p>
          </div>

          <div
            role="group"
            aria-label="Mode de création"
            className="inline-flex items-center rounded-lg bg-slate-200/70 dark:bg-slate-900 p-1"
          >
            <button
              type="button"
              onClick={() => setSubView('activities')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'activities'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Activités ({activities.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('tags')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'tags'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Tags & Objectifs ({tags.length})
            </button>
          </div>
        </div>

        {subView === 'activities' ? (
          <div className="space-y-4">
            {/* Search & Quick Add Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chercher une activité par nom, tag ou importance…"
                  aria-label="Chercher une activité"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setCreateOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nouvelle activité
              </button>
            </div>

            {/* Collapsible New Activity Creator */}
            {createOpen && (
              <form
                onSubmit={handleCreateActivity}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Enregistrer une activité dans le répertoire
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
                    <label
                      htmlFor="new-act-title"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                    >
                      Nom de l’activité
                    </label>
                    <input
                      id="new-act-title"
                      type="text"
                      autoFocus
                      value={newActTitle}
                      onChange={(e) => setNewActTitle(e.target.value)}
                      placeholder="Ex : Lecture, Langues, Musculation..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label
                      htmlFor="new-act-imp"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                    >
                      Importance
                    </label>
                    <select
                      id="new-act-imp"
                      value={newActImportance}
                      onChange={(e) =>
                        setNewActImportance(Number(e.target.value) as ImportanceLevel)
                      }
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                    >
                      {IMPORTANCE_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {IMPORTANCE_META[lvl].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="new-act-tag"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                    >
                      Tag (facultatif)
                    </label>
                    <select
                      id="new-act-tag"
                      value={newActTagId}
                      onChange={(e) => setNewActTagId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                    >
                      <option value="">Aucun tag</option>
                      {tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newActCrossDayShift}
                        onChange={(e) => setNewActCrossDayShift(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                      />
                      <span>Reportable au jour suivant si la journée est saturée</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newActAllowCoexist}
                        onChange={(e) => setNewActAllowCoexist(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                      />
                      <span>Permettre la coexistence d’autres activités</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter au répertoire
                  </button>
                </div>
              </form>
            )}

            {/* Compact Activity Directory */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {filteredActivities.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {activities.length === 0
                    ? 'Aucune activité enregistrée. Cliquez sur « Nouvelle activité » pour démarrer.'
                    : 'Aucune activité ne correspond à votre recherche.'}
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const tag = tags.find((t) => t.id === act.tagId);
                  const isExpanded = expandedActivityId === act.id;
                  const rules = act.rules ?? {canShift: true, canReduce: true};
                  const impMeta = IMPORTANCE_META[act.importance];

                  return (
                    <div key={act.id} className="transition-colors">
                      {/* Compact At-a-Glance Summary Row */}
                      <div className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <button
                          type="button"
                          onClick={() => setExpandedActivityId(isExpanded ? null : act.id)}
                          aria-expanded={isExpanded}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{backgroundColor: tag?.color ?? '#94A3B8'}}
                            title={tag?.name ?? 'Aucun tag'}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {act.title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className={`font-medium ${impMeta.textColor}`}>
                                {impMeta.shortLabel}
                              </span>
                              {tag && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{tag.name}</span>
                                </>
                              )}
                              {rules.canCrossDayShift && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Reportable</span>
                                </>
                              )}
                              {rules.allowCoexistence && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Coexistence autorisée</span>
                                </>
                              )}
                              {rules.minDurationMin !== undefined && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    Min réduite : {formatDuration(rules.minDurationMin)}
                                  </span>
                                </>
                              )}
                              {act.goal?.enabled && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-[#1A73E8] dark:text-blue-400">
                                    Objectif actif
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onPlanActivity(act)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            <CalendarPlus className="w-3.5 h-3.5 text-[#1A73E8] dark:text-blue-400" />
                            <span className="hidden sm:inline">Planifier</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedActivityId(isExpanded ? null : act.id)}
                            aria-expanded={isExpanded}
                            aria-label={`Caractéristiques de ${act.title}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            <span className="hidden sm:inline">Caractéristiques</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateActivities(activities.filter((a) => a.id !== act.id))
                            }
                            aria-label={`Supprimer ${act.title}`}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Dropdown Drawer for Activity Characteristics */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 bg-slate-50/70 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Nom de l’activité
                              </label>
                              <input
                                type="text"
                                value={act.title}
                                onChange={(e) => updateActivity(act.id, {title: e.target.value})}
                                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Importance (4 → 1)
                              </label>
                              <select
                                value={act.importance}
                                onChange={(e) =>
                                  updateActivity(act.id, {
                                    importance: Number(e.target.value) as ImportanceLevel,
                                  })
                                }
                                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                              >
                                {IMPORTANCE_LEVELS.map((lvl) => (
                                  <option key={lvl} value={lvl}>
                                    {IMPORTANCE_META[lvl].label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Tag (facultatif)
                              </label>
                              <select
                                value={act.tagId}
                                onChange={(e) =>
                                  updateActivity(act.id, {
                                    tagId: e.target.value,
                                    category: inferCategoryFromTagId(e.target.value),
                                  })
                                }
                                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                              >
                                <option value="">Aucun tag</option>
                                {tags.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Règle appliquée : {impMeta.hint}.
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Durée min si réduite (min / h)
                              </label>
                              <DurationInput
                                valueMin={rules.minDurationMin}
                                minMin={5}
                                maxMin={480}
                                allowEmpty
                                defaultUnit="min"
                                placeholder="Défaut global"
                                size="sm"
                                ariaLabel={`Durée minimale de ${act.title}`}
                                onChangeMin={(next) =>
                                  updateActivity(act.id, {
                                    rules: {
                                      ...rules,
                                      minDurationMin: next,
                                    },
                                  })
                                }
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-4 pt-2 sm:pt-4">
                              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={rules.canShift}
                                  onChange={(e) =>
                                    updateActivity(act.id, {
                                      rules: {...rules, canShift: e.target.checked},
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                                />
                                <span>Autoriser décalage</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={rules.canReduce}
                                  onChange={(e) =>
                                    updateActivity(act.id, {
                                      rules: {...rules, canReduce: e.target.checked},
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                                />
                                <span>Autoriser réduction</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(rules.canCrossDayShift)}
                                  onChange={(e) =>
                                    updateActivity(act.id, {
                                      rules: {...rules, canCrossDayShift: e.target.checked},
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                                />
                                <span>Reportable (jour suivant)</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(rules.allowCoexistence)}
                                  onChange={(e) =>
                                    updateActivity(act.id, {
                                      rules: {...rules, allowCoexistence: e.target.checked},
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                                />
                                <span>Permettre la coexistence d’autres activités</span>
                              </label>
                            </div>
                          </div>

                          <GoalEditor
                            goal={act.goal}
                            onChange={(nextGoal) => updateActivity(act.id, {goal: nextGoal})}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Tags & Tracking Goals Sub-view */
          <div className="space-y-6">
            <form
              onSubmit={handleCreateTag}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
            >
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nouveau tag de suivi
              </h2>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label
                    htmlFor="new-tag-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    Nom du tag
                  </label>
                  <input
                    id="new-tag-name"
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ex : Révisions, Lecture, Méditation..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Couleur
                  </span>
                  <div className="flex items-center gap-1.5">
                    {TAG_COLOR_PALETTE.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setNewTagColor(c.hex)}
                        aria-label={c.name}
                        className={`w-7 h-7 rounded-md transition-transform cursor-pointer ${
                          newTagColor === c.hex
                            ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-900 scale-105'
                            : ''
                        }`}
                        style={{backgroundColor: c.hex}}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  <Tag className="w-4 h-4" />
                  Créer le tag
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {tags.map((tag) => {
                const linkedActivities = activities.filter((a) => a.tagId === tag.id).length;
                const linkedEvents = events.filter((e) => e.tagId === tag.id).length;

                return (
                  <div
                    key={tag.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                        <span
                          className="w-4 h-4 rounded-md shrink-0"
                          style={{backgroundColor: tag.color}}
                        />
                        <input
                          type="text"
                          value={tag.name}
                          onChange={(e) => updateTag(tag.id, {name: e.target.value})}
                          className="rounded-md border border-transparent bg-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-[#1A73E8] px-2 py-1 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {linkedActivities} activité{linkedActivities > 1 ? 's' : ''} ·{' '}
                          {linkedEvents} planifiée{linkedEvents > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {TAG_COLOR_PALETTE.map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => updateTag(tag.id, {color: c.hex})}
                              aria-label={`Couleur ${c.name}`}
                              className={`w-4 h-4 rounded-sm cursor-pointer ${
                                tag.color === c.hex
                                  ? 'ring-2 ring-offset-1 ring-slate-800 dark:ring-slate-100 dark:ring-offset-slate-900'
                                  : 'opacity-70 hover:opacity-100'
                              }`}
                              style={{backgroundColor: c.hex}}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => deleteTag(tag.id)}
                          aria-label={`Supprimer le tag ${tag.name}`}
                          className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <GoalEditor
                      goal={tag.goal}
                      onChange={(nextGoal) => updateTag(tag.id, {goal: nextGoal})}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
