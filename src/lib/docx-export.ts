import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  ShadingType,
  BorderStyle,
  PageOrientation,
  Header,
  Footer
} from "docx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { getAgendaTimeDisplay, getAgendaTimeMode, isAgendaUnscheduled } from "./agenda-time";
import { buildTimelineBlocks } from "./agenda-timeline";
import { getAgendaStatusLabel } from "./pdf-export";
import { getAppName } from "./branding";

export interface DocxExportOptions {
  agendas: Agenda[];
  title?: string;
  subtitle?: string;
  appSettings?: AppSettings | null;
  mode?: "full" | "range";
  startDate?: Date;
  endDate?: Date;
}

export async function generateAgendaDocx({
  agendas,
  title,
  subtitle,
  appSettings,
  mode = "full",
  startDate,
  endDate
}: DocxExportOptions): Promise<Blob> {
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

  const { timelineBlocks, unscheduledAgendas } = buildTimelineBlocks(
    filteredAgendas,
    mode,
    startDate,
    endDate
  );

  // Column widths for Landscape A4 (total 10000 / 100%)
  const colWidths = [600, 1800, 4200, 2000, 1400]; // sum = 10000

  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" }
  };

  const createCell = (text: string, width: number, options: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    color?: string;
    bgColor?: string;
    colSpan?: number;
    italic?: boolean;
  } = {}) => {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      columnSpan: options.colSpan,
      borders: cellBorder,
      shading: options.bgColor ? { fill: options.bgColor, type: ShadingType.CLEAR } : undefined,
      children: [
        new Paragraph({
          alignment: options.align || AlignmentType.LEFT,
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text,
              bold: options.bold,
              italics: options.italic,
              color: options.color || "1E293B",
              size: 18 // 9pt
            })
          ]
        })
      ]
    });
  };

  // Build table rows
  const tableRows: TableRow[] = [];

  // Header row (tblHeader: true, cantSplit: true)
  tableRows.push(
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        createCell("No", colWidths[0], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "4F46E5" }),
        createCell("Waktu / Semantik", colWidths[1], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "4F46E5" }),
        createCell("Judul Agenda", colWidths[2], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "4F46E5" }),
        createCell("Tempat / Lokasi", colWidths[3], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "4F46E5" }),
        createCell("Status", colWidths[4], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "4F46E5" })
      ]
    })
  );

  let itemCounter = 1;

  timelineBlocks.forEach(block => {
    if (block.type === "DAY_WITH_AGENDAS") {
      // Date group header spanning across
      tableRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            createCell(block.formattedHeader, 10000, {
              bold: true,
              color: "312E81",
              bgColor: "EEF2FF",
              colSpan: 5
            })
          ]
        })
      );

      block.agendas.forEach(agenda => {
        const isCancelled = agenda.status === "cancelled";
        const isPending = agenda.status === "pending_consultation";
        const isRescheduled = agenda.status === "rescheduled";
        const statusLabel = getAgendaStatusLabel(agenda.status);

        const rowColor = isCancelled ? "DC2626" : "1E293B";
        const statusColor = isCancelled
          ? "DC2626"
          : isPending
          ? "D97706"
          : isRescheduled
          ? "4F46E5"
          : "10B981";

        const timeStr = getAgendaTimeDisplay(agenda);
        let loc = agenda.location || "-";
        if (agenda.isOnline) {
          loc = `[ONLINE] ${loc}`;
          if (agenda.onlineLink) loc += ` (${agenda.onlineLink})`;
        }

        tableRows.push(
          new TableRow({
            cantSplit: true,
            children: [
              createCell((itemCounter++).toString(), colWidths[0], { align: AlignmentType.CENTER, color: rowColor }),
              createCell(timeStr, colWidths[1], { align: AlignmentType.CENTER, color: rowColor }),
              createCell(isCancelled ? `[DIBATALKAN] ${agenda.title}` : agenda.title, colWidths[2], { bold: true, color: rowColor }),
              createCell(loc, colWidths[3], { color: rowColor }),
              createCell(statusLabel, colWidths[4], { bold: true, align: AlignmentType.CENTER, color: statusColor })
            ]
          })
        );
      });
    } else if (block.type === "EMPTY_DAYS_GROUP") {
      // Empty date header
      tableRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            createCell(`SLOT KOSONG: ${block.formattedHeader}`, 10000, {
              bold: true,
              color: "B45309",
              bgColor: "FEF3C7",
              colSpan: 5
            })
          ]
        })
      );

      // Empty date description row
      tableRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            createCell("-", colWidths[0], { align: AlignmentType.CENTER, color: "B45309" }),
            createCell("Siap Dijadwalkan", colWidths[1], { align: AlignmentType.CENTER, color: "B45309" }),
            createCell(block.note, colWidths[2] + colWidths[3], { italic: true, color: "B45309", colSpan: 2 }),
            createCell("KOSONG", colWidths[4], { bold: true, align: AlignmentType.CENTER, color: "B45309" })
          ]
        })
      );
    }
  });

  // Unscheduled Table Rows if any
  const unscheduledTableRows: TableRow[] = [];
  if (unscheduledAgendas.length > 0) {
    unscheduledTableRows.push(
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          createCell("No", colWidths[0], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "D97706" }),
          createCell("Waktu / Semantik", colWidths[1], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "D97706" }),
          createCell("Judul Agenda", colWidths[2], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "D97706" }),
          createCell("Tempat / Lokasi", colWidths[3], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "D97706" }),
          createCell("Status", colWidths[4], { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", bgColor: "D97706" })
        ]
      })
    );

    unscheduledAgendas.forEach((agenda, idx) => {
      const isCancelled = agenda.status === "cancelled";
      const isPending = agenda.status === "pending_consultation";
      const isRescheduled = agenda.status === "rescheduled";
      const statusLabel = getAgendaStatusLabel(agenda.status);
      const rowColor = isCancelled ? "DC2626" : "1E293B";
      const statusColor = isCancelled
        ? "DC2626"
        : isPending
        ? "D97706"
        : isRescheduled
        ? "4F46E5"
        : "B45309";

      let loc = agenda.location || "-";
      if (agenda.isOnline) {
        loc = `[ONLINE] ${loc}`;
      }

      unscheduledTableRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            createCell((idx + 1).toString(), colWidths[0], { align: AlignmentType.CENTER, color: rowColor }),
            createCell("Belum Ada Tanggal", colWidths[1], { align: AlignmentType.CENTER, color: rowColor }),
            createCell(isCancelled ? `[DIBATALKAN] ${agenda.title}` : agenda.title, colWidths[2], { bold: true, color: rowColor }),
            createCell(loc, colWidths[3], { color: rowColor }),
            createCell(statusLabel, colWidths[4], { bold: true, align: AlignmentType.CENTER, color: statusColor })
          ]
        })
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE
            },
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720
            }
          }
        },
        children: [
          // Document Header Info
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: docTitle.toUpperCase(),
                bold: true,
                size: 32, // 16pt
                color: "1E1B4B"
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `${appName}  |  ${periodText}  |  Dicetak: ${exportTimestamp} WIB`,
                size: 20, // 10pt
                color: "64748B"
              })
            ]
          }),

          // Section I: Belum Ada Tanggal / Unscheduled (if any) — always at the top
          ...(unscheduledAgendas.length > 0
            ? [
                new Paragraph({
                  spacing: { before: 120, after: 120 },
                  children: [
                    new TextRun({
                      text: `I. BELUM ADA TANGGAL / UNSCHEDULED (${unscheduledAgendas.length} Agenda)`,
                      bold: true,
                      size: 22,
                      color: "B45309"
                    })
                  ]
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: unscheduledTableRows
                }),
                new Paragraph({ spacing: { before: 240, after: 0 }, children: [] })
              ]
            : []),

          // Section II (or I if no unscheduled): Timeline Agenda Terjadwal
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: `${unscheduledAgendas.length > 0 ? "II" : "I"}. TIMELINE AGENDA TERJADWAL (${timelineBlocks.reduce((acc, b) => acc + (b.type === "DAY_WITH_AGENDAS" ? b.agendas.length : 0), 0)} Agenda)`,
                bold: true,
                size: 22,
                color: "0F172A"
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows
          })
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
}
