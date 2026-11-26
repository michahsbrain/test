import React, {useState} from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  ActivityDefinition,
  CalendarEvent,
  ImportanceLevel,
  PlannerSettings,
  ReorganizationPlan,
  TagDefinition,
} from '../types/planner';
import {createId, DEFAULT_IMPORTANCE, planEventInsertion} from '../engine/scheduler';
import {
  formatDateShortFr,
  formatDuration,
  getWeekdayLong,
  minToTime,
  timeToMin,
} from '../utils/dateUtils';
import {IMPORTANCE_META, inferCategoryFromTagId, resolveTagInfo} from '../utils/eventStyles';
import {
  buildSingleEventIcsFilename,
  exportEventsToIcs,
  triggerIcsDownload,
} from '../utils/icsUtils';
import {CalendarDiffPreview} from './CalendarDiffPreview';
import {DurationInput} from './DurationInput';

const IMPORTANCE_LEVELS: ImportanceLevel[] = [4, 3, 2, 1];

interface EventModalProps {
  initialDate: string;
  initialStartMin: number;
  initialEndMin: number;
  editingEvent: CalendarEvent | null;
  presetActivity?: ActivityDefinition | null;
  initialPendingPlan?: ReorganizationPlan | null;
  events: CalendarEvent[];
  settings: PlannerSettings;
  tags: TagDefinition[];
  activities: ActivityDefinition[];
  onConfirmPlan: (plan: ReorganizationPlan, snapshotLabel: string) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onClose: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({
  initialDate,
  initialStartMin,
  initialEndMin,
  editingEvent,
  presetActivity,
  initialPendingPlan = null,
  events,
  settings,
  tags,
  activities,
  onConfirmPlan,
  onDeleteEvent,
  onClose,
}) => {
  const [title, setTitle] = useState(
    initialPendingPlan?.newEvent.title ?? editingEvent?.title ?? presetActivity?.title ?? ''
  );
  const [date, setDate] = useState(
    initialPendingPlan?.newEvent.date ?? editingEvent?.date ?? initialDate
  );
  const [startTime, setStartTime] = useState(
    minToTime(
      initialPendingPlan?.newEvent.startMin ??
        (editingEvent ? editingEvent.startMin : initialStartMin)
    )
  );
  const [endTime, setEndTime] = useState(
    minToTime(
      initialPendingPlan?.newEvent.endMin ??
        (editingEvent
          ? editingEvent.endMin
          : presetActivity
          ? Math.min(1440, initialStartMin + (presetActivity.durationMin ?? 60))
          : initialEndMin)
    )
  );
  const [importance, setImportance] = useState<ImportanceLevel>(
    initialPendingPlan?.newEvent.importance ??
      editingEvent?.importance ??
      presetActivity?.importance ??
      DEFAULT_IMPORTANCE
  );
  const [tagId, setTagId] = useState<string>(
    editingEvent?.tagId ?? presetActivity?.tagId ?? ''
  );
  const [selectedActivityId, setSelectedActivityId] = useState<string>(
    editingEvent?.activityId ?? presetActivity?.id ?? ''
  );
  const [notes, setNotes] = useState(editingEvent?.notes ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ReorganizationPlan | null>(initialPendingPlan);
  const [modalStep, setModalStep] = useState<'detail' | 'edit'>(
    editingEvent && !initialPendingPlan ? 'detail' : 'edit'
  );

  const computedStartMin = timeToMin(startTime);
  const computedEndMin =
    endTime === '00:00' && computedStartMin > 0 ? 1440 : timeToMin(endTime);
  const currentDurationMin = Math.max(5, computedEndMin - computedStartMin);

  const editingTagInfo = editingEvent
    ? resolveTagInfo(editingEvent.tagId, editingEvent.category, tags)
    : null;
  const editingDurationMin = editingEvent ? editingEvent.endMin - editingEvent.startMin : 0;

  const applyActivityPreset = (actId: string) => {
    setSelectedActivityId(actId);
    const act = activities.find((a) => a.id === actId);
    if (!act) {
      setImportance(DEFAULT_IMPORTANCE);
      return;
    }
    setTitle(act.title);
    setImportance(act.importance);
    setTagId(act.tagId ?? '');
    if (act.durationMin) {
      const sMin = timeToMin(startTime);
      setEndTime(minToTime(Math.min(1440, sMin + act.durationMin)));
    }
  };

  const buildCandidateEvent = (): CalendarEvent | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Veuillez saisir un nom pour cette activité.');
      return null;
    }

    const startMin = timeToMin(startTime);
    const endMin = endTime === '00:00' && startMin > 0 ? 1440 : timeToMin(endTime);
    if (endMin <= startMin) {
      setFormError("L'heure de fin doit être postérieure à l'heure de début.");
      return null;
    }

    const linkedActivity = activities.find((a) => a.id === selectedActivityId);

    return {
      id: editingEvent?.id ?? createId('act'),
      title: trimmedTitle,
      date,
      startMin,
      endMin,
      importance,
      category: inferCategoryFromTagId(tagId),
      tagId,
      source: editingEvent?.source ?? 'manual',
      routineEntryId: editingEvent?.routineEntryId,
      activityId: selectedActivityId || editingEvent?.activityId,
      customRules: linkedActivity?.rules ?? editingEvent?.customRules,
      notes: notes.trim() || undefined,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const candidate = buildCandidateEvent();
    if (!candidate) return;

    const plan = planEventInsertion(candidate, events, settings, {
      editingEventId: editingEvent?.id,
      isUserDirectEdit: Boolean(editingEvent),
    });

    if (plan.requiresConfirmation) {
      setPendingPlan(plan);
      return;
    }

    const label = editingEvent
      ? `Modification « ${candidate.title} »`
      : `Ajout « ${candidate.title} »`;
    onConfirmPlan(plan, label);
  };

  const handleConfirmReorg = () => {
    if (!pendingPlan || pendingPlan.unresolvedConflicts.length > 0) return;
    const label = editingEvent
      ? `Réorganisation suite à « ${pendingPlan.newEvent.title} »`
      : `Ajout & réorganisation « ${pendingPlan.newEvent.title} »`;
    onConfirmPlan(pendingPlan, label);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      <div
        className={`w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden max-h-[92vh] flex flex-col ${
          pendingPlan ? 'max-w-5xl' : 'max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0">
          <h2
            id="event-modal-title"
            className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {pendingPlan
              ? pendingPlan.unresolvedConflicts.length > 0
                ? 'Conflit impossible à résoudre automatiquement'
                : 'Confirmer le réarrangement du planning'
              : editingEvent && modalStep === 'detail'
              ? 'Détail de l’activité'
              : editingEvent
              ? 'Modifier l’activité'
              : 'Planifier une activité'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 2: Conflict / Reorganization Confirmation */}
        {pendingPlan ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/60 p-3.5 text-sm text-blue-950 dark:text-blue-100">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{pendingPlan.newEvent.title}</span>
                <span className="text-xs font-medium opacity-80">
                  {IMPORTANCE_META[pendingPlan.newEvent.importance].shortLabel}
                </span>
              </div>
              <div className="mt-1 text-xs text-blue-800 dark:text-blue-300 font-mono tabular-nums">
                {formatDateShortFr(pendingPlan.newEvent.date)} ·{' '}
                {minToTime(pendingPlan.newEvent.startMin)} – {minToTime(pendingPlan.newEvent.endMin)}
              </div>
            </div>

            {pendingPlan.unresolvedConflicts.length > 0 && (
              <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 space-y-2">
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    Conflit non résolu avec {pendingPlan.unresolvedConflicts.length} activité
                    {pendingPlan.unresolvedConflicts.length > 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300 font-mono tabular-nums">
                  {pendingPlan.unresolvedConflicts.map((c) => (
                    <li key={c.id}>
                      {c.title} ({IMPORTANCE_META[c.importance].shortLabel}) ·{' '}
                      {formatDateShortFr(c.date)} · {minToTime(c.startMin)}–{minToTime(c.endMin)}
                    </li>
                  ))}
                </ul>
                {pendingPlan.warnings.length > 0 && (
                  <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300">
                    {pendingPlan.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                  Les règles automatiques ne permettent pas de résoudre ce conflit et la coexistence n’est pas autorisée. Modifiez l’horaire ou annulez l’opération.
                </p>
              </div>
            )}

            {pendingPlan.warnings.length > 0 && pendingPlan.unresolvedConflicts.length === 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-3.5 space-y-1.5">
                {pendingPlan.warnings.map((w, i) => (
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

            <CalendarDiffPreview
              beforeEvents={events}
              afterEvents={pendingPlan.nextEvents}
              changes={pendingPlan.changes}
              unresolvedConflicts={pendingPlan.unresolvedConflicts}
              tags={tags}
              focusDate={pendingPlan.newEvent.date}
              highlightAfterIds={[pendingPlan.newEvent.id]}
            />

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {editingEvent ? 'Annuler' : 'Annuler l’ajout'}
              </button>
              <button
                type="button"
                onClick={() => setPendingPlan(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Modifier l’horaire
              </button>

              {pendingPlan.unresolvedConflicts.length === 0 && (
                <button
                  type="button"
                  onClick={handleConfirmReorg}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirmer
                </button>
              )}
            </div>
          </div>
        ) : editingEvent && modalStep === 'detail' ? (
          /* Detail View on single tap/click */
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 break-words">
                {editingEvent.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editingEvent.source === 'routine' ? 'Routine quotidienne' : 'Activité ponctuelle'}
              </p>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60">
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 text-right">
                  {getWeekdayLong(editingEvent.date)} · {formatDateShortFr(editingEvent.date)}
                </span>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Horaire</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {minToTime(editingEvent.startMin)} – {minToTime(editingEvent.endMin)} ·{' '}
                  {formatDuration(editingDurationMin)}
                </span>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tag</span>
                <span className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{backgroundColor: editingTagInfo?.color ?? '#94A3B8'}}
                  />
                  <span>{editingEvent.tagId ? editingTagInfo?.name : 'Aucun tag'}</span>
                </span>
              </div>

              <div className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Importance
                  </span>
                  <span className={`font-semibold ${IMPORTANCE_META[editingEvent.importance].textColor}`}>
                    {IMPORTANCE_META[editingEvent.importance].label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {IMPORTANCE_META[editingEvent.importance].hint}
                </p>
              </div>

              {editingEvent.notes && (
                <div className="px-4 py-3 space-y-1">
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Notes
                  </span>
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                    {editingEvent.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeleteEvent(editingEvent)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ics = exportEventsToIcs([editingEvent], tags, editingEvent.title);
                    triggerIcsDownload(ics, buildSingleEventIcsFilename(editingEvent));
                  }}
                  title="Télécharger au format .ics"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>.ics</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => setModalStep('edit')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modifier
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 1: Activity Form */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {formError && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200">
                {formError}
              </div>
            )}

            {!editingEvent && activities.length > 0 && (
              <div>
                <label
                  htmlFor="evt-preset"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Pré-remplir depuis le répertoire (optionnel)
                </label>
                <select
                  id="evt-preset"
                  value={selectedActivityId}
                  onChange={(e) => applyActivityPreset(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                >
                  <option value="">Saisie ponctuelle libre</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({IMPORTANCE_META[a.importance].shortLabel}
                      {a.durationMin ? ` · ${formatDuration(a.durationMin)}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="evt-title"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Nom de l’activité
              </label>
              <input
                id="evt-title"
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Rendez-vous médical, Révision, Réunion..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evt-date"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Date
                </label>
                <input
                  id="evt-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="evt-duration"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Durée (min / h)
                </label>
                <DurationInput
                  id="evt-duration"
                  valueMin={currentDurationMin}
                  minMin={5}
                  maxMin={Math.max(5, 1440 - computedStartMin)}
                  size="md"
                  onChangeMin={(nextDur) => {
                    if (nextDur !== undefined) {
                      setEndTime(minToTime(Math.min(1440, computedStartMin + nextDur)));
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evt-start"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Début
                </label>
                <input
                  id="evt-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const nextStartStr = e.target.value;
                    const nextStart = timeToMin(nextStartStr);
                    setStartTime(nextStartStr);
                    setEndTime(minToTime(Math.min(1440, nextStart + currentDurationMin)));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="evt-end"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Fin
                </label>
                <input
                  id="evt-end"
                  type="time"
                  value={endTime === '24:00' ? '23:59' : endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evt-importance"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Importance
                </label>
                <select
                  id="evt-importance"
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value) as ImportanceLevel)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#1A73E8] focus:outline-none"
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
                  htmlFor="evt-tag"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Tag (facultatif)
                </label>
                <select
                  id="evt-tag"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
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

            <div>
              <label
                htmlFor="evt-notes"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Notes (optionnel)
              </label>
              <textarea
                id="evt-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Détails, lieu, remarques..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#1A73E8] focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {editingEvent ? (
                <button
                  type="button"
                  onClick={() => onDeleteEvent(editingEvent)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                >
                  {editingEvent ? 'Mettre à jour' : 'Ajouter au planning'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
