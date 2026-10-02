// 무기 ↔ 오퍼레이터 매칭 (순수 함수)
// 출처: 공식 위키 오퍼레이터 상세 > 무기 추천 > 게임 내 추천 (data/operators.json recommendedWeapons)
//  - skill: '스킬 조합' 추천 (앞쪽이 1순위)
//  - attribute: '속성 조합' 추천

import type { Operator } from "@/types/game";

export interface WeaponUser {
  operatorId: string;
  /** 어떤 추천 목록에 들어 있는지 */
  kind: "skill" | "attribute";
  /** 해당 목록에서의 순서 (0 = 1순위) */
  rank: number;
}

/** 정렬: 스킬 조합 1순위 → 스킬 조합 → 속성 조합, 같은 조건이면 등급 높은 순 */
export function buildWeaponUsers(operators: Pick<Operator, "id" | "rarity" | "recommendedWeapons">[]): Record<string, WeaponUser[]> {
  const map: Record<string, WeaponUser[]> = {};
  const rarity = new Map(operators.map((o) => [o.id, o.rarity]));
  for (const o of operators) {
    for (const kind of ["skill", "attribute"] as const) {
      o.recommendedWeapons[kind].forEach((weaponId, rank) => {
        const list = (map[weaponId] ??= []);
        // 같은 오퍼레이터가 두 목록에 다 있으면 더 앞선 쪽만 남김
        if (list.some((u) => u.operatorId === o.id)) return;
        list.push({ operatorId: o.id, kind, rank });
      });
    }
  }
  const score = (u: WeaponUser) => (u.kind === "skill" ? 0 : 10) + Math.min(u.rank, 9);
  for (const list of Object.values(map)) {
    list.sort((a, b) => score(a) - score(b) || rarity.get(b.operatorId)! - rarity.get(a.operatorId)!);
  }
  return map;
}

export function userLabel(u: WeaponUser): string {
  if (u.kind === "skill") return u.rank === 0 ? "추천 1순위" : "스킬 조합 추천";
  return "속성 조합 추천";
}
