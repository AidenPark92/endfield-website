import { describe, expect, it } from "vitest";
import detailsJson from "@data/operator-details.json";
import statsJson from "@data/operator-stats.json";
import operatorsJson from "@data/operators.json";
import { milestoneStatsAt } from "@/lib/calc/operator-stats";
import type { OperatorDetails, OperatorStats } from "@/types/game";

const details = detailsJson.operators as unknown as Record<string, OperatorDetails>;
const curves = statsJson.stats as Record<string, OperatorStats>;
const SKILL_TYPES = ["일반 공격", "배틀 스킬", "연계 스킬", "궁극기"];

describe("operator-details.json (공식 위키)", () => {
  it("operators.json 의 모든 오퍼레이터가 있다", () => {
    for (const o of operatorsJson.operators as { id: string }[]) expect(details[o.id], o.id).toBeDefined();
  });

  it("스킬 4종 · 랭크 12단계 · 잠재 5개 · 능력치 6레벨", () => {
    for (const [id, d] of Object.entries(details)) {
      expect(new Set(d.skills.map((s) => s.type)), id).toEqual(new Set(SKILL_TYPES));
      for (const s of d.skills) {
        expect(s.ranks, `${id} ${s.name}`).toHaveLength(12);
        for (const p of s.params) expect((p.values ?? p.raw)!.length, `${id} ${s.name} ${p.label}`).toBe(12);
      }
      expect(d.potentials.map((p) => p.level), id).toEqual([1, 2, 3, 4, 5]);
      expect(d.stats.levels).toEqual([1, 20, 40, 60, 80, 90]);
      for (const k of ["str", "agi", "int", "wil", "atk", "hp"] as const) expect(d.stats[k], `${id} ${k}`).toHaveLength(6);
    }
  });

  it("배틀 스킬은 스킬 게이지를 소모한다", () => {
    for (const [id, d] of Object.entries(details))
      for (const s of d.skills.filter((s) => s.type === "배틀 스킬")) {
        const sp = s.params.find((p) => p.label === "스킬 게이지 소모");
        expect(sp?.values?.[0], `${id} ${s.name}`).toBeGreaterThan(0);
      }
  });

  // 서로 다른 두 출처(게임 테이블 곡선 vs 공식 위키 표)를 맞대어 본다.
  // 아래 목록은 위키 표기 오류로 보이는 칸 — 새 불일치가 생기면 테스트가 실패해 알려 준다.
  const KNOWN_WIKI_TYPOS = new Set(["12:str:80", "12:int:90", "15:atk:60", "15:hp:60", "16:wil:1"]);
  it("게임 테이블(내림)과 위키 6레벨 값이 일치한다 (알려진 위키 오기 제외)", () => {
    const keys = ["str", "agi", "int", "wil", "atk", "hp"] as const;
    const mismatches: string[] = [];
    for (const [id, curve] of Object.entries(curves)) {
      const m = details[id].stats;
      m.levels.forEach((lv, i) => {
        for (const k of keys) if (Math.floor(curve[k][lv - 1] + 1e-6) !== m[k][i]) mismatches.push(`${id}:${k}:${lv}`);
      });
    }
    expect(mismatches.filter((x) => !KNOWN_WIKI_TYPOS.has(x))).toEqual([]);
  });

  it("6레벨 값만으로 능력치 보너스를 계산한다", () => {
    const s = milestoneStatsAt(details["1174"].stats, 90)!;
    expect(s.atk).toBe(309);
    expect(s.attrBonus).toBeCloseTo(1 + 0.005 * s.main + 0.002 * s.sub);
    expect(milestoneStatsAt(details["1174"].stats, 55)).toBeUndefined();
  });
});
