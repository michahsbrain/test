import React, {useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ActivityDefinition,
  ConflictStrategy,
  PlannerSettings,
  RoutineEntry,
} from '../types/planner';
import {createId} from '../engine/scheduler';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {
  addDays,
  diffDaysInclusive,
  formatDateShortFr,
  formatDuration,
  minToTime,
  timeToMin,
} from '../utils/dateUtils';
import {IMPORTANCE_META} from '../utils/eventStyles';
import {PWAInstallButton} from './PWAInstallButton';

const ROUTINE_WEEKDAYS: Array<{day: number; label: string}> = [
  {day: 1, label: 'Lun'},
  {day: 2, label: 'Mar'},
  {day: 3, label: 'Mer'},
  {day: 4, label: 'Jeu'},
  {day: 5, label: 'Ven'},
  {day: 6, label: 'Sam'},
  {day: 0, label: 'Dim'},
];

interface SettingsViewProps {
  settings: PlannerSettings;
  activities: ActivityDefinition[];
  routineProgram: RoutineEntry[];
  eventsCount: number;
  canUndo: boolean;
  undoRemainingSec: number;
  lastGeneratedAt: number | null;
  onUpdateSettings: (next: PlannerSettings) => void;
  onUpdateRoutineProgram: (next: RoutineEntry[]) => void;
  onGeneratePlanning: () => void;
  onUndo: () => void;
  onKeepAction: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => Promise<void>;
  onExportIcs: () => void;
  onImportIcs: (file: File) => Promise<void>;
  onResetDefaults: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  activities,
  routineProgram,
  eventsCount,
  canUndo,
  undoRemainingSec,
  lastGeneratedAt,
  onUpdateSettings,
  onUpdateRoutineProgram,
  onGeneratePlanning,
  onUndo,
  onKeepAction,
  onExportBackup,
  onImportBackup,
  onExportIcs,
  onImportIcs,
  onResetDefaults,
}) => {
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const icsInputRef = useRef<HTMLInputElement | null>(null);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const totalGenDays = diffDaysInclusive(
    settings.generationStartDate,
    settings.generationEndDate >= settings.generationStartDate
      ? settings.generationEndDate
      : settings.generationStartDate
  );

  const updateRule = <K extends keyof PlannerSettings['rules']>(
    key: K,
    value: PlannerSettings['rules'][K]
  ) => {
    onUpdateSettings({
      ...settings,
      rules: {
        ...settings.rules,
        [key]: value,
      },
    });
  };

  const updateRoutineEntry = (id: string, patch: Partial<RoutineEntry>) => {
    onUpdateRoutineProgram(
      routineProgram.map((entry) => (entry.id === id ? {...entry, ...patch} : entry))
    );
  };

  const handleAddRoutineEntry = () => {
    const defaultAct = activities[0];
    if (!defaultAct) return;
    const newEntry: RoutineEntry = {
      id: createId('rentry'),
      activityId: defaultAct.id,
      startMin: 9 * 60,
      durationMin: defaultAct.durationMin ?? 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    };
    onUpdateRoutineProgram([...routineProgram, newEntry]);
    setRoutineMenuOpen(true);
  };

  const toggleRoutineDay = (entry: RoutineEntry, dayNum: number) => {
    const current = Array.isArray(entry.daysOfWeek) ? entry.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
    const exists = current.includes(dayNum);
    const next = exists ? current.filter((d) => d !== dayNum) : [...current, dayNum];
    updateRoutineEntry(entry.id, {daysOfWeek: next});
  };

  const handleDeleteRoutineEntry = (id: string) => {
    onUpdateRoutineProgram(routineProgram.filter((r) => r.id !== id));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImportBackup(file);
      setImportFeedback('Sauvegarde locale restaurée avec succès.');
    } catch {
      setImportFeedback('Fichier invalide : impossible de restaurer cette sauvegarde.');
    } finally {
      e.target.value = '';
    }
  };

  const handleIcsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFeedback(null);
    try {
      await onImportIcs(file);
    } catch {
      setImportFeedback('Fichier .ics invalide ou illisible.');
    } finally {
      e.target.value = '';
    }
  };

  const sortedRoutineEntries = [...routineProgram].sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="flex-1 overflow-y-auto calendar-scroll bg-slate-50/60 dark:bg-slate-950 pb-24 md:pb-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-8 py-8 space-y-10">
        {/* Page Heading */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Paramètres du planning & Automatisation
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Configurez l’apparence, votre routine quotidienne, les règles de réorganisation et la période de génération.
          </p>
        </div>

        {/* Bloc 1: Apparence */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              01. Apparence
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choisissez le thème d’affichage de l’application (enregistré localement).
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="radiogroup"
              aria-label="Thème de l'application"
            >
              <button
                type="button"
                role="radio"
                aria-checked={settings.theme === 'light'}
                onClick={() => onUpdateSettings({...settings, theme: 'light'})}
                className={`flex items-center gap-3.5 rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'border-[#1A73E8] bg-blue-50/70 dark:bg-blue-950/50 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    settings.theme === 'light'
                      ? 'bg-[#1A73E8] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sun className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Mode clair</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Fond blanc lumineux, contraste élevé de jour
                  </div>
                </div>
                {settings.theme === 'light' && (
                  <Check className="w-4 h-4 text-[#1A73E8] shrink-0" />
                )}
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={settings.theme === 'dark'}
                onClick={() => onUpdateSettings({...settings, theme: 'dark'})}
                className={`flex items-center gap-3.5 rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'border-[#1A73E8] bg-blue-50/70 dark:bg-blue-950/50 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    settings.theme === 'dark'
                      ? 'bg-[#1A73E8] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Moon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Mode sombre</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Ardoise sombre reposante en faible luminosité
                  </div>
                </div>
                {settings.theme === 'dark' && (
                  <Check className="w-4 h-4 text-[#1A73E8] dark:text-blue-400 shrink-0" />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Bloc 2: Routine (Menu déroulant simple : Activités + Horaires) */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              02. Routine quotidienne
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choisissez pour chaque activité son heure de début, son heure de fin (jusqu’au lendemain si elle dépasse minuit) et les jours de la semaine où elle doit être générée.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <button
              type="button"
              onClick={() => setRoutineMenuOpen((o) => !o)}
              aria-expanded={routineMenuOpen}
              className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Programme de la routine ({routineProgram.length} activité
                  {routineProgram.length > 1 ? 's' : ''})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {routineMenuOpen
                    ? 'Cliquez pour replier le menu déroulant'
                    : 'Ouvrir le menu déroulant pour choisir vos activités, horaires et jours'}
                </div>
              </div>
              {routineMenuOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              )}
            </button>

            {routineMenuOpen && (
              <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                {sortedRoutineEntries.length === 0 ? (
                  <div className="p-5 text-center text-sm text-slate-500 dark:text-slate-400">
                    Aucune activité sélectionnée dans la routine.
                  </div>
                ) : (
                  sortedRoutineEntries.map((entry) => {
                    const act = activities.find((a) => a.id === entry.activityId);
                    const totalEndMin = entry.startMin + entry.durationMin;
                    const isNextDay = totalEndMin > 1440;
                    const displayEndMin = totalEndMin % 1440;
                    const activeDays = Array.isArray(entry.daysOfWeek)
                      ? entry.daysOfWeek
                      : [0, 1, 2, 3, 4, 5, 6];

                    return (
                      <div key={entry.id} className="p-4 sm:px-5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Activité
                            </label>
                            <select
                              value={entry.activityId}
                              onChange={(e) => {
                                const nextAct = activities.find((a) => a.id === e.target.value);
                                updateRoutineEntry(entry.id, {
                                  activityId: e.target.value,
                                  durationMin: nextAct?.durationMin ?? entry.durationMin,
                                });
                              }}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                            >
                              {activities.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.title} ({IMPORTANCE_META[a.importance].shortLabel})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Heure de début
                            </label>
                            <input
                              type="time"
                              value={minToTime(entry.startMin)}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const nextStart = Math.min(1439, timeToMin(e.target.value));
                                updateRoutineEntry(entry.id, {
                                  startMin: nextStart,
                                });
                              }}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Heure de fin ({formatDuration(entry.durationMin)}
                              {isNextDay ? ' · lendemain' : ''})
                            </label>
                            <input
                              type="time"
                              value={minToTime(displayEndMin)}
                              onChange={(e) => {
                                const rawVal = e.target.value;
                                if (!rawVal) return;
                                const parsed = timeToMin(rawVal);
                                const nextDur =
                                  parsed > entry.startMin
                                    ? parsed - entry.startMin
                                    : 1440 - entry.startMin + parsed;
                                updateRoutineEntry(entry.id, {
                                  durationMin: Math.max(5, nextDur),
                                });
                              }}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                            />
                          </div>

                          <div className="flex justify-end sm:col-span-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteRoutineEntry(entry.id)}
                              aria-label={`Retirer ${act?.title ?? 'activité'}`}
                              className="p-1.5 rounded-md text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Jours de génération
                          </span>
                          <div className="flex flex-wrap items-center gap-1">
                            {ROUTINE_WEEKDAYS.map((wd) => {
                              const active = activeDays.includes(wd.day);
                              return (
                                <button
                                  key={wd.day}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => toggleRoutineDay(entry, wd.day)}
                                  className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                                    active
                                      ? 'border-[#1A73E8] bg-[#1A73E8] text-white'
                                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {wd.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

              <div className="p-4 sm:px-5 bg-slate-50/70 dark:bg-slate-950/50 flex justify-end">
                <button
                  type="button"
                  disabled={activities.length === 0}
                  onClick={handleAddRoutineEntry}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#1A73E8]" />
                  Ajouter une activité à la routine
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Bloc 3: Règles d'automatisation */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            03. Règles d’automatisation & Réorganisation
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Règles appliquées lors des conflits. Les niveaux Irréductible (3), Unique (2) et Important (1) demandent toujours votre confirmation.
          </p>
        </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="rule-strategy"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Stratégie (niveau Facultatif)
                </label>
                <select
                  id="rule-strategy"
                  value={settings.rules.conflictStrategy}
                  onChange={(e) =>
                    updateRule('conflictStrategy', e.target.value as ConflictStrategy)
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value="shift_first">Décaler d’abord, puis réduire</option>
                  <option value="reduce_first">Réduire sur place d’abord, puis décaler</option>
                  <option value="strict_replace">Supprimer directement les facultatives</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rule-buffer"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Marge entre activités
                </label>
                <select
                  id="rule-buffer"
                  value={settings.rules.bufferMinutes}
                  onChange={(e) => updateRule('bufferMinutes', parseInt(e.target.value, 10))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value={0}>0 min</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rule-min-dur"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Durée minimale si réduite
                </label>
                <select
                  id="rule-min-dur"
                  value={settings.rules.minReducedDurationMin}
                  onChange={(e) =>
                    updateRule('minReducedDurationMin', parseInt(e.target.value, 10))
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                </select>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <label className="flex items-start justify-between gap-4 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                    Confirmer aussi les ajustements Facultatifs (niveau 4)
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Les activités de niveau 3, 2 et 1 demandent toujours confirmation dans tous les cas. L’option « Reportable » se règle par activité dans le volet Création.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.rules.confirmBeforeReorganize}
                  onChange={(e) => updateRule('confirmBeforeReorganize', e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[#1A73E8] focus:ring-[#1A73E8]"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Bloc 4: Génération du planning */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              04. Génération du planning
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Génère toutes les activités de votre routine du jour de départ jusqu’au jour choisi.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="gen-start"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Date de départ
                </label>
                <input
                  id="gen-start"
                  type="date"
                  value={settings.generationStartDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    if (!nextStart) return;
                    const nextEnd =
                      settings.generationEndDate < nextStart
                        ? addDays(nextStart, totalGenDays - 1)
                        : settings.generationEndDate;
                    onUpdateSettings({
                      ...settings,
                      generationStartDate: nextStart,
                      generationEndDate: nextEnd,
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="gen-end"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Jusqu’au
                </label>
                <input
                  id="gen-end"
                  type="date"
                  min={settings.generationStartDate}
                  value={settings.generationEndDate}
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    if (!nextEnd) return;
                    onUpdateSettings({
                      ...settings,
                      generationEndDate:
                        nextEnd >= settings.generationStartDate
                          ? nextEnd
                          : settings.generationStartDate,
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>
                Période sélectionnée :{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatDateShortFr(settings.generationStartDate)} →{' '}
                  {formatDateShortFr(
                    settings.generationEndDate >= settings.generationStartDate
                      ? settings.generationEndDate
                      : settings.generationStartDate
                  )}
                </strong>{' '}
                ({totalGenDays} jour{totalGenDays > 1 ? 's' : ''})
              </span>
              <span className="tabular-nums">
                {routineProgram.length} activité{routineProgram.length > 1 ? 's' : ''} de routine par jour
              </span>
            </div>

            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/50 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-blue-950 dark:text-blue-200">
              <AlertCircle className="w-4 h-4 text-[#1A73E8] dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                Générer le planning <strong>remplace l’ancienne routine</strong> par votre programme actuel. Vos autres activités ({eventsCount} au total actuellement) sont conservées et décalées si besoin selon leurs règles d’importance.
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {lastGeneratedAt
                  ? `Dernière génération : ${new Date(lastGeneratedAt).toLocaleString('fr-FR')}`
                  : 'Aucune génération manuelle enregistrée'}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {canUndo && undoRemainingSec > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={onUndo}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Revenir en arrière ({undoRemainingSec}s)
                    </button>
                    <button
                      type="button"
                      onClick={onKeepAction}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Garder
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={onGeneratePlanning}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Générer le planning ({totalGenDays} j)
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Bloc 5: Stockage 100% local & Hors ligne */}
        <section className="space-y-4 pb-8">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              05. Stockage local, Hors ligne & Sauvegarde
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vos données sont stockées localement sur votre appareil (IndexedDB) et fonctionnent sans connexion Internet.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-700 dark:text-slate-300">
                État du réseau :{' '}
                <strong
                  className={
                    isOnline
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }
                >
                  {isOnline ? 'En ligne (synchronisation locale active)' : 'Hors ligne (autonome)'}
                </strong>
              </div>
              <PWAInstallButton variant="card" />
            </div>

            {importFeedback && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200">
                {importFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onExportIcs}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#1A73E8] dark:text-blue-400" />
                Exporter en .ics
              </button>

              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#1A73E8] dark:text-blue-400" />
                Importer un .ics
              </button>
              <input
                ref={icsInputRef}
                type="file"
                accept=".ics,text/calendar"
                onChange={handleIcsFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={onExportBackup}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter en JSON
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Importer JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={onResetDefaults}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors ml-auto cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser par défaut
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
