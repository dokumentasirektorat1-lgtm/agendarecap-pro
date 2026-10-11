/**
 * Delivery Diagnostics Registry
 * Records end-to-end delivery attempt evidence for reminder occurrences.
 * Sanitized to never expose VAPID secrets, FCM server keys, or auth credentials.
 */

export interface DeliveryDiagnosticRecord {
  id: string;
  occurrenceId?: string;
  reminderId?: string;
  targetUserId?: string;
  targetPlatform: string;
  deliveryType: 'WEB_PUSH' | 'FCM' | 'NATIVE_ALARM';
  scheduledAt: string;
  attemptedAt: string;
  result: 'DELIVERED_TO_PROVIDER' | 'NO_DEVICE_SUBSCRIPTION' | 'PROVIDER_ERROR' | 'EXPIRED_SUBSCRIPTION';
  status: 'sent' | 'failed' | 'scheduled' | 'processing';
  message: string;
  subscriberCount: number;
  errorDetail?: string;
}

// In-memory ring buffer of recent delivery diagnostics (persists for the process lifetime)
const recentDiagnostics: DeliveryDiagnosticRecord[] = [];
const MAX_DIAGNOSTICS = 100;

export function recordDeliveryDiagnostic(record: Omit<DeliveryDiagnosticRecord, 'id' | 'attemptedAt'> & { id?: string; attemptedAt?: string }) {
  const fullRecord: DeliveryDiagnosticRecord = {
    id: record.id || `delivery_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    attemptedAt: record.attemptedAt || new Date().toISOString(),
    ...record
  };

  recentDiagnostics.unshift(fullRecord);
  if (recentDiagnostics.length > MAX_DIAGNOSTICS) {
    recentDiagnostics.length = MAX_DIAGNOSTICS;
  }

  return fullRecord;
}

export function getRecentDeliveryDiagnostics(): DeliveryDiagnosticRecord[] {
  return [...recentDiagnostics];
}

export function clearDeliveryDiagnostics() {
  recentDiagnostics.length = 0;
}
