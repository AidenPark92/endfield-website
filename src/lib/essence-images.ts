// 기질 이미지 매핑 (public/essence/*.webp, 원본: src/images/기질/*.png)
//
// 5성 '무결 기질'은 스킬 속성 문양이 들어간 변형이 있고, 문양이 없으면 기본 무결 기질 이미지를 쓴다.
// 4성(안정/세련/순수)은 최대 속성까지 올릴 수 없어 뉴비용으로만 쓰인다.

/** 스킬 속성 id → 5성 무결 기질 이미지. 이미지가 없는 속성은 기본 무결 기질로 대체 */
const SKILL_IMAGE: Record<string, string> = {
  assault: "5-assault",
  suppress: "5-suppress",
  pursuit: "5-pursuit",
  crush: "5-crush",
  technique: "5-technique",
  burst: "5-burst",
  flow: "5-flow",
  morale: "5-morale",
  pain: "5-pain",
  medic: "5-medic",
  fracture: "5-fracture",
  brutal: "5-brutal",
  dark: "5-dark",
  // TODO: 효율(efficiency) 무결 기질 이미지가 아직 없음 → 기본 이미지로 대체
};

/** 5성 무결 기질 이미지 경로 (스킬 속성이 없거나 이미지가 없으면 기본 이미지) */
export function essenceImage(skill: string | null | undefined): string {
  return `/essence/${(skill && SKILL_IMAGE[skill]) || "5-base"}.webp`;
}

export interface LowTierEssence {
  id: "stable" | "refined" | "pure";
  name: string;
  image: string;
}

/** 4성 기질 — 뉴비용. TODO: 어떤 속성이 나오는지(속성 매핑)는 자료 확인 필요 */
export const LOW_TIER_ESSENCES: LowTierEssence[] = [
  { id: "stable", name: "안정 기질", image: "/essence/4-stable.webp" },
  { id: "refined", name: "세련 기질", image: "/essence/4-refined.webp" },
  { id: "pure", name: "순수 기질", image: "/essence/4-pure.webp" },
];
