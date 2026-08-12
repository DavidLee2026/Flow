# 贡献指南（Contributing Guide）

欢迎来到绘心 Flow 👋 感谢你愿意参与。这里是「让成年人重新拿起画笔的 AI 画者陪伴」——手机 + 纸 + 笔 + AI，不评分、不替画，守护动手绘画。

无论你是来报 bug、提想法，还是想改代码，都欢迎。本指南 5 分钟读完。

---

## 一、本地运行

```bash
git clone https://github.com/DavidLee2026/Flow.git
cd Flow
pip install -r requirements.txt
cp .env.example .env   # 填入你的 LLM API Key（OpenAI 兼容端点即可）
python3 app.py
```

- 手机与电脑连同一 Wi-Fi，浏览器访问终端显示的地址
- 不配 Key 也能跑通大部分界面（感知/合成 Agent 需要 LLM API 才有完整反馈）

## 二、反馈 Bug 或提想法（Issue）

建议用模板，三句话说清楚：

**Bug 报告：**
1. 发生了什么（截图/录屏最好）
2. 期望行为 vs 实际行为
3. 复现步骤 + 环境（浏览器 / 手机型号 / 是否配了 Key）

**功能建议：**
1. 你遇到的问题（背景）
2. 你想要的解法
3. 为什么这样符合产品理念（不评分、不替画、陪伴式）

> 提想法时请想想：这个功能会让用户**更想画**，还是**更怕画**？前者加分，后者请三思。

## 三、提交代码（Pull Request）

1. `fork` 本仓库，创建分支：`feature/你的功能名` 或 `fix/修复描述`
2. 提交前过一遍下面的「检查清单」
3. 开 PR，描述你的改动和理由
4. 维护者 review 后合并

### 检查清单

- [ ] 代码可运行，`python3 app.py` 能启动
- [ ] 命名使用 `snake_case`（Python）/ 语义化（前端）
- [ ] 不引入无关改动（一次 PR 一件事）
- [ ] 前端新样式走设计 Token（`var()` 引用，不硬编码色值）
- [ ] 不动 `data/` 下的真实用户数据

## 四、隐私红线（触碰即拒绝合并）

本项目是公开仓库，**任何一行代码/文件都可能被全世界看到**。以下内容**绝不提交**：

- `.env`（含真实 API Key）
- `data/` 下的用户数据（画作、画像、记录）
- 任何个人路径、端口、内网地址
- 具体 AI 服务商名称（统一用「LLM API」）

提交前跑一遍：`git status` 确认没有以上内容。

## 五、架构速览

- **编排器** `orchestrator.py`：调度 4 个 Agent，SSE 事件流推送
- **4 Agent** `agents/`：感知（VLM 五维分析）/ 评估（对比历史）/ 记忆（更新画者画像）/ 合成（5 层流式反馈）
- **数据层** `data_store.py`：本地 JSON 持久化
- **前端** `static/`：纯 HTML + CSS + JS（无框架），PWA 离线
- **Schema** `painter-schema.json`：画者画像开放标准（MIT）

完整说明见 `README.md`。

## 六、行为准则

简短三条：
1. 对新手友好——每个人都是从「画得不像」开始的
2. 对事不对人——review 代码，不 review 人
3. 守护产品初心——不评分、不替画、鼓励尝试
