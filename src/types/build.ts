// data/combat/weapons.json · gear.json 타입 (scripts/build-combat-data.py)
import type { Blackboard } from "@/types/combat";

export interface CombatWeapon {
  weaponId: string;
  name: string;
  rarity: number;
  weaponType: number;
  /** 레벨 1~90 기초 공격력 */
  baseAtk: number[];
  /** [능력치 1, 능력치 2, 고유 특성] — 레벨 1~9 */
  skills: { skillId: string; name: string | null; desc: string | null; levels: { level: number; bb: Blackboard }[] }[];
  breakthroughs: { stage: number; level: number; skillLevelBounds: { lowerBound: number; upperBound: number }[] }[];
  /** 재련(잠재) 단계별 스킬 레벨 추가 범위 */
  potentials: { level: number; skillLevelExtraBounds: { lowerBound: number; upperBound: number }[] }[];
}

export interface GearAttr {
  attrType: number;
  /** 단조 0~3단계 값 */
  values: number[];
  /** 5 = 고정값, 6 = 배율(비율) */
  modifierType: number;
  /** attrType 0 일 때: 1 = 주요 능력치, 2 = 보조 능력치 */
  target?: number;
}

export interface GearPiece {
  name: string | null;
  minWearLv: number;
  suitId: string | null;
  /** 0 방어구 · 1 장갑 · 2 부품 */
  partType: number;
  attrs: GearAttr[];
}

export interface GearSuit {
  name: string | null;
  tier: number;
  pieces: string[];
  effects: { pieces: number; desc: string | null; bb: Blackboard }[];
}
