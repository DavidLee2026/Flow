"""绘心 Flow 2.0 · Agent 包

4 个 Agent 的入口模块：
  - perception:  感知Agent（VLM 图片分析 → 五维评分 + 识别内容）
  - evaluation:  评估Agent（对比历史 → 技能诊断 + 难度差距）
  - memory:      记忆Agent（更新画像 → 探索进度 + 教练规则判断）
  - synthesis:   合成Agent（整合上下文 → 5 层流式反馈）

Day 1 骨架：全部为 stub，返回假数据，不调 API。
Day 2-3：逐个替换 stub 为真实实现。
"""

from . import perception
from . import evaluation
from . import memory
from . import synthesis

__all__ = ["perception", "evaluation", "memory", "synthesis"]
