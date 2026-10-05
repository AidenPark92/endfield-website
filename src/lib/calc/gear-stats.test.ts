import { describe, expect, it } from "vitest";
import { formatGearValue, gearAttrInfo, gearTier, sumGearStats, type AttrTypes } from "./gear-stats";
import type { GearPiece } from "@/types/build";
import gearJson from "@data/combat/gear.json";
import attrTypesJson from "@data/combat/attr-types.json";

const T: AttrTypes = attrTypesJson.attrTypes;
const pieces = (gearJson as unknown as { pieces: Record<string, GearPiece> }).pieces;

describe("gearAttrInfo", () => {
  it("modifierType 으로 형식 결정 (6 비율 · 7 고정 · 8 배율 · 5 는 attr-types)", () => {
    expect(gearAttrInfo({ attrType: 1, values: [0.1], modifierType: 6 }, T).kind).toBe("ratio");
    expect(gearAttrInfo({ attrType: 1, values: [46], modifierType: 7 }, T).kind).toBe("flat");
    expect(gearAttrInfo({ attrType: 4, values: [0.9], modifierType: 8 }, T).kind).toBe("mult");
    expect(gearAttrInfo({ attrType: 9, values: [0.05], modifierType: 5 }, T).kind).toBe("ratio");
  });
  it("주요/보조 능력치는 오퍼레이터를 알면 실제 능력치로", () => {
    const a = { attrType: 0, values: [30], modifierType: 5, target: 1 };
    expect(gearAttrInfo(a, T).name).toBe("주요 능력치");
    expect(gearAttrInfo(a, T, { main: "민첩", sub: "힘" })).toEqual({ key: "40:flat", name: "민첩", kind: "flat" });
  });
});

describe("sumGearStats", () => {
  it("같은 옵션끼리 합산, 방어력이 맨 앞", () => {
    const ids = ["item_equip_t4_suit_atb01_body_01", "item_equip_t4_suit_atb01_hand_01", "item_equip_t4_suit_atb01_edc_01", "item_equip_t4_suit_atb01_edc_02"];
    const ps = ids.map((id) => pieces[id]);
    const rows = sumGearStats(ps, 0, T);
    expect(rows[0].name).toBe("방어력");
    const def = ps.flatMap((p) => p.attrs).filter((a) => a.attrType === 3).reduce((n, a) => n + a.values[0], 0);
    expect(rows[0].value).toBeCloseTo(def);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
  it("단조 단계 값 사용", () => {
    const p = pieces["item_equip_t4_suit_atb01_body_01"];
    const grow = p.attrs.find((a) => new Set(a.values).size > 1)!;
    const row = sumGearStats([p], 3, T).find((r) => r.key === gearAttrInfo(grow, T).key)!;
    expect(row.value).toBeCloseTo(grow.values[3]);
  });
});

describe("표시 형식", () => {
  it("비율 · 배율 · 고정", () => {
    expect(formatGearValue(0.26, "ratio")).toBe("26%");
    expect(formatGearValue(0.055, "ratio")).toBe("5.5%");
    expect(formatGearValue(0.9, "mult")).toBe("×0.9");
    expect(formatGearValue(46.327, "flat")).toBe("46.3");
  });
  it("장비 등급", () => {
    expect(gearTier("item_equip_t4_suit_atb01_body_01")).toBe(4);
    expect(gearTier("item_equip_t0_parts_tundra01_body_01")).toBe(0);
  });
});
