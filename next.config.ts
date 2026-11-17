import type { NextConfig } from "next";

const isNativeBuild = process.env.BUILD_TARGET === 'native';

const nextConfig: NextConfig = {
  output: isNativeBuild ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // When building for native (Capacitor), exclude large binary assets
  // from the public/ folder that are not needed inside the APK.
  // The downloads/ folder contains APK files for web download only.
  ...(isNativeBuild && {
    // next export copies public/ verbatim; we use aaptOptions.ignoreAssetsPattern
    // in build.gradle to drop downloads/ from the final APK asset packing.
  }),
};

export default nextConfig;
