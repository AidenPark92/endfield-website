"""캐릭터 상세 아이콘 정리: src/images/캐릭터 상세 아이콘/ → public/icons/

- 속성/*.png → public/icons/element/{slug}.webp
- 직업/*.png → public/icons/class/{slug}.webp
- 원본 파일명은 게임 내 표기(화염·얼음·스트라이크)라 데이터 표기(열기·냉기·스트라이커)와 다르다.
  화면에서 쓰는 매핑은 src/lib/operator-meta.ts 의 ELEMENT_ICON / CLASS_ICON 참고.

실행: python3 scripts/build-detail-icons.py  (Pillow 필요)
"""
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "images" / "캐릭터 상세 아이콘"
OUT = ROOT / "public" / "icons"

# 원본 파일명 → 출력 slug
GROUPS = {
    "속성": ("element", {"물리": "physical", "화염": "heat", "전기": "electric", "얼음": "cryo", "자연": "nature"}),
    "직업": ("class", {"가드": "guard", "캐스터": "caster", "스트라이크": "striker", "뱅가드": "vanguard", "디펜더": "defender", "서포터": "supporter"}),
}

for folder, (out_dir, names) in GROUPS.items():
    dst_dir = OUT / out_dir
    dst_dir.mkdir(parents=True, exist_ok=True)
    found = set()
    for f in sorted((SRC / folder).glob("*.png")):
        stem = unicodedata.normalize("NFC", f.stem)
        slug = names.get(stem)
        if not slug:
            print(f"[skip] 매핑 없음: {folder}/{f.name}")
            continue
        found.add(stem)
        dst = dst_dir / f"{slug}.webp"
        if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
            continue
        im = Image.open(f).convert("RGBA")
        tmp = dst.with_suffix(".tmp.webp")
        im.save(tmp, "WEBP", lossless=True, method=6)  # 96px 단색 아이콘 → 무손실이 더 작고 선명
        tmp.replace(dst)
    missing = set(names) - found
    print(f"{folder}: {len(found)}/{len(names)}" + (f" missing={sorted(missing)}" if missing else ""))
