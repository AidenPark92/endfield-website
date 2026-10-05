// 장비 세트 효과 해석 · 중첩 모델 · 탐색 규칙 (커뮤니티 보정 작업에서 추가한 부분)
import { describe, expect, it } from "vitest";
import { evaluateSuitEffect, parseTrait, rankGearByValue, stackModel, type OperatorKit } from "./weapon-value";
import { emptyBag, rates, type OperatorBase, type Rotation } from "./build";
import type { GearPiece, GearSuit } from "@/types/build";
import type { AttrName } from "@/types/game";

const rot: Rotation = { battleRate: 1 / 12.5, comboRate: 1 / 20, ultCost: 100, ultCooldown: 20, comboEnergy: 10, weight: { battle: 3, combo: 2, ult: 8 } };
const kit: OperatorKit = {
  element: "자연",
  mainAttr: "지능",
  subAttr: "의지",
  rotation: rot,
  texts: { basic: "", battle: "적에게 자연 피해를 주고 자연 부착을 부여합니다.", combo: "", ult: "" },
  tags: [],
  critRate: 0.05,
};
const attrs: Record<AttrName, number> = { 힘: 100, 민첩: 100, 지능: 200, 의지: 120 };

describe("세트 효과 문장", () => {
  it("본 크러셔: '다음 배틀 스킬의 피해'는 연계 스킬로 쌓아 배틀 스킬에 소모, 중첩 한도 문장은 앞 효과에", () => {
    const desc = "장착자의 공격력 +{atk_up:0%}\n장착자가 연계 스킬을 사용할 때, 본 크러셔의 압박 1스택 획득, 다음 배틀 스킬의 피해 +{dmg_up:0%}. 본 크러셔의 압박은 최대 {max_stack:0}스택까지만 중첩됩니다.";
    const fx = parseTrait(desc, { atk_up: 0.15, dmg_up: 0.3, max_stack: 2 });
    expect(fx[1]).toMatchObject({ consumeBy: "battle", types: ["battle"], maxStack: 2 });
    // 연계 1/20초, 배틀 1/12.5초 → 배틀 1회가 받는 평균 스택 = (1/20)/(1/12.5) = 0.625
    const ev = evaluateSuitEffect(desc, { atk_up: 0.15, dmg_up: 0.3, max_stack: 2 }, kit, attrs);
    expect(ev.bag.dmg.battle).toBeCloseTo(0.3 * 0.625);
  });
  it("응룡 50식: 팀 내 임의 오퍼레이터의 배틀 스킬 = 본인 + 팀원 3명", () => {
    const desc = "장착자의 공격력 +{atk_up:0%}\n팀 내 임의의 오퍼레이터가 배틀 스킬을 사용할 때, 장착자가 응룡의 예리함 1스택 획득, 해당 오퍼레이터의 다음 연계 스킬 피해 +{dmg_up:0%}. 응룡의 예리함은 최대 {max_stack:0}스택까지만 중첩됩니다.";
    const ev = evaluateSuitEffect(desc, { atk_up: 0.15, dmg_up: 0.2, max_stack: 3 }, kit, attrs);
    // 팀 배틀 빈도 4/12.5 ÷ 연계 1/20 = 6.4 → 최대 3스택
    expect(ev.bag.dmg.combo).toBeCloseTo(0.6);
  });
  it("연계 스킬 쿨타임 감소: +{1-x} 표기 → 1 − x, 연계 빈도에 반영", () => {
    const ev = evaluateSuitEffect("장착자의 연계 스킬 쿨타임 감소 +{1-comboskill_cooldown:0%}", { comboskill_cooldown: 0.85 }, kit, attrs);
    expect(ev.bag.comboCdr).toBeCloseTo(0.15);
    expect(rates(rot, 0, 0.15).combo).toBeCloseTo(1 / 20 / 0.85);
  });
  it("지속 시간은 따로 계산 → 독립 지속 표시", () => {
    const fx = parseTrait("장착자가 연계 스킬을 사용할 때, 모든 스킬 피해 +{a:0%}, {duration}초 동안 지속. 해당 효과는 최대 {max_stack}스택까지 중첩되며 중첩될 때마다 지속 시간은 따로 계산됩니다.", { a: 0.2, duration: 15, max_stack: 2 });
    expect(fx[0]).toMatchObject({ separate: true, maxStack: 2 });
  });
});

describe("중첩 모델", () => {
  it("주기형: 독립 지속은 min(최대, 빈도 × 지속), 최대 스택은 빈도 × 지속 ≥ 최대일 때만", () => {
    expect(stackModel(0.1, 15, 2, { random: false, separate: true })).toEqual({ mean: 1.5, full: 0 });
    expect(stackModel(0.2, 15, 2, { random: false, separate: true })).toEqual({ mean: 2, full: 1 });
  });
  it("무작위형(치명타) 독립 지속: 포아송 — 평균 E[min(N,최대)] ≤ 최대, 최대 스택 확률은 λ가 클수록 1에 가까움", () => {
    const lo = stackModel(0.2, 5, 5, { random: true, separate: true });
    const hi = stackModel(3, 5, 5, { random: true, separate: true });
    expect(lo.mean).toBeLessThan(1);
    expect(hi.full).toBeGreaterThan(0.99);
    expect(hi.mean).toBeLessThanOrEqual(5);
  });
});

describe("탐색", () => {
  it("부품 2칸에 같은 부품 2개를 낄 수 있음", () => {
    const op: OperatorBase = { element: "자연", mainAttr: "지능", subAttr: "의지", atk: 300, attrs, critRate: 0.05, rotation: rot };
    const p = (suitId: string | null, partType: number, atk: number): GearPiece => ({ name: null, minWearLv: 70, suitId, partType, attrs: [{ attrType: 2, values: [atk], modifierType: 6 }] });
    const pieces: [string, GearPiece][] = [
      ["b", p("s", 0, 0.01)],
      ["h", p("s", 1, 0.01)],
      ["e_good", p("s", 2, 0.2)],
      ["e_bad", p("s", 2, 0.01)],
    ];
    const suits: [string, GearSuit][] = [["s", { name: "세트", tier: 4, pieces: [], effects: [{ pieces: 3, desc: "장착자의 공격력 +{atk_up:0%}", bb: { atk_up: 0.1 } }] }]];
    const [best] = rankGearByValue(op, kit, 500, emptyBag(), pieces, suits);
    expect(best.pieces.map((x) => x.id)).toEqual(["b", "h", "e_good", "e_good"]);
  });
});
