// 최적화 빌드 계산 (순수 함수)
// 공식: docs/combat/combat-mechanics.md §7
//   공격력 = (캐릭터 기초 공격력 + 무기 기초 공격력) × (1 + 공격력%) × 능력치 보너스(1 + 0.5%×주 + 0.2%×보조)
//   스킬 피해 지수 = 공격력 × (1 + 속성 피해% + 스킬 종류 피해% + 모든 피해%) × (1 + 치명타 확률 × 치명타 피해)
// 방어·저항·스킬 배율은 같은 오퍼레이터끼리 비교할 때 약분되므로 넣지 않는다 → "상대 비교용 지수"
// ⚠️ 조건부 효과(…할 때, …후, …동안)는 넣지 않는다. 무기 고유 특성·세트 효과는 첫 줄의 조건 없는 효과만 반영
// TODO: 고정 공격력 가산 위치(능력치 보너스 전/후)는 출처 간 표기 차이 — 현재 데이터엔 고정 공격력 옵션이 거의 없어 영향 작음
import type { AttrName } from "@/types/game";
import type { Blackboard } from "@/types/combat";
import type { CombatWeapon, GearPiece, GearSuit } from "@/types/build";

export type DmgType = "basic" | "battle" | "combo" | "ult";
export const DMG_TYPES: DmgType[] = ["battle", "combo", "ult"];
export const DMG_TYPE_LABEL: Record<DmgType, string> = { basic: "일반 공격", battle: "배틀 스킬", combo: "연계 스킬", ult: "궁극기" };
export type Elem = "phys" | "fire" | "pulse" | "cryst" | "natural";
export const ELEM_OF: Record<string, Elem> = { 물리: "phys", 열기: "fire", 전기: "pulse", 냉기: "cryst", 자연: "natural" };

/** 빌드가 주는 능력치 합 */
export interface StatBag {
  str: number;
  agi: number;
  int: number;
  wil: number;
  /** 주 능력치에 더해지는 값 (무기 '주요 능력치 증가', 장비 '주요 능력치') */
  main: number;
  /** 보조 능력치에 더해지는 값 (장비 '보조 능력치') */
  sub: number;
  /** 주·보조 능력치 배율 (장비 '주요/보조 능력치 +x%') — TODO: 고정값 합산 후 곱하는지 인게임 확인 */
  mainPct: number;
  subPct: number;
  atkPct: number;
  flatAtk: number;
  critRate: number;
  critDmg: number;
  dmg: Record<Elem | "arts" | "all" | DmgType | "ultMode", number>;
  artsIntensity: number;
  ultGain: number;
  /** 연계 스킬 쿨타임 감소 (0.15 = 15%) — 개척·청파 세트 */
  comboCdr: number;
  /** 적이 받는 피해 증가 (이 오퍼레이터 속성에 해당하는 것만, 받는 피해 증가·취약 구간) */
  taken: number;
  /** 생존·치유 (피해 지수 밖, 무기 평가의 치유·생존 지표에서 사용) */
  healEff: number;
  hpPct: number;
  defPct: number;
  shieldEff: number;
  /** 스킬 종류별로만 붙는 치명타 확률·피해 (오퍼레이터 자체 버프: 로시 궁극기 치명 피해, 이본 궁극기 모드 치명 스택) */
  critBy: Record<CritScope, number>;
  critDmgBy: Record<CritScope, number>;
}

export type CritScope = "battle" | "combo" | "ult" | "ultMode";
const zeroScope = (): Record<CritScope, number> => ({ battle: 0, combo: 0, ult: 0, ultMode: 0 });

export const emptyBag = (): StatBag => ({
  str: 0,
  agi: 0,
  int: 0,
  wil: 0,
  main: 0,
  sub: 0,
  mainPct: 0,
  subPct: 0,
  atkPct: 0,
  flatAtk: 0,
  critRate: 0,
  critDmg: 0,
  dmg: { phys: 0, fire: 0, pulse: 0, cryst: 0, natural: 0, arts: 0, all: 0, basic: 0, battle: 0, combo: 0, ult: 0, ultMode: 0 },
  artsIntensity: 0,
  ultGain: 0,
  comboCdr: 0,
  taken: 0,
  healEff: 0,
  hpPct: 0,
  defPct: 0,
  shieldEff: 0,
  critBy: zeroScope(),
  critDmgBy: zeroScope(),
});

export function addBag(a: StatBag, b: StatBag): StatBag {
  const r = { ...a, dmg: { ...a.dmg }, critBy: { ...a.critBy }, critDmgBy: { ...a.critDmgBy } };
  for (const k of Object.keys(r.critBy) as CritScope[]) {
    r.critBy[k] += b.critBy?.[k] ?? 0;
    r.critDmgBy[k] += b.critDmgBy?.[k] ?? 0;
  }
  for (const k of ["str", "agi", "int", "wil", "main", "sub", "mainPct", "subPct", "atkPct", "flatAtk", "critRate", "critDmg", "artsIntensity", "ultGain", "comboCdr", "taken", "healEff", "hpPct", "defPct", "shieldEff"] as const) r[k] += b[k];
  for (const k of Object.keys(r.dmg) as (keyof StatBag["dmg"])[]) r.dmg[k] += b.dmg[k];
  return r;
}

/** 장비 attrType → 능력치 (data/combat/attr-types.json 번호). attrType 0 은 target(1 주요 / 2 보조) + modifierType(5 고정 / 6 배율) */
export function bagFromAttrType(attrType: number, v: number, target = 0, modifierType = 5): StatBag {
  const b = emptyBag();
  if (attrType === 0) {
    if (target === 1) {
      if (modifierType === 6) b.mainPct += v;
      else b.main += v;
    }
    if (target === 2) {
      if (modifierType === 6) b.subPct += v;
      else b.sub += v;
    }
    return b;
  }
  switch (attrType) {
    case 2: b.flatAtk += v; break;
    case 9: b.critRate += v; break;
    case 10: b.critDmg += v; break;
    case 17: b.dmg.basic += v; break;
    case 28: b.dmg.ult += v; break;
    case 32: b.dmg.battle += v; break;
    case 33: b.dmg.combo += v; break;
    case 39: b.str += v; break;
    case 40: b.agi += v; break;
    case 41: b.int += v; break;
    case 42: b.wil += v; break;
    case 44: b.ultGain += v; break;
    case 50: b.dmg.phys += v; break;
    case 51: b.dmg.fire += v; break;
    case 52: b.dmg.pulse += v; break;
    case 53: b.dmg.cryst += v; break;
    case 54: b.dmg.natural += v; break;
    case 87: b.artsIntensity += v; break;
    // 1 생명력, 3 방어력, 29 치유, 61 불균형 대상 피해(조건부) 등은 피해 지수에 넣지 않음
  }
  return b;
}

/** 무기 능력치 스킬·세트·특성 blackboard 키 → 능력치. 모르는 키는 무시(조건부·비전투) */
export function bagFromKey(key: string, v: number): StatBag | undefined {
  const b = emptyBag();
  switch (key) {
    case "str": case "str_up": b.str += v; break;
    case "agi": case "agi_up": b.agi += v; break;
    case "wisd": case "wisd_up": b.int += v; break;
    case "will": case "will_up": b.wil += v; break;
    case "mainattr": b.main += v; break;
    case "atk": b.atkPct += v; break;
    case "crirate": case "crit_up": b.critRate += v; break;
    case "phydam": case "phy_dmg_up": b.dmg.phys += v; break;
    case "firedam": case "fire_dmg_up": b.dmg.fire += v; break;
    case "electrondam": case "pulse_dmg_up": b.dmg.pulse += v; break;
    case "crystdam": case "cryst_dmg_up": b.dmg.cryst += v; break;
    case "naturaldam": case "nature_dmg_up": b.dmg.natural += v; break;
    case "spelldam": case "spell_dmg_up": b.dmg.arts += v; break;
    case "physpell": case "phy_spell_up": b.artsIntensity += v; break;
    case "usgs": case "ultimate_gain_up": b.ultGain += v; break;
    case "heal": case "heal_up": b.healEff += v; break;
    case "hp": case "hp_up": b.hpPct += v; break;
    // "모든 스킬 피해" = 배틀·연계·궁극기 (일반 공격 제외)
    case "skill_dmg_up": b.dmg.battle += v; b.dmg.combo += v; b.dmg.ult += v; break;
    case "dmg_up": b.dmg.all += v; break;
    default: return undefined;
  }
  return b;
}

const CONDITION = /때|후|경우|동안|마다|이상일|이하일|미만|초과|중첩|스택/;

/**
 * 설명 문구에서 "조건 없는 효과"에 쓰인 키만 고른다.
 * 줄 단위로 보고, 조건 표현(…할 때, …후, …동안 등)이 처음 나온 줄부터는 버린다.
 * 예) "열기 피해 +{fire_dmg_up}\n장착자가 궁극기를 사용했을 때, …" → fire_dmg_up 만
 */
export function unconditionalKeys(desc: string | null | undefined): string[] {
  if (!desc) return [];
  const keys: string[] = [];
  for (const raw of desc.split("\n")) {
    const line = raw.replace(/<[^>]+>/g, "").replace(/^\d+개 세트 효과:\s*/, "");
    if (!line.trim()) continue;
    if (CONDITION.test(line)) break;
    for (const m of line.matchAll(/\{([a-z_]+)[^}]*\}/gi)) keys.push(m[1]);
  }
  return keys;
}

/** 무기 하나의 능력치 (만렙·돌파 완료, 기질로 스킬 레벨 상한까지, 재련 r) */
export function weaponBag(w: CombatWeapon, refine = 0): { bag: StatBag; atk: number; levels: number[]; ignoredTrait: boolean } {
  const last = w.breakthroughs.at(-1)!;
  const extra = refine > 0 ? w.potentials.find((p) => p.level === refine)?.skillLevelExtraBounds : undefined;
  const levels = w.skills.map((_, i) => Math.min(9, last.skillLevelBounds[i].upperBound + (extra?.[i]?.upperBound ?? 0)));
  let bag = emptyBag();
  w.skills.forEach((s, i) => {
    const bb = s.levels[levels[i] - 1]?.bb ?? {};
    const keys = i < w.skills.length - 1 ? Object.keys(bb) : unconditionalKeys(s.desc);
    for (const k of keys) {
      const add = bagFromKey(k, Number(bb[k]));
      if (add) bag = addBag(bag, add);
    }
  });
  const trait = w.skills.at(-1);
  const ignoredTrait = !!trait && Object.keys(trait.levels[0]?.bb ?? {}).length > unconditionalKeys(trait.desc).length;
  return { bag, atk: w.baseAtk[w.baseAtk.length - 1], levels, ignoredTrait };
}

export function gearBag(p: GearPiece, forge = 0): StatBag {
  let bag = emptyBag();
  for (const a of p.attrs) bag = addBag(bag, bagFromAttrType(a.attrType, a.values[Math.min(forge, a.values.length - 1)], a.target, a.modifierType));
  return bag;
}

export function suitBag(s: GearSuit): StatBag {
  let bag = emptyBag();
  const e = s.effects.find((x) => x.pieces === 3) ?? s.effects[0];
  if (!e) return bag;
  for (const k of unconditionalKeys(e.desc)) {
    const add = bagFromKey(k, Number((e.bb as Blackboard)[k]));
    if (add) bag = addBag(bag, add);
  }
  return bag;
}

export interface OperatorBase {
  element: string;
  mainAttr: AttrName;
  subAttr: AttrName;
  /** 레벨 90 기초 공격력 */
  atk: number;
  attrs: Record<AttrName, number>;
  critRate: number;
  /** 스킬 회전 (있으면 피해 기대 지수를 초당 기대값으로 계산) */
  rotation?: Rotation;
}

/**
 * 스킬 회전 — combat-mechanics.md §2 기준, 파티와 무관한 "혼자 기준" 정규화
 * - 배틀 스킬: SP 자연 회복 1칸/12.5초 ✅ → 초당 1/12.5회 (이 오퍼레이터가 SP를 다 쓴다고 가정)
 * - 연계 스킬: 쿨타임마다 1회 (발동 조건은 충족된다고 가정 — 조합 효과 제외)
 * - 궁극기: 필요 에너지 ÷ 초당 에너지(배틀 스킬 6.5 × 횟수 + 본인 연계 10 × 횟수) × 1/(1+충전 효율), 쿨타임보다 짧을 수 없음
 * - weight: 스킬 설명 표의 피해 배율 합 (만렙 기준) — 1회 사용 피해의 크기
 */
export interface Rotation {
  battleRate: number;
  comboRate: number;
  ultCost: number;
  ultCooldown: number;
  comboEnergy: number;
  weight: Record<"battle" | "combo" | "ult", number> & {
    /** 일반 공격 1세트(최대 단계) 피해 배율 합 — 처형·낙하 제외 */
    basic?: number;
  };
  /**
   * "~로 간주" 피해: 스킬 설명에 다른 종류로 간주한다고 적힌 부분(미브 개천 = 강타 피해, 카뮤 추적 = 연계 스킬)
   * from 스킬의 빈도로 쓰고, to 종류의 피해 보너스를 받음. to = "anomaly" 면 이상 피해(아츠 강도)로
   */
  moved?: { from: "battle" | "combo" | "ult"; to: DmgType | "anomaly"; weight: number; name: string; synced?: boolean }[];
}

/**
 * TODO(실측): 일반 공격 1세트(최대 단계)에 걸리는 시간(초). 게임 데이터에 애니메이션 길이가 없어 가정값.
 * 비조작 오퍼레이터도 자동 일반 공격을 하므로(combat-mechanics §1) 모든 오퍼레이터에 같은 가정 적용
 */
export const BASIC_CHAIN_SECONDS = 4;
/**
 * 일반 공격 피해를 점수에 넣을지 — 1세트 시간이 실측되지 않아 기본값은 넣지 않음 (데이터 규칙: 미확인 값은 기본 미적용)
 * 4초 가정으로 넣으면 일반 공격이 피해의 70%까지 차지해 공격력%·피해% 무기가 과대평가됨 (미브 사례)
 */
export const INCLUDE_BASIC_ATTACK = false;

export const SP_REGEN_INTERVAL = 12.5;
export const BATTLE_ULT_ENERGY = 6.5;

/**
 * 게임 데이터로 정해지지 않는 가정값 — 커뮤니티 빌드 합의(data/benchmarks)로 보정 (gear-calibrate.test, CALIBRATE=1)
 * - comboCdrRealized: 연계 스킬 쿨타임 감소가 실제 사용 빈도로 이어지는 비율 (연계는 발동 조건이 있어 쿨마다 쓰지 못함)
 * - stackRefresh: "지속 시간은 따로 계산" 문구가 없는 중첩 효과를 새 스택이 지속 시간을 갱신하는 방식으로 볼지
 * - critHitScale: 치명타 조건 발동 빈도 배율 (일반 공격 타수/초 실측 전)
 * - basicScale: 일반 공격 피해를 넣는 비율 (1 = 일반 공격 1세트를 BASIC_CHAIN_SECONDS마다 계속, 0 = 미반영)
 *   스킬 사이사이 일반 공격을 하므로 0은 스킬 피해 보너스를 과대평가, 1은 과소평가 — 실측 전이라 보정값 사용
 * - consumeDependency: "X를 소모"하는 오퍼레이터가 X 없이 쓸 때 잃는 피해 비율 (파티 장비 최적화의 상태 공급, lib/calc/party.ts)
 */
export const ASSUME = { comboCdrRealized: 1, stackRefresh: false, critHitScale: 2, basicScale: 0.5, consumeDependency: 0.3 };

/** 일반 공격 피해가 점수에 들어가는지 (INCLUDE_BASIC_ATTACK 또는 보정값 basicScale > 0) */
export const basicCounted = () => INCLUDE_BASIC_ATTACK || ASSUME.basicScale > 0;

export function rates(r: Rotation, ultGain: number, comboCdr = 0): Record<"battle" | "combo" | "ult", number> {
  // 연계 스킬 쿨타임 감소 → 쿨타임마다 쓴다고 보고 빈도 증가 (최대 70% 감소까지)
  const comboRate = r.comboRate / (1 - Math.min(0.7, Math.max(0, comboCdr * ASSUME.comboCdrRealized)));
  const energyPerSec = BATTLE_ULT_ENERGY * r.battleRate + r.comboEnergy * comboRate;
  const ultInterval = Math.max(r.ultCooldown, energyPerSec > 0 ? r.ultCost / (energyPerSec * (1 + ultGain)) : Infinity);
  return { battle: r.battleRate, combo: comboRate, ult: Number.isFinite(ultInterval) && ultInterval > 0 ? 1 / ultInterval : 0 };
}

export interface ScoreResult {
  atk: number;
  attrBonus: number;
  critRate: number;
  critDmg: number;
  /** 스킬 종류별 피해 지수 */
  byType: Record<DmgType, number>;
  /** 회전이 있으면 초당 피해 기대 지수 Σ(초당 횟수 × 피해 배율 × 종류별 지수), 없으면 배틀·연계·궁극기 평균 */
  overall: number;
  /** 초당 사용 횟수 (회전이 있을 때) */
  rates?: Record<"battle" | "combo" | "ult", number>;
  attrs: Record<AttrName, number>;
  dmgPct: Record<DmgType, number>;
  artsIntensity: number;
}

export function score(op: OperatorBase, weaponAtk: number, bag: StatBag): ScoreResult {
  const attrs: Record<AttrName, number> = {
    힘: op.attrs.힘 + bag.str,
    민첩: op.attrs.민첩 + bag.agi,
    지능: op.attrs.지능 + bag.int,
    의지: op.attrs.의지 + bag.wil,
  };
  attrs[op.mainAttr] = (attrs[op.mainAttr] + bag.main) * (1 + bag.mainPct);
  attrs[op.subAttr] = (attrs[op.subAttr] + bag.sub) * (1 + bag.subPct);
  const attrBonus = 1 + 0.005 * attrs[op.mainAttr] + 0.002 * attrs[op.subAttr];
  const atk = ((op.atk + weaponAtk) * (1 + bag.atkPct) + bag.flatAtk) * attrBonus;
  const el = ELEM_OF[op.element] ?? "phys";
  const elemDmg = bag.dmg[el] + (el !== "phys" ? bag.dmg.arts : 0) + bag.dmg.all;
  const critRate = Math.min(1, op.critRate + bag.critRate);
  const critDmg = 0.5 + bag.critDmg;
  const crit = 1 + critRate * critDmg;
  const types: DmgType[] = ["basic", "battle", "combo", "ult"];
  const dmgPct = Object.fromEntries(types.map((t) => [t, elemDmg + bag.dmg[t]])) as Record<DmgType, number>;
  const taken = 1 + bag.taken;
  const critOf = (k: CritScope | "basic") =>
    k === "basic" ? crit : 1 + Math.min(1, critRate + (bag.critBy?.[k] ?? 0)) * (critDmg + (bag.critDmgBy?.[k] ?? 0));
  const byType = Object.fromEntries(types.map((t) => [t, atk * (1 + dmgPct[t]) * critOf(t) * taken])) as Record<DmgType, number>;
  if (op.rotation) {
    const r = rates(op.rotation, bag.ultGain, bag.comboCdr);
    const w = op.rotation.weight;
    const totalW = w.battle + w.combo + w.ult;
    // 피해 배율 정보가 없으면 세 종류를 같은 크기로
    const weight = (t: "battle" | "combo" | "ult") => (totalW > 0 ? w[t] : 1);
    const basicScale = INCLUDE_BASIC_ATTACK ? 1 : ASSUME.basicScale;
    const basic = basicScale > 0 && op.rotation.weight.basic ? basicScale * (op.rotation.weight.basic / BASIC_CHAIN_SECONDS) * byType.basic : 0;
    // 궁극기 모드 안의 피해(synced)는 "궁극기 사용 시" 버프(dmg.ultMode)를 가동률 없이 전부 받음
    const ultModeMult = ((1 + dmgPct.basic + bag.dmg.ultMode) / (1 + dmgPct.basic)) * (critOf("ultMode") / crit);
    const moved = (op.rotation.moved ?? []).reduce(
      (s, m) => (m.to === "anomaly" ? s : s + r[m.from] * m.weight * byType[m.to] * (m.synced ? ultModeMult : 1)),
      0,
    );
    const overall = (["battle", "combo", "ult"] as const).reduce((s, t) => s + r[t] * weight(t) * byType[t], 0) + basic + moved;
    return { atk, attrBonus, critRate, critDmg, byType, overall, rates: r, attrs, dmgPct, artsIntensity: bag.artsIntensity };
  }
  const overall = DMG_TYPES.reduce((s, t) => s + byType[t], 0) / DMG_TYPES.length;
  return { atk, attrBonus, critRate, critDmg, byType, overall, attrs, dmgPct, artsIntensity: bag.artsIntensity };
}

/** 재능 배열(능력치 노드) 합 — 신뢰도·정예화 모두 완료 가정 */
export function talentBag(nodes: { attrs: { attrType: number; value: number }[] }[]): StatBag {
  let bag = emptyBag();
  for (const n of nodes) for (const a of n.attrs) bag = addBag(bag, bagFromAttrType(a.attrType, a.value));
  return bag;
}

export interface WeaponRank {
  id: string;
  name: string;
  rarity: number;
  score: ScoreResult;
  /** 1위 대비 % */
  relative: number;
  levels: number[];
  ignoredTrait: boolean;
}

export function rankWeapons(op: OperatorBase, base: StatBag, weapons: [string, CombatWeapon][], refine = 0): WeaponRank[] {
  const rows = weapons.map(([id, w]) => {
    const wb = weaponBag(w, refine);
    return { id, name: w.name, rarity: w.rarity, score: score(op, wb.atk, addBag(base, wb.bag)), levels: wb.levels, ignoredTrait: wb.ignoredTrait };
  });
  rows.sort((a, b) => b.score.overall - a.score.overall);
  const top = rows[0]?.score.overall || 1;
  return rows.map((r) => ({ ...r, relative: r.score.overall / top }));
}

export interface GearRank {
  suitId: string;
  suitName: string | null;
  /** [방어구, 장갑, 부품, 부품] */
  pieces: { id: string; name: string | null; partType: number; inSuit: boolean }[];
  /** 세트 효과를 해석한 기대 능력치 (조건부 효과는 가동률만큼) — 없으면 조건 없는 효과만 */
  setBag?: StatBag;
  score: ScoreResult;
  relative: number;
}

/**
 * 세트별 최적 장비 4칸(방어구 1 · 장갑 1 · 부품 2) — 세트 3개 이상 착용 조건.
 * 후보는 착용 레벨 70 이상(최고 등급) 장비, 단조 0단계 기준.
 * 세트 밖 1칸 후보는 칸마다 단독 점수 상위 8개만 본다(탐색량 축소).
 */
export function rankGear(
  op: OperatorBase,
  weaponAtk: number,
  base: StatBag,
  pieces: [string, GearPiece][],
  suits: [string, GearSuit][],
  forge = 0,
): GearRank[] {
  const pool = pieces.filter(([, p]) => p.minWearLv >= 70);
  const byId = new Map(pool);
  const pb = new Map(pool.map(([id, p]) => [id, gearBag(p, forge)]));
  const solo = (id: string) => score(op, weaponAtk, addBag(base, pb.get(id)!)).overall;
  const bySlot = (pred: (p: GearPiece) => boolean, slot: number) =>
    pool.filter(([, p]) => p.partType === slot && pred(p)).map(([id]) => id);
  const topOff = (slot: number) => bySlot(() => true, slot).sort((a, b) => solo(b) - solo(a)).slice(0, 8);
  const off = [topOff(0), topOff(1), topOff(2)];

  const results: GearRank[] = [];
  for (const [sid, suit] of suits) {
    const inSuit = (p: GearPiece) => p.suitId === sid;
    const sb = [bySlot(inSuit, 0), bySlot(inSuit, 1), bySlot(inSuit, 2)];
    if (!sb[0].length && !sb[1].length && sb[2].length < 2) continue;
    const setBonus = suitBag(suit);
    let best: { ids: string[]; s: ScoreResult } | undefined;
    // 칸: [방어구, 장갑, 부품, 부품]
    const cand = (slot: number, offSuit: boolean) => (offSuit ? off[slot] : sb[slot]);
    for (let offIdx = -1; offIdx < 4; offIdx++) {
      const body = cand(0, offIdx === 0);
      const hand = cand(1, offIdx === 1);
      const edcA = cand(2, offIdx === 2);
      const edcB = cand(2, offIdx === 3);
      for (const b of body)
        for (const h of hand)
          for (const e1 of edcA)
            for (const e2 of edcB) {
              if (e1 === e2 || (offIdx === -1 && e2 < e1)) continue;
              const ids = [b, h, e1, e2];
              const suitCount = ids.filter((id) => byId.get(id)!.suitId === sid).length;
              if (suitCount < 3) continue;
              let bag = addBag(base, setBonus);
              for (const id of ids) bag = addBag(bag, pb.get(id)!);
              const s = score(op, weaponAtk, bag);
              if (!best || s.overall > best.s.overall) best = { ids, s };
            }
    }
    if (best)
      results.push({
        suitId: sid,
        suitName: suit.name,
        pieces: best.ids.map((id) => {
          const p = byId.get(id)!;
          return { id, name: p.name, partType: p.partType, inSuit: p.suitId === sid };
        }),
        score: best.s,
        relative: 0,
      });
  }
  results.sort((a, b) => b.score.overall - a.score.overall);
  const top = results[0]?.score.overall || 1;
  return results.map((r) => ({ ...r, relative: r.score.overall / top }));
}

// ───────── 연계 시너지 ─────────

/** 연계 조건에 나오는 용어 → 그 상태를 만들어 주는 전투 태그 */
export const REQUIREMENT_TAGS: Record<string, string[]> = {
  "열기 부착": ["열기 부착"],
  "냉기 부착": ["냉기 부착"],
  "전기 부착": ["전기 부착"],
  "자연 부착": ["자연 부착"],
  "아츠 부착": ["열기 부착", "냉기 부착", "전기 부착", "자연 부착"],
  연소: ["연소"],
  감전: ["감전"],
  동결: ["동결"],
  부식: ["부식"],
  "아츠 이상": ["연소", "감전", "동결", "부식"],
  "아츠 폭발": ["아츠 폭발", "열기 부착", "냉기 부착", "전기 부착", "자연 부착"],
  "방어 불능": ["띄우기", "넘어뜨리기", "강타", "갑옷 파괴"],
  "물리 이상": ["띄우기", "넘어뜨리기", "강타", "갑옷 파괴"],
  띄우기: ["띄우기"],
  넘어뜨리기: ["넘어뜨리기"],
  강타: ["강타"],
  "갑옷 파괴": ["갑옷 파괴"],
  "물리 취약": ["물리 취약"],
  불균형: ["불균형"],
  "불균형 지점": ["불균형"],
  "오리지늄 결정": ["오리지늄 결정"],
};
/** 조작 캐릭터 혼자 만들 수 있는 조건 */
const SELF_CONDITIONS = ["강력한 일격", "처형"];

/** 연계 스킬 설명에서 발동 조건 문장만 (…사용할/발동할 수 있습니다 앞) */
export function comboCondition(desc: string | null | undefined): string {
  const plain = (desc ?? "").replace(/<[^>]+>/g, "");
  const m = plain.match(/^([\s\S]*?)(사용할 수 있습니다|발동할 수 있습니다)/);
  return (m ? m[1] : plain.split("\n")[0]).replace(/\s+/g, " ").trim();
}

export interface Synergy {
  condition: string;
  needs: { keyword: string; providers: string[]; self: boolean }[];
  selfOnly: string[];
  /** 이 오퍼레이터가 연계 조건을 만들어 주는 동료 */
  enables: string[];
}

export function synergy(
  id: string,
  all: Record<string, { comboDesc: string | null; tags: string[] }>,
  findTerms: (text: string) => string[],
): Synergy {
  const me = all[id];
  const condition = comboCondition(me.comboDesc);
  const terms = [...new Set(findTerms(condition))];
  const needs = terms
    .filter((t) => REQUIREMENT_TAGS[t])
    .map((keyword) => {
      const tags = REQUIREMENT_TAGS[keyword];
      const providers = Object.entries(all)
        .filter(([oid, o]) => oid !== id && o.tags.some((t) => tags.includes(t)))
        .map(([oid]) => oid);
      return { keyword, providers, self: me.tags.some((t) => tags.includes(t)) };
    });
  const selfOnly = terms.filter((t) => SELF_CONDITIONS.includes(t));
  const enables = Object.entries(all)
    .filter(([oid]) => oid !== id)
    .filter(([, o]) =>
      findTerms(comboCondition(o.comboDesc)).some((t) => REQUIREMENT_TAGS[t]?.some((tag) => me.tags.includes(tag))),
    )
    .map(([oid]) => oid);
  return { condition, needs, selfOnly, enables };
}
