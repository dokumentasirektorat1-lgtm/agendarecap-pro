import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export type AgendaTimeMode = 'exact' | 'flex' | 'all_day' | 'unscheduled';

export interface AgendaTimeItem {
  scheduled_at?: string | null;
  time_mode?: AgendaTimeMode | string | null;
  status?: string | null;
}

export function getAgendaTimeMode(agenda: AgendaTimeItem): AgendaTimeMode {
  if (agenda.time_mode) {
    const mode = String(agenda.time_mode).toLowerCase() as AgendaTimeMode;
    if (['exact', 'flex', 'all_day', 'unscheduled'].includes(mode)) {
      return mode;
    }
  }
  if (agenda.status === 'unscheduled' || !agenda.scheduled_at) {
    return 'unscheduled';
  }
  return 'exact';
}

export function getAgendaTimeDisplay(agenda: AgendaTimeItem): string {
  const mode = getAgendaTimeMode(agenda);
  switch (mode) {
    case 'unscheduled':
      return 'Belum Ada Tanggal';
    case 'flex':
      return 'Fleksibel';
    case 'all_day':
      return 'Seharian';
    case 'exact':
    default: {
      if (!agenda.scheduled_at) return 'Fleksibel';
      try {
        const d = typeof agenda.scheduled_at === 'string' ? parseISO(agenda.scheduled_at) : new Date(agenda.scheduled_at);
        if (isNaN(d.getTime())) return 'Fleksibel';
        return format(d, 'HH:mm');
      } catch {
        return 'Fleksibel';
      }
    }
  }
}

export function getAgendaDateDisplay(agenda: AgendaTimeItem): string {
  const mode = getAgendaTimeMode(agenda);
  if (mode === 'unscheduled' || !agenda.scheduled_at) {
    return 'Belum Ada Tanggal';
  }
  try {
    const d = typeof agenda.scheduled_at === 'string' ? parseISO(agenda.scheduled_at) : new Date(agenda.scheduled_at);
    if (isNaN(d.getTime())) return 'Belum Ada Tanggal';
    return format(d, 'EEEE, d MMMM yyyy', { locale: idLocale });
  } catch {
    return 'Belum Ada Tanggal';
  }
}
