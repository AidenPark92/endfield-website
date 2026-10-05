// 팀 로테이션: SP 공유 · 연계 기회 · 스킬 버프 가동률 · 부착 순도
import { describe, expect, it } from "vitest";
import { quickTeamDamage, simulateTeam, SP_REGEN, MAX_BATTLE_RATE, type RotMember } from "./rotation";
import { emptyBag, type OperatorBase, type Rotation } from "./build";
import type { OperatorKit } from "./weapon-value";
import { buffApplies, buffBag, extractSkillBuffs, type SkillBuff } from "./team-buffs";

const rot = (over: Partial<Rotation> = {}): Rotation => ({
  battleRate: 1 / 12.5,
  comboRate: 1 / 20,
  ultCost: 100,
  ultCooldown: 20,
  comboEnergy: 10,
  weight: { battle: 4, combo: 2, ult: 8 },
  ...over,
});
const member = (id: string, o: { element?: string; roleSelf?: number; rotation?: Rotation; texts?: Partial<OperatorKit["texts"]>; buffs?: SkillBuff[]; status?: RotMember["combo"]["status"]; providers?: string[]; stack?: RotMember["stackConsume"] } = {}): RotMember => {
  const element = o.element ?? "열기";
  const r = o.rotation ?? rot();
  const op: OperatorBase = { element, mainAttr: "지능", subAttr: "의지", atk: 300, attrs: { 힘: 100, 민첩: 100, 지능: 200, 의지: 120 }, critRate: 0.05, rotation: r };
  const kit: OperatorKit = { id, element, mainAttr: "지능", subAttr: "의지", rotation: r, texts: { basic: "", battle: "", combo: "", ult: "", ...o.texts }, tags: [], critRate: 0.05 };
  return {
    id,
    op,
    kit,
    weaponAtk: 500,
    bag: emptyBag(),
    extra: [],
    roleSelf: o.roleSelf ?? 1,
    combo: { status: o.status ?? "free", providers: o.providers ?? [] },
    buffs: o.buffs ?? [],
    stackConsume: o.stack,
    sp: { cost: 100, ret: 0, recover: { battle: 0, combo: 0, ult: 0 }, finalStrike: 0 },
  };
};

describe("SP 공유", () => {
  it("네 명이 나눠 써도 배틀 스킬 총 SP는 팀 SP 수입을 넘지 않음", () => {
    const team = ["a", "b", "c", "d"].map((id) => member(id));
    const r = simulateTeam(team);
    const spent = r.members.reduce((s, m) => s + m.rates.battle * 100, 0);
    expect(spent).toBeLessThanOrEqual(r.spIncome + 1e-6);
    expect(r.spIncome).toBeGreaterThanOrEqual(SP_REGEN - 1e-9);
  });
  it("배틀 스킬 배율이 큰 딜러에게 SP가 몰림 (상한 MAX_BATTLE_RATE 까지)", () => {
    const dps = member("dps", { rotation: rot({ weight: { battle: 12, combo: 2, ult: 8 } }) });
    const sup = member("sup", { roleSelf: 0, rotation: rot({ weight: { battle: 1, combo: 1, ult: 2 } }) });
    const r = simulateTeam([dps, sup]);
    const d = r.members.find((m) => m.id === "dps")!;
    expect(d.spShare).toBeGreaterThan(0.9);
    expect(d.rates.battle).toBeLessThanOrEqual(MAX_BATTLE_RATE + 1e-9);
    expect(r.mainId).toBe("dps");
  });
});

describe("연계 기회", () => {
  it("조건을 만들 동료가 없으면(off) 연계 0, 동료가 있으면(team) 쿨타임보다 느리게", () => {
    const off = simulateTeam([member("a", { status: "off" })]).members[0];
    expect(off.rates.combo).toBe(0);
    const provider = member("p");
    const needy = member("n", { status: "team", providers: ["p"] });
    const r = simulateTeam([provider, needy]).members.find((m) => m.id === "n")!;
    expect(r.rates.combo).toBeGreaterThan(0);
    expect(r.rates.combo).toBeLessThan(1 / 20);
  });
});

describe("스킬 버프 가동률", () => {
  const amp: SkillBuff = { kind: "battle", effect: "amp", value: 0.3, duration: 60, target: "team", text: "증폭" };
  it("서포터의 배틀 스킬 버프가 있으면 팀 피해 증가 · 서포터에게도 SP가 감", () => {
    const dps = member("dps", { rotation: rot({ weight: { battle: 8, combo: 2, ult: 8 } }) });
    const plain = member("sup", { roleSelf: 0, rotation: rot({ weight: { battle: 0.5, combo: 0.5, ult: 1 } }) });
    const buffer = { ...plain, buffs: [amp] };
    const a = simulateTeam([dps, plain]);
    const b = simulateTeam([dps, buffer]);
    expect(b.total).toBeGreaterThan(a.total);
    expect(b.members.find((m) => m.id === "sup")!.spShare).toBeGreaterThan(0);
    const view = b.buffs.find((x) => x.effect === "amp")!;
    expect(view.uptime).toBeGreaterThan(0);
    expect(view.uptime).toBeLessThanOrEqual(1);
  });
  it("속성 버프는 맞는 속성에만", () => {
    const b: SkillBuff = { ...amp, elems: ["냉기"] };
    expect(buffApplies(b, "냉기")).toBe(true);
    expect(buffApplies(b, "열기")).toBe(false);
    expect(buffApplies({ ...amp, elems: ["아츠"] }, "전기")).toBe(true);
    expect(buffApplies({ ...amp, elems: ["아츠"] }, "물리")).toBe(false);
    expect(buffBag(b, 0.5).amp).toBeCloseTo(0.15);
  });
  it("빠른 근사도 같은 방향", () => {
    const dps = member("dps", { rotation: rot({ weight: { battle: 8, combo: 2, ult: 8 } }) });
    const plain = member("sup", { roleSelf: 0 });
    expect(quickTeamDamage([dps, { ...plain, buffs: [amp] }]).total).toBeGreaterThan(quickTeamDamage([dps, plain]).total);
    // 지속이 짧아 유지 비용이 더 크면 버프를 버리는 쪽 — 버프 없는 것보다 나빠지지 않음
    const short = { ...amp, duration: 3 };
    expect(quickTeamDamage([dps, { ...plain, buffs: [short] }]).total).toBeGreaterThanOrEqual(quickTeamDamage([dps, plain]).total - 1e-9);
  });
});

describe("부착 스택 소모 · 순도", () => {
  const consumer = (id: string) => member(id, { element: "냉기", stack: [{ kind: "battle", perStack: 2, energyPerStack: 0, states: ["냉기 부착"] }] });
  const cryo = member("c", { element: "냉기", roleSelf: 0, texts: { combo: "적에게 냉기 부착 상태를 부여합니다." } });
  const heat = member("h", { element: "열기", roleSelf: 0, texts: { combo: "적에게 열기 부착 상태를 부여합니다." } });
  it("같은 속성 부착 동료가 있으면 스택 소모 피해가 커짐, 다른 속성이 섞이면 줄어듦(아츠 이상으로 소모)", () => {
    const alone = simulateTeam([consumer("x")], { main: 0 }).total;
    const withCryo = simulateTeam([consumer("x"), cryo], { main: 0 }).members[0].damage;
    const mixed = simulateTeam([consumer("x"), cryo, heat], { main: 0 }).members[0].damage;
    expect(withCryo).toBeGreaterThan(alone);
    expect(mixed).toBeLessThan(withCryo);
  });
});

describe("스킬 버프 추출", () => {
  it("설명 + 스킬 표 → 취약·증폭 (조건 문장 제외)", () => {
    const out = extractSkillBuffs(
      [
        { type: "배틀 스킬", text: "적에게 냉기 취약을 부여합니다.", bb: { rate_vul: 0.12, duration: 8 } },
        { type: "궁극기", text: "팀 전체에게 냉기 증폭을 부여합니다. 지능은 해당 증폭 효과를 추가로 강화합니다.", bb: { atk_up: 0.1, wisd_up: 0.0005, wisd_max: 0.1, duration: 12 } },
        { type: "연계 스킬", text: "적이 냉기 취약 상태를 부여받았을 때 사용할 수 있습니다.", bb: { rate: 0.5 } },
      ],
      { 힘: 0, 민첩: 0, 지능: 100, 의지: 0 },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "battle", effect: "vuln", elems: ["냉기"], value: 0.12, duration: 8, target: "enemy" });
    expect(out[1]).toMatchObject({ kind: "ult", effect: "amp", target: "team", duration: 12 });
    expect(out[1].value).toBeCloseTo(0.15);
  });
});
