// 무기 가치 평가 — 고유 특성의 조건부 효과까지, "이 오퍼레이터 혼자서" 발동할 수 있는 만큼 반영 (순수 함수)
//
// 정규화 공식 (docs: build-recommendation.md)
//   피해 기대 지수(초당) = Σ_{배틀·연계·궁극기} 초당 사용 횟수 × 피해 배율 × 공격력 × (1+피해%) × (1+치명률×치명피해) × (1+받는 피해%)
//   조건부 효과의 기대값 = 수치 × 가동률,  가동률 = min(1, 발동 빈도(회/초) × 지속 시간)
//     중첩형은 평균 스택 = min(최대 스택, 발동 빈도 × 지속 시간)
//   발동 빈도는 그 조건을 만드는 이 오퍼레이터 스킬의 사용 빈도 (배틀 1/12.5초, 연계 1/쿨타임, 궁극기 1/충전 시간)
//   무기 점수 = 지수 ÷ 1위 지수 (100% = 1위)
//
// 반영하지 않는 것 (⚠️ 이유를 화면에 표시)
//   - 다른 동료가 만들어야 하는 조건, 다른 동료에게만 주는 효과 (조합 효과는 베스트 조합에서 따로)
//   - 적 상태(불균형 등)에만 붙는 조건, 생존(치유·보호·방어력) 효과, 추가 피해(고정 배율 타격)
//   - 일반 공격 피해 (일반 공격 회전 속도 데이터 없음) — TODO
import type { Blackboard } from "@/types/combat";
import type { CombatWeapon } from "@/types/build";
import { addBag, emptyBag, bagFromKey, rates, score, ELEM_OF, type DmgType, type OperatorBase, type Rotation, type ScoreResult, type StatBag } from "./build";
import type { AttrName } from "@/types/game";

export type SkillKind = "basic" | "battle" | "combo" | "ult";
const KIND_WORD: Record<string, SkillKind> = { "일반 공격": "basic", "배틀 스킬": "battle", "연계 스킬": "combo", 궁극기: "ult" };

/** 무기 평가에 필요한 오퍼레이터 정보 */
export interface OperatorKit {
  element: string;
  mainAttr: AttrName;
  subAttr: AttrName;
  rotation: Rotation;
  /** 스킬 종류별 설명 (형태가 있으면 모두 이어 붙임) */
  texts: Record<SkillKind, string>;
  tags: string[];
}

// ───────── 특성 문장 파싱 ─────────

type Zone = "atk" | "flatAtk" | "crit" | "critDmg" | "main" | "sub" | "allAttr" | "arts" | "ultGain" | "dmg" | "taken";

export interface TraitEffect {
  /** 화면 표시용 원문 조각 */
  text: string;
  zone: Zone | null;
  value: number;
  /** 피해 속성 제한 (물리/열기/전기/냉기/자연/아츠) */
  elems?: string[];
  /** 스킬 종류 제한 */
  types?: DmgType[];
  /** 발동 조건 원문 ("" = 조건 없음) */
  cond: string;
  /** 문장 안의 적 상태 조건 ("불균형 상태의 적에게 주는 피해") */
  enemyState?: string;
  duration?: number;
  maxStack: number;
  cooldown?: number;
  /** "장착자의 지능 수치 ≥ 의지 수치" */
  gate?: { a: AttrName; op: ">=" | ">"; b: AttrName };
  /** 반영하지 않는 이유 (파싱 단계에서 확정) */
  skip?: string;
}

const ELEM_WORDS = ["물리", "열기", "전기", "냉기", "자연", "아츠"];

/** {key:fmt} → ⟦key⟧ (표기에 %가 있으면 ⟦key%⟧), 태그 제거 */
function fill(desc: string): string {
  return desc
    .replace(/<[^>]*>/g, "")
    .replace(/\{([^}:]+)(?::([^}]*))?\}/g, (_, k: string, f?: string) => `⟦${k.trim()}${f?.includes("%") ? "%" : ""}⟧`);
}

function valueOf(part: string, bb: Blackboard): number | undefined {
  // [⟦a⟧+⟦b⟧×소모 스택 수치] → a + b × 4 (방어 불능·부착 최대 4스택 ✅ combat-mechanics §5·6)
  const f = part.match(/\[(?:⟦([^⟧]+)⟧\+)?⟦([^⟧]+)⟧×소모 스택 수치\]/);
  const key = (k: string) => k.replace(/%$/, "");
  if (f) return (f[1] ? Number(bb[key(f[1])] ?? 0) : 0) + Number(bb[key(f[2])] ?? 0) * 4;
  const m = part.match(/\+⟦([^⟧*]+)⟧/);
  if (m && bb[key(m[1])] !== undefined) return Number(bb[key(m[1])]);
  return undefined;
}

/** "+수치" 앞의 말로 어떤 능력치인지 */
function zoneOf(phrase: string): Pick<TraitEffect, "zone" | "elems" | "types" | "enemyState" | "skip"> {
  if (/자신과 속성이 다른 오퍼레이터|팀 내의? (다른|기타) 오퍼레이터|다른 오퍼레이터는/.test(phrase)) return { zone: null, skip: "다른 동료에게만 주는 효과" };
  if (/치유|생명력|방어력|보호/.test(phrase)) return { zone: null, skip: "생존 효과 (피해 계산 밖)" };
  const enemyState = /상태의 적에게 주는/.test(phrase)
    ? (["불균형", ...STATE_ORDER].filter((t) => phrase.includes(t)).join("·") || "특정")
    : undefined;
  if (/궁극기 충전 효율/.test(phrase)) return { zone: "ultGain" };
  if (/오리지늄 아츠 강도/.test(phrase)) return { zone: "arts" };
  if (/치명타 확률/.test(phrase)) return { zone: "crit", enemyState };
  if (/치명타 피해/.test(phrase)) return { zone: "critDmg", enemyState };
  if (/모든 능력치/.test(phrase)) return { zone: "allAttr" };
  if (/주요 능력치/.test(phrase)) return { zone: "main" };
  if (/보조 능력치/.test(phrase)) return { zone: "sub" };
  if (/공격력/.test(phrase)) return { zone: "atk", enemyState };
  if (/피해/.test(phrase)) {
    const elems = ELEM_WORDS.filter((e) => phrase.includes(e));
    const types: DmgType[] = [];
    if (/모든 스킬/.test(phrase)) types.push("battle", "combo", "ult");
    for (const [w, k] of Object.entries(KIND_WORD)) if (phrase.includes(w) && k !== "basic") types.push(k);
    if (phrase.includes("일반 공격")) types.push("basic");
    const taken = /(목표|적)(가|이) 받는/.test(phrase);
    return { zone: taken ? "taken" : "dmg", elems: elems.length ? elems : undefined, types: types.length ? [...new Set(types)] : undefined, enemyState };
  }
  return { zone: null, skip: "피해와 무관한 효과" };
}

/** 고유 특성 설명 → 효과 목록 (무기 스킬 레벨 bb 값 대입) */
export function parseTrait(desc: string | null | undefined, bb: Blackboard): TraitEffect[] {
  if (!desc) return [];
  const text = fill(desc);
  const out: TraitEffect[] = [];
  const maxStack = 1;
  const cooldown: number | undefined = undefined;
  // 안내 줄("같은 이름의 효과는 최대 N스택…", "N초마다 최대 1회")은 바로 앞 효과들에 적용
  let pending: TraitEffect[] = [];
  const applyInfo = (line: string) => {
    const st = line.match(/(?:같은 이름의 효과는|해당 효과는) 최대로? ⟦([^⟧]+)⟧스택까지/);
    const cd = line.match(/⟦(cd)⟧초(?:마다| 내) 최대 1회/);
    for (const e of pending) {
      if (st) e.maxStack = Number(bb[st[1]] ?? 1) || 1;
      if (cd) e.cooldown = Number(bb.cd ?? bb["cd "] ?? 0) || undefined;
    }
    pending = [];
  };

  let gate: TraitEffect["gate"];
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^(같은 이름|두 효과|각 효과|상기 능력치|해당 효과)/.test(line)) {
      applyInfo(line);
      continue;
    }
    const g = line.match(/^장착자의 (힘|민첩|지능|의지) 수치 (≥|＞|>) (힘|민첩|지능|의지) 수치\s*[:：]\s*/);
    if (g) {
      gate = { a: g[1] as AttrName, op: g[2] === "≥" ? ">=" : ">", b: g[3] as AttrName };
      line = line.slice(g[0].length);
    }
    for (const sentence of line.split(/(?<=\.)\s*/)) {
      if (!sentence.trim()) continue;
      if (/메인 컨트롤 오퍼레이터일 경우/.test(sentence)) continue; // 배수 조정 문장 — 조작 여부 가정 안 함
      if (/^(같은 이름|두 효과|각 효과|해당 효과)/.test(sentence.trim())) { applyInfo(sentence); continue; }
      const cm = sentence.match(/^(.*?(?:때마다|마다|때|후|경우|으면|하면))(?:,\s*|\s+)(.*)$/);
      const cond = cm ? cm[1] : "";
      let body = cm ? cm[2] : sentence;
      const durM = body.match(/⟦(\w*duration\w*)⟧초 (?:동안|내에)/);
      const duration = durM ? Number(bb[durM[1]] ?? 0) : undefined;
      // "N초 내에 사용한 다음 배틀 스킬(혹은 궁극기)의 지속 시간 동안 주는 X 피해" → 그 스킬에만
      let onlyTypes: DmgType[] | undefined;
      const nx = body.match(/다음 ([^의]+)의 지속 시간 동안/);
      if (nx) {
        onlyTypes = Object.entries(KIND_WORD).filter(([w]) => nx[1].includes(w)).map(([, k]) => k as DmgType);
        body = body.slice(body.indexOf(nx[0]) + nx[0].length);
      }
      for (const part of body.split(/,\s*/)) {
        if (!part.includes("⟦") || /초 동안 지속|초 (?:동안|내에)$/.test(part.trim())) continue;
        const value = valueOf(part, bb);
        if (value === undefined) {
          if (/⟦atk_scale/.test(part)) out.push({ text: part.trim(), zone: null, value: 0, cond, maxStack, skip: "추가 피해 (고정 배율 타격)" });
          continue;
        }
        const phrase = part.slice(0, Math.max(part.indexOf("+"), 0)) || part;
        const z = zoneOf(phrase);
        // 공격력 +{atk_up:0} 처럼 % 표기가 없으면 고정 공격력
        if (z.zone === "atk" && !/⟦[^⟧]*%⟧/.test(part) && !part.includes("[")) z.zone = "flatAtk";
        const eff: TraitEffect = {
          text: part.replace(/⟦[^⟧]+⟧/g, "").trim(),
          ...z,
          types: onlyTypes ?? z.types,
          value,
          cond,
          duration,
          maxStack,
          cooldown,
          gate,
        };
        out.push(eff);
        pending.push(eff);
      }
    }
  }
  return out;
}

// ───────── 조건 해석 ─────────

/** 조건에 쓰이는 상태 → 오퍼레이터 스킬 설명에서 찾을 말 */
const STATE_WORDS: Record<string, string[]> = {
  "아츠 부착": ["열기 부착", "전기 부착", "냉기 부착", "자연 부착", "아츠 부착"],
  "열기 부착": ["열기 부착"],
  "전기 부착": ["전기 부착"],
  "냉기 부착": ["냉기 부착"],
  "자연 부착": ["자연 부착"],
  "아츠 이상": ["연소", "감전", "동결", "부식", "아츠 이상"],
  연소: ["연소"],
  감전: ["감전"],
  동결: ["동결"],
  부식: ["부식"],
  "물리 이상": ["띄우기", "넘어뜨리기", "강타", "갑옷 파괴", "물리 이상"],
  "방어 불능": ["방어 불능", "띄우기", "넘어뜨리기"],
  띄우기: ["띄우기"],
  넘어뜨리기: ["넘어뜨리기"],
  강타: ["강타"],
  "갑옷 파괴": ["갑옷 파괴"],
  "물리 취약": ["물리 취약"],
  "아츠 취약": ["아츠 취약", "취약"],
  허약: ["허약"],
  "오리지늄 결정": ["오리지늄 결정"],
  연타: ["연타"],
  // 아츠 폭발: 같은 속성 부착을 다시 하면 발동 ✅ → 자기 속성 부착을 하는 오퍼레이터는 혼자 가능
  "아츠 폭발": ["아츠 폭발", "열기 부착", "전기 부착", "냉기 부착", "자연 부착"],
  "스킬 게이지": ["스킬 게이지를 회복", "스킬 게이지 회복"],
  치유: ["치유", "생명력을 회복", "생명력 회복"],
};
/** 받침에 맞는 목적격 조사 */
const withObj = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? `${w}을` : `${w}를`;
};
const STATE_ORDER = Object.keys(STATE_WORDS).sort((a, b) => b.length - a.length);

export interface Resolution {
  /** 기대 배율 (가동률 또는 평균 스택) */
  factor: number;
  reason: string;
}

/** 조건 문장 → 이 오퍼레이터가 혼자 발동하는 빈도 (회/초). 불가면 이유 */
export function triggerRate(cond: string, kit: OperatorKit, r: Record<"battle" | "combo" | "ult", number>): { rate: number; via: string } | { rate: 0; why: string } {
  if (!cond) return { rate: Infinity, via: "항상" };
  if (/다른 오퍼레이터|팀 내/.test(cond) && !/장착자/.test(cond)) return { rate: 0, why: "동료가 발동해야 하는 조건" };
  // 조건에 명시된 스킬 종류
  const named = Object.entries(KIND_WORD).filter(([w]) => cond.includes(w)).map(([, k]) => k as SkillKind);
  const rateOf = (kinds: SkillKind[]) => Math.max(0, ...kinds.map((k) => (k === "basic" ? 1 : r[k])));
  const label = (kinds: SkillKind[]) => kinds.map((k) => ({ basic: "일반 공격", battle: "배틀 스킬", combo: "연계 스킬", ult: "궁극기" })[k]).join("·");
  // 1) 스킬 사용·명중
  if (/사용(할|했을|한|하여)? ?(때|후)|명중할 때/.test(cond) && named.length && !STATE_ORDER.some((s) => cond.includes(s))) {
    return { rate: named.reduce<number>((s, k) => s + (k === "basic" ? 1 : r[k]), 0), via: `${label(named)} 사용` };
  }
  // 2) 강력한 일격 (조작 중 일반 공격 마지막 타 — 자주 발생)
  if (/강력한 일격/.test(cond)) return { rate: 1, via: "강력한 일격" };
  // 3) 치명타가 터졌을 때
  if (/치명타 피해를 (준|줄)/.test(cond)) {
    const kinds = named.length ? named : (["basic"] as SkillKind[]);
    return { rate: rateOf(kinds), via: `${label(kinds)} 치명타 (치명타 발생 가정)` };
  }
  // 4) 상태를 부여·소모
  const state = STATE_ORDER.find((s) => cond.includes(s));
  if (!state) return { rate: 0, why: "자동으로 판단하기 어려운 조건" };
  const consume = /소모/.test(cond);
  const kinds = (named.length ? named : (["battle", "combo", "ult"] as SkillKind[])).filter((k) => {
    const t = kit.texts[k] ?? "";
    const hit = STATE_WORDS[state].some((w) => t.includes(w));
    return hit && (!consume || t.includes("소모"));
  });
  if (!kinds.length) {
    const tagged = kit.tags.some((t) => STATE_WORDS[state].includes(t));
    if (tagged && !named.length && !consume) return { rate: r.battle, via: `${state} (전투 태그)` };
    return { rate: 0, why: `${named.length ? label(named) + "로 " : ""}${consume ? `${state} 소모를` : withObj(state)} 스스로 하지 않음` };
  }
  return { rate: rateOf(kinds), via: `${label(kinds)}로 ${state}${consume ? " 소모" : ""}` };
}

function gateOk(g: TraitEffect["gate"], attrs: Record<AttrName, number>): boolean {
  if (!g) return true;
  return g.op === ">=" ? attrs[g.a] >= attrs[g.b] : attrs[g.a] > attrs[g.b];
}

/** 효과 → 이 오퍼레이터 기준 기대 능력치 */
export function effectBag(e: TraitEffect, kit: OperatorKit, value: number): StatBag | undefined {
  const b = emptyBag();
  const el = kit.element;
  const elemOk = !e.elems || e.elems.includes(el) || (el !== "물리" && e.elems.includes("아츠"));
  switch (e.zone) {
    case "atk": b.atkPct += value; break;
    case "flatAtk": b.flatAtk += value; break;
    case "crit": b.critRate += value; break;
    case "critDmg": b.critDmg += value; break;
    case "main": b.mainPct += value; break;
    case "sub": b.subPct += value; break;
    case "allAttr": b.mainPct += value; b.subPct += value; break;
    case "arts": b.artsIntensity += value; break;
    case "ultGain": b.ultGain += value; break;
    case "taken":
      if (!elemOk) return undefined;
      b.taken += value;
      break;
    case "dmg": {
      if (!elemOk) return undefined;
      // TODO: 일반 공격 회전 데이터가 없어 일반 공격 피해는 아직 점수에 넣지 않음
      if (e.types && e.types.every((t) => t === "basic")) return undefined;
      if (e.types) for (const t of e.types) b.dmg[t] += value;
      else b.dmg.all += value;
      break;
    }
    default: return undefined;
  }
  return b;
}

export interface WeaponEffectLine {
  text: string;
  /** 반영 비율 0~1 (중첩형은 평균 스택 ÷ 최대 스택) */
  uptime: number;
  /** 효과 수치 (1스택) */
  value: number;
  /** 반영된 기대값 (수치 × 가동률 또는 평균 스택) */
  applied: number;
  /** % 수치인지 (아츠 강도·고정 공격력은 false) */
  pct: boolean;
  via: string;
}

export interface WeaponEval {
  bag: StatBag;
  atk: number;
  levels: number[];
  applied: WeaponEffectLine[];
  excluded: { text: string; reason: string }[];
}

/** 무기 하나의 기대 능력치 — 능력치 스킬 2개(키 기준) + 고유 특성(문장 해석) */
export function evaluateWeapon(w: CombatWeapon, kit: OperatorKit, baseAttrs: Record<AttrName, number>, refine = 0): WeaponEval {
  const last = w.breakthroughs.at(-1)!;
  const extra = refine > 0 ? w.potentials.find((p) => p.level === refine)?.skillLevelExtraBounds : undefined;
  const levels = w.skills.map((_, i) => Math.min(9, last.skillLevelBounds[i].upperBound + (extra?.[i]?.upperBound ?? 0)));
  let bag = emptyBag();
  w.skills.slice(0, -1).forEach((s, i) => {
    const bb = s.levels[levels[i] - 1]?.bb ?? {};
    for (const k of Object.keys(bb)) {
      const add = bagFromKey(k, Number(bb[k])) ?? attrKeyBag(k, Number(bb[k]));
      if (add) bag = addBag(bag, add);
    }
  });
  const trait = w.skills.at(-1);
  const applied: WeaponEffectLine[] = [];
  const excluded: { text: string; reason: string }[] = [];
  if (trait) {
    const bb = trait.levels[levels.at(-1)! - 1]?.bb ?? {};
    const effects = parseTrait(trait.desc, bb);
    // 능력치 조건(지능 ≥ 의지)은 무기 능력치 스킬까지 더한 값으로 판단
    const attrs = { ...baseAttrs };
    attrs.힘 += bag.str; attrs.민첩 += bag.agi; attrs.지능 += bag.int; attrs.의지 += bag.wil;
    attrs[kit.mainAttr] += bag.main;
    // 충전 효율이 궁극기 빈도에 영향 → 조건 없는 효과를 먼저 더한 뒤 빈도 계산
    const always = effects.filter((e) => !e.cond && !e.enemyState && !e.skip);
    for (const e of always) {
      const add = effectBag(e, kit, e.value);
      if (add) { bag = addBag(bag, add); applied.push({ text: e.text, uptime: 1, value: e.value, applied: e.value, pct: isPct(e), via: "항상" }); }
      else excluded.push({ text: e.text, reason: e.types?.every((t) => t === "basic") ? "일반 공격 피해 (아직 미반영)" : "이 오퍼레이터 속성과 다름" });
    }
    const r = rates(kit.rotation, bag.ultGain);
    for (const e of effects) {
      if (always.includes(e)) continue;
      if (e.skip) { excluded.push({ text: e.text, reason: e.skip }); continue; }
      if (!gateOk(e.gate, attrs)) { excluded.push({ text: e.text, reason: `${e.gate!.a} ${e.gate!.op === ">=" ? "≥" : ">"} ${e.gate!.b} 조건 불충족` }); continue; }
      if (e.enemyState) { excluded.push({ text: e.text, reason: `적이 ${e.enemyState} 상태일 때만` }); continue; }
      const t = triggerRate(e.cond, kit, r);
      if (t.rate === 0) { excluded.push({ text: e.text, reason: "why" in t ? t.why : "발동 불가" }); continue; }
      const rate = e.cooldown ? Math.min(t.rate, 1 / e.cooldown) : t.rate;
      // 지속 시간이 없는 효과는 발동 즉시 1회성 → 지속형으로 보지 않음
      const dur = e.duration ?? 0;
      const stacks = dur > 0 ? Math.min(e.maxStack, rate * dur) : 0;
      if (stacks <= 0) { excluded.push({ text: e.text, reason: "지속 시간 정보 없음" }); continue; }
      const add = effectBag(e, kit, e.value * stacks);
      if (!add) { excluded.push({ text: e.text, reason: e.types?.every((t) => t === "basic") ? "일반 공격 피해 (아직 미반영)" : "이 오퍼레이터 속성과 다름" }); continue; }
      bag = addBag(bag, add);
      applied.push({ text: e.text, uptime: stacks / e.maxStack, value: e.value, applied: e.value * stacks, pct: isPct(e), via: "via" in t ? t.via : "" });
    }
  }
  return { bag, atk: w.baseAtk[w.baseAtk.length - 1], levels, applied, excluded };
}

const isPct = (e: TraitEffect) => e.zone !== "arts" && e.zone !== "flatAtk";

/** 능력치 스킬 키 보충 (bagFromKey 에 없는 배율형) */
function attrKeyBag(key: string, v: number): StatBag | undefined {
  const b = emptyBag();
  if (key === "primary_attr_up") b.mainPct += v;
  else if (key === "second_attr_up") b.subPct += v;
  else if (key === "all_attr_up") { b.mainPct += v; b.subPct += v; }
  else return undefined;
  return b;
}

/** 스킬 설명 표의 피해 배율 합 (만렙) — 같은 라벨이 여러 번(형태별)이면 큰 값 하나만 */
export function damageWeight(displays: { label: string; value: string }[]): number {
  const best = new Map<string, number>();
  for (const d of displays) {
    if (!/배율/.test(d.label) || /취약|추가되는|단계별 지속|불균형/.test(d.label)) continue;
    const v = parseFloat(d.value);
    if (!d.value.endsWith("%") || !Number.isFinite(v)) continue;
    best.set(d.label, Math.max(best.get(d.label) ?? 0, v / 100));
  }
  return [...best.values()].reduce((s, v) => s + v, 0);
}

export { ELEM_OF };

// ───────── 순위 ─────────


export interface WeaponValueRank {
  id: string;
  name: string;
  rarity: number;
  score: ScoreResult;
  /** 1위 대비 */
  relative: number;
  levels: number[];
  applied: WeaponEffectLine[];
  excluded: { text: string; reason: string }[];
  bag: StatBag;
}

/** 같은 무기 종류 전체를 피해 기대 지수(초당)로 비교 */
export function rankWeaponsByValue(
  op: OperatorBase,
  kit: OperatorKit,
  base: StatBag,
  weapons: [string, CombatWeapon][],
  refine = 0,
): WeaponValueRank[] {
  const attrs: Record<AttrName, number> = {
    힘: op.attrs.힘 + base.str,
    민첩: op.attrs.민첩 + base.agi,
    지능: op.attrs.지능 + base.int,
    의지: op.attrs.의지 + base.wil,
  };
  const rows = weapons.map(([id, w]) => {
    const ev = evaluateWeapon(w, kit, attrs, refine);
    return {
      id,
      name: w.name,
      rarity: w.rarity,
      score: score(op, ev.atk, addBag(base, ev.bag)),
      levels: ev.levels,
      applied: ev.applied,
      excluded: ev.excluded,
      bag: ev.bag,
    };
  });
  rows.sort((a, b) => b.score.overall - a.score.overall);
  const top = rows[0]?.score.overall || 1;
  return rows.map((r) => ({ ...r, relative: r.score.overall / top }));
}
