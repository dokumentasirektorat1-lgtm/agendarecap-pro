"use client";

import { useStore, Agenda } from "@/store/useStore";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from "date-fns";
import { id } from "date-fns/locale";
import { useState } from "react";
import Swal from "sweetalert2";
import { cn } from "@/lib/utils";
import { Shield } from "lucide-react";

interface MonthlyCalendarViewProps {
  currentDate: Date;
  onDateClick: (date: Date) => void;
  onEditAgenda: (agenda: Agenda) => void;
}

export function MonthlyCalendarView({ currentDate, onDateClick, onEditAgenda }: MonthlyCalendarViewProps) {
  const { agendas, updateAgenda } = useStore();
  const [draggedAgendaId, setDraggedAgendaId] = useState<string | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "d";
  const rows = [];
  let days = [];
  let day = startDate;
  let formattedDate = "";

  const handleDragStart = (e: React.DragEvent, agendaId: string) => {
    e.dataTransfer.setData("text/plain", agendaId);
    setDraggedAgendaId(agendaId);
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const agendaId = e.dataTransfer.getData("text/plain");
    const agenda = agendas.find(a => a.id === agendaId);
    setDraggedAgendaId(null);
    
    if (!agenda) return;

    // Check if it's the exact same day
    const origDate = new Date(agenda.scheduled_at);
    if (isSameDay(origDate, targetDate)) return;

    // Preserve time
    const newDate = new Date(targetDate);
    newDate.setHours(origDate.getHours(), origDate.getMinutes(), 0, 0);

    // Collision check
    const isConflict = agendas.some(a => 
      a.id !== agenda.id && 
      isSameDay(new Date(a.scheduled_at), targetDate)
    );

    if (isConflict) {
      const confirm = await Swal.fire({
        title: 'Waktu Bentrok',
        text: 'Terdapat agenda lain di tanggal yang sama. Simpan dengan status "Pending Consultation" atau batalkan?',
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Simpan sbg Pending',
        denyButtonText: 'Simpan Normal',
        cancelButtonText: 'Batalkan',
      });

      if (confirm.isConfirmed) {
        await updateAgenda(agenda.id, { scheduled_at: newDate.toISOString(), status: 'pending_consultation' });
        Swal.fire({ icon: 'success', title: 'Berhasil dipindah', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
      } else if (confirm.isDenied) {
        await updateAgenda(agenda.id, { scheduled_at: newDate.toISOString() });
        Swal.fire({ icon: 'success', title: 'Berhasil dipindah', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
      }
    } else {
      await updateAgenda(agenda.id, { scheduled_at: newDate.toISOString() });
      Swal.fire({ icon: 'success', title: 'Berhasil dipindah', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  let rowIndex = 0;
  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, dateFormat);
      const cloneDay = day;
      
      const dayAgendas = agendas.filter(a => isSameDay(new Date(a.scheduled_at), cloneDay))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

      days.push(
        <div
          key={`cell-${rowIndex}-${i}`}
          className={cn(
            "min-h-[120px] p-2 border-r border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors cursor-pointer display flex flex-col",
            !isSameMonth(day, monthStart) && "opacity-40"
          )}
          onClick={() => onDateClick(cloneDay)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, cloneDay)}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={cn(
              "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
              isSameDay(day, new Date()) ? "bg-purple-500 text-white" : "text-zinc-400"
            )}>
              {formattedDate}
            </span>
          </div>
          <div className="flex-1 flex flex-col gap-1 overflow-y-auto hide-scrollbar">
            {dayAgendas.map(agenda => (
              <div
                key={agenda.id}
                draggable
                onDragStart={(e) => handleDragStart(e, agenda.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditAgenda(agenda);
                }}
                className={cn(
                  "px-2 py-1.5 rounded-md text-xs truncate transition-all cursor-grab active:cursor-grabbing border",
                  draggedAgendaId === agenda.id ? "opacity-50" : "opacity-100",
                  agenda.is_completed ? "bg-white/5 border-white/10 text-zinc-500 line-through" 
                  : agenda.status === 'pending_consultation' ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                  : agenda.status === 'rescheduled' ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : agenda.status === 'cancelled' ? "bg-red-500/10 border-red-500/20 text-red-500"
                  : "bg-purple-500/20 border-purple-500/30 text-purple-300"
                )}
              >
                <div className="font-semibold flex items-center gap-1">
                  {format(new Date(agenda.scheduled_at), 'HH:mm')}
                  {!agenda.isShareable && <Shield className="w-2.5 h-2.5 text-red-400" />}
                </div>
                <div className="truncate">{agenda.title}</div>
              </div>
            ))}
          </div>
        </div>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7" key={`row-${rowIndex}`}>
        {days}
      </div>
    );
    days = [];
    rowIndex++;
  }

  const weekDays = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  return (
    <div className="glass rounded-[2rem] border border-white/5 shadow-xl overflow-hidden flex flex-col">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/5 shrink-0">
        {weekDays.map((wd) => (
          <div key={wd} className="px-2 py-3 text-center text-xs font-semibold text-zinc-400">
            {wd}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {rows}
      </div>
    </div>
  );
}
