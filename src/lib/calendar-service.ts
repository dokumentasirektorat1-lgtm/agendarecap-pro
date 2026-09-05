// Calendar Integration Service
// Exports iCalendar (.ics) and direct Google Calendar Links for Reminder Events

export interface CalendarEventInput {
  title: string;
  body?: string;
  scheduledAt: string; // ISO string
  durationMinutes?: number;
}

export function generateGoogleCalendarUrl(event: CalendarEventInput): string {
  const startDate = new Date(event.scheduledAt);
  const endDate = new Date(startDate.getTime() + (event.durationMinutes || 30) * 60 * 1000);

  const formatCalDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const startStr = formatCalDate(startDate);
  const endStr = formatCalDate(endDate);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.body || '',
    dates: `${startStr}/${endStr}`
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICSFile(event: CalendarEventInput): void {
  const startDate = new Date(event.scheduledAt);
  const endDate = new Date(startDate.getTime() + (event.durationMinutes || 30) * 60 * 1000);

  const formatCalDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AgendaRecap Pro//Reminder Engine//ID',
    'BEGIN:VEVENT',
    `UID:agenda-${Date.now()}@agendarecap.com`,
    `DTSTAMP:${formatCalDate(new Date())}`,
    `DTSTART:${formatCalDate(startDate)}`,
    `DTEND:${formatCalDate(endDate)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.body || '').replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${event.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
