import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, eachDayOfInterval, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { getAgendaDateDisplay, getAgendaTimeDisplay, getAgendaTimeMode } from "./agenda-time";
import { buildTimelineBlocks, TimelineBlock } from "./agenda-timeline";

export interface PDFExportOptions {
  agendas: Agenda[];
  title?: string;
  subtitle?: string;
  appSettings?: AppSettings | null;
  mode?: "full" | "range";
  startDate?: Date;
  endDate?: Date;
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

  const appName = appSettings?.app_name || "AgendaKu";
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
    filteredAgendas = filteredAgendas.filter(a => {
      const timeMode = getAgendaTimeMode(a);
      if (timeMode === "unscheduled") return false;
      const agendaDate = new Date(a.scheduled_at);
      return agendaDate >= startDate && agendaDate <= endDate;
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
          colSpan: 4,
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

        tableRows.push([
          (idx + 1).toString(),
          timeStr,
          agenda.title,
          locationText
        ]);
      });
    } else if (block.type === "EMPTY_DAYS_GROUP") {
      tableRows.push([
        {
          content: `SLOT KOSONG: ${block.formattedHeader}`,
          colSpan: 4,
          styles: { fillColor: [254, 243, 199], textColor: [180, 83, 9], fontStyle: "bold", halign: "left" }
        }
      ]);

      tableRows.push([
        "-",
        "Siap Dijadwalkan",
        { content: block.note, styles: { textColor: [180, 83, 9], fontStyle: "italic" } },
        "Bisa Direncanakan"
      ]);
    }
  });

  const totalScheduledCount = timelineBlocks.reduce((acc, b) => acc + (b.type === "DAY_WITH_AGENDAS" ? b.agendas.length : 0), 0);

  // Section I: AGENDA TERJADWAL
  if (tableRows.length > 0) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`I. TIMELINE AGENDA TERJADWAL (${totalScheduledCount} Agenda)`, 14, startY);

    autoTable(doc, {
      startY: startY + 4,
      head: [["No", "Waktu / Semantik", "Judul Agenda", "Tempat / Lokasi"]],
      body: tableRows,
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
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 125, fontStyle: "bold" },
        3: { cellWidth: 90 }
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

  // Section II: BELUM ADA TANGGAL (UNSCHEDULED - Section 25)
  if (unscheduledAgendas.length > 0) {
    if (startY > 160) {
      doc.addPage();
      startY = 20;
    }

    doc.setTextColor(180, 83, 9); // Amber 700
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`II. BELUM ADA TANGGAL / UNSCHEDULED (${unscheduledAgendas.length} Agenda)`, 14, startY);

    const unscheduledRows = unscheduledAgendas.map((agenda, idx) => {
      let locationText = agenda.location || "-";
      if (agenda.isOnline) {
        locationText = `[ONLINE] ${agenda.location || 'Meeting'}`;
      }
      return [
        (idx + 1).toString(),
        "Belum Ada Tanggal",
        agenda.title,
        locationText
      ];
    });

    autoTable(doc, {
      startY: startY + 4,
      head: [["No", "Waktu / Semantik", "Judul Agenda", "Tempat / Lokasi"]],
      body: unscheduledRows,
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
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 125, fontStyle: "bold" },
        3: { cellWidth: 90 }
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
