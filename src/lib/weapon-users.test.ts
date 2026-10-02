import { describe, expect, it } from "vitest";
import { buildWeaponUsers, userLabel } from "./weapon-users";
import operatorsJson from "@data/operators.json";
import weaponsJson from "@data/weapons.json";
import profilesJson from "@data/operator-profiles.json";
import opImagesJson from "@data/operator-images.json";

const op = (id: string, rarity: number, skill: string[], attribute: string[]) => ({ id, rarity, recommendedWeapons: { skill, attribute } });

describe("buildWeaponUsers", () => {
  it("스킬 1순위 → 스킬 → 속성 순, 같으면 등급 높은 순", () => {
    const m = buildWeaponUsers([op("a", 5, ["w2", "w1"], []), op("b", 6, ["w1"], []), op("c", 6, [], ["w1"]), op("d", 4, ["w1"], [])]);
    expect(m.w1.map((u) => u.operatorId)).toEqual(["b", "d", "a", "c"]);
    expect(userLabel(m.w1[0])).toBe("추천 1순위");
    expect(userLabel(m.w1[3])).toBe("속성 조합 추천");
  });

  it("두 목록에 모두 있으면 한 번만", () => {
    const m = buildWeaponUsers([op("a", 6, ["w1"], ["w1"])]);
    expect(m.w1).toHaveLength(1);
    expect(m.w1[0].kind).toBe("skill");
  });
});

describe("캐릭터 데이터 무결성", () => {
  const ids = operatorsJson.operators.map((o) => o.id);
  it("모든 오퍼레이터에 프로필·이미지가 있다", () => {
    for (const id of ids) {
      expect(profilesJson.profiles[id as keyof typeof profilesJson.profiles], id).toBeTruthy();
      expect(opImagesJson.full[id as keyof typeof opImagesJson.full], id).toBeTruthy();
      expect(opImagesJson.face[id as keyof typeof opImagesJson.face], id).toBeTruthy();
    }
  });
  it("추천 무기는 모두 무기 데이터에 있다", () => {
    const users = buildWeaponUsers(operatorsJson.operators);
    const wIds = new Set(weaponsJson.weapons.map((w) => w.id));
    Object.keys(users).forEach((w) => expect(wIds.has(w), w).toBe(true));
  });
});
