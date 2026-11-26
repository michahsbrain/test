import React, {useMemo, useState} from 'react';
import {AlertTriangle, CalendarArrowUp, Check, X} from 'lucide-react';
import {DEFAULT_IMPORTANCE, planIcsImport} from '../engine/scheduler';
import {
  CalendarEvent,
  IcsImportPlan,
  ImportanceLevel,
  PlannerSettings,
  TagDefinition,
} from '../types/planner';
import {formatDateShortFr, getTodayISO, minToTime} from '../utils/dateUtils';
import {IMPORTANCE_META, inferCategoryFromTagId} from '../utils/eventStyles';
import {getSuggestedIcsHorizon, parseIcsFile} from '../utils/icsUtils';
import {CalendarDiffPreview} from './CalendarDiffPreview';

const IMPORTANCE_LEVELS: ImportanceLevel[] = [4, 3, 2, 1];

interface IcsImportModalProps {
  fileName: string;
  rawContent: string;
  existingEvents: CalendarEvent[];
  settings: PlannerSettings;
  tags: TagDefinition[];
  onConfirmImport: (plan: IcsImportPlan, fileName: string) => void;
  onClose: () => void;
}

export const IcsImportModal: React.FC<IcsImportModalProps> = ({
  fileName,
  rawContent,
  existingEvents,
  settings,
  tags,
  onConfirmImport,
  onClose,
}) => {
  const [defaultImportance, setDefaultImportance] = useState<ImportanceLevel>(DEFAULT_IMPORTANCE);
  const [defaultTagId, setDefaultTagId] = useState<string>('');
  const [allowCoexistence, setAllowCoexistence] = useState<boolean>(false);

  const parsed = useMemo(() => {
    const horizon =
      settings.generationEndDate > getSuggestedIcsHorizon()
        ? settings.generationEndDate
        : getSuggestedIcsHorizon();
    return parseIcsFile(rawContent, {
      tags,
      defaultImportance,
      defaultTagId,
      maxHorizonDate: horizon,
    });
  }, [rawContent, tags, defaultImportance, defaultTagId, settings.generationEndDate]);

  const preparedEvents = useMemo(() => {
    return parsed.events.map((ev) => {
      const resolvedTagId = ev.tagId || defaultTagId;
      return {
        ...ev,
        tagId: resolvedTagId,
        category: inferCategoryFromTagId(resolvedTagId),
        customRules: allowCoexistence
          ? {
              canShift: ev.importance === 3 || ev.importance === 4,
              canReduce: ev.importance === 2 || ev.importance === 4,
              canCrossDayShift: ev.customRules?.canCrossDayShift ?? false,
              allowCoexistence: true,
            }
          : ev.customRules,
      };
    });
  }, [parsed.events, defaultTagId, allowCoexistence]);

  const importPlan = useMemo(
    () => planIcsImport(preparedEvents, existingEvents, settings),
    [preparedEvents, existingEvents, settings]
  );

  const focusDate =
    importPlan.importedEvents[0]?.date ??
    preparedEvents[0]?.date ??
    existingEvents[0]?.date ??
    getTodayISO();

  const allWarnings = [...parsed.warnings, ...importPlan.warnings];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ics-import-title"
    >
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarArrowUp className="w-4 h-4 text-[#1A73E8] shrink-0" />
            <h2
              id="ics-import-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Importer un calendrier (.ics) — {fileName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {parsed.events.length === 0 ? (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-4 text-sm text-amber-900 dark:text-amber-200">
              Aucune activité valide n’a été trouvée dans ce fichier .ics.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/60 p-3.5 text-xs text-blue-950 dark:text-blue-100 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {parsed.calendarName ? `${parsed.calendarName} · ` : ''}
                    {importPlan.importedEvents.length} activité
                    {importPlan.importedEvents.length > 1 ? 's' : ''} prête
                    {importPlan.importedEvents.length > 1 ? 's' : ''} à être importée
                    {importPlan.importedEvents.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-blue-800 dark:text-blue-300 tabular-nums">
                    {parsed.rawEventCount} élément{parsed.rawEventCount > 1 ? 's' : ''} détecté
                    {parsed.rawEventCount > 1 ? 's' : ''} dans le fichier
                    {importPlan.skippedDuplicatesCount > 0
                      ? ` · ${importPlan.skippedDuplicatesCount} doublon${
                          importPlan.skippedDuplicatesCount > 1 ? 's' : ''
                        } déjà présent${importPlan.skippedDuplicatesCount > 1 ? 's' : ''} ignoré${
                          importPlan.skippedDuplicatesCount > 1 ? 's' : ''
                        }`
                      : ''}
                  </div>
                </div>
              </div>

              {/* Options d'import */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 items-end">
                <div>
                  <label
                    htmlFor="ics-imp"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Importance attribuée
                  </label>
                  <select
                    id="ics-imp"
                    value={defaultImportance}
                    onChange={(e) => setDefaultImportance(Number(e.target.value) as ImportanceLevel)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                  >
                    {IMPORTANCE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {IMPORTANCE_META[lvl].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ics-tag"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Tag par défaut (facultatif)
                  </label>
                  <select
                    id="ics-tag"
                    value={defaultTagId}
                    onChange={(e) => setDefaultTagId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                  >
                    <option value="">Aucun tag (sauf correspondance)</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowCoexistence}
                    onChange={(e) => setAllowCoexistence(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#1A73E8]"
                  />
                  <span>Permettre la coexistence sur cet import</span>
                </label>
              </div>

              {importPlan.unresolvedConflicts.length > 0 && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 space-y-2">
                  <div className="flex items-start gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      {importPlan.unresolvedConflicts.length} conflit
                      {importPlan.unresolvedConflicts.length > 1 ? 's' : ''} non résolu
                      {importPlan.unresolvedConflicts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300 font-mono tabular-nums max-h-28 overflow-y-auto">
                    {importPlan.unresolvedConflicts.slice(0, 10).map((c) => (
                      <li key={c.id}>
                        {formatDateShortFr(c.date)} · {c.title} ({minToTime(c.startMin)}–
                        {minToTime(c.endMin)})
                      </li>
                    ))}
                  </ul>
                  {allWarnings.length > 0 && (
                    <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300 max-h-28 overflow-y-auto">
                      {allWarnings.slice(0, 6).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    Les règles automatiques ne permettent pas de résoudre ces chevauchements sans coexistence autorisée.
                  </p>
                </div>
              )}

              {allWarnings.length > 0 && importPlan.unresolvedConflicts.length === 0 && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-3.5 space-y-1.5">
                  {allWarnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {importPlan.importedEvents.length > 0 && (
                <CalendarDiffPreview
                  beforeEvents={existingEvents}
                  afterEvents={importPlan.nextEvents}
                  changes={importPlan.changes}
                  unresolvedConflicts={importPlan.unresolvedConflicts}
                  tags={tags}
                  focusDate={focusDate}
                  highlightAfterIds={importPlan.importedEvents.map((e) => e.id)}
                />
              )}
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {importPlan.importedEvents.length === 0 ? 'Fermer' : 'Annuler'}
            </button>
            {importPlan.importedEvents.length > 0 && importPlan.unresolvedConflicts.length === 0 && (
              <button
                type="button"
                onClick={() => onConfirmImport(importPlan, fileName)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Importer ({importPlan.importedEvents.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
