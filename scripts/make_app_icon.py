"""앱 아이콘 생성. 원본 이미지 하나로 안드로이드 런처 아이콘 전부를 만든다.

    uv run --with pillow python scripts/make_app_icon.py [원본이미지]

기본값은 public/mascot-dog.png. 로고 파일을 받으면 그 경로만 넘기면 된다.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"

# 런처 아이콘 표준 크기 (dp 기준 48dp)
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

# 적응형 아이콘은 108dp 캔버스에 72dp 안전 영역. 바깥은 런처가 잘라낼 수 있다.
ADAPTIVE = {k: round(v * 108 / 48) for k, v in DENSITIES.items()}
SAFE_RATIO = 72 / 108

BACKGROUND = (255, 255, 255, 255)


def fit(source: Image.Image, canvas: int, ratio: float) -> Image.Image:
    """흰 정사각 캔버스 중앙에 원본을 ratio 비율로 앉힌다."""
    out = Image.new("RGBA", (canvas, canvas), BACKGROUND)
    target = round(canvas * ratio)
    art = source.copy()
    art.thumbnail((target, target), Image.LANCZOS)
    out.paste(art, ((canvas - art.width) // 2, (canvas - art.height) // 2), art)
    return out


def main() -> None:
    src_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/mascot-dog.png"
    if not src_path.exists():
        raise SystemExit(f"원본 이미지를 찾을 수 없습니다: {src_path}")

    source = Image.open(src_path).convert("RGBA")

    for density, size in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        # 레거시 아이콘은 캔버스를 꽉 채운다.
        icon = fit(source, size, 0.92)
        icon.save(folder / "ic_launcher.png")
        icon.save(folder / "ic_launcher_round.png")
        # 적응형 전경은 안전 영역 안에 들어가야 런처가 둥글게 잘라도 안 잘린다.
        fg = fit(source, ADAPTIVE[density], SAFE_RATIO * 0.82)
        fg.save(folder / "ic_launcher_foreground.png")

    print(f"아이콘 생성 완료 (원본: {src_path.name})")
    print(f"  밀도 {len(DENSITIES)}종 x 3파일 = {len(DENSITIES) * 3}개")


if __name__ == "__main__":
    main()
