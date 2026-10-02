"""무기 이미지 정리: src/images/무기/ → public/weapons/

- 파일명(무기 이름)으로 data/weapons.json 과 매칭 (윈도우에서 쓸 수 없는 ':' 는 빠져 있어도 매칭)
- *.png  → public/weapons/{id}.webp          (256px 아이콘)
- *.gif  → public/weapons/video/{id}.mp4     (회전 연출, 640px H.264 — GIF 20MB → 약 150KB)
           public/weapons/video/{id}.webm    (같은 영상 VP9 — H.264 를 못 트는 브라우저용)
           public/weapons/poster/{id}.webp   (영상 첫 프레임, 카드 대표 이미지)
- 매칭 결과는 data/weapon-images.json 에 기록

실행: python3 scripts/build-weapon-images.py  (Pillow + ffmpeg 필요, 이미 변환된 파일은 건너뜀)
"""
import json
import os
import subprocess
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
    dst = OUT / f"{w['id']}.webp"
    if not dst.exists() or dst.stat().st_mtime < f.stat().st_mtime:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        im.save(dst, "WEBP", quality=88, method=6)
    images[w["id"]] = f"/weapons/{w['id']}.webp"

# GIF → mp4 + 포스터
(OUT / "video").mkdir(exist_ok=True)
(OUT / "poster").mkdir(exist_ok=True)
videos, posters = {}, {}
for f in sorted(SRC.iterdir()):
    if f.suffix.lower() != ".gif":
        continue
    w = by_name.get(norm(f.stem))
    if not w:
        unmatched_files.append(f.name)
        continue
    mp4 = OUT / "video" / f"{w['id']}.mp4"
    poster = OUT / "poster" / f"{w['id']}.webp"
    if not mp4.exists() or mp4.stat().st_mtime < f.stat().st_mtime:
        tmp = mp4.with_suffix(".tmp.mp4")  # 중간에 끊겨도 깨진 파일이 남지 않게 임시 파일 → 이름 변경
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(f),
             "-vf", "fps=24,scale=640:-2:flags=lanczos",
             "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", "-an", str(tmp)],
            check=True,
        )
        os.replace(tmp, mp4)
    webm = OUT / "video" / f"{w['id']}.webm"
    if not webm.exists() or webm.stat().st_mtime < f.stat().st_mtime:
        tmp = webm.with_suffix(".tmp.webm")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(f),
             "-vf", "fps=24,scale=640:-2:flags=lanczos",
             "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-row-mt", "1",
             "-deadline", "good", "-cpu-used", "5", "-an", str(tmp)],
            check=True,
        )
        os.replace(tmp, webm)
    if not poster.exists() or poster.stat().st_mtime < mp4.stat().st_mtime:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-frames:v", "1",
             "-vf", "scale=480:-2:flags=lanczos", "-c:v", "libwebp", "-quality", "82", str(poster)],
            check=True,
        )
    videos[w["id"]] = f"/weapons/video/{w['id']}"  # 확장자(.webm/.mp4)는 화면에서 붙임
    posters[w["id"]] = f"/weapons/poster/{w['id']}.webp"

missing = [w["name"] for w in weapons if w["id"] not in images]
missing_video = [w["name"] for w in weapons if w["id"] not in videos]
(ROOT / "data" / "weapon-images.json").write_text(
    json.dumps(
        {
            "_meta": {
                "source": "src/images/무기/*.png (사용자 제공)",
                "missing": missing,  # TODO: 이미지 없는 무기
                "missingVideo": missing_video,
            },
            "images": dict(sorted(images.items(), key=lambda kv: int(kv[0]))),
            "videos": dict(sorted(videos.items(), key=lambda kv: int(kv[0]))),
            "posters": dict(sorted(posters.items(), key=lambda kv: int(kv[0]))),
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
print(f"images {len(images)} / videos {len(videos)} / {len(weapons)}; missing={missing}; missingVideo={missing_video}; unmatched files={unmatched_files}")
