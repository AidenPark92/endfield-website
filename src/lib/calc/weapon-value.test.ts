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
  it("능력치 조건 구간 · 팀원 전용 효과", () => {
    const fx = parseTrait("장착자의 지능 수치 ≥ 의지 수치: 장착자가 자신의 스킬로 아츠 부착을 부여할 경우, 주는 아츠 피해 +{a:0.0%}, {duration:0}초 동안 지속.\n장착자가 궁극기를 사용할 때, 팀 내의 다른 오퍼레이터가 주는 아츠 피해 +{b:0.0%}, {duration:0}초 동안 지속.", { a: 0.56, b: 0.1, duration: 20 });
    expect(fx[0].gate).toEqual({ a: "지능", op: ">=", b: "의지" });
    expect([fx[1].self, fx[1].others]).toEqual([false, 1]); // 팀원 전용 → 팀 시너지로
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

describe("팀 시너지", () => {
  it("3인 편성에 조건 제공자가 1명 이상 있을 확률", async () => {
    const { atLeastOne } = await import("./weapon-value");
    expect(atLeastOne(10, 0)).toBe(0);
    expect(atLeastOne(10, 1)).toBeCloseTo(0.3); // 1 − C(9,3)/C(10,3)
    expect(atLeastOne(10, 8)).toBe(1);
  });
  it("효과 대상: 팀 전체 / 다른 팀원 / 적이 받는 피해 / 절반", () => {
    const fx = parseTrait(
      "장착자가 궁극기를 사용할 때, 팀 전체의 공격력 +{a:0.0%}, 팀 내의 다른 오퍼레이터가 주는 아츠 피해 +{b:0.0%}, 목표가 받는 아츠 피해 +{c:0.0%}, {duration:0}초 동안 지속.\n장착자가 방어 불능 스택 수치를 소모한 후, 자신의 공격력 +{d:0.0%}, 팀 내 다른 오퍼레이터는 절반의 효과를 획득함, {duration:0}초 동안 지속.",
      { a: 0.1, b: 0.2, c: 0.3, d: 0.4, duration: 15 },
    );
    expect(fx.map((e) => [e.self, e.others])).toEqual([[true, 1], [false, 1], [true, 1], [true, 0.5]]);
  });
  it("메인 딜러: 팀원 강화 효과는 점수에서 제외", { timeout: 120000 }, () => {
    const r = getBuildRecommendation(operators.find((o) => o.name === "레바테인")!.id)!;
    expect(r.role.self).toBe(1);
    for (const w of r.weapons) {
      expect(w.team).toEqual([]);
      expect(w.dealerGain).toBe(0);
    }
  });
  it("서포터: 메인 딜러를 올려 주는 무기가 1위 (리노 찬란한 밤의 데뷔 · 아델리아 바다와 별의 꿈 · 안탈 O.B.J. 아츠 아이덴티티 — 게임 추천과 일치)", { timeout: 120000 }, () => {
    for (const [name, weapon] of [["리노", "찬란한 밤의 데뷔"], ["아델리아", "바다와 별의 꿈"], ["안탈", "O.B.J. 아츠 아이덴티티"]]) {
      const r = getBuildRecommendation(operators.find((o) => o.name === name)!.id)!;
      expect(r.role.self, name).toBe(0);
      expect(r.weapons[0].name, name).toBe(weapon);
      expect(r.weapons[0].dealerGain, name).toBeGreaterThan(0);
    }
  });
  it("치유를 받은 오퍼레이터의 공격력 = 팀원 대상 공격력 (생존 효과 아님)", () => {
    const fx = parseTrait("장착자가 자신의 스킬로 팀 내 다른 오퍼레이터를 치유할 때, 장착자의 치유를 받은 오퍼레이터의 공격력 +{atk_up:0.0%}, {duration:0}초 동안 지속.\n같은 이름의 효과는 최대 {max_stack:0}스택까지 중첩되며", { atk_up: 0.056, duration: 20, max_stack: 4 });
    expect(fx[0]).toMatchObject({ zone: "atk", self: false, others: 1, maxStack: 4 });
  });
  it("지속형 모드 주기: 3초 간격 치유 → 초당 1/3회", () => {
    const k: OperatorKit = { ...kit, texts: { ...kit.texts, battle: "범위 내의 오퍼레이터를 지속적으로 치유합니다." }, periodic: { battle: { interval: 3, duration: 60 } } };
    expect(triggerRate("장착자가 자신의 스킬로 팀 내 다른 오퍼레이터를 치유할 때", k, rates(rot, 0)).rate).toBeCloseTo(1 / 3);
  });
});

describe("모든 능력치 반영", () => {
  it("생존·치유 능력치는 버리지 않고 지표로", () => {
    const fx = parseTrait("최대 생명력 +{hp_up:0.0%}\n연계 스킬로 주는 치유 효과 +{heal_up:0.0%}\n장착자가 넘어뜨리기 피해를 줄 때, 방어력 +{def_up:0.0%}, {duration:0}초 동안 지속.", { hp_up: 0.2, heal_up: 0.3, def_up: 0.5, duration: 15 });
    expect(fx.map((e) => e.zone)).toEqual(["hp", "heal", "def"]);
  });
  it("치유량 지수: (기초 + 계수 × 능력치) × 빈도 × (1 + 치유 효율)", async () => {
    const { healIndex } = await import("./weapon-value");
    const { emptyBag } = await import("./build");
    const k: OperatorKit = { ...kit, heals: { combo: [{ base: 100, coef: 1, attr: "의지" }] } };
    const attrs = { 힘: 0, 민첩: 0, 지능: 0, 의지: 50 };
    const b = emptyBag();
    expect(healIndex(k, attrs, b)).toBeCloseTo((1 / 20) * 150);
    b.healEff = 0.5;
    expect(healIndex(k, attrs, b)).toBeCloseTo((1 / 20) * 150 * 1.5);
  });
  it("실질 생명력: 힘 1 = 생명력 5", async () => {
    const { survivalIndex } = await import("./weapon-value");
    const { emptyBag } = await import("./build");
    const b = emptyBag();
    b.str = 10;
    b.hpPct = 0.1;
    expect(survivalIndex({ ...kit, hp: 1000, def: 0 }, b)).toBeCloseTo(1050 * 1.1);
  });
  it("추가 타격 (공격력의 N배)", () => {
    const fx = parseTrait("장착자가 물리 이상 효과를 준 후, 추가로 자신의 공격력 {atk_scale:0.0%}의 물리 피해를 줍니다.", { atk_scale: 3.36 });
    expect(fx[0].extraScale).toBeCloseTo(3.36);
  });
  it("치명타 조건 = 타수 × 치명률 (일반 공격 지정)", () => {
    const t = triggerRate("장착자의 일반 공격이 치명타 피해를 준 후", { ...kit, critRate: 0.2, basicHits: 5 }, rates(rot, 0));
    expect(t.rate).toBeCloseTo((5 / 4) * 0.2);
  });
  it("실데이터: 디펜더 엠버는 천둥의 흔적 · 푸치나는 간식 시간 1위 (생존·치유 반영, 게임 추천과 일치)", { timeout: 120000 }, () => {
    for (const [name, weapon] of [["엠버", "천둥의 흔적"], ["푸치나", "간식 시간"]]) {
      expect(getBuildRecommendation(operators.find((o) => o.name === name)!.id)!.weapons[0].name, name).toBe(weapon);
    }
  });
});

describe("간주 피해 · 이상 피해", () => {
  it("미브: 개천(강타 피해로 간주)은 이상 피해 → 아츠 강도 무기(환상통)가 스킬 피해 무기(헤라펜거)보다 위, 적영 1위 · 장비 고검의 잔향", { timeout: 120000 }, () => {
    const r = getBuildRecommendation(operators.find((o) => o.name === "미브")!.id)!;
    const names = r.weapons.map((w) => w.name);
    expect(names.indexOf("환상통")).toBeLessThan(names.indexOf("헤라펜거"));
    // 추천 장비(고검의 잔향)까지 낀 상태: 적영 1위, 모범·환상통은 근소한 차 (커뮤니티 빌드도 환상통 9 · 모범 6)
    expect(names[0]).toBe("적영");
    expect(new Set(names.slice(1, 3))).toEqual(new Set(["환상통", "모범"]));
    expect(r.gear[0].suitName).toBe("고검의 잔향");
  });
});
