"""무기 이미지 정리: src/images/무기/*.png → public/weapons/{무기id}.webp

- 파일명(무기 이름)으로 data/weapons.json 과 매칭 (윈도우에서 쓸 수 없는 ':' 는 빠져 있어도 매칭)
- 256px webp 로 줄여서 저장, 매칭 결과는 data/weapon-images.json 에 기록
- GIF(연출 영상)는 용량이 커서 사용하지 않음

실행: python3 scripts/build-weapon-images.py  (Pillow 필요)
"""
import json
import os
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "images" / "무기"
OUT = ROOT / "public" / "weapons"
SIZE = 256


def norm(s: str) -> str:
    """NFC 정규화 + 파일명에 못 쓰는 문자 제거 후 비교"""
    s = unicodedata.normalize("NFC", s)
    for ch in ':/\\?*"<>|':
        s = s.replace(ch, "")
    return " ".join(s.split())


weapons = json.loads((ROOT / "data" / "weapons.json").read_text(encoding="utf-8"))["weapons"]
by_name = {norm(w["name"]): w for w in weapons}

OUT.mkdir(parents=True, exist_ok=True)
images = {}
unmatched_files = []
for f in sorted(SRC.iterdir()):
    if f.suffix.lower() != ".png":
        continue
    w = by_name.get(norm(f.stem))
    if not w:
        unmatched_files.append(f.name)
        continue
    im = Image.open(f).convert("RGBA")
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    im.save(OUT / f"{w['id']}.webp", "WEBP", quality=88, method=6)
    images[w["id"]] = f"/weapons/{w['id']}.webp"

missing = [w["name"] for w in weapons if w["id"] not in images]
(ROOT / "data" / "weapon-images.json").write_text(
    json.dumps(
        {
            "_meta": {
                "source": "src/images/무기/*.png (사용자 제공)",
                "missing": missing,  # TODO: 이미지 없는 무기
            },
            "images": dict(sorted(images.items(), key=lambda kv: int(kv[0]))),
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
print(f"matched {len(images)} / {len(weapons)}; missing={missing}; unmatched files={unmatched_files}")
