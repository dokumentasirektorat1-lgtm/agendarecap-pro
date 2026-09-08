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
};

export default nextConfig;
