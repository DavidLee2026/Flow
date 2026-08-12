"""阶段/里程碑/连胜/推荐逻辑"""

from datetime import datetime, date, timedelta
from .content import RECOMMENDATION_POOL
from .masters import RECOMMENDATION_IMAGES, MASTER_TO_REC
from .profile import save_profile


def get_drawing_stage(count: int) -> str:
    """根据累计画作数返回当前阶段（5 级自适应分级）。

    分级与对应的反馈深度策略见 ``analyze_drawing`` / ``_build_analyze_prompt``
    中的 ``stage_prompts``：
      - 1-5 张   → 新手期（生活化语言，禁用术语，重点鼓励）
      - 6-15 张  → 入门期（可用 1-2 个基础术语，必须解释）
      - 16-30 张 → 成长期（可用术语并简要解释，给可操作建议）
      - 31-50 张 → 进阶期（术语不需解释，深入分析构图光影）
      - 50+ 张   → 熟练期（可引用大师作品对比，挑战性建议）
    """
    if count <= 5:
        return "新手期"
    elif count <= 15:
        return "入门期"
    elif count <= 30:
        return "成长期"
    elif count <= 50:
        return "进阶期"
    else:
        return "熟练期"


def get_milestone(total: int) -> dict | None:
    """根据总画作数，决定是否显示里程碑卡片"""
    milestones = {
        1: {"icon": "🎉", "title": "第一张画",
            "message": "记住这一刻——再伟大的画家也是从第一根线开始的。"},
        5: {"icon": "🔥", "title": "坚持 5 张",
            "message": "大多数人在第 3 张就放弃了，你已经超过了 70% 的人。"},
        10: {"icon": "👑", "title": "10 张里程碑",
             "message": "翻看第一张和今天的对比——进步是真实存在的。"},
        25: {"icon": "💪", "title": "25 张·习惯成自然",
             "message": "你已经在不知不觉中养成了绘画习惯，这是最有价值的一步。"},
        50: {"icon": "🌟", "title": "50 张·质变",
             "message": "从'画出形状'到'画得像'，这 50 张见证了你的蜕变。"},
    }
    m = milestones.get(total)
    if m:
        return {"number": total, **m}
    if total > 50 and total % 50 == 0:
        return {
            "number": total,
            "icon": "🌟",
            "title": f"{total} 张",
            "message": f"你已经画了 {total} 张了！回看最初的线条和现在的对比，变化是看得见的。",
        }
    return None


def _layers_to_text(layers: list[dict], user_name: str) -> str:
    """将 5 层结构化反馈转为可读文本（用于 backward compat：timeline / modal）"""
    labels = {
        "identify": f"🎯 认出内容",
        "observe": f"🔍 具体观察",
        "progress": f"📈 进步连接",
        "suggestion": f"💡 技巧建议",
        "encourage": f"✨ 鼓励期待",
    }
    lines = []
    for layer in layers:
        t = layer.get("type", "")
        label = labels.get(t, t)
        content = (layer.get("content") or "").strip()
        lines.append(f"{label}")
        lines.append(content)
        tip = (layer.get("tip") or "").strip()
        if tip:
            lines.append(f"💡 {tip}")
        lines.append("")
    return "\n".join(lines).strip()


def _record_date(r: dict) -> date | None:
    """提取记录中的日期"""
    try:
        return datetime.fromisoformat(r["timestamp"]).date()
    except (ValueError, KeyError):
        return None


def calc_streak(records: list[dict]) -> int:
    if not records:
        return 0
    draw_dates = set()
    for r in records:
        try:
            d = datetime.fromisoformat(r["timestamp"]).date()
            draw_dates.add(d)
        except (ValueError, KeyError):
            continue
    today = date.today()
    streak = 0
    check = today
    while check in draw_dates:
        streak += 1
        check -= timedelta(days=1)
    return streak


def calc_max_streak(records: list[dict]) -> int:
    """计算历史最长连胜天数"""
    draw_dates = set()
    for r in records:
        try:
            d = datetime.fromisoformat(r["timestamp"]).date()
            draw_dates.add(d)
        except (ValueError, KeyError):
            continue
    if not draw_dates:
        return 0
    sorted_dates = sorted(draw_dates)
    max_s = 1
    cur = 1
    for i in range(1, len(sorted_dates)):
        if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
            cur += 1
            max_s = max(max_s, cur)
        else:
            cur = 1
    return max_s


def get_recommendation(profile: dict, total_drawings: int) -> dict:
    """根据绘画数量，返回一条合适的今日主题"""
    # 1. 计算等级
    if total_drawings <= 5:
        user_level = 1
    elif total_drawings <= 20:
        user_level = 2
    else:
        user_level = max(2, min(5, total_drawings // 15 + 2))

    # 2. 按等级筛选
    candidates = [
        r for r in RECOMMENDATION_POOL
        if r["min_level"] <= user_level <= r["max_level"]
    ]
    if not candidates:
        candidates = RECOMMENDATION_POOL

    # 3. 轮转
    idx = profile.get("recommendation_index", 0) % len(candidates)
    rec = dict(candidates[idx])

    # 4. 添加图片URL（优先用练习参考图，没有则回退到大师作品）
    rec_id = rec.get("id", "")
    if rec_id in RECOMMENDATION_IMAGES:
        rec["image_url"] = RECOMMENDATION_IMAGES[rec_id]
    elif rec.get("master") and rec["master"] in MASTER_TO_REC:
        rec["image_url"] = MASTER_TO_REC[rec["master"]]
    elif rec.get("master"):
        for m_name in MASTER_TO_REC:
            if rec["master"] in m_name or m_name in rec["master"]:
                rec["image_url"] = MASTER_TO_REC[m_name]
                break

    # 5. 更新索引
    profile["recommendation_index"] = idx + 1
    save_profile(profile)

    rec["level_label"] = {
        1: "新手 · 从零开始",
        2: "基础 · 打好根基",
        3: "进阶 · 挑战自己",
        4: "高阶 · 精进技艺",
        5: "创作 · 自由发挥",
    }.get(rec["difficulty"], "进阶")

    return rec
