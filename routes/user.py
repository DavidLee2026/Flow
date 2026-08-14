"""用户 / 统计 / 埋点路由（蓝图）"""
import json
from datetime import date, timedelta, datetime
from flask import Blueprint, request, jsonify
from config import IMAGES_DIR, TRACKING_FILE, COMMUNITY_FILE
from data_store import (
    load_records, save_records, load_profile, save_profile, save_community_posts,
    calc_streak, calc_max_streak, _record_date, get_drawing_stage, get_funnel_stats, log_event,
)

bp = Blueprint("user", __name__)


@bp.route("/api/stats")
def api_stats():
    records = load_records()
    profile = load_profile()

    total = len(records)

    # 埋点：首页访问
    log_event("page_home", {"total": total, "onboarding": profile.get("onboarding_done", False)})
    max_streak = calc_max_streak(records)
    current_streak = calc_streak(records)

    # 等级系统：基于最大连胜 + 总张数，不再纯看张数
    # 等级规则：[level, title, 达标所需 streak, 达标所需 total(备选)]
    LEVEL_RULES = [
        (1, "探索者", 0, 1),    # 画了第 1 张
        (2, "坚持者", 3, 10),    # 连续 3 天 or 累计 10 张
        (3, "成长者", 7, 25),    # 连续 7 天 or 累计 25 张
        (4, "磨炼者", 14, 50),    # 连续 14 天 or 累计 50 张
        (5, "创作者", 30, 100),    # 连续 30 天 or 累计 100 张
    ]

    # 判断当前等级
    level = 1
    level_title = "探索者"
    for lv, title, need_streak, need_total in LEVEL_RULES:
        if max_streak >= need_streak or total >= need_total:
            level = lv
            level_title = title
        else:
            break

    # 子等级（星星）：基于"达标进度"
    # 当前等级的目标
    if level < 5:
        _, _, next_need_streak, next_need_total = LEVEL_RULES[level]
        # 用 streak 的完成度作为主要进度，total 作为辅助
        streak_progress = min(100, max_streak / next_need_streak * 100) if next_need_streak else 0
        total_progress = min(100, total / next_need_total * 100) if next_need_total else 0
        progress = max(streak_progress, total_progress)
        sub_level = min(5, max(0, int(progress / 20)))  # 20% 一星
        next_at_streak = next_need_streak
        next_at_total = next_need_total
    else:
        progress = 100
        sub_level = 5
        next_at_streak = None
        next_at_total = None

    level_data = {
        "level": level,
        "title": level_title,
        "sub_level": sub_level,
        "progress": round(progress, 1),
        "next_at_streak": next_at_streak,
        "next_at_total": next_at_total,
        "max_streak": max_streak,
    }

    # 画作标签统计（简单词频）
    tag_counts = {}
    for r in records:
        fb = r.get("feedback", "")
        for tag in ["线条", "色彩", "透视", "明暗", "构图", "人体", "动态", "细节"]:
            if tag in fb:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
    top_tags = sorted(tag_counts.items(), key=lambda x: -x[1])[:5]
    dominant_skill = top_tags[0][0] if top_tags else "探索中"

    # 近7天频率
    today = date.today()
    week_counts = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        count = sum(1 for r in records if _record_date(r) == d)
        week_counts.append(count)
    weekly_avg = round(sum(week_counts) / 7, 1)

    # 用户水平标签（3 级简化版，用于前端展示）
    stage = get_drawing_stage(total)
    STAGE_LABELS = {
        "新手期": "基础", "入门期": "基础",
        "成长期": "进阶", "进阶期": "进阶",
        "熟练期": "熟练",
    }
    stage_label = STAGE_LABELS.get(stage, "基础")

    return jsonify({
        "streak": current_streak,
        "max_streak": max_streak,
        "total": total,
        "level": level_data,
        "stage": stage,
        "stage_label": stage_label,
        "weekly_avg": weekly_avg,
        "dominant_skill": dominant_skill,
        "profile": {
            "name": profile.get("name", "小伙伴"),
            "onboarding_done": profile.get("onboarding_done", False),
            "exploration": profile.get("exploration", {}),
            "flow_bank": profile.get("flow_bank", {}),
        },
    })


@bp.route("/api/onboarding", methods=["GET", "POST"])
def api_onboarding():
    """获取/保存用户画像（v3.0：仅名字）"""
    if request.method == "POST":
        data = request.get_json() or {}
        profile = load_profile()

        if "name" in data:
            profile["name"] = data["name"].strip()[:20]

        # 有名字即完成引导
        if profile.get("name"):
            profile["onboarding_done"] = True
            profile["onboarding_at"] = datetime.now().isoformat()

        save_profile(profile)

        if profile.get("onboarding_done"):
            log_event("onboarding_complete", {"name": profile.get("name")})

        return jsonify({"profile": profile})

    return jsonify({"profile": load_profile()})


@bp.route("/api/profile", methods=["GET", "POST"])
def api_profile():
    """获取/设置用户昵称（兼容旧版）"""
    if request.method == "POST":
        data = request.get_json()
        profile = load_profile()
        if data and "name" in data:
            profile["name"] = data["name"].strip()[:20]
        save_profile(profile)
        return jsonify({"profile": profile})
    return jsonify({"profile": load_profile()})


@bp.route("/api/reset", methods=["POST"])
def api_reset():
    """清空所有用户数据（记录、画像、进度、埋点、图片）"""
    # 清空记录
    save_records([])
    # 重置画像
    fresh_profile = {
        "name": "小伙伴",
        "onboarding_done": False,
        "onboarding_at": None,
        "recommendation_index": 0,
    }
    save_profile(fresh_profile)
    # 清空埋点
    if TRACKING_FILE.exists():
        TRACKING_FILE.write_text("[]", encoding="utf-8")
    # 清空图片
    for f in IMAGES_DIR.glob("*"):
        if f.is_file():
            f.unlink()
    # 清空社区帖子（否则残留帖子引用已删除的图片）
    if COMMUNITY_FILE.exists():
        save_community_posts([])
    return jsonify({"ok": True, "message": "所有数据已清空，刷新页面后重新开始"})


@bp.route("/api/track", methods=["POST"])
def api_track():
    """前端主动上报事件"""
    data = request.get_json() or {}
    event = data.get("event", "")
    metadata = data.get("metadata", {})
    if event:
        log_event(event, metadata)
    return jsonify({"ok": True})


@bp.route("/api/tracking/stats")
def api_tracking_stats():
    """查看埋点漏斗数据"""
    stats = get_funnel_stats()
    # 读取原始事件列表（最近 50 条）
    events = []
    if TRACKING_FILE.exists():
        try:
            events = json.loads(TRACKING_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    recent = sorted(events, key=lambda e: e["ts"], reverse=True)[:50]
    return jsonify({
        "funnel": stats["funnel"],
        "total_events": stats["total_events"],
        "total_users": stats["total_users"],
        "recent_events": recent,
    })
