"""데미지 계산용 게임 데이터 정리: endfieldtools.dev 원본 → data/combat/*.json

원본 (data/raw/endfieldtools/)
  - bundle.json.gz : https://endfieldtools.dev/localdb (게임 클라이언트 데이터 기반) 를 그대로 묶은 것
      캐릭터 상세(스킬 레벨별 blackboard·잠재·재능·돌파), 무기 상세(레벨 곡선·스킬 레벨별 수치·돌파·재련),
      장비(부위별 옵션)·세트 효과, 아이템, 한국어 텍스트(I18nTextTable_KR)
  - skill-talents.json : SkillPatchTable 중 재능/잠재/세트 패시브만 발췌 (일부 캐릭터만 있음)

결과 (data/combat/)
  - characters.json : 오퍼레이터 id(operators.json) 기준. 레벨 1~90 능력치, 스킬(그룹 → 세부 스킬 → 레벨 1~12 blackboard),
                      잠재 1~5, 재능(능력치 노드·패시브·인프라), 돌파·스킬 레벨업 재료
  - weapons.json    : 무기 id(weapons.json) 기준. 레벨 1~90 기초 공격력, 스킬 3개 레벨별 수치, 돌파/재련별 스킬 레벨 범위
  - gear.json       : 장비 부위별 옵션(단조 0~3단계 값), 세트 효과
  - attr-types.json : attrType 번호 → 이름 (게임 enum, 이름은 endfieldtools 표시명을 한국어로 옮김)
  - 그리고 data/operator-stats.json 을 이 데이터(최신, 전원)로 다시 만든다

원칙: 값은 그대로 옮긴다(문자열 숫자 → 숫자 변환만). {"id": ...} 텍스트 참조는 한국어로 풀어 둔다.
실행: python3 scripts/build-combat-data.py
"""
import gzip
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "endfieldtools"
OUT = ROOT / "data" / "combat"
MAX_LV = 90

# attrType enum (게임 내부 번호). 이름: endfieldtools 표시명 번역. kind: flat(고정값) / ratio(비율, 0.1=10%) / mult(배수, 1=변화 없음)
ATTR_TYPES = {
    0: ("기본", "flat"), 1: ("생명력", "flat"), 2: ("공격력", "flat"), 3: ("방어력", "flat"),
    4: ("받는 물리 피해", "mult"), 5: ("받는 열기 피해", "mult"), 6: ("받는 전기 피해", "mult"), 7: ("받는 냉기 피해", "mult"),
    9: ("치명타 확률", "ratio"), 10: ("치명타 피해", "ratio"), 13: ("공격 속도 배수", "mult"),
    17: ("일반 공격 피해", "ratio"), 25: ("미확인 25", "mult"), 26: ("불균형 효율", "mult"),
    28: ("궁극기 피해", "ratio"), 29: ("치유 효과", "ratio"), 30: ("받는 치유 효과", "ratio"),
    32: ("배틀 스킬 피해", "ratio"), 33: ("연계 스킬 피해", "ratio"),
    35: ("열기 폭발 피해", "ratio"), 36: ("전기 폭발 피해", "ratio"), 37: ("냉기 폭발 피해", "ratio"), 38: ("자연 폭발 피해", "ratio"),
    39: ("힘", "flat"), 40: ("민첩", "flat"), 41: ("지능", "flat"), 42: ("의지", "flat"),
    44: ("궁극기 에너지 획득", "ratio"), 47: ("연계 스킬 쿨타임", "mult"), 48: ("받는 자연 피해", "mult"), 49: ("미확인 49", "mult"),
    50: ("물리 피해", "ratio"), 51: ("열기 피해", "ratio"), 52: ("전기 피해", "ratio"), 53: ("냉기 피해", "ratio"), 54: ("자연 피해", "ratio"),
    55: ("받는 에테르 피해", "mult"), 56: ("열기 이상 피해", "ratio"), 57: ("전기 이상 피해", "ratio"),
    58: ("냉기 이상 피해", "ratio"), 59: ("자연 이상 피해", "ratio"), 60: ("받는 에테르 피해 2", "mult"),
    61: ("불균형 상태 적에게 주는 피해", "ratio"), 87: ("오리지늄 아츠 강도", "flat"),
}
ATTR_KEY = {1: "hp", 2: "atk", 3: "def", 39: "str", 40: "agi", 41: "int", 42: "wil"}
ATTR_KO = {39: "힘", 40: "민첩", 41: "지능", 42: "의지"}
ELEMENT = {"Physical": "물리", "Fire": "열기", "Pulse": "전기", "Cryst": "냉기", "Natural": "자연"}
WEAPON_TYPE = {1: "한손검", 2: "아츠 유닛", 3: "양손검", 5: "장병기", 6: "권총"}
GROUP_TYPE = {0: "일반 공격", 1: "배틀 스킬", 2: "궁극기", 3: "연계 스킬"}
CHAR_ID_OVERRIDE = {"chr_0002_endminm": "2", "chr_0003_endminf": "3"}
SKIP_CHARS = {"chr_9000_endmin"}  # 플레이 불가 공용 항목


def num(v):
    """'0.2000000029' 같은 문자열 숫자 → 숫자 (float32 잡음은 소수 6자리로 정리)"""
    if isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?(e-?\d+)?", v):
        v = float(v)
    if isinstance(v, float):
        r = round(v, 6)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    return v


class Text:
    def __init__(self, tables: list[dict]):
        self.t = {}
        for tb in tables:
            self.t.update(tb)

    def __call__(self, ref) -> str | None:
        if isinstance(ref, dict):
            ref = ref.get("id")
        return self.t.get(str(ref)) if ref not in (None, "", "0") else None


def clean(o, tx: Text):
    """재귀 정리: 숫자 문자열 → 숫자, {"id","text"} 텍스트 참조 → 한국어 문자열"""
    if isinstance(o, dict):
        if set(o.keys()) <= {"id", "text"} and "id" in o and re.fullmatch(r"-?\d+", str(o["id"])):
            return tx(o) or o.get("text") or None
        return {k: clean(v, tx) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v, tx) for v in o]
    return num(o)


def bb(blackboard) -> dict:
    return {x["key"]: num(x.get("value")) for x in blackboard or []}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "")
    for ch in ':/\\?*"<>|':
        s = s.replace(ch, "")
    return " ".join(s.split())


def load():
    files = json.loads(gzip.decompress((RAW / "bundle.json.gz").read_bytes()))
    meta, f = files["meta"], files["files"]
    tx = Text([v for k, v in f.items() if "I18nTextTable_KR" in k])
    talents_extra = json.loads((RAW / "skill-talents.json").read_text(encoding="utf-8"))["data"]
    return meta, f, tx, talents_extra


def build_characters(f, tx, talents_extra, operators):
    by_name = {o["name"]: o for o in operators}
    out, unmatched = {}, []
    for char_id, lite in f["/localdb/optimized/characters/characters-list.json"].items():
        if char_id in SKIP_CHARS:
            continue
        name = tx(lite["nameI18nId"]) or ""
        op_id = CHAR_ID_OVERRIDE.get(char_id) or (by_name[name]["id"] if name in by_name else None)
        if not op_id:
            unmatched.append(f"{char_id}({name})")
            continue
        d = f[f"/localdb/optimized/characters/details/{char_id}.json"]

        # 레벨 1~90 능력치 (돌파 경계 레벨은 전후 동일)
        per = {}
        for row in d["attributes"]:
            a = {int(t["attrType"]): num(t["attrValue"]) for t in row["Attribute"]["attrs"]}
            if a[0] <= MAX_LV:
                per[int(a[0])] = a
        assert sorted(per) == list(range(1, MAX_LV + 1)), char_id
        curve = {key: [per[lv].get(t, 0) for lv in range(1, MAX_LV + 1)] for t, key in ATTR_KEY.items()}
        crit = per[MAX_LV].get(9)

        # 스킬: 그룹(일반 공격/배틀/연계/궁극기) → 세부 스킬 → 레벨별
        tal = d["talents"]
        groups = []
        for g in tal["skillGroupMap"].values():
            skills = []
            for sid in g["skillIdList"]:
                bundle = (d["skills"].get(sid) or {}).get("SkillPatchDataBundle") or []
                skills.append({
                    "skillId": sid,
                    "part": sid.replace(char_id + "_", ""),
                    "levels": [
                        {
                            "level": x["level"],
                            "costType": x.get("costType"),
                            "costValue": num(x.get("costValue")),
                            "coolDown": num(x.get("coolDown")),
                            "bb": bb(x.get("blackboard")),
                            "display": [{"label": tx(s.get("name")), "value": s.get("desc")} for s in x.get("subDescDataList") or []],
                        }
                        for x in sorted(bundle, key=lambda x: x["level"])
                    ],
                })
            groups.append({
                "type": GROUP_TYPE.get(g["skillGroupType"], str(g["skillGroupType"])),
                "groupId": g["skillGroupId"],
                "name": tx(g.get("name")),
                "desc": tx(g.get("desc")),
                "skills": skills,
            })
        groups.sort(key=lambda g: list(GROUP_TYPE.values()).index(g["type"]) if g["type"] in GROUP_TYPE.values() else 9)

        # 잠재 1~5
        potentials = [
            {
                "level": p["level"],
                "name": tx(p["name"]),
                "desc": tx(p["effectData"].get("desc")),
                "effects": clean(p["effectData"].get("dataList"), tx),
            }
            for p in sorted(d["potentials"]["potentialUnlockBundle"], key=lambda p: p["level"])
        ]

        # 재능 노드: 능력치(3) / 패시브(4) / 인프라(5) / 돌파(1) / 장비 조합(2)
        attr_nodes, passives, breaks = [], [], []
        for node in tal["talentNodeMap"].values():
            t = node["nodeType"]
            if t == 3:
                a = node["attributeNodeInfo"]
                attr_nodes.append({
                    "nodeId": node["nodeId"], "breakStage": a.get("breakStage"), "favorability": a.get("favorability"),
                    "title": tx(a.get("title")), "desc": tx(a.get("desc")),
                    "attrs": [{"attrType": m["attrType"], "value": num(m["attrValue"]), "modifierType": m["modifierType"]} for m in a.get("attributeModifiers", [])],
                    "materials": node.get("requiredItem", []),
                })
            elif t == 4:
                p = node["passiveSkillNodeInfo"]
                eff = p.get("effectData") or {}
                passives.append({
                    "nodeId": node["nodeId"], "index": p["index"], "level": p["level"], "breakStage": p["breakStage"],
                    "name": tx(p.get("name")), "desc": tx(eff.get("desc")),
                    "effects": clean(eff.get("dataList"), tx),
                    "materials": node.get("requiredItem", []),
                })
            elif t in (1, 2):
                c = tal["charBreakCostMap"].get(node["nodeId"], {})
                breaks.append({"nodeId": node["nodeId"], "kind": "정예화" if t == 1 else "장비 조합", "breakStage": c.get("breakStage"),
                               "name": tx(c.get("name")), "materials": node.get("requiredItem", [])})
        attr_nodes.sort(key=lambda x: (x["breakStage"] or 0, x["nodeId"]))
        passives.sort(key=lambda x: (x["index"], x["level"]))
        breaks.sort(key=lambda x: (x["breakStage"] or 0, x["kind"]))

        # SkillPatchTable 의 재능 패시브 수치 (있는 캐릭터만)
        talent_bb = {k: [bb(x.get("blackboard")) for x in v["SkillPatchDataBundle"]] for k, v in talents_extra.items() if k.startswith(char_id + "_talent")}

        out[op_id] = {
            "charId": char_id,
            "name": name,
            "rarity": lite["rarity"],
            "element": ELEMENT.get(lite["charTypeId"], lite["charTypeId"]),
            "mainAttr": ATTR_KO[lite["mainAttrType"]],
            "subAttr": ATTR_KO[lite["subAttrType"]],
            "critRate": crit,
            "curve": curve,
            "skillGroups": groups,
            "skillLevelUp": clean(list(tal.get("skillLevelUp", {}).values()), tx),
            "potentials": potentials,
            "talents": {"attributes": attr_nodes, "passives": passives, "breaks": breaks, "passiveSkillBlackboards": talent_bb},
        }
    return dict(sorted(out.items(), key=lambda kv: int(kv[0]))), unmatched


def build_weapons(f, tx, weapons_ours):
    curves = f["/localdb/endfield_data/WeaponUpgradeTemplateTable.json"]
    by_name = {norm_name(w["name"]): w for w in weapons_ours}
    # 일부 무기는 한국어 이름 텍스트가 영문으로 남아 있어, 고유 특성(3번째 스킬) 이름 + 등급으로도 맞춘다
    by_trait = {(norm_name(w.get("trait", "")), w["rarity"], w["type"]): w for w in weapons_ours if w.get("trait")}
    out, unmatched = {}, []
    for wid in f["/localdb/optimized/weapons/weapons-list.json"]:
        d = f[f"/localdb/optimized/weapons/details/{wid}.json"]
        name = tx(d["nameI18nId"]) or ""
        trait = tx(d["skills"][d["weaponSkillList"][-1]]["SkillPatchDataBundle"][0].get("skillName")) or ""
        ours = by_name.get(norm_name(name)) or by_trait.get((norm_name(trait), d["rarity"], WEAPON_TYPE.get(d["weaponType"])))
        if not ours:
            unmatched.append(f"{wid}({name})")
            continue
        curve = sorted(curves[d["levelTemplateId"]]["list"], key=lambda x: x["weaponLv"])
        skills = []
        for sid in d["weaponSkillList"]:
            bundle = sorted(d["skills"][sid]["SkillPatchDataBundle"], key=lambda x: x["level"])
            first = bundle[0]
            skills.append({
                "skillId": sid,
                "name": tx(first.get("skillName")),
                "desc": tx(first.get("description")),
                "levels": [{"level": x["level"], "bb": bb(x.get("blackboard"))} for x in bundle],
            })
        prog = d["progression"]["breakthrough"]["list"]
        out[ours["id"]] = {
            "weaponId": wid,
            "name": ours["name"],
            "rarity": d["rarity"],
            "weaponType": d["weaponType"],
            "baseAtk": [num(x["baseAtk"]) for x in curve][:MAX_LV],
            "skills": skills,
            "breakthroughs": [
                {"stage": b["breakthroughShowLv"], "level": b["breakthroughLv"], "skillLevelBounds": b["skillLevelBounds"],
                 "materials": b.get("breakItemList", []), "gold": b.get("breakthroughGold")}
                for b in prog
            ],
            "potentials": [{"level": t["talentLv"], "skillLevelExtraBounds": t["skillLevelExtraBounds"]} for t in d["talents"]["list"]],
        }
    return dict(sorted(out.items(), key=lambda kv: int(kv[0]))), unmatched


def build_gear(f, tx):
    suits = {}
    for sid, s in f["/localdb/optimized/equipment/suits/suits-list.json"].items():
        suits[sid] = {
            "name": tx(s["suitNameI18nId"]),
            "tier": s.get("tier"),
            "pieces": s["equipList"],
            "effects": [
                {"pieces": e["piecesRequired"], "desc": tx(e.get("descriptionI18nId")), "bb": {k: num(v) for k, v in (e.get("blackboardValues") or {}).items()}}
                for e in s.get("setEffects", [])
            ],
        }
    pieces = {}
    for iid, e in f["/localdb/optimized/equipment/equipment-list.json"].items():
        d = f.get(f"/localdb/optimized/equipment/details/{iid}.json") or {}
        pieces[iid] = {
            "name": tx(e.get("nameI18nId")),
            "minWearLv": e.get("minWearLv"),
            "suitId": d.get("suitID") or None,
            "partType": d.get("partType"),
            # attrValues: 단조 0~3단계 값
            "attrs": [{"attrType": a["attrType"], "values": [num(v) for v in a["attrValues"]], "modifierType": a["modifierType"]} for a in d.get("equipAttrModifiers", [])],
        }
    return {"suits": suits, "pieces": pieces}


def main():
    meta, f, tx, talents_extra = load()
    operators = json.loads((ROOT / "data" / "operators.json").read_text(encoding="utf-8"))["operators"]
    weapons_ours = json.loads((ROOT / "data" / "weapons.json").read_text(encoding="utf-8"))["weapons"]

    chars, un_c = build_characters(f, tx, talents_extra, operators)
    weps, un_w = build_weapons(f, tx, weapons_ours)
    gear = build_gear(f, tx)
    missing_c = [o["name"] for o in operators if o["id"] not in chars]
    missing_w = [w["name"] for w in weapons_ours if w["id"] not in weps]

    src = {"source": meta["source"], "fetchedAt": meta["fetchedAt"], "note": "게임 클라이언트 데이터 기반(endfieldtools.dev localdb). 값은 원본 그대로, 텍스트 참조만 한국어로 풀어 둠"}
    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda name, data, extra=None: (OUT / name).write_text(json.dumps({"_meta": {**src, **(extra or {})}, **data}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    dump("characters.json", {"characters": chars}, {"missing": missing_c, "unmatched": un_c})
    dump("weapons.json", {"weapons": weps}, {"missing": missing_w, "unmatched": un_w})
    dump("gear.json", gear)
    (OUT / "attr-types.json").write_text(json.dumps({"_meta": {"note": "게임 attrType 번호. 이름은 endfieldtools 표시명 번역(미확인 항목은 '미확인 N'). kind: flat/ratio(0.1=10%)/mult(1=변화 없음)"},
                                                     "attrTypes": {str(k): {"name": v[0], "kind": v[1]} for k, v in ATTR_TYPES.items()}}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # 기존 operator-stats.json 을 최신·전원 데이터로 교체 (형식 유지)
    stats = {
        oid: {"charId": c["charId"], "mainAttr": c["mainAttr"], "subAttr": c["subAttr"], "critRate": c["critRate"], **c["curve"]}
        for oid, c in chars.items()
    }
    (ROOT / "data" / "operator-stats.json").write_text(json.dumps({
        "_meta": {"source": meta["source"] + " characters/details (게임 클라이언트 데이터 기반)", "fetchedAt": meta["fetchedAt"],
                  "note": "캐릭터 기본치(무기·장비·잠재·재능 미포함). 배열 인덱스 0 = 레벨 1. 화면 표시는 내림 처리", "missing": missing_c},
        "stats": stats,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"characters {len(chars)}/{len(operators)} missing={missing_c} unmatched={un_c}")
    print(f"weapons {len(weps)}/{len(weapons_ours)} missing={missing_w} unmatched={un_w}")
    print(f"gear suits {len(gear['suits'])} pieces {len(gear['pieces'])}")


if __name__ == "__main__":
    main()
