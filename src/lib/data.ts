// /data/*.json 을 타입과 함께 노출하는 단일 진입점
import statsJson from "@data/essence-stats.json";
import regionsJson from "@data/essence-regions.json";
import weaponsJson from "@data/weapons.json";
import operatorsJson from "@data/operators.json";
import type { EssenceRegion, EssenceStats, Operator, Weapon } from "@/types/game";

export const essenceStats: EssenceStats = statsJson;
export const essenceRegions: EssenceRegion[] = regionsJson.regions;
export const essenceRegionsMeta = regionsJson._meta;
export const weapons = weaponsJson.weapons as Weapon[];
export const operators = operatorsJson.operators as Operator[];
