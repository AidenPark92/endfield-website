// 오퍼레이터 기본 능력치 계산 (순수 함수)
// 공식 출처: docs/combat/combat-mechanics.md §1·§7 — 능력치 보너스 = 1 + 0.005×주 능력치 + 0.002×보조 능력치 (✅)
import type { AttrName, OperatorStats, StatMilestones } from "@/types/game";

export const MAX_LEVEL = 90;
/** 돌파 단계가 바뀌는 레벨 (돌파 전·후 기본치는 같음) */
export const BREAK_LEVELS = [20, 40, 60, 80] as const;
export const ATTR_KEYS: Record<AttrName, "str" | "agi" | "int" | "wil"> = { 힘: "str", 민첩: "agi", 지능: "int", 의지: "wil" };

/** 주 능력치 1pt당 공격력 +0.5%, 보조 능력치 1pt당 +0.2% */
export const MAIN_ATTR_ATK = 0.005;
export const SUB_ATTR_ATK = 0.002;
/** 기본 치명타 피해 50% (combat-mechanics §7) */
export const BASE_CRIT_DMG = 0.5;

export interface StatsAtLevel {
  level: number;
  hp: number;
  atk: number;
  def: number;
  attrs: Record<AttrName, number>;
  main: number;
  sub: number;
  /** 능력치 보너스 배수 (1 + 0.005×주 + 0.002×보조) */
  attrBonus: number;
  /** 기본 공격력 × 능력치 보너스 — 무기·장비 제외 */
  atkWithAttr: number;
  critRate: number;
  critDmg: number;
}

export const clampLevel = (lv: number) => Math.min(MAX_LEVEL, Math.max(1, Math.round(lv)));

export function attrBonus(main: number, sub: number): number {
  return 1 + MAIN_ATTR_ATK * main + SUB_ATTR_ATK * sub;
}

export function statsAt(s: OperatorStats, level: number): StatsAtLevel {
  const lv = clampLevel(level);
  const i = lv - 1;
  const attrs: Record<AttrName, number> = { 힘: s.str[i], 민첩: s.agi[i], 지능: s.int[i], 의지: s.wil[i] };
  const main = attrs[s.mainAttr];
  const sub = attrs[s.subAttr];
  const bonus = attrBonus(main, sub);
  return {
    level: lv,
    hp: s.hp[i],
    atk: s.atk[i],
    def: s.def[i],
    attrs,
    main,
    sub,
    attrBonus: bonus,
    atkWithAttr: s.atk[i] * bonus,
    critRate: s.critRate,
    critDmg: BASE_CRIT_DMG,
  };
}

/** 공식 위키 6개 레벨(1/20/40/60/80/90) 값만 있을 때. 그 사이 레벨은 추측하지 않고 undefined */
export function milestoneStatsAt(m: StatMilestones, level: number): StatsAtLevel | undefined {
  const i = m.levels.indexOf(level);
  if (i < 0) return undefined;
  const attrs: Record<AttrName, number> = { 힘: m.str[i], 민첩: m.agi[i], 지능: m.int[i], 의지: m.wil[i] };
  const main = attrs[m.mainAttr];
  const sub = attrs[m.subAttr];
  const bonus = attrBonus(main, sub);
  return {
    level,
    hp: m.hp[i],
    atk: m.atk[i],
    def: 0, // TODO: 위키 레벨 표에 방어력 없음 — 게임 테이블 기준 오퍼레이터 기본 방어력은 0
    attrs,
    main,
    sub,
    attrBonus: bonus,
    atkWithAttr: m.atk[i] * bonus,
    critRate: 0.05, // combat-mechanics §7 기본 치명률
    critDmg: BASE_CRIT_DMG,
  };
}
