// 기질 파밍 효율 점수 (순수 함수, UI 의존성 없음)
//
// 기질 선택권 한 가지 설정(구역 + 기초 3개 + 고정 1개)으로 기질을 1개 얻을 때,
// 각 줄은 서로 독립적으로 결정된다 (규칙: data/essence-regions.json _meta.rules)
//   - 기초 줄  : 고른 3개 중 무작위 1개   → 원하는 기초가 포함돼 있으면 1/3
//   - 고정 줄  : 고정한 속성 그대로       → 원하는 속성과 같으면 1, 다르면 0
//   - 무작위 줄: 구역 풀 8개 중 무작위 1개 → 풀에 있으면 1/8
//
// 따라서 무기 하나에 대해 "몇 줄이 맞는지"의 분포를 정확히 계산할 수 있다.
// 우선 무기(직접 고른 무기)의 완벽 기질을 최우선으로 노리면서,
// 같은 기질이 다른 무기에도 맞는(완벽 또는 2/3) 경우를 보너스로 더해 설정을 비교한다.
//
// 점수 = 100 × Σ(우선 무기 완벽 확률 ÷ 완벽 최대 확률)
//      +  10 × Σ(다른 무기 완벽 확률 ÷ 완벽 최대 확률)
//      +   3 × Σ(다른 무기 2/3 확률 ÷ 2/3 최대 확률)
//   완벽 최대 확률 = 1/3 × 1/8 = 1/24, 2/3 최대 확률 = 1/3 × 7/8 + 2/3 × 1/8 = 9/24
//   → 우선 무기 1개를 최대 확률로 노리면 100점, 다른 무기는 최대일 때 완벽 +10 / 2/3 +3 점씩 보너스.
// 정렬은 "우선 무기 기대값"을 먼저 비교하고, 같으면 보너스로 비교한다
// (다른 무기가 많아도 우선 무기를 희생하는 설정이 위로 올라오지 않게).
// TODO: 속성별 등장 확률이 균등하다는 가정은 공식 확인 필요

import { BASE_PICK_COUNT, type FarmConfig, type FarmTarget, type LockCategory } from "./essence";
import type { EssenceRegion, StatCategory } from "@/types/game";

/** 점수 가중치 — 게임 수치가 아니라 사이트의 평가 기준 (조정 가능) */
export const SCORE_WEIGHTS = {
  /** 우선 무기 완벽 (최대 확률일 때 점수) */
  priority: 100,
  /** 다른 무기에도 완벽(3/3)으로 맞는 기질 */
  otherPerfect: 10,
  /** 다른 무기에 2/3 만 맞는 기질 (임시로 쓸 수 있는 정도) */
  otherPartial: 3,
} as const;

const EPS = 1e-9;
const CATS: StatCategory[] = ["base", "extra", "skill"];

export interface LineMatch {
  /** 무기가 원하는 속성 id */
  want: string;
  /** 이 줄이 원하는 속성으로 나올 확률 */
  chance: number;
}

export interface WeaponMatch {
  key: string;
  /** 줄별 일치 확률 (무기가 요구하지 않는 줄은 null) */
  lines: Record<StatCategory, LineMatch | null>;
  /** 무기가 요구하는 줄 수 (보통 3, 3성 무기는 2) */
  required: number;
  /** 이 설정으로 동시에 맞출 수 있는 최대 줄 수 */
  maxMatch: number;
  /** 완벽(요구 줄 전부) 확률 */
  pPerfect: number;
  /** 2/3 일치 확률 (요구 줄이 3개인 무기만, 정확히 2줄) */
  pPartial: number;
}

export interface ConfigEval {
  config: FarmConfig;
  /** 우선 무기 점수 (정렬 1순위) */
  priorityScore: number;
  /** 다른 무기 보너스 점수 (정렬 2순위) */
  bonusScore: number;
  /** 표시용 총점 (반올림) */
  score: number;
  priority: WeaponMatch[];
  /** 1줄 이상 맞을 수 있는 다른 무기 (일치 줄 수 → 완벽 확률 순) */
  others: WeaponMatch[];
}

/** 구역에서 가능한 최대 확률: 완벽(3/3)과 정확히 2/3 (점수 정규화 기준) */
export function maxChances(region: EssenceRegion): { perfect: number; partial: number } {
  const pb = 1 / BASE_PICK_COUNT;
  const pr = 1 / Math.min(region.extra.length, region.skill.length);
  // 고정 줄은 항상 일치 → 기초·무작위 중 하나만 맞는 경우
  return { perfect: pb * pr, partial: pb * (1 - pr) + (1 - pb) * pr };
}

const otherCategory = (c: LockCategory): LockCategory => (c === "extra" ? "skill" : "extra");

/** 설정 하나에서 무기 하나의 줄별 확률과 일치 분포를 계산한다 */
export function matchWeapon(target: FarmTarget, region: EssenceRegion, config: FarmConfig): WeaponMatch {
  const { essence } = target;
  const lock = config.lock;
  const random = otherCategory(lock.category);

  const chanceOf = (cat: StatCategory, want: string): number => {
    if (cat === "base") return config.bases.includes(want) ? 1 / config.bases.length : 0;
    if (cat === lock.category) return lock.stat === want && region[cat].includes(want) ? 1 : 0;
    // 무작위 줄
    return cat === random && region[cat].includes(want) ? 1 / region[cat].length : 0;
  };

  const lines = {} as Record<StatCategory, LineMatch | null>;
  const probs: number[] = [];
  for (const cat of CATS) {
    const want = essence[cat];
    if (want === null) {
      lines[cat] = null;
      continue;
    }
    const chance = chanceOf(cat, want);
    lines[cat] = { want, chance };
    probs.push(chance);
  }

  // 독립 베르누이 합의 분포: dist[k] = 정확히 k줄 일치할 확률
  let dist = [1];
  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }

  const required = probs.length;
  return {
    key: target.key,
    lines,
    required,
    maxMatch: probs.filter((p) => p > 0).length,
    pPerfect: dist[required] ?? 0,
    pPartial: required === 3 ? dist[2] : 0,
  };
}

/** 설정 하나를 평가한다 */
export function evaluateConfig(
  priority: FarmTarget[],
  others: FarmTarget[],
  region: EssenceRegion,
  config: FarmConfig,
): ConfigEval {
  const pm = priority.map((t) => matchWeapon(t, region, config));
  const om = others
    .map((t) => matchWeapon(t, region, config))
    .filter((m) => m.maxMatch > 0)
    .sort((a, b) => b.maxMatch - a.maxMatch || b.pPerfect - a.pPerfect || b.pPartial - a.pPartial);

  const max = maxChances(region);
  const priorityScore = pm.reduce(
    (s, m) => s + SCORE_WEIGHTS.priority * (m.pPerfect / max.perfect) * (priority.find((t) => t.key === m.key)!.weight ?? 1),
    0,
  );
  const bonusScore = om.reduce(
    (s, m) => s + SCORE_WEIGHTS.otherPerfect * (m.pPerfect / max.perfect) + SCORE_WEIGHTS.otherPartial * (m.pPartial / max.partial),
    0,
  );
  return { config, priorityScore, bonusScore, score: Math.round(priorityScore + bonusScore), priority: pm, others: om };
}

/** n 개 중 k 개 조합 */
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/** 정렬 기준: 우선 무기 점수 → 보너스 점수 */
export function compareEval(a: ConfigEval, b: ConfigEval): number {
  if (Math.abs(a.priorityScore - b.priorityScore) > EPS) return b.priorityScore - a.priorityScore;
  if (Math.abs(a.bonusScore - b.bonusScore) > EPS) return b.bonusScore - a.bonusScore;
  return 0;
}

/**
 * 모든 구역 × 고정 속성(추가 8 + 스킬 8) × 기초 3개 조합을 전부 평가해
 * 우선 무기를 1개 이상 완벽하게 얻을 수 있는 설정을 좋은 순서로 반환한다.
 * (12 × 16 × 10 = 1,920 가지 — 전수 탐색)
 */
export function rankConfigs(
  priority: FarmTarget[],
  others: FarmTarget[],
  regions: EssenceRegion[],
  allBases: string[],
): ConfigEval[] {
  if (priority.length === 0) return [];
  const baseSets = combinations(allBases, Math.min(BASE_PICK_COUNT, allBases.length));
  const result: ConfigEval[] = [];

  for (const region of regions) {
    for (const category of ["extra", "skill"] as const) {
      for (const stat of region[category]) {
        for (const bases of baseSets) {
          const ev = evaluateConfig(priority, others, region, { regionId: region.id, bases, lock: { category, stat } });
          if (ev.priorityScore > 0) result.push(ev);
        }
      }
    }
  }
  return result.sort(compareEval);
}

/** 같은 구역 + 같은 고정 속성은 가장 좋은 기초 조합 하나만 남긴다 (후보 목록 표시용) */
export function uniqueByZoneLock(evals: ConfigEval[]): ConfigEval[] {
  const seen = new Set<string>();
  return evals.filter((e) => {
    const k = `${e.config.regionId}:${e.config.lock.stat}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 우선 무기가 여러 개라 한 설정으로 다 못 얻을 때의 순서.
 * 매 단계 최고 설정을 고르고, 완벽 확률이 생긴 무기는 빼고 반복한다.
 */
export function planRoute(
  priority: FarmTarget[],
  others: FarmTarget[],
  regions: EssenceRegion[],
  allBases: string[],
): { steps: ConfigEval[]; unreachable: string[] } {
  const steps: ConfigEval[] = [];
  let remaining = [...priority];
  while (remaining.length > 0) {
    const best = rankConfigs(remaining, others, regions, allBases)[0];
    if (!best) break;
    steps.push(best);
    const done = new Set(best.priority.filter((m) => m.pPerfect > 0).map((m) => m.key));
    remaining = remaining.filter((t) => !done.has(t.key));
  }
  return { steps, unreachable: remaining.map((t) => t.key) };
}
