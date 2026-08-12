"""绘心 Flow 2.0 · 编排器（Orchestrator）

职责：按序调用 4 个 Agent，推送 SSE 事件流。
数据流：编排器 → 感知Agent → 评估Agent → 记忆Agent → 合成Agent → complete

SSE 事件序列（Day0 契约「七、SSE 事件协议」）：
  first_impression     → 兼容 1.0 前端
  orchestrator_start   → 编排器启动
  agent_start/done     → 每个 Agent 各一对（含 synthesis）
  layer                → 5 层流式反馈（合成Agent 产出）
  complete             → 完整记录 + 推荐下一幅

Day 1 骨架：调用 stub Agent，验证 SSE 事件链完整。
Day 2-3：Agent 从 stub 替换为真实实现，编排器不改。
"""

import time
from pathlib import Path

from ai_service import _sse_event
from data_store import (
    get_drawing_stage,
    get_milestone,
    get_recommendation,
    _layers_to_text,
    load_records,
    save_records,
    save_profile,
    log_event,
)
from agents import perception, evaluation, memory, synthesis


def run(image_path: Path, profile: dict, records: list, record_context: dict):
    """编排器入口（生成器函数）

    Args:
        image_path: 已保存的图片路径
        profile: 当前画者画像
        records: 历史画作记录列表
        record_context: 记录上下文（record_id / image_relpath / timestamp / note / theme / profile）

    Yields:
        SSE 事件 bytes（用 _sse_event() 包装的 dict）
    """
    t0 = time.time()

    # ── 计算上下文 ──
    total_drawings = len(records) + 1
    stage = get_drawing_stage(total_drawings)
    user_name = profile.get("name", "小伙伴")

    # 传给记忆Agent 的 profile 附带临时字段
    profile["_total_drawings"] = total_drawings
    profile["_record_id"] = record_context.get("record_id", "")

    # ── 1. 兼容 1.0 + 编排器启动 ──
    yield _sse_event({"type": "first_impression", "message": "小绘正在仔细看你的画…"})
    yield _sse_event({"type": "orchestrator_start", "message": "正在组织分析团队…"})

    # ── 2. 感知Agent ──
    yield _sse_event({
        "type": "agent_start",
        "agent": "perception",
        "message": "感知Agent正在看你的画…",
    })
    try:
        perception_result = perception.run(image_path, stage, total_drawings)
    except Exception as e:
        yield _sse_event({"type": "error", "agent": "perception", "message": f"图片分析失败: {e}"})
        return
    yield _sse_event({
        "type": "agent_done",
        "agent": "perception",
        "duration_s": perception_result.get("elapsed_s", 0),
        "summary": f"识别到：{perception_result['identified_subject']} + {perception_result['breakthrough_dim']}突出",
    })

    # ── 3. 评估Agent ──
    yield _sse_event({
        "type": "agent_start",
        "agent": "evaluation",
        "message": "评估Agent在对比你的历史…",
    })
    try:
        evaluation_result = evaluation.run(perception_result, records, stage)
    except Exception as e:
        yield _sse_event({"type": "error", "agent": "evaluation", "message": f"评估失败: {e}"})
        return
    yield _sse_event({
        "type": "agent_done",
        "agent": "evaluation",
        "duration_s": evaluation_result.get("elapsed_s", 0),
        "summary": evaluation_result.get("progress_summary", "评估完成"),
    })

    # ── 4. 记忆Agent ──
    yield _sse_event({
        "type": "agent_start",
        "agent": "memory",
        "message": "记忆Agent在更新画者档案…",
    })
    try:
        memory_context = memory.run(perception_result, evaluation_result, profile)
    except Exception as e:
        yield _sse_event({"type": "error", "agent": "memory", "message": f"记忆更新失败: {e}"})
        return
    yield _sse_event({
        "type": "agent_done",
        "agent": "memory",
        "duration_s": memory_context.get("elapsed_s", 0),
        "summary": f"探索进度 +1，身份标签更新",
    })

    # 保存更新后的 profile
    updated_profile = memory_context.get("updated_profile", profile)
    # 清理临时字段
    updated_profile.pop("_total_drawings", None)
    try:
        save_profile(updated_profile)
    except Exception as e:
        print(f"[orchestrator] ⚠️ profile 保存失败: {e}", flush=True)

    # ── 5. 合成Agent（流式输出 layer 事件） ──
    yield _sse_event({
        "type": "agent_start",
        "agent": "synthesis",
        "message": "合成Agent正在组织反馈…",
    })
    synthesis_t0 = time.time()
    synthesis_layers = []
    try:
        for layer_dict in synthesis.run(
            perception_result,
            evaluation_result,
            memory_context,
            user_name,
            stage,
            total_drawings,
            memory_context.get("coach_rule_triggered"),
        ):
            synthesis_layers.append(layer_dict)
            yield _sse_event({"type": "layer", "layer": layer_dict})
    except Exception as e:
        yield _sse_event({"type": "error", "agent": "synthesis", "message": f"反馈生成失败: {e}"})
        return
    synthesis_elapsed = round(time.time() - synthesis_t0, 1)
    yield _sse_event({
        "type": "agent_done",
        "agent": "synthesis",
        "duration_s": synthesis_elapsed,
        "summary": f"{len(synthesis_layers)}层反馈生成完毕",
    })

    # ── 6. 构建 complete 事件 ──
    total_elapsed = round(time.time() - t0, 1)

    # 反馈文本
    feedback_text = _layers_to_text(synthesis_layers, user_name) if synthesis_layers else ""

    # 从 identify 层提取身份确认语
    identity_statement = None
    for layer in synthesis_layers:
        if layer.get("type") == "identify" and layer.get("identity_statement"):
            identity_statement = layer["identity_statement"]
            break

    # 五维感知数据
    perception_analysis = perception_result.get("dimensions")
    breakthrough_dim = perception_result.get("breakthrough_dim")

    # 探索进度
    exploration = memory_context.get("exploration_state")

    # 构建 feedback_json
    feedback_json = {
        "layers": synthesis_layers,
        "perception_analysis": perception_analysis,
        "breakthrough_dim": breakthrough_dim,
        "exploration": exploration,
    }

    # 构建 record
    milestone = memory_context.get("milestone")
    record = {
        "id": record_context.get("record_id", ""),
        "image": record_context.get("image_relpath", ""),
        "feedback": feedback_text,
        "feedback_json": feedback_json,
        "milestone": milestone,
        "note": record_context.get("note", ""),
        "theme": record_context.get("theme", ""),
        "elapsed_s": total_elapsed,
        "timestamp": record_context.get("timestamp", ""),
        # 2.0 新增字段
        "perception_analysis": perception_analysis,
        "breakthrough_dim": breakthrough_dim,
        "identity_statement": identity_statement,
        "exploration": exploration,
    }

    # 持久化记录
    try:
        all_records = load_records()
        all_records.append(record)
        save_records(all_records)
        log_event("image_uploaded", {
            "total": total_drawings,
            "record_id": record.get("id", ""),
        })
        print(f"[orchestrator] ✅ 记录已保存: id={record.get('id')}, total={len(all_records)}", flush=True)
    except Exception as e:
        print(f"[orchestrator] ❌ 记录保存失败: {e}", flush=True)

    next_rec = memory_context.get("next_recommendation")

    yield _sse_event({
        "type": "complete",
        "record": record,
        "milestone": milestone,
        "next_recommendation": next_rec,
        # 2.0 顶层字段
        "perception_analysis": perception_analysis,
        "breakthrough_dim": breakthrough_dim,
        "identity_statement": identity_statement,
        "exploration": exploration,
    })
