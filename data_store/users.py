"""用户认证（昵称 + PIN）：data/users.json"""

import json
import hashlib
import secrets
import time
from config import USERS_FILE


def _load_users() -> dict:
    if USERS_FILE.exists():
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_users(users: dict):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256((salt + pin).encode()).hexdigest()


def user_exists(nickname: str) -> bool:
    return nickname in _load_users()


def register_user(nickname: str, pin: str) -> bool:
    """注册：昵称不存在则创建，返回 True；已存在返回 False。"""
    users = _load_users()
    if nickname in users:
        return False
    salt = secrets.token_hex(8)
    users[nickname] = {
        "pin_hash": _hash_pin(pin, salt),
        "salt": salt,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    _save_users(users)
    return True


def verify_user(nickname: str, pin: str) -> bool:
    """登录校验：昵称 + PIN 匹配返回 True。"""
    users = _load_users()
    u = users.get(nickname)
    if not u:
        return False
    return u.get("pin_hash") == _hash_pin(pin, u.get("salt", ""))
