import { AppSettings } from "@/app/actions/settings";

export const DEFAULT_APP_NAME = "AgendaRecap Pro";
export const DEFAULT_APP_LOGO = "/icons/icon-192.png";
const CACHE_KEY = "agendarecap_cached_app_name";
const CACHE_LOGO_KEY = "agendarecap_cached_app_logo";

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
 * Returns the effective application logo/icon URL.
 * Priority: appSettings.app_logo -> cached in localStorage -> DEFAULT_APP_LOGO
 */
export function getAppLogo(appSettings?: Partial<AppSettings> | null): string {
  if (appSettings?.app_logo && appSettings.app_logo.trim().length > 0) {
    const trimmed = appSettings.app_logo.trim();
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CACHE_LOGO_KEY, trimmed);
      } catch (e) {}
    }
    return trimmed;
  }

  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_LOGO_KEY);
      if (cached && cached.trim().length > 0) {
        return cached.trim();
      }
    } catch (e) {}
  }

  return DEFAULT_APP_LOGO;
}

/**
 * Caches branding configuration into localStorage for immediate offline/cold-start use.
 */
export function setAppBranding(settings: { app_name?: string | null; app_logo?: string | null }) {
  if (typeof window === "undefined") return;
  try {
    if (settings.app_name && settings.app_name.trim().length > 0) {
      localStorage.setItem(CACHE_KEY, settings.app_name.trim());
    }
    if (settings.app_logo && settings.app_logo.trim().length > 0) {
      localStorage.setItem(CACHE_LOGO_KEY, settings.app_logo.trim());
    } else if (settings.app_logo === null || settings.app_logo === "") {
      localStorage.removeItem(CACHE_LOGO_KEY);
    }
  } catch (e) {}
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

