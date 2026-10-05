// 추천 무기 검증: endfieldtools.dev 커뮤니티 Best Build 무기 채택 수(data/benchmarks)와 비교 — 회귀 방지용 하한
import { expect, test } from "vitest";
import { getBuildRecommendation } from "@/lib/data";
import bench from "@data/benchmarks/endfieldtools-best-build.json";

type B = { name: string; weapons: { id: string; name: string; count: number }[]; gear?: { suitId: string; name: string; count: number }[] };
test("커뮤니티 Best Build 1위 무기가 우리 추천 상위에 있는지", { timeout: 120000 }, () => {
  let top1 = 0, top3 = 0, n = 0, rankSum = 0;
  const lines: string[] = [];
  for (const [id, b] of Object.entries((bench as unknown as { operators: Record<string, B> }).operators)) {
    const r = getBuildRecommendation(id);
    if (!r) continue;
    const ours = r.weapons.map((w) => w.id);
    const rk = ours.indexOf(b.weapons[0].id) + 1;
    n++;
    rankSum += rk;
    if (rk === 1) top1++;
    if (rk <= 3) top3++;
    if (rk > 1)
      lines.push(
        `${b.name.padEnd(7)} 커뮤 ${b.weapons.slice(0, 3).map((w) => `${w.name}(${w.count})#${ours.indexOf(w.id) + 1}`).join(", ")} | 우리 ${r.weapons.slice(0, 3).map((w) => w.name).join(", ")}`,
      );
  }
  // 기준(2026-10-05): top1 17/31, top3 23/31 → 장비 보정(일반 공격 50% 반영) 후 top1 16/31, top3 23/31
  expect(top3).toBeGreaterThanOrEqual(23);
  expect(top1).toBeGreaterThanOrEqual(16);
  console.log(`n=${n} top1=${top1} top3=${top3} 평균순위=${(rankSum / n).toFixed(2)}\n` + lines.join("\n"));
});

test("커뮤니티 Best Build 1위 장비 세트가 우리 추천 상위에 있는지", { timeout: 120000 }, () => {
  let top1 = 0, top3 = 0, n = 0;
  const lines: string[] = [];
  for (const [id, b] of Object.entries((bench as unknown as { operators: Record<string, B> }).operators)) {
    if (!b.gear?.length || b.gear[0].count < 3) continue; // 표본이 너무 적은 건 제외
    const r = getBuildRecommendation(id);
    if (!r) continue;
    const ours = r.gear.map((g) => g.suitId);
    const rk = ours.indexOf(b.gear[0].suitId) + 1 || 99;
    n++;
    if (rk === 1) top1++;
    if (rk <= 3) top3++;
    if (rk > 1) lines.push(`${b.name.padEnd(7)} 커뮤 ${b.gear.slice(0, 2).map((g) => `${g.name}(${g.count})#${ours.indexOf(g.suitId) + 1}`).join(", ")} | 우리 ${r.gear.slice(0, 3).map((g) => g.suitName).join(", ")}`);
  }
  // 기준(2026-10-05): top1 17/26, top3 23/26 (장비 최적화 전 top1 11 · top3 20)
  expect(top3).toBeGreaterThanOrEqual(22);
  expect(top1).toBeGreaterThanOrEqual(16);
  console.log(`[장비] n=${n} top1=${top1} top3=${top3}\n` + lines.join("\n"));
});
