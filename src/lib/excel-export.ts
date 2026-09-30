import * as XLSX from "xlsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { getAgendaTimeDisplay, getAgendaTimeMode } from "./agenda-time";
import { buildTimelineBlocks } from "./agenda-timeline";
import { getAgendaStatusLabel } from "./pdf-export";
import { getAppName } from "./branding";

export interface ExcelExportOptions {
  agendas: Agenda[];
  title?: string;
  subtitle?: string;
  appSettings?: AppSettings | null;
  mode?: "full" | "range";
  startDate?: Date;
  endDate?: Date;
}

export function generateAgendaExcel({
  agendas,
  title,
  subtitle,
  appSettings,
  mode = "full",
  startDate,
  endDate
}: ExcelExportOptions): { fileName: string; workbook: XLSX.WorkBook } {
  const appName = getAppName(appSettings);
  const docTitle = title || (mode === "range" ? "REKAP AGENDA RENTANG WAKTU" : "REKAP AGENDA SELURUHNYA");
  const exportTimestamp = format(new Date(), "d MMMM yyyy, HH:mm", { locale: idLocale });

  let periodText = subtitle || `Mode: ${mode === "range" ? "Rentang Waktu" : "Full Agenda"}`;
  if (mode === "range" && startDate && endDate) {
    periodText = `Periode: ${format(startDate, "d MMM yyyy", { locale: idLocale })} s/d ${format(endDate, "d MMM yyyy", { locale: idLocale })}`;
  }

  // Filter agendas for range if needed
  let filteredAgendas = [...agendas];
  if (mode === "range" && startDate && endDate) {
    filteredAgendas = filteredAgendas.filter(a => {
      const timeMode = getAgendaTimeMode(a);
      if (timeMode === "unscheduled") return false;
      if (!a.scheduled_at) return false;
      const agendaDate = new Date(a.scheduled_at);
      return agendaDate >= startDate && agendaDate <= endDate;
    });
  }

  const { timelineBlocks, unscheduledAgendas } = buildTimelineBlocks(
    filteredAgendas,
    mode,
    startDate,
    endDate
  );

  // Rows data
  const sheetData: (string | number)[][] = [
    [appName.toUpperCase()],
    [docTitle],
    [periodText],
    [`Dicetak pada: ${exportTimestamp}`],
    [], // Blank separator
    ["No", "Hari, Tanggal", "Waktu", "Judul Agenda", "Lokasi / Media", "Catatan / Rincian", "Status"]
  ];

  let seqNo = 1;

  for (const block of timelineBlocks) {
    if (block.type === "DAY_WITH_AGENDAS") {
      const dateStr = format(block.date, "EEEE, d MMMM yyyy", { locale: idLocale });
      for (const agenda of block.agendas) {
        const timeStr = getAgendaTimeDisplay(agenda);
        const loc = agenda.isOnline && agenda.onlineLink ? `Online (${agenda.onlineLink})` : (agenda.location || "-");
        const notes = agenda.notes ? agenda.notes.trim() : "-";
        const status = getAgendaStatusLabel(agenda.status);

        sheetData.push([
          seqNo++,
          dateStr,
          timeStr,
          agenda.title,
          loc,
          notes,
          status
        ]);
      }
    } else if (block.type === "EMPTY_DAYS_GROUP") {
      // Empty days placeholder row
      sheetData.push([
        "-",
        block.formattedHeader,
        "-",
        `[Tidak ada agenda - ${block.count} hari]`,
        "-",
        block.note || "-",
        "-"
      ]);
    }
  }

  // Append unscheduled agendas if any
  if (unscheduledAgendas.length > 0) {
    sheetData.push([]);
    sheetData.push(["AGENDA BELUM ADA TANGGAL"]);
    for (const agenda of unscheduledAgendas) {
      const loc = agenda.isOnline && agenda.onlineLink ? `Online (${agenda.onlineLink})` : (agenda.location || "-");
      const notes = agenda.notes ? agenda.notes.trim() : "-";
      const status = getAgendaStatusLabel(agenda.status);

      sheetData.push([
        seqNo++,
        "Belum Ditentukan",
        "Fleksibel",
        agenda.title,
        loc,
        notes,
        status
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  ws["!cols"] = [
    { wch: 6 },  // No
    { wch: 25 }, // Tanggal
    { wch: 18 }, // Waktu
    { wch: 35 }, // Judul
    { wch: 25 }, // Lokasi
    { wch: 40 }, // Catatan
    { wch: 20 }  // Status
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Agenda");

  const fileName = mode === "full"
    ? `Rekap_Agenda_Full_${format(new Date(), "yyyyMMdd")}.xlsx`
    : `Rekap_Agenda_Range_${format(startDate || new Date(), "yyyyMMdd")}-${format(endDate || new Date(), "yyyyMMdd")}.xlsx`;

  XLSX.writeFile(wb, fileName);

  return { fileName, workbook: wb };
}
