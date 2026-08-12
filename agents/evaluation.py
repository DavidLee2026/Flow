"""评估Agent（Evaluation Agent）

职责：对比历史 → 技能诊断 + 难度差距 + 进步对比
调 API：否（纯本地逻辑，零 API 成本）

Day 2 实现：
  1. 从 perception_result 获取当前五维分数
  2. 找出最强/最弱维度
  3. 从历史记录中提取上次的五维分数，对比进步/退步维度
  4. 计算综合水平（五维均分）和建议难度（current + 4-8%，课程学习原则）
  5. 生成技术标签和进步摘要

复用 1.0：
  - growth_stages.py 的课程递进概念 → 简化为 4-8% 难度梯度
  - ai_service.py observe/progress 层的对比逻辑 → 改为本地诊断
"""

import time


# ── 维度标签映射 ──────────────────────────────────────

_DIM_LABELS = {
    "edge": "线条",
    "space": "空间",
    "proportion": "比例",
    "light": "光影",
    "whole": "整体",
}

_DIM_TECHNIQUE_TAGS = {
    "edge": "线条表现力",
    "space": "空间构图",
    "proportion": "比例观察",
    "light": "明暗处理",
    "whole": "整体协调",
}

# 难度提升百分比（课程学习原则：阶段越高，挑战越大）
_STAGE_DIFFICULTY_PCT = {
    "新手期": 4.0,
    "入门期": 5.0,
    "成长期": 6.0,
    "进阶期": 7.0,
    "熟练期": 8.0,
}


def run(perception_result: dict, history_records: list, stage: str) -> dict:
    """评估Agent 入口（纯本地逻辑，不调 API）

    Args:
        perception_result: 感知Agent 的输出（五维评分等）
        history_records: 历史画作记录列表（含 perception_analysis 字段）
        stage: 当前阶段（新手期|入门期|成长期|进阶期|熟练期）

    Returns:
        evaluation_result dict，结构见 Day0 契约「契约 2」：
          - skill_diagnosis: 技能诊断（最强/最弱维度 + 进步/退步维度）
          - difficulty_gap: 难度差距（当前水平 + 建议难度 + 描述）
          - technique_tags: 技术标签列表
          - progress_summary: 进步摘要（1句话，描述性）
          - elapsed_s: 耗时
    """
    t0 = time.time()

    current_dims = perception_result.get("dimensions", {})
    if not current_dims:
        current_dims = {"edge": 5, "space": 5, "proportion": 5, "light": 5, "whole": 5}

    # ── 1. 找出最强/最弱维度 ──
    strongest_dim = max(current_dims, key=current_dims.get)
    weakest_dim = min(current_dims, key=current_dims.get)

    # ── 2. 从历史记录中提取上次的五维分数 ──
    last_dims = _extract_last_dimensions(history_records)

    # ── 3. 对比进步/退步维度 ──
    progress_dims = []
    regress_dims = []
    if last_dims:
        for dim, score in current_dims.items():
            last_score = last_dims.get(dim, 5)
            if score > last_score:
                progress_dims.append(dim)
            elif score < last_score:
                regress_dims.append(dim)

    # ── 4. 计算综合水平（五维均分） ──
    scores = list(current_dims.values())
    current_level = sum(scores) / len(scores) if scores else 5.0

    # ── 5. 建议难度（current + 4-8%，随阶段递增） ──
    difficulty_pct = _STAGE_DIFFICULTY_PCT.get(stage, 5.0)
    suggested_difficulty = round(current_level * (1 + difficulty_pct / 100), 2)

    # ── 6. 生成难度差距描述 ──
    gap_description = _build_gap_description(
        strongest_dim, weakest_dim, stage, progress_dims, regress_dims
    )

    # ── 7. 生成技术标签 ──
    technique_tags = _generate_technique_tags(current_dims)

    # ── 8. 生成进步摘要 ──
    progress_summary = _build_progress_summary(
        progress_dims, regress_dims, strongest_dim, len(history_records)
    )

    result = {
        "skill_diagnosis": {
            "strongest_dim": strongest_dim,
            "weakest_dim": weakest_dim,
            "progress_dims": progress_dims,
            "regress_dims": regress_dims,
        },
        "difficulty_gap": {
            "current_level": round(current_level, 1),
            "suggested_difficulty": suggested_difficulty,
            "gap_description": gap_description,
        },
        "technique_tags": technique_tags,
        "progress_summary": progress_summary,
        "elapsed_s": round(time.time() - t0, 2),
    }

    return result


# ── 私有辅助函数 ──────────────────────────────────────


def _extract_last_dimensions(history_records: list) -> dict | None:
    """从历史记录中提取最近一条的五维分数。

    兼容 1.0 和 2.0 记录格式：
      - 2.0: record["perception_analysis"]（顶层）
      - 1.0: record["feedback_json"]["perception_analysis"]（嵌套）

    Args:
        history_records: 历史记录列表（按时间从旧到新）

    Returns:
        五维分数 dict（如 {"edge": 6, "space": 5, ...}），无历史时返回 None
    """
    if not history_records:
        return None

    last = history_records[-1]

    # 2.0 格式：顶层 perception_analysis
    dims = last.get("perception_analysis")
    if isinstance(dims, dict) and "edge" in dims:
        return dims

    # 1.0 格式：feedback_json.perception_analysis
    fb_json = last.get("feedback_json")
    if isinstance(fb_json, dict):
        dims = fb_json.get("perception_analysis")
        if isinstance(dims, dict) and "edge" in dims:
            return dims

    return None


def _generate_technique_tags(current_dims: dict) -> list[str]:
    """根据高分维度生成技术标签。

    规则：
      - 分数 >= 7 的维度生成对应标签
      - 如果没有高分维度，取最高分维度生成一个标签
      - 最多 3 个标签
    """
    tags = []
    # 按分数从高到低排序
    sorted_dims = sorted(current_dims.items(), key=lambda x: x[1], reverse=True)

    for dim, score in sorted_dims:
        if score >= 7:
            tag = _DIM_TECHNIQUE_TAGS.get(dim, dim)
            if tag not in tags:
                tags.append(tag)

    # 如果没有高分维度，取最高分的维度
    if not tags and sorted_dims:
        best_dim = sorted_dims[0][0]
        tags.append(_DIM_TECHNIQUE_TAGS.get(best_dim, best_dim))

    return tags[:3]  # 最多 3 个


def _build_gap_description(
    strongest: str,
    weakest: str,
    stage: str,
    progress_dims: list,
    regress_dims: list,
) -> str:
    """生成难度差距描述。

    基于 Betty Edwards 五维感知理论，结合课程学习原则，
    给出有针对性的下一步建议。
    """
    strong_label = _DIM_LABELS.get(strongest, strongest)
    weak_label = _DIM_LABELS.get(weakest, weakest)

    if progress_dims and not regress_dims:
        progress_labels = "、".join(
            _DIM_LABELS.get(d, d) for d in progress_dims
        )
        return f"{progress_labels}进步明显，建议下次在{weak_label}方向尝试新挑战"
    elif regress_dims and not progress_dims:
        regress_labels = "、".join(
            _DIM_LABELS.get(d, d) for d in regress_dims
        )
        return f"{regress_labels}有波动，建议聚焦{strong_label}巩固信心"
    elif progress_dims and regress_dims:
        return f"{strong_label}进步，{weak_label}需关注，建议综合练习"
    else:
        return f"{strong_label}表现稳定，建议下次尝试{weak_label}方向的练习"


def _build_progress_summary(
    progress_dims: list,
    regress_dims: list,
    strongest: str,
    history_count: int,
) -> str:
    """生成进步摘要（1句话，描述性而非评判性）。

    遵循 model-free 反馈原则：
      - 描述观察到的变化，不预测标准
      - 不说"画得好/不好"，说"哪个维度变化了"
    """
    if history_count == 0:
        return "首张画作，建立基线"

    strong_label = _DIM_LABELS.get(strongest, strongest)

    if progress_dims and not regress_dims:
        progress_labels = "、".join(
            _DIM_LABELS.get(d, d) for d in progress_dims
        )
        return f"{progress_labels}维度进步明显"
    elif regress_dims and not progress_dims:
        regress_labels = "、".join(
            _DIM_LABELS.get(d, d) for d in regress_dims
        )
        return f"{regress_labels}维度有波动，{strong_label}保持稳定"
    elif progress_dims and regress_dims:
        progress_labels = "、".join(
            _DIM_LABELS.get(d, d) for d in progress_dims
        )
        return f"{progress_labels}进步，{strong_label}为亮点"
    else:
        return f"整体表现稳定，{strong_label}为优势维度"
