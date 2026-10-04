import { describe, expect, it } from "vitest";
import { effectBlackboard, evalExpr, formatValue, renderTemplate } from "./skill-text";
import combatJson from "@data/combat/characters.json";
import type { CombatCharacter } from "@/types/combat";

const chars = (combatJson as unknown as { characters: Record<string, CombatCharacter> }).characters;
const plain = (t: string | null, bb = {}) => renderTemplate(t, bb).segments.map((s) => s.text).join("");

describe("evalExpr / formatValue", () => {
  it("키와 더하기·빼기", () => {
    expect(evalExpr("atk_up", { atk_up: 0.2 })).toBe(0.2);
    expect(evalExpr("1-costvalue", { costvalue: 0.85 })).toBeCloseTo(0.15);
    expect(evalExpr("duration-1", { duration: 1.75 })).toBeCloseTo(0.75);
    expect(evalExpr("-coolDown", { coolDown: -2 })).toBe(2);
    expect(evalExpr("nope", {})).toBeUndefined();
  });
  it("표시 형식", () => {
    expect(formatValue(0.2, "0%")).toBe("20%");
    expect(formatValue(0.448, "0.0%")).toBe("44.8%");
    expect(formatValue(5, "0")).toBe("5");
    expect(formatValue(50)).toBe("50");
  });
});

describe("renderTemplate", () => {
  it("태그를 구간으로 나누고 값을 채운다", () => {
    const r = renderTemplate("공격력 <@ba.vup>+{atk_up:0%}</>, <#ba.conduct>감전</>", { atk_up: 0.2 });
    expect(r.segments).toEqual([
      { text: "공격력 ", tone: "plain" },
      { text: "+20%", tone: "value" },
      { text: ", ", tone: "plain" },
      { text: "감전", tone: "keyword" },
    ]);
    expect(r.missing).toEqual([]);
  });
  it("값이 없으면 ?", () => {
    const r = renderTemplate("{x:0%}", {});
    expect(r.segments[0].text).toBe("?");
    expect(r.missing).toEqual(["x"]);
  });
});

describe("실제 데이터 — 펠리카 잠재", () => {
  const p = chars["1"].potentials;
  it("잠재 1: 감전 지속 +75%", () => {
    expect(plain(p[0].desc, effectBlackboard(p[0].effects))).toContain("+75%");
  });
  it("잠재 2: 궁극기 에너지 -15%", () => {
    expect(plain(p[1].desc, effectBlackboard(p[1].effects))).toContain("-15%");
  });
  it("잠재 3: 5초 동안 공격력 +20%, 최대 2스택", () => {
    const t = plain(p[2].desc, effectBlackboard(p[2].effects));
    expect(t).toContain("5초");
    expect(t).toContain("+20%");
    expect(t).toContain("2스택");
  });
});

describe("실제 데이터 — 능력치·쿨타임 잠재", () => {
  it("진천우 잠재: 민첩 +15, 물리 피해 +8%", () => {
    const p = chars["4"].potentials.find((p) => p.name === "가문의 무술")!;
    const t = plain(p.desc, effectBlackboard(p.effects));
    expect(t).toContain("+15");
    expect(t).toContain("+8%");
  });
  it("진천우 잠재: 연계 쿨타임 -3초", () => {
    const p = chars["4"].potentials.find((p) => p.name === "세상을 짊어진 마음")!;
    expect(plain(p.desc, effectBlackboard(p.effects))).toContain("-3초");
  });
  it("모든 잠재·재능 설명의 값이 채워진다", () => {
    const missing: string[] = [];
    for (const c of Object.values(chars))
      for (const p of [...c.potentials, ...c.talents.passives]) {
        const r = renderTemplate(p.desc, effectBlackboard(p.effects));
        if (r.missing.length) missing.push(`${c.name} ${p.name}: ${r.missing.join(",")}`);
      }
    expect(missing).toEqual([]);
  });
});

describe("combat/characters.json 무결성", () => {
  it("전원 스킬 4종(결은 형태별 중복 허용), 레벨 1~12, 잠재 5개", () => {
    for (const [id, c] of Object.entries(chars)) {
      expect(new Set(c.skillGroups.map((g) => g.type)), id).toEqual(new Set(["일반 공격", "배틀 스킬", "연계 스킬", "궁극기"]));
      for (const g of c.skillGroups) for (const s of g.skills) expect(s.levels.length, `${id} ${s.skillId}`).toBe(12);
      expect(c.potentials.map((p) => p.level), id).toEqual([1, 2, 3, 4, 5]);
    }
  });
  it("공식 위키 표기 오류였던 칸의 실제 값", () => {
    const disp = (id: string, name: string, part: string, lv: number) =>
      chars[id].skillGroups.find((g) => g.name === name)!.skills.find((s) => s.part === part)!.levels[lv - 1].display;
    expect(disp("4", "견천하", "combo_skill", 7)[0].value).toBe("192%");
    expect(disp("8", "돌려가며 썰기!", "attack2", 8)[0].value).toBe("57%");
    expect(disp("10", "썬더랜스 · 결전의 떨림", "ultimate_skill", 7)[0].value).toBe("675%");
  });
});
