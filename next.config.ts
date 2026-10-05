import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 빌드 시 추천 빌드(무기·장비 탐색)와 4인 조합 전체 팀 피해 계산(1차 4만여 개 + 2차 파티 장비)을 미리 함 → 페이지당 60초 기본 제한을 넘을 수 있음
  staticPageGenerationTimeout: 300,
  images: {
    // 공식 위키 이미지 CDN
    remotePatterns: [{ protocol: "https", hostname: "static.skport.com" }],
  },
};

export default nextConfig;
