"""记忆Agent（Memory Agent）

职责：更新画者画像 → 探索进度 + 教练规则判断
调 API：否（纯 JSON 读写，零 API 成本）

Day 2 实现：
  1. 基于 perception_result 计算探索进度变化（本地规则，不调 API）
  2. 更新 profile.skill_radar（五维分数追加到 history，更新 trend）
  3. 更新 profile.identity_labels（从突破维度 + 阶段推断身份标签）
  4. 执行 4 条教练规则判断（优先级：rule_3 > rule_1 > rule_2 > rule_4）
  5. 调用 get_milestone() 和 get_recommendation()（复用 1.0）

复用 1.0：
  - get_milestone()        ← data_store.py:590  里程碑
  - get_recommendation()   ← data_store.py:690  推荐下一幅
"""

import time
import copy

from data_store import get_milestone, get_recommendation


# ── 常量 ──────────────────────────────────────────────

_DIM_LABELS = {
    "edge": "边缘",
    "space": "空间",
    "proportion": "比例",
    "light": "光影",
    "whole": "整体",
}

# 突破维度 → 身份标签映射（随阶段递进）
_DIM_IDENTITY_MAP = {
    "edge": "观察型画者",       # 对边缘的敏感
    "space": "构图型画者",       # 对空间的组织
    "proportion": "精准型画者",  # 对比例的把握
    "light": "光影型画者",       # 对光影的洞察
    "whole": "整体型画者",       # 对整体协调的控制
}

# 探索方向 → 友好描述（用于首次探索成就文案）
_AREA_DESCRIPTIONS = {
    "动物": "你开始用画笔捕捉生命的姿态",
    "植物": "你开始描绘自然生长的力量",
    "人物": "你开始探索人脸与身体的奥秘",
    "静物": "你开始观察日常生活中被忽略的美",
    "风景": "你开始记录眼前广阔的世界",
    "建筑": "你开始描绘人类建造的几何之美",
    "想象": "你开始让脑海中的画面落在纸上",
    "抽象": "你开始用形状和色彩表达感受",
    "其他": "你迈出了探索新方向的又一步",
}


def run(perception_result: dict, evaluation_result: dict, current_profile: dict) -> dict:
    """记忆Agent 入口（纯本地逻辑，不调 API）

    Args:
        perception_result: 感知Agent 的输出（含 exploration_area）
        evaluation_result: 评估Agent 的输出
        current_profile: 当前画者画像

    Returns:
        memory_context dict，结构见 Day0 契约「契约 3」：
          - updated_profile: 更新后的画者画像
          - exploration_state: 探索进度状态（progress / area / is_first_exploration）
          - coach_rule_triggered: 触发的教练规则 ID
          - relevant_history: 与本次相关的历史记录（供合成Agent引用）
          - next_recommendation: 下一幅推荐
          - milestone: 是否触发里程碑
          - elapsed_s: 耗时
    """
    t0 = time.time()

    profile = copy.deepcopy(current_profile)

    # 清理临时字段（编排器注入的）
    total_drawings = profile.pop("_total_drawings", 1)
    record_id = profile.pop("_record_id", "")

    # ── 1. 计算探索进度 ──
    exploration_state = _calc_exploration(perception_result, profile, total_drawings, record_id)

    # 更新 profile 中的 exploration
    exploration = profile.get("exploration", {
        "progress": 0,
        "explored_areas": {},
        "first_explorations": [],
    })
    exploration["progress"] = exploration_state["progress"]
    exploration["explored_areas"] = exploration_state["explored_areas"]
    exploration["first_explorations"] = exploration_state["first_explorations"]

    profile["exploration"] = exploration

    # ── 2. 更新 skill_radar ──
    _update_skill_radar(profile, perception_result)

    # ── 3. 更新 identity_labels ──
    _update_identity_labels(profile, perception_result, total_drawings)

    # ── 4. 执行教练规则判断 ──
    coach_rule_triggered = _check_coach_rules(
        exploration, exploration_state, total_drawings
    )

    # ── 5. 调用真实函数获取 milestone 和 recommendation ──
    milestone = get_milestone(total_drawings)
    try:
        next_rec = get_recommendation(profile, total_drawings + 1)
    except Exception:
        next_rec = None

    result = {
        "updated_profile": profile,
        "exploration_state": exploration_state,
        "coach_rule_triggered": coach_rule_triggered,
        "relevant_history": [],  # 合成Agent 可从 records 自行提取
        "next_recommendation": next_rec,
        "milestone": milestone,
        "elapsed_s": round(time.time() - t0, 2),
    }

    return result


# ── 私有辅助函数 ──────────────────────────────────────


def _calc_exploration(
    perception_result: dict, profile: dict, total_drawings: int, record_id: str
) -> dict:
    """基于感知结果计算探索进度变化（本地规则，不调 API）。

    累积逻辑（永不扣分，只增不减）：
      1. progress += 1（每次完成画作）
      2. explored_areas[方向] += 1
      3. 若该方向为首次探索 → 追加 first_explorations 里程碑
    """
    # 从感知结果获取探索方向
    area = perception_result.get("exploration_area", "其他")

    # 获取当前探索状态
    exploration = profile.get("exploration", {})
    current_progress = exploration.get("progress", total_drawings - 1)
    explored_areas = dict(exploration.get("explored_areas", {}))
    first_explorations = list(exploration.get("first_explorations", []))

    # 累积 +1（永不减）
    new_progress = current_progress + 1

    # 方向计数 +1
    explored_areas[area] = explored_areas.get(area, 0) + 1

    # 检查是否首次探索该方向
    is_first_exploration = area not in {
        f["area"] for f in first_explorations if isinstance(f, dict)
    }
    if is_first_exploration:
        first_explorations.append({
            "area": area,
            "record_id": record_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    return {
        "progress": new_progress,
        "area": area,
        "is_first_exploration": is_first_exploration,
        "explored_areas": explored_areas,
        "first_explorations": first_explorations,
        "area_description": _AREA_DESCRIPTIONS.get(area, _AREA_DESCRIPTIONS["其他"]),
        "explored_area_count": len(explored_areas),
    }


def _update_skill_radar(profile: dict, perception_result: dict):
    """更新 profile.skill_radar（五维分数追加到 history，更新 trend）。

    结构见 Day0 契约「四、画者画像 Schema」：
      "skill_radar": {
          "edge": {"score": 5, "trend": "stable", "history": [4, 5, 5, 6]},
          ...
      }
    """
    dims = perception_result.get("dimensions", {})
    radar = profile.get("skill_radar", {})

    for dim, score in dims.items():
        if dim not in radar:
            radar[dim] = {"score": 5, "trend": "stable", "history": []}

        entry = radar[dim]
        old_score = entry.get("score", 5)
        history = entry.get("history", [])

        # 更新 trend
        if score > old_score:
            entry["trend"] = "up"
        elif score < old_score:
            entry["trend"] = "down"
        else:
            entry["trend"] = "stable"

        # 追加历史
        history.append(old_score)  # 追加旧分数（新分数在 score 字段）
        history = history[-20:]  # 保留最近 20 条

        entry["score"] = score
        entry["history"] = history

    profile["skill_radar"] = radar


def _update_identity_labels(
    profile: dict, perception_result: dict, total_drawings: int
):
    """更新 profile.identity_labels（从突破维度 + 阶段推断身份标签）。

    身份标签随阶段递进：
      - 新手期：行为描述（"你在认真观察边缘"）
      - 入门期：模式描述（"你开始注意到光影关系"）
      - 成长期+：特质描述（"你有观察型画者的敏感"）

    同一身份标签不重复添加。
    """
    from data_store import get_drawing_stage

    stage = get_drawing_stage(total_drawings)
    breakthrough = perception_result.get("breakthrough_dim", "whole")
    identity_label = _DIM_IDENTITY_MAP.get(breakthrough, "画者")

    labels = profile.get("identity_labels", [])
    existing_labels = {item.get("label") for item in labels if isinstance(item, dict)}

    if identity_label not in existing_labels:
        # 根据阶段生成不同描述
        if stage == "新手期":
            description = f"你在认真观察{_DIM_LABELS.get(breakthrough, breakthrough)}"
        elif stage == "入门期":
            description = f"你开始注意到{_DIM_LABELS.get(breakthrough, breakthrough)}关系"
        else:
            description = f"你有{identity_label}的敏感"

        labels.append({
            "label": identity_label,
            "description": description,
            "earned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "perception",
            "stage": stage,
        })

    profile["identity_labels"] = labels


def _check_coach_rules(
    exploration: dict, exploration_state: dict, total_drawings: int
) -> str | None:
    """执行 4 条教练规则判断。

    规则优先级（改造后，删除 consecutive_drops 依赖）：
      rule_3 > rule_1 > rule_2 > rule_4
      新用户保护 > 首次探索成就 > 多方向探索激励 > 高探索度直说

    Returns:
        触发的规则 ID，未触发返回 None
    """
    progress = exploration_state.get("progress", total_drawings)
    is_first_exploration = exploration_state.get("is_first_exploration", False)
    explored_area_count = exploration_state.get("explored_area_count", 0)

    # rule_3：新用户首次交互，零风险入口
    if total_drawings == 1:
        return "rule_3_new_user"

    # rule_1：首次探索新方向，触发成就与正强化
    if is_first_exploration:
        return "rule_1_first_exploration"

    # rule_2：已探索 3+ 个方向，激励多方向探索
    if explored_area_count >= 3:
        return "rule_2_multi_direction"

    # rule_4：探索进度较高（20+），可直接给改进建议
    if progress > 20:
        return "rule_4_high_exploration"

    return None
