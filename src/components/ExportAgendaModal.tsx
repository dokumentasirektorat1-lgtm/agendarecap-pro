"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  FileDown, 
  CalendarDays, 
  CalendarHeart, 
  FileText, 
  FileSpreadsheet, 
  Database, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { useStore, Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { id } from "date-fns/locale";
import Swal from "sweetalert2";

import { generateAgendaPDF } from "@/lib/pdf-export";
import { generateAgendaDocx } from "@/lib/docx-export";
import { generateAgendaExcel } from "@/lib/excel-export";
import { 
  downloadAgendaBackup, 
  validateAndAnalyzeBackup, 
  executeRestoreBackup, 
  BackupSummary 
} from "@/lib/backup-service";

import { getAgendaTimeDisplay } from "@/lib/agenda-time";
import { getAppName } from "@/lib/branding";
import * as XLSX from "xlsx";

interface ExportAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings | null;
}

export function ExportAgendaModal({ isOpen, onClose, appSettings }: ExportAgendaModalProps) {
  const { agendas, fetchAgendas } = useStore();
  const [activeTab, setActiveTab] = useState<"pdf" | "docx" | "xlsx" | "backup" | "import">("pdf");
  const [exportType, setExportType] = useState<"all" | "range">("all");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Import State
  const [importSummary, setImportSummary] = useState<BackupSummary | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appName = getAppName(appSettings);

  const handleExportPDF = () => {
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
      icon: "success",
      title: "Berhasil Export PDF!",
      text: `File PDF (${fileName}) telah diunduh.`,
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });

    onClose();
  };

  const handleExportWord = async () => {
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

    try {
      const blob = await generateAgendaDocx({
        agendas: filteredAgendas,
        title: exportType === "all" ? "REKAP SELURUH AGENDA" : "REKAP AGENDA RENTANG WAKTU",
        subtitle: exportType === "all" ? `Mode: Seluruh Agenda` : `Periode: ${format(new Date(startDate), "dd MMM yyyy", { locale: id })} s/d ${format(new Date(endDate), "dd MMM yyyy", { locale: id })}`,
        appSettings,
        mode: exportType === "all" ? "full" : "range",
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });

      const fileName = exportType === "all"
        ? `Rekap_Agenda_Full_${format(new Date(), "yyyyMMdd")}.docx`
        : `Rekap_Agenda_Range_${format(new Date(startDate), "yyyyMMdd")}-${format(new Date(endDate), "yyyyMMdd")}.docx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      Swal.fire({
        icon: "success",
        title: "Berhasil Export Word!",
        text: `Dokumen Word (${fileName}) telah diunduh.`,
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: "top-end"
      });

      onClose();
    } catch (e: any) {
      console.error("Gagal export Word:", e);
      Swal.fire({
        icon: "error",
        title: "Gagal Export Word",
        text: e.message || "Terjadi kesalahan saat membuat dokumen Word."
      });
    }
  };

  const handleExportExcel = () => {
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

    try {
      const { fileName } = generateAgendaExcel({
        agendas: filteredAgendas,
        title: exportType === "all" ? "REKAP SELURUH AGENDA" : "REKAP AGENDA RENTANG WAKTU",
        subtitle: exportType === "all" ? `Mode: Seluruh Agenda` : `Periode: ${format(new Date(startDate), "dd MMM yyyy", { locale: id })} s/d ${format(new Date(endDate), "dd MMM yyyy", { locale: id })}`,
        appSettings,
        mode: exportType === "all" ? "full" : "range",
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });

      Swal.fire({
        icon: "success",
        title: "Berhasil Export Excel!",
        text: `File spreadsheet (${fileName}) telah diunduh.`,
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: "top-end"
      });

      onClose();
    } catch (e: any) {
      console.error("Gagal export Excel:", e);
      Swal.fire({
        icon: "error",
        title: "Gagal Export Excel",
        text: e.message || "Terjadi kesalahan saat membuat file Excel."
      });
    }
  };

  const handleDownloadBackup = () => {
    if (agendas.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Tidak ada data",
        text: "Database agenda saat ini kosong.",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const fileName = downloadAgendaBackup(agendas, appSettings);
    Swal.fire({
      icon: "success",
      title: "Backup Berhasil Dibuat!",
      text: `File cadangan data (${fileName}) telah diunduh ke perangkat Anda.`,
      timer: 2500,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const analysis = validateAndAnalyzeBackup(content, agendas);
      if (!analysis.valid || !analysis.summary) {
        setImportSummary(null);
        Swal.fire({
          icon: "error",
          title: "File Backup Tidak Valid",
          text: analysis.error || "File tidak memenuhi struktur cadangan Agenda."
        });
        return;
      }

      setImportSummary(analysis.summary);
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!importSummary) return;

    const confirm = await Swal.fire({
      title: "Pulihkan Data Agenda?",
      text: `Akan memproses ${importSummary.totalInBackup} agenda (${importSummary.newCount} agenda baru, ${importSummary.existingCount} agenda yang sudah ada).`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya, Mulai Pulihkan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#4f46e5"
    });

    if (!confirm.isConfirmed) return;

    setIsImporting(true);
    try {
      const result = await executeRestoreBackup(
        importSummary.agendas,
        agendas,
        { overwriteExisting }
      );

      await fetchAgendas();

      Swal.fire({
        icon: "success",
        title: "Pemulihan Selesai!",
        html: `
          <div style="text-align: left; font-size: 13px;">
            <p>✅ <b>Agenda Baru Ditambahkan:</b> ${result.importedCount}</p>
            <p>🔄 <b>Agenda Diperbarui:</b> ${result.updatedCount}</p>
            <p>⏭️ <b>Agenda Dilewati:</b> ${result.skippedCount}</p>
          </div>
        `
      });

      setImportSummary(null);
      setImportFileName("");
      onClose();
    } catch (err: any) {
      console.error("Gagal restore backup:", err);
      Swal.fire({
        icon: "error",
        title: "Gagal Memulihkan Data",
        text: err.message || "Terjadi kesalahan saat memproses data cadangan."
      });
    } finally {
      setIsImporting(false);
    }
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
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-lg flex flex-col bg-[#121214] border border-white/10 rounded-3xl p-6 shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-5 shrink-0 border-b border-white/5 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileDown className="w-5 h-5 text-indigo-400" />
                  Eksport & Cadangan Data
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Unduh laporan resmi PDF, Word, atau cadangkan & pulihkan database agenda.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selection */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-black/40 border border-white/10 rounded-2xl mb-5">
              <button
                type="button"
                onClick={() => setActiveTab("pdf")}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  activeTab === "pdf"
                    ? "bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <FileText className="w-4 h-4 text-red-400" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("docx")}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  activeTab === "docx"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                <span>Word</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("xlsx")}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  activeTab === "xlsx"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("backup")}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  activeTab === "backup"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Database className="w-4 h-4 text-amber-400" />
                <span>Backup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("import")}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  activeTab === "import"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <UploadCloud className="w-4 h-4 text-purple-400" />
                <span>Import</span>
              </button>
            </div>

            {/* PDF, DOCX & XLSX Tab View */}
            {(activeTab === "pdf" || activeTab === "docx" || activeTab === "xlsx") && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-2 font-semibold uppercase tracking-wider">
                    Pilih Rentang Agenda:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                      <input 
                        type="radio" 
                        name="exportType" 
                        checked={exportType === "all"} 
                        onChange={() => setExportType("all")}
                        className="w-4 h-4 text-indigo-500 bg-black/50 border-white/20 focus:ring-indigo-500/50"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <CalendarHeart className="w-3.5 h-3.5 text-indigo-400" /> Seluruh Agenda (Full Agenda)
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Mencakup semua agenda terjadwal dan belum ada tanggal.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                      <input 
                        type="radio" 
                        name="exportType" 
                        checked={exportType === "range"} 
                        onChange={() => setExportType("range")}
                        className="w-4 h-4 text-indigo-500 bg-black/50 border-white/20 focus:ring-indigo-500/50"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-indigo-400" /> Rentang Waktu Tertentu
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Agenda difilter pada rentang tanggal spesifik (tanggal kosong masa depan dikelompokkan).
                        </p>
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

                <div className="pt-2">
                  <button
                    onClick={
                      activeTab === "pdf"
                        ? handleExportPDF
                        : activeTab === "docx"
                        ? handleExportWord
                        : handleExportExcel
                    }
                    className={`w-full flex items-center justify-center gap-2 py-3 font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95 text-white ${
                      activeTab === "pdf"
                        ? "bg-red-500 hover:bg-red-600 shadow-red-500/25"
                        : activeTab === "docx"
                        ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/25"
                        : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25"
                    }`}
                  >
                    {activeTab === "pdf" ? (
                      <FileText className="w-4 h-4" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                    Download Dokumen {activeTab === "pdf" ? "PDF" : activeTab === "docx" ? "Word (.docx)" : "Excel (.xlsx)"}
                  </button>
                </div>
              </div>
            )}

            {/* Backup Tab View */}
            {activeTab === "backup" && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                  <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-emerald-300">Cadangan Penuh Database Agenda</h3>
                    <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                      Menyimpan seluruh data agenda ({agendas.length} item) ke dalam file JSON terstruktur. File ini mempertahankan ID canonical (UUID), status, grup konsultasi, dan catatan private untuk pemulihan aman tanpa duplikasi.
                    </p>
                  </div>
                </div>

                <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 space-y-2 text-xs text-zinc-300">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Jumlah Agenda:</span>
                    <span className="font-bold text-white">{agendas.length} Agenda</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Sistem Aplikasi:</span>
                    <span className="font-bold text-indigo-300">{appName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Format Cadangan:</span>
                    <span className="font-bold text-emerald-400">JSON Terstruktur (v1.0)</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleDownloadBackup}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/25 transition-all active:scale-95 text-white"
                  >
                    <FileDown className="w-4 h-4" />
                    Download File Backup Data Agenda (.json)
                  </button>
                </div>
              </div>
            )}

            {/* Import Tab View */}
            {activeTab === "import" && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3">
                  <UploadCloud className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-purple-300">Pemulihan / Restore Data Agenda</h3>
                    <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                      Pilih file cadangan JSON yang sebelumnya diekspor. Sistem akan memvalidasi integritas data, mendeteksi konflik, dan mencegah rekaman duplikat berdasarkan canonical UUID.
                    </p>
                  </div>
                </div>

                {/* File Upload Trigger */}
                <div className="p-4 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 bg-black/40 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <UploadCloud className="w-8 h-8 text-purple-400 mb-2" />
                  <span className="text-xs font-bold text-white">
                    {importFileName ? importFileName : "Pilih File Backup (.json)"}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    Klik untuk memilih file cadangan dari perangkat Anda
                  </span>
                </div>

                {/* Analysis / Summary Box */}
                {importSummary && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Ringkasan File Backup
                      </span>
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-semibold">
                        VALID
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-black/30 p-2 rounded-xl">
                        <div className="text-base font-black text-white">{importSummary.totalInBackup}</div>
                        <div className="text-[10px] text-zinc-400">Total di File</div>
                      </div>
                      <div className="bg-black/30 p-2 rounded-xl">
                        <div className="text-base font-black text-emerald-400">+{importSummary.newCount}</div>
                        <div className="text-[10px] text-zinc-400">Agenda Baru</div>
                      </div>
                      <div className="bg-black/30 p-2 rounded-xl">
                        <div className="text-base font-black text-blue-400">{importSummary.existingCount}</div>
                        <div className="text-[10px] text-zinc-400">UUID Sama</div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overwriteExisting}
                        onChange={(e) => setOverwriteExisting(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500/40"
                      />
                      <span>Perbarui agenda yang sudah ada jika terdapat perbedaan data</span>
                    </label>

                    <button
                      onClick={handleExecuteRestore}
                      disabled={isImporting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95"
                    >
                      {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      {isImporting ? "Memproses Pemulihan..." : "Mulai Pulihkan Data"}
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
