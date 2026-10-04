import { describe, expect, it } from "vitest";
import { attrBonus, clampLevel, MAX_LEVEL, statsAt } from "./operator-stats";
import statsJson from "@data/operator-stats.json";
import operatorsJson from "@data/operators.json";
import type { OperatorStats } from "@/types/game";

const all = statsJson.stats as Record<string, OperatorStats>;

describe("attrBonus", () => {
  it("주 1pt = 0.5%, 보조 1pt = 0.2%", () => {
    expect(attrBonus(0, 0)).toBe(1);
    expect(attrBonus(100, 0)).toBeCloseTo(1.5);
    expect(attrBonus(0, 100)).toBeCloseTo(1.2);
  });
});

describe("statsAt", () => {
  const pelica = all["1"];
  it("레벨 범위를 1~90으로 자른다", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(120)).toBe(MAX_LEVEL);
  });
  it("주/보조 능력치를 골라 공격력 보너스를 계산한다", () => {
    const s = statsAt(pelica, 90);
    expect(s.main).toBe(s.attrs[pelica.mainAttr]);
    expect(s.atkWithAttr).toBeCloseTo(s.atk * (1 + 0.005 * s.main + 0.002 * s.sub));
  });
});

describe("operator-stats.json 무결성", () => {
  const opIds = new Set((operatorsJson.operators as { id: string }[]).map((o) => o.id));
  it("모든 항목이 operators.json 에 있고, 레벨 90개 배열을 가진다", () => {
    for (const [id, s] of Object.entries(all)) {
      expect(opIds.has(id)).toBe(true);
      for (const k of ["hp", "atk", "def", "str", "agi", "int", "wil"] as const) expect(s[k]).toHaveLength(MAX_LEVEL);
    }
  });
  it("공격력·생명력은 레벨이 오를수록 줄지 않는다", () => {
    for (const s of Object.values(all))
      for (let i = 1; i < MAX_LEVEL; i++) {
        expect(s.atk[i]).toBeGreaterThanOrEqual(s.atk[i - 1]);
        expect(s.hp[i]).toBeGreaterThanOrEqual(s.hp[i - 1]);
      }
  });
});
