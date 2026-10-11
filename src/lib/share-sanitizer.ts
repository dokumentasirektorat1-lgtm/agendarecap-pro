import { format, parseISO } from "date-fns";
import { getAgendaTimeMode } from "./agenda-time";

export interface SanitizedPublicAgenda {
  id: string;
  title: string;
  location: string;
  scheduled_at?: string | null;
  time_mode?: string;
  status: string;
  is_completed: boolean;
  isOnline: boolean;
  onlineLink: string;
  meetingId: string;
  meetingPasscode: string;
  notes?: string;
  isShareable: boolean;
}

export interface ShareFilterOptions {
  startDate?: string;
  endDate?: string;
  search?: string;
  includeUnscheduled?: boolean;
}

/**
 * Strictly sanitizes agenda records for public consumption:
 * 1. Only allows agendas with isShareable === true
 * 2. Omits privateNotes completely
 * 3. Only includes notes if include_notes_in_share is true
 * 4. Applies inclusive date range filtering [startDate, endDate] with AND condition
 * 5. Applies search query against title, location, and allowed notes
 * 6. Preserves unscheduled agendas in their own section when includeUnscheduled !== false
 */
export function sanitizeShareAgendas(
  rawAgendas: Array<Partial<SanitizedPublicAgenda> & Record<string, unknown>>,
  filters: ShareFilterOptions = {}
): SanitizedPublicAgenda[] {
  const { startDate, endDate, search, includeUnscheduled = true } = filters;

  return (rawAgendas || [])
    .filter(a => {
      // 1. Strict shareable gate
      if (!a || a.isShareable !== true) return false;

      // 2. Search filter
      if (search && search.trim().length > 0) {
        const q = search.toLowerCase().trim();
        const mTitle = a.title ? a.title.toLowerCase().includes(q) : false;
        const mLocation = a.location ? a.location.toLowerCase().includes(q) : false;
        const mNotes = a.include_notes_in_share && a.notes ? a.notes.toLowerCase().includes(q) : false;
        if (!mTitle && !mLocation && !mNotes) return false;
      }

      // 3. Date range filter
      const mode = getAgendaTimeMode(a);
      if (mode === "unscheduled" || !a.scheduled_at) {
        return includeUnscheduled;
      }

      if (a.scheduled_at) {
        const itemDateStr = format(
          typeof a.scheduled_at === 'string' ? parseISO(a.scheduled_at) : new Date(a.scheduled_at),
          "yyyy-MM-dd"
        );
        if (startDate && itemDateStr < startDate) return false;
        if (endDate && itemDateStr > endDate) return false;
      }

      return true;
    })
    .map(a => ({
      id: String(a.id),
      title: a.title || '',
      location: a.location || '',
      scheduled_at: a.scheduled_at || undefined,
      time_mode: a.time_mode || undefined,
      status: a.status || 'confirmed',
      is_completed: Boolean(a.is_completed),
      isOnline: Boolean(a.isOnline),
      onlineLink: a.onlineLink || '',
      meetingId: a.meetingId || '',
      meetingPasscode: a.meetingPasscode || '',
      notes: a.include_notes_in_share ? (a.notes || '') : undefined,
      isShareable: true
    }));
}
