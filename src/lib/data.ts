// /data/*.json 을 타입과 함께 노출하는 단일 진입점
import statsJson from "@data/essence-stats.json";
import regionsJson from "@data/essence-regions.json";
import weaponsJson from "@data/weapons.json";
import weaponImagesJson from "@data/weapon-images.json";
import operatorsJson from "@data/operators.json";
import operatorImagesJson from "@data/operator-images.json";
import operatorProfilesJson from "@data/operator-profiles.json";
import operatorStatsJson from "@data/operator-stats.json";
import operatorDetailsJson from "@data/operator-details.json";
import combatCharactersJson from "@data/combat/characters.json";
import combatWeaponsJson from "@data/combat/weapons.json";
import gearJson from "@data/combat/gear.json";
import gearImagesJson from "@data/gear-images.json";
import type { CombatWeapon, GearPiece, GearSuit } from "@/types/build";
import { addBag, rates, score, synergy, talentBag, gearBag, suitBag, SP_REGEN_INTERVAL, BASIC_CHAIN_SECONDS, type GearRank, type OperatorBase, type StatBag, type Rotation, type Synergy } from "@/lib/calc/build";
import { splitTerms } from "@/lib/glossary";
import type { Blackboard, CombatCharacter, SkillForm, SkillGroup } from "@/types/combat";
import { optimizeParty, receiveTeamLines, lineKey, weaponLineKey, type KeyedLine, type PartyCandidate, type PartyMember, type PartyWeapon } from "@/lib/calc/party";
import { memberStats, simulateBest, SIM, type Elem, type Kit, type SimMember, type SimResult } from "@/lib/calc/teamsim";
import { buildKit as buildKitSim, type KitTable } from "@/lib/calc/kits";
import { damageWeight, evaluateSuitEffect, GEAR_SEARCH, rankGearByValue, rankWeaponsByValue, ROLE_WEIGHT, STAGGER_UPTIME, type DealerRef, type OperatorKit, type RoleWeight, type TeamPool, type WeaponValueRank } from "@/lib/calc/weapon-value";
import { comboRequirement, rankTeams, type ComboRequirement, type TeamCandidate, type TeamEval } from "@/lib/calc/team";
import type { AttrName, EssenceRegion, EssenceStats, Operator, OperatorDetails, OperatorProfile, OperatorStats, Weapon } from "@/types/game";
import { buildWeaponUsers } from "@/lib/weapon-users";

export const essenceStats: EssenceStats = statsJson;
export const essenceRegions: EssenceRegion[] = regionsJson.regions;
export const essenceRegionsMeta = regionsJson._meta;
const media = weaponImagesJson as {
  images: Record<string, string>;
  videos?: Record<string, string>;
  posters?: Record<string, string>;
};
export const weapons: Weapon[] = (weaponsJson.weapons as Weapon[]).map((w) => ({
  ...w,
  image: media.images[w.id],
  video: media.videos?.[w.id],
  poster: media.posters?.[w.id],
}));
const opImages = operatorImagesJson as { full: Record<string, string>; face: Record<string, string> };
const opProfiles = operatorProfilesJson.profiles as Record<string, OperatorProfile>;
const opStats = operatorStatsJson.stats as Record<string, OperatorStats>;
/** 능력치 막대 기준: 전체 오퍼레이터 레벨 90 힘·민첩·지능·의지 최댓값 */
export const attrScaleMax = Math.max(
  ...Object.values(operatorStatsJson.stats as Record<string, OperatorStats>).flatMap((s) => [s.str, s.agi, s.int, s.wil].map((a) => a[a.length - 1])),
);
const opDetails = operatorDetailsJson.operators as unknown as Record<string, OperatorDetails>;

export const operators: Operator[] = (operatorsJson.operators as Operator[]).map((o) => ({
  ...o,
  image: opImages.full[o.id],
  face: opImages.face[o.id],
  profile: opProfiles[o.id],
  stats: opStats[o.id],
  statMilestones: opDetails[o.id]?.stats,
}));

/** 무기 id → 그 무기를 추천받는 오퍼레이터 (위키 '게임 내 추천' 기준) */
export const weaponUsers = buildWeaponUsers(operators);

const combatChars = (combatCharactersJson as unknown as { characters: Record<string, CombatCharacter & Record<string, unknown>> }).characters;

/** 게임 데이터 기반 전투 정보(스킬 레벨별 수치·잠재·재능). 화면에 필요한 부분만 잘라서 돌려준다 */
export function getCombatCharacter(id: string): CombatCharacter | undefined {
  const c = combatChars[id];
  if (!c) return undefined;
  return {
    charId: c.charId,
    name: c.name,
    rarity: c.rarity,
    element: c.element,
    mainAttr: c.mainAttr,
    subAttr: c.subAttr,
    critRate: c.critRate,
    skillGroups: c.skillGroups.map((g) => withForms(id, g)),
    defaultForm: defaultForm(id),
    battleTags: (c as unknown as { battleTags?: { id: string; name: string }[] }).battleTags,
    formAttrs: opStats[id] && c.skillGroups.length && defaultForm(id) ? { 지능: Math.floor(opStats[id].int[89]), 의지: Math.floor(opStats[id].wil[89]) } : undefined,
    potentials: c.potentials,
    talents: { attributes: c.talents.attributes, passives: c.talents.passives },
  };
}

/**
 * 형태 스킬(결): 게임 데이터는 두 형태 수치가 한 스킬에 섞여 있어(atk_scale_wisd / atk_scale_will, 같은 라벨 두 번)
 * 화면에는 형태별로 나뉜 공식 위키 표를 쓴다. 설명이 없는 스킬도 위키 설명으로 채운다.
 */
function withForms(id: string, g: SkillGroup): SkillGroup {
  const wiki = opDetails[id]?.skills.filter((w) => w.type === g.type) ?? [];
  if (wiki.length < 2) return g.desc ? g : { ...g, desc: wiki[0]?.description ?? null };
  const forms: SkillForm[] = wiki.map((w) => {
    const [first, ...rest] = w.description.split("\n");
    const isCondition = /활성화/.test(first);
    return {
      name: w.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? w.name,
      condition: isCondition ? first : "",
      desc: (isCondition ? rest : [first, ...rest]).join("\n"),
      rows: w.params.map((p) => ({
        label: p.label,
        values: p.values ? p.values.map((v) => `${v}${p.unit ?? ""}`) : (p.raw ?? []),
      })),
    };
  });
  return { ...g, name: g.name?.replace(/\(.*\)\s*$/, "").trim() ?? null, forms };
}

/** 레벨 90 기본 능력치로 정한 기본 형태 (지능 ≥ 의지 → 지혜, 아니면 의지). 실제 형태는 무기·장비에 따라 달라짐 */
function defaultForm(id: string): string | undefined {
  const forms = opDetails[id]?.skills.filter((w) => w.type === "배틀 스킬") ?? [];
  if (forms.length < 2) return undefined;
  const s = opStats[id];
  if (!s) return undefined;
  return s.int[89] >= s.wil[89] ? "진결 · 지혜" : "진결 · 의지";
}

/** 스킬 형태 → 그 형태가 되는 능력치 조건 (결 재능 "전략 수립": 지능 ≥ 의지 → 진결 · 지혜, 의지 > 지능 → 진결 · 의지) */
const FORM_GATES: { form: string; condition: string; gate: (a: Record<AttrName, number>) => boolean }[] = [
  { form: "진결 · 지혜", condition: "지능 ≥ 의지", gate: (a) => a.지능 >= a.의지 },
  { form: "진결 · 의지", condition: "의지 > 지능", gate: (a) => a.의지 > a.지능 },
];
export interface FormBuild {
  form: string;
  condition: string;
  weaponId: string;
  weaponName: string;
  gear: GearRank[];
}

// ───────── 무기 · 장비 · 추천 빌드 ─────────
export const combatWeapons = (combatWeaponsJson as unknown as { weapons: Record<string, CombatWeapon> }).weapons;
export const gearPieces = (gearJson as unknown as { pieces: Record<string, GearPiece> }).pieces;
export const gearSuits = (gearJson as unknown as { suits: Record<string, GearSuit> }).suits;
/** 장비 아이콘 (scripts/build-gear-images.py 생성) — pieces: 장비 id → 경로, suits: 세트 id → 대표(방어구) 이미지 */
export const gearImages: { pieces: Record<string, string>; suits: Record<string, string> } = {
  pieces: gearImagesJson.pieces,
  suits: gearImagesJson.suits,
};

function operatorBase(id: string): OperatorBase | undefined {
  const c = combatChars[id];
  const s = opStats[id];
  if (!c || !s) return undefined;
  return {
    element: c.element,
    mainAttr: c.mainAttr,
    subAttr: c.subAttr,
    atk: s.atk[89],
    attrs: { 힘: s.str[89], 민첩: s.agi[89], 지능: s.int[89], 의지: s.wil[89] },
    critRate: c.critRate ?? 0.05,
    rotation: rotationOf(id),
  };
}

type RawLevel = { costValue: number; coolDown: number; bb: Record<string, number | string>; display?: { label: string; value: string }[] };
/**
 * 세부 스킬별 만렙 수치. 배틀·연계 스킬의 "궁극기 사용 중" 변형(레바테인 normal_skill_during_ult, 장방이 normal_skill_ult·combo_skill_ult)은
 * 평소 스킬과 배율 이름이 달라 함께 합치면 두 번 세어진다 → 제외 (TODO: 궁극기 지속 중 변형 피해를 궁극기 모드 피해로)
 */
const ULT_VARIANT = /(^|_)(during_)?ult$/;
const lastLevel = (id: string, type: string): RawLevel[] =>
  (combatChars[id]?.skillGroups.find((g) => g.type === type)?.skills ?? [])
    .filter((s) => type === "궁극기" || !ULT_VARIANT.test((s as unknown as { part?: string }).part ?? ""))
    .map((s) => s.levels.at(-1) as unknown as RawLevel)
    .filter(Boolean);

/**
 * 스킬 표의 "…궁극기 에너지" 항목 (본인 획득). base = 연계처럼 기본 획득량 항목이 있는 경우.
 * "N명의 적에게 명중할 때"는 1명 기준, "스택을 소모할 때마다 추가로"는 1스택 소모로 계산 — TODO(실측): 평균 소모 스택
 */
function energyOf(levels: RawLevel[], base: boolean): number | undefined {
  const ds = levels.flatMap((l) => l.display ?? []).filter((d) => /궁극기 에너지/.test(d.label) && !/[2-9]명|이상의 적/.test(d.label));
  if (!ds.length) return undefined;
  const v = (d: { value: string }) => parseFloat(d.value) || 0;
  const main = ds.filter((d) => !/추가로/.test(d.label) || !base);
  const extra = base ? ds.filter((d) => /추가로/.test(d.label)) : [];
  const total = main.reduce((s, d) => s + v(d), 0) + extra.reduce((s, d) => s + v(d), 0);
  return base && !main.length ? undefined : total;
}

/** 스킬 회전 (만렙 스킬 기준) — calc/build.ts Rotation 설명 참고 */
function rotationOf(id: string): Rotation | undefined {
  const combo = lastLevel(id, "연계 스킬");
  const ult = lastLevel(id, "궁극기");
  const battle = lastLevel(id, "배틀 스킬");
  if (!combo.length || !ult.length || !battle.length) return undefined;
  const comboCd = Math.max(...combo.map((l) => l.coolDown));
  return {
    battleRate: 1 / SP_REGEN_INTERVAL,
    comboRate: comboCd > 0 ? 1 / comboCd : 0,
    ultCost: Math.max(...ult.map((l) => l.costValue)),
    ultCooldown: Math.max(...ult.map((l) => l.coolDown)),
    // 연계 스킬이 주는 궁극기 에너지: 표시 항목("획득하는 궁극기 에너지", 적 1명 명중 기준) → 스킬 데이터 usp → 공통 10 ✅
    comboEnergy: energyOf(combo, true) ?? Number(combo[0].bb.usp ?? 10),
    battleEnergy: energyOf(battle, false) ?? 0,
    selfEnergyOnly: /자신의 .*통해서만 궁극기 에너지를 획득/.test(JSON.stringify(combatChars[id]?.skillGroups.find((g) => g.type === "궁극기")?.desc ?? "")),
    weight: {
      battle: damageWeight(keep(id, "배틀 스킬", battle)),
      combo: damageWeight(keep(id, "연계 스킬", combo)),
      ult: damageWeight(keep(id, "궁극기", ult)),
      basic: basicWeight(id),
    },
    moved: movedOf(id, { battle, combo, ult }),
  };
}

const KIND_OF_TYPE: Record<string, "battle" | "combo" | "ult"> = { "배틀 스킬": "battle", "연계 스킬": "combo", 궁극기: "ult" };

/** 스킬 설명의 "X…로 간주" → [이름, 대상 종류] (공식 위키 설명) */
function considered(id: string, type: string): { name: string; to: "battle" | "combo" | "ult" | "anomaly" }[] {
  const out: { name: string; to: "battle" | "combo" | "ult" | "anomaly" }[] = [];
  for (const sk of opDetails[id]?.skills.filter((x) => x.type === type) ?? []) {
    for (const line of sk.description.split("\n")) {
      const m = line.match(/(강타|아츠 폭발|물리 이상|배틀 스킬|연계 스킬|궁극기)(?:의)? ?(?:피해)?로 간주/);
      if (!m) continue;
      const name = line.match(/^([^:\s]+)\s*:/)?.[1] ?? line.match(/^([^\s]+?)(?:이|가|은|는)\s/)?.[1];
      if (!name) continue;
      const to = KIND_OF_TYPE[m[1]] ?? "anomaly";
      if (to !== KIND_OF_TYPE[type]) out.push({ name, to });
    }
  }
  return out;
}

/** 간주 피해를 뺀 표시 항목 */
function keep(id: string, type: string, levels: RawLevel[]) {
  const names = considered(id, type).map((c) => c.name);
  return levels
    .flatMap((l) => l.display ?? [])
    .filter((d) => !names.some((n) => d.label.startsWith(n)) && !(type === "궁극기" && ENHANCED_BASIC.test(d.label)));
}

/** 궁극기 중 강화 일반 공격 (레바테인 "강화 일반 공격 제N단계 배율") — 일반 공격 피해로 분류 */
const ENHANCED_BASIC = /일반 공격.*배율/;

function movedOf(id: string, lv: Record<"battle" | "combo" | "ult", RawLevel[]>): Rotation["moved"] {
  const out: NonNullable<Rotation["moved"]> = [];
  for (const [type, from] of Object.entries(KIND_OF_TYPE)) {
    for (const c of considered(id, type)) {
      const w = damageWeight(lv[from].flatMap((l) => l.display ?? []).filter((d) => d.label.startsWith(c.name)));
      if (w > 0) out.push({ from, to: c.to, weight: w, name: c.name });
    }
  }
  // 궁극기 지속 시간 동안 강화 일반 공격: 1세트 배율 × (지속 시간 ÷ 일반 공격 1세트 시간 — 가정값)
  const ultDs = lv.ult.flatMap((l) => l.display ?? []);
  const chain = damageWeight(ultDs.filter((d) => ENHANCED_BASIC.test(d.label)));
  if (chain > 0) {
    const dur = Math.max(0, ...ultDs.filter((d) => /^지속 시간\(초\)$/.test(d.label)).map((d) => parseFloat(d.value)));
    out.push({ from: "ult", to: "basic", weight: chain * Math.max(1, dur / BASIC_CHAIN_SECONDS), name: "강화 일반 공격", synced: true });
  }
  return out;
}

/** 초당 불균형치 (스킬 표 "불균형치" × 사용 빈도) */
function poisePerSec(id: string): number {
  const rot = rotationOf(id);
  if (!rot) return 0;
  const r = rates(rot, 0);
  const sum = (type: string) =>
    lastLevel(id, type)
      .flatMap((l) => l.display ?? [])
      .filter((d) => /불균형치/.test(d.label))
      .reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  return r.battle * sum("배틀 스킬") + r.combo * sum("연계 스킬") + r.ult * sum("궁극기");
}
let poiseAvg: number | undefined;
/** 적 불균형 가동률: 기본 가정값 × (이 오퍼레이터 불균형치 ÷ 평균), 0.1~0.5 */
function staggerUptimeOf(id: string): number {
  poiseAvg ??= (() => {
    const xs = Object.keys(combatChars).map(poisePerSec).filter((x) => x > 0);
    return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  })();
  const p = poisePerSec(id);
  return Math.min(0.5, Math.max(0.1, STAGGER_UPTIME * (poiseAvg > 0 ? p / poiseAvg : 1)));
}

/** 스킬 표의 피해 배율 항목 수 (타수 근사) */
function damageLabels(id: string, type: string): number {
  return new Set(lastLevel(id, type).flatMap((l) => l.display ?? []).filter((d) => /배율/.test(d.label) && !/취약|불균형/.test(d.label)).map((d) => d.label)).size;
}

/** 일반 공격 1세트 피해 배율 합 (attack1~N, 처형·낙하 제외) */
function basicWeight(id: string): number {
  const g = combatChars[id]?.skillGroups.find((x) => x.type === "일반 공격");
  const ds = (g?.skills ?? [])
    .filter((sk) => /^attack\d+$/.test((sk as unknown as { part: string }).part))
    .flatMap((sk) => ((sk.levels.at(-1) as unknown as RawLevel)?.display ?? []));
  return damageWeight(ds);
}

/** 치유량 식: 스킬 표 "기초 치유 수치" 다음 "X 1포인트마다 증가하는 치유 수치" 쌍 */
function healsOf(id: string, type: string): { base: number; coef: number; attr?: AttrName }[] {
  const out: { base: number; coef: number; attr?: AttrName }[] = [];
  for (const d of lastLevel(id, type).flatMap((l) => l.display ?? [])) {
    const v = parseFloat(d.value);
    if (!Number.isFinite(v)) continue;
    const per = d.label.match(/(힘|민첩|지능|의지) 1포인트마다 증가하는 치유/);
    if (per && out.length) {
      out[out.length - 1].coef = v;
      out[out.length - 1].attr = per[1] as AttrName;
    } else if (/치유 수치/.test(d.label) && !per) out.push({ base: v, coef: 0 });
  }
  return out;
}

/** 지속형 모드 주기: 스킬 표의 "…간격(초)" 최소값, "…지속 시간(초)" 최대값 */
function periodicOf(id: string, type: string): { interval: number; duration: number } | undefined {
  const ds = lastLevel(id, type).flatMap((l) => l.display ?? []);
  const num = (re: RegExp) => ds.filter((d) => re.test(d.label)).map((d) => parseFloat(d.value)).filter((v) => v > 0);
  const iv = num(/간격\(초\)/);
  const du = num(/지속 시간\(초\)/);
  return iv.length && du.length ? { interval: Math.min(...iv), duration: Math.max(...du) } : undefined;
}

/** 팀원 후보 = 이 오퍼레이터와 같은 캐릭터(관리자 남/여)를 뺀 전체 */
function teamPool(id: string): TeamPool {
  const group = (oid: string) => operators.find((o) => o.id === oid)?.name.replace(/\s*\(.*\)$/, "");
  const others = operators
    .filter((o) => o.id !== id && group(o.id) !== group(id))
    .flatMap((o) => {
      const k = operatorKit(o.id);
      return k ? [{ id: o.id, element: k.element, kit: k, rates: rates(k.rotation, 0) }] : [];
    });
  return { others };
}

const kitCache = new Map<string, OperatorKit | undefined>();
/** 무기 평가용 오퍼레이터 정보 (스킬 설명 · 전투 태그) */
function operatorKit(id: string): OperatorKit | undefined {
  if (!kitCache.has(id)) kitCache.set(id, buildKit(id));
  return kitCache.get(id);
}

function buildKit(id: string): OperatorKit | undefined {
  const base = operatorBase(id);
  const cc = getCombatCharacter(id);
  if (!base?.rotation || !cc) return undefined;
  // 게임 데이터 설명 + 공식 위키 설명 (위키에만 있는 효과 — 예: 결 연계 스킬 "자연 취약·냉기 취약 부여")
  const text = (type: string) =>
    [
      ...cc.skillGroups.filter((g) => g.type === type).map((g) => [g.desc ?? "", ...(g.forms ?? []).map((f) => f.desc)].join("\n")),
      ...(opDetails[id]?.skills.filter((w) => w.type === type).map((w) => w.description) ?? []),
    ]
      .join("\n")
      .replace(/<[^>]*>/g, "");
  return {
    id,
    element: base.element,
    mainAttr: base.mainAttr,
    subAttr: base.subAttr,
    rotation: base.rotation,
    texts: { basic: text("일반 공격"), battle: text("배틀 스킬"), combo: text("연계 스킬"), ult: text("궁극기") },
    periodic: { battle: periodicOf(id, "배틀 스킬"), combo: periodicOf(id, "연계 스킬"), ult: periodicOf(id, "궁극기") },
    heals: Object.fromEntries(
      (
        [
          ["battle", "배틀 스킬"],
          ["combo", "연계 스킬"],
          ["ult", "궁극기"],
        ] as const
      )
        .map(([k, t]) => [k, healsOf(id, t)] as const)
        .filter(([, h]) => h.length),
    ),
    critRate: base.critRate,
    staggerUptime: staggerUptimeOf(id),
    skillHits: {
      battle: Math.max(1, damageLabels(id, "배틀 스킬")),
      combo: Math.max(1, damageLabels(id, "연계 스킬")),
      ult: Math.max(1, damageLabels(id, "궁극기")),
    },
    basicHits: (combatChars[id]?.skillGroups.find((x) => x.type === "일반 공격")?.skills ?? []).filter((sk) => /^attack\d+$/.test((sk as unknown as { part: string }).part)).length || 5,
    hp: opStats[id]?.hp.at(-1),
    def: opStats[id]?.def.at(-1),
    tags: (cc.battleTags ?? []).map((t) => t.name),
  };
}

export interface BuildRecommendation {
  role: RoleWeight;
  /** 계산에 넣은 오퍼레이터 자체 버프 (재능·스킬 표) */
  selfBuffs: string[];
  /** 치유 스킬이 있는지 (치유 비중 적용 여부) */
  heals: boolean;
  weapons: (WeaponValueRank & {
    official: "skill" | "attribute" | null;
    image?: string;
    trait?: { name: string | null; desc: string | null; bb: Blackboard; level: number };
    statSkills: { desc: string | null; bb: Blackboard }[];
  })[];
  gear: GearRank[];
  /** 능력치로 스킬 형태가 바뀌는 오퍼레이터(결)의 형태별 무기·장비 — 그 형태가 되는 능력치 조건을 만족하는 장비만 */
  formBuilds?: FormBuild[];
  synergy: Synergy;
}

let synergyCache: Record<string, { comboDesc: string | null; tags: string[] }> | undefined;
const synergyIndex = () =>
  (synergyCache ??= Object.fromEntries(
    Object.entries(combatChars).map(([oid, c]) => {
      const groups = getCombatCharacter(oid)?.skillGroups ?? [];
      const g = groups.find((g) => g.type === "연계 스킬");
      const tags = ((c as unknown as { battleTags?: { name: string }[] }).battleTags ?? []).map((t) => t.name);
      // 오리지늄 결정은 전투 태그 '제어' 중에서도 관리자만 만든다 → 스킬 설명에 직접 나오는 경우만 인정
      if (tags.includes("제어") && JSON.stringify(groups).includes("오리지늄 결정")) tags.push("오리지늄 결정");
      return [oid, { comboDesc: g?.forms ? g.forms.map((f) => f.desc).join("\n") : (g?.desc ?? null), tags }];
    }),
  ));
const findTerms = (text: string) => splitTerms(text).filter((p) => p.term).map((p) => p.term!);

/** 오퍼레이터 추천 빌드 — 레벨 90 · 잠재 0 · 무기 재련 0 · 재능 배열 완료 기준 (빌드 시 미리 계산) */
const recCache = new Map<string, BuildRecommendation | undefined>();
export function getBuildRecommendation(id: string): BuildRecommendation | undefined {
  if (!recCache.has(id)) recCache.set(id, computeBuildRecommendation(id));
  return recCache.get(id);
}

function computeBuildRecommendation(id: string): BuildRecommendation | undefined {
  const op = operators.find((o) => o.id === id);
  const base = operatorBase(id);
  if (!op || !base) return undefined;
  const talents = addBag(talentBag(combatChars[id].talents.attributes), selfKitBag(id));
  const candidates = Object.entries(combatWeapons).filter(([wid]) => weapons.find((w) => w.id === wid)?.type === op.weaponType);
  const kit = operatorKit(id);
  if (!kit) return undefined;
  const role = roleOf(id);
  const pool = teamPool(id);
  // 메인 딜러 가중치: 같은 속성(물리/아츠 계열 포함) +2, 이 오퍼레이터가 그 딜러의 연계를 열어 주면 +2
  const dealers = role.dealer > 0 || role.heal > 0 ? dealersFor(id, kit) : [];
  // 1차: 무기만 → 그 1위 무기로 장비 → 2차: 추천 장비(치명률 등)를 낀 상태로 무기를 다시 비교
  const first = rankWeaponsByValue(base, kit, talents, candidates, 0, pool, role, dealers);
  const gearOf = (weaponId: string, bag: StatBag) =>
    rankGearByValue(base, kit, combatWeapons[weaponId].baseAtk.at(-1) ?? 0, bag, Object.entries(gearPieces), Object.entries(gearSuits), role, dealers, pool);
  const gear0 = first[0] ? gearOf(first[0].id, addBag(talents, first[0].bag)) : [];
  const withGear = addBag(talents, gearSetBag(gear0[0]));
  const ranked = rankWeaponsByValue(base, kit, withGear, candidates, 0, pool, role, dealers).map((r) => ({
    ...r,
    official: op.recommendedWeapons.skill.includes(r.id) ? ("skill" as const) : op.recommendedWeapons.attribute.includes(r.id) ? ("attribute" as const) : null,
    image: weapons.find((w) => w.id === r.id)?.image,
    // 고유 특성 원문 + 현재 레벨 수치 (화면에서 효과 원문 보기)
    trait: (() => {
      const t = combatWeapons[r.id].skills.at(-1);
      return t ? { name: t.name, desc: t.desc, bb: t.levels[r.levels.at(-1)! - 1]?.bb ?? {}, level: r.levels.at(-1)! } : undefined;
    })(),
    // 능력치 스킬 2개 (현재 레벨 수치)
    statSkills: combatWeapons[r.id].skills.slice(0, -1).map((sk, i) => ({ desc: sk.desc, bb: sk.levels[r.levels[i] - 1]?.bb ?? {} })),
  }));
  // 장비는 1위 무기를 낀 상태로 비교
  const topWeapon = ranked[0] ? combatWeapons[ranked[0].id] : undefined;
  const withWeapon = ranked[0] ? addBag(talents, ranked[0].bag) : talents;
  const gear = topWeapon ? gearOf(ranked[0].id, withWeapon) : [];
  // 형태별 빌드: 무기 순위대로 그 형태 조건을 만족하는 장비 조합이 나오는 첫 무기
  const formBuilds = defaultForm(id)
    ? FORM_GATES.flatMap((f) => {
        for (const w of ranked.slice(0, 6)) {
          const g = rankGearByValue(base, kit, combatWeapons[w.id].baseAtk.at(-1) ?? 0, addBag(talents, w.bag), Object.entries(gearPieces), Object.entries(gearSuits), role, dealers, pool, 0, GEAR_SEARCH.offCandidates, f.gate);
          if (g.length) return [{ form: f.form, condition: f.condition, weaponId: w.id, weaponName: w.name, gear: g }];
        }
        return [];
      })
    : undefined;
  return { weapons: ranked, role, selfBuffs: describeBag(selfKitBag(id)), heals: Object.keys(kit.heals ?? {}).length > 0, gear, formBuilds, synergy: synergy(id, synergyIndex(), findTerms) };
}

/** 메인 딜러 가중치: 같은 속성(물리/아츠 계열 포함) +2, 이 오퍼레이터가 그 딜러의 연계를 열어 주면 +2 */
function dealersFor(id: string, kit: OperatorKit): DealerRef[] {
  const syn = synergy(id, synergyIndex(), findTerms);
  return mainDealers().map((d) => ({
    ...d,
    weight: 1 + (d.kit.element === kit.element ? 2 : 0) + (syn.enables.includes(d.id) ? 2 : 0),
  }));
}

const candidatesFor = (id: string) => {
  const op = operators.find((o) => o.id === id);
  return Object.entries(combatWeapons).filter(([wid]) => weapons.find((w) => w.id === wid)?.type === op?.weaponType);
};

/** 추천 장비 세트 1개의 능력치 합 (부위 4개 + 세트 효과) */
function gearSetBag(g: GearRank | undefined) {
  let bag = talentBag([]);
  if (!g) return bag;
  for (const p of g.pieces) bag = addBag(bag, gearBag(gearPieces[p.id]));
  // 세트 효과: 추천 계산에서 해석한 기대 능력치(조건부 포함), 없으면 조건 없는 효과만
  if (g.setBag) bag = addBag(bag, g.setBag);
  else if (gearSuits[g.suitId]) bag = addBag(bag, suitBag(gearSuits[g.suitId]));
  return bag;
}

/** 공식 위키의 숫자가 들어간 문장 → 템플릿 + 값 ("공격력 +8%, 10초" → "공격력 +{v0:0%}, {duration1}초") */
export function templatize(text: string): { desc: string; bb: Record<string, number> } {
  const bb: Record<string, number> = {};
  let i = 0;
  const desc = text
    .replace(/\+(\d+(?:\.\d+)?)%/g, (_, v: string) => {
      const k = `v${i++}`;
      bb[k] = Number(v) / 100;
      return `+{${k}:0%}`;
    })
    .replace(/\+(\d+(?:\.\d+)?)(?![\d.%])/g, (_, v: string) => {
      const k = `f${i++}`;
      bb[k] = Number(v);
      return `+{${k}:0}`;
    })
    .replace(/(\d+(?:\.\d+)?)초/g, (_, v: string) => {
      const k = `duration${i++}`;
      bb[k] = Number(v);
      return `{${k}}초`;
    })
    .replace(/최대 (\d+)스택/g, (_, v: string) => {
      const k = `max_stack${i++}`;
      bb[k] = Number(v);
      return `최대 {${k}}스택`;
    });
  return { desc, bb };
}

const kitBagCache = new Map<string, StatBag>();
/**
 * 오퍼레이터 자체 버프 (무기·장비와 무관하게 늘 갖고 있는 것)
 * - 오퍼레이터 재능(공식 위키 마지막 단계 문장)을 무기 특성 해석기로 평가 — 본인 몫만
 * - 스킬 표의 "치명타 확률/치명타 피해/공격력 증가 %": 지속 시간이 있으면 그 스킬 빈도 × 지속 가동률로 전체에,
 *   없으면 그 스킬 피해에만. 궁극기의 "1스택마다 증가하는 치명타 확률"(최대 N) · "최대 중첩 시 … 치명타 피해"는 궁극기 모드에 (평균 절반)
 */
function selfKitBag(id: string): StatBag {
  const hit = kitBagCache.get(id);
  if (hit) return hit;
  let bag = talentBag([]);
  const kit = operatorKit(id);
  const base = operatorBase(id);
  if (!kit || !base) return bag;
  for (const t of opDetails[id]?.talents.filter((x) => x.category === "오퍼레이터 재능") ?? []) {
    const last = t.stages.at(-1);
    if (!last?.effect) continue;
    const { desc, bb } = templatize(last.effect);
    bag = addBag(bag, evaluateSuitEffect(desc, bb, kit, base.attrs).bag);
  }
  const r = rates(kit.rotation, 0);
  const KIND: Record<string, "battle" | "combo" | "ult"> = { "배틀 스킬": "battle", "연계 스킬": "combo", 궁극기: "ult" };
  const synced = kit.rotation.moved?.some((m) => m.synced);
  for (const sk of opDetails[id]?.skills ?? []) {
    const k = KIND[sk.type];
    if (!k) continue;
    const val = (re: RegExp) => {
      const p = sk.params.find((x) => re.test(x.label) && x.values?.length);
      return p ? Number(p.values!.at(-1)) : undefined;
    };
    const dur = val(/지속 시간\(초\)/);
    const add = talentBag([]);
    const up = dur ? Math.min(1, r[k] * dur) : 1;
    const cr = val(/^치명타 확률 증가$/);
    const cd = val(/^치명타 피해 증가$/);
    const atk = val(/^공격력 증가$/);
    if (dur) {
      if (cr) add.critRate += (cr / 100) * up;
      if (cd) add.critDmg += (cd / 100) * up;
      if (atk) add.atkPct += (atk / 100) * up;
    } else {
      if (cr) add.critBy[k] += cr / 100;
      if (cd) add.critDmgBy[k] += cd / 100;
    }
    const perStack = val(/1스택마다 증가하는 치명타 확률/);
    const maxStack = val(/최대 중첩 스택 수치/);
    const fullCd = val(/최대 중첩 시 증가하는 치명타 피해/);
    const scope = k === "ult" && synced ? "ultMode" : k;
    if (perStack) add.critBy[scope] += (perStack / 100) * ((maxStack ?? 1) / 2);
    if (fullCd) add.critDmgBy[scope] += (fullCd / 100) * 0.5;
    bag = addBag(bag, add);
  }
  kitBagCache.set(id, bag);
  return bag;
}

/** 능력치 묶음 → 사람이 읽는 목록 */
function describeBag(b: StatBag): string[] {
  const pc = (v: number) => `${+(v * 100).toFixed(1)}%`;
  const out: string[] = [];
  const SCOPE: Record<string, string> = { battle: "배틀 스킬", combo: "연계 스킬", ult: "궁극기", ultMode: "궁극기 모드" };
  if (b.atkPct) out.push(`공격력 +${pc(b.atkPct)}`);
  if (b.critRate) out.push(`치명타 확률 +${pc(b.critRate)}`);
  if (b.critDmg) out.push(`치명타 피해 +${pc(b.critDmg)}`);
  if (b.dmg.all) out.push(`주는 피해 +${pc(b.dmg.all)}`);
  for (const [k, v] of Object.entries(b.critBy)) if (v) out.push(`${SCOPE[k]} 치명타 확률 +${pc(v)}`);
  for (const [k, v] of Object.entries(b.critDmgBy)) if (v) out.push(`${SCOPE[k]} 치명타 피해 +${pc(v)}`);
  if (b.taken) out.push(`적이 받는 피해 +${pc(b.taken)}`);
  if (b.artsIntensity) out.push(`아츠 강도 +${Math.round(b.artsIntensity)}`);
  return out;
}

/** 직업 → 역할 비중 */
export function roleOf(id: string): RoleWeight {
  const cls = operators.find((o) => o.id === id)?.profile?.class;
  return (cls && ROLE_WEIGHT[cls]) || ROLE_WEIGHT.스트라이커;
}

let dealerCache: DealerRef[] | undefined;
/** 메인 딜러(스트라이커) 전원의 기준 상태 — 각자 본인 피해 1위 무기 착용 */
function mainDealers(): DealerRef[] {
  if (dealerCache) return dealerCache;
  dealerCache = operators
    .filter((o) => o.profile?.class === "스트라이커")
    .flatMap((o) => {
      const op = operatorBase(o.id);
      const kit = operatorKit(o.id);
      if (!op || !kit) return [];
      const talents = addBag(talentBag(combatChars[o.id].talents.attributes), selfKitBag(o.id));
      const top0 = rankWeaponsByValue(op, kit, talents, candidatesFor(o.id))[0];
      if (!top0) return [];
      // 딜러 기준도 추천 장비까지 낀 상태
      const g = rankGearByValue(op, kit, combatWeapons[top0.id].baseAtk.at(-1) ?? 0, addBag(talents, top0.bag), Object.entries(gearPieces), Object.entries(gearSuits))[0];
      const base2 = addBag(talents, gearSetBag(g));
      const top = rankWeaponsByValue(op, kit, base2, candidatesFor(o.id))[0];
      const bag = addBag(base2, top.bag);
      return [{ id: o.id, op, kit, bag, atk: combatWeapons[top.id].baseAtk.at(-1) ?? 0, d: score(op, combatWeapons[top.id].baseAtk.at(-1) ?? 0, bag).overall }];
    });
  return dealerCache;
}

// ───────── 베스트 조합 화면 요약 (팀 전투 시뮬레이션 결과) ─────────

/** 버프·디버프 가동 (amp 증폭 · vuln 취약 · taken 받는 피해 · atk 공격력 · dmg 피해 보너스 · res 저항 감소 — 값 = 포인트/100) */
export interface RotBuffView {
  from: string;
  text: string;
  effect: "amp" | "vuln" | "atk" | "taken" | "dmg" | "res";
  value: number;
  uptime: number;
  /** 받는 팀원 */
  to: string[];
}

/** 팀 전투 시뮬레이션 → 화면 요약 */
export interface RotationResult {
  members: { id: string; rates: Record<"battle" | "combo" | "ult", number>; damage: number; share: number; spShare: number }[];
  /** 초당 피해 */
  total: number;
  /** 피해 비중 1위 */
  mainId: string;
  /** 조작 캐릭터 */
  controlId: string;
  /** 팀 SP 수입 (SP/s) */
  spIncome: number;
  /** 궁극기 평균 간격(초) */
  ultInterval: number;
  /** 연계를 쓴 멤버 비율 */
  comboUptime: number;
  buffs: RotBuffView[];
  /** 아츠 폭발·이상·물리 이상 횟수 */
  reactions?: Record<string, number>;
}

// ───────── 베스트 조합 (연계 시너지) ─────────

export interface BestTeam extends TeamEval {
  /** 직업 구성 (중복 제외 수) */
  classes: number;
  healer: boolean;
}

let teamCache: BestTeam[] | undefined;
/** 모든 4인 조합을 연계 시너지로 평가 (빌드 시 1회) */
export function allTeams(): BestTeam[] {
  if (teamCache) return teamCache;
  const idx = synergyIndex();
  const pool: TeamCandidate[] = operators
    .filter((o) => idx[o.id])
    .map((o) => ({ id: o.id, group: o.name.replace(/\s*\(.*\)$/, ""), comboDesc: idx[o.id].comboDesc, tags: idx[o.id].tags }));
  const reqs = new Map(pool.map((m) => [m.id, comboRequirement(m.comboDesc, findTerms)]));
  const classOf = (id: string) => operators.find((o) => o.id === id)?.profile?.class;
  const classes = (ids: string[]) => new Set(ids.map(classOf)).size;
  const healer = (ids: string[]) => ids.some((id) => idx[id]?.tags.includes("치유"));
  // 동점이면 직업이 다양한 순 (치유 담당 유무는 순위에 쓰지 않음 — 일반 콘텐츠에서 치유는 필요 없음)
  const ranked = rankTeams(pool, (id) => reqs.get(id)!, (ids) => classes(ids));
  return (teamCache = ranked.map((t) => ({ ...t, classes: classes(t.ids), healer: healer(t.ids) })));
}

/** 2차 점수 = 파티 무기·장비로 돌린 팀 전투 시뮬레이션 초당 피해 × 시너지 정렬 보정 (치유·생존 보정 없음) */
const scoreOf = (t?: { ids: string[]; rotation?: RotationResult; party?: PartyBuild }) => (t ? teamScore(t.ids, t.party) : 0);

/** 2차(정밀) 평가 인원: 1차 근사 순위 상위 몇 개를 파티 장비 + 로테이션 그리디로 다시 계산할지 */
const STAGE2_WINDOW = 12;

export type BestTeamWithGear = BestTeam & { party?: PartyBuild; rotation?: RotationResult };

/** 베스트 조합 카드의 파티 장비 */
export interface TeamGearView {
  /** 파티 피해 기대치 ÷ 개인 추천 장비 그대로 */
  gain: number;
  members: {
    id: string;
    suitId: string;
    suitName: string | null;
    icon?: string;
    same: boolean;
    reason?: string;
    /** 이 파티에서 고른 무기 (개인 추천 1위와 다르면 weaponSame = false) */
    weaponId?: string;
    weaponName?: string;
    weaponIcon?: string;
    weaponSame?: boolean;
  }[];
}

/** 베스트 조합 카드의 팀 화력 · 스킬 사이클 */
export interface TeamPowerView {
  /** 전체 1위 조합 대비 팀 피해 */
  relative: number;
  mainId: string;
  /** 조작 캐릭터 */
  controlId: string;
  /** SP 수입 (SP/s) */
  spIncome: number;
  /** 궁극기 평균 간격(초) */
  ultInterval: number;
  /** 연계 가동률 (쿨타임 대비) */
  comboUptime: number;
  members: { id: string; share: number; spShare: number; battleEvery: number; comboEvery: number; ultEvery: number }[];
  buffs: { from: string; text: string; effect: RotBuffView["effect"]; value: number; uptime: number; to: string[] }[];
  /** 아츠 폭발·이상·물리 이상 발생 횟수 (전투 시뮬레이션 90초) */
  reactions: Record<string, number>;
}

let quickCache: Map<string, number> | undefined;
const keyOf = (ids: string[]) => [...ids].sort().join("+");

/** 1차 팀 피해 = 팀 전투 시뮬레이션(개인 추천 장비) 초당 피해 — 3인 묶음도 같은 캐시 */
function quickOf(ids: string[]): number {
  quickCache ??= new Map();
  const key = keyOf(ids);
  const hit = quickCache.get(key);
  if (hit !== undefined) return hit;
  const v = teamScore(ids);
  quickCache.set(key, v);
  return v;
}

/**
 * 오퍼레이터 기여도 = 1 − (그 오퍼레이터를 뺀 3인 팀 피해 ÷ 4인 팀 피해) — 1차 근사 기준.
 * 본인 피해 + 버프·디버프 + 연계 조건 제공 + 궁극기 에너지(배틀 스킬)까지 "이 사람이 빠지면 잃는 것"
 */
export function contributionOf(ids: string[], id: string): number {
  const full = quickOf(ids);
  if (full <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - quickOf(ids.filter((x) => x !== id)) / full));
}

const stage2Cache = new Map<string, BestTeamWithGear>();
function stage2(t: BestTeam): BestTeamWithGear {
  const key = t.ids.join("+");
  let hit = stage2Cache.get(key);
  if (!hit) {
    const party = partyBuild(t.ids);
    stage2Cache.set(key, (hit = { ...t, party, rotation: teamRotation(t, party) }));
  }
  return hit;
}

/**
 * 2차: 1차 순위 상위 조합을 파티 장비(lib/calc/party.ts) + 로테이션 그리디(SP 배분)로 다시 계산해 팀 피해 순으로.
 * teams 는 1차 순서(점수 내림차순)인 부분집합. weight = 정렬 가중치(오퍼레이터별 순위의 기여도)
 */
export function rerankWithGear(teams: BestTeam[], n: number, weight: (t: BestTeamWithGear) => number = () => 1): BestTeamWithGear[] {
  return teams
    .slice(0, Math.max(STAGE2_WINDOW, n * 2))
    .map(stage2)
    .sort((a, b) => scoreOf(b) * weight(b) - scoreOf(a) * weight(a))
    .slice(0, n);
}

/** 전체 순위에서 같은 메인 딜러 조합은 몇 개까지 (한 딜러 조합만 줄 서지 않게) */
const PER_MAIN = 2;

/**
 * 전체 베스트 조합: 딜러(본인 피해 비중 ≥ 0.5)마다 그 딜러가 메인인 상위 조합을 모아 팀 피해 순으로, 메인 딜러별 최대 PER_MAIN개.
 * (팀 피해만으로 줄 세우면 가장 센 딜러 한 명의 조합만 나열됨) — 관리자 남/여는 같은 캐릭터 → 한쪽만
 */
let overallCache: BestTeamWithGear[] | undefined;
export function bestTeams(n: number): BestTeamWithGear[] {
  if (!overallCache) {
    const seen = new Set<string>();
    const pool: BestTeamWithGear[] = [];
    for (const o of operators) {
      if (o.id === "3" || (simKit(o.id)?.carry ?? 0) < 0.5) continue;
      for (const t of bestTeamsFor(o.id, PER_MAIN * 2)) {
        if (t.ids.includes("3") || t.rotation?.mainId !== o.id || seen.has(t.ids.join("+"))) continue;
        seen.add(t.ids.join("+"));
        const { contribution, ...rest } = t;
        void contribution;
        pool.push(rest);
      }
    }
    pool.sort((x, y) => scoreOf(y) - scoreOf(x));
    const count = new Map<string, number>();
    overallCache = pool.filter((t) => {
      const main = t.rotation!.mainId;
      count.set(main, (count.get(main) ?? 0) + 1);
      return count.get(main)! <= PER_MAIN;
    });
  }
  return overallCache.slice(0, n);
}

let topTotal: number | undefined;
export const OVERALL_N = 12;
/** 팀 화력 기준 = 전체 1위 */
const bestTotal = () => (topTotal ??= scoreOf(bestTeams(1)[0]) || 1);

/** 화면용 (직렬화 가능한 최소 정보) */
/** 파티 표시 순서: 직업군 역할 (메인 딜러 = 0) — 서브 딜러 → 뱅가드 → 서포터·디펜더 */
const DISPLAY_RANK: Record<string, number> = { 스트라이커: 1, 캐스터: 1, 가드: 1, 뱅가드: 2, 서포터: 3, 디펜더: 3 };
/** 1번 메인 딜러(피해 1위) · 2번 서브 딜러 · 3번 뱅가드 · 4번 서포터 순 (같은 역할은 피해 비중 순) */
export function displayOrder(ids: string[], mainId: string | undefined, share: (id: string) => number): string[] {
  const rank = (id: string) => (id === mainId ? 0 : (DISPLAY_RANK[operators.find((o) => o.id === id)?.profile?.class ?? ""] ?? 3));
  return [...ids].sort((a, b) => rank(a) - rank(b) || share(b) - share(a));
}

export function teamView(t: BestTeamWithGear & { contribution?: number }): BestTeam & { alignment?: MemberAlignment[]; gear?: TeamGearView; power?: TeamPowerView; contribution?: number } {
  const { party, rotation: rotation0, ...rest0 } = t;
  // 화면 순서: 딜러 → 서브 딜러 → 뱅가드 → 서포터
  const shareOf = (id: string) => rotation0?.members.find((m) => m.id === id)?.share ?? 0;
  const order = displayOrder(rest0.ids, rotation0?.mainId, shareOf);
  const pos = (id: string) => order.indexOf(id);
  const rest = { ...rest0, ids: order, members: [...rest0.members].sort((a, b) => pos(a.id) - pos(b.id)) };
  const rotation = rotation0 ? { ...rotation0, members: [...rotation0.members].sort((a, b) => pos(a.id) - pos(b.id)) } : undefined;
  const every = (r: number) => (r > 0 ? 1 / r : Infinity);
  const nameOf = (id: string) => operators.find((o) => o.id === id)?.name ?? id;
  const sim = teamSim(rest.ids, party);
  return {
    ...rest,
    alignment: sim ? alignmentOf(rest.ids, sim) : undefined,
    gear: party
      ? {
          gain: party.gain,
          members: party.members.map((m) => ({
            id: m.id,
            suitId: m.gear.suitId,
            suitName: m.gear.suitName,
            icon: gearImages.suits[m.gear.suitId],
            same: m.same,
            reason: m.reason,
            weaponId: m.weapon?.id,
            weaponName: m.weapon?.name ?? undefined,
            weaponIcon: m.weapon ? weapons.find((w) => w.id === m.weapon!.id)?.image : undefined,
            weaponSame: m.weapon ? m.weapon.id === getBuildRecommendation(m.id)?.weapons[0]?.id : true,
          })),
        }
      : undefined,
    power: rotation
      ? {
          relative: scoreOf(t) / bestTotal(),
          mainId: rotation.mainId,
          controlId: rotation.controlId,
          spIncome: rotation.spIncome,
          ultInterval: rotation.ultInterval,
          comboUptime: rotation.comboUptime,
          members: rotation.members.map((m) => ({
            id: m.id,
            share: m.share,
            spShare: m.spShare,
            battleEvery: every(m.rates.battle),
            comboEvery: every(m.rates.combo),
            ultEvery: every(m.rates.ult),
          })),
          // 상태 디버프는 이름(감전 등)이 from — 화면에선 그대로, 오퍼레이터는 이름으로
          reactions: rotation.reactions ?? {},
          buffs: rotation.buffs
            .filter((b) => b.uptime * b.value >= 0.005)
            .map((b) => ({ ...b, from: /^\d+$/.test(b.from) ? nameOf(b.from) : b.from })),
        }
      : undefined,
  };
}

/**
 * 이 오퍼레이터가 들어간 베스트 조합 (파티 장비 · 로테이션 포함)
 * 점수 = 팀 피해 × √기여도 — 가장 센 딜러 조합에 끼워 넣기만 한 조합(기여 5%)보다 이 오퍼레이터가 핵심인 조합을 위로
 */
const perOpCache = new Map<string, BestTeam[]>();

/** 1차 시뮬레이션에서 피해 1위 멤버 */
function simMainOf(ids: string[]): string | undefined {
  const r = teamSim(ids);
  return r ? r.members.reduce((b, m) => (m.dmg > b.dmg ? m : b)).id : undefined;
}
/**
 * 이 오퍼레이터가 들어간 베스트 조합 (파티 장비 · 로테이션 포함)
 * - 딜러(carry ≥ 0.8): 이 오퍼레이터가 피해 1위인 조합만, 팀 점수 순 (다른 딜러에게 얹혀 가는 조합 제외)
 * - 그 외(서포터·서브 딜러): 팀 점수 × 기여도(이 오퍼레이터가 빠지면 줄어드는 팀 피해 비율) — 이 오퍼레이터가 핵심인 조합을 위로
 */
export function bestTeamsFor(id: string, n = 3): (BestTeamWithGear & { contribution: number })[] {
  const carry = (simKit(id)?.carry ?? 0) >= 0.8;
  let pool = perOpCache.get(id);
  if (!pool) {
    const mine = allTeams().filter((t) => t.ids.includes(id));
    const lead = carry ? mine.filter((t) => simMainOf(t.ids) === id) : [];
    const base = lead.length >= n ? lead : mine;
    const w = new Map(base.map((t) => [t, quickOf(t.ids) * (carry ? 1 : contributionOf(t.ids, id))]));
    pool = [...w.keys()].sort((a, b) => w.get(b)! - w.get(a)!);
    perOpCache.set(id, pool);
  }
  return rerankWithGear(pool, n, (t) => (carry ? (t.rotation?.mainId === id ? 1 : 0.5) : contributionOf(t.ids, id))).map((t) => ({ ...t, contribution: contributionOf(t.ids, id) }));
}

/** 연계 발동 조건 요약 (화면 표시용) */
const comboReqCache = new Map<string, ComboRequirement>();
export function comboRequirementOf(id: string): ComboRequirement {
  if (!comboReqCache.has(id)) comboReqCache.set(id, comboRequirement(synergyIndex()[id]?.comboDesc ?? null, findTerms));
  return comboReqCache.get(id)!;
}

/** (보정 테스트용) 가정값을 바꾼 뒤 캐시 비우기 */
export function resetBuildCache() {
  dealerCache = undefined;
  recCache.clear();
  partyCache.clear();
  stage2Cache.clear();
  perOpCache.clear();
  overallCache = undefined;
  teamWeaponCache.clear();
  teamGearCache.clear();
  teamInputCache.clear();
  quickCache = undefined;
  simCache.clear();
  topTotal = undefined;
}

// ───────── 파티별 장비 (lib/calc/party.ts) ─────────

/** 파티 장비 후보 수 (개인 추천 상위 K개 세트) */
export const PARTY_CANDIDATES = 12;

export interface PartyBuild {
  ids: string[];
  members: {
    id: string;
    /** 이 파티에서 고른 장비 */
    gear: GearRank;
    /** 이 파티에서 고른 무기 */
    weapon?: { id: string; name: string | null };
    /** 장비 세트가 개인 추천 1위와 같은지 */
    same: boolean;
    reason?: string;
    received: { suitName: string | null; from: string; text: string }[];
  }[];
  /** 파티 피해 기대치 ÷ 개인 추천 장비 그대로 */
  gain: number;
  teamDamage: number;
  /** 파티 화력 (딜러 피해 합 — 파티끼리 비교) */
  power: number;
  /** 멤버별 최종 능력치·추가 타격·무기 공격력 (팀 전투 시뮬레이션 입력, 화면에는 안 씀) */
  finals: { bag: StatBag; extra: { rate: number; scale: number }[]; weaponAtk: number; weaponId?: string }[];
}

const partyCache = new Map<string, PartyBuild | undefined>();
const pieceMap = new Map(Object.entries(gearPieces));
const suitMap = new Map(Object.entries(gearSuits));

/** 파티 후보: 팀 무기 1위 × 장비 상위 PARTY_CANDIDATES개 + 나머지 무기 × 장비 상위 PARTY_CANDIDATES_ALT개 */
export const PARTY_CANDIDATES_ALT = 6;

/**
 * 4인 파티가 정해졌을 때 각자의 무기·장비 (팀 버프 중첩·상태 공급·실제 팀원 기준)
 * 목표 = 팀 피해 기대치 — 멤버별 비중은 1차 팀 전투 시뮬레이션의 실제 피해 비중 (치유·생존 비중 없음)
 */
export function partyBuild(ids: string[]): PartyBuild | undefined {
  const key = [...ids].sort().join("+");
  if (partyCache.has(key)) return partyCache.get(key);
  const inputs: { m: PartyMember; rec: BuildRecommendation; gear: GearRank[]; formAlts: number[]; formNote: Map<number, string> }[] = [];
  for (const id of ids) {
    const rec = getBuildRecommendation(id);
    const op = operatorBase(id);
    const kit = operatorKit(id);
    const ws = teamWeaponsOf(id);
    const gear = teamGearOf(id);
    if (!rec || !op || !kit || !ws.length || !gear.length) {
      partyCache.set(key, undefined);
      return undefined;
    }
    const talents = addBag(talentBag(combatChars[id].talents.attributes), selfKitBag(id));
    const cand = (w: PartyWeapon, g: GearRank): PartyCandidate => ({ suitId: g.suitId, suitName: g.suitName, pieces: g.pieces, weapon: w });
    const candidates = ws.flatMap((w, wi) => gear.slice(0, wi === 0 ? PARTY_CANDIDATES : PARTY_CANDIDATES_ALT).map((g) => cand(w, g)));
    // 형태별 빌드(결): 기본 장비와 다른 형태가 되는 무기·장비 — 근사 식은 형태 차이를 모르므로 시뮬레이션으로 따로 검증 (formAlts)
    const formAlts: number[] = [];
    const formGear: GearRank[] = [];
    const formNote = new Map<number, string>();
    for (const fb of rec.formBuilds ?? []) {
      const w = rec.weapons.find((x) => x.id === fb.weaponId);
      if (!w) continue;
      for (const g of fb.gear.slice(0, FORM_CANDIDATES)) {
        formAlts.push(candidates.length);
        formNote.set(candidates.length, `${fb.form} 형태 빌드 (${fb.condition} — 무기 ${fb.weaponName})`);
        formGear.push(g);
        candidates.push(cand(toPartyWeapon(w), g));
      }
    }
    inputs.push({
      rec,
      gear: [...gear, ...formGear],
      formAlts,
      formNote,
      m: { id, op, kit, role: teamRoleOf(id), weaponAtk: ws[0].atk, base: talents, candidates },
    });
  }
  // 멤버별 실제 피해 비중 (1차 시뮬레이션 — 개인 추천 무기·장비 + 팀 효과)
  const sim = teamSim(ids);
  const shares = sim && sim.total > 0 ? sim.members.map((m) => m.dmg / sim.total) : undefined;
  const nameOf = (oid: string) => operators.find((o) => o.id === oid)?.name ?? oid;
  const toBuild = (res: ReturnType<typeof optimizeParty>): PartyBuild => ({
    ids,
    members: res.picks.map((p, i) => {
      const c = inputs[i].m.candidates[p.pick];
      // 같은 세트라도 형태별 빌드는 부위 구성이 다를 수 있음 → 후보의 부위로 찾기
      const sameParts = (x: GearRank) => x.suitId === c.suitId && x.pieces.every((pc, k) => pc.id === c.pieces[k]?.id);
      const g = inputs[i].gear.find(sameParts) ?? inputs[i].gear.find((x) => x.suitId === c.suitId) ?? inputs[i].gear[0];
      return {
        id: p.id,
        gear: g,
        weapon: c.weapon ? { id: c.weapon.id, name: c.weapon.name } : undefined,
        same: g.suitId === inputs[i].rec.gear[0]?.suitId,
        reason:
          inputs[i].formNote.get(p.pick) ??
          p.reason?.replace(/@([^@]+)@/g, (_, oid: string) => nameOf(oid)) ??
          // 개인 추천(치유·생존 비중 포함)과 다른데 파티 탐색 이유가 없으면 = 팀 조합용 기준(직업군 역할, 치유 비중 제외) 차이
          (c.weapon?.id !== inputs[i].rec.weapons[0]?.id || g.suitId !== inputs[i].rec.gear[0]?.suitId
            ? roleOf(p.id).heal > 0 || roleOf(p.id).survival > 0
              ? "치유·생존 대신 팀 강화 기준으로 고른 무기·장비"
              : "팀 조합 기준(직업군 역할)으로 고른 무기·장비"
            : undefined),
        received: p.received,
      };
    }),
    gain: res.gain,
    teamDamage: res.teamDamage,
    power: res.power,
    finals: res.finals,
  });
  // 최선 응답 반복(근사 식) 결과와 1차 빌드(팀 무기·장비 1위 그대로)를 팀 전투 시뮬레이션으로 검증해 큰 쪽
  const opt = toBuild(optimizeParty(inputs.map((x) => x.m), pieceMap, suitMap, 6, { shares }));
  const plain = toBuild(optimizeParty(inputs.map((x) => x.m), pieceMap, suitMap, 0, { shares }));
  // 형태별 빌드 후보(결 진결·의지 등)를 고정하고 나머지를 다시 맞춘 파티
  const alts = inputs.flatMap((x, i) => x.formAlts.map((c) => toBuild(optimizeParty(inputs.map((y) => y.m), pieceMap, suitMap, 6, { shares, fixed: { [i]: c } }))));
  const dPlain = teamSim(ids, plain)?.dps ?? 0;
  let out = plain;
  let dBest = dPlain;
  for (const b of [opt, ...alts]) {
    const d = teamSim(ids, b)?.dps ?? 0;
    if (d > dBest) {
      dBest = d;
      out = b;
    }
  }
  out.gain = dPlain > 0 ? dBest / dPlain : 1;
  partyCache.set(key, out);
  return out;
}

// ───────── 스킬 SP · 팀 로테이션 ─────────

/** 스킬 표의 SP 항목: 소모(costValue) · 반환(atb_return*) · 회복(atb, atb_N …) · 강력한 일격 SP */
/** 배틀 스킬 소모 · 반환 · 스킬별 회복 SP · 강력한 일격 SP */
interface SpInfo {
  cost: number;
  ret: number;
  recover: Record<"battle" | "combo" | "ult", number>;
  finalStrike: number;
}
const spCache = new Map<string, SpInfo>();
function spOf(id: string): SpInfo {
  if (!spCache.has(id)) spCache.set(id, spOfRaw(id));
  return spCache.get(id)!;
}
function spOfRaw(id: string): SpInfo {
  const groups = combatChars[id]?.skillGroups ?? [];
  const levels = (type: string) =>
    (groups.find((g) => g.type === type)?.skills ?? []).map((sk) => ({ part: (sk as unknown as { part: string }).part, lv: sk.levels.at(-1) as unknown as RawLevel })).filter((x) => x.lv);
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  /** 회복 SP: atb·atb_final·atb_trigger 는 합, atb_display 가 있으면 그 값 */
  const recoverOf = (bb: Record<string, number | string>) => {
    if (num(bb.atb_display) > 0) return num(bb.atb_display);
    // 단계별(atb_1… / atb1…)은 소모 스택에 따라 달라서 팀 로테이션에서 따로 (spTierOf)
    // atb_sp(알레쉬 "추가로 회복" — 진귀한 린수 10% 확률)·atb_ex(조건부 추가)는 조건 빈도를 몰라 제외 (TODO(실측))
    return ["atb", "atb_final", "atb_trigger"].reduce((s, k) => s + num(bb[k]), 0);
  };
  const returnOf = (bb: Record<string, number | string>) => Math.max(0, ...Object.keys(bb).filter((k) => k.startsWith("atb_return")).map((k) => num(bb[k])));
  const kindMax = (type: string, f: (bb: Record<string, number | string>) => number) => Math.max(0, ...levels(type).map((x) => f(x.lv.bb ?? {})));
  const battle = levels("배틀 스킬");
  // 설명이 "스킬 게이지를 반환"인데 표에는 atb 로만 있으면(라스트 라이트) 반환으로 — 반환은 궁극기 에너지를 만들지 않음 ✅
  const battleText = (groups.find((g) => g.type === "배틀 스킬")?.desc ?? "").replace(/<[^>]*>/g, "");
  const retAsAtb = /스킬 게이지를 반환/.test(battleText) && !battle.some((x) => Object.keys(x.lv.bb ?? {}).some((k) => k.startsWith("atb_return")));
  const battleAtb = kindMax("배틀 스킬", recoverOf);
  return {
    // 연속 초식(미브 단운 100 → 추형 50 → 개천 50)은 피해 배율을 모두 합쳐 1회로 보므로 SP도 합. 궁극기 중 변형(…_ult)은 제외
    cost: battle.filter((x) => !/ult/.test(x.part)).reduce((s, x) => s + (x.lv.costValue ?? 0), 0) || 100,
    ret: kindMax("배틀 스킬", returnOf) + (retAsAtb ? battleAtb : 0),
    recover: { battle: retAsAtb ? 0 : battleAtb, combo: kindMax("연계 스킬", recoverOf), ult: kindMax("궁극기", recoverOf) },
    finalStrike: Math.max(0, ...levels("일반 공격").filter((x) => /^attack\d+$/.test(x.part)).map((x) => num(x.lv.bb?.atb))),
  };
}

// ───────── 팀 조합용 무기·장비 (직업군 역할 · 치유 비중 없음) ─────────

/**
 * 팀 조합용 역할 비중 — 직업군(ROLE_WEIGHT) 그대로, 단 일반 콘텐츠는 치유·생존이 필요 없으므로 그 비중을 팀원 강화(딜)로.
 * 예) 서포터 본인 0 · 팀원 강화 0.7 · 치유 0.3 → 본인 0 · 팀원 강화 1 / 디펜더 → 본인 0 · 팀원 강화 1
 */
export function teamRoleOf(id: string): RoleWeight {
  const r = roleOf(id);
  return { ...r, dealer: r.dealer + r.heal + r.survival, heal: 0, survival: 0 };
}

/** 파티 무기 후보 수 (팀 역할 점수 상위) */
export const TEAM_WEAPONS = 3;
const teamWeaponCache = new Map<string, PartyWeapon[]>();
/**
 * 팀 조합용 무기 후보 — 개인 추천 무기 평가(본인 피해 · 팀원 강화 · 치유 · 생존 지표)를 팀 역할 비중으로 다시 점수화해 상위 TEAM_WEAPONS개.
 * 무기 고유 특성의 팀 효과(team)는 팀원에게 실제로 전달된다 (receiveTeamLines)
 */
export function teamWeaponsOf(id: string): PartyWeapon[] {
  const hit = teamWeaponCache.get(id);
  if (hit) return hit;
  const rec = getBuildRecommendation(id);
  const w = teamRoleOf(id);
  const out = (rec?.weapons ?? [])
    .map((r) => ({ r, v: w.self * r.parts.self + w.dealer * r.parts.dealer }))
    .sort((a, b) => b.v - a.v || b.r.parts.self - a.r.parts.self)
    .slice(0, TEAM_WEAPONS)
    .map(({ r }) => toPartyWeapon(r));
  teamWeaponCache.set(id, out);
  return out;
}

function toPartyWeapon(r: WeaponValueRank): PartyWeapon {
  return {
    id: r.id,
    name: r.name,
    atk: combatWeapons[r.id].baseAtk.at(-1) ?? 0,
    bag: r.bag,
    extra: r.extraHits.map((x) => ({ rate: x.rate, scale: x.scale })),
    team: r.team,
  };
}

/** 형태별 빌드 후보 수 (파티에서 시뮬레이션으로 검증) */
const FORM_CANDIDATES = 3;

const teamGearCache = new Map<string, GearRank[]>();
/** 팀 조합용 장비 순위 — 치유·생존 비중이 있는 직업(서포터·디펜더)만 팀 역할 비중·팀 무기 1위로 다시 계산, 나머지는 개인 추천 그대로 */
export function teamGearOf(id: string): GearRank[] {
  const hit = teamGearCache.get(id);
  if (hit) return hit;
  const rec = getBuildRecommendation(id);
  const role = roleOf(id);
  let out = rec?.gear ?? [];
  const w0 = teamWeaponsOf(id)[0];
  const op = operatorBase(id);
  const kit = operatorKit(id);
  if (rec && w0 && op && kit && (role.heal > 0 || role.survival > 0 || w0.id !== rec.weapons[0]?.id)) {
    const talents = addBag(talentBag(combatChars[id].talents.attributes), selfKitBag(id));
    out = rankGearByValue(op, kit, w0.atk, addBag(talents, w0.bag), Object.entries(gearPieces), Object.entries(gearSuits), teamRoleOf(id), dealersFor(id, kit), teamPool(id));
  }
  teamGearCache.set(id, out);
  return out;
}

/** 장비 세트 효과 해석 → 팀원에게 가는 효과 · 추가 타격 */
function suitTeamOf(id: string, g: GearRank | undefined, base: StatBag): { team: KeyedLine[]; extra: { rate: number; scale: number }[] } {
  const suit = g ? gearSuits[g.suitId] : undefined;
  const e = suit?.effects.find((x) => x.pieces === 3) ?? suit?.effects[0];
  const kit = operatorKit(id);
  const op = operatorBase(id);
  if (!g || !e || !kit || !op) return { team: [], extra: [] };
  const attrs = { 힘: op.attrs.힘 + base.str, 민첩: op.attrs.민첩 + base.agi, 지능: op.attrs.지능 + base.int, 의지: op.attrs.의지 + base.wil };
  const ev = evaluateSuitEffect(e.desc, e.bb as Blackboard, { ...kit, critRate: Math.min(1, (kit.critRate ?? op.critRate) + base.critRate) }, attrs, teamPool(id));
  return { team: ev.team.map((l) => ({ key: lineKey(g.suitId, l), source: g.suitName, l })), extra: ev.extraHits.map((x) => ({ rate: x.rate, scale: x.scale })) };
}

/** 1차(모든 조합) 입력 — 팀 무기 1위 + 팀 장비 1위, 본인 능력치와 팀원에게 가는 효과 */
interface TeamInput {
  bag: StatBag;
  extra: { rate: number; scale: number }[];
  weaponAtk: number;
  kit: OperatorKit;
  team: KeyedLine[];
}
const teamInputCache = new Map<string, TeamInput[]>();
/** 1차 입력 — [0] = 팀 무기·장비 1위, [1…] = 형태별 빌드 1위(결 진결·의지 등, 기본과 다를 때만). 1차 시뮬레이션은 이 중 가장 센 것 */
function teamInputs(id: string): TeamInput[] {
  const hit = teamInputCache.get(id);
  if (hit) return hit;
  const rec = getBuildRecommendation(id);
  const w0 = teamWeaponsOf(id)[0];
  const g0 = teamGearOf(id)[0];
  const list: TeamInput[] = [];
  const base = buildInput(id, w0, g0);
  if (base) list.push(base);
  for (const fb of rec?.formBuilds ?? []) {
    const w = rec!.weapons.find((x) => x.id === fb.weaponId);
    const g = fb.gear[0];
    if (!w || !g || (w.id === w0?.id && g.pieces.every((p, k) => p.id === g0?.pieces[k]?.id))) continue;
    const v = buildInput(id, toPartyWeapon(w), g);
    if (v) list.push(v);
  }
  teamInputCache.set(id, list);
  return list;
}
function teamInput(id: string, k = 0): TeamInput | undefined {
  return teamInputs(id)[k];
}
function buildInput(id: string, w: PartyWeapon | undefined, g: GearRank | undefined): TeamInput | undefined {
  const kit = operatorKit(id);
  let out: TeamInput | undefined;
  if (w && kit) {
    const withWeapon = addBag(addBag(talentBag(combatChars[id].talents.attributes), selfKitBag(id)), w.bag);
    const bag = addBag(withWeapon, gearSetBag(g));
    const suit = suitTeamOf(id, g, bag);
    out = {
      bag,
      extra: [...w.extra, ...suit.extra],
      weaponAtk: w.atk,
      kit,
      team: [...w.team.map((l) => ({ key: weaponLineKey(w.id, l), source: w.name, l })), ...suit.team],
    };
  }
  return out;
}

/** 팀 로테이션 결과 (party 가 있으면 파티 장비 기준) */
export function teamRotation(t: TeamEval, party?: PartyBuild, steps?: number): RotationResult | undefined {
  void steps;
  const r = teamSim(t.ids, party);
  return r ? simToRotation(r) : undefined;
}

// ───────── 팀 전투 시뮬레이터 (lib/calc/teamsim.ts + kits.ts) ─────────

/** 능력치 묶음 빼기 (파티 최종 능력치에서 자체 버프 근사치를 빼고, 시뮬레이터가 재능을 직접 계산) */
function negBag(b: StatBag): StatBag {
  const neg = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, -v])) as T;
  const out = { ...neg(b as unknown as Record<string, number>) } as unknown as StatBag;
  out.dmg = neg(b.dmg);
  out.critBy = neg(b.critBy);
  out.critDmgBy = neg(b.critDmgBy);
  return out;
}

const kitTableCache = new Map<string, KitTable | undefined>();
/** 스킬 표 접근자 (만렙 값, "%" → 소수) */
function kitTable(id: string): KitTable | undefined {
  if (kitTableCache.has(id)) return kitTableCache.get(id);
  const det = opDetails[id];
  const cc = combatChars[id];
  let out: KitTable | undefined;
  if (det && cc) {
    const skills = det.skills;
    const v: KitTable["v"] = (type, label, form) => {
      for (const sk of skills) {
        if (sk.type !== type || (form && !sk.name.includes(form))) continue;
        const p = sk.params.find((x) => (typeof label === "string" ? x.label === label : label.test(x.label)) && x.values?.length);
        if (!p) continue;
        const raw = Number(p.values!.at(-1));
        return p.unit === "%" ? raw / 100 : raw;
      }
      return 0;
    };
    const lv = (type: SkillTypeKR) => (cc.skillGroups.find((g) => g.type === type)?.skills ?? []).map((s) => s.levels.at(-1) as unknown as RawLevel).filter(Boolean);
    const poise = (type: SkillTypeKR, form?: string) =>
      skills
        .filter((sk) => sk.type === type && (!form || sk.name.includes(form)))
        .slice(0, 1)
        .flatMap((sk) => sk.params)
        .filter((p) => /불균형치/.test(p.label) && !/궁극기 사용 중|일찍|강화|공격받은 후/.test(p.label) && p.values?.length)
        .reduce((s, p) => s + Number(p.values!.at(-1)), 0);
    const basicDesc = skills.find((s) => s.type === "일반 공격")?.description ?? "";
    out = {
      id,
      elem: cc.element as Elem,
      v,
      cost: (type) => {
        const xs = lv(type as SkillTypeKR);
        return type === "배틀 스킬" ? (xs[0]?.costValue ?? 100) : Math.max(0, ...xs.map((x) => x.costValue ?? 0));
      },
      cd: (type) => Math.max(0, ...lv(type as SkillTypeKR).map((x) => x.coolDown ?? 0)),
      poise: (type, form) => poise(type as SkillTypeKR, form),
      basic: {
        chain: basicWeight(id),
        fsSp: spOf(id).finalStrike,
        fsPoise: Number(basicDesc.match(/강력한 일격이 (\d+)포인트의 불균형/)?.[1] ?? 0),
      },
      comboEnergy: v("연계 스킬", "획득하는 궁극기 에너지") || 10,
    };
  }
  kitTableCache.set(id, out);
  return out;
}
type SkillTypeKR = "배틀 스킬" | "연계 스킬" | "궁극기" | "일반 공격";

const simKitCache = new Map<string, Kit | undefined>();
function simKit(id: string): Kit | undefined {
  if (!simKitCache.has(id)) {
    const T = kitTable(id);
    simKitCache.set(id, T ? buildKitSim(T) : undefined);
  }
  return simKitCache.get(id);
}

/**
 * 시뮬레이터 멤버 — 자체 버프 근사치(selfKitBag)는 빼고 재능·스킬은 kits.ts 가 직접
 *   party 있음: 파티 무기·장비 최종 능력치(받은 팀 효과 포함)
 *   party 없음(1차): 팀 무기·장비 1위 + 팀원들의 무기·장비 팀 효과(중첩 규칙) — 빠진 멤버의 버프도 같이 빠짐(기여도)
 */
function simMembers(ids: string[], party?: PartyBuild, choice?: number[]): SimMember[] | undefined {
  const out: SimMember[] = [];
  const ins = ids.map((id, i) => teamInput(id, choice?.[i] ?? 0));
  if (ins.some((x) => !x)) return undefined;
  const lines = ins.map((x) => ({ kit: x!.kit, team: x!.team }));
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const op = operatorBase(id);
    const kit = simKit(id);
    const ind = ins[i]!;
    if (!op || !kit) return undefined;
    const f = party?.finals[party.ids.indexOf(id)];
    const own = f ? f.bag : addBag(ind.bag, receiveTeamLines(i, lines).bag);
    const bag = addBag(own, negBag(selfKitBag(id)));
    out.push({ id, kit, cls: operators.find((o) => o.id === id)?.profile?.class, stats: memberStats(op, f ? f.weaponAtk : ind.weaponAtk, bag, f ? f.extra : ind.extra) });
  }
  return out;
}

const simCache = new Map<string, { r: SimResult; order: string[] } | undefined>();
/** 팀 시뮬레이션 (메인 딜러 후보·SP 정책별로 돌려 가장 큰 운영). 결과의 멤버 순서는 ids 순서 */
export function teamSim(ids: string[], party?: PartyBuild): SimResult | undefined {
  // 파티 빌드는 무기·장비 선택까지 키에 (같은 4명도 빌드가 다르면 다른 결과)
  const key = party ? `P|${party.members.map((m) => `${m.id}:${m.weapon?.id ?? ""}:${m.gear.pieces.map((p) => p.id).join("/")}`).sort().join(",")}` : keyOf(ids);
  let hit = simCache.get(key);
  if (!simCache.has(key)) {
    // 1차: 형태별 빌드가 있는 멤버(결)는 빌드마다 돌려 큰 쪽 / 2차(파티 빌드)는 그대로
    const choices: number[][] = party ? [ids.map(() => 0)] : ids.reduce<number[][]>((acc, id) => acc.flatMap((c) => teamInputs(id).map((_, k) => [...c, k])), [[]]);
    hit = undefined;
    for (const choice of choices.length ? choices : [ids.map(() => 0)]) {
      // 편성 순서(연계 우선순위 1→4)를 딜 구조 순으로 고정 — 같은 4명이면 넣은 순서와 무관하게 같은 결과
      const ms = simMembers(ids, party, choice)?.sort((a, b) => b.kit.carry - a.kit.carry || Number(a.id) - Number(b.id));
      // 1차(팀 무기·장비)는 빠른 탐색, 파티 빌드(2차)는 정밀 탐색
      const r = ms ? simulateBest(ms, { fast: !party }) : undefined;
      if (r && (!hit || r.total > hit.r.total)) hit = { r, order: ms!.map((m) => m.id) };
    }
    simCache.set(key, hit);
  }
  if (!hit) return undefined;
  const { r, order } = hit;
  const back = ids.map((id) => order.indexOf(id));
  const remap = (j: number) => ids.indexOf(order[j]);
  return {
    ...r,
    members: back.map((j) => r.members[j]),
    sink: remap(r.sink),
    control: remap(r.control),
    uptime: Object.fromEntries(Object.entries(r.uptime).map(([k, u]) => [k, { ...u, src: remap(u.src), to: u.to?.map(remap) }])),
    forms: r.forms ? back.map((j) => r.forms![j]) : undefined,
  };
}

/** 시뮬레이션 결과 → 화면용 로테이션 요약 */
function simToRotation(r: SimResult): RotationResult {
  const D = SIM.duration;
  const ids = r.members.map((m) => m.id);
  const spAll = r.members.reduce((s, m) => s + m.spSpent, 0);
  const ults = r.members.filter((m) => m.casts.ult > 0);
  const comboOn = r.members.filter((m) => m.casts.combo > 0);
  const EFFECT: Record<string, RotBuffView["effect"]> = { amp: "amp", susc: "vuln", taken: "taken", atk: "atk", dmg: "dmg", res: "res" };
  return {
    members: r.members.map((m) => ({
      id: m.id,
      rates: { battle: m.casts.battle / D, combo: m.casts.combo / D, ult: m.casts.ult / D },
      damage: m.dmg / D,
      share: r.total > 0 ? m.dmg / r.total : 0,
      spShare: spAll > 0 ? m.spSpent / spAll : 0,
    })),
    total: r.dps,
    mainId: r.members.reduce((b, m) => (m.dmg > b.dmg ? m : b)).id,
    controlId: ids[r.control],
    spIncome: r.spGain,
    ultInterval: ults.length ? ults.reduce((s, m) => s + D / m.casts.ult, 0) / ults.length : Infinity,
    comboUptime: comboOn.length ? comboOn.length / r.members.length : 0,
    buffs: Object.values(r.uptime)
      .filter((u) => EFFECT[u.kind] && u.uptime > 0)
      .map((u) => ({
        from: ids[u.src],
        text: u.text,
        effect: EFFECT[u.kind],
        value: u.kind === "res" ? u.value / 100 : u.value,
        uptime: u.uptime,
        to: u.to ? u.to.map((i) => ids[i]) : ids,
      })),
    reactions: r.reactions,
  };
}

/**
 * 생존 담당 = 치유 스킬(전투 태그 "치유") 또는 디펜더(보호·비호) — 화면 정보용.
 * 치유 서포터는 필수가 아니므로 순위 점수에 생존 보정을 곱하지 않는다 (2026-10-07 이전: 치유 담당 없으면 ×0.9)
 */
export function sustainOf(id: string): boolean {
  const cls = operators.find((o) => o.id === id)?.profile?.class;
  return cls === "디펜더" || (combatChars[id]?.battleTags ?? []).some((t) => t.name === "치유");
}
export function hasSustain(ids: string[]): boolean {
  return ids.some(sustainOf);
}
/**
 * 베스트 조합 순위 점수 = 팀 전투 시뮬레이션 초당 피해 (무기·장비·재능·스킬 반영) × 시너지 정렬 보정
 *   범용 멤버(메인 딜러와 속성·상태·속성 버프로 맞물리지 않음) 1명마다 × (1 − SYNERGY.offPenalty). 치유·생존 보정 없음
 */
export function teamScore(ids: string[], party?: PartyBuild): number {
  const r = teamSim(ids, party);
  return r ? r.dps * synergyFactor(ids, r) : 0;
}

/**
 * 시너지 정렬 보정 — 범용 멤버 1명당 30% (보정값: 해외 메타 23개·커뮤니티 공개 팀 30개 순위가 좋아지는 구간 0.3~0.5 중 가장 약한 값)
 *   보정 없음 1490위 / 1434위 → 0.3 : 271위 / 260위 (2026-10-08 감전·부식·갑옷 파괴 역할 반영 후, 3.6만 개 중 기하평균)
 */
export const SYNERGY = { offPenalty: 0.3 };
export function synergyFactor(ids: string[], r: SimResult): number {
  const off = alignmentOf(ids, r).filter((a) => !a.aligned).length;
  return (1 - SYNERGY.offPenalty) ** off;
}

// ───────── 시너지 정렬 (메인 딜러와 메커니즘이 맞물리는 멤버인지) ─────────

/** 물리 메인 딜러가 원하는 방어 불능을 만드는 전투 태그 */
const VULN_TAGS = ["띄우기", "넘어뜨리기", "강타", "물리 취약"];

export interface MemberAlignment {
  id: string;
  aligned: boolean;
  /** 맞물리는 이유 (같은 속성 · 상태 공급 · 속성 버프) 또는 범용 */
  why: string;
}

/**
 * 시너지 정렬 — 메인 딜러(시뮬레이션 피해 1위)와 각 멤버가 게임 데이터상 맞물리는지:
 *   ① 같은 속성(부착 스택·속성 버프 공유) ② 메인 딜러가 원하는 상태(likes·wants·연계 조건)를 스킬·전투 태그로 공급
 *   ③ 메인 딜러 속성에 걸리는 버프·디버프(증폭·취약·받는 피해 — 시뮬레이션 가동률 또는 무기·세트 팀 효과,
 *      전투 중 직접 건 감전·부식·갑옷 파괴 — 2026-10-08 펠리카 감전 누락 수정)
 * 셋 다 아니면 "범용"(공격력·SP 등 아무 팀에나 들어가는 효과만) — 다른 속성 부착이 메인 딜러 스택을 반응으로 소모시키는 등
 * 실전 마찰이 있어 시너지 조합으로 보지 않음 (SYNERGY.offPenalty)
 */
export function alignmentOf(ids: string[], r: SimResult): MemberAlignment[] {
  const mi = r.members.reduce((b, m, i) => (m.dmg > r.members[b].dmg ? i : b), 0);
  const D = simKit(ids[mi]);
  if (!D) return ids.map((id) => ({ id, aligned: true, why: "" }));
  const want = new Set([...(D.likes ?? []), ...(D.battle.wants ?? []), ...(D.combo.needs ?? [])]);
  const elemHit = (elems?: string[]) => !!elems && (elems.includes(D.elem) || (D.elem !== "물리" && elems.includes("아츠")));
  return ids.map((id, i) => {
    if (i === mi) return { id, aligned: true, why: "메인 딜러" };
    const k = simKit(id);
    if (!k) return { id, aligned: true, why: "" };
    if (k.elem === D.elem) return { id, aligned: true, why: `같은 ${D.elem} 속성` };
    const tags = (combatChars[id]?.battleTags ?? []).map((t) => t.name);
    const supplies = [...want].find(
      (st) =>
        tags.includes(st) ||
        k.battle.makes?.includes(st) ||
        (st === "아츠 부착" && tags.some((t) => t.endsWith(" 부착"))) ||
        (st === "방어 불능" && tags.some((t) => VULN_TAGS.includes(t))),
    );
    if (supplies) return { id, aligned: true, why: `${supplies} 공급` };
    if (D.elem === "물리" && tags.some((t) => VULN_TAGS.includes(t))) return { id, aligned: true, why: "방어 불능 공급" };
    // 이 멤버의 역할인 상태 디버프(공식 전투 태그) — 감전(받는 아츠 피해↑) · 부식(저항↓) · 갑옷 파괴(받는 물리 피해↑)을 실제로 건 경우
    //   (리노 궁극기의 부가 강제 감전처럼 태그에 없는 부수 효과는 제외 — 태그 = 게임이 정한 그 오퍼레이터의 역할)
    const ap = r.members[i]?.applied ?? {};
    const role = (st: string, n: number) => tags.includes(st) && (ap[st] ?? 0) >= n;
    const debuff =
      (D.elem !== "물리" && role("감전", 2) && "감전 (받는 아츠 피해 증가)") ||
      (role("부식", 1) && "부식 (저항 감소)") ||
      (D.elem === "물리" && role("갑옷 파괴", 1) && "갑옷 파괴 (받는 물리 피해 증가)");
    if (debuff) return { id, aligned: true, why: debuff };
    const buff = Object.values(r.uptime).find((u) => u.src === i && elemHit(u.elems as string[] | undefined) && u.uptime * (u.kind === "res" ? u.value / 100 : u.value) >= 0.01);
    if (buff) return { id, aligned: true, why: `${D.elem} 피해 강화 (${buff.text})` };
    const line = teamInput(id)?.team.find((x) => elemHit(x.l.effect?.elems) && (x.l.effect?.zone === "dmg" || x.l.effect?.zone === "taken"));
    if (line) return { id, aligned: true, why: `${D.elem} 피해 강화 (${line.source})` };
    return { id, aligned: false, why: "범용 효과만 (공격력·SP 등)" };
  });
}
