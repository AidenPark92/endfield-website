import { describe, expect, it } from "vitest";
import { effectBlackboard, evalExpr, formatValue, renderTemplate } from "./skill-text";
import combatJson from "@data/combat/characters.json";
import { getCombatCharacter } from "@/lib/data";
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
      { text: "감전", tone: "keyword", tag: "ba.conduct" },
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

describe("형태 스킬 (결: 진결 · 지혜 / 진결 · 의지)", () => {
  const c = getCombatCharacter("1040")!;
  const byType = (t: string) => c.skillGroups.find((g) => g.type === t)!;
  it("배틀·연계·궁극기는 형태 2개, 일반 공격은 없음", () => {
    expect(byType("일반 공격").forms).toBeUndefined();
    for (const t of ["배틀 스킬", "연계 스킬", "궁극기"]) expect(byType(t).forms?.map((f) => f.name)).toEqual(["진결 · 지혜", "진결 · 의지"]);
  });
  it("형태별 수치가 다르다 (배틀 스킬 M3 피해 배율 500% / 300%, 연계 쿨타임 12초 / 18초)", () => {
    const val = (t: string, form: number, label: string) => byType(t).forms![form].rows.find((r) => r.label === label)!.values[11];
    expect(val("배틀 스킬", 0, "피해 배율")).toBe("500%");
    expect(val("배틀 스킬", 1, "피해 배율")).toBe("300%");
    expect(val("연계 스킬", 0, "쿨타임")).toBe("12초");
    expect(val("연계 스킬", 1, "쿨타임")).toBe("18초");
  });
  it("게임 데이터 쪽 형태별 배율 키와 일치 (atk_scale_wisd 5 = 500%, atk_scale_will 3 = 300%)", () => {
    const bb = byType("배틀 스킬").skills[0].levels[11].bb;
    expect(bb.atk_scale_wisd).toBe(5);
    expect(bb.atk_scale_will).toBe(3);
  });
  it("기본 형태는 레벨 90 기본 능력치로 정한다", () => {
    expect(["진결 · 지혜", "진결 · 의지"]).toContain(c.defaultForm);
  });
});

import { lookupTerm, splitTerms } from "./glossary";
describe("용어 툴팁 (glossary)", () => {
  it("보인 글자로 먼저, 없으면 태그로 찾는다", () => {
    expect(lookupTerm("강력한 일격", "ba.lastcombo")?.desc).toContain("일반 공격의 마지막 단계");
    expect(lookupTerm("물리 취약", "ba.physicalvul")?.term).toBe("물리 취약");
    expect(lookupTerm("물리 취약", "ba.physicalvul")?.desc).toContain("받는 물리 피해가 증가");
    expect(lookupTerm("15", "ba.poise")).toBeUndefined();
    expect(lookupTerm("청뢰검", "ba.key")).toBeUndefined();
  });
  it("일반 문장에서 긴 용어부터 찾는다", () => {
    const parts = splitTerms("자연 피해를 주고, 자연 부착을 부여합니다.");
    expect(parts.filter((p) => p.term).map((p) => p.term)).toEqual(["자연 피해", "자연 부착"]);
  });
  it("실제 설명 문구의 용어 태그 중 자주 쓰이는 것은 모두 설명이 있다", () => {
    const missing = new Set<string>();
    const skip = new Set(["ba.vup", "ba.key", "ba.info", "ba.heal", "ba.arrowenergy", "ba.arrownum", "ba.rossi", "ba.absorb"]);
    for (const c of Object.values(chars))
      for (const t of [...c.skillGroups.map((g) => g.desc), ...c.potentials.map((p) => p.desc), ...c.talents.passives.map((p) => p.desc)])
        for (const s of renderTemplate(t, {}).segments)
          if (s.tone === "keyword" && s.tag && !skip.has(s.tag) && !/^[?\d]/.test(s.text) && !lookupTerm(s.text, s.tag)) missing.add(`${s.tag}:${s.text}`);
    expect([...missing]).toEqual([]);
  });
});

describe("중첩 태그", () => {
  it("수치 강조 안의 용어 태그를 한 덩어리 수치로 렌더링", () => {
    const r = renderTemplate("물리 피해 <@ba.vup>+[{x:0%}×<#ba.consume>소모</>한 스택 수치]</>, 끝", { x: 0.06 });
    expect(r.segments.map((s) => [s.text, s.tone])).toEqual([
      ["물리 피해 ", "plain"],
      ["+[6%×소모한 스택 수치]", "value"],
      [", 끝", "plain"],
    ]);
  });
});
