import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 공식 위키 이미지 CDN
    remotePatterns: [{ protocol: "https", hostname: "static.skport.com" }],
  },
};

export default nextConfig;
