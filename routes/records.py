"""记录 / 反思路由（蓝图）"""
import json
import time as _time_module
from flask import Blueprint, request, jsonify, Response
from config import DATA_DIR, LLM_MODEL, client
from data_store import load_records, save_records, log_event
from ai_service import _sse_event

bp = Blueprint("records", __name__)


def _cur_user() -> str:
    """从请求头 X-User 取当前用户昵称（URL 编码，需 unquote；无则 default）。"""
    from urllib.parse import unquote
    return unquote(request.headers.get("X-User", "")).strip() or "default"


@bp.route("/api/timeline")
def api_timeline():
    records = load_records(_cur_user())
    records.reverse()
    return jsonify({"records": records})


@bp.route("/api/record/<record_id>", methods=["DELETE"])
def api_delete_record(record_id):
    """删除指定画作记录及其图片文件（按用户隔离）。"""
    nick = _cur_user()
    records = load_records(nick)
    record = next((r for r in records if r.get("id") == record_id), None)
    if not record:
        return jsonify({"error": "找不到该记录"}), 404

    # 删除图片文件
    image_path = record.get("image", "")
    if image_path:
        full_path = DATA_DIR / image_path
        if full_path.exists():
            try:
                full_path.unlink()
            except Exception:
                pass

    records.remove(record)
    save_records(nick, records)
    log_event("record_deleted", {"record_id": record_id})
    return jsonify({"ok": True})


@bp.route("/api/record/<record_id>/reflection", methods=["POST"])
def api_save_reflection(record_id):
    """保存用户反思 + AI 回应到画作记录（详情页展示用）。"""
    nick = _cur_user()
    data = request.get_json() or {}
    text = (data.get("text") or "").strip()[:300]
    reply = (data.get("reply") or "").strip()[:300]
    records = load_records(nick)
    for r in records:
        if r.get("id") == record_id:
            r["reflection"] = {"text": text, "reply": reply}
            save_records(nick, records)
            return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "记录不存在"}), 404


@bp.route("/api/reflection", methods=["POST"])
def api_reflection():
    """用户画完画后写下反思，AI 给予个性化的回应（SSE 流式）。

    前端 ``sendReflection()`` 发送用户反思文本+主题，
    后端以 SSE 流式返回 AI 生成的单句回复（逐字推送），让用户立即看到内容不断出现。
    """
    data = request.get_json() or {}
    user_text = (data.get("text") or "").strip()
    subject = (data.get("subject") or "这次画画").strip()
    rec_id = (data.get("record_id") or "").strip()  # 反思保存到对应画作记录
    nick = _cur_user()

    if not user_text:
        return jsonify({"reply": "嗯，你说了什么吗？我好像没看到 😅"})

    def _save_reflection(text, reply):
        """反思 + AI 回应保存到画作记录（详情页展示）。"""
        if not rec_id or not text:
            return
        records = load_records(nick)
        for r in records:
            if r.get("id") == rec_id:
                r["reflection"] = {"text": text, "reply": reply}
                save_records(nick, records)
                print(f"[reflection] ✅ 反思已保存到记录 {rec_id}", flush=True)
                break

    def generate():
        _t0 = _time_module.time()
        reply_parts = []
        try:
            stream = client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "你是小绘。用户画完画写了一句反思，你用一句话针对内容回应ta，语气自然，不加emoji。",
                    },
                    {
                        "role": "user",
                        "content": f"主题：{subject}\n用户说：「{user_text}」",
                    },
                ],
                max_tokens=20,
                temperature=0.8,
                stream=True,
                extra_body={"thinking": {"type": "disabled"}},
            )
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    reply_parts.append(token)
                    yield _sse_event({'token': token})
            elapsed = round(_time_module.time() - _t0, 1)
            _save_reflection(user_text, ''.join(reply_parts))
            print(f"[reflection] SSE 完成，耗时 {elapsed:.1f}s", flush=True)
            yield _sse_event({'type': 'done', 'elapsed_s': elapsed})
        except Exception as e:
            yield _sse_event({'type': 'fallback', 'text': '嗯，我听到了。每次进步都值得记下来 ☺️'})

    resp = Response(generate(), mimetype="text/event-stream", direct_passthrough=True)
    resp.headers["Cache-Control"] = "no-cache, no-transform"
    resp.headers["X-Accel-Buffering"] = "no"
    resp.headers["Connection"] = "keep-alive"
    return resp


@bp.route("/api/reflection-tags", methods=["POST"])
def api_reflection_tags():
    """根据画作主题和 AI 反馈，生成 3 个个性化的反思快选标签。"""
    data = request.get_json() or {}
    subject = (data.get("subject") or "").strip()
    feedback_snippet = (data.get("feedback_snippet") or "").strip()[:200]

    print(f"[reflection-tags] 收到请求: subject='{subject}' snippet='{feedback_snippet[:50]}...'", flush=True)
    # 兜底：没有足够上下文时返回默认标签
    if not subject and not feedback_snippet:
        print(f"[reflection-tags] ⚠ 上下文不足，返回兜底标签", flush=True)
        return jsonify({"tags": [
            {"text": "形状抓得准", "emoji": "🎯"},
            {"text": "线条更流畅", "emoji": "〰️"},
            {"text": "今天有感觉", "emoji": "🎨"},
        ]})

    _t0 = _time_module.time()
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个绘画陪伴助手。用户画了一幅画，请根据画作主题和AI反馈，"
                        "生成3个简短、具体的反思快选标签，让用户选择最满意的地方。"
                        "每个标签6字以内，去掉'了''的'等虚词。\n"
                        "格式：JSON对象，tags字段是数组，每个元素有text和emoji字段。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"主题：{subject}\n反馈要点：{feedback_snippet}",
                },
            ],
            max_tokens=300,
            temperature=0.7,
            response_format={"type": "json_object"},
            extra_body={"thinking": {"type": "disabled"}},
        )
        result = json.loads(resp.choices[0].message.content)
        tags = result.get("tags", [])[:3]
        elapsed = round(_time_module.time() - _t0, 1)
        print(f"[reflection-tags] API 完成，耗时 {elapsed:.1f}s，生成 {len(tags)} 个标签", flush=True)
        if tags and all(isinstance(t, dict) and t.get("text") for t in tags):
            return jsonify({"tags": tags})
    except Exception as e:
        print(f"[reflection-tags] API 失败: {e}", flush=True)
        pass

    # 兜底
    return jsonify({"tags": [
        {"text": "形状抓得准", "emoji": "🎯"},
        {"text": "线条更流畅", "emoji": "〰️"},
        {"text": "整体感觉不错", "emoji": "✨"},
        {"text": "今天有感觉", "emoji": "🎨"},
    ]})
