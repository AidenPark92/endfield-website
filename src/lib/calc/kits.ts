// 오퍼레이터별 스킬 동작 (팀 시뮬레이터 lib/calc/teamsim.ts 용) — 순수 함수
//
// 규칙: 배율·지속·SP·에너지 수치는 전부 스킬 표(data/operator-details.json, 만렙)에서 라벨로 읽는다 (T.v).
// 스킬 설명 문장의 동작(무엇을 부여/소모하는지, 조건)을 코드로 옮겼고, 표에 없는 값은 TODO 로 표시.
// 설명에 없는 동작은 넣지 않는다.
import type { Ctx, Elem, Kit, Reaction, SimEvent, SkillSpec } from "./teamsim";

export type SkillType = "배틀 스킬" | "연계 스킬" | "궁극기" | "일반 공격";

export interface KitTable {
  id: string;
  elem: Elem;
  /** 스킬 표 값 (만렙). "%" 단위는 소수로 (320% → 3.2). 없으면 0 */
  v: (type: SkillType, label: string | RegExp, form?: string) => number;
  /** 배틀 스킬 소모 SP · 궁극기 필요 에너지 · 쿨타임 */
  cost: (type: SkillType) => number;
  cd: (type: SkillType) => number;
  /** 스킬 1회 불균형치 합 ("궁극기 사용 중 …" 제외) */
  poise: (type: SkillType, form?: string) => number;
  basic: { chain: number; fsSp: number; fsPoise: number };
  /** 연계 스킬 기본 궁극기 에너지 */
  comboEnergy: number;
}

const me = (c: Ctx) => c.rt[c.me].s;
const stg = (c: Ctx) => c.staggerUntil > c.t;
const ARTS: Elem[] = ["열기", "전기", "냉기", "자연"];
/** 적이 그 반응 상태인지 · 강력한 일격 시점 상태 */
const snapHas = (e: SimEvent, r: Reaction) => !!e.snap?.reactions.includes(r);

function base(T: KitTable, carry: number, parts: { battle: Omit<SkillSpec, "cost" | "poise"> & Partial<SkillSpec>; combo: Omit<Kit["combo"], "cd" | "poise" | "energy"> & Partial<Kit["combo"]>; ult: Omit<Kit["ult"], "cost" | "cd" | "poise"> & Partial<Kit["ult"]> } & Partial<Pick<Kit, "onEvent" | "onFinalStrike" | "init" | "likes" | "forms">>): Kit {
  return {
    id: T.id,
    elem: T.elem,
    carry,
    basic: T.basic,
    battle: { cost: T.cost("배틀 스킬"), poise: T.poise("배틀 스킬"), ...parts.battle },
    combo: { cd: T.cd("연계 스킬"), poise: T.poise("연계 스킬"), energy: T.comboEnergy, ...parts.combo },
    ult: { cost: T.cost("궁극기"), cd: T.cd("궁극기"), poise: T.poise("궁극기"), ...parts.ult },
    onEvent: parts.onEvent,
    onFinalStrike: parts.onFinalStrike,
    init: parts.init,
    likes: parts.likes,
    forms: parts.forms,
  };
}

const B = "배틀 스킬" as const;
const C = "연계 스킬" as const;
const U = "궁극기" as const;

type Factory = (T: KitTable) => Kit;

// ───────────────────────── 전기 ─────────────────────────

/** 펠리카: 배틀 = 전기 부착 / 연계(강력한 일격 후) = 짧은 강제 감전 */
const perlica: Factory = (T) =>
  base(T, 0.5, {
    battle: {
      pri: () => 1,
      makes: ["전기 부착"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true, dmgBonus: stg(c) ? 0.3 : 0 });
        c.infl1("전기");
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike",
      cast: (c) => {
        const m = T.v(C, "피해 배율");
        c.hit(m, { kind: "combo", dmgBonus: stg(c) ? 0.3 : 0 });
        // 재능 순환 프로토콜: 방어 불능 적에게 명중하면 1회 더 튕김
        if (c.vulnNow() > 0) c.hit(m, { kind: "combo", dmgBonus: stg(c) ? 0.3 : 0 });
        c.forced("감전", 1, T.v(C, "감전 시간(초)"));
      },
    },
    ult: { cast: (c) => void c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true, dmgBonus: stg(c) ? 0.3 : 0 }) },
  });

/** 아크라이트: 배틀 = 감전 소모 시 추가 타격 + SP 40 / 연계(감전 중·감전 소모) = SP 10 */
const arclight: Factory = (T) =>
  base(T, 0.3, {
    likes: ["감전"],
    battle: {
      pri: (c) => (c.has("감전") && !c.othersNeed("감전") ? 3 : 0.5), // 장방이처럼 감전을 기다리는 동료 몫은 남김
      wants: ["감전"],
      cast: (c) => {
        c.hit(T.v(B, "제1단계 피해 배율") + T.v(B, "제2단계 피해 배율"), { kind: "battle", elem: "물리", linkable: true });
        if (c.consumeReaction("감전")) {
          c.hit(T.v(B, "추가 피해 배율"), { kind: "battle" });
          c.spRecover(T.v(B, "스킬 게이지 회복"));
          // 재능 황무지의 여행자: 3회 발동 후 팀 전기 피해 + 지능×0.08% (15초)
          const s = me(c);
          s.trig = (s.trig ?? 0) + 1;
          if (s.trig >= 3) {
            s.trig = 0;
            c.mod("황무지", { kind: "dmg", value: c.members[c.me].stats.attrs.지능 * 0.0008, elems: ["전기"], dur: 15, text: "아크라이트 재능: 팀 전기 피해" });
          }
        }
      },
    },
    combo: {
      on: (c, e) => e.type === "reactionConsumed" && e.reaction === "감전",
      state: (c) => c.has("감전") > 0,
      needs: ["감전"],
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo", elem: "물리" });
        c.spRecover(T.v(C, "스킬 게이지 회복"));
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "제1단계 피해 배율"), { kind: "ult", linkable: true });
        c.infl1("전기");
        c.hit(T.v(U, "제2단계 피해 배율"), { kind: "ult" });
        const n = c.consumeInfl(["전기"]);
        if (n) c.forced("감전", n);
      },
    },
  });

/** 장방이: 감전 소모 → 청뢰검(레벨+1, 최대 9자루·36초). 배틀 스킬 = 청뢰검마다 뇌격, 마지막 6배 */
const zhuang: Factory = (T) => {
  const per = T.v(B, "뇌격 피해 배율");
  const perUlt = T.v(B, "궁극기 사용 중 뇌격 피해 배율");
  const bonus = T.v(B, "감전 상태를 소모할 때마다 추가되는 피해 배율");
  const bonusUlt = T.v(B, "궁극기 사용 중 감전 상태를 소모할 때마다 추가되는 피해 배율");
  const cap = T.v(B, "청뢰검 수 제한") || 9;
  const life = T.v(B, "청뢰검이 존재하는 시간(초)") || 36;
  const swords = (c: Ctx) => {
    const s = me(c);
    const list = ((s as unknown as { sw?: number[] }).sw ??= []);
    while (list.length && list[0] <= c.t) list.shift();
    return list;
  };
  return base(T, 1, {
    likes: ["전기 부착", "감전"],
    battle: {
      pri: (c) => (c.rt[c.me].modeUntil > c.t || c.has("감전") ? 2.8 : 2), // 감전이 없어도 남은 청뢰검은 모두 뇌격
      wants: ["감전"],
      cast: (c) => {
        const s = me(c);
        const mode = c.rt[c.me].modeUntil > c.t;
        const list = swords(c);
        let add: number;
        let L = 0;
        if (mode && s.free) {
          // 궁극기 첫 배틀 스킬: SP·감전 소모 없음, 반드시 3자루
          s.free = 0;
          c.spReturn(T.cost(B));
          add = 3;
        } else {
          L = c.consumeReaction("감전");
          add = L ? Math.min(3, L + 1) : list.length < 3 ? 1 : 0;
        }
        for (let i = 0; i < add && list.length < cap; i++) list.push(c.t + life);
        const k = list.length;
        if (!k) return;
        const strike = (mode ? perUlt : per) + (L ? (mode ? bonusUlt : bonus) : 0);
        // 재능 천지의 조화: 전기 증폭 18% + 뇌격 명중마다 2% (이번 배틀 스킬)
        c.mod("천지의 조화", { kind: "amp", value: 0.18 + 0.02 * k, elems: ["전기"], to: [c.me], dur: 5, text: "장방이 재능: 전기 증폭" });
        c.hit(strike * (k - 1 + 6), { kind: "battle", linkable: true });
        c.energy(Math.min(54, 6 * k));
        if (mode) c.infl1("전기"); // 궁극기 중 마지막 뇌격 = 전기 부착
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike" && e.snap?.infl === "전기",
      needs: ["전기 부착"],
      cast: (c) => {
        const mode = c.rt[c.me].modeUntil > c.t;
        c.hit(mode ? T.v(C, "궁극기 사용 중 피해 배율") : T.v(C, "피해 배율"), { kind: "combo" });
        const n = c.consumeInfl(["전기"]);
        if (n) {
          const prev = c.has("감전");
          c.forced("감전", prev ? prev + 1 : 1);
          c.energy(T.v(C, "중첩된 부착 스택을 소모할 때마다 추가로 획득하는 궁극기 에너지") * n);
        }
      },
    },
    ult: {
      mode: { dur: T.v(U, "지속 시간(초)"), chain: T.v(U, /일반 공격 제1단계/) + T.v(U, /일반 공격 제2단계/) + T.v(U, /일반 공격 제3단계/), every: 3, fsSp: 20 },
      cast: (c) => {
        me(c).free = 1;
        c.mark(`연계가속:${c.me}`, T.v(U, "지속 시간(초)"), 4);
      },
    },
  });
};

/** 아비웨나: 연계(전기 부착·감전 적에 강력한 일격 후) = 썬더랜스 3개, 배틀 = 회수 */
const avywenna: Factory = (T) =>
  base(T, 1, {
    likes: ["전기 부착"],
    battle: {
      pri: (c) => ((me(c).lance ?? 0) > 0 || me(c).strong ? 2.8 : 1),
      cast: (c) => {
        const s = me(c);
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        // TODO(표 확인): 일반 썬더랜스 회수 피해 = 스킬 데이터 atk_scale_lance 1.68 (표시 항목 없음)
        const lances = s.lance ?? 0;
        if (lances) c.hit(1.68 * lances, { kind: "battle" });
        if (s.strong) {
          c.hit(T.v(B, "강력한 썬더랜스 피해 배율"), { kind: "battle" });
          c.infl1("전기");
        }
        c.energy(4 * (lances + (s.strong ? 1 : 0))); // 재능 고효율 배송
        s.lance = 0;
        s.strong = 0;
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike" && (e.snap?.infl === "전기" || snapHas(e, "감전")),
      needs: ["전기 부착"],
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        me(c).lance = Math.min(6, (me(c).lance ?? 0) + 3);
        c.energy(12);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true });
        me(c).strong = 1;
        c.mod("결전의 떨림", { kind: "susc", value: 0.1, elems: ["전기"], dur: 10, text: "아비웨나 재능: 전기 취약" });
      },
    },
  });

/** 안탈: 배틀 = 포커싱(전기·열기 취약 60초) / 연계 = 같은 부착 재부여 / 궁극기 = 전기·열기 증폭 */
const antal: Factory = (T) =>
  base(T, 0.2, {
    likes: ["아츠 부착"],
    battle: {
      pri: (c) => (c.markOn("포커싱") ? 0.5 : 3),
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        const d = T.v(B, "지속 시간(초)");
        c.mark("포커싱", d);
        c.mod("포커싱", { kind: "susc", value: T.v(B, "전기 취약 효과"), elems: ["전기", "열기"], dur: d, text: "안탈 포커싱: 전기·열기 취약" });
      },
    },
    combo: {
      state: (c) => !!c.markOn("포커싱") && (!!c.inflNow().elem || c.vulnNow() > 0),
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        const i = c.inflNow();
        if (i.elem) c.infl1(i.elem);
      },
    },
    ult: {
      cast: (c) =>
        c.mod("오버클럭", { kind: "amp", value: T.v(U, "전기 증폭 효과"), elems: ["전기", "열기"], dur: T.v(U, "지속 시간(초)"), text: "안탈 궁극기: 전기·열기 증폭" }),
    },
  });

/** 리노: 배틀(SP 25) = 라이브 모드 60초(팀 공격력) / 연계(아츠 이상 부여·소모) / 궁극기 = 전기·자연 증폭 + 강제 감전 */
const liino: Factory = (T) =>
  base(T, 0.3, {
    battle: {
      pri: (c) => (c.markOn("라이브") ? 0 : 3),
      cast: (c) => {
        c.hit(T.v(B, "초회 피해 배율"), { kind: "battle", linkable: true });
        const d = T.v(B, "라이브 모드 지속 시간(초)");
        c.mark("라이브", d);
        c.mod("공격력", { kind: "atk", value: T.v(B, "공격력 증가"), dur: d, text: "리노 라이브 모드: 팀 공격력" });
        c.mark(`dot:전기:${c.me}`, d, T.v(B, "추가 공격 피해 배율") / (T.v(B, "추가 공격 간격(초)") || 10));
      },
    },
    combo: {
      on: (c, e) => !!c.markOn("라이브") && (e.type === "reactionApplied" || e.type === "reactionConsumed"),
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        me(c).refund = 1; // 재능 일등성의 격려: 다음 전기·자연 팀원 배틀 스킬 SP 10 반환
      },
    },
    ult: {
      cast: (c) => {
        const d = T.v(U, "보컬 모드 지속 시간(초)");
        c.mod("공격력", { kind: "atk", value: T.v(U, "공격력 증가"), dur: Math.max(d, (c.markOn("라이브") ? 0 : d)), text: "리노 보컬 모드: 팀 공격력" });
        const will = c.members[c.me].stats.attrs.의지;
        c.mod("보컬", { kind: "amp", value: Math.min(T.v(U, "의지 증가 증폭 최대치"), will * T.v(U, "의지 1포인트마다 증가하는 증폭 효과")), elems: ["전기", "자연"], dur: d, text: "리노 보컬 모드: 전기·자연 증폭" });
        const songs = d / (T.v(U, "노랫소리 간격(초)") || 1.5);
        c.hit(T.v(U, "무대 위 특수 효과 피해 배율") + T.v(U, "노랫소리 1회 피해 배율") * (songs + 3) + T.v(U, "클라이맥스 피해 배율"), { kind: "ult", linkable: true });
        c.forced("감전");
      },
    },
    onEvent: (c, e) => {
      const s = me(c);
      if (s.refund && e.type === "battleCast" && e.by !== c.me && ["전기", "자연"].includes(c.members[e.by].kit.elem)) {
        s.refund = 0;
        c.spReturn(10);
      }
    },
  });

// ───────────────────────── 열기 ─────────────────────────

/** 레바테인: 녹아내린 불꽃 4스택 → 배틀 스킬 추가 공격 770% + 강제 연소 + 에너지 100. 재능: 강력한 일격 때 열기 부착 흡수 */
const laevatain: Factory = (T) => {
  const flame = (c: Ctx, n: number) => {
    const s = me(c);
    s.flame = Math.min(4, (s.flame ?? 0) + n);
    if (s.flame >= 4 && !c.modOn("불꽃의 심장"))
      c.mod("불꽃의 심장", { kind: "res", value: 20, elems: ["열기"], to: [c.me], dur: 20, text: "레바테인 재능: 열기 저항 20 무시" });
  };
  return base(T, 1, {
    likes: ["열기 부착", "연소", "부식"],
    battle: {
      pri: (c) => (c.rt[c.me].modeUntil > c.t || (me(c).flame ?? 0) >= 3 ? 2.8 : 2),
      cast: (c) => {
        const mode = c.rt[c.me].modeUntil > c.t;
        if (mode) c.hit(T.v(B, "궁극기 사용 중 제1단계 배율") + T.v(B, "궁극기 사용 중 제2단계 배율"), { kind: "battle", linkable: true });
        else c.hit(T.v(B, "초기 폭발 피해 배율") + T.v(B, "단계별 지속 피해 배율") * 4, { kind: "battle", linkable: true }); // 지속 4단계 (스킬 데이터 count 4)
        flame(c, 1);
        const s = me(c);
        if ((s.flame ?? 0) >= 4) {
          s.flame = 0;
          c.hit(mode ? T.v(B, "궁극기 사용 중 추가 공격 배율") : T.v(B, "추가 피해 배율"), { kind: "battle" });
          c.forced("연소", 1, T.v(B, "연소 시간(초)"));
          c.energy(T.v(B, "추가 공격으로 획득하는 궁극기 에너지"));
        }
      },
    },
    combo: {
      state: (c) => c.has("연소") > 0 || c.has("부식") > 0,
      needs: ["연소", "부식"],
      energy: 25,
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        flame(c, 1);
      },
    },
    ult: {
      mode: { dur: T.v(U, "지속 시간(초)"), chain: T.v(U, /강화 일반 공격 제1단계/) + T.v(U, /강화 일반 공격 제2단계/) + T.v(U, /강화 일반 공격 제3단계/) + T.v(U, /강화 일반 공격 제4단계/), every: 4, fsSp: 22 },
      cast: () => {},
    },
    onFinalStrike: (c, ctl) => {
      // 강화 3단계 일반 공격이 열기 부착 (궁극기 중 레바테인이 조작)
      if (ctl === c.me && c.rt[c.me].modeUntil > c.t) c.infl1("열기");
      // 재능 불꽃의 심장: 메인 컨트롤 강력한 일격 후 열기 부착 흡수 → 1스택당 녹아내린 불꽃 1
      const n = c.consumeInfl(["열기"]);
      if (n) flame(c, n);
    },
  });
};

/** 울프가드: 배틀 = 연소/감전 소모 시 850% (+SP 10 반환) / 연계(아츠 부착 적) = 열기 부착 / 궁극기 = 강제 연소 */
const wulfgard: Factory = (T) =>
  base(T, 0.5, {
    likes: ["아츠 부착", "연소", "감전"],
    battle: {
      pri: (c) => (c.has("연소") || (c.has("감전") && !c.othersNeed("감전")) ? 2.8 : 1),
      makes: ["열기 부착"],
      wants: ["연소", "감전"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        const L = c.consumeReaction("연소") || (c.othersNeed("감전") ? 0 : c.consumeReaction("감전"));
        if (L) {
          c.hit(T.v(B, "추가 피해 배율"), { kind: "battle" });
          c.spReturn(10); // 재능 절제의 원칙
        } else c.infl1("열기");
      },
    },
    combo: {
      on: (c, e) => e.type === "inflApplied",
      state: (c) => !!c.inflNow().elem,
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.infl1("열기");
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "단계별 피해 배율") * 5, { kind: "ult", linkable: true });
        c.forced("연소");
      },
    },
    onEvent: (c, e) => {
      // 재능 불타는 송곳니: 연소 부여 후 10초 열기 피해 +30%
      if (e.type === "reactionApplied" && e.reaction === "연소" && e.by === c.me)
        c.mod("불타는 송곳니", { kind: "dmg", value: 0.3, elems: ["열기"], to: [c.me], dur: 10, text: "울프가드 재능: 열기 피해" });
    },
  });

/** 아케쿠리: 배틀 = 열기 부착 / 연계(불균형·불균형 지점) = SP 회복 / 궁극기 = SP 80 + 연타 */
const akekuri: Factory = (T) =>
  base(T, 0.2, {
    battle: {
      pri: () => 1,
      makes: ["열기 부착"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.infl1("열기");
      },
    },
    combo: {
      on: (c, e) => e.type === "staggerNode" || e.type === "stagger",
      cast: (c) => {
        c.hit(T.v(C, "단계별 피해 배율") * 2, { kind: "combo", elem: "물리" });
        const int = c.members[c.me].stats.attrs.지능;
        c.spRecover(T.v(C, "단계별 스킬 게이지 회복") * 2 * (1 + Math.min(0.75, (int / 10) * 0.015)));
      },
    },
    ult: {
      cast: (c) => {
        c.spRecover(T.v(U, "스킬 게이지 회복"));
        c.link(1); // 재능 몰입의 시간: 궁극기 중 연타 (TODO: 스택 수)
      },
    },
  });

/** 카뮤: 배틀 = 열기 부착 + 핏빛 날개(열기 취약 45초) / 연계(열기 부착 소모·흡수 후) = SP 20 + 연타 / 궁극기 → 추적(연계 취급, SP 무소모) */
const camille: Factory = (T) => {
  const talent = (c: Ctx) => {
    c.link(1); // 재능 죄를 쫓는 자: 날개가 배회하는 적 명중 시 연타
    const s = me(c);
    s.blood = Math.min(5, (s.blood ?? 0) + 2);
    c.mod("혈류 소생", { kind: "dmg", value: 0.04 * s.blood, elems: ["열기"], to: [c.me], dur: 40, text: "카뮤 재능: 열기 피해" });
    c.mod("혈류 소생(팀)", { kind: "dmg", value: 0.01 * s.blood, elems: ["열기"], to: c.members.map((_, i) => i).filter((i) => i !== c.me), dur: 40, text: "카뮤 재능: 팀 열기 피해(25%)" });
  };
  return base(T, 0.5, {
    battle: {
      costOf: (c) => (me(c).chase && me(c).chaseUntil! > c.t ? 0 : T.cost(B)),
      pri: (c) => (me(c).chase && me(c).chaseUntil! > c.t ? 3 : c.markOn("핏빛 날개") ? 1 : 3),
      makes: ["열기 부착"],
      cast: (c) => {
        const s = me(c);
        if (s.chase && s.chaseUntil! > c.t) {
          s.chase = 0;
          c.hit(T.v(C, "추적 피해 배율"), { kind: "combo" });
          c.spRecover(T.v(C, "추적 스킬 게이지 회복"));
          talent(c);
          return;
        }
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.infl1("열기");
        const d = T.v(B, "타오르는 핏빛 날개 지속 시간(초)");
        c.mark("핏빛 날개", d);
        c.mod("핏빛 날개", { kind: "susc", value: T.v(B, "열기 취약 효과"), elems: ["열기"], dur: d, text: "카뮤 핏빛 날개: 열기 취약" });
      },
    },
    combo: {
      on: (c, e) => e.type === "heatConsumed",
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        if (c.markOn("핏빛 날개")) {
          c.hit(T.v(B, "폭발 피해 배율"), { kind: "battle" });
          talent(c);
        }
        c.spRecover(T.v(C, "스킬 게이지 회복"));
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true });
        c.infl1("열기");
        c.spRecover(T.v(U, "스킬 게이지 회복"));
        me(c).chase = 1;
        me(c).chaseUntil = c.t + T.v(U, "추적 상태 지속 시간(초)");
      },
    },
  });
};

/** 엠버: 배틀 = 넘어뜨리기 / 연계(피격) = 넘어뜨리기 + 치유 / 궁극기 = 보호 */
const ember: Factory = (T) =>
  base(T, 0.3, {
    battle: {
      pri: () => 1,
      makes: ["방어 불능"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.phys("넘어뜨리기");
      },
    },
    combo: {
      on: (c, e) => e.type === "hitTaken",
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo", elem: "물리" });
        c.phys("넘어뜨리기");
      },
    },
    ult: { cast: (c) => void c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true }) },
  });

// ───────────────────────── 냉기 ─────────────────────────

/** 라스트 라이트: 배틀 = 조작 캐릭터 다음 강력한 일격에 환영(냉기 부착) / 연계(냉기 3스택+) = 스택당 240% / 본인 스킬로만 궁극기 에너지 */
const lastRite: Factory = (T) =>
  base(T, 1, {
    likes: ["냉기 부착"],
    battle: {
      pri: (c) => (c.markOn("저온 주입") ? 0.5 : 2),
      makes: ["냉기 부착"],
      cast: (c) => {
        c.spReturn(T.v(B, "스킬 게이지 반환"));
        c.energy(T.v(B, "궁극기 에너지 획득"));
        c.mark("저온 주입", T.v(B, "지속 시간(초)"));
      },
    },
    combo: {
      state: (c) => c.inflNow().elem === "냉기" && c.inflNow().stacks >= 3,
      needs: ["냉기 부착"],
      energy: 0,
      cast: (c) => {
        const n = c.consumeInfl(["냉기"]);
        c.hit(T.v(C, "얼음 가시 피해 비율") + T.v(C, "베기 기초 피해 배율") + T.v(C, "중첩된 부착 스택을 소모할 때마다 추가되는 피해 배율") * n, { kind: "combo" });
        c.energy(T.v(C, "기초로 획득하는 궁극기 에너지") + T.v(C, "중첩된 부착 스택을 소모할 때마다 추가로 획득하는 궁극기 에너지") * n);
        // 재능 저체온증: 소모 스택 × 4% 냉기 취약 15초
        c.mod("저체온증", { kind: "susc", value: 0.04 * n, elems: ["냉기"], dur: 15, text: "라스트 라이트 재능: 냉기 취약" });
      },
    },
    ult: {
      selfEnergyOnly: true,
      cast: (c) => {
        // 재능 저온 취성: 냉기 취약을 1.5배로 간주
        const v = c.modOn("저체온증")?.value ?? 0;
        c.hit(T.v(U, "제1단계 피해 배율") + T.v(U, "제2단계 피해 배율") + T.v(U, "제3단계 피해 배율"), { kind: "ult", linkable: true, scale: (1 + 1.5 * v) / (1 + v) });
      },
    },
    onFinalStrike: (c) => {
      if (!c.markOn("저온 주입")) return;
      c.unmark("저온 주입");
      c.hit(T.v(B, "환영 추격 피해 배율"), { kind: "battle" });
      c.infl1("냉기");
    },
  });

/** 이본: 배틀 = 냉기·자연 부착 전부 소모 → 강제 동결 + 스택당 200% + 에너지 / 연계(동결 적에 강력한 일격) / 궁극기 = 치명 누적 + 동결 추가타 */
const yvonne: Factory = (T) => {
  const cdb = (c: Ctx) => (c.has("동결") ? 0.4 : c.inflNow().elem === "냉기" ? 0.2 : 0); // 재능 빙점
  return base(T, 1, {
    likes: ["냉기 부착", "자연 부착"],
    battle: {
      // 냉기 부착을 다른 동료(라스트 라이트 연계 등)가 기다리면 빼앗지 않음
      pri: (c) => (c.inflNow().elem === "자연" || (c.inflNow().elem === "냉기" && !c.othersNeed("냉기 부착")) ? 2.8 : c.inflNow().elem ? 0.5 : 2),
      wants: ["냉기 부착", "자연 부착"],
      cast: (c) => {
        c.hit(T.v(B, "기초 피해 배율"), { kind: "battle", linkable: true, critDmgBonus: cdb(c) });
        const n = c.consumeInfl(["냉기", "자연"]);
        if (n) {
          c.forced("동결");
          c.hit(T.v(B, "동결을 부여할 때 피해 배율") + T.v(B, "중첩된 부착 스택을 소모할 때마다 추가되는 피해 배율") * n, { kind: "battle", critDmgBonus: cdb(c) });
          c.energy(T.v(B, "동결을 부여할 때 획득하는 궁극기 에너지") + T.v(B, "중첩된 부착 스택을 소모할 때마다 추가로 획득하는 궁극기 에너지") * n);
          me(c).fsBoost = 1;
        }
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike" && snapHas(e, "동결"),
      needs: ["동결"],
      energy: 20,
      cast: (c) => {
        c.hit(T.v(C, "에너지 피해 배율") * T.v(C, "에너지 사용 횟수") + T.v(C, "폭발 피해 배율"), { kind: "combo", critDmgBonus: cdb(c) });
        c.forced("동결");
      },
    },
    ult: {
      cast: (c) => {
        const hits = T.v(U, "지속 시간(초)") * 2; // TODO(실측): 강화 일반 공격 초당 2타
        const per = T.v(U, "1스택마다 증가하는 치명타 확률");
        const max = T.v(U, "최대 중첩 스택 수치") || 10;
        c.hit(T.v(U, "일반 공격 피해 배율") * hits, { kind: "ultMode", critRateBonus: (per * max) / 2, critDmgBonus: cdb(c) });
        const end = { kind: "ult" as const, linkable: true, critRateBonus: per * max, critDmgBonus: T.v(U, "최대 중첩 시 증가하는 치명타 피해") + cdb(c) };
        c.hit(T.v(U, "강력 공격 피해 배율"), end);
        if (c.has("동결")) {
          c.hit(T.v(U, "추가 공격 피해 배율"), end);
          c.consumeReaction("동결");
        }
      },
    },
    onFinalStrike: (c, ctl) => {
      // 재능 하이테크 버스트: 동결 후 다음 일반 공격이 바로 강력한 일격, 피해 +50%
      const s = me(c);
      if (ctl === c.me && s.fsBoost) {
        s.fsBoost = 0;
        c.hit(T.basic.chain * 0.3 * 0.5, { kind: "basic" });
      }
    },
  });
};

/** 알레쉬: 배틀 = 냉기 부착 전부 소모 → 강제 동결 + SP 15~45 / 연계(아츠 이상·오리지늄 결정 소모) / 궁극기 = 냉기 부착 + SP */
const alesh: Factory = (T) =>
  base(T, 0.3, {
    battle: {
      pri: (c) => (c.inflNow().elem === "냉기" ? (c.othersNeed("냉기 부착") ? 0.5 : 2) : 1),
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", elem: "물리", linkable: true });
        const n = c.consumeInfl(["냉기"]);
        if (n) {
          c.forced("동결");
          c.spRecover(T.v(B, `부착 ${Math.min(4, n)}스택 소모 시 회복하는 스킬 게이지`));
          c.energy(12); // 재능 급속 냉동 보존 기술 (4 + 본인 동결 8)
        }
      },
    },
    combo: {
      on: (c, e) => e.type === "reactionConsumed" || e.type === "crystalConsumed",
      cast: (c) => {
        const int = c.members[c.me].stats.attrs.지능;
        const p = Math.min(1, T.v(C, "진귀한 린수를 낚을 확률") + Math.min(0.3, (int / 10) * 0.005));
        c.hit(T.v(C, "피해 배율") / 100 + p * (T.v(C, "강화 피해 배율") - T.v(C, "피해 배율") / 100), { kind: "combo", elem: "물리" });
        c.spRecover(T.v(C, "스킬 게이지 회복") + p * T.v(C, "추가로 회복하는 스킬 게이지"));
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "궁극기 피해 배율"), { kind: "ult", linkable: true });
        c.infl1("냉기");
        c.spRecover(T.v(U, "기초 상태에서 회복하는 스킬 게이지"));
      },
    },
  });

/** 자이히: 배틀 = 지원 결정체(조작 캐릭터 강력한 일격 2회 → 아츠 증폭) / 연계(결정체 소진) = 냉기 부착 / 궁극기 = 냉기·자연 증폭 */
const xaihi: Factory = (T) =>
  base(T, 0.2, {
    battle: {
      pri: (c) => ((me(c).heals ?? 0) > 0 && c.markOn("지원 결정체") ? 0 : c.modOn("디도스") ? 1 : 3),
      cast: (c) => {
        c.mark("지원 결정체", T.v(B, "지원 결정체 지속 시간(초)"));
        me(c).heals = 2;
      },
    },
    combo: {
      state: (c) => me(c).spent === 1,
      cast: (c) => {
        me(c).spent = 0;
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.infl1("냉기");
        // 재능 가동 프로세스: 냉기 부착·동결 적이면 받는 냉기 피해 +10% 5초
        if (c.inflNow().elem === "냉기" || c.has("동결")) c.mod("가동 프로세스", { kind: "taken", value: 0.1, elems: ["냉기"], dur: 5, text: "자이히 재능: 받는 냉기 피해" });
      },
    },
    ult: {
      cast: (c) => {
        const int = c.members[c.me].stats.attrs.지능;
        c.mod("스택 오버플로", {
          kind: "amp",
          value: T.v(U, "기초 냉기 증폭 효과") + Math.min(T.v(U, "지능 증가 증폭 최대치"), int * T.v(U, "지능 1포인트마다 증가하는 증폭 효과")),
          elems: ["냉기", "자연"],
          dur: T.v(U, "지속 시간(초)"),
          text: "자이히 궁극기: 냉기·자연 증폭",
        });
      },
    },
    onFinalStrike: (c, ctl) => {
      const s = me(c);
      if (!c.markOn("지원 결정체") || !(s.heals ?? 0)) return;
      s.heals!--;
      // 생명력 가득일 때 아츠 증폭 (TODO: 생명력 가득 가정)
      c.mod("디도스", { kind: "amp", value: T.v(B, "아츠 증폭 효과"), elems: ["아츠"], to: [ctl], dur: T.v(B, "아츠 증폭 지속 시간(초)"), text: "자이히 지원 결정체: 아츠 증폭(조작 캐릭터)" });
      if (s.heals === 0) s.spent = 1;
    },
  });

/** 탕탕: 연계(냉기 부착·아츠 폭발) = 와류 / 배틀 = 와류 소모해 용오름 추가 + SP 반환 + 아츠 취약 */
const tangtang: Factory = (T) => {
  // (likes 없음 — 연계는 냉기 부착 "부여" 이벤트로 열림)
  const spouts = (c: Ctx, n: number, scale = 1) => {
    c.hit(T.v(B, "단일 용오름 피해 배율") * n * scale, { kind: "battle" });
    c.infl1("냉기"); // 여러 개여도 부착은 1번
    if (n >= 2) c.mod("용오름", { kind: "susc", value: n >= 3 ? T.v(B, "용오름 3개일 시 부여하는 아츠 취약") : T.v(B, "용오름 2개일 시 부여하는 아츠 취약"), elems: ["아츠"], dur: T.v(B, "아츠 취약 지속 시간(초)"), text: "탕탕 용오름: 아츠 취약" });
  };
  return base(T, 0.8, {
    
    battle: {
      pri: (c) => ((me(c).vortex ?? 0) >= 2 ? 2.8 : 2),
      makes: ["냉기 부착"],
      cast: (c) => {
        const s = me(c);
        const v = s.vortex ?? 0;
        s.vortex = 0;
        c.hit(T.v(B, "사격 피해 배율"), { kind: "battle", linkable: true });
        c.spReturn(T.v(B, "와류마다 스킬 게이지 반환") * v);
        spouts(c, 1 + v);
      },
    },
    combo: {
      on: (c, e) => (e.type === "inflApplied" && e.elem === "냉기") || e.type === "artsBurst",
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        me(c).vortex = Math.min(2, (me(c).vortex ?? 0) + 1);
      },
    },
    ult: {
      cast: (c) => {
        // 메인 컨트롤이 고대의 진 안에서 낙하 공격 → 일찍 일으킨 파도 + 재능 풍랑의 주재자(용오름 +60%)
        c.hit(T.v(U, "지속 피해 총 배율") + T.v(U, "일찍 일으킨 거대한 파도의 피해 배율"), { kind: "ult", linkable: true });
        const s = me(c);
        const v = s.vortex ?? 0;
        s.vortex = 0;
        spouts(c, 1 + v, 1.6);
      },
    },
  });
};

/** 에스텔라: 배틀 = 냉기 부착 / 연계(동결) = 강제 띄우기(쇄빙) + 물리 취약 / 궁극기 */
const estella: Factory = (T) =>
  base(T, 0.3, {
    likes: ["동결"],
    battle: {
      pri: () => 1,
      makes: ["냉기 부착"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.infl1("냉기");
      },
    },
    combo: {
      state: (c) => c.has("동결") > 0,
      needs: ["동결"],
      cast: (c) => {
        const frozen = c.has("동결") > 0;
        c.hit(frozen ? T.v(C, "동결 상태의 적에 대한 피해 배율") : T.v(C, "동결 상태가 아닌 적에 대한 피해 배율"), { kind: "combo", elem: "물리" });
        c.phys("띄우기", { forced: true });
        if (frozen) {
          c.mod("디스토션", { kind: "susc", value: T.v(C, "물리 취약 배율"), elems: ["물리"], dur: 6, text: "에스텔라 연계: 물리 취약" });
          c.mark("물리 취약", 6);
        }
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", elem: "물리", linkable: true });
        if (c.markOn("물리 취약")) c.phys("띄우기", { forced: true });
      },
    },
  });

/** 스노우샤인: 배틀 = 비호 + SP 30 반환, 막으면 반격(냉기 부착) / 궁극기 = 강제 동결 */
const snowshine: Factory = (T) =>
  base(T, 0.1, {
    battle: {
      pri: () => 1,
      cast: (c) => {
        c.spReturn(T.v(B, "스킬 게이지 반환"));
        // TODO(실측): 방패 중 피격 확률 — 피격 주기(10초) 대비 방패 3초 ≈ 0.5로 가정
        c.hit(T.v(B, "피해 배율") * 0.5, { kind: "battle" });
        if (c.t % 2 < 1) c.infl1("냉기");
      },
    },
    combo: { on: (c, e) => e.type === "lowHp", cast: () => {} },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "폭발 피해 배율") + T.v(U, "지속 피해 배율") * (T.v(U, "지속 시간(초)") / (T.v(U, "지속 피해 간격(초)") || 0.5)), { kind: "ult", linkable: true });
        c.forced("동결");
      },
    },
  });

// ───────────────────────── 자연 ─────────────────────────

/** 질베르타: 배틀 = 자연 부착 / 연계(아츠 이상 부여) = 강제 띄우기 / 궁극기 = 아츠 취약 30% + 방어 불능 스택당 */
const gilberta: Factory = (T) =>
  base(T, 0.3, {
    // 재능 전달자의 노래: 팀 내 가드·캐스터·서포터의 궁극기 충전 효율 +4% (직업군 조건)
    init: (c) => {
      c.members.forEach((m, i) => {
        if (m.cls && ["가드", "캐스터", "서포터"].includes(m.cls)) c.rt[i].s.ultGainAdd = (c.rt[i].s.ultGainAdd ?? 0) + 0.04;
      });
    },
    battle: {
      pri: () => 1,
      makes: ["자연 부착"],
      cast: (c) => {
        c.hit(T.v(B, "인력 피해 배율") + T.v(B, "폭발 피해 배율"), { kind: "battle", linkable: true });
        c.infl1("자연");
      },
    },
    combo: {
      on: (c, e) => e.type === "reactionApplied",
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.phys("띄우기", { forced: true });
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true });
        c.infl1("자연");
        c.mod("중력장", {
          kind: "susc",
          value: T.v(U, "기초 아츠 취약 효과") + T.v(U, "방어 불능이 중첩될 때마다 증가하는 아츠 취약 효과") * c.vulnNow(),
          elems: ["아츠"],
          dur: T.v(U, "중력장 지속 시간(초)"),
          text: "질베르타 궁극기: 아츠 취약",
        });
      },
    },
  });

/** 아델리아: 연계(방어 불능·아츠 부착 없는 적에 강력한 일격) = 강제 부식 / 배틀 = 부식 소모 → 물리·아츠 취약 20% 30초 */
const ardelia: Factory = (T) =>
  base(T, 0.3, {
    likes: ["부식"],
    battle: {
      pri: (c) => (c.has("부식") && !c.modOn("질주하는 돌리") ? 3 : c.has("부식") ? 1.5 : 0.5),
      wants: ["부식"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        if (c.consumeReaction("부식"))
          c.mod("질주하는 돌리", { kind: "susc", value: T.v(B, "취약 효과"), elems: ["물리", "아츠"], dur: T.v(B, "취약 지속 시간(초)"), text: "아델리아 배틀: 물리·아츠 취약" });
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike" && !!e.snap && e.snap.vuln === 0 && !e.snap.infl,
      cast: (c) => {
        c.hit(T.v(C, "피해 배율") + T.v(C, "폭발 피해 배율"), { kind: "combo" });
        c.forced("부식", 1, T.v(C, "부식 지속 시간(초)"));
      },
    },
    ult: {
      cast: (c) => void c.hit(T.v(U, "피해 배율") * (T.v(U, "지속 시간(초)") / 0.3), { kind: "ult", linkable: true }),
    },
  });

/** 플루라이트: 배틀 = 자연 부착 / 연계(냉기·자연 2스택+) = 같은 부착 추가 / 궁극기 */
const fluorite: Factory = (T) =>
  base(T, 0.3, {
    battle: {
      pri: () => 1,
      makes: ["자연 부착"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true, dmgBonus: 0.2 });
        c.infl1("자연");
      },
    },
    combo: {
      state: (c) => (c.inflNow().elem === "냉기" || c.inflNow().elem === "자연") && c.inflNow().stacks >= 2,
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo", dmgBonus: 0.2 });
        const e = c.inflNow().elem;
        if (e) c.infl1(e);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "제1단계 피해 배율") * 4, { kind: "ult", linkable: true, dmgBonus: 0.2 });
        const i = c.inflNow();
        if ((i.elem === "냉기" || i.elem === "자연") && i.stacks >= 2) c.infl1(i.elem);
      },
    },
  });

/** 결: 지능 ≥ 의지면 진결·지혜(배틀 500%, 궁극기 강제 부식 + 깨달음 1440%), 아니면 진결·의지(부착 재부여·취약) */
const arcane: Factory = (T) => {
  const F = { INT: "진결 · 지혜", WILL: "진결 · 의지" };
  const isInt = (c: Ctx) => {
    const m = c.members[c.me];
    return m.form ? m.form === F.INT : m.stats.attrs.지능 >= m.stats.attrs.의지;
  };
  return base(T, 1, {
    likes: ["자연 부착"],
    forms: ["진결 · 지혜", "진결 · 의지"],
    battle: {
      pri: (c) => (c.markOn("구속") ? 2.8 : 2),
      makes: ["자연 부착"],
      cast: (c) => {
        const int = isInt(c);
        c.hit(T.v(B, "피해 배율", int ? F.INT : F.WILL), { kind: "battle", linkable: true });
        c.infl1("자연");
        if (int && c.markOn("구속")) {
          c.unmark("구속");
          c.spReturn(T.v(C, "스킬 게이지 반환", F.INT));
          c.mod("응룡", { kind: "susc", value: T.v(C, "취약 효과", F.INT), elems: ["자연", "냉기"], dur: T.v(C, "추가 취약 지속 시간(초)", F.INT), text: "결 연계: 자연·냉기 취약" });
          c.hit(T.v(C, "폭발 피해 배율", F.INT) + T.v(C, "추가 피해 배율", F.INT), { kind: "combo" });
        }
      },
    },
    combo: {
      state: (c) => {
        const i = c.inflNow();
        return isInt(c) ? i.elem === "자연" || i.stacks >= 2 : !!i.elem;
      },
      cast: (c) => {
        const int = isInt(c);
        const f = int ? F.INT : F.WILL;
        c.hit(T.v(C, "기초 피해 배율", f), { kind: "combo" });
        if (int) {
          c.mark("구속", T.v(C, "구속 및 취약 지속 시간(초)", f));
          c.mod("응룡", { kind: "susc", value: T.v(C, "취약 효과", f), elems: ["자연", "냉기"], dur: T.v(C, "구속 및 취약 지속 시간(초)", f), text: "결 연계: 자연·냉기 취약" });
        } else {
          const will = c.members[c.me].stats.attrs.의지;
          const i = c.inflNow();
          if (i.elem) c.infl1(i.elem);
          c.mod("응룡", { kind: "susc", value: T.v(C, "기초 취약 효과", f) + Math.min(T.v(C, "의지가 제공하는 최대 추가 취약 효과", f), will * 0.000125), elems: ["자연", "냉기"], dur: T.v(C, "구속 및 취약 지속 시간(초)", f), text: "결 연계: 자연·냉기 취약" });
          c.hit(T.v(C, "폭발 피해 배율", f), { kind: "combo" });
        }
      },
    },
    ult: {
      cast: (c) => {
        const int = isInt(c);
        const f = int ? F.INT : F.WILL;
        const s = me(c);
        if (s.enlight) {
          // 2단계 어스름 파훼의 깨달음
          s.enlight = 0;
          c.hit(T.v(U, "어스름 파훼의 깨달음 피해 배율", f), { kind: "ult", linkable: true });
          if (!int) c.mod("전략 수립", { kind: "susc", value: Math.min(0.128, c.members[c.me].stats.attrs.의지 * 0.0002), elems: ["자연", "냉기"], dur: 10, text: "결 재능: 자연·냉기 취약" });
          return;
        }
        c.hit(T.v(U, "생성한 어스름 파훼의 진 피해 배율", f), { kind: "ult", linkable: true });
        const d = T.v(U, "어스름 파훼의 진 지속 시간(초)", f);
        c.mark("어스름 파훼의 진", d);
        s.focus = 2;
        if (int) {
          // 재능 무장 강화: 부식 지속 +10초, 최대 저항 감소 1.1배 / 전략 수립: 궁극기 중 아츠 증폭 24%
          c.mark(`부식연장:${c.me}`, 1, 10);
          c.mark(`부식배율원:${c.me}`, 1);
          c.forced("부식", 1, T.v(U, "강제 부식 지속 시간(초)", f) + 10);
          c.mod("전략 수립", { kind: "amp", value: 0.24, elems: ["아츠"], to: [c.me], dur: d, text: "결 재능: 아츠 증폭" });
        } else {
          const i = c.inflNow();
          if (i.elem) c.infl1(i.elem);
          c.mod("전략 수립", { kind: "susc", value: Math.min(0.128, c.members[c.me].stats.attrs.의지 * 0.0002), elems: ["자연", "냉기"], dur: 10, text: "결 재능: 자연·냉기 취약" });
        }
      },
    },
    onFinalStrike: (c) => {
      const s = me(c);
      if (!c.markOn("어스름 파훼의 진") || !(s.focus ?? 0)) return;
      s.focus!--;
      const int = isInt(c);
      c.hit(T.v(U, "집중 공격 총피해 배율", int ? F.INT : F.WILL), { kind: "ult" });
      if (s.focus === 0) s.enlight = 1;
    },
  });
};

/** 티프로스: 자연 부착 1스택 소모 → 계시, 계시 8 → 연계로 사냥 화살, 화살 → 강제 자연 폭발(×1.3 ×1.6) */
const typhoeus: Factory = (T) => {
  const burstMult = T.v(B, "강력한 사격 자연 폭발 피해 배율") || 1.3;
  const shoot = (c: Ctx, consumed: boolean, arrow: boolean) => {
    // 강력한 사격: 자연 폭발 강제 1회 (160% ✅) × 자연 부착 소모 시 1.3 · 화살진 안 +10%
    // 재능 사냥감 청소 1.6배는 "사냥 화살을 소모하는 강화된 공격"만 — 조작 중 다섯 번째 공중 공격(화살 미소모)은 제외
    c.hit(1.6 * (consumed ? burstMult : 1) * (arrow ? 1.6 : 1) * (c.markOn("화살진") ? 1.1 : 1), { anomaly: true, elem: "자연" });
    c.emit({ type: "artsBurst", elem: "자연" });
  };
  const aerial = (c: Ctx, k: number, mult: number) => {
    const s = me(c);
    const consumed = c.takeInfl1("자연");
    if (consumed) {
      s.rev = Math.min(8, (s.rev ?? 0) + 1);
      c.energy(T.v(B, "추가 궁극기 에너지"));
    }
    c.hit(mult, { kind: "battle" });
    const fifthAsControl = k === 5 && c.isControl();
    if ((s.arrows ?? 0) > 0 || fifthAsControl) {
      if (!fifthAsControl) s.arrows!--;
      shoot(c, consumed, !fifthAsControl);
    }
  };
  return base(T, 1, {
    likes: ["자연 부착"],
    init: (c) => {
      me(c).rev = 4;
      me(c).arrows = 0;
    },
    battle: {
      pri: (c) => (c.inflNow().elem === "자연" || (me(c).arrows ?? 0) > 0 ? 2.8 : 2),
      cast: (c) => {
        c.hit(T.v(B, "점프 사격 피해 배율"), { kind: "battle", linkable: true });
        // 공중 일반 공격 5회. 도중에 계시가 최대가 되면 공중에서 연계 — "계시를 모두 사냥 화살로 전환하고, 공중 일반 공격 횟수를 초기화" ✅
        //   → 받은 화살로 공중 공격 5회를 이어서 (배틀 스킬 1회로 강력한 사격까지, 연계는 쿨타임마다 1회)
        let reset = false;
        for (let k = 1; k <= 5; k++) {
          aerial(c, k, k < 5 ? T.v(B, "공중 일반 공격 피해") : c.isControl() ? T.v(B, "공중 강력한 일격 피해") : T.v(B, "공중 일반 공격 피해"));
          if (!reset && (me(c).rev ?? 0) >= 8 && c.useCombo()) {
            reset = true;
            k = 0;
          }
        }
        if (c.isControl()) {
          // 다섯 번째 공중 공격 = 강력한 일격 ✅ — 공중 일반 공격 5회가 일반 공격 1세트를 대신하므로 일반 공격 주기를 처음부터 (강력한 일격 SP 중복 방지)
          c.spRecover(T.basic.fsSp || 23);
          c.emit({ type: "finalStrike", snap: { infl: c.inflNow().elem, stacks: c.inflNow().stacks, vuln: c.vulnNow(), reactions: [], marks: [] } });
          c.resetChain();
        }
      },
    },
    combo: {
      state: (c) => (me(c).rev ?? 0) >= 8,
      cast: (c) => {
        const s = me(c);
        s.arrows = Math.min(4, (s.arrows ?? 0) + Math.floor((s.rev ?? 0) / 2));
        s.rev = 0;
        c.hit(T.v(C, "'사냥꾼의 시선' 명중 피해"), { kind: "combo" });
        c.mark("화살진", 6);
        c.hit(T.v(C, "구역 지속 피해") * 3, { kind: "combo" }); // 스킬 데이터 count 3
      },
    },
    ult: {
      cast: (c) => {
        const s = me(c);
        c.hit(T.v(U, "강력한 화살 폭발 피해"), { kind: "ult", linkable: true });
        s.arrows = Math.min(4, (s.arrows ?? 0) + 2);
        // 공중 일반 공격 5회 = 화살비 (마지막 강화). 도중 계시 최대 → 공중 연계로 화살 전환 + 공중 공격 5회 추가
        let extra = 0;
        for (let k = 1; k <= 5; k++) {
          c.hit(k < 5 ? T.v(U, "일반 화살비 피해") : T.v(U, "강화된 화살비 피해"), { kind: "ult" });
          aerial(c, 0, 0);
          if (!extra && (me(c).rev ?? 0) >= 8 && c.useCombo()) extra = 5;
        }
        for (let k = 1; k <= extra; k++) aerial(c, 0, T.v(B, "공중 일반 공격 피해"));
      },
    },
    onEvent: (c, e) => {
      // 재능 사냥감 청소: 자연 폭발마다 계시 +1
      if (e.type === "artsBurst" && e.elem === "자연") me(c).rev = Math.min(8, (me(c).rev ?? 0) + 1);
    },
  });
};

/** 푸치나: 배틀 = 비호 + SP 반환 → 머리 박치기(자연 부착) / 연계(피격) / 궁극기 */
const purrchena: Factory = (T) =>
  base(T, 0.1, {
    battle: {
      pri: () => 1,
      makes: ["자연 부착"],
      cast: (c) => {
        c.spReturn(T.v(B, "스킬 게이지 반환") + T.v(B, "추가 스킬 게이지 반환"));
        c.hit(T.v(B, "머리 박치기 피해 배율"), { kind: "battle", elem: "자연" });
        c.infl1("자연");
      },
    },
    combo: {
      on: (c, e) => e.type === "hitTaken",
      cast: (c) => void c.hit((T.v(C, "폭탄: 피해 배율") + T.v(C, "제작 과제: 피해 배율")) / 3, { kind: "combo" }),
    },
    ult: {
      cast: (c) => void c.hit(((T.v(U, "폭탄: 피해 배율") + T.v(U, "제작 과제: 피해 배율")) / 2) * 3 + 0.2 * T.v(U, "홍보대사의 특수 선물: 피해 배율"), { kind: "ult", linkable: true }),
    },
  });

// ───────────────────────── 물리 ─────────────────────────

/** 관리자: 배틀 = 강타 / 연계(다른 오퍼레이터 연계 피해) = 오리지늄 결정 → 물리 이상·방어 불능 부여 시 결정 파괴 400% */
const endmin: Factory = (T) => {
  const crystal = (c: Ctx) => {
    if (!c.markOn("오리지늄 결정")) return;
    c.unmark("오리지늄 결정");
    c.hit(T.v(C, "결정 파괴 피해 배율"), { kind: "combo", dmgBonus: 0.2 });
    c.mod("본질 붕괴", { kind: "atk", value: 0.3, to: [c.me], dur: 15, text: "관리자 재능: 공격력" });
    c.emit({ type: "crystalConsumed" });
  };
  const bonus = (c: Ctx) => (c.markOn("오리지늄 결정") ? 0.2 : 0); // 재능 현실 정지
  return base(T, 1, {
    likes: ["방어 불능"],
    battle: {
      pri: () => 2,
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true, dmgBonus: bonus(c) });
        c.phys("강타");
      },
    },
    combo: {
      on: (c, e) => e.type === "comboHit" && e.by !== c.me,
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.mark("오리지늄 결정", 15); // TODO(실측): 결정 유지 시간
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true, dmgBonus: bonus(c) });
        if (c.markOn("오리지늄 결정")) {
          c.unmark("오리지늄 결정");
          c.hit(T.v(U, "추가 피해 배율"), { kind: "ult", dmgBonus: 0.2 });
          c.emit({ type: "crystalConsumed" });
        }
      },
    },
    onEvent: (c, e) => {
      if (e.type === "physAnomaly" || e.type === "vulnAdded") crystal(c);
    },
  });
};

/** 진천우: 배틀 = 띄우기 / 연계(방어 불능) = 띄우기 / 궁극기 */
const chen: Factory = (T) => {
  const blade = (c: Ctx, hits: number) => {
    const s = me(c);
    s.blade = Math.min(5, (s.bladeUntil ?? 0) > c.t ? (s.blade ?? 0) + hits : hits);
    s.bladeUntil = c.t + 10;
    c.mod("칼날 베기", { kind: "atk", value: 0.08 * s.blade, to: [c.me], dur: 10, text: "진천우 재능: 공격력" });
  };
  return base(T, 0.5, {
    battle: {
      pri: () => 1.5,
      makes: ["방어 불능"],
      cast: (c) => {
        blade(c, 1);
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.phys("띄우기");
      },
    },
    combo: {
      state: (c) => c.vulnNow() > 0,
      needs: ["방어 불능"],
      cast: (c) => {
        blade(c, 1);
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.phys("띄우기");
      },
    },
    ult: {
      cast: (c) => {
        blade(c, 5);
        c.hit(T.v(U, "베기 피해 배율") * 6 + T.v(U, "마지막 공격 피해 배율"), { kind: "ult", linkable: true });
      },
    },
  });
};

/** 여풍: 배틀 = 넘어뜨리기 + (방어 불능 없으면) 물리 취약 / 연계(물리 취약·갑옷 파괴 적에 강력한 일격) = 연타 / 궁극기 = 연타 소모 600% */
const lifeng: Factory = (T) => {
  const knock = (c: Ctx) => {
    c.phys("넘어뜨리기");
    c.hit(1, { kind: "battle", elem: "물리" }); // 재능 복마: 넘어뜨리기마다 공격력 100%
  };
  return base(T, 0.5, {
    likes: ["물리 취약"],
    battle: {
      pri: (c) => (c.markOn("물리 취약") ? 1 : 1.5),
      makes: ["방어 불능", "물리 취약"],
      cast: (c) => {
        c.hit(T.v(B, "제1단계 피해 배율") + T.v(B, "제2단계 피해 배율") + T.v(B, "제3단계 피해 배율"), { kind: "battle", linkable: true });
        if (c.vulnNow() === 0) {
          const d = T.v(B, "물리 취약 지속 시간(초)");
          c.mod("신체 정화", { kind: "susc", value: T.v(B, "물리 취약 효과"), elems: ["물리"], dur: d, text: "여풍 배틀: 물리 취약" });
          c.mark("물리 취약", d);
        }
        knock(c);
      },
    },
    combo: {
      on: (c, e) => e.type === "finalStrike" && (!!e.snap?.marks.includes("물리 취약") || !!c.breach && c.breach.until > c.t),
      needs: ["물리 취약"],
      cast: (c) => {
        c.hit(T.v(C, "제1단계 피해 배율") + T.v(C, "제2단계 피해 배율"), { kind: "combo" });
        c.link(1);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "제1단계 피해 배율"), { kind: "ult" });
        knock(c);
        c.hit(T.v(U, "제2단계 피해 배율"), { kind: "ult" });
        knock(c);
        if (c.takeLink() > 0) c.hit(T.v(U, "추가 피해 배율"), { kind: "ult" });
      },
    },
  });
};

/** 포그라니치니크: 배틀 = 갑옷 파괴 + 소모 스택 SP / 연계(강타·갑옷 파괴로 방어 불능 소모) / 궁극기 = 철의 서약(물리 이상마다 SP) / 재능 = SP 80마다 팀 공격력 */
const pogranichnik: Factory = (T) => {
  const recover = (c: Ctx, n: number) => {
    c.spRecover(n);
    const s = me(c);
    s.acc = (s.acc ?? 0) + n;
    while (s.acc >= 80) {
      s.acc -= 80;
      s.morale = ((s.morale ?? 0) + 1) % 3;
      c.mod(`사기 격양${s.morale}`, { kind: "atk", value: 0.08, dur: 20, text: "포그라니치니크 재능: 사기 격양(공격력)" });
    }
  };
  const oath = (c: Ctx) => {
    const s = me(c);
    if (!(s.oath ?? 0) || (s.oathUntil ?? 0) <= c.t) return;
    s.oath!--;
    if (s.oath === 0) {
      c.hit(T.v(U, "최후의 승부 피해 배율"), { kind: "ult" });
      recover(c, T.v(U, "최후의 승부 스킬 게이지 회복"));
    } else {
      c.hit(T.v(U, "교란 피해 배율"), { kind: "ult" });
      recover(c, T.v(U, "교란 스킬 게이지 회복"));
    }
  };
  return base(T, 0.5, {
    likes: ["방어 불능"],
    battle: {
      pri: (c) => (c.vulnNow() >= 3 ? 3 : c.vulnNow() >= 1 ? 1.5 : 1),
      wants: ["방어 불능"],
      cast: (c) => {
        c.hit(T.v(B, "제1단계 피해 배율") + T.v(B, "제2단계 피해 배율"), { kind: "battle", linkable: true });
        const v = c.vulnNow();
        c.phys("갑옷 파괴");
        if (v) recover(c, T.v(B, `방어 불능 ${Math.min(4, v)}스택 소모 시 회복하는 스킬 게이지`));
      },
    },
    combo: {
      on: (c, e) => {
        if (e.type === "vulnConsumed" && e.stacks! > 0) {
          me(c).lastV = e.stacks!;
          return true;
        }
        return false;
      },
      cast: (c) => {
        const v = Math.max(1, me(c).lastV ?? 1);
        const steps = Math.min(3, v);
        const mult = [T.v(C, "제1단계 피해 배율"), T.v(C, "제2단계 피해 배율"), v >= 4 ? T.v(C, "제3단계 피해 배율 강화") : T.v(C, "제3단계 피해 배율")];
        const sp = [T.v(C, "제1단계 스킬 게이지 회복"), T.v(C, "제2단계 스킬 게이지 회복"), v >= 4 ? T.v(C, "제3단계 스킬 게이지 회복 강화") : T.v(C, "제3단계 스킬 게이지 회복")];
        c.hit(mult.slice(0, steps).reduce((a, b) => a + b, 0), { kind: "combo" });
        recover(c, sp.slice(0, steps).reduce((a, b) => a + b, 0));
        oath(c);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "진군 피해 배율"), { kind: "ult", linkable: true });
        me(c).oath = 5;
        me(c).oathUntil = c.t + (T.v(U, "철의 서약 지속 시간") || 30);
      },
    },
    onEvent: (c, e) => {
      if (e.type === "physAnomaly") oath(c);
    },
  });
};

/** 판: 연계(방어 불능 4스택) = 강타 +20% / 재능 = 방어 불능 소모마다 물리 피해 +6% */
const daPan: Factory = (T) =>
  base(T, 1, {
    likes: ["방어 불능"],
    battle: {
      pri: () => 2,
      makes: ["방어 불능"],
      cast: (c) => {
        c.hit(T.v(B, "피해 배율"), { kind: "battle", linkable: true });
        c.phys("띄우기");
      },
    },
    combo: {
      state: (c) => c.vulnNow() >= 4,
      needs: ["방어 불능"],
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        c.phys("강타", { bonus: T.v(C, "추가로 증가하는 강타 피해") });
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "공중 연속 베기 피해 배율") * 6 + T.v(U, "궁극기 피해 배율"), { kind: "ult", linkable: true });
        c.phys("띄우기", { forced: true });
        c.phys("넘어뜨리기", { forced: true });
      },
    },
    onEvent: (c, e) => {
      if (e.type !== "vulnConsumed" || !e.stacks) return;
      const s = me(c);
      s.starch = Math.min(4, ((s.starchUntil ?? 0) > c.t ? (s.starch ?? 0) : 0) + e.stacks);
      s.starchUntil = c.t + 10;
      c.mod("전분 풀기", { kind: "dmg", value: 0.06 * s.starch, elems: ["물리"], to: [c.me], dur: 10, text: "판 재능: 물리 피해" });
    },
  });

/** 미브: 단운(100, 반환 50) → 추형(50, 강타) → 방어 불능 3+ 소모 시 개천(50, 강타 피해 600%) / 연계(방어 불능 3+) */
const miFu: Factory = (T) => {
  const stage = (c: Ctx) => ((me(c).stageUntil ?? 0) > c.t ? (me(c).stage ?? 0) : 0);
  const setStage = (c: Ctx, st: number) => {
    me(c).stage = st;
    me(c).stageUntil = c.t + 8; // TODO(실측): 다음 초식 교체 유지 시간
  };
  return base(T, 1, {
    likes: ["방어 불능"],
    battle: {
      costOf: (c) => (stage(c) === 0 ? 100 : 50),
      // 추형은 방어 불능 3스택 이상일 때(→ 개천), 초식 유지 시간이 끝나 가면 그냥 사용
      pri: (c) => {
        const st = stage(c);
        if (st === 2) return 2.8;
        if (st === 1) return c.vulnNow() >= 3 || (me(c).stageUntil ?? 0) - c.t < 1.5 ? 2.8 : 0.5;
        return 2;
      },
      wants: ["방어 불능"],
      cast: (c) => {
        const st = stage(c);
        if (st === 0) {
          c.hit(T.v(B, "단운 피해 배율"), { kind: "battle", linkable: true });
          c.spReturn(50);
          setStage(c, 1);
        } else if (st === 1) {
          c.hit(T.v(B, "추형 피해 배율"), { kind: "battle", linkable: true });
          const v = c.vulnNow();
          c.phys("강타");
          setStage(c, v >= 3 ? 2 : 0);
        } else {
          // 개천: 강타 피해로 간주 · 재능 냉정 (물리 취약·불균형이면 1.2배)
          const calm = c.markOn("물리 취약") || stg(c) ? 1.2 : 1;
          c.hit(T.v(B, "개천 피해 배율") * calm, { anomaly: true, elem: "물리" });
          setStage(c, 0);
        }
      },
    },
    combo: {
      state: (c) => c.vulnNow() >= 3,
      needs: ["방어 불능"],
      cast: (c) => {
        c.hit(T.v(C, "피해 배율"), { kind: "combo" });
        const d = T.v(C, "물리 취약 지속 시간(초)");
        c.mod("후회 없는 주먹", { kind: "susc", value: T.v(C, "물리 취약 효과"), elems: ["물리"], dur: d, text: "미브 연계: 물리 취약" });
        c.mark("물리 취약", d);
        setStage(c, 1);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "피해 배율"), { kind: "ult", linkable: true });
        c.phys("띄우기", { forced: true });
        c.phys("넘어뜨리기", { forced: true });
        setStage(c, 1);
      },
    },
  });
};

/** 로시: 배틀 = 띄우기(방어 불능이면 늑대의 발톱: 받는 물리·열기 +12%, 초당 30%) / 연계(방어 불능 + 아츠 부착) = 부착 소모 스택당 180% + 치명 / 궁극기 = 열기 */
const rossi: Factory = (T) => {
  const claw = (c: Ctx) => {
    if (!c.markOn("늑대의 발톱")) return;
    // 재능 끓어오르는 피: 늑대의 발톱 적에 치명타 → 공격력 24% 열기 (연소면 1.5배) — 기대값 = 치명 확률
    const st = c.members[c.me].stats;
    const cr = Math.min(1, st.critRate + (c.modOn("그림자") ? 0.25 : 0));
    c.hit(0.24 * cr * (c.has("연소") ? 1.5 : 1), { kind: "battle", elem: "열기", dot: true });
  };
  return base(T, 1, {
    likes: ["방어 불능", "아츠 부착"],
    battle: {
      pri: () => 2,
      makes: ["방어 불능"],
      cast: (c) => {
        const had = c.vulnNow() > 0;
        c.hit(T.v(B, "제1단계 피해 배율") + T.v(B, "제2단계 피해 배율"), { kind: "battle", linkable: true });
        c.phys("띄우기");
        if (had) {
          // 울프팀의 진주 → 재능 절흔: 늑대의 발톱 25초
          c.mark("늑대의 발톱", 25);
          c.mod("늑대의 발톱", { kind: "taken", value: 0.12, elems: ["물리", "열기"], dur: 25, text: "로시 재능: 받는 물리·열기 피해" });
          c.mark(`dot:물리:${c.me}`, 25, 0.3);
        }
        claw(c);
      },
    },
    combo: {
      state: (c) => c.vulnNow() > 0 && !!c.inflNow().elem,
      needs: ["방어 불능", "아츠 부착"],
      cast: (c) => {
        c.mod("그림자", { kind: "critRate", value: 0.25, to: [c.me], dur: 15, text: "로시 연계: 치명타 확률" });
        c.mod("그림자 피해", { kind: "critDmg", value: 0.5, to: [c.me], dur: 15, text: "로시 연계: 치명타 피해" });
        c.hit(T.v(C, "제1단계 피해 배율"), { kind: "combo" });
        const n = c.consumeInfl();
        c.hit(T.v(C, "제2단계 피해 배율") + T.v(C, "중첩된 부착 스택을 소모할 때마다 추가되는 피해 배율") * n, { kind: "combo" });
        c.phys("띄우기");
        c.addVuln(1);
        claw(c);
      },
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "찌르기 총피해 배율") + T.v(U, "제1단 베기 피해 배율") + T.v(U, "제2단 베기 피해 배율"), { kind: "ult", elem: "열기", linkable: true, critDmgBonus: T.v(U, "치명타 피해 증가") });
        c.infl1("열기");
        claw(c);
      },
    },
  });
};

/** 카치르: 배틀 = 비호 + SP 30 반환(막으면 방어 불능) / 궁극기 = 넘어뜨리기 */
const catcher: Factory = (T) =>
  base(T, 0.1, {
    battle: {
      pri: () => 1,
      cast: (c) => {
        c.spReturn(T.v(B, "스킬 게이지 반환"));
        c.hit(T.v(B, "피해 배율") * 0.5, { kind: "battle" }); // TODO: 방패 중 피격 확률 0.5
        c.addVuln(1);
      },
    },
    combo: {
      on: (c, e) => e.type === "lowHp",
      cast: (c) => void c.hit(T.v(C, "제1단계 피해 배율") + T.v(C, "제2단계 피해 배율"), { kind: "combo" }),
    },
    ult: {
      cast: (c) => {
        c.hit(T.v(U, "제1단계 피해 배율") + T.v(U, "제2단계 피해 배율") + T.v(U, "제3단계 피해 배율") + 3 * 0.45, { kind: "ult", linkable: true });
        c.phys("넘어뜨리기");
      },
    },
  });

/** 캐릭터 id(charId 접미) → 동작 */
export const KIT_FACTORIES: Record<string, Factory> = {
  "1": perlica,
  "2": endmin,
  "3": endmin,
  "4": chen,
  "5": akekuri,
  "6": wulfgard,
  "7": arclight,
  "8": daPan,
  "9": gilberta,
  "10": avywenna,
  "11": laevatain,
  "12": lifeng,
  "13": xaihi,
  "14": yvonne,
  "15": ember,
  "16": snowshine,
  "17": lastRite,
  "18": alesh,
  "19": ardelia,
  "20": pogranichnik,
  "21": estella,
  "22": antal,
  "23": catcher,
  "24": fluorite,
  "25": tangtang,
  "615": rossi,
  "838": zhuang,
  "995": miFu,
  "996": camille,
  "1040": arcane,
  "1041": liino,
  "1173": typhoeus,
  "1174": purrchena,
};

export function buildKit(T: KitTable): Kit | undefined {
  return KIT_FACTORIES[T.id]?.(T);
}

export { ARTS };
