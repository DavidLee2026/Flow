"""社区数据管理"""

import json
from config import DATA_DIR

# ── 社区数据管理 ──
COMMUNITY_FILE = DATA_DIR / "community.json"


def load_community_posts() -> list[dict]:
    if COMMUNITY_FILE.exists():
        try:
            with open(COMMUNITY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_community_posts(posts: list[dict]):
    with open(COMMUNITY_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
