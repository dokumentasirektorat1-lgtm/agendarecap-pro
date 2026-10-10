"use client";

import { useEffect } from "react";
import { getAppSettings } from "@/app/actions/settings";
import { getAppName, getAppLogo, setAppBranding, updateDocumentTitle } from "@/lib/branding";

export default function DynamicBranding() {
  useEffect(() => {
    const updateBranding = async () => {
      try {
        const settings = await getAppSettings();
        
        // 1. Cache branding locally
        if (settings) {
          setAppBranding({ app_name: settings.app_name, app_logo: settings.app_logo });
        }

        const effectiveName = getAppName(settings);
        const effectiveLogo = getAppLogo(settings);

        // 2. Dynamically update browser title
        updateDocumentTitle(undefined, settings);

        // 3. Update Favicon
        let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!iconLink) {
          iconLink = document.createElement("link");
          iconLink.rel = "icon";
          document.head.appendChild(iconLink);
        }
        iconLink.href = effectiveLogo;

        // 4. Update Apple Touch Icon
        let appleIcon = document.querySelector("link[rel~='apple-touch-icon']") as HTMLLinkElement;
        if (!appleIcon) {
          appleIcon = document.createElement("link");
          appleIcon.rel = "apple-touch-icon";
          document.head.appendChild(appleIcon);
        }
        appleIcon.href = effectiveLogo;

        // 5. Update Manifest Link dynamically
        let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
        if (!manifestLink) {
          manifestLink = document.createElement("link");
          manifestLink.rel = "manifest";
          document.head.appendChild(manifestLink);
        }
        
        const manifestUrl = `/api/manifest?logo=${encodeURIComponent(effectiveLogo)}&name=${encodeURIComponent(effectiveName)}`;
        if (manifestLink.href !== window.location.origin + manifestUrl && manifestLink.getAttribute('href') !== manifestUrl) {
           manifestLink.href = manifestUrl;
        }
      } catch (error) {
        console.warn("Notice applying dynamic branding:", error);
      }
    };

    updateBranding();
  }, []);

  return null;
}

