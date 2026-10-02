// 기질 파밍 최적화 계산 (순수 함수, UI 의존성 없음)
//
// 각인권 사용 시 기질 획득 규칙 (출처: data/essence-regions.json _meta.rules)
//  1) 기초 속성: 플레이어가 고른 3개 중 무작위 1개
//  2) 부가 속성 / 스킬 속성 중 하나를 골라 1개 "고정"
//  3) 고정하지 않은 나머지 분류는 해당 지역 풀(8개) 중 무작위 1개
//
// 따라서 무기 하나의 "완벽 기질(3줄 일치)" 확률은
//   P = [기초 ∈ 선택] × 1/선택수 × [고정 일치] × 1/풀크기(고정 안 한 쪽)
// TODO: 분류 내 각 속성의 등장 확률이 균등하다는 가정은 공식 확인 필요

import type { EssenceRegion, EssenceTarget, StatCategory } from "@/types/game";

/** 각인권에서 고르는 기초 속성 개수 */
export const BASE_PICK_COUNT = 3;

export type LockCategory = Exclude<StatCategory, "base">;

export interface FarmConfig {
  regionId: string;
  /** 선택한 기초 속성 (BASE_PICK_COUNT 개) */
  bases: string[];
  /** 고정한 부가/스킬 속성 */
  lock: { category: LockCategory; stat: string };
}

export interface FarmTarget {
  /** 화면에서 구분용 키 (예: 오퍼레이터 id) */
  key: string;
  essence: EssenceTarget;
  /** 가중치 (기본 1) */
  weight?: number;
}

export interface TargetChance {
  key: string;
  chance: number;
}

export interface FarmRecommendation {
  config: FarmConfig;
  /** 기질 1개당 기대 완벽 기질 수 (가중합) */
  score: number;
  /** 확률 > 0 인 대상, 확률 내림차순 */
  covered: TargetChance[];
}

const otherCategory = (c: LockCategory): LockCategory => (c === "extra" ? "skill" : "extra");

/** 기초 속성 일치 확률 */
function baseChance(target: EssenceTarget, bases: string[]): number {
  if (target.base === null) return 1;
  return bases.includes(target.base) ? 1 / bases.length : 0;
}

/**
 * 기초 속성을 제외한 부분(고정 + 무작위)의 일치 확률.
 * 기초 속성 선택과 독립이므로 따로 계산해 최적화에 재사용한다.
 */
export function lockedPartChance(
  target: EssenceTarget,
  region: EssenceRegion,
  lock: FarmConfig["lock"],
): number {
  const lockPool = region[lock.category];
  if (!lockPool.includes(lock.stat)) return 0; // 지역 풀에 없는 속성은 고정 불가

  let p = 1;
  const wantLocked = target[lock.category];
  if (wantLocked !== null && wantLocked !== lock.stat) return 0;

  const other = otherCategory(lock.category);
  const wantOther = target[other];
  if (wantOther !== null) {
    const pool = region[other];
    if (!pool.includes(wantOther)) return 0;
    p *= 1 / pool.length;
  }
  return p;
}

/** 특정 설정에서 무기 하나가 완벽 기질(필요 속성 전부 일치)을 얻을 확률 */
export function perfectChance(target: EssenceTarget, region: EssenceRegion, config: FarmConfig): number {
  if (config.regionId !== region.id) throw new Error("config.regionId 와 region.id 가 다릅니다");
  return baseChance(target, config.bases) * lockedPartChance(target, region, config.lock);
}

/** 기초 속성 점수가 높은 순으로 BASE_PICK_COUNT 개 선택 (동점·0점은 정의 순서로 채움) */
function pickBases(scoreByBase: Map<string, number>, allBases: string[]): string[] {
  return [...allBases]
    .map((id, order) => ({ id, order, s: scoreByBase.get(id) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, BASE_PICK_COUNT)
    .map((x) => x.id)
    .sort((a, b) => allBases.indexOf(a) - allBases.indexOf(b));
}

/** 한 지역 + 한 고정 속성에 대해 최적 기초 속성을 골라 추천을 만든다 */
function bestForLock(
  targets: FarmTarget[],
  region: EssenceRegion,
  lock: FarmConfig["lock"],
  allBases: string[],
): FarmRecommendation {
  const partial = targets.map((t) => ({ t, p: lockedPartChance(t.essence, region, lock) }));

  const scoreByBase = new Map<string, number>();
  for (const { t, p } of partial) {
    if (p === 0 || t.essence.base === null) continue;
    scoreByBase.set(t.essence.base, (scoreByBase.get(t.essence.base) ?? 0) + p * (t.weight ?? 1));
  }
  const config: FarmConfig = { regionId: region.id, bases: pickBases(scoreByBase, allBases), lock };

  const covered: TargetChance[] = [];
  let score = 0;
  for (const { t, p } of partial) {
    const chance = p * baseChance(t.essence, config.bases);
    if (chance > 0) {
      covered.push({ key: t.key, chance });
      score += chance * (t.weight ?? 1);
    }
  }
  covered.sort((a, b) => b.chance - a.chance);
  return { config, score, covered };
}

/**
 * 한 구역에서 고를 수 있는 모든 고정 속성(추가 8 + 스킬 8)별 최적 설정을 점수순으로 반환한다.
 * 점수가 0 인 설정(선택한 무기를 하나도 못 얻는 설정)은 제외한다.
 */
export function rankLocks(targets: FarmTarget[], region: EssenceRegion, allBases: string[]): FarmRecommendation[] {
  const recs: FarmRecommendation[] = [];
  for (const category of ["extra", "skill"] as const) {
    for (const stat of region[category]) {
      const rec = bestForLock(targets, region, { category, stat }, allBases);
      if (rec.score > 0) recs.push(rec);
    }
  }
  return recs.sort((a, b) => b.score - a.score || b.covered.length - a.covered.length);
}

/**
 * 선택한 대상(무기 기질 목표)들에 대해 가장 효율적인 파밍 설정을 찾는다.
 * 지역마다 최고 설정 1개씩 뽑아 점수 내림차순으로 반환한다.
 */
export function recommendFarming(
  targets: FarmTarget[],
  regions: EssenceRegion[],
  allBases: string[],
): FarmRecommendation[] {
  if (targets.length === 0) return [];
  const result: FarmRecommendation[] = [];

  for (const region of regions) {
    let best: FarmRecommendation | null = null;
    for (const category of ["extra", "skill"] as const) {
      for (const stat of region[category]) {
        const rec = bestForLock(targets, region, { category, stat }, allBases);
        if (
          !best ||
          rec.score > best.score + 1e-12 ||
          (Math.abs(rec.score - best.score) <= 1e-12 && rec.covered.length > best.covered.length)
        ) {
          best = rec;
        }
      }
    }
    if (best && best.score > 0) result.push(best);
  }

  return result.sort((a, b) => b.score - a.score || b.covered.length - a.covered.length);
}

export interface FarmPlanStep extends FarmRecommendation {
  /** 같은 단계에서 고를 수 있는 다른 지역 후보 (점수 동일하거나 낮은 순) */
  alternatives: FarmRecommendation[];
}

export interface FarmPlan {
  steps: FarmPlanStep[];
  /** 어느 지역에서도 얻을 수 없는 대상 */
  unreachable: string[];
}

/**
 * 모든 대상을 커버하는 파밍 순서(루트)를 탐욕적으로 만든다.
 * 매 단계 가장 점수가 높은 설정을 고르고, 커버된 대상은 제외한 뒤 반복.
 */
export function planFarming(targets: FarmTarget[], regions: EssenceRegion[], allBases: string[]): FarmPlan {
  const steps: FarmPlanStep[] = [];
  let remaining = [...targets];

  while (remaining.length > 0) {
    const recs = recommendFarming(remaining, regions, allBases);
    if (recs.length === 0) break;
    const [best, ...alternatives] = recs;
    steps.push({ ...best, alternatives });
    const done = new Set(best.covered.map((c) => c.key));
    remaining = remaining.filter((t) => !done.has(t.key));
  }

  return { steps, unreachable: remaining.map((t) => t.key) };
}

/** 확률 p 인 사건을 한 번 얻기까지 필요한 기대 기질 수 */
export function expectedDrops(p: number): number {
  return p > 0 ? 1 / p : Infinity;
}

/** 한 줄(기초/부가/스킬)이 어떻게 맞춰지는지 */
export type LineStatus =
  | "free" // 무기가 요구하지 않는 줄
  | "sure" // 고정 속성으로 100% 일치
  | "pick" // 기초 속성 3개 중 무작위 (1/선택수)
  | "random" // 지역 풀 8개 중 무작위 (1/풀크기)
  | "miss"; // 이 설정으로는 맞출 수 없음

export interface LineOutcome {
  status: LineStatus;
  /** 이 줄이 일치할 확률 */
  chance: number;
}

/**
 * 설정별로 3줄이 각각 어떻게 맞춰지는지 설명한다 (UI 표시용).
 * 세 줄의 chance 를 곱하면 perfectChance 와 같다.
 */
export function explainLines(
  target: EssenceTarget,
  region: EssenceRegion,
  config: FarmConfig,
): Record<StatCategory, LineOutcome> {
  const base: LineOutcome =
    target.base === null
      ? { status: "free", chance: 1 }
      : config.bases.includes(target.base)
        ? { status: "pick", chance: 1 / config.bases.length }
        : { status: "miss", chance: 0 };

  const line = (category: LockCategory): LineOutcome => {
    const want = target[category];
    if (want === null) return { status: "free", chance: 1 };
    const pool = region[category];
    if (category === config.lock.category) {
      return config.lock.stat === want && pool.includes(want)
        ? { status: "sure", chance: 1 }
        : { status: "miss", chance: 0 };
    }
    return pool.includes(want) ? { status: "random", chance: 1 / pool.length } : { status: "miss", chance: 0 };
  };

  return { base, extra: line("extra"), skill: line("skill") };
}

/**
 * 추가·스킬 속성이 둘 다 나올 수 있는 구역 (예고 무기처럼 속성만 알 때 위치 찾기용).
 * 둘 중 하나가 null 이면 나머지 하나만 본다.
 */
export function regionsForPair(extra: string | null, skill: string | null, regions: EssenceRegion[]): EssenceRegion[] {
  return regions.filter((r) => (extra === null || r.extra.includes(extra)) && (skill === null || r.skill.includes(skill)));
}
