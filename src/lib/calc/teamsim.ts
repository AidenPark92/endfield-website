// 4인 팀 전투 시뮬레이터 (순수 함수) — 베스트 조합 평가의 핵심
//
// 이전 모델(팀 로테이션, 2026-10-08 삭제)은 "스킬 표 배율 합 × 사용 빈도"라서, 동료가 만든 상태로 딜이 나오는 오퍼레이터
// (장방이 감전→청뢰검, 티프로스 자연 부착→자연 폭발, 미브 방어 불능→개천, 라스트 라이트 냉기 스택 …)를 거의 0으로 봤다.
// 여기서는 적 1명(보스)에 대해 시간축으로 4명의 행동을 돌리며 게임 시스템을 그대로 적용한다:
//   · 아츠 부착(같은 속성 최대 4스택, 20초) / 아츠 폭발(같은 속성 추가 부착 → 160%) / 아츠 이상(다른 속성 → 반응, 레벨 = 소모 스택) ✅ combat-mechanics §5
//   · 연소 DoT · 감전(받는 아츠 피해↑) · 동결 · 부식(저항↓) · 쇄빙(동결 + 물리 이상) 📘
//   · 방어 불능(최대 4스택) / 띄우기·넘어뜨리기(+1, 120%) / 강타(전부 소모, 150%+150%×스택) / 갑옷 파괴(받는 물리 피해↑) ✅ §6
//   · SP 팀 공유(자연 회복 8/s, 최대 300) · 배틀 스킬 에너지 6.5×(소모−반환)/100 팀 전원 · 연계 본인 에너지 ✅ §2
//   · 연계 = 조건 이벤트 후 7초 안 + 쿨타임 ✅ §3 · 불균형(불균형치 누적 → 받는 피해 ×1.3) ✅ §4
//   · 증폭 / 취약 / 받는 피해 증가는 각각 합연산 구간, 서로 곱연산 ✅ §7
// 오퍼레이터별 스킬 동작은 lib/calc/kits.ts (수치는 전부 스킬 표에서 읽음).
// 게임 데이터로 정해지지 않는 값(애니메이션 시간, 보스 불균형치, 피격 빈도 …)은 SIM 상수에 모아 TODO 로 표시.

import { ELEM_OF, type OperatorBase, type StatBag } from "./build";

export type Elem = "물리" | "열기" | "전기" | "냉기" | "자연";
export type Reaction = "연소" | "감전" | "동결" | "부식";
export const REACTION_OF: Record<string, Reaction> = { 열기: "연소", 전기: "감전", 냉기: "동결", 자연: "부식" };
export type PhysAnomaly = "띄우기" | "넘어뜨리기" | "강타" | "갑옷 파괴";
export type SkillKind = "battle" | "combo" | "ult";
/** extra = 무기·장비의 추가 타격 (일반 공격과 같은 피해 구간: 속성·모든 피해, 치명, 받는 피해 — 스킬 종류 보너스 없음) */
export type HitKind = "basic" | SkillKind | "ultMode" | "extra";

/** 게임 데이터에 없는 가정값 — TODO(실측) */
export const SIM = {
  /** 전투 길이(초) — 해외 메타 클리어 타임(50~70초)과 궁극기 2~3회가 들어가는 길이 */
  duration: 90,
  /** 판단 간격(초) */
  dt: 0.25,
  /** 시작 SP (TODO: 실측) */
  startSp: 200,
  maxSp: 300,
  /** 스킬 1회 사용 후 다음 행동까지(초) — 애니메이션 (TODO) */
  actionGap: 0.5,
  /** 조작 캐릭터 일반 공격 1세트(강력한 일격 포함) 주기(초) — build.ts BASIC_CHAIN_SECONDS(4초)와 같은 가정 (TODO 실측) */
  finalStrikeEvery: 4,
  /** 연계 입력 가능 시간(초) ✅ */
  comboWindow: 7,
  /** 보스 불균형 게이지 · 노드 수 · 불균형 지속(초) ⚠️ (§4: 보스 ~300) */
  poiseMax: 300,
  poiseNodes: 3,
  staggerSeconds: 6,
  staggerMult: 1.3,
  /** 조작 캐릭터 피격 주기(초) — 피격 조건 연계(엠버·푸치나), 반격(스노우샤인·카치르) (TODO) */
  hitTakenEvery: 10,
  /** 생명력 60% 이하로 떨어지는 주기(초) — 스노우샤인 연계 (TODO) */
  lowHpEvery: 40,
  /** 롤아웃 정책(7): 배틀 스킬을 누구에게 줄지 앞으로 이 시간(초)만큼 실제로 돌려 보고 결정 */
  rolloutHorizon: 12,
  /** 롤아웃에서 "기다림"을 고른 뒤 다시 따져 보기까지(초) */
  rolloutWait: 1,
  /** 롤아웃 이후 구간의 배틀 스킬 배분(기본 정책) */
  rolloutBase: 3,
};

/** 아츠/물리 이상 피해 레벨 계수 (오퍼레이터 레벨 90) 📘 */
const LEVEL_COEF = { phys: 1 + 89 / 392, arts: 1 + 89 / 196 };

export interface MemberStats {
  /** 공격력 계산 재료: ((기초 + 무기) × (1 + 공격력%) + 고정) × 능력치 보너스 */
  atkBase: number;
  atkPct: number;
  flatAtk: number;
  attrBonus: number;
  /** 종류별 피해 보너스 합(속성·모든 피해 포함) */
  dmg: Record<HitKind, number>;
  /** 이상 피해에 붙는 속성·모든 피해 보너스 */
  elemDmg: number;
  critRate: number;
  critDmg: number;
  critBy: Record<HitKind, number>;
  critDmgBy: Record<HitKind, number>;
  artsIntensity: number;
  /** 장비·세트로 받은 고정 증폭 / 받는 피해 증가 (본인 속성) */
  amp: number;
  taken: number;
  ultGain: number;
  comboCdr: number;
  attrs: Record<"힘" | "민첩" | "지능" | "의지", number>;
  /** 무기 고유 특성·장비 세트의 추가 타격 (초당 횟수 × 공격력 배율) — weapon-value selfDamageOf 와 같은 기대값 */
  extra?: { rate: number; scale: number }[];
}

export type EventType =
  | "finalStrike"
  | "inflApplied"
  | "artsBurst"
  | "reactionApplied"
  | "reactionConsumed"
  | "physAnomaly"
  | "vulnConsumed"
  | "vulnAdded"
  | "comboHit"
  | "heatConsumed"
  | "crystalConsumed"
  | "staggerNode"
  | "stagger"
  | "hitTaken"
  | "lowHp"
  | "battleCast"
  | "ultCast";

export interface SimEvent {
  type: EventType;
  by: number;
  elem?: Elem;
  reaction?: Reaction;
  level?: number;
  stacks?: number;
  via?: string;
  /** 강력한 일격 시점의 적 상태 */
  snap?: EnemySnap;
}

export interface EnemySnap {
  infl: Elem | null;
  stacks: number;
  vuln: number;
  reactions: Reaction[];
  marks: string[];
}

export interface Mod {
  kind: "amp" | "susc" | "taken" | "atk" | "dmg" | "critRate" | "critDmg" | "res";
  value: number;
  /** 적용 속성 (없으면 전부, "아츠" = 물리 제외) */
  elems?: (Elem | "아츠")[];
  until: number;
  /** 팀 버프 대상 (멤버 인덱스). 없으면 전원 */
  to?: number[];
  /** 적용 스킬 종류 (없으면 전부) */
  kinds?: HitKind[];
  src: number;
  text: string;
}

export interface Kit {
  id: string;
  elem: Elem;
  /** 메인 딜러 후보 (SP를 몰아 줄 수 있는 딜 구조) */
  carry: number;
  battle: SkillSpec;
  combo: ComboSpec;
  ult: UltSpec;
  /** 이 오퍼레이터가 이득을 보는 적 상태 (동료 배틀 스킬이 이걸 만들면 우선순위↑ — 레바테인 열기 부착 흡수 등) */
  likes?: string[];
  /** 스킬 형태가 여럿이면 (결: 진결·지혜 / 진결·의지) — 시뮬레이터가 둘 다 돌려 보고 큰 쪽 */
  forms?: string[];
  /** 일반 공격 1세트 배율(강력한 일격 포함) / 강력한 일격 SP / 불균형치 */
  basic: { chain: number; fsSp: number; fsPoise: number };
  /** 모든 이벤트 구독 (재능 등) */
  onEvent?: (c: Ctx, e: SimEvent) => void;
  /** 메인 컨트롤일 때 강력한 일격 — 기본 처리 후 */
  onFinalStrike?: (c: Ctx, controlIdx: number) => void;
  /** 전투 시작 (재능 초기값) */
  init?: (c: Ctx) => void;
}

export interface SkillSpec {
  cost: number;
  /** 상황에 따라 바뀌는 소모 SP (미브 연속 초식, 카뮤 추적) */
  costOf?: (c: Ctx) => number;
  poise: number;
  /** 0 = 쓰지 않음, 1 = 남는 SP 로, 2 = 일반, 2.8 = 본인 조건 성립(지금 쓰면 이득), 3 = 지금 써야 함 (버프 유지·SP 회수) */
  pri: (c: Ctx) => number;
  /** 이 배틀 스킬이 만드는 상태 (동료 연계·메인 딜러 조건을 열어 주면 우선순위 3) */
  makes?: string[];
  /** 이 배틀 스킬이 원하는 적 상태 (있으면 우선순위 3, 없으면 동료가 만들어 주길 기다림) */
  wants?: string[];
  cast: (c: Ctx) => void;
}

export interface ComboSpec {
  cd: number;
  poise: number;
  /** 이벤트로 조건 성립 */
  on?: (c: Ctx, e: SimEvent) => boolean;
  /** 상태로 조건 성립 (매 판단마다) */
  state?: (c: Ctx) => boolean;
  /** 조건 상태 이름 (동료 배틀 스킬이 이걸 만들면 우선순위↑) */
  needs?: string[];
  energy: number;
  cast: (c: Ctx) => void;
}

export interface UltSpec {
  cost: number;
  cd: number;
  poise: number;
  /** 본인 스킬로만 에너지 (라스트 라이트) */
  selfEnergyOnly?: boolean;
  /** 쓰기 전에 기다릴 조건 */
  ready?: (c: Ctx) => boolean;
  /** 궁극기 모드: 지속 중 조작 캐릭터가 되어 강화 일반 공격 (chain = 강화 1세트 배율, every = 강력한 일격 주기) */
  mode?: { dur: number; chain: number; every: number; fsSp?: number };
  cast: (c: Ctx) => void;
}

export interface SimMember {
  id: string;
  kit: Kit;
  stats: MemberStats;
  /** 직업군 (가드·캐스터·스트라이커·뱅가드·디펜더·서포터) — 직업 조건 효과(질베르타 재능 등) */
  cls?: string;
  /** 선택한 스킬 형태 (Kit.forms) */
  form?: string;
}

interface Runtime {
  energy: number;
  comboReadyAt: number;
  comboWindowUntil: number;
  ultReadyAt: number;
  modeUntil: number;
  /** 집계 */
  dmg: number;
  /** 피해 출처별 (battle/combo/ult/basic/ultMode/anomaly/dot) */
  by: Record<string, number>;
  casts: Record<SkillKind, number>;
  spSpent: number;
  /** 오퍼레이터별 자유 상태 (청뢰검, 녹아내린 불꽃, 계시 …) */
  s: Record<string, number>;
}

interface Status {
  until: number;
  level: number;
  by: number;
  start: number;
}

export interface Ctx {
  t: number;
  /** 지금 행동하는 멤버 */
  me: number;
  members: SimMember[];
  rt: Runtime[];
  control: number;
  /** 메인 딜러(SP를 몰아 주는 멤버) */
  sink: number;
  sp: number;
  // 적 상태
  infl: { elem: Elem | null; stacks: number; until: number };
  vuln: { stacks: number; until: number };
  reactions: Partial<Record<Reaction, Status>>;
  breach?: Status;
  marks: Map<string, { until: number; by: number; v: number }>;
  staggerUntil: number;
  /** API */
  hit: (mult: number, o?: HitOpt) => number;
  infl1: (elem: Elem, stacks?: number) => void;
  forced: (r: Reaction, level?: number, dur?: number) => void;
  consumeInfl: (elems?: Elem[]) => number;
  consumeReaction: (r: Reaction) => number;
  has: (r: Reaction) => number;
  phys: (a: PhysAnomaly, o?: { forced?: boolean; bonus?: number }) => number;
  addVuln: (n: number) => void;
  mod: (key: string, m: Omit<Mod, "src" | "until"> & { dur: number }) => void;
  modOn: (key: string) => Mod | undefined;
  mark: (key: string, dur: number, v?: number) => void;
  markOn: (key: string) => number;
  unmark: (key: string) => void;
  spRecover: (n: number) => void;
  spReturn: (n: number) => void;
  energy: (n: number, who?: number) => void;
  link: (n: number) => void;
  /** 연타 스택 소모 (소모한 스택 수) */
  takeLink: () => number;
  /** 현재 아츠 부착 (속성 · 스택) / 방어 불능 스택 */
  inflNow: () => { elem: Elem | null; stacks: number };
  vulnNow: () => number;
  /** 아츠 부착 1스택만 소모 (티프로스 공중 공격) */
  takeInfl1: (elem: Elem) => boolean;
  emit: (e: Omit<SimEvent, "by"> & { by?: number }) => void;
  isControl: () => boolean;
  /** 다른 멤버의 연계(쿨 2초 이내)·메인 딜러가 이 상태를 기다리는지 — 소모형 스킬이 동료 몫을 빼앗지 않게 */
  othersNeed: (state: string) => boolean;
  /** 조작 캐릭터의 스킬이 일반 공격 1세트(강력한 일격 포함)를 대신했을 때 — 일반 공격 주기를 처음부터 (티프로스 공중 공격) */
  resetChain: () => void;
  /** 스킬 도중 본인 연계 스킬을 바로 사용 (쿨타임이 끝났을 때만, 사용했으면 true) — 티프로스 공중 연계 */
  useCombo: () => boolean;
}

export interface HitOpt {
  kind?: HitKind;
  elem?: Elem;
  /** 이상 피해(아츠 폭발·반응·물리 이상) — 아츠 강도·레벨 계수, 치명 없음 */
  anomaly?: boolean;
  /** 지속 피해 — 치명 없음 */
  dot?: boolean;
  /** 이번 타격에만 더하는 피해 보너스 / 치명 피해 */
  dmgBonus?: number;
  critDmgBonus?: number;
  critRateBonus?: number;
  /** 피해 배율에 곱 (재능 1.2배 등) */
  scale?: number;
  /** 연타 소모 대상 */
  linkable?: boolean;
}

export interface SimResult {
  total: number;
  dps: number;
  /** applied = 이 멤버가 건 상태 횟수 (감전·부식·동결·연소·갑옷 파괴 …) — 시너지 판정용 */
  members: { id: string; dmg: number; by: Record<string, number>; casts: Record<SkillKind, number>; spSpent: number; applied: Record<string, number> }[];
  control: number;
  sink: number;
  spGain: number;
  /** 버프·디버프 가동률 (키 → 0~1) */
  uptime: Record<string, { uptime: number; value: number; text: string; src: number; kind: Mod["kind"]; to?: number[]; elems?: Mod["elems"] }>;
  reactions: Record<string, number>;
  /** SP 배분 정책 · 스킬 형태 */
  share?: number;
  forms?: string[];
}

/** 오퍼레이터 자유 상태 복사 (숫자·배열) */
const cloneS = (s: Record<string, number>): Record<string, number> => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) o[k] = Array.isArray(v) ? [...v] : v;
  return o as Record<string, number>;
};

const inElems = (m: { elems?: (Elem | "아츠")[] }, e: Elem) => !m.elems || m.elems.includes(e) || (e !== "물리" && m.elems.includes("아츠"));

/** 감전 레벨별 받는 아츠 피해 / 지속 · 갑옷 파괴 · 부식 · 동결 (combat-mechanics §5·6) */
const ELECTRO_TAKEN = (L: number) => 0.12 + 0.04 * (L - 1);
const ELECTRO_DUR = (L: number) => 12 + 6 * (L - 1);
const BREACH_TAKEN = (L: number) => 0.12 + 0.04 * (L - 1);
const BREACH_DUR = (L: number) => 12 + 6 * (L - 1);
const CORROSION_MAX = (L: number) => 12 + 4 * (L - 1);
const FREEZE_DUR = (L: number) => 5.75 + (L - 1);

/**
 * share: SP 배분 정책 — 0 = 메인 딜러 우선(서포터는 SP가 남을 때만), 1 = 메인 딜러가 지금 조건이 없으면 서포터도 바로 사용,
 * 5 = 공동 딜러(딜 구조 carry ≥ 0.5 멤버 모두 메인 딜러처럼 번갈아), 6 = 먹이 게이트(메인 딜러가 원하는 상태가 없으면 그 상태를 만드는 동료가 먼저, 메인 딜러는 상태가 생기거나 SP가 넘칠 때),
 * 7 = 롤아웃(배틀 스킬마다 후보별로 SIM.rolloutHorizon 초를 실제로 돌려 보고 결정, 이후 구간은 rolloutBase 정책),
 * 2 = 메인 딜러가 이득을 보는 상태(likes)를 만드는 서포터 배틀 스킬 먼저, 3 = 상태를 깔아 주는 배틀 스킬 우선권 없음(연계·궁극기로 충분할 때),
 * 4 = 가치 정책(지금 쓰면 바로 나오는 팀 피해 ÷ SP 가 큰 사람, 버프 유지·조건 열기는 먼저)
 */
export function simulate(members: SimMember[], o: { sink: number; control?: number; duration?: number; share?: number; rolloutBase?: number; log?: string[] }): SimResult {
  const n = members.length;
  const D = o.duration ?? SIM.duration;
  const rt: Runtime[] = members.map(() => ({ energy: 0, comboReadyAt: 0, comboWindowUntil: -1, ultReadyAt: 0, modeUntil: -1, dmg: 0, by: {}, casts: { battle: 0, combo: 0, ult: 0 }, spSpent: 0, s: {} }));
  const teamMods = new Map<string, Mod>();
  const enemyMods = new Map<string, Mod>();
  /** 가동률: 구간(시작~끝)을 이어 붙여 합산 */
  const uptime = new Map<string, { time: number; start: number; until: number; m: Mod }>();
  const reactionCount: Record<string, number> = {};
  /** 멤버별로 건 상태 횟수 */
  const applied: Record<string, number>[] = members.map(() => ({}));
  let link = 0; // 연타 스택 (팀 공유)
  let linkUsed = false;
  let poise = 0;
  let nodesHit = 0;
  let spGain = 0;
  let castReturn = 0;
  const baseControl = o.control ?? o.sink;
  /** 지금 배틀 스킬 배분에 쓰는 정책 (롤아웃 중에는 기본 정책으로 바뀜) */
  let share = o.share ?? 0;
  const policy0 = share;
  /** 지속 피해 표식 (dot:속성:멤버) */
  const dotKeys = new Set<string>();
  const lastBattle = members.map(() => 0);
  const minCost = Math.min(...members.map((m) => (m.kit.battle.costOf ? 0 : m.kit.battle.cost)));

  const c: Ctx = {
    t: 0,
    me: 0,
    members,
    rt,
    control: baseControl,
    sink: o.sink,
    sp: SIM.startSp,
    infl: { elem: null, stacks: 0, until: 0 },
    vuln: { stacks: 0, until: 0 },
    reactions: {},
    marks: new Map(),
    staggerUntil: -1,
    hit,
    infl1,
    forced,
    consumeInfl,
    consumeReaction,
    has,
    phys,
    addVuln,
    mod,
    modOn: (k) => {
      const m = teamMods.get(`${c.me}:${k}`) ?? enemyMods.get(`${c.me}:${k}`);
      return m && m.until > c.t ? m : undefined;
    },
    mark: (k, dur, v = 1) => {
      c.marks.set(k, { until: c.t + dur, by: c.me, v });
      if (k.startsWith("dot:")) dotKeys.add(k);
    },
    markOn: (k) => {
      const m = c.marks.get(k);
      return m && m.until > c.t ? m.v : 0;
    },
    unmark: (k) => void c.marks.delete(k),
    spRecover: (x) => {
      // 스킬로 회복 (무기 "자신의 스킬로 스킬 게이지를 회복한 후" 조건)
      if (x > 0) note(c.me, "스킬 게이지");
      gainSp(x);
    },
    spReturn: (x) => {
      c.sp = Math.min(SIM.maxSp, c.sp + x);
      castReturn += x;
    },
    energy: (x, who) => {
      const i = who ?? c.me;
      rt[i].energy += x * (1 + members[i].stats.ultGain + (rt[i].s.ultGainAdd ?? 0));
    },
    link: (x) => {
      if (x > 0) note(c.me, "연타");
      link = Math.min(4, link + x);
    },
    takeLink: () => {
      const l = link;
      link = 0;
      return l;
    },
    inflNow: () => (c.infl.until > c.t && c.infl.elem ? { elem: c.infl.elem, stacks: c.infl.stacks } : { elem: null, stacks: 0 }),
    vulnNow: () => (c.vuln.until > c.t ? c.vuln.stacks : 0),
    takeInfl1: (elem) => {
      if (c.infl.until <= c.t || c.infl.elem !== elem || c.infl.stacks <= 0) return false;
      c.infl.stacks--;
      if (c.infl.stacks === 0) c.infl.elem = null;
      return true;
    },
    emit,
    isControl: () => c.me === c.control,
    resetChain: () => {},
    useCombo: () => {
      if (c.t < rt[c.me].comboReadyAt) return false;
      const me0 = c.me;
      castCombo(me0);
      c.me = me0;
      return true;
    },
    othersNeed: (x) => {
      for (let j = 0; j < n; j++) {
        if (j === c.me) continue;
        const k = members[j].kit;
        if (k.combo.needs?.includes(x) && rt[j].comboReadyAt - c.t < 2) return true;
        if (j === o.sink && k.likes?.includes(x)) return true;
      }
      return false;
    },
  };

  // ── 피해 ──
  function dynMods(i: number, e: Elem, kind: HitKind) {
    let amp = 0, susc = 0, taken = 0, atk = 0, dmg = 0, cr = 0, cd = 0, res = 0;
    for (const m of teamMods.values()) {
      if (m.until <= c.t || (m.to && !m.to.includes(i)) || !inElems(m, e) || (m.kinds && !m.kinds.includes(kind))) continue;
      if (m.kind === "amp") amp += m.value;
      else if (m.kind === "atk") atk += m.value;
      else if (m.kind === "dmg") dmg += m.value;
      else if (m.kind === "critRate") cr += m.value;
      else if (m.kind === "critDmg") cd += m.value;
    }
    for (const m of enemyMods.values()) {
      if (m.until <= c.t || !inElems(m, e) || (m.to && !m.to.includes(i))) continue;
      if (m.kind === "susc") susc += m.value;
      else if (m.kind === "taken") taken += m.value;
      else if (m.kind === "res") res += m.value;
      else if (m.kind === "amp") amp += m.value;
    }
    // 이상 상태 디버프
    const el = c.reactions.감전;
    if (el && el.until > c.t && e !== "물리") taken += ELECTRO_TAKEN(el.level);
    if (c.breach && c.breach.until > c.t && e === "물리") taken += BREACH_TAKEN(c.breach.level);
    const co = c.reactions.부식;
    if (co && co.until > c.t) {
      const mx = CORROSION_MAX(co.level) * (c.marks.get("부식배율")?.v ?? 1);
      res += Math.min(mx, mx * 0.3 + mx * 0.07 * (c.t - co.start));
    }
    return { amp, susc, taken, atk, dmg, cr, cd, res };
  }

  function hit(mult: number, h: HitOpt = {}): number {
    if (mult <= 0) return 0;
    const i = c.me;
    const st = members[i].stats;
    const e = h.elem ?? members[i].kit.elem;
    const kind: HitKind = h.kind ?? "battle";
    const d = dynMods(i, e, kind);
    const atk = (st.atkBase * (1 + st.atkPct + d.atk) + st.flatAtk) * st.attrBonus;
    let linkMult = 1;
    if (h.linkable && link > 0 && (kind === "battle" || kind === "ult")) {
      // 연타: 배틀 +30/45/60/75%, 궁극기 +20/30/40/50% ✅ — 이번 스킬에서 소모 (스킬 단위로 한 번 → castLinkUsed)
      linkMult = 1 + (kind === "battle" ? 0.15 + 0.15 * link : 0.1 + 0.1 * link);
      linkUsed = true;
    }
    let base: number;
    if (h.anomaly) {
      const lv = e === "물리" ? LEVEL_COEF.phys : LEVEL_COEF.arts;
      base = atk * mult * (1 + st.artsIntensity / 100) * lv * (1 + st.elemDmg + d.dmg + (h.dmgBonus ?? 0));
    } else {
      const cr = Math.min(1, st.critRate + st.critBy[kind] + d.cr + (h.critRateBonus ?? 0));
      const cdm = st.critDmg + st.critDmgBy[kind] + d.cd + (h.critDmgBonus ?? 0);
      const crit = h.dot ? 1 : 1 + cr * cdm;
      base = atk * mult * (1 + st.dmg[kind] + d.dmg + (h.dmgBonus ?? 0)) * crit * linkMult;
    }
    const stag = c.staggerUntil > c.t ? SIM.staggerMult : 1;
    const v = base * (h.scale ?? 1) * (1 + st.amp + d.amp) * (1 + d.susc) * (1 + st.taken + d.taken) * (1 + d.res / 100) * stag;
    rt[i].dmg += v;
    const src = h.anomaly ? "anomaly" : h.dot ? "dot" : kind;
    rt[i].by[src] = (rt[i].by[src] ?? 0) + v;
    return v;
  }

  // ── 아츠 부착 · 이상 ──
  function infl1(elem: Elem, stacks = 1) {
    if (elem === "물리") return;
    const I = c.infl;
    if (I.until <= c.t) { I.elem = null; I.stacks = 0; }
    if (!I.elem) {
      I.elem = elem;
      I.stacks = Math.min(4, stacks);
      I.until = c.t + 20;
      emit({ type: "inflApplied", elem, stacks: I.stacks });
      return;
    }
    if (I.elem === elem) {
      // 아츠 폭발 160% + 스택 +1 ✅
      hit(1.6, { anomaly: true, elem });
      I.stacks = Math.min(4, I.stacks + stacks);
      I.until = c.t + 20;
      count("아츠 폭발");
      emit({ type: "artsBurst", elem, stacks: I.stacks });
      emit({ type: "inflApplied", elem, stacks: I.stacks });
      return;
    }
    // 아츠 이상: 기존 부착 전부 소모, 레벨 = 소모 스택 ✅
    const L = Math.min(4, I.stacks);
    const was = I.elem;
    I.elem = null;
    I.stacks = 0;
    // 반응으로 소모된 열기 부착도 "열기 부착이 소모" (카뮤 연계 조건)
    if (was === "열기") emit({ type: "heatConsumed", stacks: L });
    const r = REACTION_OF[elem];
    hit(0.8 + 0.8 * L, { anomaly: true, elem });
    setReaction(r, L);
  }

  function setReaction(r: Reaction, L: number, dur?: number, keep = false) {
    const prev0 = c.reactions[r];
    const prev = prev0 && prev0.until > c.t ? prev0 : undefined;
    const lvl = Math.min(4, Math.max(1, L, keep && prev ? prev.level : 0));
    const d =
      dur ?? (r === "감전" ? ELECTRO_DUR(lvl) : r === "동결" ? FREEZE_DUR(lvl) : r === "부식" ? 15 + (c.marks.get(`부식연장:${c.me}`)?.v ?? 0) : 10);
    // 부식 갱신 시 깎인 저항 유지 ✅ → 시작 시각 유지
    const start = r === "부식" && prev && prev.until > c.t ? prev.start : c.t;
    c.reactions[r] = { until: Math.max(c.t + d, keep && prev ? prev.until : 0), level: lvl, by: c.me, start };
    if (r === "부식" && c.marks.has(`부식배율원:${c.me}`)) c.marks.set("부식배율", { until: c.t + d, by: c.me, v: 1.1 });
    count(r);
    emit({ type: "reactionApplied", reaction: r, level: lvl });
  }

  function forced(r: Reaction, level = 1, dur?: number) {
    // 강제 부여: 초기 피해 없음 ✅, 레벨 1 📘 — 이미 더 높은 레벨·긴 지속이면 유지
    setReaction(r, level, dur, true);
  }

  function consumeInfl(elems?: Elem[]): number {
    const I = c.infl;
    if (I.until <= c.t || !I.elem || I.stacks <= 0) return 0;
    if (elems && !elems.includes(I.elem)) return 0;
    const s = I.stacks;
    const el = I.elem;
    I.elem = null;
    I.stacks = 0;
    if (el === "열기") emit({ type: "heatConsumed", stacks: s });
    return s;
  }

  function has(r: Reaction): number {
    const x = c.reactions[r];
    return x && x.until > c.t ? x.level : 0;
  }

  function consumeReaction(r: Reaction): number {
    const L = has(r);
    if (!L) return 0;
    delete c.reactions[r];
    emit({ type: "reactionConsumed", reaction: r, level: L });
    return L;
  }

  // ── 물리 이상 ──
  function addVuln(k: number) {
    if (c.vuln.until <= c.t) c.vuln.stacks = 0;
    c.vuln.stacks = Math.min(4, c.vuln.stacks + k);
    c.vuln.until = c.t + 20;
    emit({ type: "vulnAdded", stacks: c.vuln.stacks });
  }

  function phys(a: PhysAnomaly, po: { forced?: boolean; bonus?: number } = {}): number {
    if (c.vuln.until <= c.t) c.vuln.stacks = 0;
    let dealt = 0;
    // 쇄빙: 동결 중 물리 이상 → 120%+120%×레벨 물리, 동결 소모 ✅
    const fr = has("동결");
    if (fr) {
      dealt += hit(1.2 + 1.2 * fr, { anomaly: true, elem: "물리" });
      consumeReaction("동결");
      count("쇄빙");
    }
    const v = c.vuln.stacks;
    if (v === 0 && !po.forced) {
      addVuln(1);
    } else if (a === "띄우기" || a === "넘어뜨리기") {
      dealt += hit(1.2, { anomaly: true, elem: "물리" });
      addVuln(1);
    } else if (a === "강타") {
      dealt += hit((1.5 + 1.5 * v) * (1 + (po.bonus ?? 0)), { anomaly: true, elem: "물리" });
      c.vuln.stacks = 0;
      emit({ type: "vulnConsumed", stacks: v, via: a });
    } else {
      dealt += hit(0.5 + 0.5 * v, { anomaly: true, elem: "물리" });
      c.breach = { until: c.t + BREACH_DUR(Math.max(1, v)), level: Math.max(1, v), by: c.me, start: c.t };
      c.vuln.stacks = 0;
      count("갑옷 파괴");
      emit({ type: "vulnConsumed", stacks: v, via: a });
    }
    count(a);
    emit({ type: "physAnomaly", via: a, stacks: v });
    return dealt;
  }

  function mod(key: string, m: Omit<Mod, "src" | "until"> & { dur: number }) {
    const enemy = m.kind === "susc" || m.kind === "taken" || m.kind === "res";
    if (m.kind === "susc" || m.kind === "taken") note(c.me, "취약");
    if (m.kind === "amp") {
      note(c.me, "증폭");
      for (const el of m.elems ?? []) if (el !== "아츠") note(c.me, `${el} 증폭`);
    }
    const full: Mod = { ...m, src: c.me, until: c.t + m.dur };
    const k = `${c.me}:${key}`;
    (enemy ? enemyMods : teamMods).set(k, full);
    const u = uptime.get(k);
    if (!u) uptime.set(k, { time: 0, start: c.t, until: full.until, m: full });
    else {
      if (u.until < c.t) {
        u.time += u.until - u.start;
        u.start = c.t;
      }
      u.until = Math.max(u.until, full.until);
      u.m = full;
    }
  }

  function count(k: string) {
    reactionCount[k] = (reactionCount[k] ?? 0) + 1;
  }

  // ── 이벤트 ──
  const queue: SimEvent[] = [];
  let dispatching = false;
  /** 멤버별 사건 횟수 (무기·세트 조건 빈도 · 시너지 판정) */
  function note(i: number, key: string, k = 1) {
    applied[i][key] = (applied[i][key] ?? 0) + k;
  }
  function gainSp(x: number) {
    const add = Math.min(SIM.maxSp - c.sp, x);
    c.sp += add;
    spGain += add;
  }
  function noteEvent(e: SimEvent) {
    const i = e.by;
    switch (e.type) {
      case "inflApplied":
        if (e.elem) note(i, `${e.elem} 부착`);
        note(i, "아츠 부착");
        note(i, `부착스택:${Math.min(4, e.stacks ?? 1)}`);
        break;
      case "artsBurst":
        note(i, "아츠 폭발");
        if (e.elem) note(i, `${e.elem} 폭발`);
        break;
      case "reactionApplied":
        if (e.reaction) note(i, e.reaction);
        note(i, "아츠 이상");
        break;
      case "reactionConsumed":
        if (e.reaction) note(i, `${e.reaction} 소모`);
        note(i, "아츠 이상 소모");
        break;
      case "physAnomaly":
        if (e.via) note(i, e.via);
        note(i, "물리 이상");
        break;
      case "vulnAdded":
        note(i, "방어 불능");
        break;
      case "vulnConsumed":
        note(i, "방어 불능 소모");
        break;
      case "heatConsumed":
        note(i, "열기 부착 소모");
        break;
      case "finalStrike":
        note(i, "강력한 일격");
        break;
    }
  }
  function emit(e: Omit<SimEvent, "by"> & { by?: number }) {
    queue.push({ ...e, by: e.by ?? c.me });
    noteEvent(queue[queue.length - 1]);
    if (dispatching) return;
    dispatching = true;
    const me0 = c.me;
    while (queue.length) {
      const ev = queue.shift()!;
      for (let i = 0; i < n; i++) {
        const k = members[i].kit;
        c.me = i;
        if (k.combo.on && k.combo.on(c, ev)) rt[i].comboWindowUntil = c.t + SIM.comboWindow;
        k.onEvent?.(c, ev);
      }
      c.me = me0;
    }
    dispatching = false;
  }

  function snap(): EnemySnap {
    return {
      infl: c.infl.until > c.t ? c.infl.elem : null,
      stacks: c.infl.until > c.t ? c.infl.stacks : 0,
      vuln: c.vuln.until > c.t ? c.vuln.stacks : 0,
      reactions: (Object.keys(c.reactions) as Reaction[]).filter((r) => has(r)),
      marks: [...c.marks.entries()].filter(([, v]) => v.until > c.t).map(([k]) => k),
    };
  }

  function addPoise(p: number) {
    if (c.staggerUntil > c.t || p <= 0) return;
    poise += p;
    const step = SIM.poiseMax / SIM.poiseNodes;
    while (nodesHit < SIM.poiseNodes - 1 && poise >= step * (nodesHit + 1)) {
      nodesHit++;
      emit({ type: "staggerNode" });
    }
    if (poise >= SIM.poiseMax) {
      c.staggerUntil = c.t + SIM.staggerSeconds;
      poise = 0;
      nodesHit = 0;
      count("불균형");
      emit({ type: "stagger" });
    }
  }

  // ── 행동 ──
  function battleEnergy(cost: number, i: number) {
    const e = (6.5 * Math.max(0, cost - castReturn)) / 100;
    for (let j = 0; j < n; j++) if (!members[j].kit.ult.selfEnergyOnly) c.energy(e, j);
    void i;
  }
  function castBattle(i: number) {
    const k = members[i].kit;
    c.me = i;
    const cost = k.battle.costOf?.(c) ?? k.battle.cost;
    c.sp -= cost;
    rt[i].spSpent += cost;
    rt[i].casts.battle++;
    lastBattle[i] = c.t;
    castReturn = 0;
    linkUsed = false;
    k.battle.cast(c);
    if (linkUsed) link = 0;
    addPoise(k.battle.poise);
    battleEnergy(cost, i);
    emit({ type: "battleCast" });
    o.log?.push(`${c.t.toFixed(1)} ${members[i].id} 배틀 SP${c.sp.toFixed(0)}`);
  }
  function castCombo(i: number) {
    const k = members[i].kit;
    c.me = i;
    rt[i].casts.combo++;
    const cdr = Math.min(0.7, members[i].stats.comboCdr);
    const fast = c.marks.get(`연계가속:${i}`);
    const speed = fast && fast.until > c.t ? fast.v : 1;
    rt[i].comboReadyAt = c.t + (k.combo.cd * (1 - cdr)) / speed;
    rt[i].comboWindowUntil = -1;
    k.combo.cast(c);
    addPoise(k.combo.poise);
    c.energy(k.combo.energy);
    emit({ type: "comboHit" });
    o.log?.push(`${c.t.toFixed(1)} ${members[i].id} 연계`);
  }
  function castUlt(i: number) {
    const k = members[i].kit;
    c.me = i;
    rt[i].casts.ult++;
    rt[i].energy = 0;
    rt[i].ultReadyAt = c.t + k.ult.cd;
    linkUsed = false;
    if (k.ult.mode) {
      rt[i].modeUntil = c.t + k.ult.mode.dur;
      c.control = i;
      nextFs = Math.min(nextFs, c.t + k.ult.mode.every);
    }
    k.ult.cast(c);
    if (linkUsed) link = 0;
    addPoise(k.ult.poise);
    emit({ type: "ultCast" });
    o.log?.push(`${c.t.toFixed(1)} ${members[i].id} 궁극기`);
  }

  function finalStrike() {
    const i = c.control;
    const k = members[i].kit;
    const mode = rt[i].modeUntil > c.t ? k.ult.mode : undefined;
    c.me = i;
    const chain = mode ? mode.chain : k.basic.chain;
    hit(chain, { kind: mode ? "ultMode" : "basic" });
    gainSp(mode?.fsSp ?? k.basic.fsSp);
    addPoise(k.basic.fsPoise);
    const sn = snap();
    for (let j = 0; j < n; j++) {
      c.me = j;
      members[j].kit.onFinalStrike?.(c, i);
    }
    c.me = i;
    o.log?.push(`${c.t.toFixed(1)} ${members[i].id} 강력한 일격 (부착 ${sn.infl ?? "-"}${sn.stacks || ""} · 방어 불능 ${sn.vuln} · ${sn.reactions.join("/") || "이상 없음"}) SP${c.sp.toFixed(0)}`);
    emit({ type: "finalStrike", snap: sn });
  }

  // ── 시작 ──
  for (let i = 0; i < n; i++) {
    c.me = i;
    members[i].kit.init?.(c);
  }
  let nextFs = SIM.finalStrikeEvery / 2;
  let nextHit = SIM.hitTakenEvery;
  let nextLow = SIM.lowHpEvery;
  let lockUntil = 0;
  c.resetChain = () => {
    const m = rt[c.control].modeUntil > c.t ? members[c.control].kit.ult.mode : undefined;
    nextFs = c.t + (m ? m.every : SIM.finalStrikeEvery);
  };
  const steps = Math.round(D / SIM.dt);
  let inRollout = false;
  let waitUntil = -1;
  /** 롤아웃에서 "기다림"을 고른 갈래는 실제와 같게 SIM.rolloutWait 초 동안 배틀 스킬을 쓰지 않음 */
  let blockUntil = -1;
  for (let s = 0; s < steps; s++) step(s);

  /** 0.25초 한 칸 진행 (롤아웃에서도 그대로 씀) */
  function step(s: number) {
    c.t = s * SIM.dt;
    // 자연 회복
    gainSp(8 * SIM.dt);
    // 모드 종료 → 조작 캐릭터 복귀
    if (c.control !== baseControl && rt[c.control].modeUntil <= c.t) c.control = baseControl;
    if (c.t >= nextHit) {
      nextHit += SIM.hitTakenEvery;
      c.me = c.control;
      emit({ type: "hitTaken" });
    }
    if (c.t >= nextLow) {
      nextLow += SIM.lowHpEvery;
      c.me = c.control;
      emit({ type: "lowHp" });
    }
    if (c.t >= nextFs) {
      finalStrike();
      const m = rt[c.control].modeUntil > c.t ? members[c.control].kit.ult.mode : undefined;
      nextFs = c.t + (m ? m.every : SIM.finalStrikeEvery);
    }
    // 연소 DoT (초당 12%+12%×레벨, 치명 없음) ✅
    const burn = c.reactions.연소;
    if (burn && burn.until > c.t) {
      c.me = burn.by;
      hit((0.12 + 0.12 * burn.level) * SIM.dt, { anomaly: true, elem: "열기", dot: true });
    }
    // 지속 효과 (재능 DoT 등)
    if (dotKeys.size)
      for (const k of dotKeys) {
        const m = c.marks.get(k);
        if (!m || m.until <= c.t) continue;
        c.me = m.by;
        hit(m.v * SIM.dt, { kind: "battle", dot: true, elem: (k.split(":")[1] as Elem) || "물리" });
      }
    // 무기·장비 추가 타격 (초당 기대값을 시간에 고르게)
    for (let i = 0; i < n; i++) {
      const ex = members[i].stats.extra;
      if (!ex?.length) continue;
      c.me = i;
      hit(ex.reduce((a, x) => a + x.rate * x.scale, 0) * SIM.dt, { kind: "extra" });
    }
    if (c.t < lockUntil) return;

    // 1) 궁극기
    let acted = false;
    for (let i = 0; i < n && !acted; i++) {
      const k = members[i].kit;
      c.me = i;
      if (rt[i].energy >= k.ult.cost && c.t >= rt[i].ultReadyAt && rt[i].modeUntil <= c.t && (k.ult.ready?.(c) ?? true)) {
        // 다른 멤버 궁극기 모드 중에는 모드형 궁극기 금지(조작 캐릭터 충돌)
        if (k.ult.mode && c.control !== baseControl) continue;
        castUlt(i);
        acted = true;
      }
    }
    // 2) 연계 (편성 순서 우선)
    for (let i = 0; i < n && !acted; i++) {
      const k = members[i].kit;
      c.me = i;
      if (c.t < rt[i].comboReadyAt) continue;
      // 상태 조건도 성립한 순간부터 입력 시간(7초) 동안 사용 가능 ✅
      if (k.combo.state?.(c)) rt[i].comboWindowUntil = Math.max(rt[i].comboWindowUntil, c.t + SIM.comboWindow);
      if (rt[i].comboWindowUntil >= c.t) {
        castCombo(i);
        acted = true;
      }
    }
    // 3) 배틀 스킬 (SP 배분)
    // 롤아웃 정책: 후보(기다림 · 쓸 수 있는 멤버)마다 앞으로 SIM.rolloutHorizon 초를 실제로 돌려 보고 팀 피해가 가장 큰 쪽
    //   — 결 연계(구속) 뒤 배틀 스킬(SP 반환·추가 피해), 부착을 먼저 깔고 메인 딜러가 소모 같은 "몇 초 뒤에 이득"을 찾음
    if (policy0 === 7 && !inRollout) {
      if (!acted && c.sp >= minCost && c.t >= waitUntil) {
        const pick = rolloutChoice(s);
        if (pick >= 0) {
          castBattle(pick);
          acted = true;
        } else waitUntil = c.t + SIM.rolloutWait;
      }
      if (acted) lockUntil = c.t + SIM.actionGap;
      return;
    }
    if (inRollout && c.t < blockUntil) acted = true;
    if (!acted && c.sp >= minCost && share === 4) {
      // 가치 정책: 버프 유지·조건 열어 주기(3)는 먼저, 나머지는 "지금 쓰면 바로 나오는 팀 피해 ÷ SP"가 가장 큰 사람 (시험 사용 후 되돌림)
      let best = -1;
      let bestV = -1;
      for (let i = 0; i < n; i++) {
        const k = members[i].kit;
        c.me = i;
        const cost = k.battle.costOf?.(c) ?? k.battle.cost;
        if (c.sp < cost) continue;
        let p = k.battle.pri(c);
        if (p <= 0) continue;
        if (p < 3 && k.battle.makes) p = Math.max(p, enables(i));
        const v = p >= 3 ? 1e15 : dryValue(i) / Math.max(25, cost - (k.battle.cost - cost));
        if (v > bestV) { bestV = v; best = i; }
      }
      if (best >= 0) {
        castBattle(best);
        acted = true;
      }
    }
    if (!acted && c.sp >= minCost && share !== 4) {
      let best = -1;
      let bestP = -1;
      for (let i = 0; i < n; i++) {
        const k = members[i].kit;
        c.me = i;
        const cost = k.battle.costOf?.(c) ?? k.battle.cost;
        if (c.sp < cost) continue;
        let p = k.battle.pri(c);
        if (p <= 0) continue;
        const sinkLike = i === o.sink || (share === 5 && k.carry >= 0.5);
        // 2.5~3 = "지금 쓰면 이득"(본인 조건 성립) — 메인 딜러가 아니면 SP 우선권은 없음 (share 정책이면 그대로)
        if (!sinkLike && p > 2.5 && p < 3 && share !== 1) p = 2;
        if (p < 3 && k.battle.makes && share !== 3) p = Math.max(p, enables(i));
        if (sinkLike && p >= 2) p = Math.max(p, 2.5);
        // 먹이 게이트: 원하는 상태가 없고 동료가 만들 수 있으면 메인 딜러는 기다림 (SP가 넘치기 직전은 예외)
        if (share === 6 && i === o.sink && p < 3 && c.sp < SIM.maxSp - 50 && sinkStarved()) p = 1;
        const reserve = p >= 2.5 ? 0 : share === 1 && sinkIdle() ? 0 : p >= 2 ? 100 : 200;
        if (c.sp < cost + reserve) continue;
        // 같은 우선순위면 배틀 스킬을 오래 안 쓴 멤버 먼저 (서포터끼리 번갈아)
        const q = p + Math.min(0.3, (c.t - lastBattle[i]) / 100);
        if (q > bestP) { bestP = q; best = i; }
      }
      if (best >= 0) {
        castBattle(best);
        acted = true;
      }
    }
    if (acted) lockUntil = c.t + SIM.actionGap;
  }

  /** 전투 상태 전체 저장 (dryValue·롤아웃이 시험해 본 뒤 되돌림) */
  function snapshot() {
    return {
      sp: c.sp, link, linkUsed, poise, nodesHit, spGain, castReturn, staggerUntil: c.staggerUntil, control: c.control,
      nextFs, nextHit, nextLow, lockUntil,
      infl: { ...c.infl }, vuln: { ...c.vuln }, reactions: { ...c.reactions }, breach: c.breach,
      marks: new Map(c.marks), teamMods: new Map(teamMods), enemyMods: new Map(enemyMods),
      rt: rt.map((r) => ({ ...r, by: { ...r.by }, casts: { ...r.casts }, s: cloneS(r.s) })),
      uptime: new Map([...uptime].map(([k, u]) => [k, { ...u }])), reactionCount: { ...reactionCount }, applied: applied.map((x) => ({ ...x })), lastBattle: [...lastBattle], dotKeys: new Set(dotKeys),
    };
  }
  function restore(snapState: ReturnType<typeof snapshot>) {
    c.sp = snapState.sp; link = snapState.link; linkUsed = snapState.linkUsed; poise = snapState.poise; nodesHit = snapState.nodesHit;
    spGain = snapState.spGain; castReturn = snapState.castReturn; c.staggerUntil = snapState.staggerUntil; c.control = snapState.control;
    nextFs = snapState.nextFs; nextHit = snapState.nextHit; nextLow = snapState.nextLow; lockUntil = snapState.lockUntil;
    c.infl = { ...snapState.infl }; c.vuln = { ...snapState.vuln }; c.reactions = { ...snapState.reactions }; c.breach = snapState.breach; c.marks = new Map(snapState.marks);
    teamMods.clear(); for (const [k, m] of snapState.teamMods) teamMods.set(k, m);
    enemyMods.clear(); for (const [k, m] of snapState.enemyMods) enemyMods.set(k, m);
    snapState.rt.forEach((r, j) => (rt[j] = { ...r, by: { ...r.by }, casts: { ...r.casts }, s: cloneS(r.s) }));
    uptime.clear(); for (const [k, u] of snapState.uptime) uptime.set(k, { ...u });
    for (const k of Object.keys(reactionCount)) delete reactionCount[k];
    Object.assign(reactionCount, snapState.reactionCount);
    snapState.applied.forEach((x, j) => (applied[j] = { ...x }));
    snapState.lastBattle.forEach((x, j) => (lastBattle[j] = x));
    dotKeys.clear(); for (const k of snapState.dotKeys) dotKeys.add(k);
  }
  function teamDmg() {
    return rt.reduce((a, r) => a + r.dmg, 0);
  }

  /** i 가 지금 배틀 스킬을 쓰면 바로 나오는 팀 피해 (상태를 저장했다가 되돌림) */
  function dryValue(i: number): number {
    const snapState = snapshot();
    const before = teamDmg();
    const log0 = o.log;
    o.log = undefined;
    castBattle(i);
    const v = teamDmg() - before;
    o.log = log0;
    restore(snapState);
    return v;
  }

  /**
   * 롤아웃 정책: 기다림(-1) · 지금 배틀 스킬을 쓸 수 있는 멤버마다, 그 행동 뒤 SIM.rolloutHorizon 초를 기본 정책(SIM.rolloutBase)으로
   * 실제로 진행해 본 팀 피해를 비교 → 가장 큰 행동. 롤아웃 안에서는 다시 롤아웃하지 않음
   */
  function rolloutChoice(s: number): number {
    // 같은 값이면 지금 쓰는 쪽(우선순위 높은 멤버 먼저), 기다림은 맨 끝
    const cands: number[] = [];
    for (let i = 0; i < n; i++) {
      c.me = i;
      const k = members[i].kit;
      const cost = k.battle.costOf?.(c) ?? k.battle.cost;
      if (c.sp >= cost && k.battle.pri(c) > 0) cands.push(i);
    }
    if (!cands.length) return -1;
    cands.push(-1);
    const end = Math.min(steps, s + 1 + Math.round(SIM.rolloutHorizon / SIM.dt));
    const snap = snapshot();
    const log0 = o.log;
    o.log = undefined;
    inRollout = true;
    share = o.rolloutBase ?? SIM.rolloutBase;
    let best = -1;
    let bestV = -Infinity;
    for (const i of cands) {
      const before = teamDmg();
      if (i >= 0) {
        castBattle(i);
        lockUntil = c.t + SIM.actionGap;
        blockUntil = -1;
      } else blockUntil = c.t + SIM.rolloutWait;
      for (let ss = s + 1; ss < end; ss++) step(ss);
      const v = teamDmg() - before;
      restore(snap);
      c.t = s * SIM.dt;
      if (v > bestV * (1 + 1e-9) + 1e-9) {
        bestV = v;
        best = i;
      }
    }
    inRollout = false;
    blockUntil = -1;
    share = policy0;
    o.log = log0;
    return best;
  }

  /** 상태가 지금 적에게 있는지 (방어 불능 · 아츠 부착 · "X 부착" · 반응 · 표식) */
  function present(x: string): boolean {
    const inflE = c.infl.until > c.t ? c.infl.elem : null;
    return x === "방어 불능"
      ? c.vuln.until > c.t && c.vuln.stacks > 0
      : x === "아츠 부착"
        ? !!inflE
        : x.endsWith(" 부착")
          ? inflE === x.slice(0, -3)
          : has(x as Reaction) > 0 || (c.marks.get(x)?.until ?? 0) > c.t;
  }
  /** 메인 딜러가 원하는 상태(likes·wants)가 지금 없고, 그걸 배틀 스킬로 만드는 동료가 있는지 */
  function sinkStarved(): boolean {
    const k = members[o.sink].kit;
    const want = [...(k.likes ?? []), ...(k.battle.wants ?? [])];
    if (!want.length || want.some(present)) return false;
    return members.some((m, j) => j !== o.sink && m.kit.battle.makes?.some((x) => want.includes(x) || (want.includes("아츠 부착") && x.endsWith(" 부착"))));
  }

  /** 메인 딜러가 지금 배틀 스킬을 쓸 이유가 약한지 (조건 미성립) */
  function sinkIdle(): boolean {
    const k = members[o.sink].kit;
    const me0 = c.me;
    c.me = o.sink;
    const p = k.battle.pri(c);
    c.me = me0;
    return p < 2.5;
  }

  /**
   * i 의 배틀 스킬이 지금 없는 상태를 만들어 주는지 → 우선순위
   * 3 = 동료 연계(쿨 거의 끝)나 메인 딜러의 배틀 스킬 조건을 연다 / 2 = 동료가 이득을 보는 상태(likes) / 0 = 해당 없음
   */
  function enables(i: number): number {
    const makes = members[i].kit.battle.makes!;
    const inflE = c.infl.until > c.t ? c.infl.elem : null;
    const present = (x: string) =>
      x === "방어 불능"
        ? c.vuln.until > c.t && c.vuln.stacks > 0
        : x === "아츠 부착"
          ? !!inflE
          : x.endsWith(" 부착")
            ? inflE === x.slice(0, -3)
            : has(x as Reaction) > 0 || (c.marks.get(x)?.until ?? 0) > c.t;
    const mk = (x: string) => makes.includes(x) || (x === "아츠 부착" && makes.some((m) => m.endsWith(" 부착") && m !== "물리"));
    let best = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const k = members[j].kit;
      const comboSoon = rt[j].comboReadyAt - c.t < 2;
      // 필요한 상태 중 하나라도 이미 있으면 깔아 줄 필요 없음
      const opens = (xs?: string[]) => !!xs && !xs.some(present) && xs.some(mk);
      if (comboSoon && opens(k.combo.needs)) return 3;
      if (j === o.sink && opens(k.battle.wants)) return 3;
      // share 2(먹이 주기) 정책: 메인 딜러가 이득을 보는 상태를 만드는 배틀 스킬이 메인 딜러 기본 사용보다 먼저
      if (opens(k.likes)) best = Math.max(best, j === o.sink && (share === 2 || share === 6) ? 2.6 : 2);
    }
    return best;
  }

  const total = rt.reduce((a, r) => a + r.dmg, 0);
  const up: SimResult["uptime"] = {};
  for (const [k, u] of uptime) {
    const time = u.time + Math.max(0, Math.min(D, u.until) - u.start);
    up[k] = { uptime: Math.min(1, time / D), value: u.m.value, text: u.m.text, src: u.m.src, kind: u.m.kind, to: u.m.to, elems: u.m.elems };
  }
  return {
    total,
    dps: total / D,
    members: members.map((m, i) => ({ id: m.id, dmg: rt[i].dmg, by: rt[i].by, casts: rt[i].casts, spSpent: rt[i].spSpent, applied: applied[i] })),
    control: baseControl,
    sink: o.sink,
    spGain: (spGain + 0) / D,
    uptime: up,
    reactions: reactionCount,
    share,
  };
}

// ───────── 능력치 묶음 → 시뮬레이터 능력치 (build.ts score 와 같은 식) ─────────

export function memberStats(op: OperatorBase, weaponAtk: number, bag: StatBag, extra: { rate: number; scale: number }[] = []): MemberStats {
  const attrs = { 힘: op.attrs.힘 + bag.str, 민첩: op.attrs.민첩 + bag.agi, 지능: op.attrs.지능 + bag.int, 의지: op.attrs.의지 + bag.wil };
  attrs[op.mainAttr] = (attrs[op.mainAttr] + bag.main) * (1 + bag.mainPct);
  attrs[op.subAttr] = (attrs[op.subAttr] + bag.sub) * (1 + bag.subPct);
  const el = ELEM_OF[op.element] ?? "phys";
  const elemDmg = bag.dmg[el] + (el !== "phys" ? bag.dmg.arts : 0) + bag.dmg.all;
  const kinds: HitKind[] = ["basic", "battle", "combo", "ult", "ultMode", "extra"];
  const dmg = Object.fromEntries(
    kinds.map((k) => [k, elemDmg + (k === "extra" ? 0 : k === "ultMode" ? bag.dmg.basic + bag.dmg.ultMode : bag.dmg[k])]),
  ) as Record<HitKind, number>;
  const scope = (k: HitKind) => (k === "basic" || k === "extra" ? 0 : k);
  return {
    atkBase: op.atk + weaponAtk,
    atkPct: bag.atkPct,
    flatAtk: bag.flatAtk,
    attrBonus: 1 + 0.005 * attrs[op.mainAttr] + 0.002 * attrs[op.subAttr],
    dmg,
    elemDmg,
    critRate: Math.min(1, op.critRate + bag.critRate),
    critDmg: 0.5 + bag.critDmg,
    critBy: Object.fromEntries(kinds.map((k) => [k, scope(k) ? bag.critBy[scope(k) as "battle"] : 0])) as Record<HitKind, number>,
    critDmgBy: Object.fromEntries(kinds.map((k) => [k, scope(k) ? bag.critDmgBy[scope(k) as "battle"] : 0])) as Record<HitKind, number>,
    artsIntensity: bag.artsIntensity,
    amp: bag.amp,
    taken: bag.taken,
    ultGain: bag.ultGain,
    comboCdr: bag.comboCdr,
    attrs,
    extra: extra.filter((x) => x.rate > 0 && x.scale > 0),
  };
}

/**
 * 팀 평가: 메인 딜러(SP를 몰아 줄 사람) 후보를 바꿔 가며 시뮬레이션 → 팀 피해가 가장 큰 운영.
 * 후보 = 딜 구조(carry ≥ 0.5) 상위 2명 (없으면 1위)
 */
export function simulateBest(members: SimMember[], o: { duration?: number; sinks?: number; fast?: boolean; rollout?: boolean } = {}): SimResult {
  const order = members.map((m, i) => ({ i, c: m.kit.carry })).sort((a, b) => b.c - a.c);
  const cands = order.filter((x) => x.c >= 0.5).slice(0, o.sinks ?? 2);
  const list = cands.length ? cands : order.slice(0, 1);
  // 스킬 형태(결: 지능 ≥ 의지 → 진결·지혜, 아니면 진결·의지)는 게임처럼 실제 능력치로 정해짐 — 형태를 바꾸려면 장비(능력치)를 바꿔야 함
  //   (2026-10-08 이전: 능력치와 상관없이 두 형태를 다 돌려 큰 쪽 → 지능 장비로 의지 형태를 쓰는 불가능한 운영이 나올 수 있었음)
  const variants: SimMember[][] = [members];
  let best: SimResult | undefined;
  let bestMs = members;
  // fast(1차 선별): 메인 딜러 후보 × 정책 1·3·4·5·6 (0·2 는 다른 정책보다 앞선 적이 거의 없음)
  // 정밀(2차): 정책 0~6 전부 → 가장 좋은 정책을 기본으로 한 롤아웃(7)까지 — 몇 초 뒤 이득(부착 깔기·결 구속 뒤 배틀)을 찾음
  const policies = o.fast ? [1, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  for (const ms of variants)
    for (const { i } of list)
      for (const share of policies) {
        const r = simulate(ms, { sink: i, duration: o.duration, share });
        if (!best || r.total > best.total) {
          best = r;
          bestMs = ms;
        }
      }
  if (!o.fast && o.rollout !== false && best) {
    const r = simulate(bestMs, { sink: best.sink, duration: o.duration, share: 7, rolloutBase: best.share });
    if (r.total > best.total) best = r;
  }
  best!.forms = bestMs.map((m) => m.form ?? "");
  return best!;
}
