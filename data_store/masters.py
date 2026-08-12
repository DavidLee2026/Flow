"""大师知识库解析与图片本地化映射"""

import json
import re
from config import DATA_DIR, MASTER_DIR

# ── 练习参考图 ────
RECOMMENDATION_IMAGES = {}
_rec_img_file = DATA_DIR / "recommendation_images.json"
if _rec_img_file.exists():
    try:
        RECOMMENDATION_IMAGES = json.loads(_rec_img_file.read_text(encoding="utf-8"))
    except Exception:
        pass

# ── 大师知识库（从外部 MD 文件解析）────


# ── 大师图片本地化映射 ─────────────────────────────────
# 如果 data/master_image_mapping.json 存在，将 Wikimedia URL 替换为本地路径
MASTER_IMG_MAP = {}
_master_mapping_file = DATA_DIR / "master_image_mapping.json"
if _master_mapping_file.exists():
    try:
        MASTER_IMG_MAP = json.loads(_master_mapping_file.read_text(encoding="utf-8"))
    except Exception:
        pass


def _localize_url(url: str) -> str:
    """将 Wikimedia 外链替换为本地路径（如果本地缓存存在）"""
    if url in MASTER_IMG_MAP:
        return "/data/master_images/" + MASTER_IMG_MAP[url]
    return url


def parse_master_files() -> dict:
    """
    读取大师知识库目录（KB_DIR）下的 MD 文件，返回 {master_name: {...}} 索引

    返回结构：
    {
        "达芬奇": {
            "name": "达芬奇",
            "period": "1452-1519",
            "tagline": "全能天才...",
            "bio": "...",
            "learn_points": ["...", "..."],
            "works": [
                {"title": "蒙娜丽莎", "url": "/data/master_images/xxx.jpg", "description": "重点看..."},
            ],
            "source_file": "22-古典大师.md"
        },
        ...
    }
    """
    masters = {}
    if not MASTER_DIR.exists():
        return masters

    for fpath in sorted(MASTER_DIR.glob("*.md")):
        text = fpath.read_text(encoding="utf-8")

        # 按 ## 分割每个大师区块
        sections = re.split(r"\n## ", text)
        for sec in sections[1:]:  # 跳过文件标题
            sec = "## " + sec
            # 提取大师名
            name_match = re.match(r"## ([^(]+?)\s*(?:\([^)]*\))?\s*$", sec.split("\n")[0])
            if not name_match:
                continue
            name = name_match.group(1).strip().rstrip("，,")

            # 提取年代
            period_match = re.search(r"\(([^)]*)\)", sec.split("\n")[0])
            period = period_match.group(1) if period_match else ""

            # 提取一句话标签
            tag_match = re.search(r"\*\*一句话标签\*\*[：:]\s*(.+)", sec)
            tagline = tag_match.group(1).strip() if tag_match else ""

            # 提取简介
            bio_match = re.search(r"\*\*简介\*\*[：:]\s*(.+?)(?:\n\n|\n\*\*)", sec, re.DOTALL)
            bio = bio_match.group(1).strip() if bio_match else ""

            # 提取临摹学什么
            learn_points = []
            lp_section = re.search(r"\*\*临摹学什么\*\*[：:]\n((?:\s*[-•]\s*.+\n?)+)", sec)
            if lp_section:
                learn_points = [
                    re.sub(r"^[-•]\s*", "", line).strip()
                    for line in lp_section.group(1).split("\n")
                    if line.strip() and not line.strip().startswith("**")
                ]

            # 提取代表作
            works = []
            work_lines = re.findall(
                r"!\[([^\]]*)\]\(([^)]+)\)\s*[—–-]+\s*(.+)",
                sec,
            )
            for title, url, desc in work_lines:
                works.append({
                    "title": title.strip(),
                    "url": _localize_url(url.strip()),
                    "description": desc.strip(),
                })

            if name:
                masters[name] = {
                    "name": name,
                    "period": period,
                    "tagline": tagline,
                    "bio": bio,
                    "learn_points": learn_points,
                    "works": works,
                    "source_file": fpath.name,
                }
    return masters


# 全局缓存：启动时解析一次
MASTER_INDEX = parse_master_files()
MASTER_TO_REC = {}  # master_name → 第一条作品的图片 URL
for m_name, m_data in MASTER_INDEX.items():
    if m_data["works"]:
        MASTER_TO_REC[m_name] = m_data["works"][0]["url"]
