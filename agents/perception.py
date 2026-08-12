"""感知Agent（Perception Agent）

职责：VLM 图片分析 → 五维评分 + 识别内容 + 突破维度
调 API：是（LLM API 视觉语言模型）
成本：~0.0015 元/次

复用 1.0：
  - _compress_image_b64()   ← ai_service.py:86  图片压缩
  - LLM_MODEL / client       ← config.py   LLM API 配置
  - get_drawing_stage()      ← data_store.py:543 阶段判断（影响评分尺度）

Day 2 实现：真实 VLM 调用，prompt 聚焦感知（不含反馈/探索进度/身份语）。
"""

import json
import re
import time
from pathlib import Path

from config import LLM_MODEL, client
from ai_service import _compress_image_b64


def _build_perception_prompt(stage: str, total_drawings: int) -> str:
    """构建感知专用 prompt（仅五维评分 + 识别内容，不含反馈层）。

    从 1.0 的 _build_analyze_prompt 中裁剪出感知部分，
    去掉了 layers / exploration / identity_statement / glossary_context，
    让 prompt 更短更聚焦，降低 token 成本。
    """
    prompt = (
        "你是一个绘画感知系统。你的任务只做两件事：\n"
        "1. 识别用户画的是什么\n"
        "2. 对画作的五个维度打分\n\n"
        "⚠️ 你不负责写反馈、不给建议、不做评价——这些由其他模块处理。\n"
        "你只输出感知结果（JSON）。\n\n"
    )

    # 识别规则（从 1.0 裁剪）
    prompt += (
        "识别规则：\n"
        "- 严谨第一：宁可说得模糊（'看起来像一个人形轮廓/一个圆柱形物体'），也绝不说错\n"
        "- 50-70% 把握时，用'看起来像XX'这类开放表达\n"
        "- 80%+ 确定时（有明确面部特征/五官/四肢等），可说'你画的是XX对吧？'\n"
        "- 不要假定用户是照着实物画的——ta 可能是凭记忆或想象在画\n\n"
    )

    # 五维感知评分（从 1.0 裁剪，保留完整说明）
    prompt += (
        "五维感知评估说明——基于 Betty Edwards 五维感知理论：\n"
        "- edge（边缘）：线条的清晰度与表现力，1-10 分\n"
        "- space（空间）：画面空间的组织与层次，1-10 分\n"
        "- proportion（比例）：物体各部分的比例准确性，1-10 分\n"
        "- light（光影）：对光影的观察与表现，1-10 分\n"
        "- whole（整体）：画面的整体协调性，1-10 分\n"
        "- breakthrough_dim：本次画作中表现最突出的维度（edge/space/proportion/light/whole），\n"
        "  这是用户这次画得最好的维度，用于雷达图高亮\n\n"
    )

    # 探索方向识别（2.0 新增）
    prompt += (
        "探索方向识别——判断这幅画属于哪个探索方向，取值枚举：\n"
        "  动物 / 植物 / 人物 / 静物 / 风景 / 建筑 / 想象 / 抽象 / 其他\n"
        "根据画面主要内容判断，如画了猫狗选「动物」，画了杯子选「静物」，\n"
        "画了纯想象的内容选「想象」，抽象表达选「抽象」。\n\n"
    )

    # 评分尺度（stage-aware）
    if stage == "新手期":
        prompt += "评分尺度：新手期画作各维度一般在 3-6 分，不要虚高。画得很简单也至少给 3 分。\n"
    elif stage == "入门期":
        prompt += "评分尺度：入门期画作各维度一般在 4-7 分，有进步迹象可给 7 分。\n"
    else:
        prompt += "评分尺度：客观评分，一般在 4-8 分，优秀作品可达 8-9 分。\n"

    prompt += (
        f"\n【当前阶段：{stage}（累计 {total_drawings} 张）】\n\n"
        "observations 字段要求：\n"
        "- 2-3 条具体观察点，描述性而非评判性\n"
        "- 说'我注意到你的XX处理很特别'，不说'你观察到了XX'\n"
        "- 每条不超过 30 字\n\n"
    )

    # 输出格式
    prompt += (
        "请回复纯 JSON，不要用 ```json 代码块，不要额外文字。\n\n"
        "JSON 结构：\n"
        "{\n"
        '  "identified_subject": "识别到的内容（如：杯子/人像/风景）",\n'
        '  "confidence": 0.85,\n'
        '  "dimensions": {\n'
        '    "edge": 6,\n'
        '    "space": 5,\n'
        '    "proportion": 6,\n'
        '    "light": 7,\n'
        '    "whole": 6\n'
        '  },\n'
        '  "breakthrough_dim": "light",\n'
        '  "exploration_area": "静物",\n'
        '  "observations": [\n'
        '    "杯口椭圆透视处理到位",\n'
        '    "光影过渡自然，明暗交界线跟着弧度走"\n'
        '  ]\n'
        "}\n"
    )

    return prompt


def run(image_path: Path, stage: str, total_drawings: int) -> dict:
    """感知Agent 入口

    Args:
        image_path: 图片路径
        stage: 当前阶段（新手期|入门期|成长期|进阶期|熟练期）
        total_drawings: 累计画作数

    Returns:
        perception_result dict，结构见 Day0 契约「契约 1」：
          - identified_subject: 识别到的内容
          - confidence: 识别置信度 0-1
          - dimensions: 五维评分 {edge, space, proportion, light, whole} 1-10
          - breakthrough_dim: 突出维度
          - exploration_area: 探索方向（动物/植物/人物/静物/风景/建筑/想象/抽象/其他）
          - observations: 具体观察点列表（2-3条）
          - elapsed_s: 耗时

    异常处理：
        API 失败时抛出异常，编排器会捕获并推送 error 事件。
    """
    t0 = time.time()

    # 1. 压缩图片（复用 1.0 的 _compress_image_b64）
    image_b64 = _compress_image_b64(image_path)

    # 2. 构建感知专用 prompt
    prompt = _build_perception_prompt(stage, total_drawings)

    # 3. 调用 VLM（非流式，thinking disabled 取最低档定价）
    response = client.chat.completions.create(
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
        max_tokens=500,  # 感知结果 JSON 不长，500 足够
        temperature=0.3,  # 评分要稳定，低温
        extra_body={"thinking": {"type": "disabled"}},
    )

    raw = response.choices[0].message.content
    if not raw:
        raise ValueError("感知Agent 未返回有效内容")

    # 4. 解析 JSON（兼容模型偶尔包裹 ```json 的情况）
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # 尝试从文本中提取 JSON 对象
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"感知Agent 返回无法解析为 JSON: {raw[:200]}")

    # 5. 构建标准化的 perception_result
    _VALID_AREAS = {"动物", "植物", "人物", "静物", "风景", "建筑", "想象", "抽象", "其他"}
    exploration_area = data.get("exploration_area", "其他")
    if exploration_area not in _VALID_AREAS:
        exploration_area = "其他"

    result = {
        "identified_subject": data.get("identified_subject", "未知内容"),
        "confidence": float(data.get("confidence", 0.5)),
        "dimensions": {
            "edge": int(data.get("dimensions", {}).get("edge", 5)),
            "space": int(data.get("dimensions", {}).get("space", 5)),
            "proportion": int(data.get("dimensions", {}).get("proportion", 5)),
            "light": int(data.get("dimensions", {}).get("light", 5)),
            "whole": int(data.get("dimensions", {}).get("whole", 5)),
        },
        "breakthrough_dim": data.get("breakthrough_dim", "whole"),
        "exploration_area": exploration_area,
        "observations": data.get("observations", []),
        "elapsed_s": round(time.time() - t0, 1),
    }

    # 校验五维分数范围
    for dim, score in result["dimensions"].items():
        if score < 1:
            result["dimensions"][dim] = 1
        elif score > 10:
            result["dimensions"][dim] = 10

    # 校验突破维度是否在五维之中
    valid_dims = set(result["dimensions"].keys())
    if result["breakthrough_dim"] not in valid_dims:
        # 取最高分维度作为 fallback
        result["breakthrough_dim"] = max(
            result["dimensions"], key=result["dimensions"].get
        )

    return result
