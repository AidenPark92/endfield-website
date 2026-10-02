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
  /** 회전 연출 영상 경로 (확장자 제외 — .webm / .mp4 둘 다 있음) */
  video?: string;
  /** 영상 첫 프레임 (public/weapons/poster) */
  poster?: string;
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
  /** 전신 일러스트 (public/operators) */
  image?: string;
  /** 작은 초상화 (public/operators/face) */
  face?: string;
  profile?: OperatorProfile;
}

export type OperatorClass = "가드" | "캐스터" | "스트라이커" | "뱅가드" | "디펜더" | "서포터";

/** 위키 오퍼레이터 상세의 기본 정보 (data/operator-profiles.json) */
export interface OperatorProfile {
  class: OperatorClass;
  gender: string;
  birthday: string;
  race: string;
  cv: { ko: string; ja: string; en: string; zh: string };
  skills: { type: string; name: string }[];
  specialties: { name: string; title: string }[];
  hobbies: { name: string; title: string }[];
  /** 위키 소개를 바탕으로 사이트에서 쓴 요약 */
  summary: string;
  /** 원문 스토리가 있는 공식 위키 상세 페이지 */
  wiki: string;
}

/** 기질 파밍 지역 (부가 속성 8개 + 스킬 속성 8개 풀) */
export interface EssenceRegion {
  id: string;
  name: string;
  area: string;
  extra: string[];
  skill: string[];
}
