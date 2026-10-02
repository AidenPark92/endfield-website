import { describe, expect, it } from "vitest";
import { perfectChance, type FarmConfig } from "./essence";
import { SCORE_WEIGHTS, evaluateConfig, maxChances, matchWeapon, planRoute, rankConfigs, uniqueByZoneLock } from "./essence-score";
import type { EssenceRegion } from "@/types/game";

const BASES = ["str", "agi", "int", "wil", "main"];

// 테스트용 가상 구역 (추가 8 / 스킬 8)
const region: EssenceRegion = {
  id: "r1",
  name: "테스트 구역",
  area: "테스트",
  extra: ["atk", "hp", "phys", "heat", "elec", "cryo", "nature", "crit"],
  skill: ["assault", "suppress", "pursuit", "crush", "technique", "burst", "flow", "efficiency"],
};
// 공격력·흐름이 없는 구역
const region2: EssenceRegion = {
  ...region,
  id: "r2",
  extra: ["hp", "phys", "heat", "elec", "cryo", "nature", "crit", "heal"],
  skill: ["assault", "suppress", "pursuit", "crush", "technique", "burst", "dark", "efficiency"],
};

const cfg = (bases: string[], category: "extra" | "skill", stat: string, regionId = "r1"): FarmConfig => ({
  regionId,
  bases,
  lock: { category, stat },
});

const sword = { key: "sword", essence: { base: "agi", extra: "atk", skill: "flow" } };
const bow = { key: "bow", essence: { base: "wil", extra: "hp", skill: "efficiency" } };
const axe = { key: "axe", essence: { base: "str", extra: "atk", skill: "burst" } };

describe("matchWeapon", () => {
  it("줄별 확률과 완벽 확률 (perfectChance 와 일치)", () => {
    const c = cfg(["agi", "str", "int"], "extra", "atk");
    const m = matchWeapon(sword, region, c);
    expect(m.lines.base!.chance).toBeCloseTo(1 / 3);
    expect(m.lines.extra!.chance).toBe(1);
    expect(m.lines.skill!.chance).toBeCloseTo(1 / 8);
    expect(m.maxMatch).toBe(3);
    expect(m.pPerfect).toBeCloseTo(perfectChance(sword.essence, region, c));
  });

  it("2/3 확률 = 정확히 2줄 일치", () => {
    const m = matchWeapon(sword, region, cfg(["agi", "str", "int"], "extra", "atk"));
    // 고정 줄 1 × (기초 hit·무작위 miss + 기초 miss·무작위 hit)
    expect(m.pPartial).toBeCloseTo((1 / 3) * (7 / 8) + (2 / 3) * (1 / 8));
  });

  it("고정 분류에서 다른 속성을 원하면 그 줄은 0 (최대 2/3)", () => {
    const m = matchWeapon(bow, region, cfg(["wil", "str", "int"], "extra", "atk"));
    expect(m.lines.extra!.chance).toBe(0);
    expect(m.maxMatch).toBe(2);
    expect(m.pPerfect).toBe(0);
    expect(m.pPartial).toBeCloseTo((1 / 3) * (1 / 8));
  });

  it("3성 무기(스킬 없음)는 2줄 기준", () => {
    const m = matchWeapon({ key: "x", essence: { base: "main", extra: "atk", skill: null } }, region, cfg(["main", "str", "agi"], "extra", "atk"));
    expect(m.required).toBe(2);
    expect(m.lines.skill).toBeNull();
    expect(m.pPerfect).toBeCloseTo(1 / 3);
    expect(m.pPartial).toBe(0);
  });
});

describe("evaluateConfig", () => {
  it("우선 무기 1개 최대 확률이면 100점, 다른 무기는 보너스로 더해진다", () => {
    const solo = evaluateConfig([sword], [], region, cfg(["agi", "str", "int"], "extra", "atk"));
    expect(solo.score).toBe(100);

    const withAxe = evaluateConfig([sword], [axe], region, cfg(["agi", "str", "int"], "extra", "atk"));
    const axeM = withAxe.others[0];
    expect(axeM.key).toBe("axe");
    // axe 도 최대 확률로 완벽 가능 → +10
    expect(withAxe.bonusScore).toBeCloseTo(SCORE_WEIGHTS.otherPerfect);
    expect(withAxe.score).toBe(110);
  });

  it("2줄까지만 맞는 무기는 점수·목록에 넣지 않고 개수만 센다", () => {
    // bow: 의지 ✓, 생명력 ✗(공격력 고정), 효율 ✓ → 최대 2/3
    const e = evaluateConfig([sword], [bow], region, cfg(["agi", "wil", "int"], "extra", "atk"));
    expect(e.others).toHaveLength(0);
    expect(e.partialOnly).toBe(1);
    expect(e.bonusScore).toBe(0);
  });

  it("한 줄도 못 맞추는 다른 무기는 목록에서 빠진다", () => {
    const e = evaluateConfig([sword], [{ key: "none", essence: { base: "main", extra: "heal", skill: "dark" } }], region, cfg(["agi", "str", "int"], "extra", "atk"));
    expect(e.others).toHaveLength(0);
  });
});

describe("maxChances", () => {
  it("완벽 1/24, 2/3 9/24", () => {
    const m = maxChances(region);
    expect(m.perfect).toBeCloseTo(1 / 24);
    expect(m.partial).toBeCloseTo(9 / 24);
  });
});

describe("rankConfigs", () => {
  it("우선 무기를 얻을 수 없는 구역은 제외", () => {
    const evals = rankConfigs([sword], [], [region, region2], BASES);
    expect(evals.length).toBeGreaterThan(0);
    expect(evals.every((e) => e.config.regionId === "r1")).toBe(true);
    expect(evals.every((e) => e.config.bases.includes("agi"))).toBe(true);
  });

  it("우선 무기 확률이 같으면 다른 무기를 더 챙기는 설정이 위로 온다", () => {
    const [best] = rankConfigs([sword], [axe], [region], BASES);
    // 공격력 고정 + 기초에 민첩·힘 포함 → axe 도 완벽 가능
    expect(best.config.lock.stat).toBe("atk");
    expect(best.config.bases).toEqual(expect.arrayContaining(["agi", "str"]));
    expect(best.others[0].pPerfect).toBeGreaterThan(0);
  });

  it("보너스가 커도 우선 무기 확률을 희생하지 않는다", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ key: `o${i}`, essence: { base: "wil", extra: "hp", skill: "efficiency" } }));
    const [best] = rankConfigs([sword], many, [region], BASES);
    expect(best.priorityScore).toBeCloseTo(100);
  });

  it("uniqueByZoneLock 은 구역+고정 조합당 하나만 남긴다", () => {
    const u = uniqueByZoneLock(rankConfigs([sword], [], [region], BASES));
    expect(u.map((e) => e.config.lock.stat).sort()).toEqual(["atk", "flow"]);
  });
});

describe("planRoute", () => {
  it("한 설정으로 안 되는 우선 무기는 다음 단계로", () => {
    const { steps, unreachable } = planRoute([sword, bow], [], [region, region2], BASES);
    expect(unreachable).toHaveLength(0);
    expect(steps.length).toBe(2);
  });
});
