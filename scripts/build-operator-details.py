"""오퍼레이터 상세 정보 정리: 공식 위키 원본 → data/operator-details.json

원본: data/raw/operators_wiki_raw.json
  - SKPORT 공식 위키(wiki.skport.com/endfield) 오퍼레이터 상세 페이지의 표를 그대로 수집한 것
    (사용자 PC 내장 브라우저에서 페이지를 열어 표 셀 텍스트를 추출, 2026-10-04)
  - 항목마다 tables: [{ctx: 표 주변 텍스트, rows: [[셀, ...], ...]}]

정리 결과 (오퍼레이터 id 별):
  - stats: 레벨 1/20/40/60/80/90 의 힘·민첩·지능·의지·기초 공격력·기초 생명력, 주/보조 능력치
  - levelMaterials: 레벨 구간별 경험치 재료
  - skills: 일반 공격/배틀 스킬/연계 스킬/궁극기 — 이름, 설명, 랭크(1~9, 마스터리 I~III)별 수치, 랭크업 재료
  - talents: 재능 배열(능력치), 오퍼레이터 재능, 인프라 스킬, 정예화, 장비 조합 — 단계별 효과·조건·재료
  - potentials: 잠재능력 1~5 이름·효과

실행: python3 scripts/build-operator-details.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "operators_wiki_raw.json"
OUT = ROOT / "data" / "operator-details.json"

LEVELS = [1, 20, 40, 60, 80, 90]
STAT_ROWS = {"힘": "str", "민첩": "agi", "지능": "int", "의지": "wil", "기초 공격력": "atk", "기초 생명력": "hp"}
SKILL_TYPES = ["일반 공격", "배틀 스킬", "연계 스킬", "궁극기"]
TALENT_CATEGORIES = ["능력치 증가", "오퍼레이터 재능", "인프라 스킬", "정예화", "장비 조합"]
NUM_RE = re.compile(r"^(-?\d+(?:\.\d+)?)(%|초)?$")


def norm(s: str) -> str:
    """줄바꿈 없는 공백(nbsp) 정리, 표기 흔들림 통일 ('RANK 1' → 'RANK1', '제 1단계' → '제1단계')"""
    s = (s or "").replace("\xa0", " ")
    s = re.sub(r"RANK\s+(\d)", r"RANK\1", s)
    s = re.sub(r"제\s+(\d)단계", r"제\1단계", s)
    return s


def lines(s: str) -> list[str]:
    return [x.strip() for x in norm(s).split("\n") if x.strip()]


def parse_materials(cell: str) -> list[dict]:
    """'6\\n프로토콜 프리즘\\n1\\n칼코덴드라' → [{item, count}]"""
    ls = [x for x in lines(cell) if not x.startswith("일괄 채우기")]
    if not ls or ls == ["-"]:
        return []
    out = []
    i = 0
    while i + 1 < len(ls):
        if re.fullmatch(r"\d+", ls[i]):
            out.append({"item": ls[i + 1], "count": int(ls[i])})
            i += 2
        else:
            i += 1
    return out


def parse_values(cells: list[str]) -> dict:
    """랭크별 수치. 모두 숫자면 values(number[]) + unit, 아니면 raw(string[])"""
    nums, units = [], set()
    for c in cells:
        m = NUM_RE.match(c.replace(",", "").strip())
        if not m:
            return {"raw": cells}
        nums.append(float(m.group(1)) if "." in m.group(1) else int(m.group(1)))
        units.add(m.group(2) or "")
    if len(units) > 1:
        return {"raw": cells}
    return {"values": nums, "unit": units.pop()}


def header(t) -> list[str]:
    return [norm(c) for c in t["rows"][0]] if t["rows"] else []


def kind(t) -> str:
    h = header(t)
    if any("RANK1" in x for x in h):
        return "skill"
    if "LV.1" in h:
        return "stats"
    if "활성화 후" in h:
        return "act"
    if any("잠재능력 0" in x for x in h):
        return "potential"
    return "other"


def parse_stats(t) -> dict:
    stats, main, sub = {}, None, None
    for row in t["rows"][1:]:
        label = norm(row[0])
        base = label.split("(")[0].strip()
        if base in STAT_ROWS:
            stats[STAT_ROWS[base]] = [int(float(v)) for v in row[1:7]]
            if "주요 능력치" in label:
                main = base
            if "보조 능력치" in label:
                sub = base
    return {"levels": LEVELS, "mainAttr": main, "subAttr": sub, **stats}


def parse_level_materials(t) -> list[dict]:
    for row in t["rows"]:
        if row[0] == "재료 소모":
            return [
                {"from": LEVELS[i - 1], "to": LEVELS[i], "materials": parse_materials(row[i + 1])}
                for i in range(1, len(LEVELS))
            ]
    return []


def parse_skill(t) -> dict:
    ctx = lines(t["ctx"])
    name, stype = ctx[0], ctx[1] if len(ctx) > 1 else ""
    assert stype in SKILL_TYPES, f"스킬 유형 인식 실패: {ctx[:2]}"
    ranks = header(t)[1:]
    params, materials = [], []
    for row in t["rows"][1:]:
        if row[0] == "재료 소모":
            materials = [{"rank": ranks[i], "materials": parse_materials(c)} for i, c in enumerate(row[1:])]
            continue
        params.append({"label": norm(row[0]).strip(), **parse_values(row[1:])})
    return {"type": stype, "name": name, "description": "\n".join(ctx[2:]), "ranks": ranks, "params": params, "materials": materials}


def parse_act(t) -> dict | None:
    ctx = lines(t["ctx"])
    if len(ctx) < 2:
        return None
    name, category = ctx[0], ctx[1]
    if category not in TALENT_CATEGORIES:
        return None
    stages = []
    for row in t["rows"][1:]:
        if len(row) < 4:
            continue
        stages.append({
            "label": norm(row[0]).strip(),
            "effect": "\n".join(lines(row[1])),
            "conditions": lines(row[2]),
            "materials": parse_materials(row[3]),
        })
    cat = "재능 배열" if category == "능력치 증가" else category
    return {"category": cat, "name": name, "stages": stages}


def parse_potentials(t) -> list[dict]:
    out = []
    for row in t["rows"]:  # 첫 행(헤더 자리)도 잠재능력 01
        cells = [c for c in row if c]
        if len(cells) < 2:
            continue
        head = lines(cells[0])
        m = re.search(r"잠재능력 0?(\d)", cells[0])
        if not m:
            continue
        effect = [x for x in lines(cells[1]) if "기념사진" not in x]
        out.append({"level": int(m.group(1)), "name": head[0], "effect": "\n".join(effect)})
    return sorted(out, key=lambda p: p["level"])


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    result, problems = {}, []
    for oid, o in raw["operators"].items():
        entry = {"name": o["pageName"], "skills": [], "talents": [], "potentials": []}
        for t in o["tables"]:
            k = kind(t)
            try:
                if k == "stats":
                    entry["stats"] = parse_stats(t)
                    entry["levelMaterials"] = parse_level_materials(t)
                elif k == "skill":
                    entry["skills"].append(parse_skill(t))
                elif k == "act":
                    a = parse_act(t)
                    if a:
                        entry["talents"].append(a)
                elif k == "potential":
                    entry["potentials"] = parse_potentials(t)
            except Exception as e:  # noqa: BLE001 — 어떤 표가 깨졌는지 기록하고 계속
                problems.append(f"{oid} {o['pageName']}: {k} 표 파싱 실패 ({e})")
        for s in entry["skills"]:
            for prm in s["params"]:
                if "raw" in prm:  # 위키 표기 오류 의심 (예: '1925' → 192%?) — 추측해서 고치지 않음
                    problems.append(f"{oid} {o['pageName']}: {s['name']} / {prm['label']} 숫자 아닌 값 {prm['raw']}")
        types = [s["type"] for s in entry["skills"]]
        if sorted(set(types), key=SKILL_TYPES.index) != SKILL_TYPES:
            problems.append(f"{oid} {o['pageName']}: 스킬 구성 {types}")
        if len(entry["potentials"]) != 5:
            problems.append(f"{oid} {o['pageName']}: 잠재능력 {len(entry['potentials'])}개")
        if "stats" not in entry or not all(k in entry["stats"] for k in STAT_ROWS.values()):
            problems.append(f"{oid} {o['pageName']}: 능력치 표 없음/불완전")
        result[oid] = entry

    out = {
        "_meta": {
            "source": raw["source"],
            "collectedAt": raw["collectedAt"],
            "note": "SKPORT 공식 위키 표를 그대로 옮긴 값. 수치 추측 없음. values 는 표기 단위(unit) 그대로(예: 178 + '%').",
            "problems": problems,  # TODO: 비어 있지 않으면 원본 확인
        },
        "operators": dict(sorted(result.items(), key=lambda kv: int(kv[0]))),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"operators {len(result)}; problems={len(problems)}")
    for p in problems:
        print(" -", p)


if __name__ == "__main__":
    main()
