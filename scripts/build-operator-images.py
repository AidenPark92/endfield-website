"""캐릭터 이미지 정리: src/images/캐릭터/ → public/operators/

- [이름].png        → public/operators/{id}.webp        (전신 일러스트, 720px)
- [이름]_얼굴.png   → public/operators/face/{id}.webp   (작은 초상화, 가로 200px)
- 파일명(캐릭터 이름)으로 data/operators.json 과 매칭 (공백 무시, 오타 별칭 지원)
- 결과는 data/operator-images.json 에 기록

실행: python3 scripts/build-operator-images.py  (Pillow 필요, 이미 변환된 파일은 건너뜀)
"""
import json
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "images" / "캐릭터"
OUT = ROOT / "public" / "operators"
ALIAS = {"앰버": "엠버"}  # 파일명 표기 차이


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).replace(" ", "")
    return ALIAS.get(s, s)


ops = json.loads((ROOT / "data" / "operators.json").read_text(encoding="utf-8"))["operators"]
by_name = {norm(o["name"]): o for o in ops}

(OUT / "face").mkdir(parents=True, exist_ok=True)
full, face, unmatched = {}, {}, []
for f in sorted(SRC.iterdir()):
    if f.suffix.lower() != ".png":
        continue
    stem = unicodedata.normalize("NFC", f.stem)
    is_face = stem.endswith("_얼굴")
    o = by_name.get(norm(stem.removesuffix("_얼굴")))
    if not o:
        unmatched.append(f.name)
        continue
    dst = (OUT / "face" if is_face else OUT) / f"{o['id']}.webp"
    if not dst.exists() or dst.stat().st_mtime < f.stat().st_mtime:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((200, 400) if is_face else (720, 720), Image.LANCZOS)
        tmp = dst.with_suffix(".tmp.webp")  # 중간에 끊겨도 깨진 파일이 남지 않게
        im.save(tmp, "WEBP", quality=86, method=6)
        tmp.replace(dst)
    (face if is_face else full)[o["id"]] = "/operators/" + ("face/" if is_face else "") + f"{o['id']}.webp"

missing = [o["name"] for o in ops if o["id"] not in full or o["id"] not in face]
(ROOT / "data" / "operator-images.json").write_text(
    json.dumps(
        {
            "_meta": {"source": "src/images/캐릭터/*.png (사용자 제공)", "missing": missing},
            "full": dict(sorted(full.items(), key=lambda kv: int(kv[0]))),
            "face": dict(sorted(face.items(), key=lambda kv: int(kv[0]))),
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
print(f"full {len(full)} / face {len(face)} / {len(ops)}; missing={missing}; unmatched={unmatched}")
