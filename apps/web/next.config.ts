import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  transpilePackages: [
    "@options-chart/chart",
    "@options-chart/market-data",
    "@options-chart/options-engine",
    "@options-chart/worker-protocol",
  ],
};

export default nextConfig;
