"use client";

import { useEffect } from "react";
import { useStore, Agenda } from "@/store/useStore";

export function useAgendas() {
  const agendas = useStore((state) => state.agendas);
  const isLoading = useStore((state) => state.isLoading);
  const error = useStore((state) => state.error);
  const fetchAgendas = useStore((state) => state.fetchAgendas);
  const addAgenda = useStore((state) => state.addAgenda);
  const updateAgenda = useStore((state) => state.updateAgenda);
  const toggleComplete = useStore((state) => state.toggleComplete);
  const deleteAgenda = useStore((state) => state.deleteAgenda);
  const subscribeRealtime = useStore((state) => state.subscribeRealtime);

  useEffect(() => {
    fetchAgendas();
    const unsubscribe = subscribeRealtime();
    return () => {
      unsubscribe();
    };
  }, [fetchAgendas, subscribeRealtime]);

  return {
    agendas,
    isLoading,
    error,
    fetchAgendas,
    addAgenda,
    updateAgenda,
    toggleComplete,
    deleteAgenda,
  };
}
