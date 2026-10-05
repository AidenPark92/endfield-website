// 팀 로테이션 모델 (순수 함수) — 4인 파티가 실제로 굴러갈 때의 스킬 빈도와 팀 피해
//
// 개인 추천은 "혼자서 SP를 다 쓰고, 연계는 쿨타임마다"로 본다. 파티에서는 이게 성립하지 않는다:
//   1) SP는 팀 공유 (combat-mechanics §2 ✅) — 자연 회복 ≈ 8 SP/s + 메인 컨트롤의 강력한 일격 + 뱅가드 회복을
//      네 명이 나눠 쓴다. 누가 배틀 스킬을 쓰는지가 곧 로테이션 → 팀 피해가 가장 커지게 나눈다(그리디 배분)
//   2) 배틀 스킬은 (소모 SP ÷ 100) × 6.5 궁극기 에너지를 팀 전원에게, 연계는 본인에게 10 ✅
//      → 배틀 스킬을 많이 쓰는 팀은 궁극기도 자주 돈다
//   3) 연계 스킬은 조건 + 쿨타임 — 조건을 만드는 동료의 스킬 빈도가 낮으면 쿨타임이 끝나도 기다린다
//      빈도 = 1 / (쿨타임 + 다음 기회까지 평균 대기 1/λ), λ = 조건을 만드는 팀원들의 초당 스킬 사용 수
//   4) 시너지 버프 — 스킬이 주는 증폭·취약·공격력 버프와 감전·갑옷 파괴·부식 디버프 (lib/calc/team-buffs.ts)
//      가동률 = min(1, 그 스킬 빈도 × 지속 시간). 서포터가 배틀 스킬을 얼마나 쓰는지가 버프 가동률을 정한다
// 팀 피해 = Σ 멤버 피해 (본인 스킬 + 이상 피해 + 추가 타격, 받은 버프 포함)
import { BASIC_CHAIN_SECONDS, ASSUME, BATTLE_ULT_ENERGY, SP_REGEN_INTERVAL, addBag, score, type OperatorBase, type StatBag } from "./build";
import { selfDamageOf, type OperatorKit } from "./weapon-value";
import { stateSupply, supplyFactor } from "./party";
import { STATE_DEBUFFS, buffApplies, buffBag, type SkillBuff } from "./team-buffs";
import type { ComboStatus } from "./team";

export type Kind3 = "battle" | "combo" | "ult";
export type Rates3 = Record<Kind3, number>;

/** 자연 회복 SP/s (100 SP / 12.5초 ✅) */
export const SP_REGEN = 100 / SP_REGEN_INTERVAL;
/** TODO(실측): 조건이 필요 없는 연계(강력한 일격·피격 등)도 조건이 다시 생길 때까지 평균 대기(초) */
export const FREE_COMBO_WAIT = 2;
/** TODO(실측): 한 오퍼레이터가 쓸 수 있는 배틀 스킬 최대 빈도(초당) — 시전 시간 상한 */
export const MAX_BATTLE_RATE = 0.25;

export interface RotMember {
  id: string;
  op: OperatorBase;
  kit: OperatorKit;
  weaponAtk: number;
  /** 무기·장비·세트(받은 세트 팀 효과 포함) — 스킬 팀 버프는 여기서 더함 */
  bag: StatBag;
  extra: { rate: number; scale: number }[];
  /** 본인 피해 비중 (메인 컨트롤 고르기) */
  roleSelf: number;
  combo: {
    status: ComboStatus;
    /** 다른 오퍼레이터의 연계로 발동 (관리자) */
    teamCombo?: boolean;
    /** 조건을 만드는 동료 */
    providers: string[];
  };
  buffs: SkillBuff[];
  /**
   * "중첩된 부착 스택을 소모할 때마다 추가되는 피해 배율"(이본 배틀 200%, 라스트 라이트 연계 240%, 로시 연계 180%) —
   * 소모 스택 = min(4, 파티가 그 부착을 거는 빈도 ÷ 이 스킬 빈도). 개인 추천은 이 부분을 피해에 넣지 않음(팀 의존)
   */
  stackConsume?: { kind: Kind3; perStack: number; energyPerStack: number; states: string[] }[];
  /**
   * 스택을 모아 쓰는 추가 공격 (레바테인: 녹아내린 불꽃 4스택 → 배틀 스킬 추가 공격 770% + 궁극기 에너지 100).
   * 스택 = 스킬 명중(gainPerUse) + 팀원이 건 부착 흡수(gainStates, 재능). 추가 공격 빈도 = min(배틀 스킬 빈도, 스택 획득 ÷ need).
   * 회전(weight·battleEnergy)에는 매번 터지는 것으로 들어가 있으므로 그 차이를 뺀다
   */
  charged?: { kind: Kind3; weight: number; energy: number; need: number; gainPerUse: Rates3; gainStates: string[] };
  /** 스킬별 방어 불능 스택 부여 여부 (띄우기·넘어뜨리기 = 물리 이상 → 방어 불능 +1 ✅, 직접 부여) */
  vulnStack?: Rates3;
  /** 소모 스택에 따라 회복하는 SP (알레쉬 부착 1~4스택 15/25/35/45, 포그라니치니크 방어 불능 5/15/25/35) */
  spTier?: { kind: Kind3; tiers: number[]; states: string[] }[];
  sp: {
    /** 배틀 스킬 소모 SP */
    cost: number;
    /** 반환 SP (에너지 없음) */
    ret: number;
    /** 스킬이 회복하는 SP (팀 공유 풀로) */
    recover: Rates3;
    /** 메인 컨트롤일 때 강력한 일격 SP */
    finalStrike: number;
  };
}

export interface RotBuffView {
  from: string;
  text: string;
  effect: SkillBuff["effect"];
  value: number;
  uptime: number;
  /** 받는 팀원 */
  to: string[];
}

export interface RotationResult {
  members: { id: string; rates: Rates3; damage: number; share: number; spShare: number }[];
  total: number;
  /** 피해 비중 1위 */
  mainId: string;
  /** 조작 캐릭터 (강력한 일격 SP · 메인 컨트롤 버프) */
  controlId: string;
  /** 팀 SP 수입 (SP/s) */
  spIncome: number;
  /** 궁극기 평균 간격(초) — 멤버 평균 */
  ultInterval: number;
  /** 연계 발동 가능한 멤버의 연계 빈도 ÷ 쿨타임 상한 평균 */
  comboUptime: number;
  buffs: RotBuffView[];
}

const comboCd = (m: RotMember) => {
  const base = m.kit.rotation.comboRate > 0 ? 1 / m.kit.rotation.comboRate : Infinity;
  return base * (1 - Math.min(0.7, Math.max(0, m.bag.comboCdr * ASSUME.comboCdrRealized)));
};

/** 연계 빈도 (서로 영향을 주므로 몇 번 반복) */
function comboRates(ms: RotMember[], battle: number[], ultGuess: number[]): number[] {
  const idx = new Map(ms.map((m, i) => [m.id, i]));
  let c = ms.map((m) => (m.combo.status === "off" ? 0 : 1 / (comboCd(m) + FREE_COMBO_WAIT)));
  for (let t = 0; t < 3; t++) {
    c = ms.map((m) => {
      const cd = comboCd(m);
      if (!Number.isFinite(cd) || m.combo.status === "off") return 0;
      if (m.combo.teamCombo) {
        const lam = ms.reduce((s, o, j) => s + (j === idx.get(m.id) ? 0 : c[j]), 0);
        return lam > 0 ? 1 / (cd + 1 / lam) : 0;
      }
      if (m.combo.status === "free") return 1 / (cd + FREE_COMBO_WAIT);
      // 조건 제공자(동료 + 혼자 가능하면 본인)의 스킬 사용 빈도
      const who = new Set(m.combo.providers);
      if (m.combo.status === "self") who.add(m.id);
      let lam = 0;
      for (const id of who) {
        const j = idx.get(id);
        if (j === undefined) continue;
        lam += battle[j] + ultGuess[j] + (j === idx.get(m.id) ? 0 : c[j]);
      }
      return lam > 0 ? 1 / (cd + 1 / lam) : 0;
    });
  }
  return c;
}

interface Eval {
  rates: Rates3[];
  damage: number[];
  total: number;
  spIncome: number;
  buffs: RotBuffView[];
}

/** 배틀 스킬 배분(초당 횟수) → 팀 피해 */
function evaluate(ms: RotMember[], battle: number[], main: number, withBuffs = true, ratesOnly = false): Eval {
  const n = ms.length;
  // 궁극기: 배틀 스킬 에너지(팀 전원) + 본인 연계 에너지
  const teamEnergy = ms.reduce((s, m, j) => s + (BATTLE_ULT_ENERGY * battle[j] * Math.max(0, m.sp.cost - m.sp.ret)) / 100, 0);
  const ultOf = (c: number[], extraE: number[]) =>
    ms.map((m, i) => {
      const r = m.kit.rotation;
      // 팀 배틀 스킬 에너지(라스트 라이트는 못 받음) + 본인 배틀 스킬 추가 에너지 + 본인 연계 에너지
      const e = Math.max(0, (r.selfEnergyOnly ? 0 : teamEnergy) + (r.battleEnergy ?? 0) * battle[i] + r.comboEnergy * c[i] + extraE[i]) * (1 + m.bag.ultGain);
      const interval = Math.max(r.ultCooldown, e > 0 ? r.ultCost / e : Infinity);
      return Number.isFinite(interval) && interval > 0 ? 1 / interval : 0;
    });
  let ult = ultOf(ms.map(() => 0), ms.map(() => 0));
  const combo = comboRates(ms, battle, ult);
  // 부착 스택 소모형: 파티 부착 공급 ÷ 스킬 빈도 (최대 4)
  const pre = ms.map((m, i) => ({ kit: m.kit, rates: { battle: battle[i], combo: combo[i], ult: ult[i] } }));
  // 아츠 부착 스택은 같은 속성끼리만 쌓이고, 다른 속성이 들어오면 아츠 이상으로 모두 소모 ✅ (combat-mechanics §5)
  // → 쌓이는 스택 공급 = 그 속성 부착 빈도 × 순도(그 속성 ÷ 전체 부착 빈도). 한 속성으로 모인 팀일수록 스택 소모형이 강해짐
  const ARTS = ["열기 부착", "전기 부착", "냉기 부착", "자연 부착"];
  const attach = new Map(ARTS.map((st) => [st, stateSupply(st, pre)]));
  const attachAll = [...attach.values()].reduce((t, v) => t + v, 0);
  const supplyOf = (st: string) => {
    if (attach.has(st)) return attachAll > 0 ? (attach.get(st)! * attach.get(st)!) / attachAll : 0;
    return (
      stateSupply(st, pre) +
      (st === "방어 불능" ? ms.reduce((t, m, i) => t + (m.vulnStack ? m.vulnStack.battle * battle[i] + m.vulnStack.combo * combo[i] + m.vulnStack.ult * ult[i] : 0), 0) : 0)
    );
  };
  // 같은 부착(방어 불능)을 소모하는 사람이 여럿이면 공급을 나눠 가짐: 경쟁 소모 빈도 = 상태가 겹치는 모든 소모 스킬 빈도 합
  const consumers: { states: string[]; use: number }[] = [];
  ms.forEach((m, i) => {
    for (const x of [...(m.stackConsume ?? []), ...(m.spTier ?? [])]) consumers.push({ states: x.states, use: pre[i].rates[x.kind] });
  });
  const stacksFor = (states: string[], use: number) => {
    if (use <= 0) return 0;
    const competing = Math.max(use, consumers.filter((c) => c.states.some((st) => states.includes(st))).reduce((t, c) => t + c.use, 0));
    return Math.min(4, states.reduce((t, st) => t + supplyOf(st), 0) / competing);
  };
  const tierAt = (tiers: number[], st: number) => {
    if (st <= 0) return 0;
    if (st < 1) return tiers[0] * st;
    const lo = Math.min(tiers.length, Math.floor(st));
    const hi = Math.min(tiers.length, lo + 1);
    return tiers[lo - 1] + (tiers[hi - 1] - tiers[lo - 1]) * (st - lo);
  };
  const tierSp = ms.reduce((t, m, i) => t + (m.spTier ?? []).reduce((u, x) => u + tierAt(x.tiers, stacksFor(x.states, pre[i].rates[x.kind])) * pre[i].rates[x.kind], 0), 0);
  const stacks = ms.map((m, i) =>
    (m.stackConsume ?? []).map((sc) => {
      return stacksFor(sc.states, pre[i].rates[sc.kind]);
    }),
  );
  // 스킬 표의 "스택마다 추가 궁극기 에너지"는 기본 회전에 1스택으로 들어가 있음 → 실제 스택과의 차이만큼
  const stackEnergy = ms.map((m, i) => (m.stackConsume ?? []).reduce((t, sc, j) => t + sc.energyPerStack * (stacks[i][j] - 1) * pre[i].rates[sc.kind], 0));
  // 스택 추가 공격: 실제 발동 비율 (0~1)
  const chargedRatio = ms.map((m, i) => {
    const c = m.charged;
    if (!c) return 1;
    const use = pre[i].rates[c.kind];
    if (use <= 0) return 0;
    const gain = (["battle", "combo", "ult"] as const).reduce((t, k) => t + c.gainPerUse[k] * pre[i].rates[k], 0) + c.gainStates.reduce((t, st) => t + supplyOf(st), 0);
    return Math.min(1, gain / c.need / use);
  });
  ms.forEach((m, i) => {
    if (m.charged) stackEnergy[i] += m.charged.energy * (chargedRatio[i] - 1) * pre[i].rates[m.charged.kind];
  });
  ult = ultOf(combo, stackEnergy);
  const rates: Rates3[] = ms.map((_, i) => ({ battle: battle[i], combo: combo[i], ult: ult[i] }));
  const spIncome =
    SP_REGEN +
    ms[main].sp.finalStrike / (BASIC_CHAIN_SECONDS / Math.max(0.1, ASSUME.basicScale)) +
    ms.reduce((s, m, i) => s + m.sp.recover.battle * rates[i].battle + m.sp.recover.combo * rates[i].combo + m.sp.recover.ult * rates[i].ult, 0) +
    tierSp;

  if (ratesOnly) return { rates, damage: [], total: 0, spIncome, buffs: [] };
  // 버프: 같은 사람이 같은 효과를 여러 스킬로 주면 각각 (서로 다른 출처는 합연산 구간에서 합)
  const party = ms.map((m, i) => ({ kit: m.kit, rates: rates[i] }));
  const views: RotBuffView[] = [];
  const bags = ms.map((m) => m.bag);
  if (withBuffs) {
    const add = (from: string, b: SkillBuff, uptime: number, targets: number[]) => {
      if (uptime <= 0 || !targets.length) return;
      for (const j of targets) bags[j] = addBag(bags[j], buffBag(b, uptime));
      views.push({ from, text: b.text, effect: b.effect, value: b.value, uptime: Math.min(1, uptime), to: targets.map((j) => ms[j].id) });
    };
    ms.forEach((p, i) => {
      for (const b of p.buffs) {
        if (b.kind === "state") continue;
        const up = Math.min(1, rates[i][b.kind] * b.duration);
        const targets = [...Array(n).keys()].filter(
          (j) =>
            buffApplies(b, ms[j].kit.element) &&
            (b.target === "main" ? j === main : true) &&
            // 공격력 버프는 본인 몫이 이미 자체 버프(selfKitBag)에 들어 있음
            !(b.effect === "atk" && j === i),
        );
        add(p.id, b, up, targets);
      }
    });
    // 이상 디버프: 파티가 그 상태를 거는 빈도 × 지속
    for (const d of STATE_DEBUFFS) {
      const supply = stateSupply(d.state!, party);
      if (supply <= 0) continue;
      const targets = [...Array(n).keys()].filter((j) => buffApplies(d, ms[j].kit.element));
      add(d.state!, d, supply * d.duration, targets);
    }
  }
  const damage = ms.map((m, i) => {
    const w = { ...m.kit.rotation.weight };
    (m.stackConsume ?? []).forEach((sc, j) => (w[sc.kind] += sc.perStack * stacks[i][j]));
    if (m.charged) w[m.charged.kind] -= m.charged.weight * (1 - chargedRatio[i]);
    const rot = { ...m.kit.rotation, weight: w, fixedRates: rates[i] };
    const op = { ...m.op, rotation: rot };
    const bag = bags[i];
    const kit = { ...m.kit, rotation: rot, critRate: Math.min(1, (m.kit.critRate ?? m.op.critRate) + bag.critRate) };
    const sc = score(op, m.weaponAtk, bag);
    return selfDamageOf(kit, sc, bag, m.extra) * supplyFactor(m.kit, rates[i], party);
  });
  return { rates, damage, total: damage.reduce((s, d) => s + d, 0), spIncome, buffs: views };
}

// 배틀 스킬 1회의 순 SP 소모 (회복분은 SP 수입 쪽에서 더함)
const netSp = (m: RotMember) => Math.max(10, m.sp.cost - m.sp.ret);

/** 메인 컨트롤: SP를 똑같이 나눴을 때 본인 피해 비중 × 피해가 가장 큰 멤버 (soloScore 를 주면 그 값으로 — 1차 선별 가속) */
function pickMain(ms: RotMember[], soloScore?: number[]): number {
  if (soloScore) return soloScore.reduce((b, v, i) => (v > soloScore[b] ? i : b), 0);
  const even = ms.map((m) => SP_REGEN / ms.length / netSp(m));
  const e0 = evaluate(ms, even, 0, false);
  return e0.damage.reduce((b, d, i) => (ms[i].roleSelf * d > ms[b].roleSelf * e0.damage[b] ? i : b), 0);
}

/**
 * 빠른 근사 (1차 선별용 — 수만 개 조합): ① SP를 전부 메인 컨트롤에게 ② 배틀 스킬 버프가 있는 팀원은 버프 유지 빈도(1/지속 시간)만큼 주고
 * 나머지를 메인에게 — 둘 중 큰 쪽. 그리디 배분(simulateTeam) 결과가 대부분 이 두 모양 중 하나
 */
export function quickTeamDamage(ms: RotMember[], soloScore?: number[]): { total: number; main: number } {
  const main = pickMain(ms, soloScore);
  const zero = evaluate(ms, ms.map(() => 0), main, false, true);
  /** 버프 유지 여부(keep)에 따른 배분: 유지하는 팀원은 1/지속 시간, 나머지는 메인 → 상한 넘으면 본인 피해 비중 순 */
  const allocate = (keep: boolean) => {
    let budget = zero.spIncome;
    const battle = ms.map(() => 0);
    if (keep)
      ms.forEach((m, i) => {
        if (i === main) return;
        const dur = Math.max(0, ...m.buffs.filter((b) => b.kind === "battle").map((b) => b.duration));
        if (dur <= 0) return;
        const x = Math.min(1 / dur, budget / netSp(m));
        battle[i] = x;
        budget -= x * netSp(m);
      });
    battle[main] = Math.min(MAX_BATTLE_RATE, budget / netSp(ms[main]));
    budget -= battle[main] * netSp(ms[main]);
    for (const i of [...ms.keys()].filter((j) => j !== main).sort((a, b) => ms[b].roleSelf - ms[a].roleSelf)) {
      if (budget <= 0) break;
      const x = Math.min(MAX_BATTLE_RATE - battle[i], budget / netSp(ms[i]));
      battle[i] += x;
      budget -= x * netSp(ms[i]);
    }
    return evaluate(ms, battle, main).total;
  };
  const hasBattleBuff = ms.some((m, i) => i !== main && m.buffs.some((b) => b.kind === "battle"));
  return { total: hasBattleBuff ? Math.max(allocate(true), allocate(false)) : allocate(false), main };
}

/**
 * 팀 로테이션 시뮬레이션: 메인 컨트롤을 정하고, SP 수입을 조금씩 나눠 주며 팀 피해가 가장 많이 오르는 멤버에게 배틀 스킬을 준다
 * steps = SP 배분 단위 수 (클수록 정밀, 느림)
 */
export function simulateTeam(ms: RotMember[], opts: { steps?: number; main?: number } = {}): RotationResult {
  if (opts.main !== undefined) return greedy(ms, opts.main, opts.steps ?? 16);
  // 메인 컨트롤 후보: SP를 똑같이 나눴을 때 본인 피해 비중 × 피해 상위 2명 → 각각 배분해 보고 팀 피해가 큰 쪽
  const even = ms.map((m) => SP_REGEN / ms.length / netSp(m));
  const e0 = evaluate(ms, even, 0, false);
  const cands = [...ms.keys()]
    .filter((i) => ms[i].roleSelf > 0)
    .sort((a, b) => ms[b].roleSelf * e0.damage[b] - ms[a].roleSelf * e0.damage[a])
    .slice(0, 2);
  const runs = (cands.length ? cands : [0]).map((m) => greedy(ms, m, opts.steps ?? 16));
  return runs.reduce((a, b) => (b.total > a.total ? b : a));
}

function greedy(ms: RotMember[], main: number, steps: number): RotationResult {
  const n = ms.length;
  const net = netSp;
  let battle = ms.map(() => 0);
  let cur = evaluate(ms, battle, main);
  // SP 수입은 배분에 따라 조금 바뀜(연계·궁극기 회복) → 두 번 배분
  for (let pass = 0; pass < 2; pass++) {
    const budget = cur.spIncome;
    const delta = budget / steps;
    battle = ms.map(() => 0);
    cur = evaluate(ms, battle, main);
    for (let s = 0; s < steps; s++) {
      let best = -1;
      let bestEval: Eval | undefined;
      for (let i = 0; i < n; i++) {
        const add = delta / net(ms[i]);
        if (battle[i] + add > MAX_BATTLE_RATE) continue;
        const trial = battle.slice();
        trial[i] += add;
        const e = evaluate(ms, trial, main);
        if (!bestEval || e.total > bestEval.total) {
          best = i;
          bestEval = e;
        }
      }
      if (best < 0 || !bestEval) break;
      battle[best] += delta / net(ms[best]);
      cur = bestEval;
    }
  }
  const total = cur.total;
  const spSpent = battle.reduce((s, x, i) => s + x * net(ms[i]), 0);
  const ultInts = cur.rates.map((r) => (r.ult > 0 ? 1 / r.ult : Infinity)).filter(Number.isFinite);
  const comboOn = ms.map((m, i) => ({ m, i })).filter(({ m }) => m.combo.status !== "off" && Number.isFinite(comboCd(m)));
  return {
    members: ms.map((m, i) => ({
      id: m.id,
      rates: cur.rates[i],
      damage: cur.damage[i],
      share: total > 0 ? cur.damage[i] / total : 0,
      spShare: spSpent > 0 ? (battle[i] * net(m)) / spSpent : 0,
    })),
    total,
    // 화면의 메인 딜러 = 피해 비중 1위 (조작 캐릭터 controlId 와 다를 수 있음: 강력한 일격 SP·"메인 컨트롤" 버프 대상)
    mainId: ms[cur.damage.reduce((b, d, i) => (d > cur.damage[b] ? i : b), 0)].id,
    controlId: ms[main].id,
    spIncome: cur.spIncome,
    ultInterval: ultInts.length ? ultInts.reduce((s, x) => s + x, 0) / ultInts.length : Infinity,
    comboUptime: comboOn.length ? comboOn.reduce((s, { m, i }) => s + cur.rates[i].combo * comboCd(m), 0) / comboOn.length : 0,
    buffs: cur.buffs,
  };
}
