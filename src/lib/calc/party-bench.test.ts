// 파티 장비 검증: 커뮤니티 팀 빌드(같은 4인 조합) 멤버별 1위 세트와 비교 — 회귀 방지용 하한
import { expect, test } from "vitest";
import { teamGearMetrics } from "./bench-metrics";

test("커뮤니티 팀 빌드 멤버별 세트 = 파티 최적화 세트", { timeout: 600000 }, () => {
  const t0 = Date.now();
  const m = teamGearMetrics();
  console.log(`[파티 장비] 멤버 ${m.n}명 · 개인 추천 일치 ${m.indiv} → 파티 최적화 일치 ${m.party} (${((Date.now() - t0) / 1000).toFixed(1)}초)\n` + m.lines.join("\n"));
  // 기준(2026-10-05): 113명 · 개인 추천 70 → 파티 맞춤 74
  expect(m.party).toBeGreaterThanOrEqual(73);
  expect(m.party).toBeGreaterThan(m.indiv);
});
