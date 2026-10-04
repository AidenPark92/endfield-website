"""오퍼레이터 기본 능력치(레벨별) 추출: 게임 데이터 테이블 → data/operator-stats.json

원본: EndFieldGameData (게임 클라이언트에서 추출한 텍스트 테이블)
  https://github.com/3aKHP/EndFieldGameData  releases → endfield-tables.zip
  필요한 파일: tables/CharacterTable.json, i18n/KR.json

실행: python3 scripts/build-operator-stats.py <압축 푼 폴더>   (기본값: ~/egd)

- attributes 의 attrType: 0=레벨, 1=생명력, 2=공격력, 3=방어력, 9=치명타 확률,
  39=힘, 40=민첩, 41=지능, 42=의지  (주/보조 능력치 타입과 위키 표기를 대조해 확인)
- 돌파 경계 레벨(20/40/60/80)은 돌파 전·후 수치가 같아서 레벨별 1개 값만 저장
- 레벨 1~90만 저장 (테이블에는 그 이상 행도 있으나 현재 최대 레벨은 90)
- 무기·장비·잠재·재능 보너스는 포함하지 않은 '캐릭터 기본치'
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "egd").expanduser()
MAX_LV = 90

ATTR = {1: "hp", 2: "atk", 3: "def", 39: "str", 40: "agi", 41: "int", 42: "wil"}
ATTR_KO = {39: "힘", 40: "민첩", 41: "지능", 42: "의지"}
# 이름만으로 구분이 안 되는 캐릭터
CHAR_ID_OVERRIDE = {"chr_0002_endminm": "2", "chr_0003_endminf": "3"}
SKIP = {"chr_9000_endmin"}  # 관리자 공용(플레이 불가) 항목

table = json.loads((SRC / "tables" / "CharacterTable.json").read_text(encoding="utf-8"))
kr = json.loads((SRC / "i18n" / "KR.json").read_text(encoding="utf-8"))
operators = json.loads((ROOT / "data" / "operators.json").read_text(encoding="utf-8"))
operators = operators["operators"] if isinstance(operators, dict) else operators
by_name = {o["name"]: o for o in operators}

stats = {}
unmatched = []
for char_id, c in table.items():
    if char_id in SKIP:
        continue
    name = kr.get(str(c["name"]["id"]), "")
    op_id = CHAR_ID_OVERRIDE.get(char_id) or (by_name[name]["id"] if name in by_name else None)
    if not op_id:
        unmatched.append(f"{char_id}({name})")
        continue

    per_level = {}
    crit = None
    for row in c["attributes"]:
        a = {t["attrType"]: t["attrValue"] for t in row["Attribute"]["attrs"]}
        lv = int(a[0])
        if lv > MAX_LV:
            continue
        per_level[lv] = a
        crit = a.get(9, crit)
    levels = sorted(per_level)
    assert levels == list(range(1, MAX_LV + 1)), f"{char_id}: 레벨 누락 {levels[:3]}..{levels[-3:]}"

    curve = {key: [round(per_level[lv].get(t, 0.0), 4) for lv in levels] for t, key in ATTR.items()}
    stats[op_id] = {
        "charId": char_id,
        "mainAttr": ATTR_KO[c["mainAttrType"]],
        "subAttr": ATTR_KO[c["subAttrType"]],
        "critRate": crit,
        **curve,
    }

missing = [o["name"] for o in operators if o["id"] not in stats]
# 위키(operators.json) 주/보조 능력치와 게임 테이블이 다르면 기록
attr_mismatch = [
    f'{o["name"]}: 위키 {o["mainStat"]}/{o["subStat"]} ↔ 테이블 {stats[o["id"]]["mainAttr"]}/{stats[o["id"]]["subAttr"]}'
    for o in operators
    if o["id"] in stats and (o["mainStat"], o["subStat"]) != (stats[o["id"]]["mainAttr"], stats[o["id"]]["subAttr"])
]

out = {
    "_meta": {
        "source": "EndFieldGameData v0.3.0 tables/CharacterTable.json (게임 클라이언트 추출, 2026-06 기준)",
        "note": "캐릭터 기본치(무기·장비·잠재·재능 미포함). 배열 인덱스 0 = 레벨 1. 화면 표시는 내림 처리",
        "missing": missing,  # TODO: 추출 시점 이후 출시 캐릭터 — 새 테이블로 다시 실행 필요
        "attrMismatch": attr_mismatch,  # TODO: 인게임 확인 필요
    },
    "stats": dict(sorted(stats.items(), key=lambda kv: int(kv[0]))),
}
(ROOT / "data" / "operator-stats.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"stats {len(stats)} / {len(operators)}; missing={missing}; unmatched={unmatched}; mismatch={attr_mismatch}")
