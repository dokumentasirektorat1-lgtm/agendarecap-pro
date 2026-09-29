"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2, Copy, Check, ExternalLink, ShieldCheck, Globe, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import Swal from "sweetalert2";

interface PublicShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
}

export function PublicShareModal({ isOpen, onClose, selectedDate }: PublicShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [shareDateStr, setShareDateStr] = useState(format(selectedDate, "yyyy-MM-dd"));
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      let currentOrigin = window.location.origin;
      // If running inside Capacitor Native (file:// or Capacitor origin) or dev fallback
      if (currentOrigin.startsWith("file:") || currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1")) {
        const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (configuredUrl) {
          currentOrigin = configuredUrl;
        }
      }
      setOrigin(currentOrigin);
    }
    setShareDateStr(format(selectedDate, "yyyy-MM-dd"));
  }, [selectedDate, isOpen]);

  const singleShareUrl = `${origin}/share/shared`;

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);

    Swal.fire({
      icon: "success",
      title: "Tautan Agenda Disalin!",
      text: "URL dapat langsung dikirim ke WhatsApp atau Email.",
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-md bg-[#121214] border border-white/10 rounded-3xl p-6 shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl shadow-lg shadow-purple-500/25">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Bagikan Agenda
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Satu tautan resmi untuk seluruh agenda yang dibagikan.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Single Link Box */}
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Tautan Agenda Resmi (Read-Only)</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Aktif</span>
                </div>
                <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl p-2.5">
                  <span className="text-xs text-zinc-200 truncate flex-1 font-mono font-medium">{singleShareUrl}</span>
                  <button
                    onClick={() => handleCopyLink(singleShareUrl)}
                    className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shrink-0 shadow-md shadow-indigo-500/20"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Tersalin" : "Salin Link"}</span>
                  </button>
                </div>
              </div>

              {/* Info Security Badge */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Keamanan Terjamin:</strong> Tautan ini hanya menampilkan agenda dengan status <em>Shareable</em> (Dapat Dibagikan). Menambah, memperbarui, atau menghapus agenda akan otomatis memperbarui tampilan tautan ini secara otomatis.
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <a
                href={singleShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-xl border border-white/10 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Pratinjau Halaman Agenda
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
