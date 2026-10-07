// 무기 가치 평가 — 고유 특성의 조건부 효과 + 팀 시너지 효과까지 반영 (순수 함수)
//
// 무기 점수 = 본인 피해 기대치 + 팀 시너지 기대치  (특정 조합이 아니라 "아무 팀원 3명"의 기대값)
//   팀 시너지 = Σ_효과 3명 × 대상 팀원 비율 × (팀원 1명의 피해 증가분)
//     - 팀원 1명의 기준 피해 = 이 오퍼레이터가 개인 1위 무기를 낀 피해 기대치 (정규화 기준, 모두 같은 몫이라고 가정)
//     - 대상 팀원 비율 = 나머지 오퍼레이터 중 효과를 받는 속성의 비율 (예: "아츠 피해" → 물리가 아닌 오퍼레이터 비율)
//     - 동료가 만들어야 하는 조건 → 그 상태를 만들 수 있는 오퍼레이터 k명, 3명 편성 시 1명 이상 있을 확률 P = 1 − C(n−k,3)/C(n,3)
//       가동률 = P × min(1, 그 동료들의 평균 발동 빈도 × 지속 시간)
//
// 정규화 공식 (docs: build-recommendation.md)
//   피해 기대 지수(초당) = Σ_{배틀·연계·궁극기} 초당 사용 횟수 × 피해 배율 × 공격력 × (1+피해%) × (1+치명률×치명피해) × (1+받는 피해%)
//   조건부 효과의 기대값 = 수치 × 가동률,  가동률 = min(1, 발동 빈도(회/초) × 지속 시간)
//     중첩형은 평균 스택 = min(최대 스택, 발동 빈도 × 지속 시간)
//   발동 빈도는 그 조건을 만드는 이 오퍼레이터 스킬의 사용 빈도 (배틀 1/12.5초, 연계 1/쿨타임, 궁극기 1/충전 시간)
//   무기 점수 = 지수 ÷ 1위 지수 (100% = 1위)
//
// 반영하지 않는 것 (⚠️ 이유를 화면에 표시)
//   - 적 상태(불균형 등)에만 붙는 조건, 생존(치유·보호·방어력) 효과, 추가 피해(고정 배율 타격)
//   - 일반 공격 피해 (일반 공격 회전 속도 데이터 없음) — TODO
import type { Blackboard } from "@/types/combat";
import type { CombatWeapon, GearPiece, GearSuit } from "@/types/build";
import { ASSUME, basicCounted, addBag, emptyBag, bagFromKey, gearBag, rates, score, BASIC_CHAIN_SECONDS, type GearRank, ELEM_OF, type DmgType, type OperatorBase, type Rotation, type ScoreResult, type StatBag } from "./build";
import type { AttrName } from "@/types/game";

export type SkillKind = "basic" | "battle" | "combo" | "ult";
const KIND_WORD: Record<string, SkillKind> = { "일반 공격": "basic", "배틀 스킬": "battle", "연계 스킬": "combo", 궁극기: "ult" };

/** 무기 평가에 필요한 오퍼레이터 정보 */
export interface OperatorKit {
  id?: string;
  element: string;
  mainAttr: AttrName;
  subAttr: AttrName;
  rotation: Rotation;
  /** 스킬 종류별 설명 (형태가 있으면 모두 이어 붙임) */
  texts: Record<SkillKind, string>;
  tags: string[];
  /**
   * 지속형 모드의 주기 (스킬 표 "…간격(초)" 최소값 · "…지속 시간(초)" 최대값)
   * 예) 리노 배틀 스킬 라이브 모드: 3초 간격 노랫소리로 지속 치유, 60초 지속
   */
  periodic?: Partial<Record<SkillKind, { interval: number; duration: number }>>;
  /** 치유량 식 (스킬 표 "기초 치유 수치" + "X 1포인트마다 증가하는 치유 수치") */
  heals?: Partial<Record<SkillKind, { base: number; coef: number; attr?: AttrName }[]>>;
  /** 레벨 90 기초 생명력 · 방어력 */
  hp?: number;
  def?: number;
  /** 치명타 확률 (기본 + 무기·재능, 평가 중 갱신) */
  critRate?: number;
  /** 일반 공격 1세트 타수 */
  basicHits?: number;
  /** 적 불균형 가동률 = STAGGER_UPTIME × (이 오퍼레이터 초당 불균형치 ÷ 전체 평균), 0.1~0.5 */
  staggerUptime?: number;
  /** 스킬 1회 타수 (스킬 표 피해 배율 항목 수 — 근사) */
  skillHits?: Partial<Record<SkillKind, number>>;
}

/** 팀원 후보 (이 오퍼레이터를 뺀 전체 오퍼레이터) — 특정 조합이 아닌 기대값 계산용 */
export interface TeamPool {
  others: { id: string; element: string; kit: OperatorKit; rates: Record<"battle" | "combo" | "ult", number> }[];
}

/** TODO(실측): "생명력이 N%보다 높을 때" 조건 가동률 가정 */
export const HIGH_HP_UPTIME = 1;
/** TODO(실측): 적 불균형 상태 가동률 가정 (불균형 지속·누적 속도 데이터 없음) */
export const STAGGER_UPTIME = 0.2;
/** 적 상태 지속 시간(초) — combat-mechanics §5·6 (부착·방어 불능 20초 ✅, 동결 5.75초 📘, 감전 12초 📘, 부식 15초 📘, 연소 10초 ✅, 갑옷 파괴 12초 ✅) */
export const STATE_DURATION: Record<string, number> = {
  "아츠 부착": 20, "열기 부착": 20, "전기 부착": 20, "냉기 부착": 20, "자연 부착": 20,
  "방어 불능": 20, 동결: 5.75, 감전: 12, 부식: 15, 연소: 10, "갑옷 파괴": 12, "물리 취약": 12, "아츠 취약": 12,
};
/**
 * 이상 피해 배율 (combat-mechanics §5·6): 아츠 폭발 160% ✅, 강타 150% + 150% × 소모 스택 ✅, 갑옷 파괴 50% + 50% × 스택 ✅, 띄우기·넘어뜨리기 120% ✅
 * 스택은 최대 4 소모로 계산 (가정)
 */
/**
 * 이상 피해에 속성·모든 피해 보너스 적용 여부 — ⚠️ 출처 없음(combat-verification C).
 * 강타·갑옷 파괴용 세트(고검의 잔향)가 물리 피해를, 연소·부식용 세트(열 작업용)가 열기·자연 피해를 주는 게임 설계와
 * 커뮤니티 빌드 채택(미브 고검의 잔향 34/39)을 근거로 적용. 스킬 종류 피해(배틀 스킬 피해 등)와 치명타는 미적용
 */
export const ANOMALY_DMG_BONUS = true;
/** 이상 피해 레벨 계수 (레벨 90): 물리 이상 1 + (Lv−1)/392, 아츠 폭발·반응·쇄빙 1 + (Lv−1)/196 📘 combat-mechanics §7 */
export const ANOMALY_LEVEL = { phys: 1 + 89 / 392, arts: 1 + 89 / 196 };
export const ANOMALY_SCALE = { 아츠폭발: 1.6, 강타: 1.5 + 1.5 * 4, "갑옷 파괴": 0.5 + 0.5 * 4, 띄우기: 1.2 };

/** 팀원 수 (4인 편성) */
export const TEAMMATES = 3;

/** 아츠 반응 → 반응을 결정하는(나중에 부착한) 속성 ✅ combat-mechanics §5 */
export const REACTION_ELEM: Record<string, string> = { 연소: "열기", 감전: "전기", 동결: "냉기", 부식: "자연" };

/** 이 오퍼레이터가 elem 부착을 거는 초당 횟수 (부착하는 스킬 빈도의 합) */
export function attachRate(kit: OperatorKit, r: Record<"battle" | "combo" | "ult", number>, elem: string): number {
  return (["battle", "combo", "ult"] as const).reduce((s, k) => s + ((kit.texts[k] ?? "").includes(`${elem} 부착`) ? r[k] : 0), 0);
}

/**
 * 팀원 3명이 "나와 다른 아츠 속성" 부착을 거는 초당 기대 횟수 (무작위 3인 편성 기대값)
 * — 내 부착 스택을 반응으로 소모시키고, 반대로 내 부착이 반응(감전 등)을 일으키게 하는 빈도
 */
export function foreignAttachRate(kit: OperatorKit, pool?: TeamPool): number {
  if (!pool?.others.length) return 0;
  const per = pool.others.map((o) => (o.element === kit.element || o.element === "물리" ? 0 : attachRate(o.kit, o.rates, o.element)));
  return (TEAMMATES * per.reduce((a, b) => a + b, 0)) / per.length;
}

/**
 * 중첩 효과의 평균 스택 · 최대 스택 가동률
 * - 주기형 발동(스킬 쿨마다): 결정적. 지속 갱신형은 간격 ≤ 지속이면 계속 쌓여 최대 유지, 독립 지속형은 min(최대, 빈도 × 지속)
 * - 무작위 발동(치명타): 독립 지속형은 포아송(λ = 빈도 × 지속), 지속 갱신형은 "다음 발동이 지속 안에 올 확률 q = 1 − e^(−λ)"의 마르코프 사슬
 */
export function stackModel(rate: number, duration: number, maxStack: number, opts: { random: boolean; separate: boolean }): { mean: number; full: number } {
  const lam = rate * duration;
  if (!(lam > 0)) return { mean: 0, full: 0 };
  const M = Math.max(1, maxStack);
  if (!opts.random) {
    if (opts.separate || !ASSUME.stackRefresh || M === 1) return { mean: Math.min(M, lam), full: lam >= M ? 1 : 0 };
    return lam >= 1 ? { mean: M, full: 1 } : { mean: lam, full: 0 };
  }
  if (opts.separate || !ASSUME.stackRefresh) {
    // E[min(N, M)] · P(N ≥ M)
    let term = Math.exp(-lam);
    let mean = 0;
    let below = 0;
    for (let i = 0; i < M; i++) {
      mean += i * term;
      below += term;
      term *= lam / (i + 1);
    }
    return { mean: mean + M * (1 - below), full: Math.max(0, 1 - below) };
  }
  // 갱신형: 발동 직후 상태 s(1..M) — q 확률로 s+1(최대 M), 1−q 확률로 끊겨 1부터. 정상 분포 π_s ∝ q^(s−1), π_M = q^(M−1)
  // 시간 가중: 발동 사이 시간 중 지속(최대 duration) 동안만 효과 → 가동 비율 = E[min(간격, 지속)] / E[간격] = (1 − e^(−λ))
  const q = 1 - Math.exp(-lam);
  const pi = Array.from({ length: M }, (_, i) => (i < M - 1 ? (1 - q) * q ** i : q ** (M - 1)));
  const cover = q;
  const mean = pi.reduce((acc, p, i) => acc + p * (i + 1), 0) * cover;
  return { mean, full: pi[M - 1] * cover };
}

/** n명 중 k명이 조건을 만들 수 있을 때, 무작위 3명 편성에 1명 이상 들어갈 확률 */
export function atLeastOne(n: number, k: number, pick = TEAMMATES): number {
  if (k <= 0 || n <= 0) return 0;
  if (n - k < pick) return 1;
  let none = 1;
  for (let i = 0; i < pick; i++) none *= (n - k - i) / (n - i);
  return 1 - none;
}

// ───────── 특성 문장 파싱 ─────────

type Zone = "comboCdr" | "atk" | "flatAtk" | "hpFlat" | "crit" | "critDmg" | "main" | "sub" | "allAttr" | "arts" | "ultGain" | "dmg" | "taken" | "heal" | "hp" | "def" | "shield";

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
  /** 장착자 본인이 받는지 */
  self: boolean;
  /** 다른 팀원이 받는 비율 (0 = 없음, 0.5 = 절반) */
  others: number;
  /** 자신과 속성이 다른 팀원만 */
  othersDiffElem?: boolean;
  /** 추가 타격: 공격력의 N배 피해 (용사 등) */
  extraScale?: number;
  /** "N스택일 때 / N스택까지 중첩된 후" — 바로 앞 효과가 가득 찼을 때 */
  afterFull?: "while" | "reset";
  /** "다음 배틀 스킬의 피해 +X" — 쌓아 두었다가 그 스킬 1회에 소모 (본 크러셔·응룡 50식) */
  consumeBy?: SkillKind;
  /** "중첩될 때마다 지속 시간은 따로 계산" — 스택마다 지속 시간이 독립 (없으면 새 스택이 지속 시간을 갱신) */
  separate?: boolean;
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
  const f = part.match(/\[(?:⟦([^⟧]+)⟧\+)?⟦([^⟧]+)⟧×소모한? 스택 수치\]/);
  const key = (k: string) => k.replace(/%$/, "");
  if (f) return (f[1] ? Number(bb[key(f[1])] ?? 0) : 0) + Number(bb[key(f[2])] ?? 0) * 4;
  const m = part.match(/\+⟦([^⟧*]+)⟧/);
  if (m && bb[key(m[1])] !== undefined) return Number(bb[key(m[1])]);
  // "+{1-comboskill_cooldown:0%}" → 1 − 값 (쿨타임 감소)
  const inv = m?.[1].match(/^1-(\w+)%?$/);
  if (inv && bb[inv[1]] !== undefined) return 1 - Number(bb[inv[1]]);
  return undefined;
}

/** "+수치" 앞의 말로 어떤 능력치인지 */
type ZoneInfo = Pick<TraitEffect, "zone" | "elems" | "types" | "enemyState" | "skip" | "self" | "others" | "othersDiffElem">;

/** 누가 받는 효과인지: 본인 / 팀 전체 / 다른 팀원 / 속성이 다른 팀원. 적이 받는 피해 증가는 팀 전체에 이득 */
function scopeOf(phrase: string): Pick<TraitEffect, "self" | "others" | "othersDiffElem"> {
  if (/자신과 속성이 다른 오퍼레이터/.test(phrase)) return { self: false, others: 1, othersDiffElem: true };
  // "장착자의 치유를 받은 오퍼레이터의 공격력" — 조건이 "팀 내 다른 오퍼레이터를 치유할 때"라 팀원 대상
  if (/(치유|버프|효과)를 받은 오퍼레이터/.test(phrase)) return { self: false, others: 1 };
  if (/팀 내의? (다른|기타) 오퍼레이터|다른 오퍼레이터|다른 팀원/.test(phrase)) return { self: false, others: 1 };
  if (/팀 전체|(목표|적)(가|이) 받는/.test(phrase)) return { self: true, others: 1 };
  return { self: true, others: 0 };
}

function zoneOf(phrase: string): ZoneInfo {
  return { ...zoneOnly(phrase), ...scopeOf(phrase) };
}

function zoneOnly(phrase: string): Omit<ZoneInfo, "self" | "others" | "othersDiffElem"> {
  // 생존 효과는 "+" 바로 앞 능력치 이름으로 판단 ("치유를 받은 오퍼레이터의 공격력"은 공격력)
  const statWord = phrase.trim().match(/(공격력|피해|치명타 확률|치명타 피해|능력치|아츠 강도|충전 효율|치유 효율|치유 효과|최대 생명력|생명력|방어력|보호 효과|보호)\s*$/)?.[1];
  const surv = statWord ?? phrase;
  if (/치유 효율|치유 효과/.test(surv)) return { zone: "heal" };
  if (/생명력/.test(surv) && !/공격력|피해/.test(statWord ?? "")) return { zone: "hp" };
  if (/방어력/.test(surv)) return { zone: "def" };
  if (/보호/.test(surv) && !/공격력|피해/.test(statWord ?? "")) return { zone: "shield" };
  // "X 상태의 적에게 / 목표에 주는", "X을 부착한 적에게 주는" → 적이 그 상태일 때만
  const enemyM = phrase.match(/(\S+(?: \S+)?)\s*(?:상태의|상태인|을 부착한|를 부착한|이 부착된|가 부착된)\s*(?:적|목표)(?:에게|에)\s*주는/);
  const enemyState = enemyM
    ? ["불균형", ...STATE_ORDER].filter((t) => phrase.includes(t)).join("·") || enemyM[1].replace(/^(장착자가|자신이|플루라이트가)\s*/, "")
    : undefined;
  // "해당 강력한 일격이 주는 피해" 처럼 특정 공격 1회에만 붙는 효과
  if (/^\s*해당 .*(이|가) 주는/.test(phrase)) return { zone: null, skip: "특정 공격 1회에만 붙는 효과" };
  if (/궁극기 충전 효율/.test(phrase)) return { zone: "ultGain" };
  if (/연계 스킬 쿨타임 감소/.test(phrase)) return { zone: "comboCdr" };
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
    const taken = /(목표|적)(가|이)? ?받는|^\s*받는 /.test(phrase);
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
      if (!e.cond) continue; // 조건 없는 줄(첫 줄 능력치)은 중첩 대상이 아님
      if (st) e.maxStack = Number(bb[st[1]] ?? 1) || 1;
      if (cd) e.cooldown = Number(bb.cd ?? bb["cd "] ?? 0) || undefined;
    }
    pending = [];
  };

  let gate: TraitEffect["gate"];
  let lastDuration: number | undefined;
  let lastCond = "";
  let lastSentenceStart = 0;
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
      // "…중첩될 때마다 지속 시간은 따로 계산됩니다" → 이 문장과 바로 앞 문장의 중첩 효과
      if (/지속 시간은 따로 계산/.test(sentence)) for (const e of out.slice(lastSentenceStart)) e.separate = true;
      if (/메인 컨트롤 오퍼레이터일 경우/.test(sentence)) continue; // 배수 조정 문장 — 조작 여부 가정 안 함
      if (/^(같은 이름|두 효과|각 효과|해당 효과)/.test(sentence.trim())) { applyInfo(sentence); continue; }
      const cm = sentence.match(/^(.*?(?:때마다|마다|때|후|경우|으면|하면|시))(?:,\s*|\s+)(.*)$/);
      let cond = cm ? cm[1] : "";
      // "스택이 중첩될 때마다" 처럼 앞 문장 효과를 이어 설명하는 조건은 앞 문장 조건을 그대로
      if (/^(스택이|강화 상태가|해당 상태가)/.test(cond) && lastCond) cond = lastCond;
      if (cond && !/^최대 중첩 시/.test(cond)) lastCond = cond;
      let body = cm ? cm[2] : sentence;
      const durM = body.match(/⟦(\w*duration\w*)⟧초 (?:동안|내에)/);
      // 지속 시간이 안 적힌 문장은 같은 특성의 바로 앞 지속 시간을 이어 씀 ("…있을 때마다, 추가 +X")
      const duration = durM ? Number(bb[durM[1]] ?? 0) : cond ? lastDuration : undefined;
      if (durM) lastDuration = duration;
      const inlineStack = sentence.match(/최대 ⟦([^⟧]+)⟧스택까지 중첩|최대 중첩 ⟦([^⟧]+)⟧스택|최대 ⟦([^⟧]+)⟧스택까지만 중첩/);
      // "본 크러셔의 압박은 최대 N스택까지만 중첩" · "강화 상태는 최대 N스택까지 중첩" — 수치 없이 중첩 한도만 말하는 문장 → 앞 문장의 조건부 효과에
      if (inlineStack && !/\+⟦/.test(sentence)) {
        const n = Number(bb[inlineStack[1] ?? inlineStack[2] ?? inlineStack[3]] ?? 1) || 1;
        for (const e of out.slice(lastSentenceStart)) if (e.cond && e.maxStack === 1) e.maxStack = n;
        continue;
      }
      const afterFull: TraitEffect["afterFull"] = /스택일 때|최대 중첩 시/.test(cond) ? "while" : /스택까지 중첩된 후/.test(cond) ? "reset" : undefined;
      const sentenceStart = out.length;
      // "N초 내에 사용한 다음 배틀 스킬(혹은 궁극기)의 지속 시간 동안 주는 X 피해" → 그 스킬에만
      let onlyTypes: DmgType[] | undefined;
      const nx = body.match(/다음 ([^의]+)의 지속 시간 동안/);
      if (nx) {
        onlyTypes = Object.entries(KIND_WORD).filter(([w]) => nx[1].includes(w)).map(([, k]) => k as DmgType);
        body = body.slice(body.indexOf(nx[0]) + nx[0].length);
      }
      for (const part of body.split(/,\s*/)) {
        if (/다른 오퍼레이터는 절반의 효과/.test(part) && out.length) {
          out[out.length - 1].others = 0.5;
          continue;
        }
        // "최대 +{a*max_stack}" → 앞 효과의 최대 스택
        const cap = part.match(/최대 \+⟦[^⟧*]+\*([^⟧%]+)%?⟧/);
        if (cap && out.length > sentenceStart) {
          out[out.length - 1].maxStack = Number(bb[cap[1]] ?? 1) || 1;
          continue;
        }
        if (!part.includes("⟦") || /초 동안 지속|초 (?:동안|내에)$/.test(part.trim())) continue;
        const value = valueOf(part, bb);
        if (value === undefined) {
          const xs = part.match(/⟦(atk_scale\w*)%?⟧/);
          if (xs) out.push({ text: part.replace(/⟦[^⟧]+⟧/g, "N").trim(), zone: null, value: 0, cond, maxStack, self: true, others: 0, extraScale: Number(bb[xs[1]] ?? 0) });
          // "팀 내 다른 오퍼레이터는 절반의 효과를 획득함" → 바로 앞 효과를 팀원도 절반 받음
          if (/다른 오퍼레이터는 절반의 효과/.test(part) && out.length) out[out.length - 1].others = 0.5;
          continue;
        }
        const phrase = part.slice(0, Math.max(part.indexOf("+"), 0)) || part;
        const z = zoneOf(phrase);
        // 공격력 +{atk_up:0} 처럼 % 표기가 없으면 고정 공격력
        if (z.zone === "atk" && !/⟦[^⟧]*%⟧/.test(part) && !part.includes("[")) z.zone = "flatAtk";
        // 생명력 +{hp_up} 처럼 % 표기가 없으면 고정 생명력
        if (z.zone === "hp" && !/⟦[^⟧]*%⟧/.test(part)) z.zone = "hpFlat";
        const eff: TraitEffect = {
          text: part.replace(/⟦[^⟧]+⟧/g, "").trim(),
          ...z,
          types: onlyTypes ?? z.types,
          value,
          cond,
          duration,
          maxStack: inlineStack ? Number(bb[inlineStack[1] ?? inlineStack[2] ?? inlineStack[3]] ?? 1) || 1 : maxStack,
          cooldown,
          gate,
          afterFull,
        };
        // "다음 배틀 스킬의 피해 +X" → 그 스킬 1회에 소모되는 누적 효과
        const nextM = phrase.match(/다음 (배틀 스킬|연계 스킬|궁극기)의? ?피해/);
        if (nextM && eff.zone === "dmg") {
          eff.consumeBy = KIND_WORD[nextM[1]];
          eff.types = [KIND_WORD[nextM[1]] as DmgType];
        }
        if (/지속 시간은 따로 계산/.test(sentence)) eff.separate = true;
        out.push(eff);
        pending.push(eff);
      }
      if (out.length > sentenceStart) lastSentenceStart = sentenceStart;
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
  "열기 취약": ["열기 취약"],
  "전기 취약": ["전기 취약"],
  "냉기 취약": ["냉기 취약"],
  "자연 취약": ["자연 취약"],
  허약: ["허약"],
  "오리지늄 결정": ["오리지늄 결정"],
  연타: ["연타"],
  // 아츠 폭발: 같은 속성 부착을 다시 하면 발동 ✅ → 자기 속성 부착을 하는 오퍼레이터는 혼자 가능
  "아츠 폭발": ["아츠 폭발", "열기 부착", "전기 부착", "냉기 부착", "자연 부착"],
  // 속성별 아츠 폭발 (관문 "자연 폭발, 냉기 폭발 피해를 줄 때") — 그 속성 부착을 거듭하면 발동
  "열기 폭발": ["열기 폭발", "열기 부착"],
  "전기 폭발": ["전기 폭발", "전기 부착"],
  "냉기 폭발": ["냉기 폭발", "냉기 부착"],
  "자연 폭발": ["자연 폭발", "자연 부착"],
  "스킬 게이지": ["스킬 게이지를 회복", "스킬 게이지 회복"],
  증폭: ["증폭"],
  비호: ["비호"],
  취약: ["취약"],
  "전기 증폭": ["전기 증폭"],
  "열기 증폭": ["열기 증폭"],
  "냉기 증폭": ["냉기 증폭"],
  "자연 증폭": ["자연 증폭"],
  치유: ["치유", "생명력을 회복", "생명력 회복"],
};
/** 받침에 맞는 목적격 조사 */
const withObj = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? `${w}을` : `${w}를`;
};
const STATE_ORDER = Object.keys(STATE_WORDS).sort((a, b) => b.length - a.length);

/** 조건 문장 → 이 오퍼레이터가 혼자 발동하는 빈도 (회/초). 불가면 이유 */
export function triggerRate(cond: string, kit: OperatorKit, r: Record<"battle" | "combo" | "ult", number>): { rate: number; via: string } | { rate: 0; why: string } {
  if (!cond) return { rate: Infinity, via: "항상" };
  // "장착자의 생명력이 80%보다 높을 때" — TODO(실측): 치유가 있는 일반적인 전투에서 유지된다고 가정 (HIGH_HP_UPTIME)
  if (/생명력이 .*(높을|이상일) 때/.test(cond)) return { rate: Infinity, via: `생명력 높게 유지 가정 (가동 ${Math.round(HIGH_HP_UPTIME * 100)}%)` };
  if (/다른 오퍼레이터|팀 내/.test(cond) && !/장착자/.test(cond)) return { rate: 0, why: "동료가 발동해야 하는 조건" };
  // 조건에 명시된 스킬 종류
  const named = Object.entries(KIND_WORD).filter(([w]) => cond.includes(w)).map(([, k]) => k as SkillKind);
  const rateOf = (kinds: SkillKind[]) => Math.max(0, ...kinds.map((k) => (k === "basic" ? 1 / BASIC_CHAIN_SECONDS : r[k])));
  const label = (kinds: SkillKind[]) => kinds.map((k) => ({ basic: "일반 공격", battle: "배틀 스킬", combo: "연계 스킬", ult: "궁극기" })[k]).join("·");
  // 1) 스킬 사용·명중
  if (/사용(할|했을|한|하여)? ?(때|후)|명중할 때|피해를 (줄|준) ?(때|후)/.test(cond) && named.length && !STATE_ORDER.some((s) => cond.includes(s))) {
    return { rate: named.reduce<number>((s, k) => s + (k === "basic" ? 1 / BASIC_CHAIN_SECONDS : r[k]), 0), via: `${label(named)} 사용` };
  }
  // 2) 강력한 일격 = 일반 공격 1세트의 마지막 타 (세트당 1회)
  if (/강력한 일격/.test(cond)) return { rate: 1 / BASIC_CHAIN_SECONDS, via: "강력한 일격 (일반 공격 세트마다)" };
  // 3) 치명타가 터졌을 때: 타격 빈도 × 치명타 확률
  if (/치명타(?: 피해)?를 (준|줄)/.test(cond)) {
    const cr = kit.critRate ?? 0.05;
    // 스킬 종류를 안 밝히면 모든 타격(일반 공격 + 배틀·연계·궁극기)
    const kinds = named.length ? named : (["basic", "battle", "combo", "ult"] as SkillKind[]);
    // 일반 공격은 타격마다, 스킬은 1회 사용에 한 번이라도 치명타가 날 확률 1 − (1 − 치명률)^타수
    const rate = kinds.reduce<number>(
      (s, k) => s + (k === "basic" ? ((kit.basicHits ?? 5) / BASIC_CHAIN_SECONDS) * cr : r[k] * (1 - (1 - cr) ** (kit.skillHits?.[k] ?? 1))),
      0,
    );
    return { rate: rate * ASSUME.critHitScale, via: `${label(kinds)} 치명타 (치명률 ${Math.round(cr * 100)}%)` };
  }
  // 3-2) "스킬이 적에게 명중할 때마다" 처럼 종류 없이 스킬 전체 (상태 조건이 없을 때)
  if (!named.length && /스킬(이|을|로)/.test(cond) && /명중|사용|피해를 (줄|준)/.test(cond) && !STATE_ORDER.some((x) => cond.includes(x))) {
    return { rate: r.battle + r.combo + r.ult, via: "스킬 사용" };
  }
  // 4) 상태를 부여·소모 — "강타, 갑옷 파괴" · "감전 혹은 부식"처럼 여러 상태면 하나라도 되면 됨 (가장 잦은 것)
  const found = STATE_ORDER.filter((x) => cond.includes(x)).filter((x, _, arr) => !arr.some((o) => o !== x && o.includes(x)));
  if (found.length > 1) {
    const tries = found.map((st) => triggerRate(found.filter((o) => o !== st).reduce((c, o) => c.split(o).join(""), cond), kit, r));
    const ok = tries.filter((t) => t.rate > 0).sort((a, b) => b.rate - a.rate);
    return ok[0] ?? tries[0];
  }
  const state = STATE_ORDER.find((s) => cond.includes(s));
  if (!state) return { rate: 0, why: "자동으로 판단하기 어려운 조건" };
  const consume = /소모/.test(cond);
  const kinds = (named.length ? named : (["battle", "combo", "ult"] as SkillKind[])).filter((k) => {
    const t = kit.texts[k] ?? "";
    const hit = STATE_WORDS[state].some((w) => t.includes(w));
    return hit && (!consume || t.includes("소모"));
  });
  // 아츠 이상: 혼자 서로 다른 속성 부착을 2가지 이상 하면 스스로 반응 가능 (나중 속성이 반응 결정 ✅)
  if (!kinds.length && !consume) {
    const REACT: Record<string, string> = { 연소: "열기", 감전: "전기", 동결: "냉기", 부식: "자연" };
    const all = Object.values(kit.texts).join("\n") + " " + kit.tags.join(" ");
    const elems = ["열기", "전기", "냉기", "자연"].filter((e) => all.includes(`${e} 부착`));
    if (elems.length >= 2 && (state === "아츠 이상" || (REACT[state] && elems.includes(REACT[state])))) {
      const ks = (["battle", "combo", "ult"] as SkillKind[]).filter((k) => elems.some((e) => (kit.texts[k] ?? "").includes(`${e} 부착`)));
      if (ks.length) return { rate: rateOf(ks), via: `${elems.join("·")} 부착을 혼자 해서 ${state}` };
    }
  }
  // 지속형 모드(예: 3초마다 치유)가 그 상태를 계속 만들면 주기 빈도 × 모드 가동률
  const periodicRate = (k: SkillKind) => {
    const pd = kit.periodic?.[k];
    if (!pd || k === "basic" || !/지속적으로/.test(kit.texts[k] ?? "")) return 0;
    return (1 / pd.interval) * Math.min(1, pd.duration * r[k]);
  };
  const best = kinds.reduce<{ rate: number; periodic: boolean }>(
    (acc, k) => {
      const base = k === "basic" ? 1 / BASIC_CHAIN_SECONDS : r[k];
      const per = periodicRate(k);
      return per > base && per > acc.rate ? { rate: per, periodic: true } : base > acc.rate ? { rate: base, periodic: false } : acc;
    },
    { rate: 0, periodic: false },
  );
  if (kinds.length && best.periodic) {
    const k = kinds.find((x) => periodicRate(x) === best.rate)!;
    return { rate: best.rate, via: `${label([k])} 지속 효과로 ${state} (${kit.periodic![k]!.interval}초 간격)` };
  }
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
    case "comboCdr": b.comboCdr += value; break;
    case "heal": b.healEff += value; break;
    case "hp": b.hpPct += value; break;
    case "hpFlat": b.hpPct += value / (kit.hp || 5000); break; // 고정 생명력 → 기초 생명력 대비 비율로
    case "def": b.defPct += value; break;
    case "shield": b.shieldEff += value; break;
    case "taken":
      if (!elemOk) return undefined;
      b.taken += value;
      break;
    case "dmg": {
      if (!elemOk) return undefined;
      if (!basicCounted() && e.types?.every((t) => t === "basic")) return undefined;
      if (e.types) for (const t of e.types) b.dmg[t] += value;
      else b.dmg.all += value;
      break;
    }
    default: return undefined;
  }
  return b;
}

/** 팀원(속성 무관) 기준 능력치 — 대상 비율은 따로 곱한다 */
export function teammateBag(e: TraitEffect, value: number): StatBag | undefined {
  if (e.zone === "heal" || e.zone === "hp" || e.zone === "hpFlat" || e.zone === "def" || e.zone === "shield") return undefined;
  return effectBag({ ...e, elems: undefined }, { element: "물리" } as OperatorKit, value);
}

/** 팀원 중 효과를 받는 비율 (속성 조건) */
export function teammateShare(e: TraitEffect, selfElement: string, pool: TeamPool): number {
  if (!pool.others.length) return 0;
  const ok = pool.others.filter((o) => {
    if (e.othersDiffElem && o.element === selfElement) return false;
    if ((e.zone === "dmg" || e.zone === "taken") && e.elems) return e.elems.includes(o.element) || (o.element !== "물리" && e.elems.includes("아츠"));
    return true;
  });
  return ok.length / pool.others.length;
}

/** 동료가 만들어 주는 조건: 3인 편성 확률 × 그 동료들의 평균 발동 빈도 */
export function poolTrigger(cond: string, pool: TeamPool): { p: number; rate: number; k: number; n: number; via: string } | undefined {
  // "장착자가 전기 증폭을 획득할 때"처럼 받는 쪽 조건은 동료가 만들어 줌
  if (!cond || (/장착자/.test(cond) && !/획득할 때|받을 때/.test(cond))) return undefined;
  const hits = pool.others
    .map((o) => ({ o, t: triggerRate(cond, o.kit, o.rates) }))
    .filter((x) => x.t.rate > 0 && Number.isFinite(x.t.rate));
  if (!hits.length) return undefined;
  const n = pool.others.length;
  const k = hits.length;
  const rate = hits.reduce((s, x) => s + x.t.rate, 0) / k;
  return { p: atLeastOne(n, k), rate, k, n, via: `동료 ${n}명 중 ${k}명이 가능` };
}

export interface TeamEffectLine extends WeaponEffectLine {
  /** 원본 효과 (메인 딜러 속성 판정용) */
  effect?: TraitEffect;
  /** 팀원 기준 능력치 (가동률·절반 반영) */
  bag: StatBag;
  /** 효과를 받는 팀원 비율 */
  share: number;
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
  /** 평균 스택 · 최대 스택 (중첩형) */
  stacks: number;
  maxStack: number;
  /** 누가 받는지 */
  target: "본인" | "팀 전체" | "팀원" | "적";
}

export interface WeaponEval {
  bag: StatBag;
  atk: number;
  levels: number[];
  applied: WeaponEffectLine[];
  /** 팀원에게 가는 효과 */
  team: TeamEffectLine[];
  /** 추가 타격 (초당 횟수 × 공격력 배율) */
  extraHits: { text: string; rate: number; scale: number; via: string }[];
  excluded: { text: string; reason: string }[];
}

const targetOf = (e: TraitEffect): WeaponEffectLine["target"] =>
  e.zone === "taken" ? "적" : e.self && e.others ? "팀 전체" : e.others ? "팀원" : "본인";

/** 무기 하나의 기대 능력치 — 능력치 스킬 2개(키 기준) + 고유 특성(문장 해석) */
export function evaluateWeapon(w: CombatWeapon, kit: OperatorKit, baseAttrs: Record<AttrName, number>, refine = 0, pool?: TeamPool): WeaponEval {
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
  const team: TeamEffectLine[] = [];
  const extraHits: { text: string; rate: number; scale: number; via: string }[] = [];
  const excluded: { text: string; reason: string }[] = [];
  /** 효과 하나 반영: 본인 몫은 bag 에, 팀원 몫은 team 에 */
  const take = (e: TraitEffect, stacks: number, uptime: number, via: string) => {
    let used = false;
    if (e.self) {
      const add = effectBag(e, kit, e.value * stacks);
      if (add) {
        bag = addBag(bag, add);
        used = true;
      }
    }
    if (e.others > 0 && pool) {
      const tb = teammateBag(e, e.value * stacks * e.others);
      const share = teammateShare(e, kit.element, pool);
      if (tb && share > 0) {
        team.push({ text: e.text, uptime, value: e.value * e.others, applied: e.value * stacks * e.others, pct: isPct(e), via, target: targetOf(e), bag: tb, share, effect: e, stacks, maxStack: e.maxStack });
        used = true;
      }
    }
    if (used) {
      if (e.self && effectBag(e, kit, 1)) applied.push({ text: e.text, uptime, value: e.value, applied: e.value * stacks, pct: isPct(e), via, target: targetOf(e), stacks, maxStack: e.maxStack });
    } else
      excluded.push({
        text: e.text,
        reason: !basicCounted() && e.zone === "dmg" && e.types?.every((t) => t === "basic") ? "일반 공격 피해 — 일반 공격 시간 실측 전이라 미반영" : "속성이 맞지 않음 → 0",
      });
  };
  if (trait) {
    const bb = trait.levels[levels.at(-1)! - 1]?.bb ?? {};
    const effects = parseTrait(trait.desc, bb);
    // 능력치 조건(지능 ≥ 의지)은 무기 능력치 스킬까지 더한 값으로 판단
    const attrs = { ...baseAttrs };
    attrs.힘 += bag.str; attrs.민첩 += bag.agi; attrs.지능 += bag.int; attrs.의지 += bag.wil;
    attrs[kit.mainAttr] += bag.main;
    // 충전 효율이 궁극기 빈도에 영향 → 조건 없는 효과를 먼저 더한 뒤 빈도 계산
    const always = effects.filter((e) => !e.cond && !e.enemyState && !e.skip && !e.extraScale);
    for (const e of always) take(e, 1, 1, "항상");
    const r = rates(kit.rotation, bag.ultGain, bag.comboCdr);
    kit = { ...kit, critRate: (kit.critRate ?? 0.05) + bag.critRate };
    let prev: { rate: number; stacks: number; maxStack: number; duration?: number; full?: number } | undefined;
    /** 조건 → 빈도 (혼자 → 안 되면 동료 기대값) */
    const resolve = (cond: string): { rate: number; p: number; via: string } | { why: string } => {
      // "적에게 N스택 혹은 그 이상의 아츠 부착을 부여한 후" — 내 속성 부착이 N스택까지 쌓여야 함.
      //   다른 속성 팀원의 부착은 반응으로 내 스택을 소모 → 다음 내 부착이 끊기기 전에 올 확률 q = 내 빈도 / (내 빈도 + 다른 속성 빈도 + 1/지속)
      //   N스택에서 부착하는 비율 = q^(N−1) → 발동 빈도 = 내 부착 빈도 × q^(N−1)
      const stackM = cond.match(/(?:⟦(\w+)⟧|(\d+))스택 혹은 그 이상의 (아츠|열기|전기|냉기|자연) 부착/);
      if (stackM && kit.element !== "물리") {
        const n = Number(stackM[1] ? bb[stackM[1]] : stackM[2]) || 1;
        const ra = attachRate(kit, r, kit.element);
        if (ra <= 0) return { why: `${kit.element} 부착을 스스로 하지 않음` };
        const lo = foreignAttachRate(kit, pool);
        const q = ra / (ra + lo + 1 / STATE_DURATION["아츠 부착"]);
        return { rate: ra * q ** (n - 1), p: 1, via: `${kit.element} 부착 ${n}스택 도달 (${Math.round(q ** (n - 1) * 100)}% — 다른 속성 팀원 반응으로 끊김 반영)` };
      }
      // "적에게 감전을 부여한 후" 처럼 내 속성 반응: 직접 거는 것(강제 감전 등) + 다른 속성 부착이 있을 때 내 부착으로 반응
      //   다른 속성 부착이 적에게 남아 있는 비율 = 다른 속성 빈도 / (다른 속성 빈도 + 내 부착 빈도 + 1/지속)
      const reactM = cond.match(/(연소|감전|동결|부식)(?:을|를) 부여/);
      if (reactM && REACTION_ELEM[reactM[1]] === kit.element && !/소모/.test(cond)) {
        const own = triggerRate(cond, kit, r);
        const ownRate = own.rate > 0 && Number.isFinite(own.rate) ? own.rate : 0;
        const ra = attachRate(kit, r, kit.element);
        const lo = foreignAttachRate(kit, pool);
        const pOther = lo > 0 ? lo / (lo + ra + 1 / STATE_DURATION["아츠 부착"]) : 0;
        const rate = ownRate + ra * pOther;
        if (rate > 0)
          return {
            rate,
            p: 1,
            via: [ownRate > 0 ? ("via" in own ? own.via : "") : "", ra * pOther > 0 ? `팀원 다른 속성 부착에 내 ${kit.element} 부착으로 ${reactM[1]} (${Math.round(pOther * 100)}%)` : ""].filter(Boolean).join(" + "),
          };
      }
      // "팀 내 임의의 오퍼레이터가 배틀 스킬을 사용할 때" → 본인 + 팀원 3명의 그 스킬 빈도 (팀원은 동료 평균)
      const anyM = cond.match(/팀 내 (?:임의의|모든) 오퍼레이터가 (배틀 스킬|연계 스킬|궁극기)/);
      if (anyM) {
        const k = KIND_WORD[anyM[1]] as "battle" | "combo" | "ult";
        const mates = pool?.others.length ? pool.others.reduce((sum, o) => sum + o.rates[k], 0) / pool.others.length : r[k];
        return { rate: r[k] + TEAMMATES * mates, p: 1, via: `팀 전체 ${anyM[1]} (본인 + 팀원 ${TEAMMATES}명 평균)` };
      }
      const t = triggerRate(cond, kit, r);
      if (t.rate > 0) return { rate: t.rate, p: 1, via: "via" in t ? t.via : "" };
      const pt = pool ? poolTrigger(cond, pool) : undefined;
      if (pt) return { rate: pt.rate, p: pt.p, via: `${pt.via} · 3인 편성 시 ${Math.round(pt.p * 100)}%` };
      return { why: "why" in t ? t.why : "발동 불가" };
    };
    /** 적 상태 가동률 (불균형은 가정값, 나머지는 그 상태를 만드는 빈도 × 상태 지속) */
    const enemyUptime = (states: string): { u: number; via: string } => {
      let u = 1;
      const vias: string[] = [];
      for (const st of states.split("·")) {
        if (st === "불균형") {
          const su = kit.staggerUptime ?? STAGGER_UPTIME;
          u = Math.min(u, su);
          vias.push(`불균형 가동 ${Math.round(su * 100)}% (불균형치 기준 가정)`);
          continue;
        }
        const res = resolve(`적에게 ${st}을 부여할 때`);
        if ("why" in res) return { u: 0, via: `${st} 못 만듦` };
        const d = STATE_DURATION[st] ?? 10;
        u = Math.min(u, res.p * Math.min(1, res.rate * d));
        vias.push(`${st} ${Math.round(res.p * Math.min(1, res.rate * d) * 100)}%`);
      }
      return { u, via: vias.join(" · ") };
    };
    for (const e of effects) {
      if (always.includes(e)) continue;
      if (e.skip) { excluded.push({ text: e.text, reason: e.skip }); continue; }
      if (!gateOk(e.gate, attrs)) { excluded.push({ text: e.text, reason: `${e.gate!.a} ${e.gate!.op === ">=" ? "≥" : ">"} ${e.gate!.b} 조건 불충족 → 0` }); continue; }
      // 적 상태에만 붙는 효과 (조건 없음) → 그 상태 가동률
      if (e.enemyState && !e.cond) {
        const eu = enemyUptime(e.enemyState);
        if (eu.u <= 0) { excluded.push({ text: e.text, reason: `적이 ${e.enemyState} 상태일 때만 — ${eu.via}` }); continue; }
        take(e, eu.u, eu.u, `적 ${eu.via}`);
        continue;
      }
      // 바로 앞 효과가 가득 찼을 때
      if (e.afterFull && !prev) { excluded.push({ text: e.text, reason: "앞 효과가 발동하지 않음 → 0" }); continue; }
      if (e.afterFull && prev) {
        const full = prev.rate > 0 ? prev.maxStack / prev.rate : Infinity;
        const dur = e.duration ?? 0;
        // while: 스택마다 지속 시간이 따로 → 최근 지속 시간 안의 발동 횟수 N ~ 포아송(빈도 × 지속), 최대 스택일 확률 = P(N ≥ 최대)
        //        (지속 시간을 모르면 예전 근사 (평균 스택/최대)^최대) · reset: 쌓는 시간 + 유지 시간 주기
        const u =
          e.afterFull === "while"
            ? prev.full !== undefined
              ? prev.full
              : Math.min(1, prev.stacks / prev.maxStack) ** prev.maxStack
            : dur > 0
              ? dur / (dur + full)
              : 0;
        if (u <= 0) { excluded.push({ text: e.text, reason: "앞 효과가 가득 차지 않음" }); continue; }
        take(e, u, u, e.afterFull === "while" ? "앞 효과 최대 스택일 때" : `최대 스택 → ${dur}초 유지 후 초기화`);
        continue;
      }
      const res = resolve(e.cond);
      if ("why" in res) { excluded.push({ text: e.text, reason: res.why }); continue; }
      // 궁극기 사용 시 일반 공격 피해 → 궁극기 모드의 강화 일반 공격에 동기화 (모드 내내 유지)
      if (
        e.zone === "dmg" &&
        e.types?.every((t) => t === "basic") &&
        /궁극기 사용/.test(res.via) &&
        kit.rotation.moved?.some((m) => m.synced) &&
        (!e.elems || e.elems.includes(kit.element) || (kit.element !== "물리" && e.elems.includes("아츠")))
      ) {
        bag.dmg.ultMode += e.value;
        applied.push({ text: e.text, uptime: 1, value: e.value, applied: e.value, pct: true, via: "궁극기 모드 강화 일반 공격 동안 유지", target: "본인", stacks: 1, maxStack: 1 });
        continue;
      }
      const rate = e.cooldown ? Math.min(res.rate, 1 / e.cooldown) : res.rate;
      // 추가 타격: 초당 피해에 직접 더함
      if (e.extraScale) {
        const perSec = Number.isFinite(rate) ? rate * res.p : 0;
        extraHits.push({ text: e.text, rate: perSec, scale: e.extraScale, via: res.via });
        continue;
      }
      const dur = e.duration ?? 0;
      let stacks: number;
      if (!Number.isFinite(rate)) stacks = e.maxStack * HIGH_HP_UPTIME; // 상시 조건
      // 다음 스킬에 소모: 그 스킬 1회가 받는 평균 스택 = min(최대, 쌓는 빈도 ÷ 그 스킬 빈도)
      else if (e.consumeBy && e.consumeBy !== "basic" && r[e.consumeBy] > 0) stacks = res.p * Math.min(e.maxStack, rate / r[e.consumeBy]);
      else if (dur > 0) {
        // 치명타처럼 무작위로 터지는 조건은 확률 모델, 스킬 사용처럼 주기적인 조건은 결정적 모델 (stackModel)
        const sm = stackModel(rate, dur, e.maxStack, { random: /치명타/.test(res.via), separate: !!e.separate });
        stacks = res.p * sm.mean;
        prev = { rate: rate * res.p, stacks, maxStack: e.maxStack, duration: dur, full: res.p * sm.full };
        take(e, stacks, stacks / e.maxStack, res.via);
        continue;
      }
      else if (e.maxStack > 1) {
        // 지속 시간 없는 누적형: 뒤에 "가득 찬 뒤 N초 후 초기화"가 있으면 (쌓는 시간 평균 절반 + 유지 시간 가득) 평균
        const reset = effects.slice(effects.indexOf(e) + 1).find((x) => x.afterFull === "reset");
        const D = reset?.duration ?? 0;
        const T = rate > 0 ? e.maxStack / rate : Infinity;
        stacks = res.p * (reset && Number.isFinite(T) ? ((e.maxStack / 2) * T + e.maxStack * D) / (T + D) : e.maxStack);
      }
      else { excluded.push({ text: e.text, reason: "지속 시간 정보 없음" }); continue; }
      prev = { rate: rate * res.p, stacks, maxStack: e.maxStack, duration: dur || undefined };
      take(e, stacks, stacks / e.maxStack, res.via);
    }
  }
  return { bag, atk: w.baseAtk[w.baseAtk.length - 1], levels, applied, team, extraHits, excluded };
}

const isPct = (e: TraitEffect) => e.zone !== "arts" && e.zone !== "flatAtk" && e.zone !== "hpFlat";

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

/** 역할 — 무기 점수에서 각 지표의 비중 (합 1) */
export interface RoleWeight {
  /** 표시 이름 (메인 딜러 / 서브 딜러 / 서포터 …) */
  label: string;
  /** 본인 피해 */
  self: number;
  /** 메인 딜러 피해 증가 */
  dealer: number;
  /** 치유량 (치유 스킬이 있는 오퍼레이터만, 없으면 메인 딜러 몫으로) */
  heal: number;
  /** 생존(실질 생명력) */
  survival: number;
}

/**
 * 직업 → 지표 비중 (CLASS_INFO 역할 설명 기준, 조정 가능한 가정값)
 * 메인 딜러는 남을 강화하는 효과가 의미 없고, 서포터는 본인 공격력이 의미 없다
 */
export const ROLE_WEIGHT: Record<string, RoleWeight> = {
  스트라이커: { label: "메인 딜러", self: 1, dealer: 0, heal: 0, survival: 0 },
  캐스터: { label: "서브 딜러", self: 0.5, dealer: 0.5, heal: 0, survival: 0 },
  가드: { label: "서브 딜러", self: 0.5, dealer: 0.5, heal: 0, survival: 0 },
  뱅가드: { label: "자원 수급", self: 0.25, dealer: 0.75, heal: 0, survival: 0 },
  서포터: { label: "서포터", self: 0, dealer: 0.7, heal: 0.3, survival: 0 },
  디펜더: { label: "디펜더", self: 0, dealer: 0.4, heal: 0.2, survival: 0.4 },
};

/** 메인 딜러 기준값 — 본인 피해 1위 무기를 낀 상태 */
export interface DealerRef {
  id: string;
  op: OperatorBase;
  kit: OperatorKit;
  bag: StatBag;
  atk: number;
  d: number;
  /** 이 오퍼레이터와 함께 쓸 가능성 가중치 (같은 속성 · 연계를 열어 주는 딜러일수록 큼) */
  weight?: number;
}

/** 팀 효과 하나가 메인 딜러 1명의 피해를 몇 % 올리는지 (속성이 안 맞으면 0) */
export function dealerGain(line: TeamEffectLine, effect: TraitEffect | undefined, selfElement: string, dealer: DealerRef): number {
  if (effect?.othersDiffElem && dealer.kit.element === selfElement) return 0;
  const add = effect ? effectBag({ ...effect }, dealer.kit, line.applied) : undefined;
  if (!add) return 0;
  return score(dealer.op, dealer.atk, addBag(dealer.bag, add)).overall / dealer.d - 1;
}

/** 이 오퍼레이터의 치유 스킬 빈도 (지속형은 주기) */
function healRate(kit: OperatorKit, k: SkillKind, r: Record<"battle" | "combo" | "ult", number>): number {
  if (k === "basic") return 0;
  const pd = kit.periodic?.[k];
  if (pd && /지속적으로/.test(kit.texts[k] ?? "")) return Math.max(r[k], (1 / pd.interval) * Math.min(1, pd.duration * r[k]));
  return r[k];
}

/** 초당 치유량 지수 = Σ 빈도 × (기초 + 계수 × 능력치) × (1 + 치유 효율) */
export function healIndex(kit: OperatorKit, attrs: Record<AttrName, number>, bag: StatBag): number {
  const r = rates(kit.rotation, bag.ultGain, bag.comboCdr);
  let sum = 0;
  for (const [k, list] of Object.entries(kit.heals ?? {}) as [SkillKind, { base: number; coef: number; attr?: AttrName }[]][]) {
    const amount = list.reduce((s, h) => s + h.base + h.coef * (h.attr ? attrs[h.attr] : 0), 0);
    sum += healRate(kit, k, r) * amount;
  }
  return sum * (1 + bag.healEff);
}

/** 실질 생명력 지수 = (기초 생명력 + 5 × 힘 증가) × (1 + 생명력%) × (1 + 보호 효과% — 보호를 주는 오퍼레이터만) */
export function survivalIndex(kit: OperatorKit, bag: StatBag): number {
  // 힘 1포인트 = 생명력 +5 ✅ (combat-mechanics §1). 레벨 90 기초 방어력이 0이라 방어력%는 무기 단독으로는 0
  const hp = ((kit.hp ?? 0) + 5 * bag.str) * (1 + bag.hpPct);
  const def = (kit.def ?? 0) * (1 + bag.defPct);
  const shield = /보호/.test(Object.values(kit.texts).join("\n")) ? 1 + bag.shieldEff : 1;
  return hp * ((def + 100) / 100) * shield;
}

/** 치유 스킬 유무·딜러 유무에 따라 비중 조정 */
export function effectiveRole(role: RoleWeight, kit: OperatorKit, dealers: DealerRef[]): RoleWeight {
  const w = { ...role };
  if (!Object.keys(kit.heals ?? {}).length) { w.dealer += w.heal; w.heal = 0; }
  if (!dealers.some((d) => d.id !== kit.id)) { w.self += w.dealer; w.dealer = 0; }
  return w;
}

/** 팀 효과들의 메인 딜러 피해 증가율 (가중 평균) */
export function teamGainOf(team: TeamEffectLine[], kit: OperatorKit, dealers: DealerRef[]): number {
  const others = dealers.filter((d) => d.id !== kit.id);
  if (!others.length) return 0;
  const W = others.reduce((g, d) => g + (d.weight ?? 1), 0);
  return team.reduce((s, l) => s + others.reduce((g, d) => g + (d.weight ?? 1) * dealerGain(l, l.effect, kit.element, d), 0) / W, 0);
}

/**
 * 본인 피해 합계 = 스킬 회전 피해(score.overall) + 이상 피해 + 추가 타격
 * 이상 피해 = (자기 이상 빈도 × 배율 + "강타 피해로 간주" 피해) × 공격력 × (1 + 아츠 강도/100) × 레벨 계수 — 피해 보너스·치명 ⚠️ 미확인 → 미적용
 */
export function selfDamageOf(kit: OperatorKit, sc: ScoreResult, bag: StatBag, extraHits: { rate: number; scale: number }[] = []): number {
  const r = rates(kit.rotation, bag.ultGain, bag.comboCdr);
  const anomalyKinds: [string, number][] =
    kit.element === "물리"
      ? [["강타", ANOMALY_SCALE.강타], ["갑옷 파괴", ANOMALY_SCALE["갑옷 파괴"]], ["물리 이상", ANOMALY_SCALE.띄우기]]
      : [["아츠 폭발", ANOMALY_SCALE.아츠폭발]];
  let eventRate = 0;
  let eventScale = 0;
  for (const [st, scale] of anomalyKinds) {
    const at = triggerRate(`적에게 ${st}을 부여할 때`, kit, r);
    if (at.rate > 0 && Number.isFinite(at.rate)) { eventRate = at.rate; eventScale = scale; break; }
  }
  const movedAnomaly = (kit.rotation.moved ?? []).filter((m) => m.to === "anomaly").reduce((s2, m) => s2 + r[m.from] * m.weight, 0);
  // 속성·모든 피해 보너스는 이상 피해에도 적용 (ANOMALY_DMG_BONUS — 강타용 세트 "고검의 잔향"이 물리 피해를 주는 등 게임 설계 근거, 실측 전)
  const elemBonus = ANOMALY_DMG_BONUS ? sc.dmgPct.basic - bag.dmg.basic : 0;
  const anomaly =
    (eventRate * eventScale + movedAnomaly) * sc.atk * (1 + sc.artsIntensity / 100) * (1 + elemBonus) * (kit.element === "물리" ? ANOMALY_LEVEL.phys : ANOMALY_LEVEL.arts);
  // 추가 타격: 일반 공격과 같은 피해 구간(속성·모든 피해, 치명, 받는 피해)
  const unit = (sc.byType.basic / (1 + sc.dmgPct.basic)) * (1 + sc.dmgPct.basic - bag.dmg.basic);
  const extra = extraHits.reduce((s, x) => s + x.rate * x.scale * unit, 0);
  return sc.overall + anomaly + extra;
}

/** 장비 세트 효과(3세트)를 무기 고유 특성과 같은 해석기로 평가 */
export function evaluateSuitEffect(desc: string | null | undefined, bb: Blackboard, kit: OperatorKit, attrs: Record<AttrName, number>, pool?: TeamPool): WeaponEval {
  const pseudo = {
    weaponId: "suit",
    name: "",
    rarity: 0,
    weaponType: 0,
    baseAtk: [0],
    skills: [{ skillId: "suit", name: null, desc: (desc ?? "").replace(/^\d+개 세트 효과:\s*/, ""), levels: [{ level: 1, bb }] }],
    breakthroughs: [{ stage: 0, level: 1, skillLevelBounds: [{ lowerBound: 1, upperBound: 1 }] }],
    potentials: [],
  } as unknown as CombatWeapon;
  return evaluateWeapon(pseudo, kit, attrs, 0, pool);
}

export interface WeaponValueRank {
  id: string;
  name: string;
  rarity: number;
  /** 본인 피해 (스킬 회전) */
  score: ScoreResult;
  /** 본인 피해 합계 = 스킬 + 이상 피해(아츠 강도) + 추가 타격 */
  selfDamage: number;
  /** 지표별 1위 대비 (0~1) */
  parts: { self: number; dealer: number; heal: number; survival: number };
  /** 메인 딜러 피해 증가율 기대값 (내부 지표) */
  dealerGain: number;
  /** Σ 비중 × 지표 */
  value: number;
  /** 1위 대비 */
  relative: number;
  levels: number[];
  applied: WeaponEffectLine[];
  team: TeamEffectLine[];
  extraHits: { text: string; rate: number; scale: number; via: string }[];
  excluded: { text: string; reason: string }[];
  bag: StatBag;
}

/**
 * 무기의 모든 능력치를 이 오퍼레이터에 맞춰 하나의 점수로
 *   value = w_본인 × 본인 피해/1위 + w_딜러 × (1+메인 딜러 피해 증가)/1위 + w_치유 × 치유량/1위 + w_생존 × 실질 생명력/1위
 *   - 본인 피해 = 스킬 회전 피해 + 일반 공격 + 이상 피해(아츠 폭발 160% / 물리 이상 120% × (1 + 아츠 강도/100)) + 추가 타격
 *   - 메인 딜러 피해 증가 = 스트라이커 전원(각자 1위 무기)에 팀 효과를 더한 피해 증가율 평균 (속성 불일치 0)
 *   - 비중은 ROLE_WEIGHT (치유 스킬이 없으면 치유 비중은 메인 딜러 몫으로)
 */
export function rankWeaponsByValue(
  op: OperatorBase,
  kit: OperatorKit,
  base: StatBag,
  weapons: [string, CombatWeapon][],
  refine = 0,
  pool?: TeamPool,
  role: RoleWeight = ROLE_WEIGHT.스트라이커,
  dealers: DealerRef[] = [],
): WeaponValueRank[] {
  const attrs0: Record<AttrName, number> = {
    힘: op.attrs.힘 + base.str,
    민첩: op.attrs.민첩 + base.agi,
    지능: op.attrs.지능 + base.int,
    의지: op.attrs.의지 + base.wil,
  };
  const roleW = effectiveRole(role, kit, dealers);
  const w = roleW;
  const heals = Object.keys(kit.heals ?? {}).length > 0;
  const others = dealers.filter((d) => d.id !== kit.id);

  const rows = weapons.map(([id, wp]) => {
    const ev = evaluateWeapon(wp, kit, attrs0, refine, pool);
    const bag = addBag(base, ev.bag);
    const sc = score(op, ev.atk, bag);
    const selfDamage = selfDamageOf(kit, sc, bag, ev.extraHits);
    const gain = teamGainOf(ev.team, kit, others);
    return { id, name: wp.name, rarity: wp.rarity, ev, sc, selfDamage, gain, heal: heals ? healIndex(kit, sc.attrs, bag) : 0, surv: survivalIndex(kit, bag) };
  });
  const max = (f: (x: (typeof rows)[number]) => number) => Math.max(1e-9, ...rows.map(f));
  const mSelf = max((x) => x.selfDamage);
  const mDealer = max((x) => 1 + x.gain);
  const mHeal = max((x) => x.heal);
  const mSurv = max((x) => x.surv);
  const scored = rows.map((x) => {
    const parts = { self: x.selfDamage / mSelf, dealer: (1 + x.gain) / mDealer, heal: heals ? x.heal / mHeal : 0, survival: x.surv / mSurv };
    const value = w.self * parts.self + w.dealer * parts.dealer + w.heal * parts.heal + w.survival * parts.survival;
    return { ...x, parts, value };
  });
  scored.sort((a, b) => b.value - a.value || b.parts.self - a.parts.self);
  const top = scored[0]?.value || 1;
  return scored.map((x) => ({
    id: x.id,
    name: x.name,
    rarity: x.rarity,
    score: x.sc,
    selfDamage: x.selfDamage,
    parts: x.parts,
    dealerGain: x.gain,
    value: x.value,
    relative: x.value / top,
    levels: x.ev.levels,
    applied: x.ev.applied,
    team: x.ev.team,
    extraHits: x.ev.extraHits,
    excluded: x.ev.excluded,
    bag: x.ev.bag,
  }));
}

// ───────── 장비 (무기와 같은 수식) ─────────

/** 세트 밖 1칸 후보: 칸마다 단독 점수 상위 N개 (전체 탐색과 결과가 같은지 gear-search.test 로 확인) */
export const GEAR_SEARCH = { offCandidates: 16 };

/**
 * 추천 장비 — 세트별 최적 4칸 (방어구 1 · 장갑 1 · 부품 2)
 *
 * 탐색 (세트마다 정확한 최적화)
 *   - 세트 효과(3개)를 켠 조합만: 4칸 모두 세트 · 또는 1칸만 세트 밖
 *   - 부품 2칸은 같은 부품 2개도 가능 (게임에서 같은 이름 부품을 두 칸에 장착 가능, 커뮤니티 빌드에서도 흔함)
 *   - 세트 밖 1칸 후보 = 그 칸 전체 장비 중 단독 점수 상위 GEAR_SEARCH.offCandidates개
 * 평가 = 무기와 같은 역할별 점수 (본인 피해 · 메인 딜러 강화 · 치유 · 생존)
 *   - 세트 효과는 고유 특성 해석기 그대로. 치명타 조건 세트(M. I. 경찰용 등)는 그 조합의 치명률로 다시 평가
 */
export function rankGearByValue(
  op: OperatorBase,
  kit: OperatorKit,
  weaponAtk: number,
  base: StatBag,
  pieces: [string, GearPiece][],
  suits: [string, GearSuit][],
  role: RoleWeight = ROLE_WEIGHT.스트라이커,
  dealers: DealerRef[] = [],
  pool?: TeamPool,
  forge = 0,
  offCandidates = GEAR_SEARCH.offCandidates,
): GearRank[] {
  const w = effectiveRole(role, kit, dealers);
  const heals = Object.keys(kit.heals ?? {}).length > 0;
  const attrs: Record<AttrName, number> = { 힘: op.attrs.힘 + base.str, 민첩: op.attrs.민첩 + base.agi, 지능: op.attrs.지능 + base.int, 의지: op.attrs.의지 + base.wil };
  const sc0 = score(op, weaponAtk, base);
  const ref = {
    self: Math.max(1e-9, selfDamageOf(kit, sc0, base)),
    heal: heals ? Math.max(1e-9, healIndex(kit, sc0.attrs, base)) : 1,
    surv: Math.max(1e-9, survivalIndex(kit, base)),
  };
  // 세트 효과 평가 (치명타 조건이 있는 세트는 치명률 1% 단위로 캐시)
  const suitById = new Map(suits);
  const critSensitive = new Set(suits.filter(([, s]) => (s.effects.find((x) => x.pieces === 3) ?? s.effects[0])?.desc?.includes("치명타를")).map(([sid]) => sid));
  const setCache = new Map<string, { bag: StatBag; gain: number; extra: { rate: number; scale: number }[] }>();
  const setEval = (sid: string, critRate: number) => {
    const key = critSensitive.has(sid) ? `${sid}|${Math.round(critRate * 100)}` : sid;
    let v = setCache.get(key);
    if (!v) {
      const suit = suitById.get(sid);
      const e = suit?.effects.find((x) => x.pieces === 3) ?? suit?.effects[0];
      if (!e) v = { bag: emptyBag(), gain: 0, extra: [] };
      else {
        const ev = evaluateSuitEffect(e.desc, e.bb as Blackboard, { ...kit, critRate }, attrs, pool);
        v = { bag: ev.bag, gain: teamGainOf(ev.team, kit, dealers), extra: ev.extraHits };
      }
      setCache.set(key, v);
    }
    return v;
  };
  const objective = (bag: StatBag, si?: { gain: number; extra: { rate: number; scale: number }[] }) => {
    const sc = score(op, weaponAtk, bag);
    return (
      w.self * (selfDamageOf(kit, sc, bag, si?.extra ?? []) / ref.self) +
      w.dealer * (1 + (si?.gain ?? 0)) +
      w.heal * (heals ? healIndex(kit, sc.attrs, bag) / ref.heal : 0) +
      w.survival * (survivalIndex(kit, bag) / ref.surv)
    );
  };
  const poolP = pieces.filter(([, p]) => p.minWearLv >= 70);
  const byId = new Map(poolP);
  const pb = new Map(poolP.map(([id, p]) => [id, gearBag(p, forge)]));
  const solo = new Map(poolP.map(([id]) => [id, objective(addBag(base, pb.get(id)!))]));
  const bySlot = (pred: (p: GearPiece) => boolean, slot: number) => poolP.filter(([, p]) => p.partType === slot && pred(p)).map(([id]) => id);
  const topOff = (slot: number) => bySlot(() => true, slot).sort((a, b) => solo.get(b)! - solo.get(a)!).slice(0, offCandidates);
  const off = [topOff(0), topOff(1), topOff(2)];
  /** 4칸 조합 평가: 장비 합 → (치명률에 맞춘) 세트 효과 → 점수 */
  const evalLoadout = (sid: string, ids: string[]) => {
    let gearSum = base;
    for (const id of ids) gearSum = addBag(gearSum, pb.get(id)!);
    const si = setEval(sid, Math.min(1, (kit.critRate ?? op.critRate) + gearSum.critRate));
    const bag = addBag(gearSum, si.bag);
    return { v: objective(bag, si), bag, setBag: si.bag };
  };
  const results: (GearRank & { value: number })[] = [];
  for (const [sid, suit] of suits) {
    const inSuit = (p: GearPiece) => p.suitId === sid;
    const sb = [bySlot(inSuit, 0), bySlot(inSuit, 1), bySlot(inSuit, 2)];
    if (!sb[0].length && !sb[1].length && sb[2].length < 2) continue;
    const offOnly = off.map((l) => l.filter((id) => byId.get(id)!.suitId !== sid));
    let best: { ids: string[]; v: number; bag: StatBag; setBag: StatBag } | undefined;
    const tryIds = (ids: string[]) => {
      const r = evalLoadout(sid, ids);
      if (!best || r.v > best.v) best = { ids, ...r };
    };
    // 부품 2칸 (같은 부품 허용, 순서 무시)
    const edcPairs = (a: string[], b: string[], same: boolean) => {
      const out: [string, string][] = [];
      a.forEach((x, i) => (same ? a.slice(i) : b).forEach((y) => out.push([x, y])));
      return out;
    };
    const inPairs = edcPairs(sb[2], sb[2], true);
    // 4칸 모두 세트
    for (const b of sb[0]) for (const h of sb[1]) for (const [e1, e2] of inPairs) tryIds([b, h, e1, e2]);
    // 방어구만 세트 밖
    for (const b of offOnly[0]) for (const h of sb[1]) for (const [e1, e2] of inPairs) tryIds([b, h, e1, e2]);
    // 장갑만 세트 밖
    for (const b of sb[0]) for (const h of offOnly[1]) for (const [e1, e2] of inPairs) tryIds([b, h, e1, e2]);
    // 부품 1칸만 세트 밖
    for (const b of sb[0]) for (const h of sb[1]) for (const [e1, e2] of edcPairs(sb[2], offOnly[2], false)) tryIds([b, h, e1, e2]);
    const found = best as { ids: string[]; v: number; bag: StatBag; setBag: StatBag } | undefined;
    if (found)
      results.push({
        suitId: sid,
        suitName: suit.name,
        pieces: found.ids.map((id) => {
          const p = byId.get(id)!;
          return { id, name: p.name, partType: p.partType, inSuit: p.suitId === sid };
        }),
        setBag: found.setBag,
        score: score(op, weaponAtk, found.bag),
        relative: 0,
        value: found.v,
      });
  }
  results.sort((a, b) => b.value - a.value);
  const top = results[0]?.value || 1;
  return results.map(({ value, ...r }) => ({ ...r, relative: value / top }));
}
