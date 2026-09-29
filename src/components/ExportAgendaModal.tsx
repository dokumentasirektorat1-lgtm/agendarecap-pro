"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileDown, CalendarDays, CalendarHeart } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { id } from "date-fns/locale";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";

import { generateAgendaPDF } from "@/lib/pdf-export";
import { buildTimelineBlocks } from "@/lib/agenda-timeline";
import { getAgendaTimeDisplay } from "@/lib/agenda-time";
import { FileText } from "lucide-react";

interface ExportAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings | null;
}

export function ExportAgendaModal({ isOpen, onClose, appSettings }: ExportAgendaModalProps) {
  const { agendas } = useStore();
  const [exportType, setExportType] = useState<"all" | "range">("all");
  const [fileFormat, setFileFormat] = useState<"excel" | "pdf">("excel");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const handleExport = () => {
    let filteredAgendas = [...agendas];

    if (exportType === "range") {
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));
      filteredAgendas = filteredAgendas.filter(a => {
        if (!a.scheduled_at) return false;
        const date = new Date(a.scheduled_at);
        return isWithinInterval(date, { start, end });
      });
    }

    if (filteredAgendas.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Tidak ada data",
        text: "Tidak ada agenda pada rentang waktu yang dipilih.",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const appName = appSettings?.app_name || "AgendaRecap Pro";
    const reportTitle = exportType === "all" 
      ? `Seluruh Data Agenda - ${appName}` 
      : `Rekap Agenda (${format(new Date(startDate), "dd MMM yyyy", { locale: id })} - ${format(new Date(endDate), "dd MMM yyyy", { locale: id })}) - ${appName}`;

    if (fileFormat === "pdf") {
      const doc = generateAgendaPDF({
        agendas: filteredAgendas,
        title: exportType === "all" ? "REKAP SELURUH AGENDA" : "REKAP AGENDA RENTANG WAKTU",
        subtitle: exportType === "all" ? `Mode: Seluruh Agenda` : `Periode: ${format(new Date(startDate), "dd MMM yyyy", { locale: id })} s/d ${format(new Date(endDate), "dd MMM yyyy", { locale: id })}`,
        appSettings,
        mode: exportType === "all" ? "full" : "range",
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });

      const fileName = exportType === "all"
        ? `Rekap_Agenda_Full_${format(new Date(), "yyyyMMdd")}.pdf`
        : `Rekap_Agenda_Range_${format(new Date(startDate), "yyyyMMdd")}-${format(new Date(endDate), "yyyyMMdd")}.pdf`;

      doc.save(fileName);

      Swal.fire({
        icon: 'success',
        title: 'Berhasil Export PDF!',
        text: `File PDF (${fileName}) telah diunduh.`,
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });

      onClose();
      return;
    }

    // Excel Export Logic with Timeline & Empty Date Grouping
    const { timelineBlocks, unscheduledAgendas } = buildTimelineBlocks(
      filteredAgendas,
      exportType === "all" ? "full" : "range",
      exportType === "range" ? new Date(startDate) : undefined,
      exportType === "range" ? new Date(endDate) : undefined
    );
    
    // Header for the excel file
    const worksheetData: any[][] = [];
    worksheetData.push([reportTitle.toUpperCase()]);
    if (appSettings?.app_name) {
       worksheetData.push([`Dibuat secara otomatis melalui sistem ${appSettings.app_name}`]);
    }
    worksheetData.push([]); // Empty row
    
    // Table Headers
    worksheetData.push(["No", "Tanggal / Group", "Jam / Semantik", "Judul Agenda", "Lokasi", "Status", "Catatan"]);

    let globalCounter = 1;

    timelineBlocks.forEach((block) => {
      if (block.type === "DAY_WITH_AGENDAS") {
        worksheetData.push([`[ ${block.formattedHeader} ]`, "", "", "", "", "", ""]);
        block.agendas.forEach((agenda) => {
          const timeStr = getAgendaTimeDisplay(agenda);
          worksheetData.push([
            globalCounter++,
            format(new Date(agenda.scheduled_at), "d MMMM yyyy", { locale: id }),
            timeStr,
            agenda.title,
            agenda.location || "-",
            agenda.is_completed ? "Selesai" : "Belum Selesai",
            agenda.notes || "-"
          ]);
        });
      } else if (block.type === "EMPTY_DAYS_GROUP") {
        worksheetData.push([`[ SLOT KOSONG: ${block.formattedHeader} ]`, "", "", "", "", "", ""]);
        worksheetData.push([
          "-",
          block.formattedHeader,
          "Siap Dijadwalkan",
          block.note,
          "Bisa Direncanakan",
          "KOSONG",
          "Slot tanggal ini masih kosong dan siap diisi agenda baru."
        ]);
      }
    });

    if (unscheduledAgendas.length > 0) {
      worksheetData.push([]);
      worksheetData.push(["[ II. BELUM ADA TANGGAL (UNSCHEDULED) ]", "", "", "", "", "", ""]);
      unscheduledAgendas.forEach((agenda) => {
        worksheetData.push([
          globalCounter++,
          "Belum Ada Tanggal",
          "Fleksibel",
          agenda.title,
          agenda.location || "-",
          agenda.is_completed ? "Selesai" : "Belum Selesai",
          agenda.notes || "-"
        ]);
      });
    }

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    worksheet["!cols"] = [
      { wch: 5 },  // No
      { wch: 20 }, // Tanggal
      { wch: 15 }, // Jam
      { wch: 40 }, // Judul
      { wch: 30 }, // Lokasi
      { wch: 15 }, // Status
      { wch: 40 }  // Catatan
    ];
    
    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Agenda");
    
    const fileName = exportType === "all"
      ? `Export_Seluruh_Agenda_${format(new Date(), "yyyyMMdd")}.xlsx`
      : `Export_Agenda_${format(new Date(startDate), "yyyyMMdd")}-${format(new Date(endDate), "yyyyMMdd")}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    
    Swal.fire({
      icon: 'success',
      title: 'Berhasil Export Excel!',
      text: `File Excel (${fileName}) telah diunduh.`,
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });

    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-sm flex flex-col bg-[#121214] border border-white/10 rounded-3xl p-6 shadow-2xl z-50"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileDown className="w-5 h-5 text-indigo-400" />
                  Eksport Laporan Agenda
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  Pilih format dokumen dan rentang data yang diinginkan.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Format Selection */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Format File</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFileFormat("pdf")}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      fileFormat === "pdf"
                        ? "bg-red-500/20 text-red-300 border-red-500/50 shadow-md"
                        : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <FileText className="w-4 h-4 text-red-400" />
                    Dokumen PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setFileFormat("excel")}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      fileFormat === "excel"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md"
                        : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <FileDown className="w-4 h-4 text-emerald-400" />
                    Excel (.xlsx)
                  </button>
                </div>
              </div>

              {/* Data Range Selection */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Rentang Data</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                    <input 
                      type="radio" 
                      name="exportType" 
                      checked={exportType === "all"} 
                      onChange={() => setExportType("all")}
                      className="w-4 h-4 text-indigo-500 bg-black/50 border-white/20 focus:ring-indigo-500/50"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <CalendarHeart className="w-3.5 h-3.5 text-zinc-400" /> Seluruh Agenda
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                    <input 
                      type="radio" 
                      name="exportType" 
                      checked={exportType === "range"} 
                      onChange={() => setExportType("range")}
                      className="w-4 h-4 text-indigo-500 bg-black/50 border-white/20 focus:ring-indigo-500/50"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-zinc-400" /> Rentang Tanggal
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {exportType === "range" && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-2 gap-3 pt-1"
                >
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Dari Tanggal</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Sampai Tanggal</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleExport}
                className={`w-full flex flex-row items-center justify-center gap-2 py-3 font-semibold text-sm rounded-xl shadow-lg transition-all active:scale-95 text-white ${
                  fileFormat === "pdf"
                    ? "bg-red-500 hover:bg-red-600 shadow-red-500/25"
                    : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25"
                }`}
              >
                {fileFormat === "pdf" ? <FileText className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                Download {fileFormat === "pdf" ? "PDF" : "Excel"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
