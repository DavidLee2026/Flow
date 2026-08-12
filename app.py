"""绘心 Flow · 后端服务主入口

Flask app 组装：注册社区 + 业务 Blueprints（analyze/records/user/content），
定义静态路由，启动服务。
（v3 重构：路由拆至 routes/ 蓝图包，本文件只保留组装与启动）
"""
import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from config import BASE_DIR, DATA_DIR, LLM_API_KEY, LLM_MODEL, client
from data_store import load_profile
from community_api import community_bp
from routes.analyze import bp as analyze_bp
from routes.records import bp as records_bp
from routes.user import bp as user_bp
from routes.content import bp as content_bp

app = Flask(__name__)
CORS(app)
app.register_blueprint(community_bp)
app.register_blueprint(analyze_bp)
app.register_blueprint(records_bp)
app.register_blueprint(user_bp)
app.register_blueprint(content_bp)


@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR / "static"), "index.html")


@app.route("/data/<path:filename>")
def serve_data(filename):
    resp = send_from_directory(str(DATA_DIR), filename)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route('/sw.js')
def sw_js():
    resp = send_from_directory(BASE_DIR / 'static', 'sw.js', mimetype='application/javascript')
    resp.headers['Service-Worker-Allowed'] = '/'
    return resp


@app.route('/manifest.json')
def manifest_json():
    return send_from_directory(BASE_DIR / 'static', 'manifest.json', mimetype='application/manifest+json')


if __name__ == "__main__":
    if not LLM_API_KEY:
        print("⚠️  未设置 LLM_API_KEY 环境变量！")
    else:
        print(f"✅ LLM API 已配置 · 模型: {LLM_MODEL}")
        print(f"   数据目录: {DATA_DIR}")

    # 模型预热：发一个空请求让模型保持热状态，减少后续请求冷启动延迟
    if LLM_API_KEY:
        try:
            client.chat.completions.create(
                model=LLM_MODEL,
                messages=[{"role": "user", "content": "你好"}],
                max_tokens=1,
                stream=False,
            )
            print("🌡️  模型已预热")
        except Exception as e:
            print(f"⚠️  模型预热失败（不影响运行）: {e}")

    # 检测 Onboarding 数据
    profile = load_profile()
    if profile.get("onboarding_done"):
        name = profile.get("name", "小伙伴")
        level = {"beginner": "新手", "intermediate": "有基础", "advanced": "进阶"}.get(
            profile.get("level", ""), "未知"
        )
        print(f"👤 当前用户: {name} · 水平: {level}")
    else:
        print("🆕 首次启动 · 等待用户完成引导")

    _port = int(os.getenv("PORT", 5001))
    print(f"\n🚀 启动服务: http://0.0.0.0:{_port}")
    print(f"   手机访问: http://<本机IP>:{_port}")
    app.run(host="0.0.0.0", port=_port, debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true')
