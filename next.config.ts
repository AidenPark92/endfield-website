import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 빌드 시 오퍼레이터별 추천 빌드(무기·장비 탐색)를 계산함. 베스트 조합은 data/generated/teams.json 캐시를 읽지만, 캐시가 오래되면 다시 계산(몇 분) → 넉넉하게
  staticPageGenerationTimeout: 300,
};

export default nextConfig;
