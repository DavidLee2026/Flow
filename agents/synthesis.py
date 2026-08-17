"""合成Agent（Synthesis Agent）

职责：整合感知+评估+记忆上下文 → 5 层流式反馈
调 API：是（LLM API 流式，纯文本不传图片）
成本：~0.0034 元/次

Day 2 实现：
  1. 构建合成 prompt（含 perception_result + evaluation_result + memory_context）
  2. 调用 client.chat.completions.create() with stream=True
  3. 用 _extract_complete_layers() 增量提取 layer 并 yield
  4. 教练规则影响反馈语气（rule_3/1/2/4 各有不同指导）

复用 1.0：
  - _extract_complete_layers()   ← ai_service.py:319  增量提取 layer
  - stage_prompts                ← ai_service.py:124-157  阶段自适应语气
  - layers_spec 结构             ← ai_service.py:192-223  layer 定义

关键优化（vs 1.0）：
  - 不传图片，仅文本上下文 → 输入 token 从 ~3500 降到 ~2000
  - 感知Agent 已提取视觉信息，合成Agent 只负责组织反馈
"""

import json
import re
import time

from config import LLM_MODEL, client
from ai_service import _extract_complete_layers


# ── 教练规则 → prompt 指导 ──────────────────────────────

_COACH_RULE_GUIDANCE = {
    "rule_3_new_user": (
        "【教练规则指导】\n"
        "⚠️ 新用户首次交互，零风险入口——只肯定，不评判，不给技巧建议。\n"
        "suggestion 层改为鼓励尝试新的简单主题：基于用户这次画的内容，推荐一个相关且简单的新下笔方向，"
        "务必落到这幅画本身，不要套固定模板、不要每次推荐同一个物品。\n"
        "语气温和、真诚，让用户感到安全和被接纳；但保持平等朋友的口吻，不要像安抚小孩。"
    ),
    "rule_1_first_exploration": (
        "【教练规则指导】\n"
        "🎉 用户首次探索了一个新方向！这是一个成就时刻。\n"
        "progress 层融入探索成就叙事，如「这是你第一次画XX方向，你的探索地图点亮了新的区域」。\n"
        "语气充满热情和肯定，让用户感受到探索的乐趣。"
    ),
    "rule_2_multi_direction": (
        "【教练规则指导】\n"
        "🌟 用户已经探索了多个方向，展现了广泛的兴趣。\n"
        "encourage 层可以肯定用户的探索精神，如「你已经探索了N个方向，每一次都在拓宽你的绘画世界」。\n"
        "suggestion 层可以温和地建议深入某个方向。"
    ),
    "rule_4_high_exploration": (
        "【教练规则指导】\n"
        "✅ 用户探索进度很高，已经积累了丰富的绘画经验。\n"
        "suggestion 层可以给出有挑战性的改进建议，语气可以更直接。"
    ),
}


# ── 阶段自适应语气（从 1.0 ai_service.py:124-157 裁剪） ──

_STAGE_PROMPTS = {
    "新手期": (
        "用户刚开始画画（1-5 张），可能没有信心。\n"
        "深度策略：只用生活化语言，禁止任何专业术语（不要出现透视、比例、明暗交界线、构图等词）。"
        "重点发掘画中的任何闪光点，语气真诚、自然，像朋友之间平等的交流。\n"
        "改进建议要具体且轻量，像在说「下次可以试试从这个角度入手」。\n"
        "⚠️ 语气注意：用户是 18-35 岁的成年人，语气要成熟自然。"
        "绝对不要用哄小孩的语气（如'太厉害啦''好棒哦'），"
        "也不要过度夸张。用平实、真诚的语言表达认可。"
    ),
    "入门期": (
        "用户画了 6-15 张，有了一点感觉但还在摸索。\n"
        "深度策略：可以使用 1-2 个最基础的术语（如透视、比例），"
        "但每个术语必须紧跟一句大白话解释。"
        "在鼓励的同时给出更具体的技巧建议，表现出你注意到 ta 的进步。"
    ),
    "成长期": (
        "用户画了 16-30 张，有一定基础但还会卡住。\n"
        "深度策略：可以自由使用绘画术语并简要解释，给出具体可操作的练习建议。"
        "反馈更有针对性，指出可以提升的具体环节。"
    ),
    "进阶期": (
        "用户画了 31-50 张，积累了相当多的画作，有一定功底。\n"
        "深度策略：专业术语不需要再解释，可以深入分析构图、光影、节奏等更专业的维度。"
        "给出有实质提升意义的建议，甚至可以追问「你试过 XX 画法吗」。"
        "语气是朋友般的，但带着对 ta 能力的尊重。"
    ),
    "熟练期": (
        "用户画了 50 张以上，已经比较熟练。\n"
        "深度策略：可以引用大师作品或流派进行对比分析，给出有挑战性的建议。"
        "鼓励 ta 形成个人风格，探讨更高级的课题。"
        "语气平等，像和一位有经验的画友交流。"
    ),
}


def run(
    perception_result: dict,
    evaluation_result: dict,
    memory_context: dict,
    user_name: str,
    stage: str,
    total_drawings: int,
    coach_rule_triggered: str | None = None,
):
    """合成Agent 入口（生成器函数）

    Args:
        perception_result: 感知Agent 的输出
        evaluation_result: 评估Agent 的输出
        memory_context: 记忆Agent 的输出
        user_name: 用户名
        stage: 当前阶段
        total_drawings: 累计画作数
        coach_rule_triggered: 触发的教练规则 ID（可选）

    Yields:
        layer dict（不是 SSE bytes）。编排器负责用 _sse_event() 包装。
        layer 结构与 1.0 一致：
          {"type": "identify", "content": "...", "identity_statement": "..."}
          {"type": "observe", "content": "..."}
          {"type": "progress", "content": "..."}  # 永远生成（首张画=探索成就，≥2张=对比进步）
          {"type": "suggestion", "content": "...", "tip": "..."}
          {"type": "encourage", "content": "..."}

    异常处理：
        API 失败时抛出异常，编排器会捕获并推送 error 事件。
    """
    t0 = time.time()

    # 1. 构建合成 prompt
    prompt = _build_synthesis_prompt(
        perception_result,
        evaluation_result,
        memory_context,
        user_name,
        stage,
        total_drawings,
        coach_rule_triggered,
    )

    # 2. 调用 LLM（纯文本，不传图片，stream=True）
    accumulated = ""
    sent_layer_count = 0
    first_chunk_time = None

    try:
        stream = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
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

            # 记录首个 chunk 到达时间
            if first_chunk_time is None:
                first_chunk_time = time.time() - t0
                print(
                    f"[synthesis] 首个 chunk 到达: {first_chunk_time:.1f}s",
                    flush=True,
                )

            piece = getattr(delta, "content", None)
            if not piece:
                continue

            accumulated += piece

            # 用 _extract_complete_layers 增量提取已完成的 layer
            new_layers = _extract_complete_layers(accumulated, sent_layer_count)
            for layer_obj in new_layers:
                sent_layer_count += 1
                layer_time = time.time() - t0
                print(
                    f"[synthesis] layer {sent_layer_count} ({layer_obj.get('type')}) "
                    f"sent at {layer_time:.1f}s",
                    flush=True,
                )
                yield layer_obj

        elapsed = time.time() - t0
        print(
            f"[synthesis] LLM 完成，耗时 {elapsed:.1f}s，"
            f"流式发送 {sent_layer_count} 层",
            flush=True,
        )

    except Exception as e:
        raise RuntimeError(f"合成Agent API 调用失败: {e}")

    # 3. 流式结束后，解析完整 JSON 补发遗漏的 layer
    raw = accumulated.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
        all_layers = data.get("layers", [])
        if all_layers and len(all_layers) > sent_layer_count:
            # 补发流式提取遗漏的 layer（如最后一个 encourage + tip）
            for layer_obj in all_layers[sent_layer_count:]:
                if isinstance(layer_obj, dict) and layer_obj.get("type"):
                    print(
                        f"[synthesis] 补发遗漏 layer: {layer_obj.get('type')}",
                        flush=True,
                    )
                    yield layer_obj
    except (json.JSONDecodeError, TypeError) as e:
        print(f"[synthesis] ⚠️ 最终 JSON 解析失败: {e}", flush=True)
        print(
            f"[synthesis] raw 长度: {len(raw)}, 前200字符: {raw[:200]}",
            flush=True,
        )


# ── 私有辅助函数 ──────────────────────────────────────


def _build_synthesis_prompt(
    perception_result: dict,
    evaluation_result: dict,
    memory_context: dict,
    user_name: str,
    stage: str,
    total_drawings: int,
    coach_rule_triggered: str | None,
) -> str:
    """构建合成 prompt（整合 3 个 Agent 的上下文 + 阶段策略 + 教练规则）。

    与 1.0 的区别：
      - 不含图片识别指令（感知Agent 已完成）
      - 不含五维评分指令（感知Agent 已评分）
      - 不含探索进度计算指令（记忆Agent 已计算）
      - 新增：感知/评估/记忆上下文注入
      - 新增：教练规则指导
    """
    # ── 角色设定 ──
    prompt = (
        f"你是{user_name}的绘画陪伴伙伴。\n\n"
        "你的性格：温暖、细腻、有幽默感，看到好画会真心开心。"
        "你是朋友不是老师，从不居高临下。\n\n"
        "⚠️ 用户画像：18-35 岁的成年人。语气必须成熟、自然、平等。"
        "绝对不要用哄小孩的语气，不要过度夸张。"
        "用平实、真诚的语言表达认可。\n\n"
        "⚠️ 夸奖纪律：成年人的认可 = 具体观察，不是笼统表扬。"
        "禁止'画得真好''你好棒''很有天赋'这类空泛夸奖——每句夸奖都要落在画的具体处"
        "（线条、形状、比例、用笔、构图、想法）。\n"
        "对照示范：'你好棒呀' → '我注意到你杯口那圈弧线收得很稳'；"
        "'继续加油哦' → '继续画，下一笔会更自由'；"
        "'小熊画得好可爱' → '这只小熊的比例有你的个人风格'；"
        "'你真厉害' → '这张画的排线处理很用心'。\n\n"
        "⚠️ 每次反馈都必须基于这幅画的具体内容生成。"
        "suggestion 和 encourage 不要套用固定模板句式，"
        "不要重复使用相同的例子或物品（如总是建议画同一个东西）。"
        "让每一张画的建议和期待都贴合当下这幅画。\n\n"
    )

    # ── 阶段策略 ──
    stage_hint = _STAGE_PROMPTS.get(stage, _STAGE_PROMPTS["新手期"])
    prompt += f"【当前阶段：{stage}（累计 {total_drawings} 张）】\n{stage_hint}\n\n"

    # ── 感知Agent 上下文 ──
    dims = perception_result.get("dimensions", {})
    dim_str = "、".join(f"{k} {v}" for k, v in dims.items())
    observations = perception_result.get("observations", [])
    obs_str = "\n".join(f"  {i + 1}. {o}" for i, o in enumerate(observations)) if observations else "  无"

    prompt += (
        "【感知Agent 分析结果】\n"
        f"- 识别内容：{perception_result.get('identified_subject', '未知内容')}\n"
        f"- 置信度：{perception_result.get('confidence', 0.5):.0%}\n"
        f"- 五维评分：{dim_str}\n"
        f"- 突出维度：{perception_result.get('breakthrough_dim', 'whole')}\n"
        f"- 观察点：\n{obs_str}\n\n"
    )

    # ── 评估Agent 上下文 ──
    skill = evaluation_result.get("skill_diagnosis", {})
    gap = evaluation_result.get("difficulty_gap", {})
    progress_dims = skill.get("progress_dims", [])
    regress_dims = skill.get("regress_dims", [])

    prompt += (
        "【评估Agent 诊断结果】\n"
        f"- 最强维度：{skill.get('strongest_dim', 'whole')}\n"
        f"- 最弱维度：{skill.get('weakest_dim', 'whole')}\n"
        f"- 进步维度：{'、'.join(progress_dims) if progress_dims else '无'}\n"
        f"- 退步维度：{'、'.join(regress_dims) if regress_dims else '无'}\n"
        f"- 当前水平：{gap.get('current_level', 5.0)}\n"
        f"- 技术标签：{'、'.join(evaluation_result.get('technique_tags', []))}\n"
        f"- 进步摘要：{evaluation_result.get('progress_summary', '')}\n\n"
    )

    # ── 记忆Agent 上下文 ──
    exploration = memory_context.get("exploration_state", {})
    identity_labels = memory_context.get("updated_profile", {}).get("identity_labels", [])

    prompt += (
        "【记忆Agent 上下文】\n"
        f"- 探索进度：{exploration.get('progress', 0)}（已探索 {exploration.get('explored_area_count', 0)} 个方向）\n"
        f"- 本次探索方向：{exploration.get('area', '其他')}\n"
    )
    if exploration.get("is_first_exploration"):
        prompt += f"- 🎉 首次探索成就：这是用户第一次画「{exploration.get('area', '其他')}」方向！{exploration.get('area_description', '')}\n"
    prompt += (
        f"- 已探索方向：{', '.join(exploration.get('explored_areas', {}).keys()) or '暂无'}\n"
    )

    if identity_labels:
        latest_label = identity_labels[-1] if isinstance(identity_labels[-1], dict) else {}
        prompt += f"- 最新身份标签：{latest_label.get('label', '')}（{latest_label.get('description', '')}）\n"
    prompt += "\n"

    # ── 教练规则指导 ──
    rule_guidance = _COACH_RULE_GUIDANCE.get(coach_rule_triggered, "")
    if rule_guidance:
        prompt += rule_guidance + "\n\n"

    # ── 输出格式 ──
    # progress 层永远生成（首张画也包含，符合「从 0 到 1 是巨大进步」的产品哲学）
    has_history = total_drawings >= 2

    # 构建 layers 定义
    layers_spec = (
        '    {\n'
        '      "type": "identify",\n'
        f'      "content": "先认出画的是什么（物体/人物/场景），表现出你看懂了。然后真诚地夸一个具体亮点——落在画里的线条/形状/用笔/构图，不用\'画得真好\'这类空泛夸奖。称呼用户为{user_name}。2句话内，精炼有温度。必须用 **加粗** 强调关键技巧或优点，如 **排线**、**透视**。每层最多1处加粗。",\n'
        f'      "identity_statement": "把\'你画了什么\'翻译成\'你是什么类型的画者\'。描述性而非评判性。1句话，称呼{user_name}。",\n'
        '    },\n'
        '    {\n'
        '      "type": "observe",\n'
        '      "content": "再指出你在画里注意到的具体细节（参考感知Agent的观察点）。让用户感觉到你真的很仔细看了。最多2句话，具体不空洞。",\n'
        '    },\n'
    )
    # progress 层指令条件化：首张画聚焦「首次探索成就」，有历史则「对比进步」
    if has_history:
        layers_spec += (
            '    {\n'
            '      "type": "progress",\n'
            '      "content": "对比用户之前的作品（参考评估Agent的进步维度），具体指出进步在哪里。必须说出具体的对比点。",\n'
            '    },\n'
        )
    else:
        # 首张画：聚焦首次探索成就（从 0 到 1 是巨大进步）
        first_exploration_area = exploration.get('area', '这个方向')
        progress_instruction = (
            '    {\n'
            '      "type": "progress",\n'
            f'      "content": "指出用户首次探索了「{first_exploration_area}」方向，这是一次重要的进步——ta 迈出了探索的第一步，探索地图点亮了新区域。从 0 到 1 是巨大的跨越。1-2句话。",\n'
            '    },\n'
        )
        layers_spec += progress_instruction
    layers_spec += (
        '    {\n'
        '      "type": "suggestion",\n'
        '      "content": "一个具体可操作的技巧建议。只给一条。如果用到术语必须紧跟大白话解释。",\n'
        '      "tip": "可选：详细的技巧说明。没有就填null。"\n'
        '    },\n'
        '    {\n'
        '      "type": "encourage",\n'
        '      "content": "以真诚的鼓励收尾，并自然地引出下次可以尝试的方向。不要用\'画得很棒\'这类空泛夸奖收尾，鼓励要具体或带方向感。2句话内。"\n'
        '    }\n'
    )

    layer_count = 5  # 永远 5 层
    layer_order = "identify → observe → progress → suggestion → encourage"

    prompt += (
        f"请回复纯 JSON，不要用 ```json 代码块，不要额外文字，只输出 JSON 对象。\n\n"
        "JSON 结构如下：\n"
        "{\n"
        '  "layers": [\n'
        f"{layers_spec}"
        "  ]\n"
        "}\n\n"
        "严格的规则：\n"
        f"- layers 必须有 {layer_count} 个，按顺序：{layer_order}\n"
        "- 每层 content 控制在 2 句话内，精炼有温度\n"
        "- identify 层必须有 identity_statement 字段\n"
        f"- 称呼用户为{user_name}\n"
        "- 评价画作内容本身，不说照片质量\n"
        "- 即使画得很简单，也要找出值得肯定的地方\n"
        "- 禁止'继续加油''画得真好''你好棒'这类空泛夸奖与哄小孩语气，认可必须落在具体观察\n"
        "- 如果用到专业绘画术语，必须紧跟一句大白话解释\n"
        "- 反馈深度必须匹配当前阶段策略\n"
        "- 回复纯 JSON，不要任何其他文字或代码块标记\n"
        "- 所有 content 保持中文\n"
    )

    return prompt
