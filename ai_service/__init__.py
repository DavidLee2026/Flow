"""绘心 Flow · AI 分析服务包

从 ai_service.py 拆分为 analyze/prompts/stream 子模块，
本文件 re-export 保持 `from ai_service import X` 兼容。
"""
from .analyze import analyze_drawing, _compress_image_b64
from .prompts import _build_analyze_prompt
from .stream import analyze_drawing_stream, _sse_event, _extract_complete_layers
