"""用户画像持久化与默认值"""

import json
from config import USER_PROFILE_FILE


def load_profile() -> dict:
    if USER_PROFILE_FILE.exists():
        with open(USER_PROFILE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # 兼容旧版 profile（不覆盖已有字段）
            defaults = _profile_defaults()
            for k, v in defaults.items():
                data.setdefault(k, v)
            # 迁移：旧 profile 有 power_bar 无 exploration → 补默认 exploration
            if "power_bar" in data and "exploration" not in data:
                data["exploration"] = defaults["exploration"]
            # 清理旧字段（保留在 JSON 中但不影响逻辑）
            data.pop("power_bar", None)
            return data
    return _profile_defaults()


def _profile_defaults() -> dict:
    """画者画像默认值（1.0 基础 + 2.0 身份韧性扩展）。

    旧 profile 无 2.0 字段时，setdefault 自动补齐。
    """
    return {
        # ── 1.0 基础字段（保留，向后兼容）──
        "name": "小伙伴",
        "level": None,
        "interest": None,
        "goal": None,
        "onboarding_done": False,
        "onboarding_at": None,
        "recommendation_index": 0,
        "path": "creation",
        # ── 2.0 新增：探索进度（累积式，永不减）──
        "exploration": {
            "progress": 0,
            "explored_areas": {},
            "first_explorations": [],
        },
        # ── 2.0 新增：五维技能雷达 ──
        "skill_radar": {
            "edge": {"score": 5, "trend": "stable", "history": []},
            "space": {"score": 5, "trend": "stable", "history": []},
            "proportion": {"score": 5, "trend": "stable", "history": []},
            "light": {"score": 5, "trend": "stable", "history": []},
            "whole": {"score": 5, "trend": "stable", "history": []},
        },
        # ── 2.0 新增：身份标签（随阶段递进）──
        "identity_labels": [],
        # ── 2.0 新增：画者自传章节 ──
        "autobiography_chapters": [],
        # ── 2.0 新增：心流银行 ──
        "flow_bank": {
            "total_flow_minutes": 0,
            "best_streak_flow": 0,
            "flow_history": [],
        },
    }


def save_profile(profile: dict):
    with open(USER_PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
