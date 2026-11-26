import React, {useEffect, useState} from 'react';

export type DurationUnit = 'min' | 'h';

interface DurationInputProps {
  id?: string;
  valueMin: number | undefined;
  onChangeMin: (nextMin: number | undefined) => void;
  minMin?: number;
  maxMin?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  defaultUnit?: DurationUnit;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

function formatUnitValue(minutes: number | undefined, unit: DurationUnit): string {
  if (minutes === undefined) return '';
  if (unit === 'min') return String(minutes);
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

export const DurationInput: React.FC<DurationInputProps> = ({
  id,
  valueMin,
  onChangeMin,
  minMin = 5,
  maxMin = 720,
  allowEmpty = false,
  placeholder,
  defaultUnit,
  size = 'sm',
  ariaLabel,
}) => {
  const [unit, setUnit] = useState<DurationUnit>(() => {
    if (defaultUnit) return defaultUnit;
    if (valueMin !== undefined && valueMin >= 60 && valueMin % 30 === 0) return 'h';
    return 'min';
  });

  const [draft, setDraft] = useState<string>(() => formatUnitValue(valueMin, unit));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatUnitValue(valueMin, unit));
    }
  }, [valueMin, unit, focused]);

  const commitValue = (raw: string, targetUnit: DurationUnit) => {
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '') {
      if (allowEmpty) onChangeMin(undefined);
      return;
    }
    const parsed = parseFloat(normalized);
    if (Number.isNaN(parsed) || parsed <= 0) return;

    const rawMinutes = targetUnit === 'h' ? Math.round(parsed * 60) : Math.round(parsed);
    const clamped = Math.max(minMin, Math.min(maxMin, rawMinutes));
    onChangeMin(clamped);
  };

  const handleUnitSwitch = (nextUnit: DurationUnit) => {
    if (nextUnit === unit) return;
    setUnit(nextUnit);
    setDraft(formatUnitValue(valueMin, nextUnit));
  };

  const inputPad = size === 'md' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';
  const btnPad = size === 'md' ? 'px-2.5 text-xs' : 'px-2 text-[11px]';

  return (
    <div className="flex items-stretch rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus-within:border-[#1A73E8] overflow-hidden">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={unit === 'h' ? 'any' : 5}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (draft.trim() === '') {
            if (allowEmpty) {
              onChangeMin(undefined);
            } else {
              setDraft(formatUnitValue(valueMin, unit));
            }
          } else {
            commitValue(draft, unit);
            const normalized = draft.replace(',', '.').trim();
            const parsed = parseFloat(normalized);
            if (!Number.isNaN(parsed) && parsed > 0) {
              const rawMinutes = unit === 'h' ? Math.round(parsed * 60) : Math.round(parsed);
              const clamped = Math.max(minMin, Math.min(maxMin, rawMinutes));
              setDraft(formatUnitValue(clamped, unit));
            } else {
              setDraft(formatUnitValue(valueMin, unit));
            }
          }
        }}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(val);
          commitValue(val, unit);
        }}
        className={`flex-1 min-w-0 bg-transparent font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${inputPad}`}
      />
      <div
        role="group"
        aria-label="Unité de durée"
        className="inline-flex items-stretch border-l border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900 shrink-0"
      >
        <button
          type="button"
          onClick={() => handleUnitSwitch('min')}
          className={`${btnPad} font-medium transition-colors cursor-pointer ${
            unit === 'min'
              ? 'bg-white dark:bg-slate-800 text-[#1A73E8] dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          min
        </button>
        <button
          type="button"
          onClick={() => handleUnitSwitch('h')}
          className={`${btnPad} font-medium border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
            unit === 'h'
              ? 'bg-white dark:bg-slate-800 text-[#1A73E8] dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          h
        </button>
      </div>
    </div>
  );
};
