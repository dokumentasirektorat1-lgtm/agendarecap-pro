import { 
  getOfflineQueue, 
  removeFromOfflineQueue, 
  updateQueueItemInIDB,
  getAgendasFromIDB, 
  saveAgendasToIDB, 
  getRemindersFromIDB, 
  saveRemindersToIDB, 
  getOccurrencesFromIDB, 
  saveOccurrencesToIDB,
  repairOrphanDataAndQueueInIDB,
  IDBOfflineQueueItem,
  IDBAgenda,
  IDBReminder,
  IDBOccurrence
} from "@/lib/idb";
import { createClient } from "@/lib/supabase/client";
import { isNativePlatform, getScheduledNativeAlarms, scheduleNativeLocalAlarm, cancelNativeLocalAlarm } from "@/lib/native-alarm";
import { 
  sanitizeAgendaForSupabase, 
  sanitizeReminderForSupabase, 
  sanitizeOccurrenceForSupabase 
} from "@/lib/repositories/sanitizer";

export function serializeSupabaseError(error: unknown) {
  if (!error) return null;
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return {
      message: e.message || String(error),
      code: e.code || 'UNKNOWN',
      details: e.details || null,
      hint: e.hint || null,
      name: e.name || 'SupabaseError',
      stringified: JSON.stringify(error),
    };
  }
  return { message: String(error) };
}

let activeSyncPromise: Promise<{ success: boolean; syncedCount: number; errors: string[] }> | null = null;

/**
 * Migration helper to convert legacy offline queue items (v1/v2) into standardized v3 queue items.
 */
function migrateLegacyQueueItem(item: any): IDBOfflineQueueItem {
  if (item.entity_type && item.operation) {
    return item as IDBOfflineQueueItem;
  }

  const type: string = item.type || '';
  const now = Date.now();

  if (type === 'CREATE_REMINDER') {
    return {
      id: item.id || `q_${now}`,
      entity_type: 'reminder',
      entity_id: item.payload?.id || 'unknown',
      operation: 'CREATE',
      payload: {
        reminder: sanitizeReminderForSupabase(item.payload),
        occurrence: item.payload?.occurrenceId ? sanitizeOccurrenceForSupabase({
          id: item.payload.occurrenceId,
          reminder_id: item.payload.id,
          scheduled_at: item.payload.scheduledAt
        }) : undefined
      },
      created_at: item.createdAt || now,
      retry_count: 0,
      status: 'PENDING'
    };
  } else if (type === 'UPDATE_REMINDER') {
    return {
      id: item.id || `q_${now}`,
      entity_type: 'reminder',
      entity_id: item.payload?.id || 'unknown',
      operation: 'UPDATE',
      payload: sanitizeReminderForSupabase(item.payload),
      created_at: item.createdAt || now,
      retry_count: 0,
      status: 'PENDING'
    };
  } else if (type === 'DELETE_REMINDER') {
    return {
      id: item.id || `q_${now}`,
      entity_type: 'reminder',
      entity_id: item.payload?.id || 'unknown',
      operation: 'DELETE',
      payload: { id: item.payload?.id },
      created_at: item.createdAt || now,
      retry_count: 0,
      status: 'PENDING'
    };
  } else if (type === 'SNOOZE_OCCURRENCE') {
    return {
      id: item.id || `q_${now}`,
      entity_type: 'occurrence',
      entity_id: item.payload?.occurrenceId || item.payload?.reminderId || 'unknown',
      operation: 'SNOOZE',
      payload: sanitizeOccurrenceForSupabase({
        id: item.payload?.occurrenceId,
        reminder_id: item.payload?.reminderId,
        status: 'snoozed',
        snoozed_until: item.payload?.snoozedUntil
      }),
      created_at: item.createdAt || now,
      retry_count: 0,
      status: 'PENDING'
    };
  } else if (type === 'COMPLETE_OCCURRENCE') {
    return {
      id: item.id || `q_${now}`,
      entity_type: 'occurrence',
      entity_id: item.payload?.occurrenceId || item.payload?.reminderId || 'unknown',
      operation: 'COMPLETE',
      payload: sanitizeOccurrenceForSupabase({
        id: item.payload?.occurrenceId,
        reminder_id: item.payload?.reminderId,
        status: 'completed',
        completed_at: new Date().toISOString()
      }),
      created_at: item.createdAt || now,
      retry_count: 0,
      status: 'PENDING'
    };
  }

  return {
    id: item.id || `q_${now}`,
    entity_type: 'agenda',
    entity_id: item.entity_id || 'unknown',
    operation: item.operation || 'UPDATE',
    payload: item.payload,
    created_at: item.createdAt || now,
    retry_count: 0,
    status: 'PENDING'
  };
}

export class SyncRepository {
  async isOnline(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return navigator.onLine;
  }

  async runSync(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    const online = await this.isOnline();
    if (!online) {
      return { success: false, syncedCount: 0, errors: ['Device is offline'] };
    }

    if (activeSyncPromise) {
      console.log('[SYNC ENGINE] Synchronization already in progress, attaching to active promise.');
      return activeSyncPromise;
    }

    activeSyncPromise = this.performSync();
    try {
      return await activeSyncPromise;
    } finally {
      activeSyncPromise = null;
    }
  }

  private async performSync(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    console.log('[SYNC ENGINE] Starting synchronization...');

    const errors: string[] = [];
    let syncedCount = 0;
    const supabase = createClient();

    try {
      // 0. Check Auth & Repair Orphan Local Data / Queue
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        console.log(`[SYNC ENGINE] Authenticated user active: ${user.id}`);
        await repairOrphanDataAndQueueInIDB(user.id);
      } else {
        console.warn('[SYNC ENGINE] No active authenticated user session. Mutations will remain local-first.');
      }

      // 1. Process Offline Queue Mutations via Direct Supabase SDK
      const rawQueue = await getOfflineQueue();
      console.log(`[SYNC ENGINE] Processing ${rawQueue.length} pending mutations...`);

      for (const rawItem of rawQueue) {
        const item = migrateLegacyQueueItem(rawItem);
        if (item.status === 'FAILED_FATAL') continue;

        try {
          let success = false;
          let queryError: any = null;

          if (item.entity_type === 'agenda') {
            if (item.operation === 'CREATE' || item.operation === 'UPDATE') {
              const sanitizedPayload = sanitizeAgendaForSupabase(item.payload);
              if (user && (!sanitizedPayload.user_id || sanitizedPayload.user_id === 'undefined')) {
                sanitizedPayload.user_id = user.id;
              }

              const { error } = await supabase
                .from('agendas')
                .upsert(sanitizedPayload);
              queryError = error;
              success = !error;
            } else if (item.operation === 'DELETE') {
              const { error } = await supabase
                .from('agendas')
                .delete()
                .eq('id', item.entity_id);
              queryError = error;
              success = !error;
            }
          } else if (item.entity_type === 'reminder') {
            if (item.operation === 'CREATE') {
              const reminderPayload = sanitizeReminderForSupabase(item.payload.reminder || item.payload);
              const occurrencePayload = item.payload.occurrence ? sanitizeOccurrenceForSupabase(item.payload.occurrence) : null;

              if (user) {
                if (!reminderPayload.user_id || reminderPayload.user_id === 'undefined') reminderPayload.user_id = user.id;
                if (occurrencePayload && (!occurrencePayload.user_id || occurrencePayload.user_id === 'undefined')) occurrencePayload.user_id = user.id;
              }

              const { error: rErr } = await supabase.from('reminders').upsert(reminderPayload);

              if (occurrencePayload && occurrencePayload.id) {
                await supabase.from('reminder_occurrences').upsert(occurrencePayload);
              }

              queryError = rErr;
              success = !rErr;
            } else if (item.operation === 'UPDATE') {
              const sanitizedPayload = sanitizeReminderForSupabase(item.payload);
              delete sanitizedPayload.id;

              const { error } = await supabase
                .from('reminders')
                .update(sanitizedPayload)
                .eq('id', item.entity_id);
              queryError = error;
              success = !error;
            } else if (item.operation === 'DELETE') {
              const { error } = await supabase
                .from('reminders')
                .delete()
                .eq('id', item.entity_id);
              queryError = error;
              success = !error;
            }
          } else if (item.entity_type === 'occurrence') {
            if (item.operation === 'SNOOZE') {
              const sanitizedPayload = sanitizeOccurrenceForSupabase(item.payload);
              const { error } = await supabase
                .from('reminder_occurrences')
                .update({
                  status: 'snoozed',
                  snoozed_until: sanitizedPayload.snoozed_until || item.payload.snoozedUntil,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.entity_id);
              queryError = error;
              success = !error;
            } else if (item.operation === 'COMPLETE' || item.operation === 'DISMISS') {
              const statusVal = item.operation === 'COMPLETE' ? 'completed' : 'dismissed';
              const { error } = await supabase
                .from('reminder_occurrences')
                .update({
                  status: statusVal,
                  completed_at: item.operation === 'COMPLETE' ? new Date().toISOString() : null,
                  dismissed_at: item.operation === 'DISMISS' ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.entity_id);
              queryError = error;
              success = !error;
            }
          }

          if (success) {
            await removeFromOfflineQueue(rawItem.id);
            syncedCount++;
            console.log(`[SYNC ENGINE] Queue item ${rawItem.id} synced successfully.`);
          } else {
            if (queryError) {
              console.error('[SYNC ENGINE] Supabase query rejection:', {
                code: queryError.code,
                message: queryError.message,
                details: queryError.details,
                hint: queryError.hint
              });
            }

            const nextRetry = (item.retry_count || 0) + 1;
            const isFatal = nextRetry > 10;
            await updateQueueItemInIDB({
              ...item,
              id: rawItem.id,
              retry_count: nextRetry,
              status: isFatal ? 'FAILED_FATAL' : 'FAILED_RETRYABLE',
              error_message: queryError ? `${queryError.code}: ${queryError.message}` : 'Sync rejected'
            });
            console.warn(`[SYNC ENGINE] Queue item ${rawItem.id} sync failed (Attempt ${nextRetry}).`);
          }
        } catch (err: any) {
          console.error(`[SYNC ENGINE] Error processing item ${rawItem.id}:`, err);
          errors.push(err.message);
          const nextRetry = (item.retry_count || 0) + 1;
          await updateQueueItemInIDB({
            ...item,
            id: rawItem.id,
            retry_count: nextRetry,
            status: nextRetry > 10 ? 'FAILED_FATAL' : 'FAILED_RETRYABLE',
            error_message: err.message
          });
        }
      }

      // 2. Fetch Remote Data from Supabase & Execute Clock-Skew Protected LWW Merge
      if (user) {
        const nowMs = Date.now();

        // A. Agendas Reconciliation
        const { data: remoteAgendas, error: agendaFetchError } = await supabase
          .from('agendas')
          .select('*')
          .eq('user_id', user.id)
          .order('scheduled_at', { ascending: true });

        if (agendaFetchError) {
          console.error('[SYNC ENGINE] Fetch remote agendas error:', agendaFetchError);
        } else if (remoteAgendas && Array.isArray(remoteAgendas)) {
          const localAgendas = await getAgendasFromIDB();
          const agendaMap = new Map<string, IDBAgenda>();
          localAgendas.forEach(a => agendaMap.set(a.id, a));

          remoteAgendas.forEach((r: any) => {
            const local = agendaMap.get(r.id);
            const remoteTime = new Date(r.updated_at).getTime();
            const localTime = local?.updated_at ? new Date(local.updated_at).getTime() : 0;
            const isLocalFutureSkewed = localTime > nowMs + 60000;

            if (!local || isLocalFutureSkewed || remoteTime >= localTime) {
              agendaMap.set(r.id, {
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                location: r.location || '',
                notes: r.notes || '',
                scheduled_at: r.scheduled_at,
                privateNotes: r.privateNotes || '',
                is_completed: r.is_completed || false,
                include_notes_in_share: r.include_notes_in_share || false,
                status: r.status || 'confirmed',
                isShareable: r.isShareable !== undefined ? r.isShareable : true,
                groupId: r.groupId || undefined,
                isOnline: r.isOnline || false,
                onlineLink: r.onlineLink || '',
                meetingId: r.meetingId || '',
                meetingPasscode: r.meetingPasscode || '',
                isUrgent: r.isUrgent || false,
                created_at: r.created_at,
                updated_at: r.updated_at
              });
            }
          });

          await saveAgendasToIDB(Array.from(agendaMap.values()));
        }

        // B. Reminders & Occurrences Reconciliation
        const { data: remoteReminders, error: reminderFetchError } = await supabase
          .from('reminders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (reminderFetchError) {
          const sErr = serializeSupabaseError(reminderFetchError);
          console.error('[SYNC REMINDERS ERROR]', sErr);
        }

        console.log('[SYNC OCCURRENCES AUTH]', {
          hasUser: !!user,
          userId: user?.id,
        });

        let remoteOccurrences: any[] = [];
        let occFetchError: any = null;

        if (remoteReminders && Array.isArray(remoteReminders) && remoteReminders.length > 0) {
          const reminderIds = remoteReminders.map((r: any) => r.id);
          const res = await supabase
            .from('reminder_occurrences')
            .select('*')
            .in('reminder_id', reminderIds)
            .order('scheduled_at', { ascending: true });

          remoteOccurrences = res.data || [];
          occFetchError = res.error;
        }

        if (occFetchError) {
          const sErr = serializeSupabaseError(occFetchError);
          console.error('[SYNC OCCURRENCES ERROR]', {
            message: occFetchError?.message,
            code: occFetchError?.code,
            details: occFetchError?.details,
            hint: occFetchError?.hint,
            raw: String(occFetchError),
            json: JSON.stringify(sErr),
          });
        }

        if (remoteReminders && Array.isArray(remoteReminders)) {
          const localReminders = await getRemindersFromIDB();
          const reminderMap = new Map<string, IDBReminder>();
          localReminders.forEach(r => reminderMap.set(r.id, r));

          remoteReminders.forEach((r: any) => {
            const local = reminderMap.get(r.id);
            const remoteTime = new Date(r.updated_at).getTime();
            const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
            const isLocalFutureSkewed = localTime > nowMs + 60000;

            if (!local || isLocalFutureSkewed || remoteTime >= localTime) {
              reminderMap.set(r.id, {
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                body: r.body,
                time: r.time || '08:00',
                timezone: r.timezone || 'Asia/Jakarta',
                frequency: r.frequency || 'once',
                daysOfWeek: r.days_of_week,
                sound: r.sound || 'default',
                isActive: r.is_active !== undefined ? r.is_active : true,
                deliveryMode: r.delivery_mode || 'hybrid',
                createdAt: r.created_at,
                updatedAt: r.updated_at
              });
            }
          });

          await saveRemindersToIDB(Array.from(reminderMap.values()));
        }

        if (remoteOccurrences && Array.isArray(remoteOccurrences)) {
          const localOccurrences = await getOccurrencesFromIDB();
          const occurrenceMap = new Map<string, IDBOccurrence>();
          localOccurrences.forEach(o => occurrenceMap.set(o.id, o));

          remoteOccurrences.forEach((o: any) => {
            const local = occurrenceMap.get(o.id);
            const remoteTime = new Date(o.updated_at).getTime();
            const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
            const isLocalFutureSkewed = localTime > nowMs + 60000;

            if (!local || isLocalFutureSkewed || remoteTime >= localTime) {
              occurrenceMap.set(o.id, {
                id: o.id,
                reminderId: o.reminder_id,
                user_id: o.user_id,
                scheduledAt: o.scheduled_at,
                status: o.status,
                snoozedUntil: o.snoozed_until,
                sentAt: o.sent_at,
                completedAt: o.completed_at,
                dismissedAt: o.dismissed_at,
                notificationTag: o.notification_tag || `reminder-${o.reminder_id}-occurrence-${o.id}`,
                createdAt: o.created_at,
                updatedAt: o.updated_at
              });
            }
          });

          await saveOccurrencesToIDB(Array.from(occurrenceMap.values()));
        }
      }

      // 3. Reconcile Android Native Alarms
      if (isNativePlatform()) {
        await this.reconcileNativeAlarms();
      }

    } catch (err: any) {
      console.error('[SYNC ENGINE] Global sync error:', err);
      errors.push(err.message);
    }

    return {
      success: errors.length === 0,
      syncedCount,
      errors
    };
  }

  private async reconcileNativeAlarms(): Promise<void> {
    try {
      const localOccurrences = await getOccurrencesFromIDB();
      const localReminders = await getRemindersFromIDB();
      const scheduledNativeAlarms = await getScheduledNativeAlarms();

      const nativeAlarmMap = new Map<string, any>();
      scheduledNativeAlarms.forEach((item: any) => {
        if (item && item.occurrenceId) {
          nativeAlarmMap.set(item.occurrenceId, item);
        }
      });

      for (const occ of localOccurrences) {
        const targetTimeStr = occ.snoozedUntil || occ.scheduledAt;
        const targetTimeMs = new Date(targetTimeStr).getTime();
        const nowMs = Date.now();

        if ((occ.status === 'scheduled' || occ.status === 'snoozed') && targetTimeMs > nowMs) {
          const nativeItem = nativeAlarmMap.get(occ.id);
          const parentReminder = localReminders.find(r => r.id === occ.reminderId);

          if (!nativeItem || !nativeItem.scheduledAtMs || Math.abs(nativeItem.scheduledAtMs - targetTimeMs) > 2000) {
            await scheduleNativeLocalAlarm({
              reminderId: occ.reminderId,
              occurrenceId: occ.id,
              title: parentReminder?.title || 'Pengingat AgendaRecap',
              body: parentReminder?.body || '',
              sound: parentReminder?.sound || 'default',
              scheduledAt: targetTimeStr
            });
          }
        } else {
          if (nativeAlarmMap.has(occ.id)) {
            await cancelNativeLocalAlarm(occ.id);
          }
        }
      }
    } catch (err) {
      console.warn('[SYNC ENGINE] Native alarm reconciliation notice:', err);
    }
  }
}

export const syncRepository = new SyncRepository();
