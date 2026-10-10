"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarHeart, MapPin, Share2, FileText, CheckCircle2, Circle, Clock, ShieldCheck, Link2, Video, Sparkles, Copy, Check, Search, Calendar, Filter } from "lucide-react";
import { getAgendaDateDisplay, getAgendaTimeDisplay, getAgendaTimeMode } from "@/lib/agenda-time";
import { generateAgendaPDF } from "@/lib/pdf-export";
import { buildTimelineBlocks } from "@/lib/agenda-timeline";
import { getAppName } from "@/lib/branding";
import Swal from "sweetalert2";
import Link from "next/link";

interface PublicAgenda {
  id: string;
  title: string;
  location: string;
  scheduled_at?: string;
  time_mode?: string;
  status: string;
  is_completed: boolean;
  isOnline: boolean;
  onlineLink?: string;
  meetingId?: string;
  meetingPasscode?: string;
  notes?: string;
  isShareable: boolean;
}

export default function PublicShareClient({ token }: { token: string }) {
  const [agendas, setAgendas] = useState<PublicAgenda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Search & Filter state (Sections 8, 9, 10, 11, 12)
  const [searchQuery, setSearchQuery] = useState("");
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [includeUnscheduled, setIncludeUnscheduled] = useState(true);

  useEffect(() => {
    async function loadPublicData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error("Gagal memuat agenda yang dibagikan");
        const json = await res.json();
        setAgendas(json.agendas || []);
      } catch (err: any) {
        setError(err.message || "Terjadi kesalahan saat memuat data");
      } finally {
        setIsLoading(false);
      }
    }
    loadPublicData();
  }, [token]);

  // Apply Quick Date Presets (Section 9)
  const applyPreset = (preset: "all" | "today" | "tomorrow" | "this_week" | "this_month") => {
    const now = new Date();
    if (preset === "all") {
      setStartDateStr("");
      setEndDateStr("");
    } else if (preset === "today") {
      const formatted = format(now, "yyyy-MM-dd");
      setStartDateStr(formatted);
      setEndDateStr(formatted);
    } else if (preset === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const formatted = format(tomorrow, "yyyy-MM-dd");
      setStartDateStr(formatted);
      setEndDateStr(formatted);
    } else if (preset === "this_week") {
      const startWeek = new Date(now);
      startWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      const endWeek = new Date(startWeek);
      endWeek.setDate(startWeek.getDate() + 6); // Sunday
      setStartDateStr(format(startWeek, "yyyy-MM-dd"));
      setEndDateStr(format(endWeek, "yyyy-MM-dd"));
    } else if (preset === "this_month") {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDateStr(format(startMonth, "yyyy-MM-dd"));
      setEndDateStr(format(endMonth, "yyyy-MM-dd"));
    }
  };

  // Filtered Agendas (Sections 8, 10, 11)
  const filteredAgendas = agendas.filter(agenda => {
    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = agenda.title.toLowerCase().includes(q);
      const matchLocation = agenda.location ? agenda.location.toLowerCase().includes(q) : false;
      const matchNotes = agenda.notes ? agenda.notes.toLowerCase().includes(q) : false;
      if (!matchTitle && !matchLocation && !matchNotes) return false;
    }

    // 2. Date Range Filter
    const timeMode = getAgendaTimeMode(agenda);
    if (timeMode === "unscheduled") {
      return includeUnscheduled;
    }

    if (agenda.scheduled_at) {
      const agendaDateStr = format(parseISO(agenda.scheduled_at), "yyyy-MM-dd");
      if (startDateStr && agendaDateStr < startDateStr) return false;
      if (endDateStr && agendaDateStr > endDateStr) return false;
    }

    return true;
  });

  const scheduledAgendas = filteredAgendas
    .filter(a => getAgendaTimeMode(a) !== 'unscheduled')
    .sort((a, b) => {
      const tA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const tB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return tA - tB;
    });

  const unscheduledAgendas = filteredAgendas
    .filter(a => getAgendaTimeMode(a) === 'unscheduled');

  const { timelineBlocks } = buildTimelineBlocks(
    filteredAgendas,
    startDateStr && endDateStr ? "range" : "full",
    startDateStr ? new Date(startDateStr + "T00:00:00") : undefined,
    endDateStr ? new Date(endDateStr + "T23:59:59") : undefined
  );

  const handleExportPDF = () => {
    if (filteredAgendas.length === 0) return;
    const doc = generateAgendaPDF({
      agendas: filteredAgendas as any,
      title: "REKAP AGENDA",
      subtitle: `Tautan Agenda: ${token}`,
      appSettings: { app_name: getAppName() } as any,
      mode: startDateStr && endDateStr ? "range" : "full",
      startDate: startDateStr ? new Date(startDateStr + "T00:00:00") : undefined,
      endDate: endDateStr ? new Date(endDateStr + "T23:59:59") : undefined
    });
    doc.save(`Rekap_Agenda_${token}.pdf`);
    Swal.fire({
      icon: "success",
      title: "PDF Berhasil Diunduh",
      text: "Dokumen PDF rekap agenda telah disimpan.",
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
  };

  const handleCopyPublicSummary = () => {
    if (agendas.length === 0) return;
    const currentAppName = getAppName();
    let text = `*REKAP AGENDA*\n\n`;
    
    if (scheduledAgendas.length > 0) {
      text += `*I. AGENDA TERJADWAL*\n`;
      scheduledAgendas.forEach((item, idx) => {
        const timeStr = getAgendaTimeDisplay(item);
        const dateStr = getAgendaDateDisplay(item);
        text += `${idx + 1}. *${item.title}*\n   Waktu: ${dateStr}, ${timeStr}\n   Lokasi: ${item.location || '-'}\n\n`;
      });
    }

    if (unscheduledAgendas.length > 0) {
      text += `*II. BELUM TERJADWAL (TANPA TANGGAL PASTI)*\n`;
      unscheduledAgendas.forEach((item, idx) => {
        text += `${idx + 1}. *${item.title}*\n   Lokasi: ${item.location || '-'}\n\n`;
      });
    }

    text += `_Dibuat via ${currentAppName} Shared Portal_`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);

    Swal.fire({
      icon: "success",
      title: "Ringkasan Teks Disalin!",
      text: "Ringkasan agenda telah disalin ke clipboard.",
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#09090b] text-zinc-100 font-sans selection:bg-purple-500 selection:text-white">
      {/* Dynamic Ornaments */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/15 rounded-full blur-[160px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
        
        {/* Header Navigation / Branding */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl shadow-lg shadow-purple-500/25 shrink-0">
              <CalendarHeart className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">{getAppName()}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> READ-ONLY PORTAL
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Dokumen Agenda Resmi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPublicSummary}
              disabled={agendas.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-indigo-400" />}
              <span>{isCopied ? "Tersalin!" : "Salin Teks"}</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={agendas.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-xl text-xs shadow-lg shadow-purple-500/25 transition-all active:scale-95 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>
        </header>

        {/* Filter & Search Bar (Sections 8, 9, 10, 11, 12) */}
        {!isLoading && !error && agendas.length > 0 && (
          <div className="p-5 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari agenda (judul, lokasi, perihal)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Date Range Inputs & Presets */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-1 border-t border-white/5">
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-xs font-semibold text-zinc-300 shrink-0">Rentang:</span>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <span className="text-xs text-zinc-500">s/d</span>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-1">
                {[
                  { id: "all", label: "Semua" },
                  { id: "today", label: "Hari Ini" },
                  { id: "tomorrow", label: "Besok" },
                  { id: "this_week", label: "Minggu Ini" },
                  { id: "this_month", label: "Bulan Ini" }
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id as any)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-purple-500/20 text-zinc-400 hover:text-purple-300 border border-white/10 transition-all shrink-0"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle Unscheduled Section */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200">
                <input
                  type="checkbox"
                  checked={includeUnscheduled}
                  onChange={(e) => setIncludeUnscheduled(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500"
                />
                <span>Sertakan Agenda Belum Ada Tanggal (UNSCHEDULED)</span>
              </label>
            </div>
          </div>
        )}

        {/* Content Body */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl">
            <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
            <p className="text-zinc-400 font-medium text-sm">Memuat agenda...</p>
          </div>
        ) : error ? (
          <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-3xl text-center backdrop-blur-xl">
            <p className="text-red-400 font-semibold mb-2">{error}</p>
            <p className="text-zinc-500 text-xs">Pastikan link yang Anda buka benar dan valid.</p>
          </div>
        ) : agendas.length === 0 ? (
          <div className="p-12 bg-white/5 border border-white/10 rounded-3xl text-center backdrop-blur-xl">
            <CalendarHeart className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-zinc-300">Belum Ada Agenda</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Tidak ada agenda yang dibagikan untuk link ini.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* SECTION I: AGENDA TERJADWAL & TIMELINE */}
            {timelineBlocks.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-2 px-1">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">
                    I. Timeline Agenda Terjadwal
                  </h2>
                </div>

                <div className="space-y-6">
                  {timelineBlocks.map((block, bIdx) => {
                    if (block.type === "DAY_WITH_AGENDAS") {
                      return (
                        <div key={`day-${bIdx}`} className="space-y-3">
                          {/* Single Grouped Date Header Banner */}
                          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-purple-900/20 border border-purple-500/30 rounded-2xl shadow-lg backdrop-blur-md">
                            <div className="flex items-center gap-2.5">
                              <Calendar className="w-4 h-4 text-purple-400" />
                              <h3 className="text-sm font-bold text-white tracking-wide">{block.formattedHeader}</h3>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {block.agendas.length} Agenda
                            </span>
                          </div>

                          {/* Agendas list under this date */}
                          <div className="grid gap-3 pl-2 sm:pl-4 border-l-2 border-purple-500/20 ml-3">
                            {block.agendas.map((agenda) => {
                              const timeDisplay = getAgendaTimeDisplay(agenda);

                              return (
                                <div
                                  key={agenda.id}
                                  className="p-4 bg-white/5 border border-white/10 hover:border-purple-500/30 rounded-2xl transition-all backdrop-blur-md flex flex-col sm:flex-row gap-3 justify-between items-start"
                                >
                                  <div className="space-y-2 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-purple-400" />
                                        {timeDisplay}
                                      </span>
                                    </div>

                                    <h4 className="text-base font-bold text-white leading-snug">
                                      {agenda.title}
                                    </h4>

                                    <div className="flex flex-col gap-1 pt-1 text-xs text-zinc-300">
                                      <div className="flex items-center gap-2 text-zinc-400">
                                        {agenda.isOnline ? <Video className="w-4 h-4 text-blue-400 shrink-0" /> : <MapPin className="w-4 h-4 text-purple-400 shrink-0" />}
                                        <span>{agenda.location || "-"}</span>
                                      </div>

                                      {agenda.isOnline && agenda.onlineLink && (
                                        <div className="flex items-center gap-2 text-blue-400 pl-6">
                                          <Link2 className="w-3.5 h-3.5" />
                                          <a href={agenda.onlineLink} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-md">
                                            {agenda.onlineLink}
                                          </a>
                                        </div>
                                      )}

                                      {agenda.isOnline && agenda.meetingId && (
                                        <div className="text-zinc-400 text-[11px] pl-6">
                                          Meeting ID: <span className="text-white font-medium">{agenda.meetingId}</span>
                                          {agenda.meetingPasscode && <span className="ml-3">Passcode: <span className="text-white font-medium">{agenda.meetingPasscode}</span></span>}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    } else if (block.type === "EMPTY_DAYS_GROUP") {
                      return (
                        <div
                          key={`empty-${bIdx}`}
                          className="p-4 bg-amber-500/10 border-2 border-dashed border-amber-500/30 hover:border-amber-500/50 rounded-2xl backdrop-blur-md transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                                SLOT KOSONG: {block.formattedHeader}
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Bisa Direncanakan
                            </span>
                          </div>
                          <div className="flex items-start gap-2.5 text-xs text-amber-200/90 pt-1">
                            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              <strong>Perhatian:</strong> {block.note}
                            </p>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </section>
            )}

            {/* SECTION II: AGENDA TANPA TANGGAL PASTI (UNSCHEDULED) */}
            {unscheduledAgendas.length > 0 && (
              <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 px-1">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                    II. Agenda Tanpa Tanggal Pasti / Belum Terjadwal ({unscheduledAgendas.length})
                  </h2>
                </div>

                <div className="grid gap-4">
                  {unscheduledAgendas.map((agenda) => (
                    <div
                      key={agenda.id}
                      className="p-5 bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 rounded-2xl transition-all backdrop-blur-md"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                            Belum Ada Tanggal
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-white leading-snug">
                          {agenda.title}
                        </h3>

                        <div className="flex items-center gap-2 text-xs text-zinc-300 pt-1">
                          <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>{agenda.location || "-"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Footer watermark */}
            <footer className="pt-8 text-center text-xs text-zinc-500 border-t border-white/5 space-y-2">
              <p className="font-medium">Dibuat Resmi melalui Sistem {getAppName()}</p>
              <p className="text-[11px]">Seluruh informasi disajikan dalam mode Read-Only.</p>
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}
