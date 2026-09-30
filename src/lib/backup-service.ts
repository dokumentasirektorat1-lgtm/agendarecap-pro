import { Agenda } from "@/store/useStore";
import { AppSettings } from "@/app/actions/settings";
import { agendaRepository } from "./repositories/agenda-repository";
import { format } from "date-fns";

export interface BackupDataStructure {
  format: "AGENDARECAP_BACKUP";
  version: "1.0";
  exportedAt: string;
  appName: string;
  totalAgendas: number;
  data: Agenda[];
}

export interface BackupSummary {
  totalInBackup: number;
  newCount: number;
  existingCount: number;
  conflictsCount: number;
  sampleTitles: string[];
  agendas: Agenda[];
}

/**
 * Generates and downloads a clean, structured JSON backup file of all agendas.
 */
export function downloadAgendaBackup(agendas: Agenda[], appSettings?: AppSettings | null) {
  const appName = appSettings?.app_name || "AgendaRecap Pro";
  const now = new Date();
  
  const backupObject: BackupDataStructure = {
    format: "AGENDARECAP_BACKUP",
    version: "1.0",
    exportedAt: now.toISOString(),
    appName,
    totalAgendas: agendas.length,
    data: agendas
  };

  const jsonString = JSON.stringify(backupObject, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const fileName = `Backup_Data_Agenda_${format(now, "yyyyMMdd_HHmm")}.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return fileName;
}

/**
 * Validates an uploaded JSON backup file and compares it with local agendas.
 */
export function validateAndAnalyzeBackup(
  jsonText: string,
  existingAgendas: Agenda[]
): { valid: boolean; error?: string; summary?: BackupSummary } {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    return { valid: false, error: "Format file tidak valid (Bukan file JSON yang sah)." };
  }

  // Support both standardized object with .data and raw array of agendas
  let agendaList: any[] = [];
  if (parsed && Array.isArray(parsed.data)) {
    agendaList = parsed.data;
  } else if (Array.isArray(parsed)) {
    agendaList = parsed;
  } else {
    return {
      valid: false,
      error: "Struktur backup tidak dikenali. File harus memiliki properti 'data' berisi daftar agenda."
    };
  }

  if (agendaList.length === 0) {
    return { valid: false, error: "File backup tidak memuat data agenda (daftar kosong)." };
  }

  // Validate integrity of agenda records
  const existingMap = new Map(existingAgendas.map(a => [a.id, a]));
  const validAgendas: Agenda[] = [];
  let newCount = 0;
  let existingCount = 0;
  let conflictsCount = 0;

  for (let i = 0; i < agendaList.length; i++) {
    const item = agendaList[i];
    if (!item || typeof item !== "object") {
      return { valid: false, error: `Record ke-${i + 1} tidak valid (bukan objek).` };
    }
    if (!item.id || typeof item.id !== "string") {
      return { valid: false, error: `Record ke-${i + 1} ("${item.title || 'Tanpa Judul'}") tidak memiliki UUID canonical.` };
    }
    if (!item.title || typeof item.title !== "string") {
      return { valid: false, error: `Record ke-${i + 1} tidak memiliki judul agenda.` };
    }

    const agendaRecord: Agenda = {
      id: item.id,
      user_id: item.user_id,
      title: item.title,
      location: item.location || "",
      notes: item.notes || "",
      privateNotes: item.privateNotes || "",
      scheduled_at: item.scheduled_at || "",
      time_mode: item.time_mode,
      status: item.status || "confirmed",
      is_completed: Boolean(item.is_completed),
      include_notes_in_share: Boolean(item.include_notes_in_share),
      isShareable: item.isShareable !== undefined ? Boolean(item.isShareable) : true,
      groupId: item.groupId,
      isOnline: Boolean(item.isOnline),
      onlineLink: item.onlineLink || "",
      meetingId: item.meetingId || "",
      meetingPasscode: item.meetingPasscode || "",
      isUrgent: Boolean(item.isUrgent),
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString()
    };

    validAgendas.push(agendaRecord);

    const existing = existingMap.get(item.id);
    if (!existing) {
      newCount++;
    } else {
      existingCount++;
      if (existing.updated_at !== agendaRecord.updated_at) {
        conflictsCount++;
      }
    }
  }

  return {
    valid: true,
    summary: {
      totalInBackup: validAgendas.length,
      newCount,
      existingCount,
      conflictsCount,
      sampleTitles: validAgendas.slice(0, 3).map(a => a.title),
      agendas: validAgendas
    }
  };
}

/**
 * Restores agendas safely preserving canonical UUIDs and preventing duplicates.
 */
export async function executeRestoreBackup(
  backupAgendas: Agenda[],
  existingAgendas: Agenda[],
  options: { overwriteExisting: boolean } = { overwriteExisting: true }
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  const existingMap = new Map(existingAgendas.map(a => [a.id, a]));
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of backupAgendas) {
    const existing = existingMap.get(item.id);
    if (!existing) {
      // New agenda with preserved canonical UUID
      await agendaRepository.create({
        ...item,
        id: item.id
      });
      importedCount++;
    } else {
      // Existing UUID
      if (options.overwriteExisting) {
        await agendaRepository.update(item.id, {
          title: item.title,
          location: item.location,
          notes: item.notes,
          privateNotes: item.privateNotes,
          scheduled_at: item.scheduled_at,
          time_mode: item.time_mode,
          status: item.status,
          is_completed: item.is_completed,
          include_notes_in_share: item.include_notes_in_share,
          isShareable: item.isShareable,
          groupId: item.groupId,
          isOnline: item.isOnline,
          onlineLink: item.onlineLink,
          meetingId: item.meetingId,
          meetingPasscode: item.meetingPasscode,
          isUrgent: item.isUrgent
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
  }

  return { importedCount, updatedCount, skippedCount };
}
