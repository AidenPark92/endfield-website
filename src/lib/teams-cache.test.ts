// 베스트 조합 캐시(data/generated/teams.json)가 현재 계산 코드·데이터와 맞는지 — 실패하면 `npm run teams:build`
import { expect, test } from "vitest";
import { inputsHash, readTeamsCache, TEAMS_CACHE_FILE } from "./teams-cache";
import { operators } from "./data";

test("베스트 조합 캐시가 최신", () => {
  const c = readTeamsCache();
  expect(c, `${TEAMS_CACHE_FILE} 가 없거나 오래됨 (현재 해시 ${inputsHash()}) → npm run teams:build`).toBeDefined();
  expect(c!.overall.length).toBeGreaterThan(0);
  for (const o of operators) expect(c!.byOperator[o.id], o.id).toBeDefined();
});
