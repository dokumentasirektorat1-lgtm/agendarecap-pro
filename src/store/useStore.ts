import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import Swal from "sweetalert2";

export type Agenda = {
  id: string;
  user_id?: string;
  title: string;
  location: string;
  notes?: string;
  scheduled_at: string;
  privateNotes?: string;
  is_completed: boolean;
  include_notes_in_share: boolean;
  status: 'confirmed' | 'pending_consultation' | 'rescheduled' | 'cancelled' | 'unscheduled';
  isShareable: boolean;
  groupId?: string;
  isOnline?: boolean;
  onlineLink?: string;
  meetingId?: string;
  meetingPasscode?: string;
  isUrgent?: boolean;
  created_at?: string;
  updated_at: string;
};

type StoreState = {
  agendas: Agenda[];
  sharedDates: Record<string, string>; // Maps "YYYY-MM-DD" to ISO "last_shared_at"
  isLoading: boolean;
  error: string | null;
  subscriptionActive: boolean;
  fetchAgendas: () => Promise<void>;
  addAgenda: (agenda: Omit<Agenda, "id" | "is_completed" | "updated_at">) => Promise<boolean>;
  toggleComplete: (id: string) => Promise<void>;
  deleteAgenda: (id: string) => Promise<boolean>;
  updateAgenda: (id: string, updates: Partial<Agenda>) => Promise<boolean>;
  markAsShared: (dateKey: string, timestamp: string) => void;
  subscribeRealtime: () => () => void;
};

export const useStore = create<StoreState>((set, get) => ({
  agendas: [],
  sharedDates: {},
  isLoading: true,
  error: null,
  subscriptionActive: false,

  fetchAgendas: async () => {
    set({ isLoading: true, error: null });
    const supabase = createClient();
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        // Fallback to fetch API route if user session check in client client is resolving
        const res = await fetch('/api/agendas');
        if (res.ok) {
          const json = await res.json();
          set({ agendas: json.agendas || [], isLoading: false, error: null });
          return;
        }
        set({ error: "Gagal memverifikasi sesi login Anda.", isLoading: false });
        return;
      }

      // Query centralized Supabase database table 'agendas'
      const { data, error } = await supabase
        .from("agendas")
        .select("*")
        .order("scheduled_at", { ascending: true });

      if (error) {
        console.error("Gagal mengambil data dari Supabase:", error);
        set({ error: error.message, isLoading: false });
      } else {
        set({ agendas: data || [], isLoading: false, error: null });
      }
    } catch (e: any) {
      console.error("Fetch agendas error:", e);
      set({ error: e.message || "Terjadi kesalahan sistem", isLoading: false });
    }
  },

  addAgenda: async (agenda) => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const newAgenda = {
        ...agenda,
        id: crypto.randomUUID(),
        user_id: user?.id,
        is_completed: false,
        status: agenda.status || 'confirmed',
        isShareable: agenda.isShareable !== undefined ? agenda.isShareable : true,
        isOnline: agenda.isOnline || false,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // Optimistic update
      set((state) => ({
        agendas: [...state.agendas, newAgenda as Agenda].sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        ),
      }));

      const res = await fetch('/api/agendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgenda)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menyimpan agenda ke backend.');
      }

      const json = await res.json();
      if (json.agenda) {
        // Sync state with server returned object
        set((state) => ({
          agendas: state.agendas
            .map(a => a.id === newAgenda.id ? json.agenda : a)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        }));
      }

      return true;
    } catch (e: any) {
      console.error("Gagal menambahkan agenda:", e?.message || e);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Tambah Data',
        text: e?.message || e?.details || 'Agenda gagal disimpan ke database. Coba lagi.'
      });
      // Revert fetch
      get().fetchAgendas();
      return false;
    }
  },

  toggleComplete: async (id) => {
    const currentAgenda = get().agendas.find(a => a.id === id);
    if (!currentAgenda) return;

    const newStatus = !currentAgenda.is_completed;
    const updatedAt = new Date().toISOString();

    // Optimistic Update
    set((state) => ({
      agendas: state.agendas.map((a) =>
        a.id === id 
          ? { ...a, is_completed: newStatus, updated_at: updatedAt } 
          : a
      ),
    }));

    try {
      const res = await fetch(`/api/agendas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: newStatus })
      });

      if (!res.ok) {
        throw new Error('Gagal update status di server');
      }
    } catch (error: any) {
      console.error("Gagal update status:", error);
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', text: 'Gagal mengubah status', showConfirmButton: false, timer: 3000 });
      // Revert Optimistic Update
      set((state) => ({
        agendas: state.agendas.map((a) =>
          a.id === id ? { ...a, is_completed: !newStatus } : a
        ),
      }));
    }
  },

  deleteAgenda: async (id) => {
    const previousAgendas = get().agendas;
    
    // Optimistic Delete
    set((state) => ({
      agendas: state.agendas.filter((a) => a.id !== id),
    }));

    try {
      const res = await fetch(`/api/agendas/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Gagal menghapus agenda dari server.');
      }
      return true;
    } catch (error: any) {
      console.error("Gagal menghapus:", error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menghapus',
        text: error.message
      });
      // Revert Optimistic Delete
      set({ agendas: previousAgendas });
      return false;
    }
  },

  updateAgenda: async (id, updates) => {
    const previousAgendas = get().agendas;
    const updatedAt = new Date().toISOString();

    // Optimistic Update
    set((state) => ({
      agendas: state.agendas.map((a) => 
        (a.id === id ? { ...a, ...updates, updated_at: updatedAt } : a)
      ),
    }));

    try {
      const res = await fetch(`/api/agendas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Gagal mengupdate agenda.');
      }
      return true;
    } catch (error: any) {
      console.error("Gagal mengupdate agenda:", error?.message || error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Update',
        text: error?.message || error?.details || 'Gagal update agenda.'
      });
      // Revert Optimistic Update
      set({ agendas: previousAgendas });
      return false;
    }
  },

  markAsShared: (dateKey, timestamp) =>
    set((state) => ({
      sharedDates: {
        ...state.sharedDates,
        [dateKey]: state.sharedDates[dateKey] || timestamp,
      }
    })),

  subscribeRealtime: () => {
    const supabase = createClient();

    const channel = supabase
      .channel('public:agendas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agendas' },
        (payload) => {
          console.log('[STORE] Realtime agenda change detected:', payload);
          get().fetchAgendas();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          set({ subscriptionActive: true });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      set({ subscriptionActive: false });
    };
  }
}));
