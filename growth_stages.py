# -*- coding: utf-8 -*-
"""
绘心 Flow · 20 级成长体系关卡逻辑
数据在 growth_stages_levels_1_10.json + growth_stages_levels_11_20.json
总计：20 大关 × 20 小关 = 400 步
"""
import json
from pathlib import Path

_BASE = Path(__file__).parent

_LEVEL_FILES = ("growth_stages_levels_1_10.json", "growth_stages_levels_11_20.json")


def _load_levels() -> dict:
    """加载关卡数据（从 2 个 JSON 合并，key 转回 int）"""
    merged = {}
    for fname in _LEVEL_FILES:
        with open(_BASE / fname, encoding="utf-8") as f:
            data = json.load(f)
        merged.update({int(k): v for k, v in data.items()})
    return merged


LEVEL_STAGES = _load_levels()


def get_level_info(level):
    """返回指定大关的信息"""
    if level not in LEVEL_STAGES:
        return None
    info = LEVEL_STAGES[level]
    return {
        "title": info["title"],
        "skill_focus": info["skill_focus"],
        "boss_title": info["boss_title"],
        "boss_prompt": info["boss_prompt"],
        "stages": info["stages"],
    }


def get_stage(level, stage_index):
    """返回指定小关"""
    info = get_level_info(level)
    if not info or stage_index < 0 or stage_index >= len(info["stages"]):
        return None
    return info["stages"][stage_index]


LEVEL_ORDER = list(range(1, 21))


if __name__ == "__main__":
    # 自测
    assert len(LEVEL_STAGES) == 20, "Should have 20 levels"
    for lv in range(1, 21):
        stages = LEVEL_STAGES[lv]["stages"]
        assert len(stages) == 20, "Level {} should have 20 stages, got {}".format(lv, len(stages))
        assert stages[-1]["is_boss"], "Last stage of level {} should be boss".format(lv)
        for i, s in enumerate(stages):
            assert s["id"] == "{}-{}".format(lv, i), "Stage id mismatch: {}".format(s["id"])
    print("All 20 levels x 20 stages = 400 stages verified!")
    print("Levels:", [LEVEL_STAGES[lv]["title"] for lv in range(1, 21)])
