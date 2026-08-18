"""绘心 Flow · 社区 API（Blueprint）"""
import uuid
from datetime import datetime
from urllib.parse import unquote

from flask import Blueprint, request, jsonify

from config import client, LLM_MODEL
from data_store import (
    load_records,
    load_profile,
    load_community_posts,
    save_community_posts,
    log_event,
)

community_bp = Blueprint("community", __name__)


def _cur_user() -> str:
    """从请求头 X-User 取当前用户昵称（URL 编码，需 unquote；无则 default）。"""
    return unquote(request.headers.get("X-User", "")).strip() or "default"


def _cur_user_name() -> str:
    """当前用户展示名：直接取 X-User 昵称（与前端 userName / 点赞判断一致）。"""
    return _cur_user()


def _content_safe(text: str) -> bool:
    """LLM 内容审核：True=安全放行；LLM 未配置或调用失败时放行（不阻断分享）。

    与 routes/analyze.py 的 _judge 同款调用模式（max_tokens=10、temperature=0、
    关闭思考），只判断一句话结论。
    """
    text = (text or "").strip()
    if not text or not client:
        return True
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "你是内容安全审核员。判断下面这段文字是否包含不当内容"
                        "（暴力、色情、人身攻击、广告营销、违法信息、诱导欺诈）。\n"
                        f"文字：{text[:200]}\n"
                        "只回答一个词：safe（安全）或 unsafe（不当）。"
                    ),
                }
            ],
            max_tokens=10,
            temperature=0,
            extra_body={"thinking": {"type": "disabled"}},
        )
        answer = (resp.choices[0].message.content or "").strip().lower()
        return "unsafe" not in answer
    except Exception as e:
        print(f"[community] 内容审核调用失败，放行: {e}", flush=True)
        return True


@community_bp.route("/api/community")
def api_community():
    """获取社区画作列表（按时间倒序，分页）。

    GET /api/community?page=1&page_size=20（page_size 上限 50）
    → {"posts": [...], "has_more": bool, "total": int}
    """
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(50, int(request.args.get("page_size", 20))))
    except (TypeError, ValueError):
        page_size = 20

    posts = load_community_posts()
    posts.sort(key=lambda p: p.get("timestamp", ""), reverse=True)
    start = (page - 1) * page_size
    chunk = posts[start:start + page_size]
    has_more = start + page_size < len(posts)
    return jsonify({"posts": chunk, "has_more": has_more, "total": len(posts)})


@community_bp.route("/api/community/share", methods=["POST"])
def api_community_share():
    """将自己的画作分享到社区。

    接收 record_id，从用户记录中找到对应画作，复制到社区列表。
    """
    record_id = request.json.get("record_id", "").strip()
    if not record_id:
        return jsonify({"error": "缺少 record_id"}), 400

    nick = _cur_user()
    records = load_records(nick)
    record = next((r for r in records if r.get("id") == record_id), None)
    if not record:
        return jsonify({"error": "找不到该画作记录"}), 404

    profile = load_profile(nick)
    posts = load_community_posts()

    # 避免重复分享
    if any(p.get("source_record_id") == record_id for p in posts):
        return jsonify({"error": "这幅画已经分享过了"}), 409

    # 提取反馈摘要（取第一层或前 60 字）
    feedback_summary = ""
    if record.get("feedback_json") and record["feedback_json"].get("layers"):
        first_layer = record["feedback_json"]["layers"][0]
        feedback_summary = (first_layer.get("content") or "")[:80]
    elif record.get("feedback"):
        feedback_summary = record["feedback"][:80]

    # 分享前 LLM 内容审核（反馈摘要 + 主题）：不当内容拦截，LLM 不可用放行
    if not _content_safe(f"{feedback_summary} {record.get('theme', '')}".strip()):
        return jsonify({"ok": False, "error": "内容未能通过审核"})

    post = {
        "id": str(uuid.uuid4())[:8],
        "source_record_id": record_id,
        "image": record.get("image", ""),
        "author": nick,  # 直接用 X-User 昵称：与删除校验 / 前端 userName 判断保持一致
        "theme": record.get("theme", ""),
        "feedback_summary": feedback_summary,
        "timestamp": datetime.now().isoformat(),
        "likes": 0,
        "liked_by": [],
        "comments": [],
    }
    posts.append(post)
    save_community_posts(posts)
    log_event("community_share", {"record_id": record_id, "post_id": post["id"]})
    return jsonify({"ok": True, "post": post})


@community_bp.route("/api/community/delete", methods=["POST"])
def api_community_delete():
    """作者删除自己的社区帖子（仅作者本人可删，非作者 403）。"""
    data = request.get_json(silent=True) or {}
    post_id = (data.get("post_id") or "").strip()
    if not post_id:
        return jsonify({"error": "缺少 post_id"}), 400

    nick = _cur_user()
    posts = load_community_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    if not post:
        return jsonify({"error": "找不到该帖子"}), 404
    if post.get("author") != nick:
        return jsonify({"error": "只能删除自己的帖子"}), 403

    posts.remove(post)
    save_community_posts(posts)
    log_event("community_post_deleted", {"post_id": post_id})
    return jsonify({"ok": True})


@community_bp.route("/api/community/like/<post_id>", methods=["POST"])
def api_community_like(post_id):
    """点赞社区画作（每个用户只能点一次）。"""
    user_name = _cur_user_name()

    posts = load_community_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    if not post:
        return jsonify({"error": "找不到该帖子"}), 404

    liked_by = post.get("liked_by", [])
    if user_name in liked_by:
        return jsonify({"error": "你已经点过赞了", "already_liked": True, "likes": post["likes"]}), 409

    liked_by.append(user_name)
    post["liked_by"] = liked_by
    post["likes"] = post.get("likes", 0) + 1
    save_community_posts(posts)
    return jsonify({"ok": True, "likes": post["likes"], "already_liked": False})


@community_bp.route("/api/community/comment/<post_id>", methods=["POST"])
def api_community_comment(post_id):
    """评论社区画作。"""
    user_name = _cur_user_name()
    content = request.json.get("content", "").strip()

    if not content:
        return jsonify({"error": "评论内容不能为空"}), 400
    if len(content) > 500:
        return jsonify({"error": "评论内容过长，最多500字"}), 400

    posts = load_community_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    if not post:
        return jsonify({"error": "找不到该帖子"}), 404

    comment = {
        "id": str(uuid.uuid4())[:8],
        "author": user_name,
        "content": content,
        "timestamp": datetime.now().isoformat(),
        "liked_by": [],
        "likes": 0,
    }
    post["comments"] = post.get("comments", [])
    post["comments"].append(comment)
    save_community_posts(posts)
    return jsonify({"ok": True, "comment": comment, "total": len(post["comments"])})


@community_bp.route("/api/community/comment/like/<post_id>/<comment_id>", methods=["POST"])
def api_community_comment_like(post_id, comment_id):
    """点赞社区评论（每个用户只能点一次）。"""
    user_name = _cur_user_name()

    posts = load_community_posts()
    post = next((p for p in posts if p.get("id") == post_id), None)
    if not post:
        return jsonify({"error": "找不到该帖子"}), 404

    comments = post.get("comments", [])
    comment = next((c for c in comments if c.get("id") == comment_id), None)
    if not comment:
        return jsonify({"error": "找不到该评论"}), 404

    liked_by = comment.get("liked_by", [])
    if user_name in liked_by:
        return jsonify({"error": "你已经点过赞了", "already_liked": True, "likes": comment.get("likes", 0)}), 409

    liked_by.append(user_name)
    comment["liked_by"] = liked_by
    comment["likes"] = comment.get("likes", 0) + 1
    save_community_posts(posts)
    return jsonify({"ok": True, "likes": comment["likes"], "already_liked": False})
