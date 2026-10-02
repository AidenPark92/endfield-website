// 게임 데이터 공통 타입 (/data/*.json 구조와 1:1 대응)

/** 기질 속성 분류: 기초 속성 / 부가 속성 / 스킬 속성 */
export type StatCategory = "base" | "extra" | "skill";

export interface StatDef {
  id: string;
  label: string;
}

export interface EssenceStats {
  base: StatDef[];
  extra: StatDef[];
  skill: StatDef[];
}

/** 무기가 원하는 기질 조합 (3성 무기는 일부 슬롯이 null) */
export interface EssenceTarget {
  base: string | null;
  extra: string | null;
  skill: string | null;
}

export type WeaponType = "한손검" | "양손검" | "장병기" | "권총" | "아츠 유닛";

export interface Weapon {
  id: string;
  name: string;
  rarity: number;
  type: WeaponType;
  essence: EssenceTarget;
  /** 무기 고유 스킬 이름 (예: "어둠 · 울부짖는 불길") */
  trait: string;
  cover: string;
  /** 사이트 내 무기 이미지 (public/weapons, 없으면 undefined) */
  image?: string;
  note?: string;
}

export interface Operator {
  id: string;
  name: string;
  rarity: number;
  weaponType: WeaponType;
  element: string;
  faction: string;
  mainStat: string;
  subStat: string;
  /** 공식 위키 '게임 내 추천' — skill: 스킬 조합, attribute: 속성 조합 */
  recommendedWeapons: { skill: string[]; attribute: string[] };
  cover: string;
}

/** 기질 파밍 지역 (부가 속성 8개 + 스킬 속성 8개 풀) */
export interface EssenceRegion {
  id: string;
  name: string;
  area: string;
  extra: string[];
  skill: string[];
}
