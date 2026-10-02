import { describe, expect, it } from "vitest";
import {
  expectedDrops,
  explainLines,
  regionsForPair,
  lockedPartChance,
  perfectChance,
  planFarming,
  rankLocks,
  recommendFarming,
  type FarmConfig,
} from "./essence";
import type { EssenceRegion, EssenceTarget } from "@/types/game";
import statsJson from "@data/essence-stats.json";
import regionsJson from "@data/essence-regions.json";
import weaponsJson from "@data/weapons.json";
import operatorsJson from "@data/operators.json";
import weaponImagesJson from "@data/weapon-images.json";

const BASES = ["str", "agi", "int", "wil", "main"];

// 테스트용 가상 지역 (부가 8 / 스킬 8)
const region: EssenceRegion = {
  id: "r1",
  name: "테스트 지역",
  area: "테스트",
  extra: ["atk", "hp", "phys", "heat", "elec", "cryo", "nature", "crit"],
  skill: ["assault", "suppress", "pursuit", "crush", "technique", "burst", "flow", "efficiency"],
};

const sword: EssenceTarget = { base: "agi", extra: "atk", skill: "flow" };

describe("perfectChance", () => {
  it("기초 3개 중 1개 × 나머지 풀 8개 중 1개 = 1/24", () => {
    const cfg: FarmConfig = { regionId: "r1", bases: ["str", "agi", "int"], lock: { category: "skill", stat: "flow" } };
    expect(perfectChance(sword, region, cfg)).toBeCloseTo(1 / 24);
  });

  it("부가 속성을 고정해도 동일하게 1/24", () => {
    const cfg: FarmConfig = { regionId: "r1", bases: ["str", "agi", "int"], lock: { category: "extra", stat: "atk" } };
    expect(perfectChance(sword, region, cfg)).toBeCloseTo(1 / 24);
  });

  it("기초 속성을 고르지 않으면 0", () => {
    const cfg: FarmConfig = { regionId: "r1", bases: ["str", "int", "wil"], lock: { category: "skill", stat: "flow" } };
    expect(perfectChance(sword, region, cfg)).toBe(0);
  });

  it("고정 속성이 다르면 0", () => {
    const cfg: FarmConfig = { regionId: "r1", bases: ["str", "agi", "int"], lock: { category: "skill", stat: "burst" } };
    expect(perfectChance(sword, region, cfg)).toBe(0);
  });

  it("필요한 속성이 지역 풀에 없으면 0", () => {
    const t: EssenceTarget = { base: "agi", extra: "heal", skill: "flow" }; // heal 은 풀에 없음
    expect(lockedPartChance(t, region, { category: "skill", stat: "flow" })).toBe(0);
  });

  it("3성 무기처럼 부가 속성이 없으면 스킬만 고정해도 1/3", () => {
    const t: EssenceTarget = { base: "main", extra: null, skill: "assault" };
    const cfg: FarmConfig = { regionId: "r1", bases: ["main", "str", "agi"], lock: { category: "skill", stat: "assault" } };
    expect(perfectChance(t, region, cfg)).toBeCloseTo(1 / 3);
  });
});

describe("recommendFarming", () => {
  it("대상이 없으면 빈 배열", () => {
    expect(recommendFarming([], [region], BASES)).toEqual([]);
  });

  it("같은 스킬 속성을 공유하는 무기들을 한 번에 노린다", () => {
    const targets = [
      { key: "a", essence: { base: "agi", extra: "atk", skill: "flow" } },
      { key: "b", essence: { base: "wil", extra: "phys", skill: "flow" } },
      { key: "c", essence: { base: "int", extra: "crit", skill: "burst" } },
    ];
    const [best] = recommendFarming(targets, [region], BASES);
    expect(best.config.lock).toEqual({ category: "skill", stat: "flow" });
    expect(best.config.bases).toEqual(expect.arrayContaining(["agi", "wil"]));
    expect(best.covered.map((c) => c.key).sort()).toEqual(["a", "b"]);
    expect(best.score).toBeCloseTo(2 / 24);
  });

  it("가중치가 높은 대상을 우선한다", () => {
    const targets = [
      { key: "a", essence: { base: "agi", extra: "atk", skill: "flow" }, weight: 1 },
      { key: "b", essence: { base: "str", extra: "hp", skill: "burst" }, weight: 5 },
    ];
    const [best] = recommendFarming(targets, [region], BASES);
    expect(best.covered[0].key).toBe("b");
  });

  it("기초 속성은 항상 3개를 고른다", () => {
    const [best] = recommendFarming([{ key: "a", essence: sword }], [region], BASES);
    expect(best.config.bases).toHaveLength(3);
    expect(best.config.bases).toContain("agi");
  });
});

describe("planFarming", () => {
  it("모든 대상을 여러 단계로 나눠 커버한다", () => {
    const targets = [
      { key: "a", essence: { base: "agi", extra: "atk", skill: "flow" } },
      { key: "b", essence: { base: "wil", extra: "phys", skill: "flow" } },
      { key: "c", essence: { base: "int", extra: "crit", skill: "burst" } },
    ];
    const plan = recommendPlan(targets);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].covered.map((c) => c.key).sort()).toEqual(["a", "b"]);
    expect(plan.steps[1].covered.map((c) => c.key)).toEqual(["c"]);
    expect(plan.unreachable).toEqual([]);
  });

  it("얻을 수 없는 대상은 unreachable 로 분리", () => {
    const plan = recommendPlan([{ key: "x", essence: { base: "agi", extra: "heal", skill: "medic" } }]);
    expect(plan.steps).toHaveLength(0);
    expect(plan.unreachable).toEqual(["x"]);
  });

  function recommendPlan(targets: { key: string; essence: EssenceTarget }[]) {
    return planFarming(targets, [region], BASES);
  }
});

describe("expectedDrops", () => {
  it("1/24 → 24개", () => expect(expectedDrops(1 / 24)).toBeCloseTo(24));
  it("0 → Infinity", () => expect(expectedDrops(0)).toBe(Infinity));
});

// /data JSON 무결성 검사 — 데이터 갱신 시 깨진 참조를 바로 잡아낸다
describe("data 무결성", () => {
  const ids = {
    base: new Set(statsJson.base.map((s) => s.id)),
    extra: new Set(statsJson.extra.map((s) => s.id)),
    skill: new Set(statsJson.skill.map((s) => s.id)),
  };

  it("모든 무기 기질 속성이 정의돼 있다", () => {
    for (const w of weaponsJson.weapons) {
      expect(w.essence.base && ids.base.has(w.essence.base), w.name).toBe(true);
      if (w.essence.extra) expect(ids.extra.has(w.essence.extra), w.name).toBe(true);
      if (w.essence.skill) expect(ids.skill.has(w.essence.skill), w.name).toBe(true);
    }
  });

  it("지역 풀은 부가 8 / 스킬 8 이고 정의된 속성만 쓴다", () => {
    for (const r of regionsJson.regions) {
      expect(r.extra).toHaveLength(8);
      expect(r.skill).toHaveLength(8);
      r.extra.forEach((s) => expect(ids.extra.has(s)).toBe(true));
      r.skill.forEach((s) => expect(ids.skill.has(s)).toBe(true));
    }
  });

  it("지역은 12곳이고 id가 겹치지 않는다", () => {
    expect(regionsJson.regions).toHaveLength(12);
    expect(new Set(regionsJson.regions.map((r) => r.id)).size).toBe(12);
  });

  it("무기 이미지 매핑은 존재하는 무기만 가리킨다", () => {
    const wIds = new Set(weaponsJson.weapons.map((w) => w.id));
    for (const [id, path] of Object.entries(weaponImagesJson.images)) {
      expect(wIds.has(id), id).toBe(true);
      expect(path).toBe(`/weapons/${id}.webp`);
    }
  });

  it("오퍼레이터 추천 무기는 모두 존재한다", () => {
    const wIds = new Set(weaponsJson.weapons.map((w) => w.id));
    for (const o of operatorsJson.operators) {
      [...o.recommendedWeapons.skill, ...o.recommendedWeapons.attribute].forEach((id) =>
        expect(wIds.has(id), `${o.name} → ${id}`).toBe(true),
      );
    }
  });
});

describe("explainLines", () => {
  const cfg = (lock: FarmConfig["lock"], bases = ["agi", "str", "int"]): FarmConfig => ({ regionId: "r1", bases, lock });

  it("고정/기초/무작위 줄을 구분하고 곱이 perfectChance 와 같다", () => {
    const c = cfg({ category: "extra", stat: "atk" });
    const l = explainLines(sword, region, c);
    expect(l.base).toEqual({ status: "pick", chance: 1 / 3 });
    expect(l.extra).toEqual({ status: "sure", chance: 1 });
    expect(l.skill).toEqual({ status: "random", chance: 1 / 8 });
    expect(l.base.chance * l.extra.chance * l.skill.chance).toBeCloseTo(perfectChance(sword, region, c));
  });

  it("맞출 수 없는 줄은 miss", () => {
    const l = explainLines(sword, region, cfg({ category: "skill", stat: "burst" }, ["str", "int", "wil"]));
    expect(l.base.status).toBe("miss");
    expect(l.skill.status).toBe("miss");
    expect(l.extra.status).toBe("random");
  });

  it("요구하지 않는 줄은 free", () => {
    const l = explainLines({ base: "main", extra: "atk", skill: null }, region, cfg({ category: "extra", stat: "atk" }, ["main", "str", "agi"]));
    expect(l.skill).toEqual({ status: "free", chance: 1 });
  });
});

describe("rankLocks", () => {
  it("구역 안의 고정 속성 후보를 점수순으로, 0점은 빼고 반환한다", () => {
    const recs = rankLocks([{ key: "a", essence: sword }], region, BASES);
    // sword 는 추가(atk) 고정 또는 스킬(flow) 고정 두 가지만 가능
    expect(recs.map((r) => r.config.lock.stat).sort()).toEqual(["atk", "flow"]);
    recs.forEach((r) => expect(r.score).toBeCloseTo(1 / 24));
  });

  it("recommendFarming 의 구역 최고 점수와 같다", () => {
    const targets = [
      { key: "a", essence: sword },
      { key: "b", essence: { base: "str", extra: "atk", skill: "burst" } },
    ];
    const best = recommendFarming(targets, [region], BASES)[0];
    expect(rankLocks(targets, region, BASES)[0].score).toBeCloseTo(best.score);
  });
});

describe("regionsForPair", () => {
  const other: EssenceRegion = { ...region, id: "r2", extra: ["hp"], skill: ["dark"] };
  it("추가·스킬이 모두 있는 구역만", () => {
    expect(regionsForPair("atk", "flow", [region, other]).map((r) => r.id)).toEqual(["r1"]);
    expect(regionsForPair("hp", "flow", [region, other])).toHaveLength(1);
    expect(regionsForPair("hp", "dark", [region, other]).map((r) => r.id)).toEqual(["r2"]);
    expect(regionsForPair("heal", "dark", [region, other])).toHaveLength(0);
  });
  it("null 이면 그 줄은 무시", () => {
    expect(regionsForPair(null, "dark", [region, other]).map((r) => r.id)).toEqual(["r2"]);
  });
});
