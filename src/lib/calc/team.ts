// 베스트 조합 — 연계 스킬 시너지로 4인 파티 평가 (순수 함수)
// 근거: docs/combat/combat-mechanics.md §3(연계 스킬), §5(아츠 부착·이상), §6(물리 이상)
//   - 연계 스킬은 캐릭터별 발동 조건이 있고, 다른 오퍼레이터가 만든 상태(부착·이상·방어 불능)가 그 조건이 된다
//   - 아츠 이상(연소·감전·동결·부식)은 "다른 속성 부착이 쌓인 적에게 마지막으로 들어온 속성"이 종류를 결정 ✅
//   - 불균형은 강력한 일격·스킬로 누구나 쌓는다 ✅ → 팀 구성과 무관한 조건
// 오퍼레이터가 "무엇을 만드는지"는 게임 데이터의 전투 태그(battleTags) 기준. 태그에 없는 부가 효과는 반영하지 않는다.
// ⚠️ 스킬 사이클·쿨타임·조작 실력은 넣지 않는다 → "조건이 성립할 수 있는가"만 본다.
import { REQUIREMENT_TAGS, comboCondition } from "./build";

export interface TeamCandidate {
  id: string;
  /** 같은 캐릭터(관리자 남/여)는 한 파티에 함께 넣지 않는다 */
  group: string;
  comboDesc: string | null;
  /** 이 오퍼레이터가 만드는 상태 (전투 태그) */
  tags: string[];
}

/** 팀과 무관하게 언제든 성립하는 조건 */
export const ALWAYS_CONDITIONS = ["강력한 일격", "처형", "불균형", "불균형 지점"];

const ELEMENTS = ["열기", "전기", "냉기", "자연"] as const;
const REACTION_OF: Record<(typeof ELEMENTS)[number], string> = { 열기: "연소", 전기: "감전", 냉기: "동결", 자연: "부식" };

export type ComboRequirement =
  | { kind: "free" } // 특정 상태가 필요 없음 (자원·피격·강력한 일격 등)
  | { kind: "any" | "all"; keywords: string[] }
  | { kind: "teamCombo" }; // 다른 오퍼레이터의 연계 스킬 (관리자)

/** 연계 발동 조건 문장 → 필요 상태 */
export function comboRequirement(desc: string | null | undefined, findTerms: (text: string) => string[]): ComboRequirement {
  const cond = comboCondition(desc);
  if (/다른 오퍼레이터의 연계 스킬/.test(cond)) return { kind: "teamCombo" };
  // "…상태에 처해 있지 않은 적" 처럼 부정이면 그 상태는 필요 조건이 아님 (아델리아)
  if (/않은|않을/.test(cond)) return { kind: "free" };
  const keywords = [...new Set(findTerms(cond))].filter((t) => REQUIREMENT_TAGS[t] && !ALWAYS_CONDITIONS.includes(t));
  if (!keywords.length) return { kind: "free" };
  // "동시에 A와 B" 만 AND, 나머지(혹은/또는/거나)는 OR
  return { kind: /동시에/.test(cond) ? "all" : "any", keywords };
}

/** 팀이 만들 수 있는 상태 → 그 상태를 만드는 데 관여하는 오퍼레이터 */
export function teamStates(team: TeamCandidate[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (state: string, id: string) => (out.get(state) ?? out.set(state, new Set()).get(state)!).add(id);
  for (const m of team) for (const t of m.tags) add(t, m.id);
  // 아츠 이상: 다른 속성 부착이 먼저 있어야 하므로, 다른 속성 부착을 하는 동료가 있으면 성립
  for (const e of ELEMENTS) {
    const appliers = team.filter((m) => m.tags.includes(`${e} 부착`));
    const others = team.filter((m) => m.tags.some((t) => t.endsWith(" 부착") && t !== `${e} 부착`));
    if (!appliers.length || !others.length) continue;
    // 한 사람이 두 속성을 모두 부착하는 경우(플루라이트 냉기+자연)도 others 에 포함되어 성립
    for (const m of [...appliers, ...others]) add(REACTION_OF[e], m.id);
  }
  return out;
}

export type ComboStatus = "team" | "self" | "free" | "off";

export interface MemberEval {
  id: string;
  status: ComboStatus;
  /** 조건을 채워 주는 동료 (본인 제외) */
  from: { keyword: string; ids: string[] }[];
}

export interface TeamEval {
  ids: string[];
  members: MemberEval[];
  /** 연계 발동 가능 인원 */
  active: number;
  /** 동료 덕분에 연계가 열리는 인원 */
  linked: number;
  /** 동료 → 동료 연결 수 (중복 제공 포함) */
  links: number;
  score: number;
}

/** 4인 파티 평가. 점수 = 연계 발동 가능 인원 ×10 + 동료 연결 점수 (최대 64점) */
export function evaluateTeam(
  team: TeamCandidate[],
  reqOf: (id: string) => ComboRequirement,
): TeamEval {
  const states = teamStates(team);
  const providersIn = (st: Map<string, Set<string>>, keyword: string) => {
    const s = new Set<string>();
    for (const tag of REQUIREMENT_TAGS[keyword] ?? []) for (const id of st.get(tag) ?? []) s.add(id);
    return s;
  };
  const providers = (keyword: string) => providersIn(states, keyword);
  const members: MemberEval[] = team.map((m) => {
    const req = reqOf(m.id);
    if (req.kind === "free") return { id: m.id, status: "free", from: [] };
    if (req.kind === "teamCombo") return { id: m.id, status: "off", from: [] }; // 아래에서 다시 계산
    const per = req.keywords.map((k) => ({ keyword: k, ids: [...providers(k)] }));
    const ok = req.kind === "all" ? per.every((p) => p.ids.length) : per.some((p) => p.ids.length);
    if (!ok) return { id: m.id, status: "off", from: [] };
    const from = per
      .map((p) => ({ keyword: p.keyword, ids: p.ids.filter((id) => id !== m.id) }))
      .filter((p) => p.ids.length);
    // 혼자서도 조건을 만들 수 있으면 self, 동료가 있어야만 하면 team (아츠 이상은 혼자 두 속성을 부착해야 혼자 가능)
    const solo = teamStates([m]);
    const selfOk =
      req.kind === "all"
        ? req.keywords.every((k) => providersIn(solo, k).size)
        : req.keywords.some((k) => providersIn(solo, k).size);
    return { id: m.id, status: selfOk ? "self" : "team", from };
  });
  // 관리자: 다른 오퍼레이터의 연계가 하나라도 발동 가능해야 함
  for (const me of members) {
    if (reqOf(me.id).kind !== "teamCombo") continue;
    const ids = members.filter((o) => o.id !== me.id && o.status !== "off").map((o) => o.id);
    if (ids.length) {
      me.status = "team";
      me.from = [{ keyword: "연계 스킬", ids }];
    }
  }
  const active = members.filter((m) => m.status !== "off").length;
  const linked = members.filter((m) => m.status === "team").length;
  const links = members.reduce((n, m) => n + new Set(m.from.flatMap((f) => f.ids)).size, 0);
  // 동료가 있어야 열리는 연계에 대한 연결은 3점, 혼자서도 되지만 동료가 더 자주 채워 주는 연결은 1점 (받는 사람당 2명까지)
  const linkScore = members.reduce(
    (n, m) => n + Math.min(2, new Set(m.from.flatMap((f) => f.ids)).size) * (m.status === "team" ? 3 : 1),
    0,
  );
  return { ids: team.map((m) => m.id), members, active, linked, links, score: active * 10 + linkScore };
}

/** 모든 4인 조합 평가 (같은 group 은 함께 넣지 않음). 점수 내림차순 */
export function rankTeams(
  pool: TeamCandidate[],
  reqOf: (id: string) => ComboRequirement,
  tieBreak: (ids: string[]) => number = () => 0,
): TeamEval[] {
  const out: TeamEval[] = [];
  const n = pool.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const team = [pool[a], pool[b], pool[c], pool[d]];
          if (new Set(team.map((m) => m.group)).size < 4) continue;
          out.push(evaluateTeam(team, reqOf));
        }
  const tb = new Map(out.map((t) => [t, tieBreak(t.ids)]));
  return out.sort((x, y) => y.score - x.score || tb.get(y)! - tb.get(x)! || x.ids.join().localeCompare(y.ids.join()));
}
