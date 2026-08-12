# 绘心 Flow 🖊️✨

AI 陪伴式绘画 App——**手机 + 纸 + 笔 + AI**，每次画完拍下来就能获得逐层反馈。

没有账号、没有对错、不需要画得多好。拍下纸上的画，AI 陪你一起看画面。

## 快速开始

```bash
pip install -r requirements.txt
# 复制 .env.example 为 .env，填入你的 LLM API Key
cp .env.example .env
python3 app.py
```

手机连接同 Wi-Fi，浏览器访问终端显示的地址。

**LLM API 接入**（Provider 无关）：绘心 Flow 通过环境变量接入任意 LLM API，不绑定特定厂商。

| 变量 | 说明 |
|:-----|:-----|
| `LLM_API_KEY` | 你的 API Key（必填） |
| `LLM_BASE_URL` | 端点地址，如 `https://.../v1`（缺省用默认端点） |
| `LLM_MODEL` | 模型名，建议用视觉语言模型（感知 Agent 需要识图） |

> 感知 Agent 用 VLM 分析画作，合成 Agent 用 LLM 生成 5 层流式反馈；评估 / 记忆 Agent 为纯本地逻辑，零 API 成本。

## 功能

### 🧠 AI 绘画反馈

- **5 层流式反馈** — 认出内容 → 具体观察 → 进步连接 → 技巧建议 → 鼓励期待，逐层在屏幕上出现，把"等待"转化为"层层揭晓"
- **自适应深度学习** — 根据绘画张数自动调整语言深度：新手阶段禁用术语、入门阶段简单引导、熟练阶段用大师对比提点
- **陪伴 / 精简双模式** — 一键切换：陪伴模式完整 5 层流式体验，精简模式只保留关键层
- **反思交互** — AI 反问"最满意的地方是哪里？"→ AI 根据你的画生成 3 个个性化标签，快速选择或自己写 → AI 回应，形成小对话
- **等待陪伴动画** — AI 处理时逐句文案填充空白，不是转圈圈

### 📸 拍照与上传

- **应用内相机** — getUsermedia 实时取景，3:4 构图引导框，支持前后摄像头切换
- **拍照预览-确认流** — 拍了→预览→重拍/确认，不误提交
- **相册上传** — 支持从相册选择已有照片
- **客户端压缩** — 自动压缩到 1200px 以内、JPEG 质量 0.8
- **非画作智能检测** — 提交前 AI 快速识别画面，误传生活照 / 宠物照 / 文件照片时弹窗提醒，不进入反馈流程

### 🎯 每日主题

- **今日推荐** — 每天一个推荐主题，解决"画什么"的空白焦虑
- **主题库** — 入门 / 进阶 / 挑战三段难度，自由切换
- **智能推荐** — 根据用户进度、画张数推荐合适的主题和练习方向

### 📖 时间线

- **日历视图** — 按月查看绘画日，有画的日期一目了然
- **画作列表** — grid + 列表双视图
- **全屏详情页** — 查看大图 + 完整反馈 + 当时的反思记录，一键生成分享卡
- **时空穿梭** — 历史画作下方显示"当时的你写的反思"+"现在的你回看"，感受成长
- **删除** — 支持单张删除

### 🎨 画作分享卡

- **一键生成分享图** — Canvas 合成精美分享卡（logo / 日期 / 连续天数 / 画作 / AI 反馈摘录），图片按画作比例自适应裁切，无留白
- **微信长按分享** — 分享图上传换取真实链接，微信内长按即可发送给好友 / 保存到相册 / 发朋友圈
- **分享到社区** — 一键发布到社区与好友互动，分享成功弹窗保留，可连续操作

### 🌍 社区

- **分享画作** — 分享到社区，匿名展示
- **点赞互动** — 给别人的画点赞
- **评论交流** — 社区评论功能，每条评论可点赞（每人限一次）

### 🏆 成长系统

- **里程碑成就** — 第 1/5/10/25/50 张触发专属庆祝卡片 + 成就弹窗
- **连胜打卡** — 连续绘画天数追踪
- **成长关卡** — 400 关渐进式练习体系（20 大关 × 20 小关，含 Boss 挑战，预备上线）

### ✨ 交互增强

- **术语弹窗** — 150+ 绘画专业术语可点击，显示"在你这幅画里"的具体解释
- **构图引导** — 3×3 九宫格网格辅助构图
- **自定义确认弹窗** — 替代系统 confirm，品牌风格统一
- **平滑滚动** — ease-out-cubic 缓动曲线，比原生滚动更柔和
- **成就弹窗** — 弹簧弹跳动画弹出顶部
- **欢迎回来页** — 老用户重新进入时自动显示，3 秒自动消失
- **引导仪式动画** — 首次进入从 onboarding 到首页的过渡

### 🚀 PWA 支持

- 支持添加到主屏幕，类原生体验
- Service Worker 智能缓存（App Shell Network First，画作图片离线可用）
- 快捷键直达拍照/查看记录

### 📊 用户埋点

- 10 步漏斗追踪：从打开 APP 到完成反馈的全链路行为分析

## 设计系统

三层 Token 架构，暖陶土 / 鼠尾草 / 赭石金配色：

```
原始值（色相/亮度/饱和度）→ 语义 Token（色/间距/阴影）→ 组件 Token（按钮/卡片/输入框）
```

- 纸张质感阴影体系（paper/card/lifted 三级）
- 运动曲线体系（ease-press / ease-out / ease-spring）
- 暗色文本 + 暖底色背景，长时间使用不刺眼
- 零 `!important`，`var()` 引用覆盖全组件

## 技术栈

| 层级 | 技术 |
|:-----|:-----|
| 后端 | Flask + LLM API（视觉语言模型） |
| 前端 | 纯 HTML + CSS + JavaScript（无框架） |
| 流式反馈 | Server-Sent Events (SSE) |
| 数据存储 | 本地 JSON 文件 |
| 离线 | Service Worker + Cache API |
| 图片处理 | Pillow（服务端压缩） |

## 多 Agent 编排架构（2.0）

每次创作由**编排器（Orchestrator）**调度 4 个 Agent 协同完成，通过 SSE 事件流把过程实时推送到前端：

```
编排器 → 感知Agent → 评估Agent → 记忆Agent → 合成Agent → complete
```

| Agent | 职责 | 调用 |
|:------|:-----|:-----|
| 感知 Perception | VLM 五维分析（边缘/空间/比例/光影/整体）+ 内容识别 + 突破维度 | LLM API（VLM） |
| 评估 Evaluation | 对比历史 → 技能诊断 + 难度差距 + 进步/退步维度 | 纯本地逻辑 |
| 记忆 Memory | 更新画者画像 → 探索进度 + 身份标签 + 教练规则判断 | 纯本地逻辑 |
| 合成 Synthesis | 整合三 Agent 上下文 → 5 层流式反馈（认出/观察/进步/建议/期待） | LLM API（流式） |

SSE 事件链：`first_impression` → `orchestrator_start` → 每个 Agent 各一对 `agent_start/done` → `layer`（5 层流式反馈逐层推送）→ `complete`。

**核心机制**：探索进度（累积式，永不扣分）+ 心流银行 + 叙事身份重塑——不按画作打分，每次完成画作 = 探索 +1，把「画得不好」转化为「探索世界的新方向」；首次探索新方向触发成就与正强化，让画者在探索中建立身份认同。

## 开源模块（MIT）

| 模块 | 文件 | 说明 |
|:-----|:-----|:-----|
| 画者画像 Schema | [`painter-schema.json`](./painter-schema.json) | 画者画像 JSON Schema（五维雷达 / 探索进度 / 身份标签 / 自传 / 心流银行），记忆 Agent 读写 |
| 多 Agent 绘画评估模块 | `agents/` + `orchestrator.py` | 4-Agent 编排的绘画陪伴评估管线，可独立复用 |

MIT 协议，欢迎复用与二次开发。

## 快速复用示例

**零成本复用（纯本地逻辑，不需要 LLM API）**：评估 Agent 和记忆 Agent 不调用任何外部 API，可独立接入你的项目。

```python
from agents import evaluation, memory

# 感知结果（VLM 分析），你可以替换成自己的数据
perception_result = {
    "dimensions": {"edge": 6, "space": 5, "proportion": 6, "light": 3, "whole": 6},
    "identified_subject": "风景",
    "breakthrough_dim": "edge",
}

# 评估 Agent：对比历史 → 技能诊断 + 进步/退步判断（空历史 = 首张画作基线）
evaluation_result = evaluation.run(perception_result, history_records=[], stage="beginner")

# 记忆 Agent：更新画者画像 → 探索进度 +1、身份标签更新
profile = {"name": "小伙伴", "exploration": {"progress": 0, "explored_areas": {}}}
memory_context = memory.run(perception_result, evaluation_result, profile)
print(memory_context["updated_profile"]["exploration"]["progress"])  # → 1
```

**完整编排器（SSE 事件流，需要 LLM API）**：

```python
from pathlib import Path
from orchestrator import run

profile = {"name": "小伙伴", "exploration": {"progress": 0, "explored_areas": {}}}
record_context = {"record_id": "demo-001", "image_relpath": "demo.jpg", "timestamp": "2026-08-12", "note": "", "theme": "风景"}

for event in run(Path("demo.jpg"), profile, [], record_context):
    print(event.decode())
# data: {"type":"first_impression","message":"小绘正在仔细看你的画…"}
# data: {"type":"agent_done","agent":"perception","summary":"识别到：风景 + edge突出",...}
# data: {"type":"layer","layer":{"type":"encourage",...}}
# data: {"type":"complete","record":{...}}
```

**真实样例输出**（VLM 五维感知 + 探索进度）：

```json
{
  "perception_analysis": {"edge": 6, "space": 5, "proportion": 6, "light": 3, "whole": 6},
  "breakthrough_dim": "edge",
  "identity_statement": "你开始记录眼前广阔的世界",
  "exploration": {"progress": 1, "area": "风景", "explored_areas": {"风景": 1}}
}
```

> 完整数据结构见 [`painter-schema.json`](./painter-schema.json)（画者画像开放标准）。

## API 接口草稿

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| POST | `/api/analyze/stream` | 上传画作 → 多 Agent 编排 → SSE 流式 5 层反馈（2.0 主链路） |
| POST | `/api/analyze` | 画作分析（单次返回，兼容 1.0） |
| GET | `/api/records` | 画作记录列表 |
| POST | `/api/reflection` | 画作反思 → SSE 流式回应 |
| GET/POST | `/api/profile` | 画者画像读写 |
| GET | `/api/masters` / `/api/masters/search` | 大师知识库检索 |
| GET/POST | `/api/community` | 社区画作互动 |

## 项目结构

```
├── app.py               # Flask 瘦入口（蓝图组装 + 启动）
├── config.py            # 配置与基础设施（路径 / 模型常量 / client）
├── routes/              # 业务路由 Blueprint（analyze / records / user / content）
├── data_store/          # 数据层包（events / records / profile / progress / masters / content / community）
├── ai_service/          # AI 分析服务包（analyze / prompts / stream）
├── agents/              # 多 Agent（感知 / 评估 / 记忆 / 合成）
├── orchestrator.py      # 编排器（Agent 调度 + SSE 事件流）
├── growth_stages.py     # 成长关卡逻辑（数据在 growth_stages_levels_*.json）
├── community_api.py     # 社区 Blueprint
├── requirements.txt     # Python 依赖
├── static/
│   ├── index.html       # 前端 SPA 入口
│   ├── css/             # 设计系统（tokens + base + 组件分文件）
│   ├── js/              # 前端模块（state / onboarding / feedback / timeline / replay 等，按依赖顺序加载）
│   ├── manifest.json    # PWA 配置
│   └── sw.js            # Service Worker
├── data/                # 用户数据（自动生成，不提交）
└── .env                 # API Key（不提交）
```

## 项目状态

> MVP 稳定版已交付（v3.5），核心循环「画 → 拍 → AI 反馈 → 记录 → 分享」链路完整，准备进入公开测试。
