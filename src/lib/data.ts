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
import { addBag, rankGear, rankWeapons, synergy, talentBag, weaponBag, type GearRank, type OperatorBase, type Synergy, type WeaponRank } from "@/lib/calc/build";
import { splitTerms } from "@/lib/glossary";
import type { CombatCharacter, SkillForm, SkillGroup } from "@/types/combat";
import type { EssenceRegion, EssenceStats, Operator, OperatorDetails, OperatorProfile, OperatorStats, Weapon } from "@/types/game";
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
  };
}

export interface BuildRecommendation {
  weapons: (WeaponRank & { official: "skill" | "attribute" | null; image?: string })[];
  gear: GearRank[];
  synergy: Synergy;
}

const synergyIndex = () =>
  Object.fromEntries(
    Object.entries(combatChars).map(([oid, c]) => [
      oid,
      {
        comboDesc: (() => {
          const g = getCombatCharacter(oid)?.skillGroups.find((g) => g.type === "연계 스킬");
          return g?.forms ? g.forms.map((f) => f.desc).join("\n") : (g?.desc ?? null);
        })(),
        tags: ((c as unknown as { battleTags?: { name: string }[] }).battleTags ?? []).map((t) => t.name),
      },
    ]),
  );
const findTerms = (text: string) => splitTerms(text).filter((p) => p.term).map((p) => p.term!);

/** 오퍼레이터 추천 빌드 — 레벨 90 · 잠재 0 · 무기 재련 0 · 재능 배열 완료 기준 (빌드 시 미리 계산) */
export function getBuildRecommendation(id: string): BuildRecommendation | undefined {
  const op = operators.find((o) => o.id === id);
  const base = operatorBase(id);
  if (!op || !base) return undefined;
  const talents = talentBag(combatChars[id].talents.attributes);
  const candidates = Object.entries(combatWeapons).filter(([wid]) => weapons.find((w) => w.id === wid)?.type === op.weaponType);
  const ranked = rankWeapons(base, talents, candidates).map((r) => ({
    ...r,
    official: op.recommendedWeapons.skill.includes(r.id) ? ("skill" as const) : op.recommendedWeapons.attribute.includes(r.id) ? ("attribute" as const) : null,
    image: weapons.find((w) => w.id === r.id)?.image,
  }));
  // 장비는 1위 무기를 낀 상태로 비교
  const topWeapon = ranked[0] ? combatWeapons[ranked[0].id] : undefined;
  const withWeapon = topWeapon ? addBag(talents, weaponBag(topWeapon).bag) : talents;
  const gear = rankGear(base, topWeapon?.baseAtk.at(-1) ?? 0, withWeapon, Object.entries(gearPieces), Object.entries(gearSuits));
  return { weapons: ranked, gear, synergy: synergy(id, synergyIndex(), findTerms) };
}
