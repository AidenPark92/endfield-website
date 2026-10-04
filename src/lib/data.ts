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
import type { CombatWeapon, GearPiece, GearSuit } from "@/types/build";
import { addBag, rankGear, rates, synergy, talentBag, SP_REGEN_INTERVAL, type GearRank, type OperatorBase, type Rotation, type Synergy } from "@/lib/calc/build";
import { splitTerms } from "@/lib/glossary";
import type { Blackboard, CombatCharacter, SkillForm, SkillGroup } from "@/types/combat";
import { damageWeight, rankWeaponsByValue, ROLE_WEIGHT, type DealerRef, type OperatorKit, type RoleWeight, type TeamPool, type WeaponValueRank } from "@/lib/calc/weapon-value";
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
export const operatorStatsMeta = operatorStatsJson._meta;
/** 능력치 막대 기준: 전체 오퍼레이터 레벨 90 힘·민첩·지능·의지 최댓값 */
export const attrScaleMax = Math.max(
  ...Object.values(operatorStatsJson.stats as Record<string, OperatorStats>).flatMap((s) => [s.str, s.agi, s.int, s.wil].map((a) => a[a.length - 1])),
);
const opDetails = operatorDetailsJson.operators as unknown as Record<string, OperatorDetails>;
export const operatorDetailsMeta = operatorDetailsJson._meta;

/** 공식 위키 상세(스킬 배율·재능·잠재·육성 재료). 용량이 커서 Operator 에 붙이지 않고 필요할 때만 꺼냄 */
export function getOperatorDetails(id: string): OperatorDetails | undefined {
  return opDetails[id];
}
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
export const combatCharactersMeta = combatCharactersJson._meta;

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

// ───────── 무기 · 장비 · 추천 빌드 ─────────
export const combatWeapons = (combatWeaponsJson as unknown as { weapons: Record<string, CombatWeapon> }).weapons;
export const gearPieces = (gearJson as unknown as { pieces: Record<string, GearPiece> }).pieces;
export const gearSuits = (gearJson as unknown as { suits: Record<string, GearSuit> }).suits;

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
const lastLevel = (id: string, type: string): RawLevel[] =>
  (combatChars[id]?.skillGroups.find((g) => g.type === type)?.skills ?? []).map((s) => s.levels.at(-1) as unknown as RawLevel).filter(Boolean);

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
    // 연계 스킬이 주는 궁극기 에너지 (스킬 데이터 usp, 없으면 공통 10 ✅)
    comboEnergy: Number(combo[0].bb.usp ?? 10),
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
  return levels.flatMap((l) => l.display ?? []).filter((d) => !names.some((n) => d.label.startsWith(n)));
}

function movedOf(id: string, lv: Record<"battle" | "combo" | "ult", RawLevel[]>): Rotation["moved"] {
  const out: NonNullable<Rotation["moved"]> = [];
  for (const [type, from] of Object.entries(KIND_OF_TYPE)) {
    for (const c of considered(id, type)) {
      const w = damageWeight(lv[from].flatMap((l) => l.display ?? []).filter((d) => d.label.startsWith(c.name)));
      if (w > 0) out.push({ from, to: c.to, weight: w, name: c.name });
    }
  }
  return out;
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
  const text = (type: string) =>
    cc.skillGroups
      .filter((g) => g.type === type)
      .map((g) => [g.desc ?? "", ...(g.forms ?? []).map((f) => f.desc)].join("\n"))
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
  /** 치유 스킬이 있는지 (치유 비중 적용 여부) */
  heals: boolean;
  weapons: (WeaponValueRank & {
    official: "skill" | "attribute" | null;
    image?: string;
    trait?: { name: string | null; desc: string | null; bb: Blackboard; level: number };
    statSkills: { desc: string | null; bb: Blackboard }[];
  })[];
  gear: GearRank[];
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
export function getBuildRecommendation(id: string): BuildRecommendation | undefined {
  const op = operators.find((o) => o.id === id);
  const base = operatorBase(id);
  if (!op || !base) return undefined;
  const talents = talentBag(combatChars[id].talents.attributes);
  const candidates = Object.entries(combatWeapons).filter(([wid]) => weapons.find((w) => w.id === wid)?.type === op.weaponType);
  const kit = operatorKit(id);
  if (!kit) return undefined;
  const role = roleOf(id);
  const ranked = rankWeaponsByValue(base, kit, talents, candidates, 0, teamPool(id), role, role.dealer > 0 || role.heal > 0 ? mainDealers() : []).map((r) => ({
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
  const gear = rankGear(base, topWeapon?.baseAtk.at(-1) ?? 0, withWeapon, Object.entries(gearPieces), Object.entries(gearSuits));
  return { weapons: ranked, role, heals: Object.keys(kit.heals ?? {}).length > 0, gear, synergy: synergy(id, synergyIndex(), findTerms) };
}

const candidatesFor = (id: string) => {
  const op = operators.find((o) => o.id === id);
  return Object.entries(combatWeapons).filter(([wid]) => weapons.find((w) => w.id === wid)?.type === op?.weaponType);
};

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
      const talents = talentBag(combatChars[o.id].talents.attributes);
      const top = rankWeaponsByValue(op, kit, talents, candidatesFor(o.id))[0];
      if (!top) return [];
      return [{ id: o.id, op, kit, bag: addBag(talents, top.bag), atk: combatWeapons[top.id].baseAtk.at(-1) ?? 0, d: top.score.overall }];
    });
  return dealerCache;
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
  // 동점이면 치유 담당 있음 > 직업이 다양함 순
  const ranked = rankTeams(pool, (id) => reqs.get(id)!, (ids) => (healer(ids) ? 10 : 0) + classes(ids));
  return (teamCache = ranked.map((t) => ({ ...t, classes: classes(t.ids), healer: healer(t.ids) })));
}

/** 이 오퍼레이터가 들어간 베스트 조합 */
export function bestTeamsFor(id: string, n = 3): BestTeam[] {
  return allTeams().filter((t) => t.ids.includes(id)).slice(0, n);
}

/** 연계 발동 조건 요약 (화면 표시용) */
export function comboRequirementOf(id: string): ComboRequirement {
  return comboRequirement(synergyIndex()[id]?.comboDesc ?? null, findTerms);
}
