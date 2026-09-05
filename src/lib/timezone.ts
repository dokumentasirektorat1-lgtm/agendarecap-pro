// Timezone & Date Helper for Agendaku Reminder System

/**
 * Converts a date string (YYYY-MM-DD), time string (HH:mm), and IANA timezone name (e.g. "Asia/Jakarta")
 * into a precise UTC ISO 8601 string (e.g. "2026-09-05T03:30:00.000Z").
 */
export function getUTCISOFromLocal(dateStr: string, timeStr: string, timeZoneName: string = 'Asia/Jakarta'): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);

    // Format target time in desired timezone using Intl
    // Create an un-offset Date object with given YYYY, MM, DD, HH, mm in UTC
    const targetUTCSeconds = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

    // Calculate timezone offset in minutes for the given IANA timezone
    const offsetMinutes = getTimezoneOffsetMinutes(timeZoneName, new Date(targetUTCSeconds));
    
    // Subtract offset to get true UTC timestamp
    const trueUTCTimestamp = targetUTCSeconds - (offsetMinutes * 60 * 1000);
    return new Date(trueUTCTimestamp).toISOString();
  } catch (err) {
    console.error('[REMINDER] Error parsing local time to UTC:', err);
    // Fallback to basic Date parsing
    const now = new Date();
    const [hh, mm] = timeStr.split(':').map(Number);
    const fallbackDate = new Date(dateStr);
    fallbackDate.setHours(hh, mm, 0, 0);
    return fallbackDate.toISOString();
  }
}

/**
 * Returns timezone offset in minutes for a given IANA timezone at a specific date.
 * Positive for East of UTC (e.g. Asia/Jakarta is +420 mins / +7 hours).
 */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / (60 * 1000));
  } catch (e) {
    // Default Asia/Jakarta GMT+7 = +420 mins
    return 420;
  }
}

/**
 * Formats a UTC ISO string into a human-readable local time string in specified timezone.
 */
export function formatLocalFromUTC(utcISOString: string, timeZone: string = 'Asia/Jakarta'): string {
  try {
    const date = new Date(utcISOString);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    return utcISOString;
  }
}
