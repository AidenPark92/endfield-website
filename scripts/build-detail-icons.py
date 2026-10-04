"""캐릭터 상세 아이콘 정리: src/images/캐릭터 상세 아이콘/ → public/icons/

- 속성/*.png → public/icons/element/{slug}.webp
- 직업/*.png → public/icons/class/{slug}.webp
- src/images/잠재이미지/N잠.png → public/icons/potential/N.webp
- 원본 파일명은 게임 내 표기(화염·얼음·스트라이크)라 데이터 표기(열기·냉기·스트라이커)와 다르다.
  화면에서 쓰는 매핑은 src/lib/operator-meta.ts 의 ELEMENT_ICON / CLASS_ICON 참고.

실행: python3 scripts/build-detail-icons.py  (Pillow 필요)
"""
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "images" / "캐릭터 상세 아이콘"
SRC_POTENTIAL = ROOT / "src" / "images" / "잠재이미지"  # 1잠.png ~ 5잠.png → public/icons/potential/1~5.webp
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

# 잠재 단계 아이콘
pot_dir = OUT / "potential"
pot_dir.mkdir(parents=True, exist_ok=True)
n_pot = 0
for f in sorted(SRC_POTENTIAL.glob("*.png")):
    stem = unicodedata.normalize("NFC", f.stem)
    if not (stem.endswith("잠") and stem[:-1].isdigit()):
        print(f"[skip] 잠재 아이콘 이름 형식 아님: {f.name}")
        continue
    dst = pot_dir / f"{stem[:-1]}.webp"
    n_pot += 1
    if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
        continue
    im = Image.open(f).convert("RGBA")
    im.thumbnail((128, 128), Image.LANCZOS)
    tmp = dst.with_suffix(".tmp.webp")
    im.save(tmp, "WEBP", quality=90, method=6)
    tmp.replace(dst)
print(f"잠재: {n_pot}/5")
