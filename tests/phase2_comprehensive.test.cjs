const test = require('node:test');
const assert = require('node:assert/strict');
const { format, parseISO, isSameDay, addDays } = require('date-fns');

// ========================================================================
// 1. DEDUPLICATION & CANONICAL AGENDA UUID (GOLDEN FIXTURE: 1 OKTOBER 2026)
// ========================================================================

function deduplicateAgendas(agendas) {
  const map = new Map();
  for (const a of agendas) {
    if (!a?.id) continue;
    const existing = map.get(a.id);
    if (!existing || (a.updated_at && a.updated_at > (existing.updated_at || ''))) {
      map.set(a.id, a);
    }
  }
  return Array.from(map.values());
}

test('1. Golden Fixture: 1 Oktober 2026 deduplication & canonical IDs', () => {
  const agenda1 = {
    id: 'uuid-mou-bali-001',
    title: 'MoU Bali',
    scheduled_at: '2026-10-01T09:00:00.000Z',
    status: 'confirmed',
    time_mode: 'exact',
    updated_at: '2026-10-01T08:00:00.000Z'
  };

  const agenda2 = {
    id: 'uuid-orientasi-ppg-002',
    title: 'Orientasi PPG',
    scheduled_at: '2026-10-01T13:30:00.000Z',
    status: 'confirmed',
    time_mode: 'exact',
    updated_at: '2026-10-01T08:00:00.000Z'
  };

  // Initial state: exactly 2 unique agendas
  let storeAgendas = deduplicateAgendas([agenda1, agenda2]);
  assert.equal(storeAgendas.length, 2);

  // Edit MoU Bali 10 times with newer updated_at timestamps
  let currentMou = agenda1;
  for (let i = 1; i <= 10; i++) {
    currentMou = {
      ...currentMou,
      title: `MoU Bali (Rev ${i})`,
      location: `Ruang Rapat ${i}`,
      updated_at: `2026-10-01T08:${String(i).padStart(2, '0')}:00.000Z`
    };
    storeAgendas.push(currentMou);
  }

  // Deduplication must maintain exactly 2 items, with latest version of MoU Bali
  storeAgendas = deduplicateAgendas(storeAgendas);
  assert.equal(storeAgendas.length, 2);
  const mouInStore = storeAgendas.find(a => a.id === 'uuid-mou-bali-001');
  assert.equal(mouInStore.title, 'MoU Bali (Rev 10)');
  assert.equal(mouInStore.location, 'Ruang Rapat 10');

  // Deleting one agenda
  storeAgendas = storeAgendas.filter(a => a.id !== 'uuid-mou-bali-001');
  storeAgendas = deduplicateAgendas(storeAgendas);
  assert.equal(storeAgendas.length, 1);
  assert.equal(storeAgendas[0].id, 'uuid-orientasi-ppg-002');
});

// ========================================================================
// 2. CALENDAR DENSITY SPECIFICATION & VERIFICATION
// ========================================================================

function computeAgendaDensity(agendas) {
  function getAgendaTimeMode(a) {
    if (a.status === 'unscheduled') return 'unscheduled';
    if (a.time_mode && ['exact', 'flex', 'all_day', 'unscheduled'].includes(a.time_mode.toLowerCase())) {
      return a.time_mode.toLowerCase();
    }
    if (!a.scheduled_at) return 'unscheduled';
    return 'exact';
  }

  const uniqueAgendas = Array.from(new Map(agendas.map(a => [a.id, a])).values());

  const agendaDensityByDate = uniqueAgendas
    .filter(a => getAgendaTimeMode(a) !== 'unscheduled' && a.scheduled_at && a.status !== 'cancelled')
    .reduce((acc, a) => {
      const key = format(new Date(a.scheduled_at), 'yyyy-MM-dd');
      if (!acc[key]) {
        acc[key] = { count: 0, hasAllDay: false };
      }
      acc[key].count += 1;
      if (getAgendaTimeMode(a) === 'all_day') {
        acc[key].hasAllDay = true;
      }
      return acc;
    }, {});

  const dates1 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && info.count === 1)
    .map(([d]) => d);

  const dates2 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && (info.count === 2 || info.count === 3))
    .map(([d]) => d);

  const dates4 = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => !info.hasAllDay && info.count === 4)
    .map(([d]) => d);

  const datesFull = Object.entries(agendaDensityByDate)
    .filter(([_, info]) => info.hasAllDay || info.count >= 5)
    .map(([d]) => d);

  return { agendaDensityByDate, dates1, dates2, dates4, datesFull };
}

test('2. Calendar Density: Thresholds, Unscheduled exclusion, and Golden Fixture', () => {
  const dateKey = '2026-10-01';

  // Test 1: 1 agenda -> dates1 (ringan)
  const single = [{ id: '1', scheduled_at: `${dateKey}T09:00:00.000Z`, status: 'confirmed', time_mode: 'exact' }];
  let res = computeAgendaDensity(single);
  assert.ok(res.dates1.includes(dateKey));

  // Test 2: Golden fixture 2 agendas -> dates2 (sedang)
  const twoAgendas = [
    { id: '1', scheduled_at: `${dateKey}T09:00:00.000Z`, status: 'confirmed', time_mode: 'exact' },
    { id: '2', scheduled_at: `${dateKey}T13:00:00.000Z`, status: 'confirmed', time_mode: 'exact' }
  ];
  res = computeAgendaDensity(twoAgendas);
  assert.equal(res.agendaDensityByDate[dateKey].count, 2);
  assert.ok(res.dates2.includes(dateKey));

  // Test 3: Edit each 10 times in input list (simulating unmerged state) -> count remains exactly 2
  const editedList = [];
  for (let i = 0; i < 10; i++) {
    editedList.push({ id: '1', scheduled_at: `${dateKey}T09:00:00.000Z`, status: 'confirmed', time_mode: 'exact' });
    editedList.push({ id: '2', scheduled_at: `${dateKey}T13:00:00.000Z`, status: 'confirmed', time_mode: 'exact' });
  }
  res = computeAgendaDensity(editedList);
  assert.equal(res.agendaDensityByDate[dateKey].count, 2);
  assert.ok(res.dates2.includes(dateKey));

  // Test 4: 4 agendas -> dates4 (tinggi)
  const fourAgendas = [
    { id: '1', scheduled_at: `${dateKey}T08:00:00.000Z`, status: 'confirmed', time_mode: 'exact' },
    { id: '2', scheduled_at: `${dateKey}T10:00:00.000Z`, status: 'confirmed', time_mode: 'exact' },
    { id: '3', scheduled_at: `${dateKey}T13:00:00.000Z`, status: 'confirmed', time_mode: 'exact' },
    { id: '4', scheduled_at: `${dateKey}T15:00:00.000Z`, status: 'confirmed', time_mode: 'exact' }
  ];
  res = computeAgendaDensity(fourAgendas);
  assert.equal(res.agendaDensityByDate[dateKey].count, 4);
  assert.ok(res.dates4.includes(dateKey));

  // Test 5: 5 agendas -> datesFull (penuh)
  const fiveAgendas = [
    ...fourAgendas,
    { id: '5', scheduled_at: `${dateKey}T16:00:00.000Z`, status: 'confirmed', time_mode: 'exact' }
  ];
  res = computeAgendaDensity(fiveAgendas);
  assert.equal(res.agendaDensityByDate[dateKey].count, 5);
  assert.ok(res.datesFull.includes(dateKey));

  // Test 6: At least one ALL_DAY with only 1 agenda -> datesFull (penuh)
  const allDayAgenda = [
    { id: '10', scheduled_at: `${dateKey}T00:00:00.000Z`, status: 'confirmed', time_mode: 'all_day' }
  ];
  res = computeAgendaDensity(allDayAgenda);
  assert.equal(res.agendaDensityByDate[dateKey].hasAllDay, true);
  assert.ok(res.datesFull.includes(dateKey));

  // Test 7: Unscheduled and cancelled agendas must NEVER contribute to density
  const mixed = [
    { id: '1', scheduled_at: `${dateKey}T09:00:00.000Z`, status: 'confirmed', time_mode: 'exact' },
    { id: 'u1', scheduled_at: null, status: 'unscheduled', time_mode: 'unscheduled' },
    { id: 'u2', scheduled_at: `${dateKey}T10:00:00.000Z`, status: 'unscheduled', time_mode: 'unscheduled' },
    { id: 'c1', scheduled_at: `${dateKey}T11:00:00.000Z`, status: 'cancelled', time_mode: 'exact' }
  ];
  res = computeAgendaDensity(mixed);
  assert.equal(res.agendaDensityByDate[dateKey].count, 1);
  assert.ok(res.dates1.includes(dateKey));
});

// ========================================================================
// 3. NATIVE WIDGET PAYLOAD SERIALIZATION & GROUPING
// ========================================================================

function formatConsultationWidgetItems(agendas) {
  const consultationMap = new Map();
  for (const a of agendas) {
    if ((a.status === 'pending_consultation' || a.status === 'rescheduled' || a.status === 'unscheduled') && !a.is_completed) {
      const groupKey = a.groupId || a.id;
      const existing = consultationMap.get(groupKey);
      if (!existing) {
        consultationMap.set(groupKey, {
          title: a.title,
          count: 1,
          notes: a.privateNotes || a.notes || ''
        });
      } else {
        existing.count += 1;
      }
    }
  }

  return Array.from(consultationMap.values())
    .slice(0, 10)
    .map(g => ({
      title: g.count > 1 ? `${g.title} (${g.count} Sesi)` : g.title,
      notes: g.notes,
      count: g.count
    }));
}

function formatAgenda7DaysWidgetItems(agendas, baseDate = new Date()) {
  const startOfToday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime();
  const endOf7Days = startOfToday + 8 * 24 * 60 * 60 * 1000;

  return agendas
    .filter(a => {
      if (a.status === 'cancelled') return false;
      if (a.status === 'unscheduled' || a.time_mode === 'unscheduled') return false;
      if (!a.scheduled_at) return false;
      const t = new Date(a.scheduled_at).getTime();
      return t >= startOfToday && t <= endOf7Days;
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .map(a => {
      const mode = a.time_mode || 'exact';
      let timeStr = 'Fleksibel';
      if (mode === 'all_day') timeStr = 'Seharian';
      else if (mode === 'exact' && a.scheduled_at) {
        timeStr = format(new Date(a.scheduled_at), 'HH:mm');
      }
      return {
        title: a.title,
        time: timeStr,
        date: format(new Date(a.scheduled_at), 'yyyy-MM-dd')
      };
    });
}

test('3. Native Widget Payload: Consultation grouping & 7-Days offset range', () => {
  // Test consultation grouping
  const rawAgendas = [
    { id: 'c1', groupId: 'group-rektor-01', title: 'Konsultasi Disertasi', status: 'pending_consultation', is_completed: false },
    { id: 'c2', groupId: 'group-rektor-01', title: 'Konsultasi Disertasi', status: 'pending_consultation', is_completed: false },
    { id: 'c3', groupId: 'group-rektor-01', title: 'Konsultasi Disertasi', status: 'pending_consultation', is_completed: false },
    { id: 'c4', id: 'solo-01', title: 'Konsultasi Anggaran', status: 'rescheduled', is_completed: false },
    { id: 'c5', id: 'done-01', title: 'Konsultasi Selesai', status: 'pending_consultation', is_completed: true } // completed
  ];

  const widgetItems = formatConsultationWidgetItems(rawAgendas);
  assert.equal(widgetItems.length, 2);
  const grouped = widgetItems.find(w => w.title.includes('Disertasi'));
  assert.equal(grouped.title, 'Konsultasi Disertasi (3 Sesi)');
  assert.equal(grouped.count, 3);
  const solo = widgetItems.find(w => w.title.includes('Anggaran'));
  assert.equal(solo.title, 'Konsultasi Anggaran');
  assert.equal(solo.count, 1);

  // Test 7 Days widget offset range
  const base = new Date('2026-10-01T08:00:00.000Z');
  const weekAgendas = [
    { id: 'w1', title: 'Agenda Hari 1', scheduled_at: '2026-10-01T09:00:00', status: 'confirmed', time_mode: 'exact' },
    { id: 'w2', title: 'Agenda Hari 3', scheduled_at: '2026-10-03T10:00:00', status: 'confirmed', time_mode: 'all_day' },
    { id: 'w3', title: 'Agenda Hari 6', scheduled_at: '2026-10-06T14:00:00', status: 'confirmed', time_mode: 'flex' },
    { id: 'w4', title: 'Agenda Hari 10 (Lewat)', scheduled_at: '2026-10-11T14:00:00', status: 'confirmed', time_mode: 'exact' },
    { id: 'w5', title: 'Agenda Unscheduled', scheduled_at: null, status: 'unscheduled', time_mode: 'unscheduled' }
  ];

  const formattedWeek = formatAgenda7DaysWidgetItems(weekAgendas, base);
  assert.equal(formattedWeek.length, 3);
  assert.equal(formattedWeek[0].time, '09:00');
  assert.equal(formattedWeek[1].time, 'Seharian');
  assert.equal(formattedWeek[2].time, 'Fleksibel');

  // Verify date offset clamping (0 to 6)
  function clampOffset(val) {
    return Math.max(0, Math.min(6, val));
  }
  assert.equal(clampOffset(-1), 0);
  assert.equal(clampOffset(0), 0);
  assert.equal(clampOffset(5), 5);
  assert.equal(clampOffset(6), 6);
  assert.equal(clampOffset(7), 6);
  assert.equal(clampOffset(100), 6);
});

// ========================================================================
// 4. NATIVE SOUND & CHANNEL MAPPING (AlarmReceiver.java parity)
// ========================================================================

function getSoundChannelInfo(soundOption) {
  let cleanKey = 'default';
  let hasSound = true;

  if (soundOption && soundOption.trim()) {
    const lower = soundOption.toLowerCase().trim();
    if (lower === 'off' || lower === 'silent' || lower === 'none') {
      cleanKey = 'silent';
      hasSound = false;
    } else if (lower.startsWith('content://') || lower.startsWith('file://')) {
      cleanKey = 'custom_uri';
    } else if (lower.startsWith('data:')) {
      cleanKey = 'custom_base64';
    } else if (lower === 'chime' || lower === 'notification') {
      cleanKey = 'chime';
    } else if (lower === 'ringtone') {
      cleanKey = 'ringtone';
    } else if (lower === 'digital' || lower === 'urgent') {
      cleanKey = lower;
    }
  }

  const channelId = `agendarecap_reminder_channel_${cleanKey}`;
  const channelName = `AgendaRecap Reminder (${cleanKey})`;
  return { channelId, channelName, hasSound, cleanKey };
}

test('4. Native Alarm Sound & Notification Channel ID Mapping', () => {
  // Silent/Off
  const silent = getSoundChannelInfo('off');
  assert.equal(silent.cleanKey, 'silent');
  assert.equal(silent.hasSound, false);
  assert.equal(silent.channelId, 'agendarecap_reminder_channel_silent');

  // Built-in sounds
  const chime = getSoundChannelInfo('chime');
  assert.equal(chime.channelId, 'agendarecap_reminder_channel_chime');
  assert.equal(chime.hasSound, true);

  const ringtone = getSoundChannelInfo('ringtone');
  assert.equal(ringtone.channelId, 'agendarecap_reminder_channel_ringtone');

  const urgent = getSoundChannelInfo('urgent');
  assert.equal(urgent.channelId, 'agendarecap_reminder_channel_urgent');

  // Custom base64 & file URI
  const customData = getSoundChannelInfo('data:audio/mp3;base64,SUQzBAAAAAAA...');
  assert.equal(customData.cleanKey, 'custom_base64');
  assert.equal(customData.channelId, 'agendarecap_reminder_channel_custom_base64');

  const customUri = getSoundChannelInfo('content://media/external/audio/media/123');
  assert.equal(customUri.cleanKey, 'custom_uri');
  assert.equal(customUri.channelId, 'agendarecap_reminder_channel_custom_uri');

  // Default fallback
  const def = getSoundChannelInfo(null);
  assert.equal(def.channelId, 'agendarecap_reminder_channel_default');
});

// ========================================================================
// 5. DIAGNOSTICS LIFECYCLE & RESOLUTION PERSISTENCE
// ========================================================================

test('5. Diagnostics: Active/Resolved pools & status lifecycle', () => {
  const allItems = [
    { id: 'q1', status: 'PENDING', message: 'Waiting sync' },
    { id: 'q2', status: 'PROCESSING', message: 'Syncing...' },
    { id: 'q3', status: 'FAILED_RETRYABLE', message: 'Network timeout' },
    { id: 'q4', status: 'FAILED_FATAL', message: 'Schema validation rejected' },
    { id: 'q5', status: 'SUCCESS', message: 'Alarm scheduled' }
  ];

  const resolvedIds = new Set(['q4']); // User or system resolved q4

  const activeItems = allItems.filter(item => !resolvedIds.has(item.id));
  const resolvedItems = allItems.filter(item => resolvedIds.has(item.id));

  assert.equal(activeItems.length, 4);
  assert.equal(resolvedItems.length, 1);
  assert.equal(resolvedItems[0].id, 'q4');

  // Active counts
  const pendingCount = activeItems.filter(i => i.status === 'PENDING').length;
  const processingCount = activeItems.filter(i => i.status === 'PROCESSING').length;
  const failedCount = activeItems.filter(i => i.status.startsWith('FAILED')).length;

  assert.equal(pendingCount, 1);
  assert.equal(processingCount, 1);
  assert.equal(failedCount, 1); // Only q3 remains active failed
});

// ========================================================================
// 6. SHARE PAGE SECURITY & SANITIZATION
// ========================================================================

function sanitizeSharedAgendas(agendas, filters = {}) {
  const { startDate, endDate, search } = filters;

  return agendas
    .filter(a => {
      // 1. Strict shareable check
      if (!a.isShareable) return false;

      // 2. Date range filter
      if (startDate || endDate) {
        if (!a.scheduled_at) {
          // Unscheduled items pass if not restricted or specifically handled
          return filters.includeUnscheduled !== false;
        }
        const itemDate = format(parseISO(a.scheduled_at), 'yyyy-MM-dd');
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
      }

      // 3. Search query
      if (search && search.trim()) {
        const q = search.toLowerCase().trim();
        const mTitle = a.title?.toLowerCase().includes(q);
        const mLocation = a.location?.toLowerCase().includes(q);
        if (!mTitle && !mLocation) return false;
      }

      return true;
    })
    .map(a => ({
      id: a.id,
      title: a.title,
      location: a.location || '',
      scheduled_at: a.scheduled_at,
      status: a.status || 'confirmed',
      isShareable: true,
      // Strictly strip private notes
      notes: a.include_notes_in_share ? (a.notes || '') : undefined,
      privateNotes: undefined // NEVER exposed
    }));
}

test('6. Share API: Security Sanitization & Inclusive Date Range Filtering', () => {
  const testData = [
    {
      id: 'pub-01',
      title: 'Rapat Senat Terbuka',
      location: 'Auditorium',
      scheduled_at: '2026-10-01T09:00:00.000Z',
      isShareable: true,
      notes: 'Bahan presentasi terlampir',
      include_notes_in_share: true,
      privateNotes: 'SECRET: Rapat evaluasi pimpinan'
    },
    {
      id: 'priv-02',
      title: 'Konsultasi Rahasia',
      location: 'Ruang Kerja',
      scheduled_at: '2026-10-01T14:00:00.000Z',
      isShareable: false, // PRIVATE!
      notes: 'Pribadi',
      include_notes_in_share: false
    },
    {
      id: 'pub-03',
      title: 'Kuliah Umum',
      location: 'Gedung A',
      scheduled_at: '2026-10-05T10:00:00.000Z',
      isShareable: true,
      notes: 'Catatan publik',
      include_notes_in_share: false, // Notes should be stripped
      privateNotes: 'Internal catatan'
    }
  ];

  // Test 1: Private agenda must NEVER be returned
  let sanitized = sanitizeSharedAgendas(testData);
  assert.equal(sanitized.length, 2);
  assert.ok(!sanitized.some(a => a.id === 'priv-02'));

  // Test 2: Private notes stripped
  const item1 = sanitized.find(a => a.id === 'pub-01');
  assert.equal(item1.notes, 'Bahan presentasi terlampir');
  assert.equal(item1.privateNotes, undefined);

  const item3 = sanitized.find(a => a.id === 'pub-03');
  assert.equal(item3.notes, undefined); // include_notes_in_share was false
  assert.equal(item3.privateNotes, undefined);

  // Test 3: Inclusive Date Filter (2026-10-01 to 2026-10-02)
  sanitized = sanitizeSharedAgendas(testData, { startDate: '2026-10-01', endDate: '2026-10-02' });
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].id, 'pub-01');

  // Test 4: Search filter combined with date range
  sanitized = sanitizeSharedAgendas(testData, { startDate: '2026-10-01', endDate: '2026-10-10', search: 'Kuliah' });
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].id, 'pub-03');
});

// ========================================================================
// 7. BACKUP & RESTORE CONFLICT RESOLUTION AND INTEGRITY
// ========================================================================

function validateAndRestoreBackup(backupPayload, existingAgendas, options = { overwrite: true }) {
  if (!backupPayload || !backupPayload.version || !Array.isArray(backupPayload.agendas)) {
    throw new Error('Invalid backup format: missing version or agendas');
  }

  const existingMap = new Map(existingAgendas.map(a => [a.id, a]));
  const result = [];

  for (const item of backupPayload.agendas) {
    if (!item.id || !item.title) continue;
    const exists = existingMap.has(item.id);

    if (exists && !options.overwrite) {
      result.push(existingMap.get(item.id)); // keep existing
    } else {
      result.push(item); // insert or overwrite
      existingMap.set(item.id, item);
    }
  }

  return result;
}

test('7. Backup/Restore: Schema Validation & Overwrite/Skip Conflict Handling', () => {
  const existing = [
    { id: 'uuid-1', title: 'Existing Agenda 1', updated_at: '2026-10-01T08:00:00.000Z' }
  ];

  const backup = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    agendas: [
      { id: 'uuid-1', title: 'Restored Agenda 1 (Updated)', updated_at: '2026-10-01T10:00:00.000Z' },
      { id: 'uuid-2', title: 'Restored Agenda 2 (New)', updated_at: '2026-10-01T10:00:00.000Z' }
    ]
  };

  // Overwrite = true
  const restoredOverwrite = validateAndRestoreBackup(backup, existing, { overwrite: true });
  assert.equal(restoredOverwrite.length, 2);
  assert.equal(restoredOverwrite.find(a => a.id === 'uuid-1').title, 'Restored Agenda 1 (Updated)');

  // Overwrite = false (Skip existing)
  const restoredSkip = validateAndRestoreBackup(backup, existing, { overwrite: false });
  assert.equal(restoredSkip.length, 2);
  assert.equal(restoredSkip.find(a => a.id === 'uuid-1').title, 'Existing Agenda 1');

  // Invalid backup error
  assert.throws(() => validateAndRestoreBackup({ invalid: true }, existing), /Invalid backup format/);
});

// ========================================================================
// 8. DYNAMIC BRANDING CONSISTENCY
// ========================================================================

test('8. Dynamic Branding Fallbacks', () => {
  const DEFAULT_APP_NAME = 'AgendaRecap Pro';

  function getAppName(settings) {
    if (settings && settings.app_name && settings.app_name.trim()) {
      return settings.app_name.trim();
    }
    return DEFAULT_APP_NAME;
  }

  assert.equal(getAppName(null), 'AgendaRecap Pro');
  assert.equal(getAppName({ app_name: '' }), 'AgendaRecap Pro');
  assert.equal(getAppName({ app_name: 'Agenda Rektor' }), 'Agenda Rektor');
});
