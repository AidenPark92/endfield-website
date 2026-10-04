// 게임 설명 문구 템플릿을 실제 수치로 채우는 순수 함수
// 예: "공격력 <@ba.vup>+{atk_up:0%}</>" + { atk_up: 0.2 } → "공격력 +20%" (+20% 는 강조 구간)
import type { Blackboard, EffectData } from "@/types/combat";

export type TextTone = "value" | "keyword" | "plain";
export interface TextSegment {
  text: string;
  tone: TextTone;
}

/** {expr:fmt} 의 expr 계산 — key, 숫자, 그리고 +,- 연산만 (예: 1-costvalue, duration-1, -coolDown) */
export function evalExpr(expr: string, bb: Blackboard): number | undefined {
  const tokens = expr.replace(/\s+/g, "").match(/[+-]|[^+-]+/g);
  if (!tokens) return undefined;
  let total = 0;
  let sign = 1;
  for (const t of tokens) {
    if (t === "+") sign = 1;
    else if (t === "-") sign = -1;
    else {
      const v = /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number(bb[t]);
      if (!Number.isFinite(v)) return undefined;
      total += sign * v;
      sign = 1;
    }
  }
  return total;
}

/** fmt: "0%" → 정수 %, "0.0%" → 소수 1자리 %, "0" / "0.0" → 숫자, 없음 → 그대로 */
export function formatValue(v: number, fmt?: string): string {
  if (!fmt) return trimNum(v);
  const pct = fmt.endsWith("%");
  const decimals = (fmt.replace("%", "").split(".")[1] ?? "").length;
  const n = pct ? v * 100 : v;
  return n.toFixed(decimals) + (pct ? "%" : "");
}

function trimNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** 템플릿 → 표시 구간. 채울 수 없는 값은 "?" 로 남기고 missing 에 기록 */
export function renderTemplate(template: string | null | undefined, bb: Blackboard = {}): { segments: TextSegment[]; missing: string[] } {
  const missing: string[] = [];
  if (!template) return { segments: [], missing };
  const fill = (s: string) =>
    s.replace(/\{([^{}:]+)(?::([^{}]+))?\}/g, (_, expr: string, fmt?: string) => {
      const v = evalExpr(expr, bb);
      if (v === undefined) {
        missing.push(expr);
        return "?";
      }
      return formatValue(v, fmt);
    });
  const segments: TextSegment[] = [];
  // <@ba.vup>값</> = 수치 강조, <#ba.xxx>키워드</> · <@ba.xxx>키워드</> = 용어, <image=...> 는 버림
  const re = /<([@#])([\w.]+)>([\s\S]*?)<\/>|<image=[^>]*>/g;
  let last = 0;
  for (const m of template.matchAll(re)) {
    if (m.index! > last) segments.push({ text: fill(template.slice(last, m.index)), tone: "plain" });
    if (m[3] !== undefined) segments.push({ text: fill(m[3]), tone: m[2] === "ba.vup" ? "value" : "keyword" });
    last = m.index! + m[0].length;
  }
  if (last < template.length) segments.push({ text: fill(template.slice(last)), tone: "plain" });
  return { segments: segments.filter((s) => s.text), missing };
}

/** 설명 템플릿이 능력치 변경을 가리킬 때 쓰는 키 (게임 attrType enum 이름) */
const ATTR_TEMPLATE_KEY: Record<number, string> = {
  1: "MaxHp", 2: "Atk", 3: "Def", 9: "CriticalRate", 10: "CriticalDamageIncrease", 17: "NormalAttackDamageIncrease",
  29: "HealOutputIncrease", 32: "NormalSkillDamageIncrease", 39: "Str", 40: "Agi", 41: "Wisd", 42: "Will",
  50: "PhysicalDamageIncrease", 51: "FireDamageIncrease", 52: "PulseDamageIncrease", 53: "CrystDamageIncrease",
  54: "NatureDamageIncrease", 87: "PhysicalAndSpellInflictionEnhance",
};
/** skillParamModifier.paramType → 템플릿 키 (1: 소모값, 2: 쿨타임) */
const PARAM_TEMPLATE_KEY: Record<number, string[]> = { 1: ["costvalue", "costValue"], 2: ["coolDown", "cooldown"] };

/** 잠재·재능 효과 목록 → 설명에 쓰이는 값 모음 */
export function effectBlackboard(effects: EffectData[] | null | undefined): Blackboard {
  const bb: Blackboard = {};
  for (const e of effects ?? []) {
    for (const x of e.attachBuff?.blackboard ?? []) bb[x.key] = x.value;
    for (const x of e.attachSkill?.blackboard ?? []) bb[x.key] = x.value;
    if (e.skillBbModifier?.bbKey) bb[e.skillBbModifier.bbKey] = e.skillBbModifier.floatValue;
    const sp = e.skillParamModifier;
    for (const k of (sp && PARAM_TEMPLATE_KEY[sp.paramType]) || []) bb[k] = sp!.paramValue;
    const am = e.attrModifier;
    if (am && am.attrType && ATTR_TEMPLATE_KEY[am.attrType]) bb[ATTR_TEMPLATE_KEY[am.attrType]] = am.attrValue;
  }
  return bb;
}
