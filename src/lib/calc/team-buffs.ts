// 스킬이 주는 팀 버프·적 디버프 (순수 함수) — 조합 평가(로테이션 모델)에서 "시너지"의 핵심
//
// 서포터·서브 딜러의 가치는 대부분 스킬이 주는 증폭·취약·공격력 버프와 아츠/물리 이상 디버프에서 나온다.
// 무기·장비 특성 해석기(weapon-value)는 이 부분을 보지 않으므로 스킬 설명 문장 + 스킬 표(bb) 값으로 따로 뽑는다.
//   증폭: 피해 공식의 별도 곱연산 구간 1 + Σ증폭 ✅ (combat-mechanics §7) → StatBag.amp
//   취약: 1 + Σ취약 ✅ — 지금은 "받는 피해 증가" 구간(StatBag.taken)에 합친다 (TODO: 구간 분리)
// 이상 디버프(combat-mechanics §5·6, 레벨 1 기준 — 강제 부여는 레벨 1 📘, 반응 레벨은 실측 전 TODO):
//   감전: 받는 아츠 피해 +12% · 12초 📘 / 갑옷 파괴: 받는 물리 피해 +12% · 12초 ✅ / 부식: 모든 저항 −3.6→12 (15초 평균 ≈ 8) 📘
import { emptyBag, type StatBag } from "./build";
import type { AttrName } from "@/types/game";

export type SkillKind3 = "battle" | "combo" | "ult";
const KIND: Record<string, SkillKind3> = { "배틀 스킬": "battle", "연계 스킬": "combo", 궁극기: "ult" };
const ELEMS = ["물리", "열기", "전기", "냉기", "자연"] as const;

export interface SkillBuff {
  /** 어떤 스킬이 거는지 */
  kind: SkillKind3 | "state";
  effect: "amp" | "vuln" | "atk";
  /** 적용 속성 (없으면 전부). "아츠" = 물리 제외 */
  elems?: string[];
  value: number;
  duration: number;
  /** team = 팀 전체, main = 메인 컨트롤(딜러) 1명, enemy = 적 디버프(팀 전체 이득) */
  target: "team" | "main" | "enemy";
  text: string;
  /** 이상 디버프: 그 상태 이름 (파티 공급 빈도로 가동률 계산) */
  state?: string;
}

export interface SkillText {
  type: string;
  text: string;
  bb: Record<string, number>;
}

const VALUE_KEYS = ["spell_vulnerable_rate", "rate_vul_base", "rate_spellvulnerable", "phy_resist_down", "rate_vul", "rate", "atk_up"];
const DURATION_KEYS = ["duration_vul", "duration_spellvulnerable", "buff_duration", "ultmusic_duration", "music_duration", "bat_duration", "duration"];

const elemsIn = (phrase: string, word: string): string[] | undefined => {
  const out: string[] = [];
  for (const e of [...ELEMS, "아츠"]) if (new RegExp(`${e} ${word}`).test(phrase)) out.push(e);
  return out.length ? out : undefined;
};

/** 스킬 설명 + 스킬 표 → 팀 버프 목록 (값이 표에 없는 효과는 건너뜀) */
export function extractSkillBuffs(groups: SkillText[], attrs: Record<AttrName, number>): SkillBuff[] {
  const out: SkillBuff[] = [];
  for (const g of groups) {
    const kind = KIND[g.type];
    if (!kind) continue;
    const text = g.text.replace(/<[^>]*>/g, "");
    const pick = (keys: string[]) => keys.find((k) => typeof g.bb[k] === "number" && g.bb[k] > 0);
    const dur = Number(g.bb[pick(DURATION_KEYS) ?? ""] ?? 0) || 10;
    for (const s of text.split(/(?<=[.])\s*/)) {
      if (/사용할 수 있/.test(s)) continue; // 발동 조건 문장
      // 취약 (적 디버프)
      if (/취약/.test(s) && /부여/.test(s)) {
        const k = pick(VALUE_KEYS.filter((x) => x !== "atk_up"));
        if (!k) continue;
        const elems = elemsIn(s, "취약");
        if (out.some((b) => b.kind === kind && b.effect === "vuln")) continue;
        out.push({ kind, effect: "vuln", elems, value: Number(g.bb[k]), duration: dur, target: "enemy", text: s.trim() });
        continue;
      }
      // 증폭 (팀 또는 메인 컨트롤 1명)
      if (/증폭/.test(s) && /(부여|획득)/.test(s)) {
        const k = pick(["atk_up", "rate"]);
        if (!k) continue;
        let value = Number(g.bb[k]);
        // "지능은 해당 증폭 효과를 추가로 강화" / "의지에 따라 증가하는 … 증폭" → 계수 × 능력치 (상한)
        if (/지능/.test(text) && g.bb.wisd_up && g.bb.wisd_max) value += Math.min(g.bb.wisd_max, g.bb.wisd_up * attrs.지능);
        if (/의지에 따라 증가하는/.test(text) && g.bb.will_up && g.bb.will_max) value += Math.min(g.bb.will_max, g.bb.will_up * attrs.의지);
        const target = /팀 전체/.test(s) ? "team" : "main";
        out.push({ kind, effect: "amp", elems: elemsIn(s, "증폭"), value, duration: dur, target, text: s.trim() });
        continue;
      }
      // 팀 전체 공격력 증가
      if (/팀 전체의 공격력을 증가/.test(s) && g.bb.atk_up) {
        out.push({ kind, effect: "atk", value: Number(g.bb.atk_up), duration: dur, target: "team", text: s.trim() });
      }
    }
  }
  return out;
}

/** 아츠·물리 이상 디버프 (파티가 그 상태를 거는 빈도 × 지속 시간 = 가동률) */
export const STATE_DEBUFFS: SkillBuff[] = [
  { kind: "state", state: "감전", effect: "vuln", elems: ["아츠"], value: 0.12, duration: 12, target: "enemy", text: "감전: 받는 아츠 피해 증가" },
  { kind: "state", state: "갑옷 파괴", effect: "vuln", elems: ["물리"], value: 0.12, duration: 12, target: "enemy", text: "갑옷 파괴: 받는 물리 피해 증가" },
  { kind: "state", state: "부식", effect: "vuln", value: 0.08, duration: 15, target: "enemy", text: "부식: 모든 저항 감소" },
];

/** 받는 사람 속성에 맞는지 */
export function buffApplies(b: SkillBuff, element: string): boolean {
  if (!b.elems) return true;
  return b.elems.includes(element) || (element !== "물리" && b.elems.includes("아츠"));
}

/** 가동률을 곱한 버프 → 받는 사람 능력치 (같은 버프는 중첩 안 함 — 호출하는 쪽에서 가장 큰 것만) */
export function buffBag(b: SkillBuff, uptime: number): StatBag {
  const bag = emptyBag();
  const v = b.value * Math.max(0, Math.min(1, uptime));
  if (b.effect === "amp") bag.amp += v;
  else if (b.effect === "vuln") bag.taken += v;
  else bag.atkPct += v;
  return bag;
}
