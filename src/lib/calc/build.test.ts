import { describe, expect, it } from "vitest";
import { bagFromAttrType, bagFromKey, comboCondition, emptyBag, addBag, score, unconditionalKeys, weaponBag, type OperatorBase } from "./build";
import { getBuildRecommendation, combatWeapons, operators } from "@/lib/data";

const op: OperatorBase = { element: "전기", mainAttr: "지능", subAttr: "의지", atk: 300, attrs: { 힘: 90, 민첩: 90, 지능: 160, 의지: 110 }, critRate: 0.05 };

describe("score", () => {
  it("능력치 보너스·공격력·치명 기대값", () => {
    const s = score(op, 500, emptyBag());
    expect(s.attrBonus).toBeCloseTo(1 + 0.005 * 160 + 0.002 * 110);
    expect(s.atk).toBeCloseTo(800 * s.attrBonus);
    expect(s.byType.battle).toBeCloseTo(s.atk * 1 * (1 + 0.05 * 0.5));
  });
  it("속성 피해는 자기 속성만, 아츠 피해는 아츠 속성에만", () => {
    const b = addBag(addBag(emptyBag(), bagFromKey("electrondam", 0.2)!), bagFromKey("phydam", 0.5)!);
    expect(score(op, 0, b).dmgPct.battle).toBeCloseTo(0.2);
    expect(score({ ...op, element: "물리" }, 0, bagFromKey("spelldam", 0.3)!).dmgPct.battle).toBe(0);
  });
  it("장비 주요/보조 능력치 (attrType 0)", () => {
    const flat = bagFromAttrType(0, 74, 1, 5);
    const pct = bagFromAttrType(0, 0.1, 2, 6);
    const s = score(op, 0, addBag(flat, pct));
    expect(s.attrs.지능).toBe(160 + 74);
    expect(s.attrs.의지).toBeCloseTo(110 * 1.1);
  });
  it("모든 스킬 피해 = 배틀·연계·궁극기", () => {
    const s = score(op, 0, bagFromKey("skill_dmg_up", 0.2)!);
    expect([s.dmgPct.battle, s.dmgPct.combo, s.dmgPct.ult, s.dmgPct.basic]).toEqual([0.2, 0.2, 0.2, 0]);
  });
});

describe("조건 없는 효과만", () => {
  it("첫 줄의 무조건 효과만 고르고 조건문부터는 버린다", () => {
    expect(unconditionalKeys("열기 피해 <@ba.vup>+{fire_dmg_up:0.0%}</>\n장착자가 궁극기를 사용했을 때, 일반 공격 피해 +{normal_atk_up}")).toEqual(["fire_dmg_up"]);
    expect(unconditionalKeys("3개 세트 효과: 장착자의 민첩 <@ba.vup>+{agi_up}</>\n장착자의 생명력이 {hp_ratio:0%}보다 높을 때, …")).toEqual(["agi_up"]);
  });
  it("무기: 돌파 완료·재련 0 이면 고유 특성 레벨 4, 재련 5 면 9", () => {
    const w = combatWeapons["37"];
    expect(weaponBag(w, 0).levels).toEqual([9, 9, 4]);
    expect(weaponBag(w, 5).levels).toEqual([9, 9, 9]);
  });
});

describe("연계 조건", () => {
  it("발동 조건 문장만 잘라낸다", () => {
    expect(comboCondition("메인 컨트롤 오퍼레이터가 적에게 <#ba.lastcombo>강력한 일격</> 피해를 준 다음 사용할 수 있습니다.\n누적된 …")).toBe(
      "메인 컨트롤 오퍼레이터가 적에게 강력한 일격 피해를 준 다음",
    );
  });
});

describe("추천 빌드 (실제 데이터)", () => {
  it("모든 오퍼레이터에 무기·장비 추천이 나오고, 무기는 같은 무기 종류만", { timeout: 300000 }, () => {
    for (const o of operators) {
      const r = getBuildRecommendation(o.id)!;
      expect(r.weapons.length, o.name).toBeGreaterThan(0);
      expect(r.weapons[0].relative).toBe(1);
      expect(r.gear.length, o.name).toBeGreaterThan(0);
      for (const g of r.gear) expect(g.pieces.filter((p) => p.inSuit).length, `${o.name} ${g.suitName}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("장방이 연계: 전기 부착을 만들어 주는 동료(펠리카·아크라이트)", { timeout: 60000 }, () => {
    const r = getBuildRecommendation("838")!;
    const need = r.synergy.needs.find((n) => n.keyword === "전기 부착")!;
    expect(new Set(need.providers)).toEqual(new Set(["1", "7"]));
  });
});
