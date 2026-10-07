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
  /** 전신 일러스트 (public/operators) */
  image?: string;
  /** 작은 초상화 (public/operators/face) */
  face?: string;
  profile?: OperatorProfile;
  /** 레벨별 기본 능력치 곡선 (data/operator-stats.json, 게임 테이블) — 추출 이후 출시 캐릭터는 없음 */
  stats?: OperatorStats;
  /** 레벨 1/20/40/60/80/90 능력치 (data/operator-details.json, 공식 위키) — 전원 있음 */
  statMilestones?: StatMilestones;
}

export type AttrName = "힘" | "민첩" | "지능" | "의지";

/** 게임 테이블에서 추출한 캐릭터 기본치 (무기·장비·잠재·재능 미포함). 배열 인덱스 0 = 레벨 1 */
export interface OperatorStats {
  charId: string;
  mainAttr: AttrName;
  subAttr: AttrName;
  critRate: number;
  hp: number[];
  atk: number[];
  def: number[];
  str: number[];
  agi: number[];
  int: number[];
  wil: number[];
}

export type OperatorClass = "가드" | "캐스터" | "스트라이커" | "뱅가드" | "디펜더" | "서포터";

/** 위키 오퍼레이터 상세의 기본 정보 (data/operator-profiles.json) */
export interface OperatorProfile {
  class: OperatorClass;
  gender: string;
  birthday: string;
  race: string;
  cv: { ko: string; ja: string; en: string; zh: string };
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

/** 공식 위키 '레벨 증가' 표 — 레벨 1/20/40/60/80/90 */
export interface StatMilestones {
  levels: number[];
  mainAttr: AttrName;
  subAttr: AttrName;
  str: number[];
  agi: number[];
  int: number[];
  wil: number[];
  atk: number[];
  hp: number[];
}

export interface MaterialCount {
  item: string;
  count: number;
}

/** 스킬 랭크별 수치 한 줄 — 숫자로 읽히면 values + unit, 위키 표기 오류 등으로 못 읽으면 raw */
export interface SkillParam {
  label: string;
  values?: number[];
  unit?: string;
  raw?: string[];
}

export type SkillType = "일반 공격" | "배틀 스킬" | "연계 스킬" | "궁극기";

export interface OperatorSkill {
  type: SkillType;
  name: string;
  description: string;
  /** RANK1~RANK9, 마스터리I~III */
  ranks: string[];
  params: SkillParam[];
  materials: { rank: string; materials: MaterialCount[] }[];
}

export interface OperatorTalent {
  category: "재능 배열" | "오퍼레이터 재능" | "인프라 스킬" | "정예화" | "장비 조합";
  name: string;
  stages: { label: string; effect: string; conditions: string[]; materials: MaterialCount[] }[];
}

/** 공식 위키 오퍼레이터 상세 (data/operator-details.json) — 데미지·육성 계산의 원본 */
export interface OperatorDetails {
  name: string;
  stats: StatMilestones;
  levelMaterials: { from: number; to: number; materials: MaterialCount[] }[];
  skills: OperatorSkill[];
  talents: OperatorTalent[];
  potentials: { level: number; name: string; effect: string }[];
}
