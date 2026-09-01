"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Share2, CalendarDays, CalendarRange } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { formatWeeklyAgendasToWhatsApp, WeeklyCriteria } from "@/lib/whatsapp-formatter";
import { format, addDays, startOfWeek } from "date-fns";
import { id } from "date-fns/locale";
import Swal from "sweetalert2";

interface CopyWeeklyModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings | null;
}

export function CopyWeeklyModal({ isOpen, onClose, appSettings }: CopyWeeklyModalProps) {
  const { agendas } = useStore();
  const [criteria, setCriteria] = useState<WeeklyCriteria>("next_7_days");
  const [isCopied, setIsCopied] = useState(false);

  const today = useMemo(() => new Date(), []);

  // Compute label dates for options preview
  const next7DaysRange = useMemo(() => {
    const start = today;
    const end = addDays(today, 6);
    return `${format(start, "d MMM", { locale: id })} - ${format(end, "d MMM yyyy", { locale: id })}`;
  }, [today]);

  const mondayToSundayRange = useMemo(() => {
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);
    return `${format(monday, "d MMM", { locale: id })} - ${format(sunday, "d MMM yyyy", { locale: id })}`;
  }, [today]);

  const formattedText = useMemo(() => {
    return formatWeeklyAgendasToWhatsApp(criteria, agendas, appSettings, today);
  }, [criteria, agendas, appSettings, today]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      Swal.fire({
        icon: "success",
        title: "Tersalin!",
        text: "Rekap agenda 1 minggu berhasil disalin ke clipboard.",
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: "top-end",
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: "Tidak dapat menyalin teks ke clipboard.",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
      });
    }
  };

  const handleShareWA = () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const waLink = isMobile
      ? `whatsapp://send?text=${encodeURIComponent(formattedText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(formattedText)}`;
    window.open(waLink, "_blank");
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-lg max-h-[90vh] flex flex-col bg-[#121214] border border-white/10 rounded-3xl p-6 shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-400" />
                  Copy Agenda 1 Minggu
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Pilih kriteria rentang 1 minggu untuk membuat rekap agenda.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Criteria Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 shrink-0">
              <button
                type="button"
                onClick={() => setCriteria("next_7_days")}
                className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  criteria === "next_7_days"
                    ? "bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <CalendarDays className={`w-4 h-4 ${criteria === "next_7_days" ? "text-indigo-400" : "text-zinc-400"}`} />
                    Kriteria 1
                  </span>
                  {criteria === "next_7_days" && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">1 Minggu Ke Depan</p>
                  <p className="text-[11px] text-zinc-400">Hari ini s/d 7 hari kedepan</p>
                  <p className="text-[10px] text-indigo-300 font-mono mt-1">{next7DaysRange}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCriteria("monday_to_sunday")}
                className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  criteria === "monday_to_sunday"
                    ? "bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <CalendarRange className={`w-4 h-4 ${criteria === "monday_to_sunday" ? "text-indigo-400" : "text-zinc-400"}`} />
                    Kriteria 2
                  </span>
                  {criteria === "monday_to_sunday" && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">Senin - Minggu</p>
                  <p className="text-[11px] text-zinc-400">1 Minggu Penuh (Senin-Minggu)</p>
                  <p className="text-[10px] text-indigo-300 font-mono mt-1">{mondayToSundayRange}</p>
                </div>
              </button>
            </div>

            {/* Preview Box */}
            <div className="flex-1 min-h-[160px] max-h-[260px] flex flex-col bg-black/40 border border-white/10 rounded-2xl p-3.5 mb-5 overflow-hidden">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10 shrink-0">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Pratinjau Rekap Teks</span>
                <span className="text-[10px] text-zinc-500 font-mono">Format WhatsApp</span>
              </div>
              <textarea
                readOnly
                value={formattedText}
                className="flex-1 w-full bg-transparent text-zinc-300 text-xs font-mono resize-none focus:outline-none hide-scrollbar overflow-y-auto leading-relaxed"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
              >
                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{isCopied ? "Tersalin!" : "Salin ke Clipboard"}</span>
              </button>

              <button
                type="button"
                onClick={handleShareWA}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                title="Bagikan ke WhatsApp"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Share WA</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
