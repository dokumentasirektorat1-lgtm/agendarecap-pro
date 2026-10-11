import test from "node:test";
import assert from "node:assert/strict";

// 1. Direct imports of REAL production modules (NOT re-implementations)
import { deduplicateAgendas, Agenda } from "@/store/useStore";
import { computeAgendaDensity, DensityAgendaItem } from "@/lib/agenda-density";
import {
  buildUpcomingWidgetPayload,
  buildAgenda7DaysWidgetPayload,
  buildConsultationWidgetPayload
} from "@/lib/widget-payloads";
import {
  DEFAULT_APP_NAME,
  DEFAULT_APP_LOGO,
  getAppName,
  getAppLogo,
  getWatermarkText
} from "@/lib/branding";
import {
  getAgendaTimeMode,
  getAgendaTimeDisplay,
  getAgendaDateDisplay,
  isAgendaUnscheduled
} from "@/lib/agenda-time";
import { sanitizeShareAgendas } from "@/lib/share-sanitizer";
import {
  getAgendaBackupData,
  validateAndAnalyzeBackup
} from "@/lib/backup-service";
import { formatAgendasToWhatsApp } from "@/lib/whatsapp-formatter";
import { generateAgendaExcel } from "@/lib/excel-export";
import { getEffectiveNotificationSound } from "@/lib/native-alarm";

// ========================================================================
// 1. DEDUPLICATION & CANONICAL AGENDA UUID (GOLDEN FIXTURE: 1 OKTOBER 2026)
// Calling production deduplicateAgendas() from useStore
// ========================================================================
test("1. Production deduplicateAgendas(): Golden Fixture 1 Okt 2026 & canonical ID integrity", () => {
  const mouBali: Agenda = {
    id: "uuid-mou-bali-001",
    title: "MoU Bali",
    location: "Ruang Rapat Utama",
    scheduled_at: "2026-10-01T09:00:00.000Z",
    time_mode: "exact",
    status: "confirmed",
    is_completed: false,
    include_notes_in_share: true,
    isShareable: true,
    updated_at: "2026-10-01T08:00:00.000Z"
  };

  const orientasiPpg: Agenda = {
    id: "uuid-orientasi-ppg-002",
    title: "Orientasi PPG",
    location: "Aula Lantai 3",
    scheduled_at: "2026-10-01T13:30:00.000Z",
    time_mode: "exact",
    status: "confirmed",
    is_completed: false,
    include_notes_in_share: true,
    isShareable: true,
    updated_at: "2026-10-01T08:00:00.000Z"
  };

  // Initial state: exactly 2 unique items
  const store = deduplicateAgendas([mouBali, orientasiPpg]);
  assert.equal(store.length, 2);

  // Edit MoU Bali 10 times with newer updated_at timestamps
  let currentMou = mouBali;
  for (let i = 1; i <= 10; i++) {
    currentMou = {
      ...currentMou,
      title: `MoU Bali (Revisi ${i})`,
      location: `Ruang Sidang ${i}`,
      updated_at: `2026-10-01T08:${String(i).padStart(2, "0")}:00.000Z`
    };
    store.push(currentMou);
  }

  // Deduplication must strictly preserve 1 canonical ID with latest updated_at
  const deduped = deduplicateAgendas(store);
  assert.equal(deduped.length, 2);

  const finalMou = deduped.find(a => a.id === "uuid-mou-bali-001");
  assert.ok(finalMou);
  assert.equal(finalMou?.title, "MoU Bali (Revisi 10)");
  assert.equal(finalMou?.location, "Ruang Sidang 10");

  // Deletion keeps item deleted
  const afterDelete = deduplicateAgendas(deduped.filter(a => a.id !== "uuid-mou-bali-001"));
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, "uuid-orientasi-ppg-002");
});

// ========================================================================
// 2. CALENDAR DENSITY SPECIFICATION & VERIFICATION
// Calling production computeAgendaDensity() from agenda-density.ts
// ========================================================================
test("2. Production computeAgendaDensity(): Thresholds, ALL_DAY, & Unscheduled exclusion", () => {
  const dateKey = "2026-10-01";

  // Case A: 1 agenda -> dates1 (ringan)
  const list1: DensityAgendaItem[] = [
    { id: "a1", scheduled_at: `${dateKey}T09:00:00`, time_mode: "exact", status: "confirmed" }
  ];
  let res = computeAgendaDensity(list1);
  assert.equal(res.agendaDensityByDate[dateKey].count, 1);
  assert.equal(res.dates1.length, 1);
  assert.equal(res.dates2.length, 0);

  // Case B: Golden fixture 2 agendas -> dates2 (sedang)
  const list2: DensityAgendaItem[] = [
    { id: "a1", scheduled_at: `${dateKey}T09:00:00`, time_mode: "exact", status: "confirmed" },
    { id: "a2", scheduled_at: `${dateKey}T13:00:00`, time_mode: "exact", status: "confirmed" }
  ];
  res = computeAgendaDensity(list2);
  assert.equal(res.agendaDensityByDate[dateKey].count, 2);
  assert.equal(res.dates2.length, 1);

  // Case C: 4 agendas -> dates4 (tinggi)
  const list4: DensityAgendaItem[] = [
    { id: "a1", scheduled_at: `${dateKey}T08:00:00`, time_mode: "exact", status: "confirmed" },
    { id: "a2", scheduled_at: `${dateKey}T10:00:00`, time_mode: "exact", status: "confirmed" },
    { id: "a3", scheduled_at: `${dateKey}T13:00:00`, time_mode: "exact", status: "confirmed" },
    { id: "a4", scheduled_at: `${dateKey}T15:00:00`, time_mode: "exact", status: "confirmed" }
  ];
  res = computeAgendaDensity(list4);
  assert.equal(res.agendaDensityByDate[dateKey].count, 4);
  assert.equal(res.dates4.length, 1);

  // Case D: 5 agendas -> datesFull (penuh)
  const list5: DensityAgendaItem[] = [
    ...list4,
    { id: "a5", scheduled_at: `${dateKey}T17:00:00`, time_mode: "exact", status: "confirmed" }
  ];
  res = computeAgendaDensity(list5);
  assert.equal(res.agendaDensityByDate[dateKey].count, 5);
  assert.equal(res.datesFull.length, 1);

  // Case E: Single ALL_DAY agenda -> datesFull (penuh)
  const listAllDay: DensityAgendaItem[] = [
    { id: "all-1", scheduled_at: `${dateKey}T00:00:00`, time_mode: "all_day", status: "confirmed" }
  ];
  res = computeAgendaDensity(listAllDay);
  assert.equal(res.agendaDensityByDate[dateKey].hasAllDay, true);
  assert.equal(res.datesFull.length, 1);

  // Case F: Unscheduled & Cancelled must NEVER pollute calendar date counts
  const listExclusion: DensityAgendaItem[] = [
    { id: "a1", scheduled_at: `${dateKey}T09:00:00`, time_mode: "exact", status: "confirmed" },
    { id: "u1", scheduled_at: null, time_mode: "unscheduled", status: "unscheduled" },
    { id: "u2", scheduled_at: `${dateKey}T10:00:00`, time_mode: "unscheduled", status: "unscheduled" },
    { id: "c1", scheduled_at: `${dateKey}T11:00:00`, time_mode: "exact", status: "cancelled" }
  ];
  res = computeAgendaDensity(listExclusion);
  assert.equal(res.agendaDensityByDate[dateKey].count, 1);
  assert.equal(res.dates1.length, 1);
});

// ========================================================================
// 3. NATIVE WIDGET PAYLOADS & GROUPING
// Calling production widget builders from widget-payloads.ts
// ========================================================================
test("3. Production widget builders: Consultation grouping & 7-Days offset range", () => {
  const baseDate = new Date("2026-10-01T08:00:00");

  // Consultation grouping test
  const rawConsultations = [
    { id: "c1", groupId: "grp-disertasi", title: "Bimbingan Disertasi", status: "pending_consultation", is_completed: false },
    { id: "c2", groupId: "grp-disertasi", title: "Bimbingan Disertasi", status: "pending_consultation", is_completed: false },
    { id: "c3", groupId: "grp-disertasi", title: "Bimbingan Disertasi", status: "pending_consultation", is_completed: false },
    { id: "solo-proker", title: "Review Program Kerja", status: "rescheduled", is_completed: false },
    { id: "done-01", title: "Sudah Selesai", status: "pending_consultation", is_completed: true } // completed excluded
  ];

  const consultPayload = buildConsultationWidgetPayload(rawConsultations as any);
  assert.equal(consultPayload.length, 2);

  const grouped = consultPayload.find(c => c.title.includes("Disertasi"));
  assert.ok(grouped);
  assert.equal(grouped?.title, "Bimbingan Disertasi (3 Sesi)");
  assert.equal(grouped?.count, 3);

  const solo = consultPayload.find(c => c.title.includes("Program Kerja"));
  assert.ok(solo);
  assert.equal(solo?.title, "Review Program Kerja");
  assert.equal(solo?.count, 1);

  // 7 Days widget test
  const weekItems = [
    { id: "w1", title: "Rapat Pagi", scheduled_at: "2026-10-01T09:00:00", status: "confirmed", time_mode: "exact" },
    { id: "w2", title: "Workshop", scheduled_at: "2026-10-03T10:00:00", status: "confirmed", time_mode: "all_day" },
    { id: "w3", title: "Diskusi Santai", scheduled_at: "2026-10-06T14:00:00", status: "confirmed", time_mode: "flex" },
    { id: "w4", title: "Agenda Jauh", scheduled_at: "2026-10-15T10:00:00", status: "confirmed", time_mode: "exact" }, // out of 7 days
    { id: "w5", title: "Unscheduled", scheduled_at: null, status: "unscheduled", time_mode: "unscheduled" }
  ];

  const weekPayload = buildAgenda7DaysWidgetPayload(weekItems as any, baseDate);
  assert.equal(weekPayload.length, 3);
  assert.equal(weekPayload[0].time, "09:00");
  assert.equal(weekPayload[1].time, "Seharian");
  assert.equal(weekPayload[2].time, "Fleksibel");

  // Upcoming widget test
  const upcomingPayload = buildUpcomingWidgetPayload(weekItems as any, baseDate);
  assert.equal(upcomingPayload.length, 1);
  assert.equal(upcomingPayload[0].title, "Rapat Pagi");
});

// ========================================================================
// 4. GLOBAL DYNAMIC BRANDING PRODUCTION FUNCTIONS
// Calling production functions from branding.ts & agenda-time.ts
// ========================================================================
test("4. Production branding.ts & agenda-time.ts semantics", () => {
  // Test branding helper
  assert.equal(DEFAULT_APP_NAME, "AgendaRecap Pro");
  assert.equal(getAppName(null), "AgendaRecap Pro");
  assert.equal(getAppName({ app_name: "" }), "AgendaRecap Pro");
  assert.equal(getAppName({ app_name: "  " }), "AgendaRecap Pro");
  assert.equal(getAppName({ app_name: "Agenda Rektor" }), "Agenda Rektor");
  assert.equal(getWatermarkText({ watermark_text: "Oleh Rektorat" }), "Oleh Rektorat");
  assert.equal(getWatermarkText(null), "Dibuat oleh AgendaRecap Pro");
  assert.equal(getAppLogo(null), DEFAULT_APP_LOGO);

  // Test agenda-time helper
  assert.equal(getAgendaTimeMode({ status: "unscheduled" }), "unscheduled");
  assert.equal(getAgendaTimeMode({ time_mode: "all_day" }), "all_day");
  assert.equal(getAgendaTimeMode({ time_mode: "flex" }), "flex");
  assert.equal(getAgendaTimeMode({ scheduled_at: null }), "unscheduled");
  assert.equal(getAgendaTimeDisplay({ time_mode: "all_day" }), "Seharian");
  assert.equal(getAgendaTimeDisplay({ time_mode: "flex" }), "Fleksibel");
  assert.equal(getAgendaTimeDisplay({ status: "unscheduled" }), "Belum Ada Tanggal");
  assert.equal(isAgendaUnscheduled({ status: "unscheduled" }), true);
  assert.equal(isAgendaUnscheduled({ scheduled_at: null }), true);
  assert.equal(isAgendaUnscheduled({ time_mode: "exact", scheduled_at: "2026-10-01T09:00:00" }), false);
  assert.ok(getAgendaDateDisplay({ scheduled_at: "2026-10-01T09:00:00" }).includes("Oktober 2026"));

  // Test sound helper
  assert.equal(getEffectiveNotificationSound("chime"), "chime");
});

// ========================================================================
// 5. PUBLIC SHARE SANITIZER PRODUCTION FUNCTION
// Calling production sanitizeShareAgendas() from share-sanitizer.ts
// ========================================================================
test("5. Production sanitizeShareAgendas(): Strict security & filter intersection", () => {
  const dataset = [
    {
      id: "pub-01",
      title: "Rapat Senat Akademik",
      location: "Gedung Pusat",
      scheduled_at: "2026-10-01T09:00:00.000Z",
      status: "confirmed",
      isShareable: true,
      include_notes_in_share: true,
      notes: "Membahas RKA-KL",
      privateNotes: "SANGAT RAHASIA: Dokumen internal"
    },
    {
      id: "priv-02",
      title: "Konsultasi Pribadi",
      location: "Ruang Rektor",
      scheduled_at: "2026-10-01T14:00:00.000Z",
      status: "confirmed",
      isShareable: false, // PRIVATE
      notes: "Catatan pribadi",
      privateNotes: "Rahasia"
    },
    {
      id: "pub-03",
      title: "Kuliah Perdana",
      location: "Auditorium",
      scheduled_at: "2026-10-05T10:00:00.000Z",
      status: "confirmed",
      isShareable: true,
      include_notes_in_share: false, // Notes should be stripped
      notes: "Catatan internal kuliah",
      privateNotes: "Rahasia dosen"
    },
    {
      id: "pub-unsch",
      title: "Rencana Wisuda Periode II",
      scheduled_at: null,
      status: "unscheduled",
      time_mode: "unscheduled",
      isShareable: true
    }
  ];

  // Test 1: Private items and private notes must NEVER leak
  let res = sanitizeShareAgendas(dataset);
  assert.equal(res.length, 3); // priv-02 excluded
  assert.ok(!res.some(a => a.id === "priv-02"));

  const pub1 = res.find(a => a.id === "pub-01");
  assert.equal(pub1?.notes, "Membahas RKA-KL");
  assert.equal((pub1 as any).privateNotes, undefined);

  const pub3 = res.find(a => a.id === "pub-03");
  assert.equal(pub3?.notes, undefined); // stripped because include_notes_in_share = false
  assert.equal((pub3 as any).privateNotes, undefined);

  // Test 2: Inclusive date range AND filter
  res = sanitizeShareAgendas(dataset, { startDate: "2026-10-01", endDate: "2026-10-02" });
  assert.equal(res.filter(a => a.scheduled_at).length, 1);
  assert.equal(res.find(a => a.scheduled_at)?.id, "pub-01");

  // Test 3: Search filter intersecting date range
  res = sanitizeShareAgendas(dataset, {
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    search: "Kuliah"
  });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, "pub-03");
});

// ========================================================================
// 6. BACKUP & RESTORE PRODUCTION SERVICE
// Calling production backup functions from backup-service.ts
// ========================================================================
test("6. Production backup-service.ts: Format generation & schema analysis", () => {
  const agendas: Agenda[] = [
    {
      id: "uuid-agenda-01",
      title: "Upacara Dies Natalis",
      location: "Lapangan",
      scheduled_at: "2026-10-01T07:30:00.000Z",
      time_mode: "exact",
      status: "confirmed",
      is_completed: false,
      include_notes_in_share: true,
      isShareable: true,
      updated_at: "2026-10-01T08:00:00.000Z"
    }
  ];

  // Test backup generation
  const { fileName, jsonString } = getAgendaBackupData(agendas, { app_name: "Agenda Rektor" } as any);
  assert.ok(fileName.startsWith("Backup_Data_Agenda_"));
  const parsed = JSON.parse(jsonString);
  assert.equal(parsed.format, "AGENDARECAP_BACKUP");
  assert.equal(parsed.version, "1.0");
  assert.equal(parsed.appName, "Agenda Rektor");
  assert.equal(parsed.totalAgendas, 1);
  assert.equal(parsed.data[0].id, "uuid-agenda-01");

  // Test validation & analysis
  const existingAgendas = agendas;
  const analysis = validateAndAnalyzeBackup(jsonString, existingAgendas);
  assert.equal(analysis.valid, true);
  assert.ok(analysis.summary);
  assert.equal(analysis.summary?.totalInBackup, 1);
  assert.equal(analysis.summary?.existingCount, 1);
  assert.equal(analysis.summary?.newCount, 0);

  // Test corrupt JSON handling
  const corrupt = validateAndAnalyzeBackup("INVALID_JSON", existingAgendas);
  assert.equal(corrupt.valid, false);
  assert.ok(corrupt.error?.includes("Bukan file JSON"));
});

// ========================================================================
// 7. EXPORT EXCEL PRODUCTION FUNCTION
// Calling production generateAgendaExcel() and validating Workbook structure
// ========================================================================
test("7. Production generateAgendaExcel(): Verifying workbook structure & sheet names", () => {
  const sampleAgendas: Agenda[] = [
    {
      id: "a-1",
      title: "Rapat Koordinasi",
      location: "Ruang A",
      scheduled_at: "2026-10-01T09:00:00",
      time_mode: "exact",
      status: "confirmed",
      is_completed: false,
      include_notes_in_share: true,
      isShareable: true,
      updated_at: "2026-10-01T08:00:00"
    },
    {
      id: "a-2",
      title: "Agenda Tanpa Tanggal",
      location: "Daring",
      scheduled_at: "",
      time_mode: "unscheduled",
      status: "unscheduled",
      is_completed: false,
      include_notes_in_share: false,
      isShareable: true,
      updated_at: "2026-10-01T08:00:00"
    }
  ];

  const { fileName, workbook } = generateAgendaExcel({
    agendas: sampleAgendas,
    appSettings: { app_name: "Agenda Pimpinan" } as any,
    mode: "full"
  });

  assert.ok(fileName.endsWith(".xlsx"));
  assert.ok(workbook.SheetNames.includes("Rekap Agenda"));
  const sheet = workbook.Sheets["Rekap Agenda"];
  assert.ok(sheet);

  // Check header rows in sheet: A1 has appName, A2 has docTitle
  const cellA1 = sheet["A1"]?.v;
  const cellA2 = sheet["A2"]?.v;
  assert.equal(cellA1, "AGENDA PIMPINAN");
  assert.ok(cellA2 && String(cellA2).includes("REKAP AGENDA"));
});

// ========================================================================
// 8. WHATSAPP FORMATTER PRODUCTION FUNCTION
// Calling production formatAgendasToWhatsApp()
// ========================================================================
test("8. Production formatAgendasToWhatsApp(): Dynamic branding & structure", () => {
  const sample = [
    {
      id: "wa-1",
      title: "Pertemuan Kerjasama Industri",
      location: "Gedung Inkubator",
      scheduled_at: "2026-10-01T10:00:00",
      time_mode: "exact",
      status: "confirmed" as const,
      is_completed: false,
      include_notes_in_share: true
    }
  ];

  const waText = formatAgendasToWhatsApp(
    "Kamis, 1 Oktober 2026",
    false,
    null,
    sample,
    { app_name: "Agenda Rektor", is_watermark_enabled: true, watermark_text: "Dibuat oleh Agenda Rektor" } as any
  );

  assert.ok(waText.includes("*Agenda Rektor*"));
  assert.ok(waText.includes("*Kamis, 1 Oktober 2026*"));
  assert.ok(waText.includes("Pertemuan Kerjasama Industri"));
  assert.ok(waText.includes("Gedung Inkubator"));
  assert.ok(waText.includes("Dibuat Oleh Agenda Rektor"));
});
