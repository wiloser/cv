from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
PUBLIC_DIR = ROOT / "public"
OUTPUT_PATH = OUTPUT_DIR / "resume-chenxu.pdf"
PUBLIC_PATH = PUBLIC_DIR / "resume-chenxu.pdf"

PAGE_W, PAGE_H = A4
NAVY = HexColor("#07111F")
INK = HexColor("#111827")
MUTED = HexColor("#64748B")
LINE = HexColor("#DDE4EE")
PANEL = HexColor("#F1F5F9")
INDIGO = HexColor("#5B5CE2")
CYAN = HexColor("#1AA6BA")
SOFT_INDIGO = HexColor("#ECECFF")


pdfmetrics.registerFont(TTFont("CNLight", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("CNMedium", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))
CN = "CNLight"
CN_BOLD = "CNMedium"


def split_text(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 8.6, leading: float = 13, color=MUTED) -> float:
    c.setFont(CN, size)
    c.setFillColor(color)
    for line in split_text(text, CN, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def section_title(c: canvas.Canvas, title: str, x: float, y: float, width: float, dark: bool = False) -> float:
    c.setFillColor(CYAN if dark else INDIGO)
    c.roundRect(x, y - 3, 17, 3, 1.5, fill=1, stroke=0)
    c.setFont(CN_BOLD, 12)
    c.setFillColor(white if dark else INK)
    c.drawString(x + 23, y - 7, title)
    c.setStrokeColor(HexColor("#2A3950") if dark else LINE)
    c.setLineWidth(0.55)
    c.line(x, y - 15, x + width, y - 15)
    return y - 30


def bullet(c: canvas.Canvas, text: str, x: float, y: float, width: float, dark: bool = False) -> float:
    c.setFillColor(CYAN if dark else INDIGO)
    c.circle(x + 2.5, y + 2.5, 1.6, fill=1, stroke=0)
    return draw_wrapped(c, text, x + 11, y + 6, width - 11, 8.1, 12, HexColor("#BAC6D6") if dark else MUTED) - 2


def label_value(c: canvas.Canvas, label: str, value: str, x: float, y: float, dark: bool = False) -> float:
    c.setFont(CN, 7)
    c.setFillColor(HexColor("#8190A4") if dark else MUTED)
    c.drawString(x, y, label)
    c.setFont(CN, 8.6)
    c.setFillColor(white if dark else INK)
    c.drawString(x, y - 13, value)
    return y - 30


def generate() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT_PATH), pagesize=A4)
    c.setTitle("陈序 - 前端与全栈开发简历（示例）")
    c.setAuthor("陈序")

    margin = 34
    header_h = 112
    left_w = 172
    gap = 24
    right_x = margin + left_w + gap
    right_w = PAGE_W - right_x - margin

    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, fill=1, stroke=0)
    c.setFillColor(INDIGO)
    c.circle(PAGE_W - 34, PAGE_H - 26, 72, fill=1, stroke=0)
    c.setFillColor(HexColor("#14304A"))
    c.circle(PAGE_W - 96, PAGE_H - 112, 44, fill=1, stroke=0)

    c.setFont(CN_BOLD, 27)
    c.setFillColor(white)
    c.drawString(margin, PAGE_H - 47, "陈 序")
    c.setFont("Helvetica-Bold", 8.2)
    c.setFillColor(HexColor("#69D7E6"))
    c.drawString(margin + 2, PAGE_H - 66, "CHEN XU  /  PORTFOLIO RESUME")
    c.setFont(CN_BOLD, 11)
    c.setFillColor(HexColor("#CFD9E8"))
    c.drawString(margin + 2, PAGE_H - 88, "前端与全栈开发者  ·  Web / Data / AI")

    contact_x = 340
    contact_y = PAGE_H - 43
    c.setFont(CN, 8)
    c.setFillColor(HexColor("#E2E8F0"))
    for item in ["hello@example.com", "杭州 · 可远程协作", "作品集 / GitHub 待补充"]:
        c.circle(contact_x, contact_y + 2, 1.5, fill=1, stroke=0)
        c.drawString(contact_x + 9, contact_y - 1, item)
        contact_y -= 19

    body_top = PAGE_H - header_h
    c.setFillColor(PANEL)
    c.rect(0, 0, margin + left_w + 1, body_top, fill=1, stroke=0)

    left_x = margin
    left_y = body_top - 30
    left_y = section_title(c, "个人简介", left_x, left_y, left_w - 5)
    left_y = draw_wrapped(c, "计算机科学与技术本科生，关注 Web 全栈、数据可视化与 AI 应用工程，重视完整交付与工程文档。", left_x, left_y, left_w - 8, 8.5, 13, MUTED) - 16

    left_y = section_title(c, "专业技能", left_x, left_y, left_w - 5)
    for label, value in [
        ("前端开发", "React · TypeScript · Vue · Vite"),
        ("服务端", "Node.js · Spring Boot · FastAPI"),
        ("数据与智能", "MySQL · PostgreSQL · Python · PyTorch"),
        ("工程工具", "Git · Docker · Linux · ECharts"),
    ]:
        left_y = label_value(c, label, value, left_x, left_y)
    left_y -= 4

    left_y = section_title(c, "教育经历", left_x, left_y, left_w - 5)
    c.setFont(CN_BOLD, 10)
    c.setFillColor(INK)
    c.drawString(left_x, left_y, "计算机科学与技术 · 本科")
    c.setFont(CN, 7.5)
    c.setFillColor(INDIGO)
    c.drawString(left_x, left_y - 16, "2022.09 - 2026.06")
    left_y = draw_wrapped(c, "工学院 · 计算机系（请替换为真实院校）", left_x, left_y - 31, left_w - 8, 8.1, 12, MUTED) - 16

    left_y = section_title(c, "能力关键词", left_x, left_y, left_w - 5)
    for tag in ["响应式界面", "组件化开发", "REST API 联调", "关系型数据建模", "项目文档与汇报"]:
        left_y = bullet(c, tag, left_x, left_y, left_w - 8)
    left_y -= 10

    left_y = section_title(c, "开发习惯", left_x, left_y, left_w - 5)
    for tag in ["先梳理场景与数据流", "为加载与异常设计反馈", "保持组件边界清晰", "交付可复现的开发说明"]:
        left_y = bullet(c, tag, left_x, left_y, left_w - 8)
    left_y -= 10

    left_y = section_title(c, "联系与状态", left_x, left_y, left_w - 5)
    left_y = label_value(c, "邮箱", "hello@example.com", left_x, left_y)
    left_y = label_value(c, "状态", "开放实习与校招机会", left_x, left_y)
    left_y = label_value(c, "所在地", "杭州 · 可远程协作", left_x, left_y)

    right_y = body_top - 30
    right_y = section_title(c, "个人优势", right_x, right_y, right_w)
    right_y = draw_wrapped(c, "能够从需求梳理、信息架构、界面实现到接口联调完成中小型应用的主要环节；关注加载、空态、异常和响应式体验，也习惯整理 README 与开发说明。", right_x, right_y, right_w, 8.7, 13.5, MUTED) - 15

    right_y = section_title(c, "实习与项目经历", right_x, right_y, right_w)

    experiences = [
        (
            "2025.07 - 2025.10",
            "前端开发实习生  /  企业数字化研发组",
            ["参与内部运营平台迭代，负责数据列表、权限配置与可视化模块。", "使用 React + TypeScript 完成业务页面，抽取通用查询与表格组件。", "协同产品与后端完成接口联调、问题修复与验收。"],
        ),
        (
            "2025.09 - 2026.03",
            "LabFlow 实验室预约管理系统",
            ["围绕学生、教师与管理员设计预约、审批、设备和记录闭环。", "将待审核与已通过记录统一纳入时段冲突判断。", "技术栈：React · TypeScript · Spring Boot · MySQL"],
        ),
        (
            "2025.03 - 2025.06",
            "TransitLens 公交数据分析平台",
            ["完成公开数据导入、质量检查、指标计算与可视化分析流程。", "筛选条件联动多个图表，并为异常、空数据提供独立反馈。", "技术栈：React · ECharts · FastAPI · Pandas"],
        ),
    ]

    for period, title, points in experiences:
        c.setFillColor(SOFT_INDIGO)
        c.roundRect(right_x, right_y - 3, 75, 16, 8, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(INDIGO)
        c.drawCentredString(right_x + 37.5, right_y + 2, period)
        c.setFont(CN_BOLD, 10.2)
        c.setFillColor(INK)
        c.drawString(right_x + 87, right_y, title)
        right_y -= 22
        for point in points:
            right_y = bullet(c, point, right_x, right_y, right_w)
        right_y -= 8

    right_y = section_title(c, "技能证书", right_x, right_y, right_w)
    right_y = draw_wrapped(c, "正式发布时请在此填写本人已取得、可核实的证书名称、颁发机构、取得时间与证书编号。", right_x, right_y, right_w, 8.4, 13, MUTED) - 16

    right_y = section_title(c, "其他代表项目", right_x, right_y, right_w)
    compact_projects = [
        ("EcoVision 垃圾分类识别系统", "React · FastAPI · PyTorch", "展示候选类别与置信度，为低置信度结果提供重试建议。"),
        ("CampusLink 校园互助移动端", "uni-app · Vue 3 · Spring Boot", "统一承载失物招领、求助和组队信息，支持分步发布与草稿。"),
        ("StudyFind 课程资料检索助手", "React · FastAPI · FAISS", "本地建立语义索引，结果保留文件名、页码与原始出处。"),
    ]
    for title, tech, description in compact_projects:
        project_y = right_y
        c.setFillColor(INDIGO)
        c.roundRect(right_x, project_y - 19, 4, 48, 2, fill=1, stroke=0)
        c.setFont(CN_BOLD, 9.2)
        c.setFillColor(INK)
        c.drawString(right_x + 13, project_y + 15, title)
        c.setFont("Helvetica", 6.8)
        c.setFillColor(INDIGO)
        c.drawString(right_x + 13, project_y + 3, tech)
        draw_wrapped(c, description, right_x + 13, project_y - 10, right_w - 13, 7.8, 11.5, MUTED)
        right_y -= 56

    right_y = section_title(c, "协作与工程", right_x, right_y, right_w)
    engineering_points = [
        "使用 Git 进行分支协作、提交整理和问题追踪。",
        "根据接口文档完成前后端联调，并记录异常边界。",
        "能够编写 README、部署步骤、验收用例与项目复盘。",
        "重视移动端适配、键盘可用性与界面信息层级。",
    ]
    for point in engineering_points:
        right_y = bullet(c, point, right_x, right_y, right_w)

    c.setStrokeColor(LINE)
    c.line(margin, 25, PAGE_W - margin, 25)
    c.setFont(CN, 6.8)
    c.setFillColor(MUTED)
    c.drawString(margin, 13, "示例履历 · 发布前请替换为本人真实且可核实的信息")
    c.setFont("Helvetica", 6.5)
    c.drawRightString(PAGE_W - margin, 13, "RESUME  /  UPDATED 2026")

    c.showPage()
    c.save()
    PUBLIC_PATH.write_bytes(OUTPUT_PATH.read_bytes())
    print(OUTPUT_PATH)
    print(PUBLIC_PATH)


if __name__ == "__main__":
    generate()
