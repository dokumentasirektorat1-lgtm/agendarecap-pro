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

interface ExportAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings | null;
}

export function ExportAgendaModal({ isOpen, onClose, appSettings }: ExportAgendaModalProps) {
  const { agendas } = useStore();
  const [exportType, setExportType] = useState<"all" | "range">("all");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const handleExport = () => {
    let filteredAgendas = [...agendas];

    if (exportType === "range") {
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));
      filteredAgendas = filteredAgendas.filter(a => {
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

    // Urutkan rentang waktu
    filteredAgendas.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const appName = appSettings?.app_name || "AgendaRecap Pro";
    const reportTitle = exportType === "all" 
      ? `Seluruh Data Agenda - ${appName}` 
      : `Rekap Agenda (${format(new Date(startDate), "dd MMM yyyy", { locale: id })} - ${format(new Date(endDate), "dd MMM yyyy", { locale: id })}) - ${appName}`;
    
    // Header for the excel file
    const worksheetData: any[][] = [];
    worksheetData.push([reportTitle.toUpperCase()]);
    if(appSettings?.app_name) {
       worksheetData.push([`Dibuat secara otomatis melalui sistem Dashboard`]);
    }
    worksheetData.push([]); // Empty row
    
    // Table Headers
    worksheetData.push(["No", "Tanggal", "Jam", "Judul Agenda", "Lokasi", "Status", "Catatan"]);

    // Table Data
    filteredAgendas.forEach((agenda, idx) => {
      const dateObj = new Date(agenda.scheduled_at);
      worksheetData.push([
        idx + 1,
        format(dateObj, "d MMMM yyyy", { locale: id }),
        format(dateObj, "HH:mm"),
        agenda.title,
        agenda.location || "-",
        agenda.is_completed ? "Selesai" : "Belum Selesai",
        agenda.notes || "-"
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    worksheet["!cols"] = [
      { wch: 5 },  // No
      { wch: 20 }, // Tanggal
      { wch: 10 }, // Jam
      { wch: 40 }, // Judul
      { wch: 30 }, // Lokasi
      { wch: 15 }, // Status
      { wch: 40 }  // Catatan
    ];
    
    // Merge cells for title
    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title row spans across 7 columns
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }  // Description row
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Agenda");
    
    const fileName = exportType === "all"
      ? `Export_Seluruh_Agenda_${format(new Date(), "yyyyMMdd")}.xlsx`
      : `Export_Agenda_${format(new Date(startDate), "yyyyMMdd")}-${format(new Date(endDate), "yyyyMMdd")}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    
    Swal.fire({
      icon: 'success',
      title: 'Berhasil Export!',
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
            <div className="flex justify-between items-start mb-5 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileDown className="w-5 h-5 text-emerald-400" />
                  Eksport File
                </h2>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  Unduh data agenda ke dalam bentuk file Excel (XLSX).
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
              <label className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <input 
                  type="radio" 
                  name="exportType" 
                  checked={exportType === "all"} 
                  onChange={() => setExportType("all")}
                  className="w-4 h-4 text-emerald-500 bg-black/50 border-white/20 focus:ring-emerald-500/50"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <CalendarHeart className="w-3.5 h-3.5 text-zinc-400" /> Seluruh Agenda
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Semua data yang pernah dibuat</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <input 
                  type="radio" 
                  name="exportType" 
                  checked={exportType === "range"} 
                  onChange={() => setExportType("range")}
                  className="w-4 h-4 text-emerald-500 bg-black/50 border-white/20 focus:ring-emerald-500/50"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-zinc-400" /> Rentang Waktu
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Filter data dari tanggal tertentu</div>
                </div>
              </label>

              {exportType === "range" && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-2 gap-3 pt-2"
                >
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Dari Tanggal</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Sampai Tanggal</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6">
              <button
                onClick={handleExport}
                className="w-full flex flex-row items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                Download Excel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
