import { NextResponse } from "next/server";

export const dynamic = 'force-static';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const logo = searchParams.get("logo");
  const name = searchParams.get("name") || "AgendaRecap Pro";

  // Use the provided logo or a fallback default icon
  const iconUrl = logo || "/icon-512x512.png";

  const manifest = {
    name: name,
    short_name: name,
    description: "Ciptakan dan kelola agenda harian Anda dengan mudah.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0B",
    theme_color: "#8b5cf6",
    icons: [
      {
        src: iconUrl,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: iconUrl,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };

  return NextResponse.json(manifest);
}
