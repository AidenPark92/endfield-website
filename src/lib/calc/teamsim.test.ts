// 팀 전투 시뮬레이터: 게임 시스템(아츠 부착·이상, 물리 이상, SP·에너지, 연계 조건) 단위 검증
import { describe, expect, it } from "vitest";
import { simulate, simulateBest, type Kit, type MemberStats, type SimMember, type Ctx } from "./teamsim";

const stats = (): MemberStats => ({
  atkBase: 1000,
  atkPct: 0,
  flatAtk: 0,
  attrBonus: 1,
  dmg: { basic: 0, battle: 0, combo: 0, ult: 0, ultMode: 0 },
  elemDmg: 0,
  critRate: 0,
  critDmg: 0.5,
  critBy: { basic: 0, battle: 0, combo: 0, ult: 0, ultMode: 0 },
  critDmgBy: { basic: 0, battle: 0, combo: 0, ult: 0, ultMode: 0 },
  artsIntensity: 0,
  amp: 0,
  taken: 0,
  ultGain: 0,
  comboCdr: 0,
  attrs: { 힘: 100, 민첩: 100, 지능: 100, 의지: 100 },
});

/** 배틀 스킬 1개만 쓰는 단순 키트 */
const kit = (id: string, elem: Kit["elem"], cast: (c: Ctx) => void, o: Partial<Kit> = {}): Kit => ({
  id,
  elem,
  carry: 1,
  basic: { chain: 0, fsSp: 0, fsPoise: 0 },
  battle: { cost: 100, poise: 0, pri: () => 2, cast },
  combo: { cd: 999, poise: 0, energy: 0, cast: () => {} },
  ult: { cost: 9999, cd: 999, poise: 0, cast: () => {} },
  ...o,
});
const member = (k: Kit): SimMember => ({ id: k.id, kit: k, stats: stats() });

describe("아츠 부착 · 이상", () => {
  it("같은 속성 추가 부착 = 아츠 폭발(160%), 다른 속성 = 반응(레벨 = 소모 스택)", () => {
    let burst = 0;
    const a = kit("a", "냉기", (c) => c.infl1("냉기"));
    const r = simulate([member(a)], { sink: 0, duration: 60 });
    burst = r.reactions["아츠 폭발"] ?? 0;
    expect(burst).toBeGreaterThan(0);
    // 냉기 3스택 위에 열기 → 연소 레벨 3
    let lvl = 0;
    const b = kit("b", "열기", (c) => {
      c.infl1("냉기");
      c.infl1("냉기");
      c.infl1("냉기");
      c.infl1("열기");
      lvl = c.has("연소");
    });
    simulate([member(b)], { sink: 0, duration: 5 });
    expect(lvl).toBe(3);
  });
  it("강제 부여는 초기 피해 없음", () => {
    const f = kit("f", "전기", (c) => c.forced("감전"));
    const r = simulate([member(f)], { sink: 0, duration: 30 });
    expect(r.total).toBe(0);
    expect(r.reactions["감전"]).toBeGreaterThan(0);
  });
  it("감전 중에는 아츠 피해가 커지고 물리 피해는 그대로", () => {
    const dmg: Record<string, number[]> = { arts: [], phys: [] };
    const k = kit("k", "전기", (c) => {
      dmg.arts.push(c.hit(1, { elem: "전기" }));
      dmg.phys.push(c.hit(1, { elem: "물리" }));
      c.forced("감전");
    });
    simulate([member(k)], { sink: 0, duration: 30 });
    expect(dmg.arts[1]).toBeCloseTo(dmg.arts[0] * 1.12, 5);
    expect(dmg.phys[1]).toBeCloseTo(dmg.phys[0], 5);
  });
});

describe("물리 이상", () => {
  it("방어 불능 없을 때 띄우기는 스택만, 강타는 스택 수에 비례 (150%+150%×스택)", () => {
    const seen: number[] = [];
    const k = kit("p", "물리", (c) => {
      c.phys("띄우기"); // 0 → 1 (피해 없음)
      c.phys("띄우기"); // 1 → 2 (120%)
      c.phys("띄우기"); // 2 → 3
      seen.push(c.phys("강타")); // 3스택 소모 → 600%
    });
    simulate([member(k)], { sink: 0, duration: 3 });
    const lv = 1 + 89 / 392;
    expect(seen[0]).toBeCloseTo(1000 * 6 * lv, 3);
  });
});

describe("SP · 궁극기 에너지", () => {
  it("배틀 스킬 총 소모 SP ≤ 시작 SP + 회복", () => {
    const a = kit("a", "열기", (c) => c.hit(1));
    const b = kit("b", "열기", (c) => c.hit(1));
    const r = simulate([member(a), member(b)], { sink: 0, duration: 90 });
    const spent = r.members.reduce((s, m) => s + m.spSpent, 0);
    expect(spent).toBeLessThanOrEqual(200 + r.spGain * 90 + 1e-6);
    expect(spent).toBeGreaterThan(600);
  });
  it("배틀 스킬 1회 = 팀 전원 궁극기 에너지 6.5 (반환분 제외)", () => {
    let ultCast = 0;
    const a = kit("a", "열기", (c) => c.hit(1), { ult: { cost: 13, cd: 999, poise: 0, cast: () => void ultCast++ } });
    simulate([member(a)], { sink: 0, duration: 1 });
    expect(ultCast).toBe(0); // 1회(6.5)로는 부족
    simulate([member(a)], { sink: 0, duration: 4 });
    expect(ultCast).toBe(1); // 2회(13) → 궁극기
  });
  it("메인 딜러 후보 중 팀 피해가 큰 운영을 고름", () => {
    const strong = kit("s", "열기", (c) => c.hit(5));
    const weak = kit("w", "열기", (c) => c.hit(1));
    const r = simulateBest([member(weak), member(strong)]);
    expect(r.members[1].casts.battle).toBeGreaterThan(r.members[0].casts.battle);
  });
});

describe("연계 스킬", () => {
  it("조건 이벤트 후에만 발동 · 쿨타임 지킴", () => {
    const maker = kit("m", "냉기", (c) => c.infl1("냉기"), { carry: 0.5 });
    maker.battle.pri = () => 3;
    const casts: number[] = [];
    const user = kit("u", "냉기", (c) => c.hit(1), {
      combo: { cd: 10, poise: 0, energy: 0, on: (c, e) => e.type === "inflApplied" && e.elem === "냉기", cast: (c) => void casts.push(c.t) },
    });
    simulate([member(user), member(maker)], { sink: 0, duration: 60 });
    expect(casts.length).toBeGreaterThan(0);
    for (let i = 1; i < casts.length; i++) expect(casts[i] - casts[i - 1]).toBeGreaterThanOrEqual(10 - 1e-9);
    // 부착을 만드는 동료가 없으면 0
    const casts2: number[] = [];
    const lone = kit("u", "냉기", (c) => c.hit(1), {
      combo: { cd: 10, poise: 0, energy: 0, on: (c, e) => e.type === "inflApplied", cast: (c) => void casts2.push(c.t) },
    });
    simulate([member(lone)], { sink: 0, duration: 60 });
    expect(casts2.length).toBe(0);
  });
  it("연타: 다음 배틀 스킬 +30%(1스택) 후 소모", () => {
    const dmg: number[] = [];
    let first = true;
    const k = kit("k", "물리", (c) => {
      if (first) {
        first = false;
        c.link(1);
        dmg.push(c.hit(1, { kind: "battle" }));
        return;
      }
      dmg.push(c.hit(1, { kind: "battle", linkable: true }));
    });
    simulate([member(k)], { sink: 0, duration: 30 });
    expect(dmg[1]).toBeCloseTo(dmg[0] * 1.3, 5);
    expect(dmg[2]).toBeCloseTo(dmg[0], 5);
  });
});
