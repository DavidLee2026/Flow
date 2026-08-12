"""SSE 流式分析 + 事件封装 + layer 增量提取"""

import json
import re
import base64
from pathlib import Path
from config import LLM_MODEL, client
from data_store import (get_drawing_stage, _layers_to_text, get_milestone,
                        load_records, save_records, log_event, get_recommendation, load_profile)
from .analyze import _compress_image_b64
from .prompts import _build_analyze_prompt


def _sse_event(data: dict) -> bytes:
    """把 dict 序列化为一条 SSE 事件，直接返回 bytes。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


# 用于在流式输出中增量提取「已完成的 layer 对象」
# 使用 JSONDecoder.raw_decode 代替正则，正确处理 content 内含 } 的场景
_json_decoder = json.JSONDecoder()
_LAYER_TYPES = ("identify", "observe", "progress", "suggestion", "encourage")


def _extract_complete_layers(accumulated: str, seen_count: int = 0) -> list[dict]:
    """从累积文本中提取完整的 layer JSON 对象。

    用 JSONDecoder.raw_decode 逐个尝试解析，正确处理字符串内的 ``}`` 等特殊字符。
    只返回 ``seen_count`` 之后新增的 layer（避免重复）。
    """
    results = []
    i = 0
    found = 0
    while i < len(accumulated):
        match = re.search(r'\{\s*"type"', accumulated[i:])
        if not match:
            break
        idx = i + match.start()
        try:
            obj, consumed = _json_decoder.raw_decode(accumulated[idx:])
            if isinstance(obj, dict) and obj.get("type") in _LAYER_TYPES:
                found += 1
                if found > seen_count:
                    results.append(obj)
                i = idx + consumed
            else:
                i = idx + 1
        except json.JSONDecodeError:
            # JSON 还不完整，跳过继续搜索
            i = idx + 1
    return results


def analyze_drawing_stream(
    image_path: Path,
    history: list[str] | None = None,
    user_name: str = "小伙伴",
    total_drawings: int = 1,
    user_level: str | None = None,
    user_goal: str | None = None,
    record_context: dict | None = None,
):
    """流式分析画作，逐个 yield SSE 事件字符串。

    与 ``analyze_drawing`` 复用同一套 prompt 构建逻辑（``_build_analyze_prompt``），
    仅 API 调用改为 ``stream=True`` 并逐块提取 layers。

    事件类型：
      - {"type":"layer","layer":{...}}           每检测到一个新的完整 layer
      - {"type":"complete","record":...,"milestone":...,"next_recommendation":...}
      - {"type":"error","message":"..."}         出错时

    ``record_context``（可选）用于在 complete 事件中返回与 ``/api/analyze`` 一致的
    完整 record 并持久化，包含字段：
      record_id / image_relpath / timestamp / note / profile
    若不传，complete 事件仅返回分析结果（feedback / feedback_json / elapsed_s）。
    """
    import time

    image_b64 = _compress_image_b64(image_path)
    prompt = _build_analyze_prompt(
        history=history,
        user_name=user_name,
        total_drawings=total_drawings,
        user_level=user_level,
        user_goal=user_goal,
    )

    t0 = time.time()
    accumulated = ""
    streamed_layers: list[dict] = []  # 已发送的 layer dict
    sent_layer_count = 0               # 已发送的 layer 数（用于增量提取）
    first_chunk_time = None

    # ── 首层秒出：立即发送一条"第一印象"消息，让用户不用干等 ──
    yield _sse_event({
        "type": "first_impression",
        "message": "小绘正在仔细看你的画…",
    })

    try:
        stream = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=2000,
            temperature=0.7,
            stream=True,
            extra_body={"thinking": {"type": "disabled"}},
        )

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # 记录首个 chunk 到达时间（用于诊断延迟）
            if first_chunk_time is None:
                first_chunk_time = time.time() - t0
                print(f"[stream] 首个 chunk 到达: {first_chunk_time:.1f}s", flush=True)

            # 处理 reasoning_content（思考链）— 不用于 layer 提取，仅记录
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                print(f"[stream] reasoning chunk ({len(reasoning)} chars)", flush=True)

            piece = getattr(delta, "content", None)
            if not piece:
                continue
            accumulated += piece

            # 用 JSONDecoder 增量提取已完成的 layer 对象
            new_layers = _extract_complete_layers(accumulated, sent_layer_count)
            for layer_obj in new_layers:
                sent_layer_count += 1
                streamed_layers.append(layer_obj)
                layer_time = time.time() - t0
                print(f"[stream] layer {sent_layer_count} ({layer_obj.get('type')}) sent at {layer_time:.1f}s", flush=True)
                yield _sse_event({"type": "layer", "layer": layer_obj})

        elapsed = time.time() - t0
        print(f"[stream] LLM 完成，耗时 {elapsed:.1f}s，共 {len(streamed_layers)} 层", flush=True)
    except Exception as e:
        # LLM API 失败时，仍保存记录（避免数据丢失），反馈内容为错误提示
        elapsed = time.time() - t0
        error_msg = f"分析失败: {str(e)}"
        if record_context:
            milestone = get_milestone(total_drawings)
            record = {
                "id": record_context.get("record_id", ""),
                "image": record_context.get("image_relpath", ""),
                "feedback": f"抱歉，{error_msg}。你的画已经保存了，请稍后重试。",
                "feedback_json": None,
                "milestone": milestone,
                "note": record_context.get("note", ""),
                "theme": record_context.get("theme", ""),
                "elapsed_s": round(elapsed, 1),
                "timestamp": record_context.get("timestamp", ""),
            }
            try:
                records = load_records()
                records.append(record)
                save_records(records)
                print(f"[stream] ✅ 错误 fallback 记录已保存: id={record.get('id')}", flush=True)
            except Exception as save_err:
                print(f"[stream] ❌ fallback 记录保存失败: {save_err}", flush=True)
            yield _sse_event({
                "type": "complete",
                "record": record,
                "milestone": milestone,
                "next_recommendation": None,
            })
        else:
            yield _sse_event({"type": "error", "message": error_msg})
        return

    # ── 累积完成后，解析完整 JSON 获取所有层（包括 tip 等正则可能遗漏的字段）──
    raw = accumulated.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    feedback_json = None
    complete_layers = streamed_layers

    try:
        data = json.loads(raw)
        layers = data.get("layers", [])
        if layers and len(layers) >= 4:
            feedback_json = data
            complete_layers = layers
    except (json.JSONDecodeError, TypeError) as e:
        # 调试：打印解析失败的信息
        print(f"[stream] ⚠️ JSON 解析失败: {e}", flush=True)
        print(f"[stream] raw 长度: {len(raw)}, 前200字符: {raw[:200]}", flush=True)
        print(f"[stream] raw 后200字符: {raw[-200:]}", flush=True)
        # 尝试从文本中提取 JSON 对象（兼容 AI 在 JSON 前后加文字的情况）
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                data = json.loads(json_match.group())
                layers = data.get("layers", [])
                if layers and len(layers) >= 4:
                    feedback_json = data
                    complete_layers = layers
                    print("[stream] ✅ 正则提取 JSON 成功", flush=True)
        except (json.JSONDecodeError, TypeError) as e2:
            print(f"[stream] ⚠️ 正则提取也失败: {e2}", flush=True)

    # 若流式提取没抓全但完整 JSON 解析出了更多层，补发遗漏的 layer 事件
    sent_types = {ly.get("type") for ly in streamed_layers}
    for layer in complete_layers:
        if layer.get("type") not in sent_types:
            yield _sse_event({"type": "layer", "layer": layer})
            sent_types.add(layer.get("type"))

    content = _layers_to_text(complete_layers, user_name) if complete_layers else raw
    elapsed_rounded = round(elapsed, 1)

    # 2.0 新增：从完整 JSON 中提取五维感知、突破维度、探索进度、身份确认语
    perception_analysis = None
    breakthrough_dim = None
    exploration = None
    identity_statement = None
    if feedback_json:
        perception_analysis = feedback_json.get("perception_analysis")
        breakthrough_dim = feedback_json.get("breakthrough_dim")
        exploration = feedback_json.get("exploration")
        # 从 identify 层提取身份确认语
        for layer in (feedback_json.get("layers") or []):
            if layer.get("type") == "identify" and layer.get("identity_statement"):
                identity_statement = layer["identity_statement"]
                break

    # milestone 计算容错：任何异常都不能中断记录保存与 complete 事件
    try:
        milestone = get_milestone(total_drawings)
    except Exception as e:
        print(f"[stream] ⚠️ milestone 计算失败（不影响保存）: {e}", flush=True)
        milestone = None

    # 构建 complete 事件（如提供 record_context，则持久化并返回完整 record + 推荐）
    if record_context:
        record = {
            "id": record_context.get("record_id", ""),
            "image": record_context.get("image_relpath", ""),
            "feedback": content,
            "feedback_json": feedback_json,
            "milestone": milestone,
            "note": record_context.get("note", ""),
            "theme": record_context.get("theme", ""),
            "elapsed_s": elapsed_rounded,
            "timestamp": record_context.get("timestamp", ""),
            # 2.0 新增字段
            "perception_analysis": perception_analysis,
            "breakthrough_dim": breakthrough_dim,
            "identity_statement": identity_statement,
            "exploration": exploration,
        }
        # 持久化记录（与 /api/analyze 保持一致）
        try:
            records = load_records()
            records.append(record)
            save_records(records)
            log_event("image_uploaded", {
                "total": total_drawings,
                "record_id": record_context.get("record_id", ""),
            })
            print(f"[stream] ✅ 记录已保存: id={record.get('id')}, total={len(records)}", flush=True)
        except Exception as e:
            # 记录保存失败时把完整 traceback 写到文件，便于诊断（服务器 stdout 在用户终端里读不到）
            try:
                import traceback as _tb
                with open("/tmp/craft_save_error.log", "a", encoding="utf-8") as _f:
                    _f.write(f"=== {record.get('id', '?')} @ {__import__('datetime').datetime.now()} ===\n")
                    _f.write(_tb.format_exc() + "\n")
            except Exception:
                pass
            print(f"[stream] ❌ 记录保存失败: {e}", flush=True)
        # 画完后推荐下一幅
        profile = record_context.get("profile") or load_profile()
        try:
            next_rec = get_recommendation(profile, total_drawings + 1)
        except Exception:
            next_rec = None
    else:
        record = {
            "feedback": content,
            "feedback_json": feedback_json,
            "elapsed_s": elapsed_rounded,
        }
        next_rec = None

    yield _sse_event({
        "type": "complete",
        "record": record,
        "milestone": milestone,
        "next_recommendation": next_rec,
        # 2.0 新增：顶层字段方便前端直接访问
        "perception_analysis": perception_analysis,
        "breakthrough_dim": breakthrough_dim,
        "identity_statement": identity_statement,
        "exploration": exploration,
    })
