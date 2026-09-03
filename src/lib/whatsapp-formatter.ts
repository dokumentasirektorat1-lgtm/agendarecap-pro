import { AppSettings } from "@/app/actions/settings";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";

export interface AgendaItem {
  id: string;
  title: string;
  location?: string | null;
  scheduled_at: string;
  notes?: string | null;
  privateNotes?: string | null;
  include_notes_in_share: boolean;
  status?: 'confirmed' | 'pending_consultation' | 'rescheduled' | 'cancelled' | 'unscheduled';
  isShareable?: boolean;
  is_completed: boolean;
  isOnline?: boolean;
  onlineLink?: string;
  meetingId?: string;
  meetingPasscode?: string;
}

export type WeeklyCriteria = "next_7_days" | "monday_to_sunday";

function formatTextWithLinks(prefix: string, text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  const formattedParts = parts.map(part => {
    if (urlRegex.test(part)) return part;
    return part.replace(/^(\s*)([\s\S]*?)(\s*)$/, (match, p1, p2, p3) => {
      return p2 ? `${p1}_${p2}_${p3}` : match;
    });
  });
  return `_${prefix}_ ${formattedParts.join('')}`.trim();
}

export function formatAgendasToWhatsApp(
  dateTitle: string, 
  isUpdate: boolean,
  updateTimeStr: string | null,
  agendas: AgendaItem[], 
  settings?: AppSettings | null
) {
  const toCapitalizeAll = (str: string) => 
    str.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());

  const appName = settings?.app_name ? toCapitalizeAll(settings.app_name) : 'Agenda Recap';
  const isWatermarkEnabled = settings?.is_watermark_enabled ?? true;
  const watermarkText = settings?.watermark_text 
    ? toCapitalizeAll(settings.watermark_text) 
    : 'Dibuat Oleh Agenda Recap Pro';

  // Capitalize format tanggal
  const formattedDateTitle = toCapitalizeAll(dateTitle);

  // Header Format:
  // *Agenda Rektor*
  // *Sabtu, 28 Maret 2026*
  let textPrefix = `*${appName}*\n*${formattedDateTitle}*`;
  
  if (isUpdate && updateTimeStr) {
    textPrefix = `*UPDATE ${appName.toUpperCase()}*\n*${formattedDateTitle}*\n_(Pembaruan pada ${updateTimeStr})_`;
  }

  const validAgendas = agendas.filter(
    (a) => a.isShareable !== false && (!a.status || a.status === 'confirmed')
  );

  if (!validAgendas || validAgendas.length === 0) {
    let emptyText = `${textPrefix}\n\n_Belum ada agenda di tanggal ini._`;
    if (isWatermarkEnabled) {
      emptyText += `\n\n------------------------------------------\n_${watermarkText}_`;
    }
    return emptyText;
  }

  let text = `${textPrefix}\n\n`;

  validAgendas.forEach((agenda, index) => {
    const statusInfo = agenda.is_completed ? " (Selesai)" : "";
    
    // 1. Judul Agenda
    text += `*${index + 1}. ${agenda.title}*${statusInfo}\n`;

    // 2. Waktu & Lokasi
    const time = format(new Date(agenda.scheduled_at), "HH:mm");
    let detailLine = time;
    if (agenda.location) {
      detailLine += ` — ${agenda.location}`;
    }
    text += `${detailLine}\n`;

    // 2.5. Online Meeting Details
    if (agenda.isOnline) {
      if (agenda.onlineLink) {
        text += `_Link:_ ${agenda.onlineLink}\n`;
      }
      if (agenda.meetingId) {
        text += `_Meeting ID:_ ${agenda.meetingId}\n`;
      }
      if (agenda.meetingPasscode) {
        text += `_Passcode:_ ${agenda.meetingPasscode}\n`;
      }
    }

    // 3. Catatan khusus
    if (agenda.notes && agenda.include_notes_in_share) {
      text += `${formatTextWithLinks('Catatan:', agenda.notes)}\n`;
    }

    text += '\n'; // Spacer below each agenda item
  });

  if (isWatermarkEnabled) {
    // Spacer and Watermark footer
    text += `------------------------------------------\n_${watermarkText}_`;
  }

  return text.trim();
}

export function formatWeeklyAgendasToWhatsApp(
  criteria: WeeklyCriteria,
  agendas: AgendaItem[],
  settings?: AppSettings | null,
  referenceDate: Date = new Date()
) {
  const toCapitalizeAll = (str: string) => 
    str.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());

  const appName = settings?.app_name ? toCapitalizeAll(settings.app_name) : 'Agenda Recap';
  const isWatermarkEnabled = settings?.is_watermark_enabled ?? true;
  const watermarkText = settings?.watermark_text 
    ? toCapitalizeAll(settings.watermark_text) 
    : 'Dibuat Oleh Agenda Recap Pro';

  const formatTanggal = (date: Date) => {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
    return formatted.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
  };

  const days: Date[] = [];
  let criteriaTitle = "";

  if (criteria === "next_7_days") {
    // Kriteria 1: 1 minggu kedepan dari tanggal hari ini (7 hari mulai dari hari ini)
    const startDate = new Date(referenceDate);
    for (let i = 0; i < 7; i++) {
      days.push(addDays(startDate, i));
    }
    criteriaTitle = "1 MINGGU KE DEPAN";
  } else {
    // Kriteria 2: 1 minggu dari hari senin-hari minggu
    const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) {
      days.push(addDays(monday, i));
    }
    criteriaTitle = "1 MINGGU (SENIN - MINGGU)";
  }

  const startDateStr = formatTanggal(days[0]);
  const endDateStr = formatTanggal(days[6]);

  let text = `*REKAP AGENDA ${criteriaTitle} (${appName.toUpperCase()})*\n`;
  text += `*Periode: ${startDateStr} - ${endDateStr}*\n\n`;

  days.forEach((dayDate) => {
    const dayTitle = formatTanggal(dayDate);
    const dayAgendas = (agendas || [])
      .filter((a) => a.isShareable !== false && (!a.status || a.status === 'confirmed') && isSameDay(new Date(a.scheduled_at), dayDate))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    text += `*${dayTitle}*\n`;

    if (dayAgendas.length === 0) {
      text += `-\n\n`;
    } else {
      dayAgendas.forEach((agenda, idx) => {
        const statusInfo = agenda.is_completed ? " (Selesai)" : "";
        text += `*${idx + 1}. ${agenda.title}*${statusInfo}\n`;

        const time = format(new Date(agenda.scheduled_at), "HH:mm");
        let detailLine = time;
        if (agenda.location) {
          detailLine += ` — ${agenda.location}`;
        }
        text += `${detailLine}\n`;

        if (agenda.isOnline) {
          if (agenda.onlineLink) text += `_Link:_ ${agenda.onlineLink}\n`;
          if (agenda.meetingId) text += `_Meeting ID:_ ${agenda.meetingId}\n`;
          if (agenda.meetingPasscode) text += `_Passcode:_ ${agenda.meetingPasscode}\n`;
        }

        if (agenda.notes && agenda.include_notes_in_share) {
          text += `${formatTextWithLinks('Catatan:', agenda.notes)}\n`;
        }
      });
      text += `\n`;
    }
  });

  // Tambahkan catatan kaki update terakhir (waktu di-*generate*)
  const generatedDate = formatTanggal(referenceDate);
  const generatedTime = format(referenceDate, "HH:mm");
  
  if (isWatermarkEnabled) {
    text += `------------------------------------------\n`;
    text += `_Update per: ${toCapitalizeAll(generatedDate)}, ${generatedTime}_\n`;
    text += `_${watermarkText}_`;
  } else {
    text += `_Update per: ${toCapitalizeAll(generatedDate)}, ${generatedTime}_`;
  }

  return text.trim();
}

