"""绘心 Flow · 配置与基础设施

路径常量、LLM 配置、client。所有模块从这里取配置。

LLM 接入为 Provider 无关设计：通过环境变量接入任意 OpenAI 兼容端点，
不绑定任何特定厂商。运行前请在 .env 中配置：
  LLM_API_KEY=你的 API Key
  LLM_BASE_URL=https://你的端点/v1   （可选，缺省用 OpenAI 默认）
  LLM_MODEL=模型名
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# ── 配置 ──────────────────────────────────────────────

BASE_DIR = Path(__file__).parent

dotenv_path = BASE_DIR / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

DATA_DIR = BASE_DIR / "data"
IMAGES_DIR = DATA_DIR / "images"
RECORDS_FILE = DATA_DIR / "records.json"
USER_PROFILE_FILE = DATA_DIR / "profile.json"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# ── 埋点系统 ──────────────────────────────────────────
TRACKING_FILE = DATA_DIR / "tracking.json"

# ── 大师知识库（可选）───────────────────────────────────
# 指向存放大师 MD 文档的目录；目录缺失时 data_store 退回内置索引。
# 默认在仓库 data/master_kb/ 内，可经 KB_DIR 环境变量指向外部目录。
KB_DIR = Path(os.environ.get("KB_DIR", str(DATA_DIR / "master_kb")))
MASTER_DIR = KB_DIR / "大师"

# ── LLM API（Provider 无关）────────────────────────────
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "")

# 未配置 Key 时 client 为 None，调用 LLM 的接口会报清晰错误。
client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL or None) if LLM_API_KEY else None

COMMUNITY_FILE = DATA_DIR / "community.json"
