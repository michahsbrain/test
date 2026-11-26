import {createId, DEFAULT_IMPORTANCE} from '../engine/scheduler';
import {CalendarEvent, ImportanceLevel, TagDefinition} from '../types/planner';
import {addDays, addMonths, pad2, parseISO, toISO} from './dateUtils';

export interface ParsedIcsResult {
  events: CalendarEvent[];
  rawEventCount: number;
  skippedCount: number;
  warnings: string[];
  calendarName?: string;
}

export interface ParseIcsOptions {
  tags: TagDefinition[];
  defaultImportance?: ImportanceLevel;
  defaultTagId?: string;
  maxHorizonDate?: string;
}

const utf8Encoder = new TextEncoder();

/**
 * Plie une ligne iCalendar à 75 octets max selon la RFC 5545 sans couper de caractère UTF-8.
 */
function foldIcsLine(line: string): string {
  if (utf8Encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of line) {
    const chBytes = utf8Encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // ' ' compte 1 octet sur les lignes repliées
    if (currentBytes + chBytes > limit && current.length > 0) {
      parts.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts.join('\r\n ');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function unescapeIcsText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n' || next === 'N') {
        out += '\n';
        i++;
        continue;
      }
      if (next === ',' || next === ';' || next === '\\') {
        out += next;
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function formatIcsLocalDateTime(dateStr: string, totalMin: number): string {
  const dayOffset = Math.floor(totalMin / 1440);
  const clampedMin = ((totalMin % 1440) + 1440) % 1440;
  const effectiveDate = dayOffset === 0 ? dateStr : addDays(dateStr, dayOffset);
  const compactDate = effectiveDate.replace(/-/g, '');
  const hh = pad2(Math.floor(clampedMin / 60));
  const mm = pad2(clampedMin % 60);
  return `${compactDate}T${hh}${mm}00`;
}

function formatIcsUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/**
 * Exporte une liste d'événements TempoLocal au format iCalendar (.ics / RFC 5545).
 */
export function exportEventsToIcs(
  events: CalendarEvent[],
  tags: TagDefinition[],
  calendarName = 'TempoLocal'
): string {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const dtStamp = formatIcsUtcStamp(new Date());
  const sorted = [...events].sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
  );

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TempoLocal//Calendrier//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const ev of sorted) {
    const tag = ev.tagId ? tagById.get(ev.tagId) : undefined;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@tempolocal.local`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${formatIcsLocalDateTime(ev.date, ev.startMin)}`);
    lines.push(`DTEND:${formatIcsLocalDateTime(ev.date, ev.endMin)}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    if (ev.notes) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.notes)}`);
    }
    if (tag) {
      lines.push(`CATEGORIES:${escapeIcsText(tag.name)}`);
    }
    lines.push(`X-TEMPOLOCAL-IMPORTANCE:${ev.importance}`);
    lines.push(`X-TEMPOLOCAL-SOURCE:${ev.source}`);
    if (ev.customRules?.allowCoexistence) {
      lines.push('X-TEMPOLOCAL-COEXISTENCE:TRUE');
    }
    if (ev.customRules?.canCrossDayShift) {
      lines.push('X-TEMPOLOCAL-REPORTABLE:TRUE');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function triggerIcsDownload(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], {type: 'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ParsedIcsDateTime {
  date: string; // YYYY-MM-DD
  min: number; // 0..1439
  isAllDay: boolean;
}

function parseIcsDateTime(rawValue: string, params: Record<string, string>): ParsedIcsDateTime | null {
  const clean = rawValue.trim();
  if (!clean) return null;

  // Date seule: YYYYMMDD
  const dateOnlyMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(clean);
  if (dateOnlyMatch || params.VALUE === 'DATE') {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(clean);
    if (!m) return null;
    const [, y, mo, d] = m;
    return {
      date: `${y}-${mo}-${d}`,
      min: 0,
      isAllDay: true,
    };
  }

  // Date + Heure: YYYYMMDDTHHMMSS(Z)? ou YYYYMMDDTHHMM(Z)?
  const dtMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(clean);
  if (!dtMatch) return null;

  const year = parseInt(dtMatch[1], 10);
  const month = parseInt(dtMatch[2], 10);
  const day = parseInt(dtMatch[3], 10);
  const hour = parseInt(dtMatch[4], 10);
  const minute = parseInt(dtMatch[5], 10);
  const second = dtMatch[6] ? parseInt(dtMatch[6], 10) : 0;
  const isUtc = Boolean(dtMatch[7]);

  if (isUtc) {
    const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (Number.isNaN(dt.getTime())) return null;
    return {
      date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
      min: dt.getHours() * 60 + dt.getMinutes(),
      isAllDay: false,
    };
  }

  return {
    date: `${pad2(year)}-${pad2(month)}-${pad2(day)}`,
    min: Math.max(0, Math.min(1439, hour * 60 + minute)),
    isAllDay: false,
  };
}

function parseIcsDurationMinutes(raw: string): number | null {
  const match =
    /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
      raw.trim()
    );
  if (!match || match[1] === '-') return null;
  const weeks = parseInt(match[2] || '0', 10);
  const days = parseInt(match[3] || '0', 10);
  const hours = parseInt(match[4] || '0', 10);
  const mins = parseInt(match[5] || '0', 10);
  const secs = parseInt(match[6] || '0', 10);
  const total = weeks * 7 * 1440 + days * 1440 + hours * 60 + mins + Math.round(secs / 60);
  return total > 0 ? total : null;
}

function diffCalendarMinutes(start: ParsedIcsDateTime, end: ParsedIcsDateTime): number {
  const s = parseISO(start.date).getTime();
  const e = parseISO(end.date).getTime();
  const dayDiff = Math.round((e - s) / 86400000);
  return dayDiff * 1440 + (end.min - start.min);
}

function splitPropertyLine(line: string): {
  name: string;
  params: Record<string, string>;
  value: string;
} | null {
  let inQuotes = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx === -1) return null;

  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const segments = left.split(';');
  const name = (segments[0] ?? '').trim().toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const eqIdx = segments[i].indexOf('=');
    if (eqIdx === -1) continue;
    const pKey = segments[i].slice(0, eqIdx).trim().toUpperCase();
    const pVal = segments[i].slice(eqIdx + 1).trim().replace(/^"|"$/g, '');
    params[pKey] = pVal;
  }

  return {name, params, value};
}

const RRULE_WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function expandRRuleDates(
  startDate: string,
  rruleRaw: string,
  exdates: Set<string>,
  maxHorizonDate: string
): string[] {
  const parts = rruleRaw.split(';');
  const rule: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    rule[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim().toUpperCase();
  }

  const freq = rule.FREQ;
  if (!freq) return exdates.has(startDate) ? [] : [startDate];

  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1);
  const count = rule.COUNT ? Math.max(1, Math.min(200, parseInt(rule.COUNT, 10) || 1)) : 200;
  let untilDate = maxHorizonDate;
  if (rule.UNTIL) {
    const parsedUntil = parseIcsDateTime(rule.UNTIL, {});
    if (parsedUntil && parsedUntil.date < untilDate) {
      untilDate = parsedUntil.date;
    }
  }

  const byDays = rule.BYDAY
    ? rule.BYDAY.split(',')
        .map((token) => RRULE_WEEKDAY_MAP[token.slice(-2)])
        .filter((d): d is number => d !== undefined)
    : null;

  const occurrences: string[] = [];

  if (freq === 'DAILY') {
    let cursor = startDate;
    let totalGenerated = 0;
    while (cursor <= untilDate && totalGenerated < count) {
      const dayNum = parseISO(cursor).getDay();
      if (!byDays || byDays.includes(dayNum)) {
        if (!exdates.has(cursor)) occurrences.push(cursor);
        totalGenerated++;
      }
      cursor = addDays(cursor, interval);
    }
    return occurrences;
  }

  if (freq === 'WEEKLY') {
    const startDt = parseISO(startDate);
    const targetDays =
      byDays && byDays.length > 0 ? [...new Set(byDays)].sort((a, b) => a - b) : [startDt.getDay()];

    let weekMondayOffset = 0;
    let totalGenerated = 0;
    // Aligner au début de la semaine du startDate (dimanche->lundi ou boucle par semaine)
    const startDay = startDt.getDay();
    const daysSinceMonday = startDay === 0 ? 6 : startDay - 1;
    const baseMonday = addDays(startDate, -daysSinceMonday);

    while (totalGenerated < count && weekMondayOffset <= 260) {
      const weekMonday = addDays(baseMonday, weekMondayOffset * 7);
      if (weekMonday > untilDate) break;

      // Parcourir Lun..Dim dans cette semaine
      for (let dOffset = 0; dOffset < 7; dOffset++) {
        const candidate = addDays(weekMonday, dOffset);
        if (candidate < startDate) continue;
        if (candidate > untilDate || totalGenerated >= count) break;
        const candidateWeekday = parseISO(candidate).getDay();
        if (targetDays.includes(candidateWeekday)) {
          if (!exdates.has(candidate)) occurrences.push(candidate);
          totalGenerated++;
        }
      }
      weekMondayOffset += interval;
    }
    return occurrences;
  }

  if (freq === 'MONTHLY') {
    let cursor = startDate;
    let step = 0;
    while (cursor <= untilDate && step < count) {
      if (!exdates.has(cursor)) occurrences.push(cursor);
      step++;
      cursor = addMonths(startDate, step * interval);
    }
    return occurrences;
  }

  if (freq === 'YEARLY') {
    let cursor = startDate;
    let step = 0;
    while (cursor <= untilDate && step < count) {
      if (!exdates.has(cursor)) occurrences.push(cursor);
      step++;
      cursor = addMonths(startDate, step * interval * 12);
    }
    return occurrences;
  }

  return exdates.has(startDate) ? [] : [startDate];
}

interface RawVEvent {
  summary?: string;
  description?: string;
  location?: string;
  categories?: string;
  dtStart?: ParsedIcsDateTime;
  dtEnd?: ParsedIcsDateTime;
  duration?: string;
  rrule?: string;
  exdates: Set<string>;
  customImportance?: ImportanceLevel;
  customCoexistence?: boolean;
  customReportable?: boolean;
}

/**
 * Analyse le contenu texte d'un fichier .ics (RFC 5545) et retourne les activités prêtes pour TempoLocal.
 */
export function parseIcsFile(content: string, options: ParseIcsOptions): ParsedIcsResult {
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const rawLines = unfolded.split(/\r?\n/);

  const defaultImportance = options.defaultImportance ?? DEFAULT_IMPORTANCE;
  const defaultTagId = options.defaultTagId ?? '';
  const tagByName = new Map(options.tags.map((t) => [t.name.trim().toLowerCase(), t.id]));

  let calendarName: string | undefined;
  let inVEvent = false;
  let subBlockDepth = 0; // Ignore VALARM ou autres sous-blocs internes
  let current: RawVEvent | null = null;
  const rawEvents: RawVEvent[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();

    if (upper === 'BEGIN:VEVENT') {
      inVEvent = true;
      subBlockDepth = 0;
      current = {exdates: new Set<string>()};
      continue;
    }

    if (upper === 'END:VEVENT') {
      if (inVEvent && current) {
        rawEvents.push(current);
      }
      inVEvent = false;
      subBlockDepth = 0;
      current = null;
      continue;
    }

    if (inVEvent) {
      if (upper.startsWith('BEGIN:')) {
        subBlockDepth++;
        continue;
      }
      if (upper.startsWith('END:')) {
        subBlockDepth = Math.max(0, subBlockDepth - 1);
        continue;
      }
      if (subBlockDepth > 0 || !current) continue;
    }

    const prop = splitPropertyLine(rawLine);
    if (!prop) continue;

    if (!inVEvent) {
      if (prop.name === 'X-WR-CALNAME') {
        calendarName = unescapeIcsText(prop.value).trim() || undefined;
      }
      continue;
    }

    if (!current) continue;

    switch (prop.name) {
      case 'SUMMARY':
        current.summary = unescapeIcsText(prop.value).trim();
        break;
      case 'DESCRIPTION':
        current.description = unescapeIcsText(prop.value).trim();
        break;
      case 'LOCATION':
        current.location = unescapeIcsText(prop.value).trim();
        break;
      case 'CATEGORIES':
        current.categories = unescapeIcsText(prop.value).trim();
        break;
      case 'DTSTART': {
        const dt = parseIcsDateTime(prop.value, prop.params);
        if (dt) current.dtStart = dt;
        break;
      }
      case 'DTEND': {
        const dt = parseIcsDateTime(prop.value, prop.params);
        if (dt) current.dtEnd = dt;
        break;
      }
      case 'DURATION':
        current.duration = prop.value.trim();
        break;
      case 'RRULE':
        current.rrule = prop.value.trim();
        break;
      case 'EXDATE': {
        for (const token of prop.value.split(',')) {
          const parsed = parseIcsDateTime(token, prop.params);
          if (parsed) current.exdates.add(parsed.date);
        }
        break;
      }
      case 'X-TEMPOLOCAL-IMPORTANCE': {
        const n = parseInt(prop.value.trim(), 10);
        if (n === 1 || n === 2 || n === 3 || n === 4) {
          current.customImportance = n;
        }
        break;
      }
      case 'X-TEMPOLOCAL-COEXISTENCE':
        current.customCoexistence = prop.value.trim().toUpperCase() === 'TRUE';
        break;
      case 'X-TEMPOLOCAL-REPORTABLE':
        current.customReportable = prop.value.trim().toUpperCase() === 'TRUE';
        break;
      default:
        break;
    }
  }

  const parsedEvents: CalendarEvent[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  for (const raw of rawEvents) {
    if (!raw.dtStart) {
      skippedCount++;
      continue;
    }

    let totalDurationMin = raw.dtStart.isAllDay ? 1440 : 60;
    if (raw.dtEnd) {
      const diff = diffCalendarMinutes(raw.dtStart, raw.dtEnd);
      if (diff > 0) {
        totalDurationMin = diff;
      }
    } else if (raw.duration) {
      const parsedDur = parseIcsDurationMinutes(raw.duration);
      if (parsedDur) totalDurationMin = parsedDur;
    }

    totalDurationMin = Math.max(5, Math.min(60 * 1440, totalDurationMin));

    const horizonCap = options.maxHorizonDate
      ? options.maxHorizonDate > addDays(raw.dtStart.date, 90)
        ? options.maxHorizonDate
        : addDays(raw.dtStart.date, 90)
      : addDays(raw.dtStart.date, 90);

    const occurrenceDates = raw.rrule
      ? expandRRuleDates(raw.dtStart.date, raw.rrule, raw.exdates, horizonCap)
      : raw.exdates.has(raw.dtStart.date)
      ? []
      : [raw.dtStart.date];

    let resolvedTagId = defaultTagId;
    if (raw.categories) {
      const firstCat = raw.categories.split(',')[0]?.trim().toLowerCase();
      if (firstCat && tagByName.has(firstCat)) {
        resolvedTagId = tagByName.get(firstCat) ?? defaultTagId;
      }
    }

    const importance = raw.customImportance ?? defaultImportance;
    const notesParts: string[] = [];
    if (raw.description) notesParts.push(raw.description);
    if (raw.location) notesParts.push(`Lieu : ${raw.location}`);
    const notes = notesParts.length > 0 ? notesParts.join('\n') : undefined;
    const title = raw.summary || 'Événement importé';

    for (const occDate of occurrenceDates) {
      let remaining = totalDurationMin;
      let dayOffset = 0;
      const startMinOnFirstDay = raw.dtStart.isAllDay ? 0 : raw.dtStart.min;

      while (remaining > 0 && dayOffset < 60) {
        const segDate = dayOffset === 0 ? occDate : addDays(occDate, dayOffset);
        const segStart = dayOffset === 0 ? startMinOnFirstDay : 0;
        const segDur = Math.min(1440 - segStart, remaining);

        if (segDur >= 5) {
          parsedEvents.push({
            id: createId('ics'),
            title,
            date: segDate,
            startMin: segStart,
            endMin: segStart + segDur,
            importance,
            category: 'personal',
            tagId: resolvedTagId,
            source: 'manual',
            notes,
            customRules:
              raw.customCoexistence !== undefined || raw.customReportable !== undefined
                ? {
                    canShift: importance === 3 || importance === 4,
                    canReduce: importance === 2 || importance === 4,
                    canCrossDayShift: Boolean(raw.customReportable),
                    allowCoexistence: Boolean(raw.customCoexistence),
                  }
                : undefined,
          });
        }

        remaining -= segDur;
        dayOffset++;
      }
    }
  }

  if (skippedCount > 0) {
    warnings.push(
      `${skippedCount} événement${skippedCount > 1 ? 's' : ''} sans date de début valide ignoré${skippedCount > 1 ? 's' : ''}.`
    );
  }

  return {
    events: parsedEvents.sort((a, b) =>
      a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)
    ),
    rawEventCount: rawEvents.length,
    skippedCount,
    warnings,
    calendarName,
  };
}

export function isValidIcsContent(content: string): boolean {
  const upper = content.toUpperCase();
  return upper.includes('BEGIN:VCALENDAR') && upper.includes('END:VCALENDAR');
}

export function buildSingleEventIcsFilename(ev: CalendarEvent): string {
  const slug = ev.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${slug || 'activite'}-${ev.date}.ics`;
}

export function getSuggestedIcsHorizon(dateStr?: string): string {
  const base = dateStr || toISO(new Date());
  return addDays(base, 90);
}
