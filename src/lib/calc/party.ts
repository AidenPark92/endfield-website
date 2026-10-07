// 파티 단위 장비 최적화 (순수 함수) — 4인 파티가 정해졌을 때 각자의 장비 세트를 함께 고른다
//
// 개인 추천(rankGearByValue)은 "무작위 팀원 3명"의 기대값으로 장비를 고른다. 파티가 정해지면 달라지는 것:
//   1) 실제 팀원 — 세트 조건(부착·반응·동료가 만드는 상태)을 실제 3명으로 판정
//   2) 팀 버프 중첩 — "해당 효과는 중첩되지 않습니다": 같은 세트 효과는 한 번만
//        · "다른 팀원이 주는 피해"(식양의 숨결)는 본인은 못 받음 → 둘이 들면 서로를 채워 줌 (커뮤니티 팀 빌드: 2명 보유 129/721로 흔함)
//        · "팀 전체가 주는 피해"(개척)는 본인 포함 → 둘이 들면 낭비 (커뮤니티: 2명 보유 23/356로 드묾)
//   3) 팀원 피해 비중 — 팀 버프 가치는 실제 팀원들의 피해 기대치로
//   4) 상태 공급 — "X를 소모"하는 오퍼레이터(장방이: 감전 소모 → 청뢰검)는 파티의 X 공급 빈도만큼 피해가 나옴.
//      공급자의 연계 쿨타임 감소 세트(청파)가 그 팀원 피해를 올림 (커뮤니티: 장방이와 함께면 펠리카 청파 27%→75%).
//      ⚠️ 공급 효과 크기(ASSUME.consumeDependency)는 실측 전이라 작게 둠 — 지금 모델로는 펠리카 청파를 재현하지 못함
// 멤버 점수 = 개인 추천과 같은 역할 비중 식에서 "메인 딜러 강화" 몫만 실제 팀원(본인 피해 비중으로 가중)으로 바꾼 것
//   5) 무기도 함께 — 후보 = (무기 × 장비 세트). 무기 고유 특성의 팀 효과(팀 공격력·받는 피해 …)도 장비 세트 효과와 같은 중첩 규칙으로 팀원에게
// 탐색: 멤버마다 개인 추천 상위 K개 조합을 후보로, 다른 멤버를 고정하고 한 명씩 가장 좋은 후보로 바꾸는 반복(최선 응답) — 바뀌지 않을 때까지
import { ASSUME, addBag, emptyBag, gearBag, rates, score, type OperatorBase, type StatBag } from "./build";
import {
  effectBag,
  evaluateSuitEffect,
  healIndex,
  selfDamageOf,
  survivalIndex,
  type OperatorKit,
  type RoleWeight,
  type TeamEffectLine,
  type TeamPool,
} from "./weapon-value";
import type { GearPiece, GearSuit } from "@/types/build";
import type { Blackboard } from "@/types/combat";
import type { AttrName } from "@/types/game";

type Rates = Record<"battle" | "combo" | "ult", number>;
/** 디버그: DEBUG_PARTY=오퍼레이터 id 이면 그 멤버의 후보별 점수를 출력 */
const DEBUG = typeof process !== "undefined" ? process.env.DEBUG_PARTY : undefined;
let debugParts = "";

/** 무기 후보 — 본인 능력치(능력치 스킬 + 고유 특성 본인 몫) · 추가 타격 · 팀원에게 가는 효과 */
export interface PartyWeapon {
  id: string;
  name: string | null;
  atk: number;
  bag: StatBag;
  extra: { rate: number; scale: number }[];
  team: TeamEffectLine[];
}

export interface PartyCandidate {
  suitId: string;
  suitName: string | null;
  pieces: { id: string; name: string | null; partType: number; inSuit: boolean }[];
  /** 무기 (없으면 PartyMember.base · weaponAtk 에 이미 들어 있는 무기 그대로) */
  weapon?: PartyWeapon;
}

export interface PartyMember {
  id: string;
  op: OperatorBase;
  kit: OperatorKit;
  role: RoleWeight;
  weaponAtk: number;
  /** 재능·자체 버프 (+ 후보에 무기가 없으면 1위 무기) */
  base: StatBag;
  /** 개인 추천 순서대로 (0 = 개인 1위) */
  candidates: PartyCandidate[];
}

export interface PartyPick {
  id: string;
  /** 고른 후보 번호 (candidates 기준) */
  pick: number;
  /** 개인 추천 1위와 다를 때 이유 */
  reason?: string;
  /** 팀원에게서 받는 팀 버프 (세트 이름 · 준 사람) */
  received: { suitName: string | null; from: string; text: string }[];
}

export interface PartyResult {
  picks: PartyPick[];
  /** 파티 피해 기대치 합 ÷ 개인 추천 장비 그대로일 때 합 */
  gain: number;
  /** 파티 피해 기대치 합 (절대 지수) */
  teamDamage: number;
  /** 파티 화력 = Σ 멤버 피해 × 본인 피해 비중(역할) — 서포터 본인 피해는 빼고 딜러 피해만 (파티끼리 비교용) */
  power: number;
  iterations: number;
  /** 멤버별 최종 능력치(무기 + 장비 + 세트 효과 + 받은 무기·세트 팀 효과)와 추가 타격 · 무기 공격력 — 팀 전투 시뮬레이션 입력 */
  finals: { bag: StatBag; extra: { rate: number; scale: number }[]; weaponAtk: number; weaponId?: string }[];
}

/** 상태를 소모·부여하는 문장 판정 — 발동 조건 문장("…일 때 사용할 수 있습니다")은 제외 */
const CONSUMABLE = ["감전", "연소", "동결", "부식", "방어 불능", "전기 부착", "열기 부착", "냉기 부착", "자연 부착"];
const effectSentences = (text: string) => text.split(/(?<=[.。])\s*|\n/).filter((x) => x.trim() && !/사용할 수 있/.test(x));
const consumes = (text: string, st: string) => effectSentences(text).some((x) => new RegExp(`${st}(?: 상태)?(?:을|를) 소모`).test(x));
const applies = (text: string, st: string) => effectSentences(text).some((x) => new RegExp(`${st}(?: 상태)?(?:을|를) (?:부여|일으)|${st} 상태로 만`).test(x));

// 문장 판정은 정규식이라 느림 → 같은 스킬 설명(kit.texts 객체)이면 결과 재사용 (팀 로테이션은 수만 번 호출)
const consumedCache = new WeakMap<object, ReturnType<typeof consumedStatesRaw>>();
const appliesCache = new WeakMap<object, Map<string, boolean>>();
const appliesK = (kit: OperatorKit, k: "battle" | "combo" | "ult", st: string) => {
  let m = appliesCache.get(kit.texts);
  if (!m) appliesCache.set(kit.texts, (m = new Map()));
  const key = `${k}|${st}`;
  let v = m.get(key);
  if (v === undefined) m.set(key, (v = applies(kit.texts[k] ?? "", st)));
  return v;
};

export function consumedStates(kit: OperatorKit): { state: string; kinds: ("battle" | "combo" | "ult")[]; levels: boolean }[] {
  let v = consumedCache.get(kit.texts);
  if (!v) consumedCache.set(kit.texts, (v = consumedStatesRaw(kit)));
  return v;
}

function consumedStatesRaw(kit: OperatorKit): { state: string; kinds: ("battle" | "combo" | "ult")[]; levels: boolean }[] {
  const out: { state: string; kinds: ("battle" | "combo" | "ult")[]; levels: boolean }[] = [];
  for (const st of CONSUMABLE) {
    const kinds = (["battle", "combo", "ult"] as const).filter((k) => consumes(kit.texts[k] ?? "", st));
    // "소모한 감전 상태의 이상 레벨 +1자루" 처럼 상태 레벨에 비례하는 소모
    const levels = kinds.some((k) => /이상 레벨/.test(kit.texts[k] ?? ""));
    if (kinds.length) out.push({ state: st, kinds: [...kinds], levels });
  }
  return out;
}

/** 파티가 그 상태를 거는 초당 횟수 — 부여하는 스킬 빈도의 합 (각자 장비가 반영된 빈도) */
export function stateSupply(state: string, party: { kit: OperatorKit; rates: Rates }[]): number {
  return party.reduce((s, m) => s + (["battle", "combo", "ult"] as const).reduce((t, k) => t + (appliesK(m.kit, k, state) ? m.rates[k] : 0), 0), 0);
}

/**
 * 소모형 오퍼레이터의 피해 배율: (1 − α) + α × min(1, 공급 ÷ 소모)
 * α = ASSUME.consumeDependency — 그 상태가 없을 때 잃는 피해 비율 (실측 전 보정값)
 */
export function supplyFactor(kit: OperatorKit, myRates: Rates, party: { kit: OperatorKit; rates: Rates }[]): number {
  const a = ASSUME.consumeDependency;
  let f = 1;
  for (const c of consumedStates(kit)) {
    const need = c.kinds.reduce((s, k) => s + myRates[k], 0);
    if (need <= 0) continue;
    const have = stateSupply(c.state, party);
    // 상태 레벨에 비례하는 소모(장방이 청뢰검)는 공급이 소모의 최대 4배(이상 레벨 4)까지 계속 이득, 아니면 소모만큼이면 충분
    const cap = c.levels ? 4 : 1;
    f = Math.min(f, 1 - a + (a * Math.min(cap, have / need)) / cap);
  }
  return f;
}

interface CandEval {
  /** 본인 능력치 (무기 + 장비 + 세트 효과 본인 몫) */
  own: StatBag;
  extra: { rate: number; scale: number }[];
  /** 팀원에게 가는 효과 (key = 중첩 판정 키: 같은 세트·같은 무기의 같은 문장은 중첩 안 됨) */
  team: KeyedLine[];
  rates: Rates;
  atk: number;
}

/** 팀 효과 한 줄 + 중첩 판정 키 + 출처 이름 */
export interface KeyedLine {
  key: string;
  source: string | null;
  l: TeamEffectLine;
}

/** 팀 버프 하나의 중첩 판정 키 — 장비 세트 / 무기 */
export const lineKey = (suitId: string, l: TeamEffectLine) => `${suitId}|${l.text}`;
export const weaponLineKey = (weaponId: string, l: TeamEffectLine) => `w:${weaponId}|${l.text}`;

/** 받는 팀 버프 묶음 */
export interface Received {
  bag: StatBag;
  list: { bag: StatBag; v: number; from: number; line: TeamEffectLine; key: string; source: string | null }[];
}

/**
 * 팀원들이 거는 팀 효과(무기 고유 특성 · 장비 세트) → 멤버 j가 받는 능력치 (순수 함수)
 *   - "해당 효과는 중첩되지 않습니다": 같은 키는 수치 하나, 여러 명이 걸면 가동률만 합쳐짐 1 − Π(1 − 가동률)
 *   - 본인이 가진 "팀 전체" 효과는 이미 본인 능력치에 있으므로 그만큼 뺌
 *   - "자신과 속성이 다른 오퍼레이터" 효과는 같은 속성 팀원에게 안 감
 *   skip = 기여를 뺄 멤버
 */
export function receiveTeamLines(j: number, ms: { kit: OperatorKit; team: KeyedLine[] }[], skip = -1): Received {
  const groups = new Map<string, { i: number; k: KeyedLine }[]>();
  const own = new Map<string, TeamEffectLine>();
  for (const k of ms[j].team) if (k.l.effect?.self) own.set(k.key, k.l);
  ms.forEach((m, i) => {
    if (i === j || i === skip) return;
    for (const k of m.team) {
      if (!k.l.effect) continue;
      if (k.l.effect.othersDiffElem && m.kit.element === ms[j].kit.element) continue;
      const g = groups.get(k.key) ?? [];
      g.push({ i, k });
      groups.set(k.key, g);
    }
  });
  const list: Received["list"] = [];
  for (const [key, g] of groups) {
    const top = g.reduce((x, y) => (y.k.l.applied > x.k.l.applied ? y : x));
    const mine = own.get(key);
    let applied: number;
    if (top.k.l.maxStack <= 1) {
      const ups = [...g.map((x) => x.k.l.uptime), ...(mine ? [mine.uptime] : [])];
      const union = 1 - ups.reduce((p, u) => p * (1 - Math.min(1, u)), 1);
      applied = top.k.l.value * Math.max(0, union - (mine ? Math.min(1, mine.uptime) : 0));
    } else applied = mine ? Math.max(0, top.k.l.applied - mine.applied) : top.k.l.applied;
    if (applied <= 0) continue;
    const add = effectBag({ ...top.k.l.effect! }, ms[j].kit, applied);
    if (!add) continue;
    list.push({ bag: add, v: applied, from: top.i, line: top.k.l, key, source: top.k.source });
  }
  let bag = emptyBag();
  for (const b of list) bag = addBag(bag, b.bag);
  return { bag, list };
}

/**
 * opts.shares — 팀 전투 시뮬레이션에서 나온 멤버별 피해 비중(합 1). 있으면 목표 = 팀 피해 기대치 Σ_j 비중_j × (피해_j / 기준_j)
 *   (치유·생존 비중 없음 — 일반 콘텐츠). 없으면 역할(직업) 비중 식
 */
export function optimizeParty(
  members: PartyMember[],
  pieces: Map<string, GearPiece>,
  suits: Map<string, GearSuit>,
  maxIter = 6,
  opts: { shares?: number[] } = {},
): PartyResult {
  const n = members.length;
  /** 후보의 무기까지 낀 기본 능력치 */
  const candBase = (m: PartyMember, c: PartyCandidate) => (c.weapon ? addBag(m.base, c.weapon.bag) : m.base);
  const attrsOf = (m: PartyMember, b: StatBag): Record<AttrName, number> => ({
    힘: m.op.attrs.힘 + b.str,
    민첩: m.op.attrs.민첩 + b.agi,
    지능: m.op.attrs.지능 + b.int,
    의지: m.op.attrs.의지 + b.wil,
  });
  const gearSum = members.map((m) =>
    m.candidates.map((c) => c.pieces.reduce((b, p) => (pieces.get(p.id) ? addBag(b, gearBag(pieces.get(p.id)!)) : b), candBase(m, c))),
  );
  const baseRates = members.map((m) => {
    const b = m.candidates[0] ? candBase(m, m.candidates[0]) : m.base;
    return rates(m.kit.rotation, b.ultGain, b.comboCdr);
  });
  // 후보 평가 (세트 효과는 실제 팀원 3명의 현재 빈도로) — 캐시
  const cache = new Map<string, CandEval>();
  const evalCand = (i: number, c: number, mateRates: Rates[]): CandEval => {
    const key = `${i}|${c}|${mateRates.map((r) => `${r.battle.toFixed(4)},${r.combo.toFixed(4)},${r.ult.toFixed(4)}`).join(";")}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = members[i];
    const cand = m.candidates[c];
    const gs = gearSum[i][c];
    const pool: TeamPool = {
      others: members.flatMap((o, j) => (j === i ? [] : [{ id: o.id, element: o.kit.element, kit: o.kit, rates: mateRates[j] }])),
    };
    const suit = suits.get(cand.suitId);
    const e = suit?.effects.find((x) => x.pieces === 3) ?? suit?.effects[0];
    const critRate = Math.min(1, (m.kit.critRate ?? m.op.critRate) + gs.critRate);
    const ev = e ? evaluateSuitEffect(e.desc, e.bb as Blackboard, { ...m.kit, critRate }, attrsOf(m, candBase(m, cand)), pool) : undefined;
    const own = ev ? addBag(gs, ev.bag) : gs;
    const w = cand.weapon;
    const team: KeyedLine[] = [
      ...(ev?.team ?? []).map((l) => ({ key: lineKey(cand.suitId, l), source: cand.suitName, l })),
      ...(w?.team ?? []).map((l) => ({ key: weaponLineKey(w!.id, l), source: w!.name, l })),
    ];
    const out: CandEval = {
      own,
      extra: [...(ev?.extraHits ?? []), ...(w?.extra ?? [])],
      team,
      rates: rates(m.kit.rotation, own.ultGain, own.comboCdr),
      atk: w ? w.atk : m.weaponAtk,
    };
    cache.set(key, out);
    return out;
  };

  /** 받는 팀 버프 (중첩 안 함: 같은 효과는 가장 큰 것 하나) — skip = 이 멤버의 기여를 뺄 때 */
  const receivedBag = (j: number, evals: (CandEval | null)[], skip = -1): Received =>
    receiveTeamLines(
      j,
      members.map((m, i) => ({ kit: m.kit, team: evals[i]?.team ?? [] })),
      skip,
    );

  const damageOf = (j: number, evals: (CandEval | null)[], skip = -1) => {
    const ev = evals[j]!;
    const m = members[j];
    const rec = receivedBag(j, evals, skip);
    const bag = addBag(ev.own, rec.bag);
    // 상태 공급: 기여를 뺀 멤버는 장비 없는 기본 빈도
    const party = members.map((o, i) => ({ kit: o.kit, rates: i === skip ? baseRates[i] : evals[i]!.rates }));
    const kit = { ...m.kit, critRate: Math.min(1, (m.kit.critRate ?? m.op.critRate) + bag.critRate) };
    const sc = score(m.op, ev.atk, bag);
    return { d: selfDamageOf(kit, sc, bag, ev.extra) * supplyFactor(m.kit, ev.rates, party), sc, bag, rec };
  };

  // 시작: 모두 개인 1위
  const picks = members.map(() => 0);
  const currentEvals = () => {
    let rs = members.map((_, i) => evalCand(i, picks[i], baseRates).rates);
    // 빈도가 서로 영향을 주므로 두 번 갱신
    for (let t = 0; t < 2; t++) rs = members.map((_, i) => evalCand(i, picks[i], rs).rates);
    return members.map((_, i) => evalCand(i, picks[i], rs));
  };
  const indivEvals = currentEvals();
  const ref = members.map((m, i) => {
    const d = damageOf(i, indivEvals);
    return {
      d: Math.max(1e-9, d.d),
      heal: Math.max(1e-9, healIndex(m.kit, d.sc.attrs, d.bag)),
      surv: Math.max(1e-9, survivalIndex(m.kit, d.bag)),
    };
  });
  const indivTeam = members.reduce((s, _, i) => s + damageOf(i, indivEvals).d, 0);

  /**
   * 멤버 i의 점수 = 개인 추천과 같은 역할 비중 식, 단 "메인 딜러 강화" 몫을 실제 팀원들로:
   *   w_본인 × 본인 피해/기준 + w_딜러 × Σ_j a_j × (팀원 j 피해 / 기준) ÷ Σ a_j + w_치유 × 치유량/기준 + w_생존 × 생존/기준
   *   a_j = 팀원 j의 본인 피해 비중(역할: 스트라이커 1 · 캐스터/가드 .5 · 뱅가드 .25 · 서포터·디펜더 0) — 누구의 피해를 올려야 하는지
   *   팀원 피해에는 팀 버프(중첩 규칙)·상태 공급(소모형 팀원)·부착 소모가 모두 들어감
   */
  const selfShare = members.map((m) => m.role.self);
  const shares = opts.shares && opts.shares.length === n && opts.shares.some((x) => x > 0) ? opts.shares : undefined;
  const utility = (i: number, evals: CandEval[]) => {
    if (shares) {
      // 팀 피해 기대치 (1차 근사): 멤버 피해 변화율을 실제 피해 비중으로 합산 — 본인 + 팀원 (팀 버프·상태 공급 포함)
      let u = 0;
      for (let j = 0; j < n; j++) if (shares[j] > 0) u += shares[j] * (damageOf(j, evals).d / ref[j].d);
      return u;
    }
    const m = members[i];
    const w = { ...m.role };
    if (!Object.keys(m.kit.heals ?? {}).length) {
      w.dealer += w.heal;
      w.heal = 0;
    }
    const me = damageOf(i, evals);
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      if (j === i || selfShare[j] <= 0) continue;
      num += selfShare[j] * (damageOf(j, evals).d / ref[j].d);
      den += selfShare[j];
    }
    // 팀원 중 딜러가 없으면 그 몫은 본인 피해로 (개인 추천의 effectiveRole 과 같음)
    if (den <= 0) {
      w.self += w.dealer;
      w.dealer = 0;
    }
    const mates = den > 0 ? num / den : 1;
    if (DEBUG) debugParts = `self=${(me.d / ref[i].d).toFixed(4)} mates=${mates.toFixed(4)} w=${JSON.stringify(w)}`;
    return (
      w.self * (me.d / ref[i].d) +
      w.dealer * mates +
      w.heal * (healIndex(m.kit, me.sc.attrs, me.bag) / ref[i].heal) +
      w.survival * (survivalIndex(m.kit, me.bag) / ref[i].surv)
    );
  };

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const evals0 = currentEvals();
      const mateRates = evals0.map((e) => e.rates);
      let best = { c: picks[i], u: -Infinity };
      for (let c = 0; c < members[i].candidates.length; c++) {
        const evals = evals0.slice();
        evals[i] = evalCand(i, c, mateRates);
        const saved = picks[i];
        picks[i] = c;
        const u = utility(i, evals);
        if (DEBUG && DEBUG === members[i].id) console.log(`[party] ${members[i].id} ${members[i].candidates[c].suitName} u=${u.toFixed(4)} ${debugParts}`);
        picks[i] = saved;
        if (u > best.u + 1e-9) best = { c, u };
      }
      if (best.c !== picks[i]) {
        picks[i] = best.c;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const final = currentEvals();
  const teamDamage = members.reduce((s, _, i) => s + damageOf(i, final).d, 0);
  const power = members.reduce((s, m, i) => s + m.role.self * damageOf(i, final).d, 0);
  const picksOut: PartyPick[] = members.map((m, i) => {
    const rec = receivedBag(i, final);
    return {
      id: m.id,
      pick: picks[i],
      reason: picks[i] !== 0 ? reasonOf(i, final, receivedBag) : undefined,
      received: rec.list.map((r) => ({ suitName: r.source, from: members[r.from].id, text: r.line.text })),
    };
  });
  const finals = members.map((m, i) => ({ bag: damageOf(i, final).bag, extra: final[i].extra, weaponAtk: final[i].atk, weaponId: m.candidates[picks[i]].weapon?.id }));
  return { picks: picksOut, gain: indivTeam > 0 ? teamDamage / indivTeam : 1, teamDamage, power, iterations, finals };

  /** 개인 1위 대신 다른 세트를 고른 이유 (한 줄) */
  function reasonOf(i: number, evals: CandEval[], recv: typeof receivedBag): string {
    const m = members[i];
    const first = m.candidates[0];
    const cand0 = m.candidates[picks[i]];
    // 0) 무기가 바뀜 — 팀 효과(다른 팀원 강화)가 이 파티에서 더 큼
    if (cand0.weapon && first.weapon && cand0.weapon.id !== first.weapon.id) {
      const gives = cand0.weapon.team.length > 0 && members.some((_, j) => j !== i && receivedBag(j, evals).list.some((r) => r.from === i && r.key.startsWith("w:")));
      return gives ? `무기 ${cand0.weapon.name}: 이 파티 팀원에게 주는 효과가 더 큼` : `무기 ${cand0.weapon.name}: 이 파티의 속성·조건에서 더 효율적`;
    }
    // 1) 개인 1위 세트의 팀 버프를 다른 멤버가 이미 줌
    const firstLines = evalCand(i, 0, evals.map((e) => e.rates)).team.filter((k) => !k.key.startsWith("w:"));
    const providedBy = members.findIndex((o, j) => j !== i && o.candidates[picks[j]].suitId === first.suitId);
    if (firstLines.length && providedBy >= 0) return `${first.suitName} 팀 효과는 @${members[providedBy].id}@이(가) 이미 줘서(중첩 안 됨) 다른 세트`;
    // 2) 소모형 팀원의 상태 공급을 늘림
    const cand = m.candidates[picks[i]];
    const consumer = members.findIndex((o, j) => j !== i && consumedStates(o.kit).some((c) => stateSupply(c.state, [{ kit: m.kit, rates: evals[i].rates }]) > 0));
    if (consumer >= 0 && evals[i].rates.combo > baseRates[i].combo + 1e-9)
      return `@${members[consumer].id}@의 ${consumedStates(members[consumer].kit)[0].state} 소모를 돕도록 연계 빈도를 올리는 ${cand.suitName}`;
    // 3) 이 파티에서 팀 버프 담당
    if (evals[i].team.length && recv(i, evals).list.every((r) => !r.key.startsWith(`${cand.suitId}|`))) return `이 파티의 팀 버프 담당 (${cand.suitName})`;
    return `이 파티의 속성·조건에서 더 효율적인 ${cand.suitName}`;
  }
}
