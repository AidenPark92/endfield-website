// 베스트 조합 검증: 해외 공략 사이트 메타 조합(data/benchmarks/meta-teams.json)이 전체 조합 중 몇 위인지 — 회귀 방지용 하한
import { expect, test } from "vitest";
import { allTeams, teamScore } from "@/lib/data";
import meta from "@data/benchmarks/meta-teams.json";
import community from "@data/benchmarks/endfieldtools-team-gear.json";

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
  // 2026-10-07: 치유 보정(×0.9) 제거 + 팀 무기·장비(직업군 역할, 무기·세트 팀 효과 전달, 추가 타격) → 1641위 / 213위
  // 2026-10-08: 시너지 정렬(범용 멤버 −30%) → 약 305위 / 38위
  expect(geo).toBeLessThan(450);
  expect(geoCore).toBeLessThan(60);
  // 해외 1위 조합(장방이·펠리카·아크라이트·리노)은 상위 3 안 (2026-10-08: 1위)
  expect(rank.get(key(["838", "1", "7", "1041"]))!).toBeLessThanOrEqual(3);
  // 커뮤니티 공개 팀(endfieldtools.dev) 상위 30개 조합 — 기하평균 (2026-10-08: 약 261위, 시너지 정렬 전 1448위)
  const comm = (community as unknown as { teams: { members: { id: string }[] }[] }).teams.map((t) => t.members.map((m) => m.id)).filter((ids) => !ids.includes("3"));
  const geoComm = Math.exp(comm.reduce((a, ids) => a + Math.log(rank.get(key(ids))!), 0) / comm.length);
  console.log(`[커뮤니티 팀 ${comm.length}개] 기하평균 ${geoComm.toFixed(0)}위`);
  expect(geoComm).toBeLessThan(400);
});
