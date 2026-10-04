// data/combat/*.json 타입 — 게임 클라이언트 데이터 기반 (scripts/build-combat-data.py)
import type { AttrName } from "@/types/game";

export type Blackboard = Record<string, number | string>;
export interface BbEntry {
  key: string;
  value: number | string;
}

/** 잠재·재능·세트 효과의 효과 한 줄 (게임 effectData.dataList 그대로) */
export interface EffectData {
  modifyType: number;
  attachBuff?: { blackboard?: BbEntry[]; buffId?: string };
  attachSkill?: { blackboard?: BbEntry[] };
  attrModifier?: { attrType: number; attrValue: number; modifierType: number };
  skillBbModifier?: { skillId?: string; bbKey?: string; floatValue: number; modifyType: number };
  skillParamModifier?: { skillId?: string; paramType: number; paramValue: number; modifyType: number };
}

export interface SkillLevel {
  level: number;
  costType?: number;
  costValue?: number;
  coolDown?: number;
  bb: Blackboard;
  /** 게임 화면에 표시되는 수치 (라벨 + 표시 문자열) */
  display: { label: string | null; value: string }[];
}

export interface CombatSkill {
  skillId: string;
  /** attack1, power_attack, normal_skill, combo_skill, ultimate_skill ... */
  part: string;
  levels: SkillLevel[];
}

/** 능력치 조건에 따라 스킬 형태가 바뀌는 오퍼레이터(결: 진결 · 지혜 / 진결 · 의지)의 형태별 정보 */
export interface SkillForm {
  /** 예: "진결 · 지혜" */
  name: string;
  /** 예: "지능 수치 ≥ 의지 수치, 진결 · 지혜 활성화됨." */
  condition: string;
  /** 형태별 설명 (조건 줄 제외) */
  desc: string;
  /** 형태별 레벨 1~12 수치 (공식 위키 표 기준) */
  rows: { label: string; values: string[] }[];
}

export interface SkillGroup {
  type: "일반 공격" | "배틀 스킬" | "연계 스킬" | "궁극기";
  groupId: string;
  name: string | null;
  desc: string | null;
  skills: CombatSkill[];
  /** 형태가 둘 이상인 스킬만 */
  forms?: SkillForm[];
}

export interface CombatPotential {
  level: number;
  name: string | null;
  desc: string | null;
  effects: EffectData[] | null;
}

export interface CombatPassive {
  nodeId: string;
  index: number;
  level: number;
  breakStage: number;
  name: string | null;
  desc: string | null;
  effects: EffectData[] | null;
}

export interface CombatAttrNode {
  nodeId: string;
  breakStage: number;
  favorability: number;
  title: string | null;
  desc: string | null;
  attrs: { attrType: number; value: number; modifierType: number }[];
}

export interface CombatCharacter {
  charId: string;
  name: string;
  /** 게임 내 전투 태그 (전기 부착, 띄우기, 치유 ...) */
  battleTags?: { id: string; name: string }[];
  rarity: number;
  element: string;
  mainAttr: AttrName;
  subAttr: AttrName;
  critRate: number;
  skillGroups: SkillGroup[];
  potentials: CombatPotential[];
  talents: { attributes: CombatAttrNode[]; passives: CombatPassive[] };
  /** 형태 스킬이 있을 때 기본 능력치(레벨 90, 무기·장비 제외) 기준 기본 형태 이름 */
  defaultForm?: string;
  /** 형태 판정용 기본 능력치 (레벨 90, 무기·장비 제외) */
  formAttrs?: { 지능: number; 의지: number };
}
