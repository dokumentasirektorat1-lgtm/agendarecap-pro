import { AppSettings } from "@/app/actions/settings";

export const DEFAULT_APP_NAME = "AgendaRecap Pro";
const CACHE_KEY = "agendarecap_cached_app_name";

/**
 * Returns the effective application name.
 * Priority: appSettings.app_name -> cached in localStorage -> DEFAULT_APP_NAME
 */
export function getAppName(appSettings?: Partial<AppSettings> | null): string {
  if (appSettings?.app_name && appSettings.app_name.trim().length > 0) {
    const trimmed = appSettings.app_name.trim();
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CACHE_KEY, trimmed);
      } catch (e) {}
    }
    return trimmed;
  }

  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached && cached.trim().length > 0) {
        return cached.trim();
      }
    } catch (e) {}
  }

  return DEFAULT_APP_NAME;
}

/**
 * Returns the effective watermark text.
 */
export function getWatermarkText(appSettings?: Partial<AppSettings> | null): string {
  if (appSettings?.watermark_text && appSettings.watermark_text.trim().length > 0) {
    return appSettings.watermark_text.trim();
  }
  const appName = getAppName(appSettings);
  return `Dibuat oleh ${appName}`;
}

/**
 * Dynamically updates document title with current app name.
 */
export function updateDocumentTitle(pageTitle?: string, appSettings?: Partial<AppSettings> | null) {
  if (typeof window === "undefined") return;
  const appName = getAppName(appSettings);
  if (pageTitle && pageTitle.trim().length > 0) {
    document.title = `${pageTitle.trim()} | ${appName}`;
  } else {
    document.title = appName;
  }
}
