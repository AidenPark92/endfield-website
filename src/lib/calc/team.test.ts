import { describe, expect, it } from "vitest";
import { comboRequirement, evaluateTeam, rankTeams, teamStates, type TeamCandidate } from "./team";
import { allTeams, bestTeamsFor, comboRequirementOf, hasSustain, partyBuild, teamRoleOf, teamScore, teamSim, teamWeaponsOf } from "@/lib/data";

// 용어 찾기 대역 (테스트용 — 실제는 glossary 의 splitTerms)
const TERMS = ["전기 부착", "냉기 부착", "열기 부착", "자연 부착", "아츠 부착", "아츠 이상", "감전", "방어 불능", "강력한 일격", "불균형"];
const find = (t: string) => TERMS.filter((k) => t.includes(k));
const c = (id: string, tags: string[], comboDesc: string | null = null): TeamCandidate => ({ id, group: id, tags, comboDesc });

describe("comboRequirement", () => {
  it("혹은/또는 은 OR, 동시에 는 AND", () => {
    expect(comboRequirement("적이 전기 부착 혹은 감전 상태일 때 사용할 수 있습니다", find)).toEqual({ kind: "any", keywords: ["전기 부착", "감전"] });
    expect(comboRequirement("적이 동시에 방어 불능과 아츠 부착 상태일 때 사용할 수 있습니다", find)).toEqual({ kind: "all", keywords: ["아츠 부착", "방어 불능"] });
  });
  it("부정 조건·누구나 만드는 조건은 팀과 무관", () => {
    expect(comboRequirement("방어 불능 혹은 아츠 부착 상태에 처해 있지 않은 적에게 강력한 일격을 준 후 사용할 수 있습니다", find).kind).toBe("free");
    expect(comboRequirement("불균형 상태인 적이 있을 때 사용할 수 있습니다", find).kind).toBe("free");
    expect(comboRequirement("팀 내 다른 오퍼레이터의 연계 스킬이 피해를 줄 때 사용할 수 있습니다", find).kind).toBe("teamCombo");
  });
});

describe("teamStates", () => {
  it("아츠 이상은 다른 속성 부착 동료가 있어야 성립", () => {
    expect(teamStates([c("a", ["전기 부착"])]).has("감전")).toBe(false);
    expect(teamStates([c("a", ["전기 부착"]), c("b", ["냉기 부착"])]).get("감전")).toEqual(new Set(["a", "b"]));
    // 한 명이 두 속성 (플루라이트)
    expect(teamStates([c("a", ["자연 부착", "냉기 부착"])]).has("동결")).toBe(true);
  });
});

describe("evaluateTeam", () => {
  const reqs: Record<string, ReturnType<typeof comboRequirement>> = {
    a: { kind: "any", keywords: ["감전"] },
    b: { kind: "free" },
    m: { kind: "teamCombo" },
    x: { kind: "any", keywords: ["방어 불능"] },
  };
  it("동료가 만든 상태로 연계가 열리면 team, 관리자는 다른 연계가 있으면 발동", () => {
    const t = evaluateTeam([c("a", ["전기 부착"]), c("b", ["냉기 부착"]), c("m", []), c("x", [])], (id) => reqs[id]);
    const st = Object.fromEntries(t.members.map((m) => [m.id, m.status]));
    expect(st).toEqual({ a: "team", b: "free", m: "team", x: "off" });
    expect(t.active).toBe(3);
    expect(t.members.find((m) => m.id === "a")!.from).toEqual([{ keyword: "감전", ids: ["b"] }]);
  });
  it("같은 캐릭터(group)는 한 조합에 넣지 않음", () => {
    const pool = ["1", "2", "3", "4", "5"].map((id) => ({ ...c(id, []), group: id === "5" ? "4" : id }));
    expect(rankTeams(pool, () => ({ kind: "free" })).length).toBe(2); // C(5,4)=5 중 4·5 동시 포함 3개 제외
  });
});

describe("실데이터", () => {
  it("모든 조합 평가 · 오퍼레이터마다 베스트 조합 존재", { timeout: 300000 }, () => {
    const all = allTeams();
    expect(all.length).toBeGreaterThan(30000);
    expect(all[0].score).toBeGreaterThanOrEqual(all[all.length - 1].score);
    expect(bestTeamsFor("838")[0].ids).toContain("838");
  });
  it("장방이는 전기 부착이 필요 → 베스트 조합에 전기 부착 동료(펠리카·아크라이트) 포함", () => {
    expect(comboRequirementOf("838")).toEqual({ kind: "any", keywords: ["전기 부착"] });
    for (const t of bestTeamsFor("838")) expect(t.ids.some((id) => id === "1" || id === "7")).toBe(true);
  });
  it("로시는 방어 불능 + 아츠 부착 둘 다 필요 (AND)", () => {
    expect(comboRequirementOf("615").kind).toBe("all");
  });
});

describe("일반 / 고난이도 · 팀 무기", () => {
  it("일반 콘텐츠 점수 = 시뮬레이션 초당 피해 그대로 (치유 담당 없어도 보정 없음)", () => {
    const noHeal = ["17", "25", "24", "5"]; // 라스트 라이트·탕탕·플루라이트·아케쿠리
    expect(hasSustain(noHeal)).toBe(false);
    expect(teamScore(noHeal)).toBeCloseTo(teamSim(noHeal)!.dps, 6);
  });
  it("고난이도 조합은 생존 담당(치유 또는 디펜더) 포함", { timeout: 300000 }, () => {
    const hard = bestTeamsFor("838", 3, "hard");
    expect(hard.length).toBeGreaterThan(0);
    for (const t of hard) expect(hasSustain(t.ids)).toBe(true);
  });
  it("팀 역할 비중에 치유·생존 없음 (직업군 비중은 유지)", () => {
    for (const id of ["1041", "19", "13", "15", "16"]) {
      const r = teamRoleOf(id);
      expect(r.heal).toBe(0);
      expect(r.survival).toBe(0);
      expect(r.self + r.dealer).toBeCloseTo(1, 6);
    }
    expect(teamRoleOf("838").self).toBe(1); // 스트라이커 = 본인 딜
  });
  it("파티는 멤버마다 무기를 고르고, 무기 공격력이 시뮬레이션에 들어감", { timeout: 300000 }, () => {
    const ids = ["838", "1", "7", "1041"];
    const p = partyBuild(ids)!;
    for (const m of p.members) {
      expect(m.weapon).toBeDefined();
      expect(teamWeaponsOf(m.id).map((w) => w.id)).toContain(m.weapon!.id);
    }
    for (const f of p.finals) expect(f.weaponAtk).toBeGreaterThan(0);
    // 파티 빌드(시뮬레이션 검증)는 1차 빌드보다 약하지 않음
    expect(teamSim(ids, p)!.dps).toBeGreaterThanOrEqual(teamSim(ids)!.dps * 0.98);
    expect(p.gain).toBeGreaterThanOrEqual(1);
  });
});
