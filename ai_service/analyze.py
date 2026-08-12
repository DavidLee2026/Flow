"""非流式分析 + 图片压缩"""

import json
import base64
from pathlib import Path
from config import LLM_MODEL, client
from data_store import _layers_to_text
from .prompts import _build_analyze_prompt


def analyze_drawing(
    image_path: Path,
    history: list[str] | None = None,
    user_name: str = "小伙伴",
    total_drawings: int = 1,
    user_level: str | None = None,
    user_goal: str | None = None,
) -> tuple[str, float, dict | None]:
    # 图片压缩 + prompt 构建复用共享 helper（与流式端点共用同一套逻辑）
    image_b64 = _compress_image_b64(image_path)
    prompt = _build_analyze_prompt(
        history=history,
        user_name=user_name,
        total_drawings=total_drawings,
        user_level=user_level,
        user_goal=user_goal,
    )

    import time
    t0 = time.time()

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
        max_tokens=2000,
        temperature=0.7,
        extra_body={"thinking": {"type": "disabled"}},
    )

    elapsed = time.time() - t0
    content_raw = response.choices[0].message.content
    if not content_raw:
        raise ValueError("AI 模型未返回有效反馈，请重试")
    raw = content_raw.strip()

    # 尝试解析 JSON（新格式）
    feedback_json = None
    content = raw

    try:
        data = json.loads(raw)
        layers = data.get("layers", [])
        if layers and len(layers) >= 4:
            feedback_json = data
            content = _layers_to_text(layers, user_name)
    except (json.JSONDecodeError, TypeError):
        pass

    return content, feedback_json, elapsed, None


def _compress_image_b64(image_path: Path) -> str:
    """压缩图片并返回 base64 编码（最长边 1200px，JPEG quality 80）。

    被 ``analyze_drawing`` 与 ``analyze_drawing_stream`` 共同复用，避免 ARK 拒收大图。
    """
    from PIL import Image
    import io
    img = Image.open(image_path)
    max_dim = 1200
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=80, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")
