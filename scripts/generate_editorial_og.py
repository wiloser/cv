"""Generate the portfolio social card and favicon."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OG_PATH = PUBLIC / "og.png"
FAVICON_PATH = PUBLIC / "favicon.png"

CANVAS = "#f4f3ef"
SURFACE = "#fffdfa"
BORDER = "#dcded8"
TEXT = "#222825"
MUTED = "#6e7570"
ACCENT = "#5362c9"
ACCENT_SOFT = "#eceefd"

PROJECTS = [
    ("labflow", "实验室预约管理系统", "TypeScript", "#3178c6"),
    ("transit-lens", "公交数据分析平台", "Python", "#3572A5"),
    ("eco-vision", "垃圾分类识别系统", "Python", "#3572A5"),
    ("study-find", "课程资料检索助手", "Python", "#3572A5"),
]


def find_font(bold: bool = False) -> str:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc" if bold else "/System/Library/Fonts/STHeiti Light.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise FileNotFoundError("未找到可用中文字体")


REGULAR = find_font()
BOLD = find_font(True)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


def generate_og() -> None:
    image = Image.new("RGB", (1200, 630), CANVAS)
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 0, 1200, 72), fill=SURFACE)
    draw.line((0, 71, 1200, 71), fill=BORDER, width=1)
    draw.rounded_rectangle((38, 18, 74, 54), radius=11, fill=ACCENT)
    draw.text((50, 27), "序", font=font(13, True), fill="#ffffff")
    draw.text((90, 25), "陈序", font=font(16, True), fill=TEXT)
    draw.text((1030, 27), "个人作品集", font=font(13), fill=MUTED)

    # Profile column
    draw.rounded_rectangle((52, 112, 222, 282), radius=38, fill=ACCENT_SOFT, outline="#d7dbf8", width=2)
    draw.text((77, 158), "陈", font=font(62, True), fill=ACCENT)
    draw.text((52, 316), "陈序", font=font(32, True), fill=TEXT)
    draw.text((52, 359), "@chenxu", font=font(17), fill=MUTED)
    draw.text((52, 405), "前端与全栈开发者", font=font(18, True), fill=TEXT)
    draw.text((52, 439), "杭州 · 可远程协作", font=font(14), fill=MUTED)
    draw.rounded_rectangle((52, 492, 260, 535), radius=12, fill=ACCENT)
    draw.text((117, 503), "下载简历", font=font(14, True), fill="#ffffff")

    draw.rounded_rectangle((306, 104, 1148, 300), radius=20, fill=SURFACE, outline=BORDER, width=2)
    draw.text((336, 129), "关于我", font=font(12, True), fill=ACCENT)
    draw.text((336, 165), "把复杂需求，做成清晰可靠的产品。", font=font(29, True), fill=TEXT)
    draw.text((336, 224), "关注 Web 全栈、数据可视化与 AI 应用工程。", font=font(16), fill=MUTED)
    draw.text((336, 256), "从真实场景出发，把项目打磨成真正可用的产品。", font=font(16), fill=MUTED)

    draw.text((306, 330), "项目作品", font=font(20, True), fill=TEXT)
    draw.text((1082, 334), "共 6 个", font=font(12), fill=MUTED)

    card_width, card_height = 407, 112
    for index, (name, description, language, color) in enumerate(PROJECTS):
        col, row = index % 2, index // 2
        x = 306 + col * 435
        y = 366 + row * 126
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=17, fill=SURFACE, outline=BORDER, width=2)
        draw.text((x + 18, y + 15), "项目实践", font=font(10, True), fill=ACCENT)
        draw.text((x + 18, y + 40), description, font=font(15, True), fill=TEXT)
        draw.rounded_rectangle((x + 18, y + 76, x + 86, y + 98), radius=7, fill=ACCENT_SOFT)
        draw.text((x + 28, y + 80), language, font=font(10), fill=ACCENT)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    image.save(OG_PATH, optimize=True)


def generate_favicon() -> None:
    image = Image.new("RGB", (256, 256), ACCENT)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((28, 28, 228, 228), radius=58, outline="#ffffff", width=8)
    label = "序"
    label_font = font(78, True)
    box = draw.textbbox((0, 0), label, font=label_font)
    draw.text(((256 - box[2]) / 2, (256 - (box[3] - box[1])) / 2 - box[1]), label, font=label_font, fill="#ffffff")
    image.save(FAVICON_PATH, optimize=True)


if __name__ == "__main__":
    generate_og()
    generate_favicon()
    print(OG_PATH)
    print(FAVICON_PATH)
