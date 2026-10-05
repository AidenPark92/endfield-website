// 파티 장비 최적화: 상태 공급 · 팀 버프 중첩 규칙
import { describe, expect, it } from "vitest";
import { consumedStates, optimizeParty, stateSupply, supplyFactor, type PartyMember } from "./party";
import { ASSUME, emptyBag, rates, type OperatorBase, type Rotation } from "./build";
import type { OperatorKit, RoleWeight } from "./weapon-value";
import type { GearSuit } from "@/types/build";

const rot: Rotation = { battleRate: 1 / 12.5, comboRate: 1 / 20, ultCost: 100, ultCooldown: 20, comboEnergy: 10, weight: { battle: 3, combo: 2, ult: 8 } };
const kitOf = (element: string, texts: Partial<OperatorKit["texts"]> = {}): OperatorKit => ({
  element,
  mainAttr: "지능",
  subAttr: "의지",
  rotation: rot,
  texts: { basic: "", battle: "", combo: "", ult: "", ...texts },
  tags: [],
  critRate: 0.05,
});
const op: OperatorBase = { element: "전기", mainAttr: "지능", subAttr: "의지", atk: 300, attrs: { 힘: 100, 민첩: 100, 지능: 200, 의지: 120 }, critRate: 0.05, rotation: rot };

describe("상태 공급", () => {
  const consumer = kitOf("전기", { battle: "목표의 감전 상태를 소모하여 피해 배율을 증가시킵니다.", combo: "적이 감전 상태일 때 사용할 수 있습니다." });
  const supplier = kitOf("전기", { combo: "목표를 강타하며 짧은 강제 감전 상태를 부여합니다." });
  it("발동 조건 문장은 소모로 보지 않음", () => {
    expect(consumedStates(consumer).map((c) => [c.state, c.kinds])).toEqual([["감전", ["battle"]]]);
  });
  it("공급이 없으면 1 − α, 많을수록 1에 가까움", () => {
    const r = rates(rot, 0);
    expect(supplyFactor(consumer, r, [{ kit: consumer, rates: r }])).toBeCloseTo(1 - ASSUME.consumeDependency);
    const one = supplyFactor(consumer, r, [{ kit: consumer, rates: r }, { kit: supplier, rates: r }]);
    const faster = supplyFactor(consumer, r, [{ kit: consumer, rates: r }, { kit: supplier, rates: rates(rot, 0, 0.15) }]);
    expect(one).toBeGreaterThan(1 - ASSUME.consumeDependency);
    expect(faster).toBeGreaterThan(one); // 공급자의 연계 쿨타임 감소 → 공급 증가
    expect(stateSupply("감전", [{ kit: supplier, rates: r }])).toBeCloseTo(1 / 20);
  });
});

describe("팀 버프 중첩", () => {
  const suits = new Map<string, GearSuit>([
    ["tw", { name: "팀 전체", tier: 4, pieces: [], effects: [{ pieces: 3, desc: "팀 전체가 주는 피해 +{dmg_up:0%}", bb: { dmg_up: 0.2 } }] }],
    ["self", { name: "본인", tier: 4, pieces: [], effects: [{ pieces: 3, desc: "장착자의 공격력 +{atk_up:0%}", bb: { atk_up: 0.1 } }] }],
  ]);
  const role = (self: number, dealer: number): RoleWeight => ({ label: "", self, dealer, heal: 0, survival: 0 });
  const member = (id: string, r: RoleWeight, cands: string[]): PartyMember => ({
    id,
    op,
    kit: { ...kitOf("전기"), id },
    role: r,
    weaponAtk: 500,
    base: emptyBag(),
    candidates: cands.map((sid) => ({ suitId: sid, suitName: sid, pieces: [] })),
  });
  it("'팀 전체' 버프는 한 명만 — 둘 다 개인 1위로 들고 있어도 한 명은 자기 세트로", () => {
    const res = optimizeParty(
      [member("S", role(1, 0), ["self"]), member("A", role(0.2, 0.8), ["tw", "self"]), member("B", role(0.2, 0.8), ["tw", "self"]), member("C", role(1, 0), ["self"])],
      new Map(),
      suits,
    );
    const tw = res.picks.filter((p, i) => [1, 2].includes(i) && p.pick === 0);
    expect(tw).toHaveLength(1);
    expect(res.gain).toBeGreaterThanOrEqual(1);
  });
});
