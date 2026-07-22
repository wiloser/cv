from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "favicon.png"
SIZE = 256


def generate() -> None:
    image = Image.new("RGB", (SIZE, SIZE), "#07111f")
    pixels = image.load()
    for y in range(SIZE):
        for x in range(SIZE):
            indigo = max(0, 1 - ((x - 210) ** 2 + (y - 38) ** 2) ** 0.5 / 260)
            cyan = max(0, 1 - ((x - 28) ** 2 + (y - 230) ** 2) ** 0.5 / 240)
            pixels[x, y] = (
                int(7 + 42 * indigo),
                int(17 + 28 * indigo + 40 * cyan),
                int(31 + 80 * indigo + 66 * cyan),
            )

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((8, 8, 248, 248), radius=54, outline=(255, 255, 255, 50), width=3)
    for position in range(40, 240, 40):
        draw.line((position, 22, position, 234), fill=(95, 111, 160, 28), width=1)
        draw.line((22, position, 234, position), fill=(95, 111, 160, 28), width=1)

    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 91)
    text = "CX"
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(((SIZE - width) / 2, (SIZE - height) / 2 - box[1] - 4), text, font=font, fill="#F8FAFC")
    draw.rounded_rectangle((66, 188, 190, 197), radius=5, fill="#42C4D8")
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    generate()
