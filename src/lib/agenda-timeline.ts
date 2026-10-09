import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, min, max } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getAgendaTimeMode, isAgendaUnscheduled } from "./agenda-time";

export interface TimelineBlockAgenda {
  type: "DAY_WITH_AGENDAS";
  date: Date;
  formattedHeader: string;
  agendas: any[];
}

export interface TimelineBlockEmpty {
  type: "EMPTY_DAYS_GROUP";
  startDate: Date;
  endDate: Date;
  count: number;
  formattedHeader: string;
  note: string;
}

export type TimelineBlock = TimelineBlockAgenda | TimelineBlockEmpty;

export function buildTimelineBlocks(
  agendas: any[],
  mode: "full" | "range" = "full",
  rangeStart?: Date,
  rangeEnd?: Date
): { timelineBlocks: TimelineBlock[]; unscheduledAgendas: any[] } {
  // 1. Separate scheduled vs unscheduled using isAgendaUnscheduled
  const scheduledAgendas = agendas
    .filter(a => !isAgendaUnscheduled(a))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const unscheduledAgendas = agendas
    .filter(a => isAgendaUnscheduled(a));

  if (scheduledAgendas.length === 0) {
    return { timelineBlocks: [], unscheduledAgendas };
  }

  // 2. Identify active months (months with at least 1 scheduled agenda)
  const activeMonthKeys = new Set<string>();
  scheduledAgendas.forEach(a => {
    const d = new Date(a.scheduled_at);
    activeMonthKeys.add(format(d, "yyyy-MM"));
  });

  const timelineBlocks: TimelineBlock[] = [];
  const sortedMonthKeys = Array.from(activeMonthKeys).sort();

  for (const monthKey of sortedMonthKeys) {
    const [year, month] = monthKey.split("-").map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1, 1));
    const monthEnd = endOfMonth(monthStart);

    let start = monthStart;
    let end = monthEnd;

    if (mode === "range" && rangeStart && rangeEnd) {
      const normalizedRangeStart = new Date(rangeStart);
      normalizedRangeStart.setHours(0, 0, 0, 0);
      const normalizedRangeEnd = new Date(rangeEnd);
      normalizedRangeEnd.setHours(23, 59, 59, 999);

      if (normalizedRangeEnd < monthStart || normalizedRangeStart > monthEnd) continue; // Outside range
      start = max([monthStart, normalizedRangeStart]);
      end = min([monthEnd, normalizedRangeEnd]);
    }

    if (start > end) continue;

    const daysInMonth = eachDayOfInterval({ start, end });
    let currentEmptyGroup: Date[] = [];

    const flushEmptyGroup = () => {
      if (currentEmptyGroup.length === 0) return;
      const s = currentEmptyGroup[0];
      const e = currentEmptyGroup[currentEmptyGroup.length - 1];
      const count = currentEmptyGroup.length;

      const formattedHeader = count === 1
        ? `${format(s, "EEEE, d MMMM yyyy", { locale: idLocale }).toUpperCase()} — 1 HARI BELUM MEMILIKI AGENDA`
        : `${format(s, "d MMM", { locale: idLocale })} - ${format(e, "d MMM yyyy", { locale: idLocale })} — ${count} HARI BELUM MEMILIKI AGENDA`.toUpperCase();

      timelineBlocks.push({
        type: "EMPTY_DAYS_GROUP",
        startDate: s,
        endDate: e,
        count,
        formattedHeader,
        note: count === 1
          ? "Tanggal ini belum memiliki agenda (Dapat direncanakan untuk pengisian agenda baru)."
          : `${count} hari berturut-turut belum memiliki agenda (Dapat direncanakan untuk pengisian agenda baru).`
      });

      currentEmptyGroup = [];
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    daysInMonth.forEach(dayDate => {
      const dayDateNormalized = new Date(dayDate);
      dayDateNormalized.setHours(0, 0, 0, 0);

      const dayAgendas = scheduledAgendas.filter(a => isSameDay(new Date(a.scheduled_at), dayDate));

      if (dayAgendas.length === 0) {
        // Do NOT include empty dates that are already in the past (Section 2)
        if (dayDateNormalized >= today) {
          currentEmptyGroup.push(dayDate);
        } else {
          flushEmptyGroup();
        }
      } else {
        flushEmptyGroup();
        timelineBlocks.push({
          type: "DAY_WITH_AGENDAS",
          date: dayDate,
          formattedHeader: format(dayDate, "EEEE, d MMMM yyyy", { locale: idLocale }).toUpperCase(),
          agendas: dayAgendas
        });
      }
    });

    flushEmptyGroup();
  }

  return { timelineBlocks, unscheduledAgendas };
}
