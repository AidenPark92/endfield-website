// 장비 탐색: 세트 밖 후보를 상위 N개로 줄여도 전체 탐색과 같은 답인지 (모든 오퍼레이터 · 상위 3세트)
import { expect, test } from "vitest";
import { GEAR_SEARCH } from "./weapon-value";
import { getBuildRecommendation, operators, resetBuildCache } from "@/lib/data";

test.skipIf(!process.env.FULL_SEARCH)("세트 밖 후보 축소 = 전체 탐색", { timeout: 3600000 }, () => {
  const ids = operators.map((o) => o.id);
  const key = (id: string) => getBuildRecommendation(id)?.gear.slice(0, 3).map((g) => `${g.suitId}:${g.pieces.map((p) => p.id).join(",")}`) ?? [];
  const fast = Object.fromEntries(ids.map((id) => [id, key(id)]));
  const saved = GEAR_SEARCH.offCandidates;
  GEAR_SEARCH.offCandidates = 999;
  resetBuildCache();
  const diff: string[] = [];
  for (const id of ids) {
    const full = key(id);
    if (JSON.stringify(full) !== JSON.stringify(fast[id])) diff.push(`${id}: ${fast[id].join(" | ")}  ≠  ${full.join(" | ")}`);
  }
  GEAR_SEARCH.offCandidates = saved;
  resetBuildCache();
  console.log(diff.join("\n") || "모두 같음");
  expect(diff).toEqual([]);
});
