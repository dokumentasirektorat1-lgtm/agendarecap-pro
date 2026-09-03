"use client";

import { useEffect } from "react";
import { getAppSettings } from "@/app/actions/settings";

export default function DynamicBranding() {
  useEffect(() => {
    const updateBranding = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.app_logo) {
          // Update Favicon
          let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!iconLink) {
            iconLink = document.createElement("link");
            iconLink.rel = "icon";
            document.head.appendChild(iconLink);
          }
          iconLink.href = settings.app_logo;

          // Update Apple Touch Icon
          let appleIcon = document.querySelector("link[rel~='apple-touch-icon']") as HTMLLinkElement;
          if (!appleIcon) {
            appleIcon = document.createElement("link");
            appleIcon.rel = "apple-touch-icon";
            document.head.appendChild(appleIcon);
          }
          appleIcon.href = settings.app_logo;

          // Update Manifest Link dynamically
          let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
          if (!manifestLink) {
            manifestLink = document.createElement("link");
            manifestLink.rel = "manifest";
            document.head.appendChild(manifestLink);
          }
          
          const manifestUrl = `/api/manifest?logo=${encodeURIComponent(settings.app_logo)}&name=${encodeURIComponent(settings.app_name || "AgendaRecap")}`;
          // Only update if changed to avoid continuous re-fetching
          if (manifestLink.href !== window.location.origin + manifestUrl && manifestLink.getAttribute('href') !== manifestUrl) {
             manifestLink.href = manifestUrl;
          }
        }
      } catch (error) {
        console.error("Failed to apply dynamic branding:", error);
      }
    };

    updateBranding();
  }, []);

  return null;
}
