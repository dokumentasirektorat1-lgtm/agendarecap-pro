"use client";

import { useEffect } from "react";
import { useStore, syncWidgetData, registerWidgetSyncGlobal } from "@/store/useStore";
import { Capacitor } from "@capacitor/core";

/**
 * WidgetSyncBridge
 *
 * A lightweight client component that:
 * 1. Registers window.__agendaSyncWidgets so the Android layer (MainActivity)
 *    can trigger a re-push of widget data when the user taps "↻" on a widget.
 * 2. Re-syncs widget data whenever the agendas list changes in the store
 *    (covers cases where data is updated while the app is in the foreground).
 *
 * Renders nothing — purely a side-effect component.
 * Must be rendered inside the Zustand store provider context.
 */
export default function WidgetSyncBridge() {
  const agendas = useStore((state) => state.agendas);

  // Register the global hook for the Android "↻ Refresh" widget button.
  // Uses IIFE pattern so the reference stays stable and always reads the
  // latest store state at call time (not stale closure).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    registerWidgetSyncGlobal(() => useStore.getState().agendas);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync widget data any time the agenda list changes.
  // This handles foreground updates (add/edit/delete/sync from web).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (agendas.length === 0) return; // Don't wipe widget data on first empty render
    syncWidgetData(agendas);
  }, [agendas]);

  return null;
}

