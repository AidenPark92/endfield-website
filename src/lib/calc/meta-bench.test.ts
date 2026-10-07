// 베스트 조합 검증: 해외 공략 사이트 메타 조합(data/benchmarks/meta-teams.json)이 전체 조합 중 몇 위인지 — 회귀 방지용 하한
import { expect, test } from "vitest";
import { allTeams, teamScore } from "@/lib/data";
import meta from "@data/benchmarks/meta-teams.json";

test("메타 조합 순위", { timeout: 900000 }, () => {
  const key = (ids: string[]) => [...ids].sort().join("+");
  const all = allTeams().filter((t) => !t.ids.includes("3"));
  const scored = all.map((t) => ({ k: key(t.ids), ids: t.ids, s: teamScore(t.ids) })).sort((a, b) => b.s - a.s);
  const rank = new Map(scored.map((x, i) => [x.k, i + 1]));
  let lg = 0;
  let lgCore = 0;
  for (const m of meta.teams) {
    const r = rank.get(key(m.ids))!;
    const withCore = scored.filter((x) => x.ids.includes(m.core));
    lg += Math.log(r);
    lgCore += Math.log(withCore.findIndex((x) => x.k === key(m.ids)) + 1);
  }
  const geo = Math.exp(lg / meta.teams.length);
  const geoCore = Math.exp(lgCore / meta.teams.length);
  console.log(`[메타 조합 ${meta.teams.length}개] 전체 ${scored.length}개 중 기하평균 ${geo.toFixed(0)}위 · 그 딜러 조합 중 ${geoCore.toFixed(1)}위`);
  // 기준(2026-10-06): 이전 모델 4823위 / 868위 → 팀 시뮬레이터 1989위 / 268위
  expect(geo).toBeLessThan(2600);
  expect(geoCore).toBeLessThan(360);
  // 해외 1위 조합(장방이·펠리카·아크라이트·리노)은 상위 50 안
  expect(rank.get(key(["838", "1", "7", "1041"]))!).toBeLessThanOrEqual(50);
});
