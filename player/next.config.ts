import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *; media-src * blob: data:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
