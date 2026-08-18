"""画作分析路由（蓝图）"""
import os
import uuid
import base64
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from config import DATA_DIR, IMAGES_DIR, LLM_MODEL, CHECK_DRAWING_MODEL, client, user_images_dir
from data_store import load_records, save_records, load_profile, get_milestone, log_event, get_recommendation
from ai_service import analyze_drawing, _compress_image_b64
import orchestrator

bp = Blueprint("analyze", __name__)


@bp.route("/api/analyze", methods=["POST"])
def api_analyze():
    if "image" not in request.files:
        return jsonify({"error": "请上传图片"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "请选择图片"}), 400

    from urllib.parse import unquote
    nick = unquote(request.headers.get("X-User", "")).strip() or "default"
    record_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().isoformat()
    ext = os.path.splitext(file.filename)[1] or ".jpg"
    filename = f"{timestamp[:10]}_{record_id}{ext}"
    image_path = user_images_dir(nick) / filename
    file.save(image_path)

    past_records = load_records(nick)
    profile = load_profile(nick)
    history = [r["feedback"] for r in past_records[-2:]] if past_records else None
    total = len(past_records) + 1

    try:
        feedback, feedback_json, elapsed, boss_result = analyze_drawing(
            image_path,
            history=history,
            user_name=profile.get("name", "小伙伴"),
            total_drawings=total,
            user_level=profile.get("level"),
            user_goal=profile.get("goal"),
        )
    except Exception as e:
        return jsonify({"error": f"分析失败: {str(e)}"}), 500

    note = request.form.get("note", "").strip()[:200]

    milestone = get_milestone(total)

    record = {
        "id": record_id,
        "image": f"images/{filename}",
        "feedback": feedback,
        "feedback_json": feedback_json,
        "milestone": milestone,
        "note": note,
        "elapsed_s": round(elapsed, 1),
        "timestamp": timestamp,
    }
    records = load_records(nick)
    records.append(record)
    save_records(nick, records)

    # 埋点：上传画作
    log_event("image_uploaded", {"total": total, "record_id": record_id})

    # 画完后推荐下一幅
    next_rec = get_recommendation(profile, total + 1)

    return jsonify({"record": record, "next_recommendation": next_rec, "boss_result": None})


@bp.route("/api/share-image", methods=["POST"])
def api_share_image():
    """上传前端生成的分享图，返回 http 地址。

    微信 WebView 里长按图片需要真实 URL 才能弹"发送给朋友/保存"菜单，
    data URL 长按无效 → 前端生成分享图后 POST 到这里换取 http 地址。
    """
    payload = request.json or {}
    data_url = payload.get("data_url", "")
    if not data_url or not data_url.startswith("data:image/"):
        return jsonify({"error": "invalid image data"}), 400
    try:
        mime, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
        ext = "png" if "png" in mime else "jpg"
        share_dir = DATA_DIR / "share_images"
        share_dir.mkdir(parents=True, exist_ok=True)
        filename = f"share_{uuid.uuid4().hex[:8]}.{ext}"
        (share_dir / filename).write_bytes(raw)
        return jsonify({"url": f"/data/share_images/{filename}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/check-drawing", methods=["POST"])
def api_check_drawing():
    """快速判断上传的图片是否为手绘画作。"""
    if "image" not in request.files:
        return jsonify({"is_drawing": True})  # 没有图片就不拦

    file = request.files["image"]
    image_b64 = _compress_image_b64(file)

    try:
        def _judge(model: str) -> bool:
            """单模型判定：返回 True=手绘画作，False=非画作（未明确也保守拦）。"""
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "判断这张图片是不是「真实手绘的画作」。\n"
                                    "【是画作】：素描、速写、铅笔/炭笔画、水彩、油画、彩铅、马克笔、"
                                    "粉笔画、儿童涂鸦、简笔画。判断依据：画面有笔触或纸纹——"
                                    "线条有深浅变化、边缘不匀，或色彩有手工晕染。"
                                    "画得难看、歪斜、不完整都算画作。\n"
                                    "【不是画作】：真实的照片（人物/物品/风景/产品的摄影）、"
                                    "3D 渲染效果图、电商产品图、手机或电脑屏幕截图"
                                    "（有明显屏幕摩尔纹、反光、像素点阵）、纯文字图表、"
                                    "设计海报、卡通贴纸。\n"
                                    "注意：\n"
                                    "1. 一张画即使画得很专业、像名画，只要看得出是画笔创作，也算画作。\n"
                                    "2. 一张照片或屏幕截图即使内容是好看的图，也不算画作。\n"
                                    "3. 如果拿不准，倾向于 drawing。\n"
                                    "只回答一个词：drawing 或 not_drawing。"
                                ),
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_b64}"
                                },
                            },
                        ],
                    }
                ],
                max_tokens=10,
                temperature=0,
                extra_body={"thinking": {"type": "disabled"}},
            )
            answer = resp.choices[0].message.content.strip().lower()
            if "not_drawing" in answer or "not drawing" in answer:
                return False
            elif "drawing" in answer:
                return True
            return False  # 未给出明确词 → 保守拦截（让用户确认）

        # 双模型交叉判定：mini + lite 各判 1 次（并行），任一判非手绘 → 触发软确认。
        # 2 次全判画作才放行，漏拦率降到单次波动的平方级；
        # 双模型交叉判定仍优于单次判定（两个独立模型互为校验，可抵消单一模型的系统偏差）；
        # 某次判定失败保守按非画作处理（走软确认，用户可确认继续，不误伤真画）。
        from concurrent.futures import ThreadPoolExecutor

        def _judge_safe(model):
            try:
                return _judge(model)
            except Exception as e:
                print(f"[check-drawing] {model} 判定失败，按非画作处理: {e}", flush=True)
                return False

        with ThreadPoolExecutor(max_workers=2) as _ex:
            _futures = [_ex.submit(_judge_safe, m) for m in (LLM_MODEL, CHECK_DRAWING_MODEL)]
            _results = [f.result() for f in _futures]
        is_drawing = all(_results)
        print(f"[check-drawing] 双模型判定 mini={_results[0]} lite={_results[1]} → is_drawing={is_drawing}", flush=True)
        return jsonify({"is_drawing": is_drawing})
    except Exception as e:
        print(f"[check-drawing] 检测失败: {e}，默认放行", flush=True)
        return jsonify({"is_drawing": True})  # 检测失败就放行


@bp.route("/api/analyze/stream", methods=["POST"])
def api_analyze_stream():
    """流式分析画作（SSE）· 2.0 Agent 编排版。

    2.0 改为调用 orchestrator.run()，按序执行 4 个 Agent：
      感知Agent → 评估Agent → 记忆Agent → 合成Agent

    SSE 事件序列（2.0 增强）：
      data: {"type":"first_impression","message":"..."}           # 兼容 1.0
      data: {"type":"orchestrator_start","message":"..."}          # 编排器启动
      data: {"type":"agent_start","agent":"perception",...}        # 每个 Agent
      data: {"type":"agent_done","agent":"perception",...}         # 各一对
      ...
      data: {"type":"layer","layer":{...}}                        # 5 层反馈
      ...
      data: {"type":"agent_done","agent":"synthesis",...}          # 合成完成
      data: {"type":"complete","record":{...},...}                 # 全部完成
    """
    if "image" not in request.files:
        return jsonify({"error": "请上传图片"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "请选择图片"}), 400

    # 1. 保存图片（多用户：按昵称目录）
    from urllib.parse import unquote
    nick = unquote(request.headers.get("X-User", "")).strip() or "default"
    record_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().isoformat()
    ext = os.path.splitext(file.filename)[1] or ".jpg"
    filename = f"{timestamp[:10]}_{record_id}{ext}"
    image_path = user_images_dir(nick) / filename
    file.save(image_path)

    # 2. 获取历史记录、profile（按用户）
    past_records = load_records(nick)
    profile = load_profile(nick)
    note = request.form.get("note", "").strip()[:200]
    theme = request.form.get("theme", "").strip()[:100]

    record_context = {
        "record_id": record_id,
        "image_relpath": f"users/{nick}/images/{filename}",
        "timestamp": timestamp,
        "note": note,
        "theme": theme,
        "profile": profile,
    }

    # 3. 调用编排器（2.0 替换原 analyze_drawing_stream）
    def generate():
        for sse in orchestrator.run(image_path, profile, past_records, record_context, nick):
            yield sse

    # 4. 返回 SSE 响应
    resp = Response(generate(), mimetype="text/event-stream", direct_passthrough=True)
    resp.headers["Cache-Control"] = "no-cache, no-transform"
    resp.headers["X-Accel-Buffering"] = "no"  # 禁用 Nginx 缓冲，确保实时推送
    resp.headers["Connection"] = "keep-alive"
    return resp
