// 베스트 조합 결과 미리 계산 → data/generated/teams.json (src/lib/teams-cache.ts)
// 사용: npm run teams:build — 계산 코드(src/lib)·게임 데이터(data/*.json)를 바꾼 뒤 실행 (몇 분)
import { computeTeamsCache, TEAMS_CACHE_FILE, writeTeamsCache } from "@/lib/teams-cache";

async function main() {
  const t0 = Date.now();
  const c = await computeTeamsCache();
  writeTeamsCache(c);
  const n = Object.values(c.byOperator).reduce((s, l) => s + l.length, 0);
  console.log(`베스트 조합 캐시 저장: ${TEAMS_CACHE_FILE} (해시 ${c.hash}, 전체 ${c.overall.length}개 · 오퍼레이터별 ${n}개, ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
