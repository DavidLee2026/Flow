"""事件埋点与漏斗统计"""

import json
from datetime import datetime
from config import TRACKING_FILE


def log_event(event: str, metadata: dict = None):
    """记录用户行为事件"""
    events = []
    if TRACKING_FILE.exists():
        try:
            events = json.loads(TRACKING_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    events.append({
        "event": event,
        "ts": datetime.now().isoformat(),
        "metadata": metadata or {},
    })
    TRACKING_FILE.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")


def get_funnel_stats() -> dict:
    """计算各步骤的漏斗数据"""
    events = []
    if TRACKING_FILE.exists():
        try:
            events = json.loads(TRACKING_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    # 完整用户旅程漏斗定义
    funnel_sequence = [
        ("onboarding_start", "① 看到引导页"),
        ("onboarding_complete", "② 完成引导"),
        ("page_home", "③ 看到首页"),
        ("recommendation_viewed", "④ 看到今日推荐"),
        ("growth_entry_clicked", "⑤ 点击进入成长"),
        ("page_growth", "⑥ 进入成长页面"),
        ("stage_detail_viewed", "⑦ 查看关卡详情"),
        ("camera_opened", "⑧ 打开相机"),
        ("image_uploaded", "⑨ 上传画作"),
        ("ai_feedback_viewed", "⑩ 看到 AI 反馈"),
    ]

    total_users = 1  # 至少1个用户
    funnel = []
    prev_count = None
    for event_key, event_label in funnel_sequence:
        count = sum(1 for e in events if e["event"] == event_key)
        if prev_count is not None and prev_count > 0:
            drop_rate = round((1 - count / prev_count) * 100, 1)
        else:
            drop_rate = 0
        if prev_count is None:
            total_users = count
        funnel.append({
            "step": event_label,
            "event": event_key,
            "count": count,
            "drop_rate": drop_rate,
        })
        prev_count = count

    return {
        "funnel": funnel,
        "total_events": len(events),
        "total_users": total_users,
    }
