import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xero-node", "nodemailer"],
  experimental: {
    // Keep visited and prefetched pages in the browser for a while, so switching
    // between tabs shows them instantly instead of asking the server again.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
