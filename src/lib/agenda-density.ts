import { format } from "date-fns";
import { getAgendaTimeMode } from "./agenda-time";

export interface DensityAgendaItem {
  id: string;
  scheduled_at?: string | null;
  time_mode?: string | null;
  status?: string | null;
}

export interface AgendaDensityInfo {
  count: number;
  hasAllDay: boolean;
}

export interface AgendaDensityResult {
  agendaDensityByDate: Record<string, AgendaDensityInfo>;
  dates1: Date[];
  dates2: Date[];
  dates4: Date[];
  datesFull: Date[];
  allAgendaDates: Date[];
}

/**
 * Calculates calendar agenda density per date using unique canonical agenda IDs.
 * Rules:
 * - 1 agenda: ringan (dates1)
 * - 2-3 agendas: sedang (dates2)
 * - 4 agendas: tinggi (dates4)
 * - 5+ agendas OR any ALL_DAY: penuh (datesFull)
 * - unscheduled and cancelled agendas are excluded from calendar dates.
 */
export function computeAgendaDensity(agendas: DensityAgendaItem[]): AgendaDensityResult {
  // Deduplicate by canonical ID
  const uniqueAgendas = Array.from(
    new Map(agendas.map(a => [a.id, a])).values()
  );

  const agendaDensityByDate = uniqueAgendas
    .filter(a => getAgendaTimeMode(a as any) !== 'unscheduled' && a.scheduled_at && a.status !== 'cancelled')
    .reduce((acc, a) => {
      const key = format(new Date(a.scheduled_at!), 'yyyy-MM-dd');
      if (!acc[key]) {
        acc[key] = { count: 0, hasAllDay: false };
      }
      acc[key].count += 1;
      if (getAgendaTimeMode(a as any) === 'all_day') {
        acc[key].hasAllDay = true;
      }
      return acc;
    }, {} as Record<string, AgendaDensityInfo>);

  const dates1 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && info.count === 1)
    .map(([d]) => new Date(d + 'T00:00:00'));

  const dates2 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && (info.count === 2 || info.count === 3))
    .map(([d]) => new Date(d + 'T00:00:00'));

  const dates4 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && info.count === 4)
    .map(([d]) => new Date(d + 'T00:00:00'));

  const datesFull = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => info.hasAllDay || info.count >= 5)
    .map(([d]) => new Date(d + 'T00:00:00'));

  const allAgendaDates = Object.keys(agendaDensityByDate).map(d => new Date(d + 'T00:00:00'));

  return {
    agendaDensityByDate,
    dates1,
    dates2,
    dates4,
    datesFull,
    allAgendaDates
  };
}
