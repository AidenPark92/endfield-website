import { describe, expect, it } from "vitest";
import { damageWeight, parseTrait, triggerRate, type OperatorKit } from "./weapon-value";
import { rates, type Rotation } from "./build";
import { getBuildRecommendation, operators } from "@/lib/data";

const rot: Rotation = { battleRate: 1 / 12.5, comboRate: 1 / 20, ultCost: 100, ultCooldown: 20, comboEnergy: 10, weight: { battle: 3, combo: 2, ult: 8 } };
const kit: OperatorKit = {
  element: "자연",
  mainAttr: "지능",
  subAttr: "의지",
  rotation: rot,
  texts: { basic: "", battle: "적에게 자연 피해를 주고 자연 부착을 부여합니다.", combo: "구속 및 취약", ult: "" },
  tags: ["자연 부착"],
};

describe("회전", () => {
  it("궁극기 주기 = 필요 에너지 ÷ 초당 에너지, 충전 효율 반영", () => {
    const e = 6.5 / 12.5 + 10 / 20; // 1.02/초
    expect(1 / rates(rot, 0).ult).toBeCloseTo(100 / e);
    expect(1 / rates(rot, 0.5).ult).toBeCloseTo(100 / (e * 1.5));
    expect(1 / rates({ ...rot, ultCost: 10 }, 0).ult).toBe(20); // 쿨타임보다 짧을 수 없음
  });
  it("피해 배율 합: 같은 라벨(형태별)은 큰 값 하나, 취약·불균형 제외", () => {
    expect(damageWeight([{ label: "피해 배율", value: "222%" }, { label: "피해 배율", value: "133%" }, { label: "불균형치", value: "10" }, { label: "물리 취약 배율", value: "15%" }])).toBeCloseTo(2.22);
  });
});

describe("고유 특성 해석", () => {
  it("조건 없는 줄 / 스킬 사용 조건 / 지속 시간", () => {
    const fx = parseTrait("치명타 확률 <@ba.vup>+{crit_up:0.0%}</>\n장착자가 궁극기를 사용할 때, 아츠 피해 +{spell_dmg_up:0.0%}, {duration:0}초 동안 지속.", { crit_up: 0.14, spell_dmg_up: 0.672, duration: 15 });
    expect(fx.map((e) => [e.zone, e.value, e.cond !== "", e.duration])).toEqual([["crit", 0.14, false, undefined], ["dmg", 0.672, true, 15]]);
  });
  it("% 없는 공격력은 고정 공격력", () => {
    expect(parseTrait("공격력 +{atk_up:0}", { atk_up: 33.6 })[0].zone).toBe("flatAtk");
  });
  it("능력치 조건 구간 · 다른 동료 전용 효과", () => {
    const fx = parseTrait("장착자의 지능 수치 ≥ 의지 수치: 장착자가 자신의 스킬로 아츠 부착을 부여할 경우, 주는 아츠 피해 +{a:0.0%}, {duration:0}초 동안 지속.\n장착자가 궁극기를 사용할 때, 팀 내의 다른 오퍼레이터가 주는 아츠 피해 +{b:0.0%}, {duration:0}초 동안 지속.", { a: 0.56, b: 0.1, duration: 20 });
    expect(fx[0].gate).toEqual({ a: "지능", op: ">=", b: "의지" });
    expect(fx[1].skip).toBe("다른 동료에게만 주는 효과");
  });
  it("중첩 안내 줄은 앞 효과에 적용", () => {
    const fx = parseTrait("장착자가 배틀 스킬을 사용할 때, 공격력 +{atk_up:0.0%}, {duration:0}초 동안 지속.\n같은 이름의 효과는 최대 {max_stack:0}스택까지 중첩되며", { atk_up: 0.1, duration: 30, max_stack: 3 });
    expect(fx[0].maxStack).toBe(3);
  });
});

describe("발동 판정", () => {
  const r = rates(rot, 0);
  it("스킬 사용 → 그 스킬 빈도", () => {
    expect(triggerRate("장착자가 연계 스킬을 사용할 때", kit, r)).toMatchObject({ rate: 1 / 20 });
  });
  it("상태 부여 → 그 상태를 만드는 자기 스킬 빈도, 못 만들면 0", () => {
    expect(triggerRate("장착자가 자신의 스킬로 아츠 부착을 부여할 경우", kit, r)).toMatchObject({ rate: 1 / 12.5 });
    expect(triggerRate("장착자가 적에게 감전을 부여할 때", kit, r).rate).toBe(0);
  });
});

describe("실데이터", () => {
  it("결: 전용 무기 42식 · 척결이 1위 (아츠 부착·아츠 취약 조건을 스스로 충족)", { timeout: 60000 }, () => {
    const id = operators.find((o) => o.name === "결")!.id;
    const r = getBuildRecommendation(id)!;
    expect(r.weapons[0].name).toBe("42식 · 척결");
    expect(r.weapons[0].applied.length).toBeGreaterThanOrEqual(3);
  });
  it("모든 오퍼레이터 1위 = 100%, 점수 내림차순", { timeout: 120000 }, () => {
    for (const o of operators) {
      const w = getBuildRecommendation(o.id)!.weapons;
      expect(w[0].relative, o.name).toBe(1);
      for (let i = 1; i < w.length; i++) expect(w[i].relative).toBeLessThanOrEqual(w[i - 1].relative);
    }
  });
});
