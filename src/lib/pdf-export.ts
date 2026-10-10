import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, eachDayOfInterval, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { getAgendaDateDisplay, getAgendaTimeDisplay, getAgendaTimeMode, isAgendaUnscheduled } from "./agenda-time";
import { buildTimelineBlocks, TimelineBlock } from "./agenda-timeline";
import { getAppName } from "./branding";

export interface PDFExportOptions {
  agendas: Agenda[];
  title?: string;
  subtitle?: string;
  appSettings?: AppSettings | null;
  mode?: "full" | "range";
  startDate?: Date;
  endDate?: Date;
}

export function getAgendaStatusLabel(status?: string): string {
  switch (status) {
    case 'confirmed':
      return 'Terkonfirmasi';
    case 'pending_consultation':
      return 'Pending Konsultasi';
    case 'rescheduled':
      return 'Dijadwal Ulang';
    case 'cancelled':
      return 'Dibatalkan';
    case 'unscheduled':
      return 'Belum Ada Tanggal';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Terkonfirmasi';
  }
}

export function generateAgendaPDF({
  agendas,
  title,
  subtitle,
  appSettings,
  mode = "full",
  startDate,
  endDate
}: PDFExportOptions) {
  // Landscape A4: 297mm x 210mm
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const appName = getAppName(appSettings);
  const docTitle = title || (mode === "range" ? "REKAP AGENDA RENTANG WAKTU" : "REKAP AGENDA SELURUHNYA");
  const exportTimestamp = format(new Date(), "d MMMM yyyy, HH:mm", { locale: idLocale });

  // Header Banner
  doc.setFillColor(30, 27, 75); // Deep Indigo/Purple
  doc.rect(0, 0, 297, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(docTitle.toUpperCase(), 14, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  let periodText = subtitle || `Mode: ${mode === "range" ? "Rentang Waktu" : "Full Agenda"}`;
  if (mode === "range" && startDate && endDate) {
    periodText = `Periode: ${format(startDate, "d MMM yyyy", { locale: idLocale })} s/d ${format(endDate, "d MMM yyyy", { locale: idLocale })}`;
  }
  doc.text(`${appName} | ${periodText}`, 14, 19);
  doc.text(`Dicetak: ${exportTimestamp} WIB`, 283, 19, { align: "right" });

  let startY = 34;

  // Filter agendas according to mode
  let filteredAgendas = [...agendas];
  if (mode === "range" && startDate && endDate) {
    const startOfStartDate = new Date(startDate);
    startOfStartDate.setHours(0, 0, 0, 0);
    const endOfEndDate = new Date(endDate);
    endOfEndDate.setHours(23, 59, 59, 999);

    filteredAgendas = filteredAgendas.filter(a => {
      // Unscheduled agendas are always preserved for Section I
      if (isAgendaUnscheduled(a)) return true;
      if (!a.scheduled_at) return false;
      const agendaDate = new Date(a.scheduled_at);
      return agendaDate >= startOfStartDate && agendaDate <= endOfEndDate;
    });
  }

  // Prepare table rows using buildTimelineBlocks
  const { timelineBlocks, unscheduledAgendas } = buildTimelineBlocks(
    filteredAgendas,
    mode,
    startDate,
    endDate
  );

  const tableRows: any[] = [];

  timelineBlocks.forEach((block) => {
    if (block.type === "DAY_WITH_AGENDAS") {
      tableRows.push([
        {
          content: block.formattedHeader,
          colSpan: 5,
          styles: { fillColor: [238, 242, 255], textColor: [49, 46, 129], fontStyle: "bold", halign: "left" }
        }
      ]);

      block.agendas.forEach((agenda, idx) => {
        const timeStr = getAgendaTimeDisplay(agenda);
        let locationText = agenda.location || "-";
        if (agenda.isOnline) {
          locationText = `[ONLINE] ${agenda.location || 'Meeting'}`;
          if (agenda.onlineLink) locationText += `\nLink: ${agenda.onlineLink}`;
        }

        const isCancelled = agenda.status === 'cancelled';
        const isPending = agenda.status === 'pending_consultation';
        const isRescheduled = agenda.status === 'rescheduled';
        const statusLabel = getAgendaStatusLabel(agenda.status);

        // Cancelled agendas get prominent RED text throughout row (Section 2)
        const rowTextColor: [number, number, number] = isCancelled ? [220, 38, 38] : [30, 41, 59];
        const statusTextColor: [number, number, number] = isCancelled
          ? [220, 38, 38]
          : isPending
          ? [217, 119, 6]
          : isRescheduled
          ? [79, 70, 229]
          : [16, 185, 129];

        tableRows.push([
          { content: (idx + 1).toString(), styles: { textColor: rowTextColor, halign: "center" as const } },
          { content: timeStr, styles: { textColor: rowTextColor, halign: "center" as const } },
          { content: isCancelled ? `[DIBATALKAN] ${agenda.title}` : agenda.title, styles: { textColor: rowTextColor, fontStyle: "bold" } },
          { content: locationText, styles: { textColor: rowTextColor } },
          { content: statusLabel, styles: { textColor: statusTextColor, fontStyle: "bold", halign: "center" as const } }
        ]);
      });
    } else if (block.type === "EMPTY_DAYS_GROUP") {
      tableRows.push([
        {
          content: `SLOT KOSONG: ${block.formattedHeader}`,
          colSpan: 5,
          styles: { fillColor: [254, 243, 199], textColor: [180, 83, 9], fontStyle: "bold", halign: "left" as const }
        }
      ]);

      tableRows.push([
        { content: "-", styles: { halign: "center" as const } },
        { content: "Siap Dijadwalkan", styles: { halign: "center" as const, textColor: [180, 83, 9] } },
        { content: block.note, colSpan: 2, styles: { textColor: [180, 83, 9], fontStyle: "italic" } },
        { content: "KOSONG", styles: { halign: "center" as const, fontStyle: "bold", textColor: [180, 83, 9] } }
      ]);
    }
  });

  const totalScheduledCount = timelineBlocks.reduce((acc, b) => acc + (b.type === "DAY_WITH_AGENDAS" ? b.agendas.length : 0), 0);
  const hasUnscheduled = unscheduledAgendas.length > 0;
  const hasScheduled = tableRows.length > 0;

  // Section: BELUM ADA TANGGAL (UNSCHEDULED) - Ditempatkan di bagian paling atas sesuai permintaan
  if (hasUnscheduled) {
    const unscheduledSectionNumber = "I";
    doc.setTextColor(180, 83, 9); // Amber 700
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${unscheduledSectionNumber}. BELUM ADA TANGGAL / UNSCHEDULED (${unscheduledAgendas.length} Agenda)`, 14, startY);

    const unscheduledRows = unscheduledAgendas.map((agenda, idx) => {
      const isCancelled = agenda.status === 'cancelled';
      const isPending = agenda.status === 'pending_consultation';
      const isRescheduled = agenda.status === 'rescheduled';
      const statusLabel = getAgendaStatusLabel(agenda.status);
      const rowTextColor: [number, number, number] = isCancelled ? [220, 38, 38] : [30, 41, 59];
      const statusTextColor: [number, number, number] = isCancelled
        ? [220, 38, 38]
        : isPending
        ? [217, 119, 6]
        : isRescheduled
        ? [79, 70, 229]
        : [180, 83, 9];

      let locationText = agenda.location || "-";
      if (agenda.isOnline) {
        locationText = `[ONLINE] ${agenda.location || 'Meeting'}`;
      }

      return [
        { content: (idx + 1).toString(), styles: { textColor: rowTextColor, halign: "center" as const } },
        { content: "Belum Ada Tanggal", styles: { textColor: rowTextColor, halign: "center" as const } },
        { content: isCancelled ? `[DIBATALKAN] ${agenda.title}` : agenda.title, styles: { textColor: rowTextColor, fontStyle: "bold" } },
        { content: locationText, styles: { textColor: rowTextColor } },
        { content: statusLabel, styles: { textColor: statusTextColor, fontStyle: "bold", halign: "center" as const } }
      ];
    });

    autoTable(doc, {
      startY: startY + 4,
      head: [["No", "Waktu / Semantik", "Judul Agenda", "Tempat / Lokasi", "Status"]],
      body: unscheduledRows as any,
      theme: "grid",
      headStyles: {
        fillColor: [217, 119, 6], // Amber 600
        textColor: 255,
        fontSize: 9,
        fontStyle: "bold",
        halign: "center"
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
        valign: "top"
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 36, halign: "center" },
        2: { cellWidth: 110, fontStyle: "bold" },
        3: { cellWidth: 66 },
        4: { cellWidth: 45, halign: "center" }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          `Halaman ${data.pageNumber} | ${appName} PDF Export`,
          14,
          203
        );
        doc.text(
          `Dokumen Resmi ${appName}`,
          283,
          203,
          { align: "right" }
        );
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section: AGENDA TERJADWAL
  if (hasScheduled) {
    if (startY > 160) {
      doc.addPage();
      startY = 20;
    }

    const scheduledSectionNumber = hasUnscheduled ? "II" : "I";
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${scheduledSectionNumber}. TIMELINE AGENDA TERJADWAL (${totalScheduledCount} Agenda)`, 14, startY);

    autoTable(doc, {
      startY: startY + 4,
      head: [["No", "Waktu / Semantik", "Judul Agenda", "Tempat / Lokasi", "Status"]],
      body: tableRows as any,
      theme: "grid",
      headStyles: {
        fillColor: [79, 70, 229], // Indigo 600
        textColor: 255,
        fontSize: 9,
        fontStyle: "bold",
        halign: "center"
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
        valign: "top"
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 36, halign: "center" },
        2: { cellWidth: 110, fontStyle: "bold" },
        3: { cellWidth: 66 },
        4: { cellWidth: 45, halign: "center" }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          `Halaman ${data.pageNumber} | ${appName} PDF Export`,
          14,
          203
        );
        doc.text(
          `Dokumen Resmi ${appName}`,
          283,
          203,
          { align: "right" }
        );
      }
    });
  }

  return doc;
}
