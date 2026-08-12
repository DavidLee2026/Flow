"""推荐 / 主题 / 大师库路由（蓝图）"""
import random
from flask import Blueprint, request, jsonify
from data_store import (
    load_profile, load_records, get_recommendation, log_event,
    THEME_LIBRARY, DIFFICULTY_LABELS, MASTER_INDEX,
)

bp = Blueprint("content", __name__)


@bp.route("/api/recommend")
def api_recommend():
    """获取今日推荐（按用户等级+兴趣）"""
    profile = load_profile()
    records = load_records()
    rec = get_recommendation(profile, len(records))
    log_event("recommendation_viewed", {"rec_id": rec.get("id", "")})
    return jsonify({"recommendation": rec})


@bp.route("/api/themes")
def api_themes():
    """返回主题库，支持按难度 / 分类筛选。

    查询参数：
      - difficulty: beginner | intermediate | advanced（可选）
      - category:   主题分类名，如「日常物品」「人体」（可选）
    """
    difficulty = request.args.get("difficulty", "").strip().lower()
    category = request.args.get("category", "").strip()

    themes = list(THEME_LIBRARY)
    if difficulty in ("beginner", "intermediate", "advanced"):
        themes = [t for t in themes if t["difficulty"] == difficulty]
    if category:
        themes = [t for t in themes if t.get("category") == category]

    # 附上中文难度标签，方便前端直接展示
    for t in themes:
        t["difficulty_label"] = DIFFICULTY_LABELS.get(t["difficulty"], t["difficulty"])

    return jsonify({"themes": themes, "total": len(themes)})


@bp.route("/api/today-theme")
def api_today_theme():
    """返回今日主题（单个），支持 ?difficulty=beginner|intermediate|advanced 筛选。

    未指定 difficulty 时，按用户累计张数自动推断：
      1-5 张 → beginner，6-30 张 → intermediate，31+ 张 → advanced。
    主题在同一天内稳定（按 recommendation_index 轮转，不随每次请求变化）。

    ?random=true → 从所有难度中随机选一个（换一换功能）
    ?exclude=xxx → 排除指定 id 的主题（避免换到同一个）
    """
    profile = load_profile()
    records = load_records()
    total = len(records)

    is_random = request.args.get("random", "").strip().lower() == "true"
    exclude_id = request.args.get("exclude", "").strip()

    if is_random:
        # 换一换：从所有主题中随机选一个，排除当前主题
        pool = [t for t in THEME_LIBRARY if t["id"] != exclude_id]
        if not pool:
            pool = list(THEME_LIBRARY)
        theme = dict(random.choice(pool))
        difficulty = theme["difficulty"]
    else:
        difficulty = request.args.get("difficulty", "").strip().lower()
        if difficulty not in ("beginner", "intermediate", "advanced"):
            if total <= 5:
                difficulty = "beginner"
            elif total <= 30:
                difficulty = "intermediate"
            else:
                difficulty = "advanced"

        candidates = [t for t in THEME_LIBRARY if t["difficulty"] == difficulty]
        if not candidates:
            candidates = list(THEME_LIBRARY)

        # 用 recommendation_index 做稳定轮转
        idx = profile.get("recommendation_index", 0) % len(candidates)
        theme = dict(candidates[idx])

    theme["difficulty_label"] = DIFFICULTY_LABELS.get(difficulty, difficulty)

    log_event("today_theme_viewed", {
        "theme_id": theme.get("id", ""),
        "difficulty": difficulty,
        "total": total,
        "random": is_random,
    })
    return jsonify({"theme": theme, "difficulty": difficulty, "total_drawings": total})


@bp.route("/api/masters")
def api_masters():
    """返回大师知识库索引"""
    return jsonify({
        "masters": {k: {
            "name": v["name"],
            "period": v["period"],
            "tagline": v["tagline"],
            "bio": v["bio"],
            "learn_points": v["learn_points"][:3],
            "works": v["works"],
        } for k, v in MASTER_INDEX.items()}
    })


@bp.route("/api/masters/search")
def api_masters_search():
    """搜索大师（按名字模糊匹配）"""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"results": []})
    results = []
    for name, data in MASTER_INDEX.items():
        if q in name or name.startswith(q):
            results.append({
                "name": name,
                "tagline": data["tagline"],
                "bio": data["bio"],
                "learn_points": data["learn_points"],
                "works": data["works"][:3],
            })
    return jsonify({"results": results})
