import type { EssenceStats, StatCategory } from "@/types/game";

/** 기질 속성 id → 표시 이름 조회기 */
export function makeStatLabel(stats: EssenceStats) {
  const map = new Map<string, string>();
  (["base", "extra", "skill"] as const).forEach((c) => stats[c].forEach((s) => map.set(`${c}:${s.id}`, s.label)));
  return (category: StatCategory, id: string) => map.get(`${category}:${id}`) ?? id;
}

export type StatLabelFn = ReturnType<typeof makeStatLabel>;

