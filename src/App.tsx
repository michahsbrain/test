import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, Check, RotateCcw, X} from 'lucide-react';
import {
  DesktopSideRail,
  MobileBottomBar,
  MobileTopBar,
} from './components/AppNavigation';
import {CalendarDiffPreview} from './components/CalendarDiffPreview';
import {CalendarGrid} from './components/CalendarGrid';
import {CalendarSidebar} from './components/CalendarSidebar';
import {CreationView} from './components/CreationView';
import {EventModal} from './components/EventModal';
import {IcsImportModal} from './components/IcsImportModal';
import {OfflineIndicator} from './components/OfflineIndicator';
import {SettingsView} from './components/SettingsView';
import {TrackingView} from './components/TrackingView';
import {
  generatePlanning,
  planEventInsertion,
  planRoutineGeneration,
} from './engine/scheduler';
import {
  createDefaultActivities,
  createDefaultRoutineProgram,
  createDefaultSettings,
  createDefaultTags,
  loadPlannerState,
  normalizePersistedState,
  PersistedPlannerState,
  savePlannerState,
} from './storage/localDb';
import {
  ActiveVolet,
  ActivityDefinition,
  CalendarEvent,
  CalendarViewMode,
  IcsImportPlan,
  PlannerSettings,
  ReorganizationPlan,
  RoutineEntry,
  RoutineGenerationPlan,
  TagDefinition,
  UndoSnapshot,
} from './types/planner';
import {formatDateShortFr, getTodayISO, minToTime} from './utils/dateUtils';
import {
  exportEventsToIcs,
  isValidIcsContent,
  triggerIcsDownload,
} from './utils/icsUtils';

const MAX_UNDO_HISTORY = 15;
const UNDO_WINDOW_MS = 60_000; // 1 minute pour revenir en arrière ou garder la modification

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [activeVolet, setActiveVolet] = useState<ActiveVolet>('planning');
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'week'
  );
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO);

  const [settings, setSettings] = useState<PlannerSettings>(createDefaultSettings);
  const [activities, setActivities] = useState<ActivityDefinition[]>(createDefaultActivities);
  const [routineProgram, setRoutineProgram] = useState<RoutineEntry[]>(createDefaultRoutineProgram);
  const [tags, setTags] = useState<TagDefinition[]>(createDefaultTags);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [undoRemainingSec, setUndoRemainingSec] = useState<number>(0);
  const [hideRoutine, setHideRoutine] = useState<boolean>(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);

  // Modal state for creating / editing events
  const [modalState, setModalState] = useState<{
    open: boolean;
    date: string;
    startMin: number;
    endMin: number;
    editingEvent: CalendarEvent | null;
    presetActivity: ActivityDefinition | null;
    pendingPlan: ReorganizationPlan | null;
  }>({
    open: false,
    date: getTodayISO(),
    startMin: 9 * 60,
    endMin: 10 * 60,
    editingEvent: null,
    presetActivity: null,
    pendingPlan: null,
  });

  const [pendingGenerationPlan, setPendingGenerationPlan] =
    useState<RoutineGenerationPlan | null>(null);

  const [pendingIcsImport, setPendingIcsImport] = useState<{
    fileName: string;
    rawContent: string;
  } | null>(null);

  // Temporary feedback banner after reorganization or generation
  const [toast, setToast] = useState<{
    message: string;
    canUndo: boolean;
  } | null>(null);

  // Hydrate 100% locally from IndexedDB / localStorage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadPlannerState();
      if (cancelled) return;

      if (saved) {
        setSettings(saved.settings);
        setActivities(saved.activities);
        setRoutineProgram(saved.routineProgram);
        setTags(saved.tags);
        setEvents(saved.events);
        const now = Date.now();
        const validUndo = (saved.undoStack ?? []).filter(
          (s) => now - s.timestamp < UNDO_WINDOW_MS
        );
        setUndoStack(validUndo);
        setLastGeneratedAt(saved.lastGeneratedAt ?? null);
      } else {
        const defSettings = createDefaultSettings();
        const defActivities = createDefaultActivities();
        const defRoutineProgram = createDefaultRoutineProgram();
        const defTags = createDefaultTags();
        const initialEvents = generatePlanning(defSettings, defActivities, defRoutineProgram);
        setSettings(defSettings);
        setActivities(defActivities);
        setRoutineProgram(defRoutineProgram);
        setTags(defTags);
        setEvents(initialEvents);
        setLastGeneratedAt(Date.now());
      }
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every state mutation locally
  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedPlannerState = {
      settings,
      activities,
      routineProgram,
      tags,
      events,
      undoStack,
      lastGeneratedAt,
    };
    void savePlannerState(state);
  }, [hydrated, settings, activities, routineProgram, tags, events, undoStack, lastGeneratedAt]);

  // Apply light/dark theme to root html element
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [settings.theme]);

  // 1-minute countdown window for Revenir en arrière / Garder la modification
  useEffect(() => {
    if (undoStack.length === 0) {
      setUndoRemainingSec(0);
      return;
    }

    const updateRemaining = () => {
      const elapsed = Date.now() - undoStack[0].timestamp;
      const leftMs = UNDO_WINDOW_MS - elapsed;
      if (leftMs <= 0) {
        setUndoRemainingSec(0);
        setUndoStack([]);
        setToast((prev) => (prev?.canUndo ? null : prev));
        return false;
      }
      setUndoRemainingSec(Math.ceil(leftMs / 1000));
      return true;
    };

    if (!updateRemaining()) return;

    const id = window.setInterval(() => {
      if (!updateRemaining()) {
        window.clearInterval(id);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [undoStack]);

  const pushUndoSnapshot = useCallback((label: string, snapshotEvents: CalendarEvent[]) => {
    const snap: UndoSnapshot = {
      id: `undo-${Date.now()}`,
      label,
      timestamp: Date.now(),
      events: snapshotEvents,
    };
    setUndoStack((prev) => [snap, ...prev].slice(0, MAX_UNDO_HISTORY));
    setUndoRemainingSec(Math.ceil(UNDO_WINDOW_MS / 1000));
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [latest] = undoStack;
    if (Date.now() - latest.timestamp > UNDO_WINDOW_MS) {
      setUndoStack([]);
      setUndoRemainingSec(0);
      setToast(null);
      return;
    }
    setEvents(latest.events);
    setUndoStack([]);
    setUndoRemainingSec(0);
    setToast({
      message: `Modification annulée (« ${latest.label} » restauré).`,
      canUndo: false,
    });
  }, [undoStack]);

  const handleKeepAction = useCallback(() => {
    setUndoStack([]);
    setUndoRemainingSec(0);
    setToast(null);
  }, []);

  useEffect(() => {
    if (!toast || toast.canUndo) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const planningEvents = useMemo(
    () => (hideRoutine ? events.filter((ev) => ev.source !== 'routine') : events),
    [events, hideRoutine]
  );

  const applyGenerationPlan = useCallback(
    (plan: RoutineGenerationPlan) => {
      pushUndoSnapshot('Avant génération du planning', events);
      setEvents(plan.nextEvents);
      setPendingGenerationPlan(null);
      setLastGeneratedAt(Date.now());
      setSelectedDate(settings.generationStartDate);
      setActiveVolet('planning');
      const endDate =
        settings.generationEndDate >= settings.generationStartDate
          ? settings.generationEndDate
          : settings.generationStartDate;
      const changeSuffix =
        plan.changes.length > 0
          ? ` · ${plan.changes.length} activité${
              plan.changes.length > 1 ? 's' : ''
            } existante${plan.changes.length > 1 ? 's' : ''} ajustée${
              plan.changes.length > 1 ? 's' : ''
            }`
          : '';
      setToast({
        message: `Routine générée du ${formatDateShortFr(
          settings.generationStartDate
        )} au ${formatDateShortFr(endDate)} (${plan.routineEventsCount} activité${
          plan.routineEventsCount > 1 ? 's' : ''
        }${changeSuffix}).`,
        canUndo: true,
      });
    },
    [events, pushUndoSnapshot, settings.generationEndDate, settings.generationStartDate]
  );

  const handleGeneratePlanning = useCallback(() => {
    const plan = planRoutineGeneration(settings, activities, routineProgram, events);
    if (plan.requiresConfirmation) {
      setPendingGenerationPlan(plan);
      return;
    }
    applyGenerationPlan(plan);
  }, [activities, applyGenerationPlan, events, routineProgram, settings]);

  const handleConfirmPlan = useCallback(
    (plan: ReorganizationPlan, snapshotLabel: string) => {
      pushUndoSnapshot(snapshotLabel, events);
      setEvents(plan.nextEvents);
      setModalState((prev) => ({
        ...prev,
        open: false,
        editingEvent: null,
        presetActivity: null,
        pendingPlan: null,
      }));

      if (plan.changes.length > 0) {
        setToast({
          message: `Planning réorganisé (${plan.changes.length} ajustement${
            plan.changes.length > 1 ? 's' : ''
          }).`,
          canUndo: true,
        });
      } else {
        setToast({
          message: `Activité « ${plan.newEvent.title} » enregistrée.`,
          canUndo: true,
        });
      }
    },
    [events, pushUndoSnapshot]
  );

  const handleDeleteEvent = useCallback(
    (eventToDelete: CalendarEvent) => {
      pushUndoSnapshot(`Suppression « ${eventToDelete.title} »`, events);
      setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      setModalState((prev) => ({
        ...prev,
        open: false,
        editingEvent: null,
        presetActivity: null,
        pendingPlan: null,
      }));
      setToast({
        message: `Activité « ${eventToDelete.title} » supprimée.`,
        canUndo: true,
      });
    },
    [events, pushUndoSnapshot]
  );

  const handleOpenCreateModal = (
    dateStr: string,
    startMin: number,
    endMin: number,
    presetActivity: ActivityDefinition | null = null
  ) => {
    setModalState({
      open: true,
      date: dateStr,
      startMin,
      endMin,
      editingEvent: null,
      presetActivity,
      pendingPlan: null,
    });
  };

  const handleOpenEditModal = (ev: CalendarEvent) => {
    setModalState({
      open: true,
      date: ev.date,
      startMin: ev.startMin,
      endMin: ev.endMin,
      editingEvent: ev,
      presetActivity: null,
      pendingPlan: null,
    });
  };

  const handleMoveEvent = useCallback(
    (
      ev: CalendarEvent,
      targetDate: string,
      targetStartMin: number,
      targetEndMin: number
    ) => {
      const movedEvent: CalendarEvent = {
        ...ev,
        date: targetDate,
        startMin: targetStartMin,
        endMin: targetEndMin,
      };
      const plan = planEventInsertion(movedEvent, events, settings, {
        editingEventId: ev.id,
        isUserDirectEdit: true,
      });

      if (
        plan.requiresConfirmation ||
        (settings.rules.confirmBeforeReorganize &&
          (plan.changes.length > 0 || plan.warnings.length > 0))
      ) {
        setModalState({
          open: true,
          date: targetDate,
          startMin: targetStartMin,
          endMin: targetEndMin,
          editingEvent: ev,
          presetActivity: null,
          pendingPlan: plan,
        });
        return;
      }

      handleConfirmPlan(plan, `Déplacement « ${ev.title} »`);
    },
    [events, handleConfirmPlan, settings]
  );

  const handlePlanActivity = (activity: ActivityDefinition) => {
    setActiveVolet('planning');
    const startMin = 9 * 60;
    const dur = activity.durationMin ?? 60;
    handleOpenCreateModal(
      selectedDate,
      startMin,
      Math.min(1440, startMin + dur),
      activity
    );
  };



  const handleExportBackup = () => {
    const payload: PersistedPlannerState = {
      settings,
      activities,
      routineProgram,
      tags,
      events,
      undoStack,
      lastGeneratedAt,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tempolocal-sauvegarde-${getTodayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportIcs = useCallback(() => {
    const ics = exportEventsToIcs(events, tags, 'TempoLocal');
    triggerIcsDownload(ics, `tempolocal-planning-${getTodayISO()}.ics`);
    setToast({
      message: `Planning exporté en .ics (${events.length} activité${events.length > 1 ? 's' : ''}).`,
      canUndo: false,
    });
  }, [events, tags]);

  const handleRequestImportIcs = useCallback(async (file: File) => {
    const text = await file.text();
    if (!isValidIcsContent(text)) {
      setToast({
        message: 'Fichier .ics invalide (en-tête VCALENDAR introuvable).',
        canUndo: false,
      });
      throw new Error('Invalid ICS content');
    }
    setPendingIcsImport({
      fileName: file.name,
      rawContent: text,
    });
  }, []);

  const handleConfirmIcsImport = useCallback(
    (plan: IcsImportPlan, fileName: string) => {
      pushUndoSnapshot(`Import .ics « ${fileName} »`, events);
      setEvents(plan.nextEvents);
      setPendingIcsImport(null);
      if (plan.importedEvents[0]?.date) {
        setSelectedDate(plan.importedEvents[0].date);
      }
      setActiveVolet('planning');
      const changeSuffix =
        plan.changes.length > 0
          ? ` · ${plan.changes.length} activité${plan.changes.length > 1 ? 's' : ''} ajustée${
              plan.changes.length > 1 ? 's' : ''
            }`
          : '';
      setToast({
        message: `${plan.importedEvents.length} activité${
          plan.importedEvents.length > 1 ? 's' : ''
        } importée${plan.importedEvents.length > 1 ? 's' : ''} depuis ${fileName}${changeSuffix}.`,
        canUndo: true,
      });
    },
    [events, pushUndoSnapshot]
  );

  const handleImportBackup = async (file: File) => {
    const text = await file.text();
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (
      !raw.settings ||
      !Array.isArray(raw.events) ||
      (!Array.isArray(raw.activities) && !Array.isArray(raw.routines))
    ) {
      throw new Error('Invalid backup structure');
    }
    const normalized = normalizePersistedState(raw);
    pushUndoSnapshot('Avant import de sauvegarde', events);
    setSettings(normalized.settings);
    setActivities(normalized.activities);
    setRoutineProgram(normalized.routineProgram);
    setTags(normalized.tags);
    setEvents(normalized.events);
    setLastGeneratedAt(normalized.lastGeneratedAt ?? Date.now());
  };

  const handleResetDefaults = () => {
    pushUndoSnapshot('Avant réinitialisation', events);
    const defSettings = createDefaultSettings();
    const defActivities = createDefaultActivities();
    const defRoutineProgram = createDefaultRoutineProgram();
    const defTags = createDefaultTags();
    setSettings(defSettings);
    setActivities(defActivities);
    setRoutineProgram(defRoutineProgram);
    setTags(defTags);
    const nextEvents = generatePlanning(defSettings, defActivities, defRoutineProgram);
    setEvents(nextEvents);
    setLastGeneratedAt(Date.now());
    setToast({
      message: 'Paramètres, activités, tags et planning réinitialisés par défaut.',
      canUndo: true,
    });
  };

  if (!hydrated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Chargement du planning local…
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file && file.name.toLowerCase().endsWith('.ics')) {
          e.preventDefault();
          void handleRequestImportIcs(file).catch(() => {});
        }
      }}
      className="h-screen w-screen flex flex-col md:flex-row bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden"
    >
      {/* Mobile Compact Header */}
      <MobileTopBar
        activeVolet={activeVolet}
        onSelectVolet={setActiveVolet}
        onNewEvent={() => {
          setActiveVolet('planning');
          handleOpenCreateModal(selectedDate, 9 * 60, 10 * 60);
        }}
      />

      {/* Desktop Twitter-style Side Rail */}
      <DesktopSideRail
        activeVolet={activeVolet}
        onSelectVolet={setActiveVolet}
        onNewEvent={() => {
          setActiveVolet('planning');
          handleOpenCreateModal(selectedDate, 9 * 60, 10 * 60);
        }}
      />

      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {activeVolet === 'planning' ? (
          <>
            <CalendarSidebar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={planningEvents}
              tags={tags}
              settings={settings}
              undoStack={undoStack}
              undoRemainingSec={undoRemainingSec}
              onUndo={handleUndo}
              onKeepAction={handleKeepAction}
              onOpenSettings={() => setActiveVolet('settings')}
              onExportIcs={handleExportIcs}
              onImportIcs={handleRequestImportIcs}
            />
            <CalendarGrid
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              events={planningEvents}
              tags={tags}
              settings={settings}
              hideRoutine={hideRoutine}
              onToggleHideRoutine={() => setHideRoutine((prev) => !prev)}
              onSlotClick={(d, s, e) => handleOpenCreateModal(d, s, e)}
              onEventClick={handleOpenEditModal}
              onMoveEvent={handleMoveEvent}
              onOpenSettings={() => setActiveVolet('settings')}
            />
          </>
        ) : activeVolet === 'creation' ? (
          <CreationView
            activities={activities}
            tags={tags}
            events={events}
            onUpdateActivities={(nextActivities) => {
              setActivities(nextActivities);
              const byId = new Map(nextActivities.map((a) => [a.id, a]));
              setRoutineProgram((prev) => prev.filter((r) => byId.has(r.activityId)));
              setEvents((prev) =>
                prev.map((ev) => {
                  const linked = ev.activityId ? byId.get(ev.activityId) : undefined;
                  return linked ? {...ev, customRules: linked.rules} : ev;
                })
              );
            }}
            onUpdateTags={setTags}
            onPlanActivity={handlePlanActivity}
          />
        ) : activeVolet === 'tracking' ? (
          <TrackingView
            selectedDate={selectedDate}
            events={events}
            tags={tags}
            activities={activities}
          />
        ) : (
          <SettingsView
            settings={settings}
            activities={activities}
            routineProgram={routineProgram}
            eventsCount={events.length}
            canUndo={undoStack.length > 0 && undoRemainingSec > 0}
            undoRemainingSec={undoRemainingSec}
            lastGeneratedAt={lastGeneratedAt}
            onUpdateSettings={setSettings}
            onUpdateRoutineProgram={setRoutineProgram}
            onGeneratePlanning={handleGeneratePlanning}
            onUndo={handleUndo}
            onKeepAction={handleKeepAction}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onExportIcs={handleExportIcs}
            onImportIcs={handleRequestImportIcs}
            onResetDefaults={handleResetDefaults}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Icon Bar */}
      <MobileBottomBar
        activeVolet={activeVolet}
        onSelectVolet={setActiveVolet}
      />

      {modalState.open && (
        <EventModal
          initialDate={modalState.date}
          initialStartMin={modalState.startMin}
          initialEndMin={modalState.endMin}
          editingEvent={modalState.editingEvent}
          presetActivity={modalState.presetActivity}
          initialPendingPlan={modalState.pendingPlan}
          events={events}
          settings={settings}
          tags={tags}
          activities={activities}
          onConfirmPlan={handleConfirmPlan}
          onDeleteEvent={handleDeleteEvent}
          onClose={() =>
            setModalState((prev) => ({
              ...prev,
              open: false,
              editingEvent: null,
              presetActivity: null,
              pendingPlan: null,
            }))
          }
        />
      )}

      {pendingGenerationPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gen-confirm-title"
        >
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0">
              <h2
                id="gen-confirm-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {pendingGenerationPlan.unresolvedConflicts.length > 0
                  ? 'Conflit impossible à résoudre automatiquement'
                  : 'Confirmer le réarrangement des activités existantes'}
              </h2>
              <button
                type="button"
                onClick={() => setPendingGenerationPlan(null)}
                aria-label="Fermer"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/60 p-3.5 text-xs text-blue-950 dark:text-blue-100 space-y-1">
                <div className="font-semibold">
                  Nouvelle routine du {formatDateShortFr(settings.generationStartDate)} au{' '}
                  {formatDateShortFr(
                    settings.generationEndDate >= settings.generationStartDate
                      ? settings.generationEndDate
                      : settings.generationStartDate
                  )}
                </div>
                <div className="text-blue-800 dark:text-blue-300">
                  L’ancienne routine est remplacée ({pendingGenerationPlan.routineEventsCount}{' '}
                  activité{pendingGenerationPlan.routineEventsCount > 1 ? 's' : ''} générée
                  {pendingGenerationPlan.routineEventsCount > 1 ? 's' : ''}). Vos activités
                  existantes en conflit s’ajustent selon leurs règles.
                </div>
              </div>

              {pendingGenerationPlan.unresolvedConflicts.length > 0 && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 space-y-2">
                  <div className="flex items-start gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      {pendingGenerationPlan.unresolvedConflicts.length} conflit
                      {pendingGenerationPlan.unresolvedConflicts.length > 1 ? 's' : ''} non résolu
                      {pendingGenerationPlan.unresolvedConflicts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300 font-mono tabular-nums max-h-28 overflow-y-auto">
                    {pendingGenerationPlan.unresolvedConflicts.slice(0, 10).map((c) => (
                      <li key={c.id}>
                        {formatDateShortFr(c.date)} · {c.title} ({minToTime(c.startMin)}–
                        {minToTime(c.endMin)})
                      </li>
                    ))}
                  </ul>
                  {pendingGenerationPlan.warnings.length > 0 && (
                    <ul className="space-y-1 pl-6 text-xs text-rose-800 dark:text-rose-300 max-h-28 overflow-y-auto">
                      {pendingGenerationPlan.warnings.slice(0, 6).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    Les règles automatiques ne permettent pas de résoudre ce conflit et la coexistence n’est pas autorisée. Ajustez les horaires dans la routine ou activez la coexistence dans Création.
                  </p>
                </div>
              )}

              {pendingGenerationPlan.warnings.length > 0 &&
                pendingGenerationPlan.unresolvedConflicts.length === 0 && (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-3.5 space-y-1.5">
                    {pendingGenerationPlan.warnings.map((w, i) => (
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
                afterEvents={pendingGenerationPlan.nextEvents}
                changes={pendingGenerationPlan.changes}
                unresolvedConflicts={pendingGenerationPlan.unresolvedConflicts}
                tags={tags}
                focusDate={settings.generationStartDate}
                highlightNewRoutine
              />

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPendingGenerationPlan(null)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {pendingGenerationPlan.unresolvedConflicts.length > 0
                    ? 'Ajuster les horaires'
                    : 'Annuler'}
                </button>
                {pendingGenerationPlan.unresolvedConflicts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => applyGenerationPlan(pendingGenerationPlan)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1557B0] transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Confirmer et générer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingIcsImport && (
        <IcsImportModal
          fileName={pendingIcsImport.fileName}
          rawContent={pendingIcsImport.rawContent}
          existingEvents={events}
          settings={settings}
          tags={tags}
          onConfirmImport={handleConfirmIcsImport}
          onClose={() => setPendingIcsImport(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-4 right-4 z-40 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 px-4 py-3 text-xs font-medium text-white shadow-lg max-w-[calc(100vw-2rem)]"
        >
          <span>{toast.message}</span>
          {toast.canUndo && undoStack.length > 0 && undoRemainingSec > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono tabular-nums text-[11px] text-slate-300 mr-0.5">
                {undoRemainingSec}s
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Revenir en arrière
              </button>
              <button
                type="button"
                onClick={handleKeepAction}
                className="inline-flex items-center gap-1 rounded-md bg-[#1A73E8] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1557B0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Garder
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fermer la notification"
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
