import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin } from "lucide-react";
import { useStore, Agenda } from "@/store/useStore";
import { format } from "date-fns";

interface AddAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: Date;
  editAgenda?: Agenda | null;
}

export function AddAgendaModal({ isOpen, onClose, defaultDate, editAgenda }: AddAgendaModalProps) {
  const { addAgenda, updateAgenda } = useStore();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [time, setTime] = useState("09:00");

  // New fields
  const [status, setStatus] = useState<'confirmed' | 'pending_consultation' | 'rescheduled' | 'cancelled' | 'unscheduled'>('confirmed');
  const [isShareable, setIsShareable] = useState(true);
  const [privateNotes, setPrivateNotes] = useState("");
  
  // Multi-day fields
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [endDate, setEndDate] = useState<Date>(defaultDate);
  const [multiDateTimes, setMultiDateTimes] = useState<Record<string, string>>({});

  // Online Meeting fields
  const [isOnline, setIsOnline] = useState(false);
  const [onlineLink, setOnlineLink] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [meetingPasscode, setMeetingPasscode] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editAgenda) {
        setTitle(editAgenda.title);
        setLocation(editAgenda.location);
        setNotes(editAgenda.notes || "");
        setPrivateNotes(editAgenda.privateNotes || "");
        setIncludeNotes(editAgenda.include_notes_in_share);
        setTime(format(new Date(editAgenda.scheduled_at), "HH:mm"));
        setStatus(editAgenda.status || 'confirmed');
        setIsShareable(editAgenda.isShareable ?? true);
        setIsMultiDay(false);
        setIsOnline(editAgenda.isOnline || false);
        setOnlineLink(editAgenda.onlineLink || "");
        setMeetingId(editAgenda.meetingId || "");
        setMeetingPasscode(editAgenda.meetingPasscode || "");
      } else {
        setTitle("");
        setLocation("");
        setNotes("");
        setPrivateNotes("");
        setIncludeNotes(false);
        setTime("09:00");
        setStatus('confirmed');
        setIsShareable(true);
        setIsMultiDay(false);
        setEndDate(defaultDate);
        setMultiDateTimes({});
        setIsOnline(false);
        setOnlineLink("");
        setMeetingId("");
        setMeetingPasscode("");
      }
    }
  }, [isOpen, editAgenda, defaultDate]);

  useEffect(() => {
    if (isMultiDay && endDate >= defaultDate) {
      const times: Record<string, string> = {};
      let curr = new Date(defaultDate);
      curr.setHours(0,0,0,0);
      const end = new Date(endDate);
      end.setHours(0,0,0,0);

      while (curr <= end) {
        const key = format(curr, 'yyyy-MM-dd');
        times[key] = multiDateTimes[key] || time;
        curr.setDate(curr.getDate() + 1);
      }
      setMultiDateTimes(times);
    }
  }, [isMultiDay, defaultDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !location) return;

    setIsSubmitting(true);
    let success = true;

    try {
      if (editAgenda) {
        const scheduledDate = new Date(editAgenda.scheduled_at);
        const [hours, minutes] = time.split(":").map(Number);
        scheduledDate.setHours(hours, minutes, 0, 0);

        success = await updateAgenda(editAgenda.id, {
          title,
          location,
          notes,
          privateNotes,
          include_notes_in_share: includeNotes,
          scheduled_at: scheduledDate.toISOString(),
          status,
          isShareable,
          isOnline,
          onlineLink,
          meetingId,
          meetingPasscode
        });
      } else {
        if (isMultiDay) {
          const groupId = crypto.randomUUID?.() || Date.now().toString();
          
          let curr = new Date(defaultDate);
          curr.setHours(0,0,0,0);
          const end = new Date(endDate);
          end.setHours(0,0,0,0);

          while (curr <= end) {
            const key = format(curr, 'yyyy-MM-dd');
            const dayTime = multiDateTimes[key] || "09:00";
            const [hours, minutes] = dayTime.split(":").map(Number);
            const scheduledDate = new Date(curr);
            scheduledDate.setHours(hours, minutes, 0, 0);

            const res = await addAgenda({
              title,
              location,
              notes,
              privateNotes,
              include_notes_in_share: includeNotes,
              scheduled_at: scheduledDate.toISOString(),
              status,
              isShareable,
              groupId,
              isOnline,
              onlineLink,
              meetingId,
              meetingPasscode
            });
            if (!res) success = false;
            curr.setDate(curr.getDate() + 1);
          }
        } else {
          const scheduledDate = new Date(defaultDate);
          const [hours, minutes] = time.split(":").map(Number);
          scheduledDate.setHours(hours, minutes, 0, 0);

          success = await addAgenda({
            title,
            location,
            notes,
            privateNotes,
            include_notes_in_share: includeNotes,
            scheduled_at: scheduledDate.toISOString(),
            status,
            isShareable,
            isOnline,
            onlineLink,
            meetingId,
            meetingPasscode
          });
        }
      }
    } catch (e) {
      success = false;
    }

    setIsSubmitting(false);
    if (success) {
      onClose();
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md max-h-[90vh] overflow-y-auto bg-[#121214] border border-white/10 rounded-3xl p-6 shadow-2xl z-50 hide-scrollbar"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editAgenda ? "Edit Agenda" : "Agenda Baru"}
              </h2>
              <button
                onClick={onClose}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Judul Agenda <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Makan siang bersama klien..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                />
              </div>

              <div className="flex flex-col gap-4">
                {!editAgenda && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIsMultiDay(!isMultiDay)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isMultiDay ? "bg-purple-500" : "bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isMultiDay ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-zinc-300">
                      Agenda Multi-Hari
                    </span>
                  </div>
                )}

                {isMultiDay && !editAgenda && (
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Sampai Tanggal</label>
                        <input
                          type="date"
                          required
                          min={format(defaultDate, 'yyyy-MM-dd')}
                          value={format(endDate, 'yyyy-MM-dd')}
                          onChange={(e) => setEndDate(new Date(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    {Object.entries(multiDateTimes).map(([dateKey, t]) => (
                      <div key={dateKey} className="flex justify-between items-center gap-4 p-2 bg-black/20 rounded-lg">
                        <span className="text-sm text-zinc-300 font-medium">
                          {format(new Date(dateKey), 'dd MMM yyyy')}
                        </span>
                        <input
                          type="time"
                          required
                          value={t}
                          onChange={(e) => setMultiDateTimes(prev => ({...prev, [dateKey]: e.target.value}))}
                          className="w-32 bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all [color-scheme:dark]"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> Tempat <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={isOnline ? "Zoom / GMeet / Dsb..." : "Ruang Rapat..."}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                  {!isMultiDay && (
                    <div className="w-1/3">
                      <label className="block text-sm font-medium text-zinc-400 mb-1.5">Waktu</label>
                      <input
                        type="time"
                        required
                        lang="id-ID"
                        step="60"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all [color-scheme:dark]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ONLINE MEETING TOGGLE */}
              <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl mt-4 max-w-full">
                <button
                  type="button"
                  onClick={() => setIsOnline(!isOnline)}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isOnline ? "bg-blue-500" : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isOnline ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-zinc-300 truncate">
                    Agenda Daring (Online Meeting)
                  </span>
                  <span className="text-[10px] text-zinc-500 truncate">Aktifkan untuk menambahkan Link, Meeting ID, dsb.</span>
                </div>
              </div>

              {/* ONLINE MEETING FIELDS */}
              {isOnline && (
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-4 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Link Meeting (Opsional)</label>
                    <input
                      type="url"
                      value={onlineLink}
                      onChange={(e) => setOnlineLink(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium text-zinc-400 mb-1.5">Meeting ID (Opsional)</label>
                      <input
                        type="text"
                        value={meetingId}
                        onChange={(e) => setMeetingId(e.target.value)}
                        placeholder="123 456 7890"
                        className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium text-zinc-400 mb-1.5">Passcode (Opsional)</label>
                      <input
                        type="text"
                        value={meetingPasscode}
                        onChange={(e) => setMeetingPasscode(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 mt-4">Catatan Publik (Opsional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Siapkan bahan presentasi..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Bahan Konsultasi / Private Notes</label>
                <textarea
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder="Catatan rahasia/internal untuk pimpinan..."
                  rows={2}
                  className="w-full bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all resize-none"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Status Agenda</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all [&>option]:bg-[#121214] [&>option]:text-white"
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending_consultation">Pending Consultation</option>
                    <option value="rescheduled">Rescheduled</option>
                    <option value="unscheduled">Unscheduled / Belum Ada Tanggal</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {notes && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIncludeNotes(!includeNotes)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        includeNotes ? "bg-purple-500" : "bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          includeNotes ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-zinc-300">
                      Cantumkan catatan di WhatsApp Share
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsShareable(!isShareable)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isShareable ? "bg-emerald-500" : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isShareable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  Aktifkan di Share/Rekap WA
                  {!isShareable && <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 font-bold tracking-wide">PENGINGAT INTERNAL</span>}
                </span>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 transition-all outline-none focus:ring-2 focus:ring-purple-500/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : editAgenda ? "Simpan Perubahan" : "Simpan Agenda"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
