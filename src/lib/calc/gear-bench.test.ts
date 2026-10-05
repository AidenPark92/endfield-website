// 추천 장비 검증: endfieldtools.dev 공개 커뮤니티 빌드(data/benchmarks/endfieldtools-community-gear.json)와 비교 — 회귀 방지용 하한
import { expect, test } from "vitest";
import { gearMetrics } from "./bench-metrics";

test("커뮤니티 빌드 1위 장비 세트 · 부위가 우리 추천 상위에 있는지", { timeout: 300000 }, () => {
  const m = gearMetrics();
  console.log(`[커뮤니티 장비] n=${m.n} top1=${m.top1} top3=${m.top3} 부위 일치=${m.pieceHit}/${m.pieceN}\n` + m.lines.join("\n"));
  // 기준(2026-10-05): n=25 top1 17 · top3 24 · 부위 65/100 (보정 전 top1 11 · top3 20 · 부위 57, 아츠 부착·반응 팀 기대값 전 16)
  expect(m.top1).toBeGreaterThanOrEqual(16);
  expect(m.top3).toBeGreaterThanOrEqual(23);
  expect(m.pieceHit).toBeGreaterThanOrEqual(62);
});
