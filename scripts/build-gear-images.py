"""장비 이미지 정리: src/images/장비/ → public/gear/

- 파일명(장비 이름)으로 data/combat/gear.json 의 pieces 와 매칭
- *.png → public/gear/{piece id}.webp (160px 아이콘)
- 매칭 결과는 data/gear-images.json 에 기록 (세트 대표 이미지 = 세트의 방어구 부위)

실행: python3 scripts/build-gear-images.py  (Pillow 필요, 이미 변환된 파일은 건너뜀)
"""
import json
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "images" / "장비"
OUT = ROOT / "public" / "gear"
SIZE = 160

# 이미지 파일명이 데이터 표기와 다른 경우 (파일명 → 데이터 이름)
ALIAS = {"간편 글러브": "간편 보호 장갑"}  # 같은 부위(장갑) 중 이미지가 없던 유일한 항목


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    for ch in ':/\\?*"<>|':
        s = s.replace(ch, "")
    return " ".join(s.split())


def is_valid_image(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


gear = json.loads((ROOT / "data" / "combat" / "gear.json").read_text(encoding="utf-8"))
pieces = gear["pieces"]
by_name = {norm(p["name"]): pid for pid, p in pieces.items()}

OUT.mkdir(parents=True, exist_ok=True)
images, unmatched = {}, []
for f in sorted(SRC.iterdir()):
    if f.suffix.lower() != ".png":
        continue
    stem = norm(f.stem)
    pid = by_name.get(norm(ALIAS.get(stem, stem)))
    if not pid:
        unmatched.append(f.name)
        continue
    dst = OUT / f"{pid}.webp"
    if not is_valid_image(dst) or dst.stat().st_mtime < f.stat().st_mtime:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        tmp = dst.with_suffix(".tmp.webp")
        im.save(tmp, "WEBP", quality=88, method=6)
        tmp.replace(dst)
    images[pid] = f"/gear/{pid}.webp"

# 세트 대표 이미지: 방어구(partType 0) → 없으면 아무 부위
suits = {}
for pid, p in sorted(pieces.items()):
    sid = p.get("suitId")
    if not sid or pid not in images:
        continue
    if sid not in suits or (p.get("partType") == 0 and pieces[suits[sid]].get("partType") != 0):
        suits[sid] = pid
suit_images = {sid: images[pid] for sid, pid in sorted(suits.items())}

missing = [p["name"] for pid, p in pieces.items() if pid not in images]
(ROOT / "data" / "gear-images.json").write_text(
    json.dumps(
        {
            "_meta": {"source": "src/images/장비/*.png (사용자 제공)", "missing": missing, "alias": ALIAS},
            "pieces": dict(sorted(images.items())),
            "suits": suit_images,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
print(f"pieces {len(images)}/{len(pieces)} suits {len(suit_images)}/{len(gear['suits'])}; missing={missing}; unmatched={unmatched}")
