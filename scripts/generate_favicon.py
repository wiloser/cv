from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "favicon.png"
SIZE = 256


def generate() -> None:
    image = Image.new("RGB", (SIZE, SIZE), "#151615")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((18, 18, 238, 238), radius=52, fill="#5557e8")
    draw.ellipse((182, 30, 224, 72), fill="#d9ff63")

    font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 128)
    text = "毕"
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(
        ((SIZE - width) / 2, (SIZE - height) / 2 - box[1] + 2),
        text,
        font=font,
        fill="#ffffff",
    )
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    generate()
