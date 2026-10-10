"use client";

import { useState, useTransition, useEffect } from "react";
import { AppSettings, saveAppSettings } from "@/app/actions/settings";
import { Reorder, motion } from "framer-motion";
import { GripVertical, Save, CheckCircle2, ChevronLeft, Bell, Volume2, VolumeX, Music, FileAudio, ExternalLink, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { 
  isNativePlatform, 
  navigateNative, 
  getNotificationSoundSetting, 
  saveNotificationSoundSetting, 
  playNativeAudioPreview, 
  stopNativeAudioPreview,
  saveCustomSoundNative
} from "@/lib/native-alarm";
import { setAppBranding, updateDocumentTitle } from "@/lib/branding";

interface SettingsFormProps {
  initialSettings?: Partial<AppSettings>;
}

const defaultShareOrder = [
  { id: "title", label: "Judul Agenda" },
  { id: "time", label: "Waktu" },
  { id: "location", label: "Lokasi" },
];

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState("");

  const [appName, setAppName] = useState(initialSettings?.app_name || "AgendaRecap");
  const [appLogo, setAppLogo] = useState(initialSettings?.app_logo || "");
  const [isWatermark, setIsWatermark] = useState(initialSettings?.is_watermark_enabled ?? true);
  const [watermarkText, setWatermarkText] = useState(initialSettings?.watermark_text || "Dibuat oleh AgendaRecap Pro");

  // Notification Sound State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [soundOption, setSoundOption] = useState<string>("default");
  const [customSoundUri, setCustomSoundUri] = useState<string>("");
  const [customSoundName, setCustomSoundName] = useState<string>("");
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  useEffect(() => {
    const s = getNotificationSoundSetting();
    setSoundEnabled(s.soundEnabled);
    setSoundOption(s.soundOption);
    setCustomSoundUri(s.customSoundUri || "");
    setCustomSoundName(s.customSoundName || "");
  }, []);

  const handlePlayPreview = async (soundId?: string) => {
    const targetSound = soundId || (soundOption === 'custom' && customSoundUri ? customSoundUri : soundOption);
    if (!targetSound || targetSound === 'silent' || targetSound === 'off') return;

    setIsPlayingAudio(true);
    const ok = await playNativeAudioPreview(targetSound);
    if (!ok) {
      setIsPlayingAudio(false);
    }
  };

  const handleStopPreview = async () => {
    await stopNativeAudioPreview();
    setIsPlayingAudio(false);
  };

  const handleCustomFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'File Terlalu Besar',
        text: 'Ukuran audio maksimal 5 MB.'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      let effectiveUri = dataUri;
      if (isNativePlatform()) {
        try {
          const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
          const res = await saveCustomSoundNative({ base64Data, fileName: file.name });
          if (res.success && res.soundUri) {
            effectiveUri = res.soundUri;
          }
        } catch (err) {
          console.error("Failed to save custom sound natively:", err);
        }
      }
      setCustomSoundUri(effectiveUri);
      setCustomSoundName(file.name);
      setSoundOption('custom');
      saveNotificationSoundSetting({
        soundEnabled: true,
        soundOption: 'custom',
        customSoundUri: effectiveUri,
        customSoundName: file.name
      });
      Swal.fire({
        icon: 'success',
        title: 'Audio Custom Dipilih',
        text: `File "${file.name}" siap digunakan.`
      });
    };
    reader.readAsDataURL(file);
  };
  
  // Reorder state safely formatted
  const rawOrder = initialSettings?.share_order;
  const orderIds = Array.isArray(rawOrder) 
    ? rawOrder.filter((id): id is string => typeof id === "string")
    : ["title", "time", "location"];

  const [shareOrder, setShareOrder] = useState(() => {
    const matched = orderIds
      .map((id) => defaultShareOrder.find((s) => s.id === id))
      .filter((item): item is { id: string; label: string } => Boolean(item));
    
    // Ensure all default items are present
    defaultShareOrder.forEach(def => {
      if (!matched.some(m => m.id === def.id)) {
        matched.push(def);
      }
    });

    return matched;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg("");
    
    // Save local sound preference
    saveNotificationSoundSetting({
      soundEnabled,
      soundOption,
      customSoundUri,
      customSoundName
    });

    startTransition(async () => {
      const res = await saveAppSettings({
        app_name: appName,
        app_logo: appLogo || null,
        is_watermark_enabled: isWatermark,
        watermark_text: watermarkText,
        share_order: shareOrder.map((s) => s.id),
      });

      if (res.success) {
        setAppBranding({ app_name: appName, app_logo: appLogo });
        updateDocumentTitle(undefined, { app_name: appName });
        setSuccessMsg("Pengaturan berhasil disimpan.");
        Swal.fire({
          icon: 'success',
          title: 'Tersimpan!',
          text: 'Pengaturan aplikasi dan suara berhasil disimpan.',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        try {
          router.refresh();
        } catch (_) {
          // Ignore refresh error on native/static export
        }
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal', text: res.error });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* Basic Settings */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 space-y-6 shadow-xl">
        <h2 className="text-lg font-semibold border-b border-white/10 pb-4">Branding</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Nama Aplikasi</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500/50 transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">URL Logo Aplikasi (Opsional)</label>
            <input
              type="url"
              value={appLogo}
              onChange={(e) => setAppLogo(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500/50 transition-all"
              placeholder="https://example.com/logo.png"
            />
            {appLogo && (
              <div className="mt-3">
                <img src={appLogo} alt="Logo Preview" className="h-10 object-contain rounded-md" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WA Settings */}
      <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 space-y-6 shadow-xl">
        <h2 className="text-lg font-semibold border-b border-white/10 pb-4">Format Berbagi WhatsApp</h2>
        
        {/* Reorder List */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-3">
            Urutan Informasi (Drag untuk memindahkan)
          </label>
          <Reorder.Group 
            axis="y" 
            values={shareOrder} 
            onReorder={setShareOrder}
            className="space-y-2"
          >
            {shareOrder.map((item) => (
              <Reorder.Item
                key={item.id}
                value={item}
                className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-grab active:cursor-grabbing hover:bg-white/10 transition-colors"
              >
                <GripVertical className="text-zinc-500 w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        {/* Watermark Toggle */}
        <div className="pt-4 space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
            <div>
               <h3 className="font-medium text-white">Watermark Footer</h3>
               <p className="text-sm text-zinc-400 mt-1">Sertakan teks di akhir pesan WhatsApp</p>
            </div>
            <button
              type="button"
              onClick={() => setIsWatermark(!isWatermark)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                isWatermark ? "bg-purple-500" : "bg-zinc-600"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  isWatermark ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <motion.div
            initial={{ opacity: isWatermark ? 1 : 0, height: isWatermark ? "auto" : 0 }}
            animate={{ opacity: isWatermark ? 1 : 0, height: isWatermark ? "auto" : 0 }}
            className="space-y-2 overflow-hidden"
          >
            <label className="block text-sm font-medium text-zinc-400">Teks Watermark</label>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              required={isWatermark}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500/50 transition-all"
            />
          </motion.div>
        </div>
      </div>

      {/* Notification Sound Settings */}
      <div className="bg-[#121214] border border-blue-500/20 rounded-2xl p-6 space-y-6 shadow-xl bg-gradient-to-b from-blue-950/10 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Music className="w-5 h-5 text-blue-400" /> Suara Notifikasi & Alarm
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Atur preferensi suara pengingat Android Native & Browser.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isPlayingAudio ? (
              <button
                type="button"
                onClick={handleStopPreview}
                className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg"
              >
                <VolumeX className="w-4 h-4 text-red-400 animate-pulse" /> STOP PREVIEW
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePlayPreview()}
                disabled={!soundEnabled}
                className="px-3.5 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 active:scale-95 text-blue-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Volume2 className="w-4 h-4 text-blue-400" /> PREVIEW SUARA
              </button>
            )}
          </div>
        </div>

        {/* Master ON/OFF Switch */}
        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
          <div>
            <h3 className="font-medium text-white flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-blue-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-400" />
              )}
              {soundEnabled ? "Suara Notifikasi: AKTIF" : "Suara Notifikasi: SENYAP (OFF)"}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {soundEnabled
                ? "Pengingat dan alarm akan berbunyi sesuai nada dering yang dipilih."
                : "Pengingat tetap muncul di layar dan bergetar, namun tanpa nada dering (Silent)."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
              soundEnabled ? "bg-blue-500" : "bg-zinc-600"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                soundEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Sound Selection Grid */}
        {soundEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4"
          >
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Pilih Nada Dering / Alarm:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { id: "default", label: "Default Alarm System", desc: "Suara alarm standar sistem OS Android" },
                { id: "chime", label: "Gentle Chime", desc: "Notifikasi lembut bernada sedang" },
                { id: "ringtone", label: "Device Ringtone", desc: "Nada dering standar panggilan" },
                { id: "digital", label: "Digital Alarm", desc: "Suara beeper digital frekuensi tinggi" },
                { id: "urgent", label: "Urgent Bell", desc: "Lonceng peringatan cepat" },
                { id: "custom", label: "Custom File Audio", desc: "Upload file MP3 / WAV pilihan" },
              ].map((opt) => {
                const isSelected = soundOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSoundOption(opt.id);
                      if (opt.id !== "custom") handlePlayPreview(opt.id);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? "bg-blue-500/20 border-blue-400/60 text-white shadow-md shadow-blue-500/10"
                        : "bg-black/30 border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                        <Music className={`w-3.5 h-3.5 ${isSelected ? "text-blue-400" : "text-zinc-500"}`} />
                        {opt.label}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">{opt.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Custom Audio Upload */}
            {soundOption === "custom" && (
              <div className="p-4 rounded-xl bg-black/40 border border-blue-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileAudio className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-300">File Audio Custom Pilihan:</h4>
                    <p className="text-xs text-zinc-300 font-mono mt-0.5 truncate max-w-xs sm:max-w-md">
                      {customSoundName || "Belum ada file audio terpilih."}
                    </p>
                  </div>
                </div>

                <label className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border border-white/10">
                  <FileAudio className="w-4 h-4 text-blue-400" />
                  <span>Pilih File Audio</span>
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                    onChange={handleCustomFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </motion.div>
        )}

        {/* Link to Full Notification Diagnostics */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Perlu menguji alarm presisi, Web Push, atau permission sistem Android?
          </p>
          <Link
            href="/settings/notifications"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>Diagnostik Lengkap</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 sticky bottom-6 z-10 p-4 bg-[#121214]/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
        {isNativePlatform() ? (
          <button
            type="button"
            onClick={() => navigateNative('index.html')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> Kembali ke Beranda
          </button>
        ) : (
          <Link 
            href="/" 
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> Kembali ke Beranda
          </Link>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white rounded-lg font-medium shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isPending ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </div>
    </form>
  );
}
