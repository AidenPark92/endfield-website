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
import type { CombatCharacter } from "@/types/combat";
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
    // 게임 텍스트에 설명이 없는 스킬(결 연계 스킬)은 공식 위키 설명으로 채움
    skillGroups: c.skillGroups.map((g) =>
      g.desc
        ? g
        : { ...g, desc: opDetails[id]?.skills.filter((w) => w.type === g.type).map((w) => `[${w.name}]\n${w.description}`).join("\n\n") || null },
    ),
    potentials: c.potentials,
    talents: { attributes: c.talents.attributes, passives: c.talents.passives },
  };
}
